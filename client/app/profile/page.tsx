"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { useWallet } from "@solana/wallet-adapter-react";
import { PublicKey } from "@solana/web3.js";
import AuctionList from "../../components/AuctionList";
import { createAnchorProgramInBrowser } from "../../lib/anchorClient";

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
};

async function fetchAuctionPdasForWallet(walletBase58: string): Promise<AuctionEntry[]> {
  const localKey = `sealed-auctions:${walletBase58}`;
  let localEntries: AuctionEntry[] = [];

  try {
    const raw = localStorage.getItem(localKey);
    if (raw) {
      const parsed = JSON.parse(raw) as string[];
      localEntries = parsed.map((auctionPk) => ({ auctionPk }));
    }
  } catch {
    localEntries = [];
  }

  try {
    const res = await fetch(`/api/profileAuctions?authority=${encodeURIComponent(walletBase58)}`);
    if (res.ok) {
      const data = await res.json();
      const apiEntries: AuctionEntry[] = Array.isArray(data?.auctions)
        ? data.auctions.map((item: any) => ({
            auctionPk: String(item.auctionPk ?? item),
          }))
        : Array.isArray(data)
          ? data.map((item: any) => ({ auctionPk: String(item.auctionPk ?? item) }))
          : [];

      const merged = new Map<string, AuctionEntry>();
      for (const entry of [...apiEntries, ...localEntries]) {
        if (entry.auctionPk) merged.set(entry.auctionPk, entry);
      }
      return [...merged.values()];
    }
  } catch {
    // ignore api failures and fall back to local list
  }

  return localEntries;
}

function enumKey(v: any): string {
  if (v && typeof v === "object") return Object.keys(v)[0];
  return String(v ?? "");
}

function toStringMaybe(v: any): string {
  if (v == null) return "";
  return v?.toString?.() ?? String(v);
}

function toBase58Maybe(v: any): string {
  if (!v) return "";
  return v?.toBase58?.() ?? new PublicKey(v).toBase58();
}

function toHttpGateway(uri: string): string {
  if (!uri) return "";
  const gateway =
    (process.env.NEXT_PUBLIC_PINATA_GATEWAY_URL || "https://gateway.pinata.cloud/ipfs").replace(
      /\/$/,
      ""
    );

  if (uri.startsWith("ipfs://")) {
    const path = uri.slice("ipfs://".length).replace(/^ipfs\/+/, "");
    return `${gateway}/${path}`;
  }

  return uri;
}

function shorten(pk: string): string {
  if (!pk) return "";
  if (pk.length <= 14) return pk;
  return `${pk.slice(0, 5)}…${pk.slice(-5)}`;
}

function formatTokenAmount(v: any, decimals: number): string {
  const amount = BigInt(v?.toString?.() ?? 0);
  const base = 10n ** BigInt(decimals);

  const whole = amount / base;
  const frac = amount % base;

  if (decimals === 0 || frac === 0n) return whole.toString();

  return `${whole.toString()}.${frac.toString().padStart(decimals, "0").replace(/0+$/, "")}`;
}

const METADATA_TIMEOUT_MS = 2500;

function fetchJsonWithTimeout(url: string, timeoutMs: number): Promise<any | null> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

  return fetch(url, {
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
}

async function buildAuctionSummary(programClient: any, entry: AuctionEntry): Promise<AuctionSummary> {
  try {
    const auction = await programClient.account.auction.fetch(new PublicKey(entry.auctionPk));

    const metadataUri = toStringMaybe(
      auction?.auctionMetadataUri ?? auction?.auction_metadata_uri ?? auction?.metadataUri ?? auction?.uri
    );

    const decimals = Number(auction?.prizeDecimals ?? auction?.prize_decimals ?? 0);
    const saleAmountRaw = auction?.saleAmount ?? auction?.sale_amount;

    let name = `Auction ${shorten(entry.auctionPk)}`;
    let description = "";
    let image = "";

    if (metadataUri) {
      const metadata = await fetchJsonWithTimeout(toHttpGateway(metadataUri), METADATA_TIMEOUT_MS);

      if (metadata) {
        name = String(metadata?.name ?? name);
        description = String(metadata?.description ?? "");
        image = toStringMaybe(metadata?.image ?? "");
      }
    }

    return {
      auctionPk: entry.auctionPk,
      name,
      description,
      image: toHttpGateway(image),
      metadataUri,
      tokenMint: toBase58Maybe(auction?.tokenMint ?? auction?.token_mint),
      saleAmount: formatTokenAmount(saleAmountRaw, decimals),
      decimals,
      auctionType: enumKey(auction?.auctionType ?? auction?.auction_type).toLowerCase(),
      assetKind: enumKey(auction?.assetKind ?? auction?.asset_kind).toLowerCase(),
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

        {status ? (
          <div className="mt-4 text-sm text-[var(--muted)]">
            {status}
          </div>
        ) : null}
      </div>
    </main>
  );
}