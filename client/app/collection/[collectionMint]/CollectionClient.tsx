"use client";

import React, { useEffect, useState } from "react";
import Link from "next/link";
import { createReadOnlyProgram } from "../../../lib/anchorClient";
import { shorten, enumKey, toHttpGateway } from "@/lib/utils";

type NftSummary = {
  auctionPk: string;
  name: string;
  description: string;
  image: string;
  auctionType: string;
  bidCount: number;
  endTime?: string | number;
  end_time?: string | number;
  paymentAmountRaw?: string;
};

type CollectionMeta = {
  name: string;
  description: string;
  image: string;
};

const METADATA_TIMEOUT_MS = 2500;

function toStringMaybe(v: any): string {
  return v == null ? "" : v?.toString?.() ?? String(v);
}

function normalizeTimeMs(raw: any): number {
  if (raw == null) return 0;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return n < 1e12 ? n * 1000 : n;
}

function formatClosing(endTime: any): string {
  const ms = normalizeTimeMs(endTime);
  if (!ms) return "";
  const diff = ms - Date.now();
  if (diff <= 0) return "closed";
  const h = Math.ceil(diff / 3_600_000);
  if (h < 1) return "<1h";
  const d = Math.floor(h / 24);
  const rem = h % 24;
  if (d === 0) return `${rem}h`;
  if (rem === 0) return `${d}d`;
  return `${d}d ${rem}h`;
}

async function fetchJsonSafe(url: string): Promise<any | null> {
  const ctrl = new AbortController();
  const t = window.setTimeout(() => ctrl.abort(), METADATA_TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal, cache: "no-store" });
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  } finally {
    window.clearTimeout(t);
  }
}

function NftCard({ item }: { item: NftSummary }) {
  const closing = formatClosing(item.endTime ?? item.end_time);
  const isClosed = normalizeTimeMs(item.endTime ?? item.end_time) > 0 && normalizeTimeMs(item.endTime ?? item.end_time) <= Date.now();
  const payRaw = BigInt(item.paymentAmountRaw || "0");
  const sold = isClosed && payRaw > 0n;

  return (
    <Link
      href={`/bid?auctionPk=${encodeURIComponent(item.auctionPk)}`}
      className="group block h-full overflow-hidden border transition hover:-translate-y-0.5 card surface-hover"
    >
      <article className="flex h-full flex-col">
        <div className="relative aspect-[4/3] w-full overflow-hidden border-b border-[var(--line)] bg-[var(--background)]">
          <div className="absolute left-3 top-3 z-10 flex flex-wrap gap-2">
            <span className="badge text-[10px] uppercase tracking-[0.16em]">{item.auctionType}</span>
            {sold ? (
              <span className="text-[10px] font-bold uppercase tracking-[0.16em] bg-[var(--accent)] text-black px-2 py-1">Sold</span>
            ) : closing ? (
              <span className="badge text-[10px] uppercase tracking-[0.16em]">{closing}</span>
            ) : null}
          </div>
          <div className="absolute right-3 top-3 z-10">
            <div className="surface-strong px-3 py-2">
              <div className="text-[10px] uppercase tracking-[0.22em] text-muted">Bids</div>
              <div className="text-2xl font-bold">{item.bidCount}</div>
            </div>
          </div>
          {item.image ? (
            <img src={item.image} alt={item.name} className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]" />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-[var(--muted)]">No image</div>
          )}
        </div>
        <div className="flex flex-1 flex-col p-4">
          <h3 className="mt-1 line-clamp-1 text-lg font-semibold text-[var(--foreground)]">{item.name}</h3>
          {item.description ? (
            <p className="mt-2 line-clamp-2 text-xs leading-5 text-[var(--muted)]">{item.description}</p>
          ) : null}
          <div className="mt-4 flex items-center justify-between gap-3 border-t border-[var(--line)] pt-3 text-[11px] text-[var(--muted)]">
            <span className="truncate font-mono">{shorten(item.auctionPk, 7, 5)}</span>
            <span className="badge text-[10px] uppercase tracking-[0.16em]">Bid</span>
          </div>
        </div>
      </article>
    </Link>
  );
}

