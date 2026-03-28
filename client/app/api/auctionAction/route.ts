import { NextResponse } from "next/server";
import { Buffer } from "buffer";
import { PublicKey } from "@solana/web3.js";
import { createReadOnlyProgram } from "../../../lib/anchorClient";
import {
  createDetermineWinner,
  createSettlement,
  type DetermineWinnerKind,
  type SettlementAction,
} from "@arcibid/sdk";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { auctionPk, publicKey, kind, which, action } = body ?? {};

    if (!auctionPk || !publicKey || !kind) {
      return NextResponse.json(
        { error: "auctionPk, publicKey, and kind are required" },
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
    const userPk = new PublicKey(publicKey);
    const auctionPkObj = new PublicKey(auctionPk);

    if (kind === "determineWinner") {
      const bundle = await createDetermineWinner({
        programClient: program,
        programId: new PublicKey(programIdStr),
        publicKey: userPk,
        auctionPk: auctionPkObj,
        which: which as DetermineWinnerKind,
      });

      const tx = bundle.transaction;
      tx.feePayer = userPk;
      tx.recentBlockhash = (
        await program.provider.connection.getLatestBlockhash()
      ).blockhash;

      return NextResponse.json({
        txBase64: Buffer.from(
          tx.serialize({ requireAllSignatures: false })
        ).toString("base64"),
        rawInstructions: bundle.rawInstructions,
      });
    }

    if (kind === "settlement") {
      const auctionData = await program.account.auction.fetch(auctionPkObj);

      const escrowPda = PublicKey.findProgramAddressSync(
        [Buffer.from("escrow"), auctionPkObj.toBuffer(), userPk.toBuffer()],
        new PublicKey(programIdStr)
      )[0];

      const escrowExists = Boolean(
        await program.account.escrowAccount.fetchNullable(escrowPda)
      );

      const bundle = await createSettlement({
        programClient: program,
        programId: new PublicKey(programIdStr),
        publicKey: userPk,
        auctionPk: auctionPkObj,
        auctionData,
        escrowExists,
        action: action as SettlementAction | undefined,
      });

      const tx = bundle.transaction;
      tx.feePayer = userPk;
      tx.recentBlockhash = (
        await program.provider.connection.getLatestBlockhash()
      ).blockhash;

      return NextResponse.json({
        txBase64: Buffer.from(
          tx.serialize({ requireAllSignatures: false })
        ).toString("base64"),
        action: bundle.action,
        rawInstructions: bundle.rawInstructions,
      });
    }

    return NextResponse.json(
      { error: "invalid kind" },
      { status: 400 }
    );
  } catch (err: any) {
    console.error("auctionAction error:", err);
    return NextResponse.json(
      { error: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}