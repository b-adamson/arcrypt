import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { createReadOnlyProgram } from "../../lib/anchorClient";
import {
  createSPLGovernanceProposal,
  type AssetKind,
  type AuctionType,
} from "@arcibid/sdk";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const {
      authority,
      realmAddress,
      governanceProgramId,
      governanceAddress,
      communityMint,
      proposalName,
      proposalDescription,
      minBidSol,
      durationSecs,
      auctionType,
      assetKind,
      metadataUri,
      tokenMint,
      saleAmountToken,
      sourceTokenAccountBase58,
    } = body ?? {};

    if (!authority) return NextResponse.json({ error: "authority required" }, { status: 400 });
    if (!realmAddress) return NextResponse.json({ error: "realmAddress required" }, { status: 400 });
    if (!governanceProgramId) return NextResponse.json({ error: "governanceProgramId required" }, { status: 400 });
    if (!governanceAddress) return NextResponse.json({ error: "governanceAddress required" }, { status: 400 });
    if (!communityMint) return NextResponse.json({ error: "communityMint required" }, { status: 400 });
    if (!proposalName) return NextResponse.json({ error: "proposalName required" }, { status: 400 });
    if (!metadataUri) return NextResponse.json({ error: "metadataUri required" }, { status: 400 });

    const programIdStr = process.env.PROGRAM_ID;
    const rpcUrl = process.env.RPC_URL;

    if (!programIdStr || !rpcUrl) {
      return NextResponse.json(
        { error: "Missing PROGRAM_ID or RPC_URL" },
        { status: 500 }
      );
    }

    const program = await createReadOnlyProgram(rpcUrl, programIdStr);
    const authorityPk = new PublicKey(authority);

    const bundle = await createSPLGovernanceProposal({
      programClient: program,
      programId: new PublicKey(programIdStr),
      publicKey: authorityPk,
      authorityBase58: authorityPk.toBase58(),
      minBidSol: String(minBidSol ?? "1"),
      durationSecs: Number(durationSecs ?? 3600),
      auctionType: (auctionType ?? "FirstPrice") as AuctionType,
      assetKind: (assetKind ?? "Fungible") as AssetKind,
      metadataUri: String(metadataUri),
      tokenMint: tokenMint ? String(tokenMint) : undefined,
      saleAmountToken: saleAmountToken ? String(saleAmountToken) : undefined,
      sourceTokenAccountBase58: sourceTokenAccountBase58
        ? String(sourceTokenAccountBase58)
        : undefined,
      realmAddress: String(realmAddress),
      governanceProgramId: String(governanceProgramId),
      governanceAddress: String(governanceAddress),
      communityMint: String(communityMint),
      proposalName: String(proposalName),
      proposalDescription: String(proposalDescription ?? ""),
    });

    const blockhash = (
      await program.provider.connection.getLatestBlockhash()
    ).blockhash;

    const txBase64s = bundle.transactions.map((tx) => {
      tx.feePayer = authorityPk;
      tx.recentBlockhash = blockhash;
      return Buffer.from(
        tx.serialize({ requireAllSignatures: false })
      ).toString("base64");
    });

    return NextResponse.json({
      auctionPda: bundle.auctionPda.toBase58(),
      proposalAddress: bundle.proposalAddress.toBase58(),
      txBase64s,
      rawInstructions: bundle.rawInstructions,
    });
  } catch (err: any) {
    console.error("createGovernanceProposal error:", err);
    return NextResponse.json(
      { error: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}