export default function CollectionClient({ collectionMint }: { collectionMint: string }) {
  const [nfts, setNfts] = useState<NftSummary[]>([]);
  const [collectionMeta, setCollectionMeta] = useState<CollectionMeta | null>(null);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setStatus(null);

      try {
        const programId = process.env.NEXT_PUBLIC_PROGRAM_ID;
        const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL;
        if (!programId || !rpcUrl) throw new Error("Missing env vars");

        const program = await createReadOnlyProgram(rpcUrl, programId);
        const entries = await program.account.auction.all();

        let collectionMetaFound: CollectionMeta | null = null;

        const settled = await Promise.allSettled(
          entries.map(async (entry) => {
            const pk = entry?.publicKey?.toBase58?.() ?? "";
            const auction = entry?.account ?? {};

            const metadataUri = toStringMaybe(
              auction?.auctionMetadataUri ?? auction?.auction_metadata_uri ?? auction?.metadataUri
            );

            if (!metadataUri) return null;

            const meta = await fetchJsonSafe(toHttpGateway(metadataUri));
            if (!meta || meta?.collectionMint !== collectionMint) return null;

            if (!collectionMetaFound && meta?.collectionName) {
              collectionMetaFound = {
                name: String(meta.collectionName),
                description: String(meta.collectionDescription ?? ""),
                image: toHttpGateway(toStringMaybe(meta.collectionImage ?? "")),
              };
            }

            return {
              auctionPk: pk,
              name: String(meta?.name ?? `NFT ${shorten(pk)}`),
              description: String(meta?.description ?? ""),
              image: toHttpGateway(toStringMaybe(meta?.image)),
              auctionType: enumKey(auction?.auctionType ?? auction?.auction_type).toLowerCase(),
              bidCount: Number(auction?.bidCount ?? auction?.bid_count ?? 0),
              endTime: auction?.endTime ?? auction?.end_time,
              paymentAmountRaw: toStringMaybe(auction?.paymentAmount ?? auction?.payment_amount ?? "0"),
            } as NftSummary;
          })
        );

        if (cancelled) return;

        const results = settled
          .filter((r): r is PromiseFulfilledResult<NftSummary | null> => r.status === "fulfilled")
          .map((r) => r.value)
          .filter((v): v is NftSummary => v !== null);

        setNfts(results);
        if (collectionMetaFound) setCollectionMeta(collectionMetaFound);
        setStatus(results.length === 0 ? "No NFT auctions found for this collection." : null);
      } catch (err: any) {
        if (!cancelled) setStatus(err?.message ?? "Failed to load collection.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, [collectionMint]);

  return (
    <main className="page-shell min-h-screen px-4 py-6 md:px-6 lg:px-8">
      <div className="mx-auto max-w-[1600px]">
        {/* Header */}
        <div className="mb-6 surface p-5 md:p-6 flex flex-col gap-4 md:flex-row md:items-start md:gap-8">
          {collectionMeta?.image ? (
            <img
              src={collectionMeta.image}
              alt={collectionMeta.name}
              className="h-32 w-32 shrink-0 border border-[var(--line)] object-cover"
            />
          ) : null}
          <div className="flex-1">
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--accent)] mb-1">
              Collection
            </div>
            <h1 className="text-3xl font-semibold tracking-tight text-[var(--foreground)] md:text-4xl">
              {collectionMeta?.name ?? (loading ? "Loading…" : "Collection")}
            </h1>
            {collectionMeta?.description ? (
              <p className="mt-2 text-sm leading-6 text-[var(--muted)]">{collectionMeta.description}</p>
            ) : null}
            <div className="mt-3 flex items-center gap-3 text-xs text-[var(--muted)]">
              <span>{nfts.length} NFT{nfts.length !== 1 ? "s" : ""}</span>
              <span className="font-mono">{shorten(collectionMint, 8, 6)}</span>
            </div>
          </div>
          <Link
            href="/market"
            className="shrink-0 text-xs text-[var(--muted)] hover:text-[var(--foreground)] transition underline underline-offset-2"
          >
            ← Back to market
          </Link>
        </div>

        {status ? (
          <div className="mb-5 surface px-4 py-3 text-sm text-[var(--muted)]">{status}</div>
        ) : null}

        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-[420px] animate-pulse border border-[var(--line)] bg-[var(--surface)]" />
            ))}
          </div>
        ) : (
          <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {nfts.map((item) => (
              <NftCard key={item.auctionPk} item={item} />
            ))}
          </section>
        )}
      </div>
    </main>
  );
}
