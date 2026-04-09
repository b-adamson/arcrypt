// app/api/makeAuction/route.ts
import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { createReadOnlyProgram } from "../../../lib/anchorClient";
import { createAuction } from "@arcrypt/sdk";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    if (!body?.authority) {
      return NextResponse.json({ error: "authority required" }, { status: 400 });
    }
    if (!body?.metadataUri) {
      return NextResponse.json({ error: "metadataUri required" }, { status: 400 });
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
    const programId = new PublicKey(programIdStr);
    const authorityPk = new PublicKey(body.authority);

    const bundle = await createAuction({
      programClient: program,
      programId,
      publicKey: authorityPk,
      authorityBase58: authorityPk.toBase58(),
      minBidSol: String(body.minBidSol ?? "1"),
      durationSecs: Number(body.durationSecs ?? 3600),
      auctionType: body.auctionType,
      assetKind: body.assetKind,
      metadataUri: String(body.metadataUri),
      tokenMint: body.tokenMint ? String(body.tokenMint) : undefined,
      saleAmountToken: body.saleAmountToken ? String(body.saleAmountToken) : undefined,
      sourceTokenAccountBase58: body.sourceTokenAccountBase58
        ? String(body.sourceTokenAccountBase58)
        : undefined,
    });

    const tx = bundle.transaction;
    tx.feePayer = authorityPk;
    tx.recentBlockhash = (await program.provider.connection.getLatestBlockhash()).blockhash;

    return NextResponse.json({
      txBase64: Buffer.from(tx.serialize({ requireAllSignatures: false })).toString("base64"),
      auctionPda: bundle.auctionPda.toBase58(),
      auctionSeedHex: bundle.auctionSeedHex,
      rawInstructions: bundle.rawInstructions,
    });
  } catch (err: any) {
    console.error("makeAuction error:", err);
    return NextResponse.json({ error: err?.message ?? String(err) }, { status: 500 });
  }
}