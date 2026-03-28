// app/api/profileAuctions/route.ts
import { NextResponse } from "next/server";
import { PublicKey } from "@solana/web3.js";
import { createReadOnlyProgram } from "../../../lib/anchorClient";

async function loadAuctions(authorityStr: string) {
  const authority = new PublicKey(authorityStr);

  const programIdStr = process.env.PROGRAM_ID;
  const rpcUrl = process.env.RPC_URL;

  if (!programIdStr || !rpcUrl) {
    throw new Error("Missing PROGRAM_ID or RPC_URL");
  }

  const program = await createReadOnlyProgram(rpcUrl, programIdStr);
  const allAuctions = await program.account.auction.all();

  const filtered = allAuctions
    .filter((item: any) => {
      const acctAuthority = item.account?.authority;
      if (!acctAuthority) return false;

      const acctAuthority58 =
        acctAuthority.toBase58?.() ?? new PublicKey(acctAuthority).toBase58();

      return acctAuthority58 === authority.toBase58();
    })
    .map((item: any) => {
      const pk = item.publicKey?.toBase58?.() ?? String(item.publicKey);
      const acct = item.account;

      return {
        auctionPk: pk,
        authority: acct.authority?.toBase58?.() ?? String(acct.authority),
        status: acct.status ? Object.keys(acct.status)[0] : null,
        endTime: acct.endTime?.toString?.() ?? String(acct.endTime ?? ""),
        winner: acct.winner?.toBase58?.() ?? String(acct.winner ?? ""),
        paymentAmount:
          acct.paymentAmount?.toString?.() ?? String(acct.paymentAmount ?? ""),
      };
    });

  return filtered;
}

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const authority = url.searchParams.get("authority");

    if (!authority) {
      return NextResponse.json(
        { error: "authority required" },
        { status: 400 }
      );
    }

    const auctions = await loadAuctions(authority);
    return NextResponse.json({ auctions });
  } catch (err: any) {
    console.error("profileAuctions GET error:", err);
    return NextResponse.json(
      { error: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const authority = body?.authority;

    if (!authority) {
      return NextResponse.json(
        { error: "authority required" },
        { status: 400 }
      );
    }

    const auctions = await loadAuctions(authority);
    return NextResponse.json({ auctions });
  } catch (err: any) {
    console.error("profileAuctions POST error:", err);
    return NextResponse.json(
      { error: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}