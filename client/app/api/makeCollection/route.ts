import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { createReadOnlyProgram } from "../../../lib/anchorClient";
import { createAuction } from "@arcrypt/sdk";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { authority, nfts, minBidUsdc, durationSecs, auctionType } = body ?? {};

    if (!authority || !Array.isArray(nfts) || nfts.length === 0) {
      return NextResponse.json({ error: "authority and nfts[] required" }, { status: 400 });
    }

    const programIdStr = process.env.PROGRAM_ID;
    const rpcUrl = process.env.RPC_URL;
    if (!programIdStr || !rpcUrl) {
      return NextResponse.json({ error: "Missing PROGRAM_ID or RPC_URL" }, { status: 500 });
    }

    const program = await createReadOnlyProgram(rpcUrl, programIdStr);
    const programId = new PublicKey(programIdStr);
    const authorityPk = new PublicKey(authority);
    const { blockhash } = await program.provider.connection.getLatestBlockhash();

    const results: { txBase64: string; auctionPda: string; auctionSeedHex: string }[] = [];

    for (const nft of nfts as { nftMint: string; metadataUri: string }[]) {
      const bundle = await createAuction({
        programClient: program,
        programId,
        publicKey: authorityPk,
        authorityBase58: authorityPk.toBase58(),
        minBidUsdc: String(minBidUsdc ?? "1"),
        durationSecs: Number(durationSecs ?? 3600),
        auctionType: auctionType ?? "FirstPrice",
        assetKind: "Nft",
        metadataUri: String(nft.metadataUri),
        tokenMint: String(nft.nftMint),
        saleAmountToken: "1",
      });

      const tx = bundle.transaction;
      tx.feePayer = authorityPk;
      tx.recentBlockhash = blockhash;

      results.push({
        txBase64: Buffer.from(tx.serialize({ requireAllSignatures: false })).toString("base64"),
        auctionPda: bundle.auctionPda.toBase58(),
        auctionSeedHex: bundle.auctionSeedHex,
      });
    }

    return NextResponse.json({ results });
  } catch (err: any) {
    console.error("makeCollection error:", err);
    return NextResponse.json({ error: err?.message ?? String(err) }, { status: 500 });
  }
}
