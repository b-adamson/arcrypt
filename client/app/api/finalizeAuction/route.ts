import { NextResponse } from "next/server";
import { Buffer } from "buffer";
import { PublicKey, Connection, Transaction } from "@solana/web3.js";
import { createReadOnlyProgram } from "../../../lib/anchorClient";
import { createSettlement } from "@arcrypt/sdk";
import {
  Raydium,
  TxVersion,
  DEVNET_PROGRAM_ID,
} from "@raydium-io/raydium-sdk-v2";
import BN from "bn.js";

const USDC_MINT = new PublicKey(
  "4oG4sjmopf5MzvTHLE8rpVJ2uyczxfsw2K84SUTpNDx7"
);

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const {
      auctionPk,
      publicKey,
      tokenMint,
      usdcAmount,
      tokenAmount,
    } = body;

    if (!auctionPk || !publicKey) {
      return NextResponse.json(
        { error: "auctionPk and publicKey required" },
        { status: 400 }
      );
    }

    const programIdStr = process.env.PROGRAM_ID!;
    const rpcUrl = process.env.RPC_URL!;

    const connection = new Connection(rpcUrl, "confirmed");
    const program = await createReadOnlyProgram(rpcUrl, programIdStr);

    const userPk = new PublicKey(publicKey);
    const auctionPkObj = new PublicKey(auctionPk);

    const auctionData = await program.account.auction.fetch(auctionPkObj);
    const alreadySettled =
  auctionData.winnerPaid ||
  (Array.isArray(auctionData.winnerPaidMulti) &&
    auctionData.winnerPaidMulti.every(Boolean));

    const isCreator = new PublicKey(auctionData.authority).equals(userPk);

    const escrowPda = PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), auctionPkObj.toBuffer(), userPk.toBuffer()],
      new PublicKey(programIdStr)
    )[0];

    const escrowExists = Boolean(
      await program.account.escrowAccount.fetchNullable(escrowPda)
    );

const allTxs: any[] = [];

if (!alreadySettled) {
  const settlementBundle = await createSettlement({
    programClient: program,
    programId: new PublicKey(programIdStr),
    publicKey: userPk,
    auctionPk: auctionPkObj,
    auctionData,
    escrowExists,
  });

  const settlementTx = settlementBundle.transaction;
  settlementTx.feePayer = userPk;
  settlementTx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

  allTxs.push(settlementTx);
}

    if (isCreator) {
        if (!tokenMint || !usdcAmount || !tokenAmount) {
        return NextResponse.json(
          { error: "Missing pool params for creator" },
          { status: 400 }
        );
      }

      const mintPk = new PublicKey(tokenMint);

      const raydium = await Raydium.load({
        connection,
        owner: userPk,
        cluster: "devnet",
      });

      const mintInfo = await connection.getParsedAccountInfo(mintPk);

      const decimals =
        (mintInfo.value?.data as any)?.parsed?.info?.decimals ?? 6;

      const baseAmount = new BN(tokenAmount);
      const quoteAmount = new BN(usdcAmount);

      const marketRes = await raydium.marketV2.create({
        baseInfo: { mint: mintPk, decimals },
        quoteInfo: { mint: USDC_MINT, decimals: 6 },
        lotSize: 1,
        tickSize: 0.0001,
        dexProgramId: DEVNET_PROGRAM_ID.OPEN_BOOK_PROGRAM,
        txVersion: TxVersion.V0,
      });

      const marketTxs = marketRes.transactions;
      const marketId = marketRes.extInfo.address.marketId;

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

      allTxs.push(...marketTxs, ...poolTxs);

      const ix = await program.methods
        .markPoolCreated()
        .accountsStrict({
          authority: userPk,
          auction: auctionPkObj,
        })
        .instruction();

      const tx = new Transaction().add(ix);
      tx.feePayer = userPk;
      tx.recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

      allTxs.push(tx);
    }

    const serialized = allTxs.map((tx: any) =>
      Buffer.from(tx.serialize({ requireAllSignatures: false })).toString("base64")
    );

    return NextResponse.json({
      txs: serialized,
      isCreator,
    });
  } catch (err: any) {
    console.error("finalizeAuction error:", err);

    return NextResponse.json(
      { error: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}