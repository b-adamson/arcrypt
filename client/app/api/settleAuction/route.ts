import { NextResponse } from "next/server";
import { Buffer } from "buffer";
import { Keypair, PublicKey } from "@solana/web3.js";
import { createReadOnlyProgram } from "../../../lib/anchorClient";
import { buildSettleWinnerTransaction } from "@arcrypt/sdk";

function loadBackendSigner(): Keypair {
  const raw = process.env.BACKEND_SIGNER_SECRET;
  if (!raw) throw new Error("Missing BACKEND_SIGNER_SECRET");
  const parsed = JSON.parse(raw);
  if (!Array.isArray(parsed)) throw new Error("BACKEND_SIGNER_SECRET must be a JSON array");
  return Keypair.fromSecretKey(Uint8Array.from(parsed));
}

function enumKey(v: any): string {
  if (v && typeof v === "object") return Object.keys(v)[0];
  return String(v ?? "");
}

function isPaid(auctionData: any, index: number): boolean {
  const paid = auctionData?.winnerPaidMulti ?? auctionData?.winner_paid_multi;
  return Array.isArray(paid) ? Boolean(paid[index]) : false;
}

export async function POST(req: Request) {
  try {
    const { auctionPk } = await req.json();

    if (!auctionPk) {
      return NextResponse.json({ error: "auctionPk required" }, { status: 400 });
    }

    const programIdStr = process.env.PROGRAM_ID;
    const rpcUrl = process.env.RPC_URL;
    if (!programIdStr || !rpcUrl) {
      return NextResponse.json({ error: "Missing PROGRAM_ID or RPC_URL" }, { status: 500 });
    }

    const backendSigner = loadBackendSigner();
    const program = await createReadOnlyProgram(rpcUrl, programIdStr);
    const connection = program.provider.connection;

    const auctionPkObj = new PublicKey(auctionPk);
    const auctionData = await program.account.auction.fetch(auctionPkObj);

    const auctionType = enumKey(auctionData.auctionType ?? auctionData.auction_type).toLowerCase();
    const status = enumKey(auctionData.status ?? auctionData.status_key).toLowerCase();

    if (status !== "resolved") {
      return NextResponse.json({ error: "Auction is not resolved yet" }, { status: 400 });
    }

    const winners: string[] =
      auctionType === "uniform"
        ? (auctionData.winners ?? auctionData.winner_keys ?? [])
            .map((w: any) => {
              try {
                return new PublicKey(w).toBase58();
              } catch {
                return "";
              }
            })
            .filter(Boolean)
        : (() => {
            const w = auctionData.winner ?? auctionData.winner_key;
            return w ? [new PublicKey(w).toBase58()] : [];
          })();

    if (winners.length === 0) {
      return NextResponse.json({ error: "No resolved winners found" }, { status: 400 });
    }

    const txBase64s: string[] = [];
    const recentBlockhash = (await connection.getLatestBlockhash()).blockhash;

    for (let i = 0; i < winners.length; i++) {
      if (auctionType === "uniform" && isPaid(auctionData, i)) continue;

      const winnerBase58 = winners[i];

      const bundle = await buildSettleWinnerTransaction({
        programClient: program,
        programId: new PublicKey(programIdStr),
        publicKey: backendSigner.publicKey,
        auctionPk: auctionPkObj,
        auctionData,
        targetWinnerBase58: winnerBase58,
      });

      const tx = bundle.transaction;
      tx.feePayer = backendSigner.publicKey;
      tx.recentBlockhash = recentBlockhash;
      tx.partialSign(backendSigner);

      txBase64s.push(
        Buffer.from(tx.serialize({ requireAllSignatures: false })).toString("base64")
      );
    }

    return NextResponse.json({
      txBase64s,
      auctionType,
      count: txBase64s.length,
    });
  } catch (err: any) {
    console.error("settleAuction error:", err);
    return NextResponse.json({ error: err?.message ?? String(err) }, { status: 500 });
  }
}