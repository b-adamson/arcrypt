"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import AuctionList from "../../components/AuctionList";
import { createAnchorProgramInBrowser } from "../../lib/anchorClient";
import { fetchAuctionPdasForWallet, enumKey, shorten, toHttpGateway } from "../../lib/utils";

type AuctionEntry = {
  auctionPk: string;
};

type AuctionSummary = {
  auctionPk: string;
  name: string;
  description: string;
  image: string;
  metadataUri: string;
  tokenMint: string;
  saleAmount: string;
  decimals: number;
  auctionType: string;
  assetKind: string;
  error?: string;
  bidCount: number;
};

const METADATA_TIMEOUT_MS = 2500;

async function buildAuctionSummary(programClient: any, entry: AuctionEntry): Promise<AuctionSummary> {
  try {
    const auction = await programClient.account.auction.fetch(new PublicKey(entry.auctionPk));

    const metadataUri = String(
      auction?.auctionMetadataUri ??
        auction?.auction_metadata_uri ??
        auction?.metadataUri ??
        auction?.uri ??
        ""
    );

    const decimals = Number(auction?.prizeDecimals ?? auction?.prize_decimals ?? 0);
    const saleAmountRaw = auction?.saleAmount ?? auction?.sale_amount;

    let name = `Auction ${shorten(entry.auctionPk)}`;
    let description = "";
    let image = "";

    const bidCount = Number(auction?.bidCount ?? auction?.bid_count ?? 0);

    if (metadataUri) {
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), METADATA_TIMEOUT_MS);

      const metadata = await fetch(toHttpGateway(metadataUri), {
        cache: "no-store",
        signal: controller.signal,
      })
        .then(async (res) => {
          if (!res.ok) return null;
          try {
            return await res.json();
          } catch {
            return null;
          }
        })
        .catch(() => null)
        .finally(() => {
          window.clearTimeout(timeout);
        });

      if (metadata) {
        name = String(metadata?.name ?? name);
        description = String(metadata?.description ?? "");
        image = String(metadata?.image ?? "");
      }
    }

    const amount = BigInt(saleAmountRaw?.toString?.() ?? 0);
    const base = 10n ** BigInt(decimals);
    const whole = amount / base;
    const frac = amount % base;
    let saleAmount = whole.toString();
    if (decimals !== 0 && frac !== 0n) {
      saleAmount = `${whole.toString()}.${frac.toString().padStart(decimals, "0").replace(/0+$/, "")}`;
    }

    return {
      auctionPk: entry.auctionPk,
      name,
      description,
      image: toHttpGateway(image),
      metadataUri,
      tokenMint: auction?.tokenMint?.toBase58?.() ?? new PublicKey(auction?.tokenMint ?? auction?.token_mint).toBase58(),
      saleAmount,
      decimals,
      auctionType: enumKey(auction?.auctionType ?? auction?.auction_type).toLowerCase(),
      assetKind: enumKey(auction?.assetKind ?? auction?.asset_kind).toLowerCase(),
      bidCount,
    };
  } catch (err: any) {
    return {
      auctionPk: entry.auctionPk,
      name: `Auction ${shorten(entry.auctionPk)}`,
      description: "",
      image: "",
      metadataUri: "",
      tokenMint: "",
      saleAmount: "",
      decimals: 0,
      auctionType: "",
      assetKind: "",
      bidCount: 0,
      error: err?.message ?? String(err),
    };
  }
}

export default function ProfilePage() {
  const { publicKey, connected, wallet } = useWallet();
  const [auctions, setAuctions] = useState<AuctionSummary[]>([]);
  const [status, setStatus] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!connected || !publicKey) {
        setAuctions([]);
        setStatus(null);
        setIsLoading(false);
        return;
      }
      setIsLoading(true);
      setStatus("Loading your auction links...");
      try {
        const entries = await fetchAuctionPdasForWallet(publicKey.toBase58());

        if (!entries.length) {
          if (!cancelled) {
            setAuctions([]);
            setStatus("No auctions found for this wallet yet.");
          }
          return;
        }
        const { program } = await createAnchorProgramInBrowser(wallet as any, process.env.NEXT_PUBLIC_PROGRAM_ID);
        const settled = await Promise.allSettled(entries.map((entry) => buildAuctionSummary(program, entry)));
        const summaries = settled
          .filter((r): r is PromiseFulfilledResult<AuctionSummary> => r.status === "fulfilled")
          .map((r) => r.value);

        if (cancelled) return;
        setAuctions(summaries);
        setStatus(null);
      } catch (err: any) {
        if (!cancelled) {
          setAuctions([]);
          setStatus(err?.message ?? "Failed to load auctions.");
        }
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [connected, publicKey, wallet]);

  return (
    <main className="page-shell min-h-screen px-4 py-6">
      <div className="mx-auto max-w-5xl">
        {connected && publicKey ? (
          <div className="mb-4 flex justify-center">
            <div className="surface px-4 py-2 text-lg font-bold tracking-wide text-[var(--foreground)]">
              {publicKey.toBase58()}
            </div>
          </div>
        ) : null}
        {connected && publicKey ? (
          <div className="mb-4">
            <Link href="/auction" className="btn btn-primary">
              Create Auction
            </Link>
          </div>
        ) : null}
        <AuctionList auctions={auctions} />
        {status ? <div className="mt-4 text-sm text-[var(--muted)]">{status}</div> : null}
      </div>
    </main>
  );
}