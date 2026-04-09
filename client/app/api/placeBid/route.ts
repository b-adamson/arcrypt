import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { createReadOnlyProgram } from "../../../lib/anchorClient";
import { createPlaceBid } from "@arcrypt/sdk";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { auctionPk, bidderPubkey, bidAmountSol, nonceHex } = body ?? {};

    if (!auctionPk || !bidderPubkey || typeof bidAmountSol === "undefined") {
      return NextResponse.json(
        { error: "auctionPk, bidderPubkey, and bidAmountSol are required" },
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

    const program = await createReadOnlyProgram(rpcUrl, programIdStr);
    const bidderPk = new PublicKey(bidderPubkey);

    const bundle = await createPlaceBid({
      programClient: program,
      programId: new PublicKey(programIdStr),
      publicKey: bidderPk,
      auctionPk: new PublicKey(auctionPk),
      bidAmountSol: String(bidAmountSol),
      nonceHex: nonceHex ?? null,
    });

    const tx = bundle.transaction;
    tx.feePayer = bidderPk;
    tx.recentBlockhash = (
      await program.provider.connection.getLatestBlockhash()
    ).blockhash;

    return NextResponse.json({
      txBase64: Buffer.from(
        tx.serialize({ requireAllSignatures: false })
      ).toString("base64"),
      escrowPda: bundle.escrowPda.toBase58(),
      rawInstructions: bundle.rawInstructions,
    });
  } catch (err: any) {
    console.error("placeBid error:", err);
    return NextResponse.json(
      { error: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}