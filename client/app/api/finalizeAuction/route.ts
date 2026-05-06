import { NextResponse } from "next/server";
import { Buffer } from "buffer";
import { PublicKey, Connection, Transaction } from "@solana/web3.js";
import { createReadOnlyProgram } from "../../../lib/anchorClient";

import {
  createSettlement,
} from "@arcrypt/sdk";

import {
  Raydium,
  TxVersion,
  DEVNET_PROGRAM_ID,
} from "@raydium-io/raydium-sdk-v2";

import BN from "bn.js";

const RPC_URL =
  process.env.RPC_URL || "https://api.devnet.solana.com";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const {
      auctionPk,
      publicKey,
      tokenMint,
      wsolAmount,
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

    // -----------------------------
    // FETCH AUCTION
    // -----------------------------
    const auctionData = await program.account.auction.fetch(auctionPkObj);
    const alreadySettled =
  auctionData.winnerPaid ||
  (Array.isArray(auctionData.winnerPaidMulti) &&
    auctionData.winnerPaidMulti.every(Boolean));

    const isCreator = new PublicKey(auctionData.authority).equals(userPk);

    // -----------------------------
    // ESCROW CHECK
    // -----------------------------
    const escrowPda = PublicKey.findProgramAddressSync(
      [Buffer.from("escrow"), auctionPkObj.toBuffer(), userPk.toBuffer()],
      new PublicKey(programIdStr)
    )[0];

    const escrowExists = Boolean(
      await program.account.escrowAccount.fetchNullable(escrowPda)
    );

    // -----------------------------
    // BUILD SETTLEMENT TX
    // -----------------------------
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

    settlementTx.recentBlockhash = (
      await connection.getLatestBlockhash()
    ).blockhash;

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

  settlementTx.recentBlockhash = (
    await connection.getLatestBlockhash()
  ).blockhash;

  allTxs.push(settlementTx);
}



    // -----------------------------
    // ONLY CREATOR, ADD RAYDIUM
    // -----------------------------
    if (isCreator) {
      if (!tokenMint || !wsolAmount || !tokenAmount) {
        return NextResponse.json(
          { error: "Missing pool params for creator" },
          { status: 400 }
        );
      }

      const mintPk = new PublicKey(tokenMint);

      const WSOL_MINT = new PublicKey(
        "So11111111111111111111111111111111111111112"
      );

      const raydium = await Raydium.load({
        connection,
        owner: userPk,
        cluster: "devnet",
      });

      const mintInfo = await connection.getParsedAccountInfo(mintPk);

      const decimals =
        (mintInfo.value?.data as any)?.parsed?.info?.decimals ?? 6;

      const baseAmount = new BN(tokenAmount);
      const quoteAmount = new BN(wsolAmount);

      // -----------------------------
      // MARKET
      // -----------------------------
      const marketRes = await raydium.marketV2.create({
        baseInfo: { mint: mintPk, decimals },
        quoteInfo: { mint: WSOL_MINT, decimals: 9 },
        lotSize: 1,
        tickSize: 0.0001,
        dexProgramId: DEVNET_PROGRAM_ID.OPEN_BOOK_PROGRAM,
        txVersion: TxVersion.V0,
      });

      const marketTxs = marketRes.transactions;

      const marketId = marketRes.extInfo.address.marketId;

      // -----------------------------
      // POOL
      // -----------------------------
      const poolRes = await raydium.liquidity.createPoolV4({
        programId: DEVNET_PROGRAM_ID.AMM_V4,
        marketInfo: {
          marketId,
          programId: DEVNET_PROGRAM_ID.OPEN_BOOK_PROGRAM,
        },
        baseMintInfo: { mint: mintPk, decimals },
        quoteMintInfo: { mint: WSOL_MINT, decimals: 9 },
        baseAmount,
        quoteAmount,
        startTime: new BN(0),
        ownerInfo: {
          feePayer: userPk,
          useSOLBalance: true,
        },
        associatedOnly: false,
        txVersion: TxVersion.V0,
        feeDestinationId: DEVNET_PROGRAM_ID.FEE_DESTINATION_ID,
      });

      const poolTxs = Array.isArray(poolRes.transaction)
        ? poolRes.transaction
        : [poolRes.transaction];

      allTxs.push(...marketTxs, ...poolTxs);
      
    }

    // -----------------------------
//  3. MARK POOL CREATED (CREATOR ONLY)
// -----------------------------
if (isCreator) {
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

    

    // -----------------------------
    // SERIALIZE ALL
    // -----------------------------
    const serialized = allTxs.map((tx: any) =>
      Buffer.from(
        tx.serialize({ requireAllSignatures: false })
      ).toString("base64")
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