import { NextResponse } from "next/server";
import { Buffer } from "buffer";
import { Connection, PublicKey } from "@solana/web3.js";
import {
  getAssociatedTokenAddressSync,
  getMint,
  TOKEN_PROGRAM_ID,
} from "@solana/spl-token";
import { createReadOnlyProgram } from "../../../lib/anchorClient";
import { Raydium, TxVersion, DEVNET_PROGRAM_ID } from "@raydium-io/raydium-sdk-v2";
import BN from "bn.js";
import { enumKey } from "@/lib/utils";

const USDC_MINT = new PublicKey("4oG4sjmopf5MzvTHLE8rpVJ2uyczxfsw2K84SUTpNDx7");

function isSettled(auctionData: any): boolean {
  const type = enumKey(auctionData.auctionType).toLowerCase();
  const creatorReservePaid = Boolean(auctionData.creatorReservePaid);

  if (type === "uniform") {
    const paid = auctionData.winnerPaidMulti;
    return Array.isArray(paid) ? paid.every(Boolean) && creatorReservePaid : false;
  }

  return Boolean(auctionData.winnerPaid && creatorReservePaid);
}

export async function POST(req: Request) {
  try {
    const { auctionPk, publicKey } = await req.json();

    if (!auctionPk || !publicKey) {
      return NextResponse.json(
        { error: "auctionPk and publicKey required" },
        { status: 400 }
      );
    }

    const programIdStr = process.env.PROGRAM_ID;
    const rpcUrl = process.env.RPC_URL;
    if (!programIdStr || !rpcUrl) {
      return NextResponse.json(
        { error: "Missing PROGRAM_ID or RPC_URL" },
        { status: 500 }
      );
    }

    const connection = new Connection(rpcUrl, "confirmed");
    const program = await createReadOnlyProgram(rpcUrl, programIdStr);

    const userPk = new PublicKey(publicKey);
    const auctionPkObj = new PublicKey(auctionPk);
    const auctionData = await program.account.auction.fetch(auctionPkObj);

    const creatorPk = new PublicKey(auctionData.authority);
    if (!creatorPk.equals(userPk)) {
      return NextResponse.json(
        { error: "Only the creator can create the Raydium pool" },
        { status: 403 }
      );
    }

    const assetKind = enumKey(auctionData.assetKind).toLowerCase();
    if (assetKind !== "fungible") {
      return NextResponse.json(
        { error: "Raydium pool creation only applies to fungible token auctions" },
        { status: 400 }
      );
    }

    if (!isSettled(auctionData)) {
      return NextResponse.json(
        { error: "Auction must be fully settled before pool creation" },
        { status: 400 }
      );
    }

    if (Boolean(auctionData.raydiumPoolCreated)) {
      return NextResponse.json({ txBase64s: [] });
    }

    const mintPk = new PublicKey(auctionData.tokenMint);
    const mintInfo = await getMint(connection, mintPk);
    const decimals = mintInfo.decimals;

    const creatorPrizeAta = getAssociatedTokenAddressSync(
      mintPk,
      creatorPk,
      false,
      TOKEN_PROGRAM_ID
    );

    const creatorPrizeBalance = await connection
      .getTokenAccountBalance(creatorPrizeAta)
      .catch(() => null);

    const baseAmount = new BN(String(creatorPrizeBalance?.value?.amount ?? "0"));
    if (baseAmount.lte(new BN(0))) {
      return NextResponse.json(
        { error: "No prize tokens found in creator ATA. Settle first." },
        { status: 400 }
      );
    }

    const creatorUsdcAta = getAssociatedTokenAddressSync(
      USDC_MINT,
      creatorPk,
      false,
      TOKEN_PROGRAM_ID
    );

    const usdcBalance = await connection
      .getTokenAccountBalance(creatorUsdcAta)
      .catch(() => null);

    const quoteAmount = new BN(String(usdcBalance?.value?.amount ?? "0"));
    if (quoteAmount.lte(new BN(0))) {
      return NextResponse.json(
        { error: "No USDC found in creator ATA. Settle first." },
        { status: 400 }
      );
    }

    const raydium = await Raydium.load({
      connection,
      owner: userPk,
      cluster: "devnet",
    });

    const marketRes = await raydium.marketV2.create({
      baseInfo: { mint: mintPk, decimals },
      quoteInfo: { mint: USDC_MINT, decimals: 6 },
      lotSize: 1,
      tickSize: 0.0001,
      dexProgramId: DEVNET_PROGRAM_ID.OPEN_BOOK_PROGRAM,
      txVersion: TxVersion.V0,
    });

    const marketId = marketRes.extInfo.address.marketId;
    const marketTxs = marketRes.transactions ?? [];

    const poolRes = await raydium.liquidity.createPoolV4({
      programId: DEVNET_PROGRAM_ID.AMM_V4,
      marketInfo: {
        marketId,
        programId: DEVNET_PROGRAM_ID.OPEN_BOOK_PROGRAM,
      },
      baseMintInfo: { mint: mintPk, decimals },
      quoteMintInfo: { mint: USDC_MINT, decimals: 6 },
      baseAmount,
      quoteAmount,
      startTime: new BN(0),
      ownerInfo: {
        feePayer: userPk,
        useSOLBalance: false,
      },
      associatedOnly: false,
      txVersion: TxVersion.V0,
      feeDestinationId: DEVNET_PROGRAM_ID.FEE_DESTINATION_ID,
    });

    const poolTxs = Array.isArray(poolRes.transaction)
      ? poolRes.transaction
      : [poolRes.transaction];

    const txs = [...marketTxs, ...poolTxs];
    const blockhash = (await connection.getLatestBlockhash()).blockhash;

    const txBase64s = txs.map((tx: any) => {
      tx.feePayer = userPk;
      tx.recentBlockhash = blockhash;
      return Buffer.from(tx.serialize({ requireAllSignatures: false })).toString("base64");
    });

    return NextResponse.json({ txBase64s });
  } catch (err: any) {
    console.error("createRaydiumPool error:", err);
    return NextResponse.json(
      { error: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}