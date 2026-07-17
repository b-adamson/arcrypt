import { NextResponse } from "next/server";
import { BN } from "@anchor-lang/core";
import crypto from "crypto";
import { PublicKey, Transaction } from "@solana/web3.js";
import {
  getMXEAccAddress,
  getClusterAccAddress,
  getMempoolAccAddress,
  getExecutingPoolAccAddress,
  getFeePoolAccAddress,
  getClockAccAddress,
  getCompDefAccOffset,
  getCompDefAccAddress,
  getComputationAccAddress,
  getArciumEnv,
} from "@arcium-hq/client";
import { createReadOnlyProgram } from "../../../lib/anchorClient";

const ARCIUM_PROGRAM_ID = new PublicKey("Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ");

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { auctionPk, bidderPubkey, crankerPubkey } = body ?? {};

    if (!auctionPk || !bidderPubkey || !crankerPubkey) {
      return NextResponse.json(
        { error: "auctionPk, bidderPubkey, and crankerPubkey are required" },
        { status: 400 }
      );
    }

    const programIdStr = process.env.PROGRAM_ID;
    const rpcUrl = process.env.RPC_URL;
    if (!programIdStr || !rpcUrl) {
      return NextResponse.json({ error: "Missing PROGRAM_ID or RPC_URL" }, { status: 500 });
    }

    const program = await createReadOnlyProgram(rpcUrl, programIdStr);
    const programId = new PublicKey(programIdStr);
    const bidderPk = new PublicKey(bidderPubkey);
    const crankerPk = new PublicKey(crankerPubkey);
    const auctionPkObj = new PublicKey(auctionPk);

    const arciumEnv = getArciumEnv();
    const mxePk = getMXEAccAddress(programId);
    const clusterPk = new PublicKey(getClusterAccAddress(arciumEnv.arciumClusterOffset));
    const mempoolPk = new PublicKey(getMempoolAccAddress(arciumEnv.arciumClusterOffset));
    const executingPoolPk = new PublicKey(getExecutingPoolAccAddress(arciumEnv.arciumClusterOffset));
    const poolPk = new PublicKey(getFeePoolAccAddress());
    const clockPk = new PublicKey(getClockAccAddress());

    const compDefOffset = Buffer.from(getCompDefAccOffset("place_encrypted_bid")).readUInt32LE(0);
    const compDefPk = getCompDefAccAddress(programId, compDefOffset);
    const computationOffset = new BN(crypto.randomBytes(8), "hex");
    const computationPk = getComputationAccAddress(arciumEnv.arciumClusterOffset, computationOffset);

    const signPda = PublicKey.findProgramAddressSync(
      [Buffer.from("ArciumSignerAccount")],
      programId
    )[0];
    const sharedVaultPda = PublicKey.findProgramAddressSync(
      [Buffer.from("shared-vault"), auctionPkObj.toBuffer()],
      programId
    )[0];
    const tempBidPda = PublicKey.findProgramAddressSync(
      [Buffer.from("pending-encrypted-bid"), auctionPkObj.toBuffer(), bidderPk.toBuffer()],
      programId
    )[0];

    const ix = await (program.methods as any)
      .placeEncryptedBid(computationOffset)
      .accounts({
        cranker: crankerPk,
        auction: auctionPkObj,
        sharedVault: sharedVaultPda,
        tempBid: tempBidPda,
        signPdaAccount: signPda,
        mxeAccount: new PublicKey(mxePk),
        mempoolAccount: mempoolPk,
        executingPool: executingPoolPk,
        computationAccount: computationPk,
        compDefAccount: compDefPk,
        clusterAccount: clusterPk,
        poolAccount: poolPk,
        clockAccount: clockPk,
        systemProgram: new PublicKey("11111111111111111111111111111111"),
        arciumProgram: ARCIUM_PROGRAM_ID,
      })
      .instruction();

    const tx = new Transaction().add(ix);
    tx.feePayer = crankerPk;
    tx.recentBlockhash = (await program.provider.connection.getLatestBlockhash()).blockhash;

    return NextResponse.json({
      txBase64: Buffer.from(tx.serialize({ requireAllSignatures: false })).toString("base64"),
      tempBidPda: tempBidPda.toBase58(),
    });
  } catch (err: any) {
    console.error("test-crank error:", err);
    return NextResponse.json({ error: err?.message ?? String(err) }, { status: 500 });
  }
}
