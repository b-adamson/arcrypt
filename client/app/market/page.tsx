"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { PublicKey } from "@solana/web3.js";
import { createReadOnlyProgram } from "../lib/anchorClient";

type AuctionSummary = {
  auctionPk: string;
  source?: string;
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

type SearchSuggestion = {
  label: string;
  value: string;
  auctionPk: string;
};

const INITIAL_VISIBLE = 12;
const LOAD_MORE_STEP = 12;
const METADATA_TIMEOUT_MS = 2500;

function shorten(value: string, head = 6, tail = 4): string {
  if (!value) return "";
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
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
    (process.env.NEXT_PUBLIC_PINATA_GATEWAY_URL || "https://gateway.pinata.cloud/ipfs").replace(/\/$/, "");

  if (uri.startsWith("ipfs://")) {
    const path = uri.slice("ipfs://".length).replace(/^ipfs\/+/, "");
    return `${gateway}/${path}`;
  }

  return uri;
}

function formatTokenAmount(v: any, decimals: number): string {
  try {
    const amount = BigInt(v?.toString?.() ?? 0);
    const base = 10n ** BigInt(decimals);
    const whole = amount / base;
    const frac = amount % base;

    if (decimals === 0 || frac === 0n) return whole.toString();
    return `${whole.toString()}.${frac.toString().padStart(decimals, "0").replace(/0+$/, "")}`;
  } catch {
    return String(v?.toString?.() ?? v ?? "");
  }
}

async function fetchJsonWithTimeout(url: string, timeoutMs: number): Promise<any | null> {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), timeoutMs);

  try {
    const res = await fetch(url, { cache: "no-store", signal: controller.signal });
    if (!res.ok) return null;
    try {
      return await res.json();
    } catch {
      return null;
    }
  } catch {
    return null;
  } finally {
    window.clearTimeout(timeout);
  }
}

async function fetchAllAuctions(): Promise<any[]> {
  const programId = process.env.NEXT_PUBLIC_PROGRAM_ID;
  const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL;

  if (!programId || !rpcUrl) {
    throw new Error("Missing NEXT_PUBLIC_PROGRAM_ID or NEXT_PUBLIC_RPC_URL");
  }

  const program = await createReadOnlyProgram(rpcUrl, programId);
  return program.account.auction.all();
}

async function buildAuctionSummary(entry: any): Promise<AuctionSummary> {
  const pk = entry?.publicKey?.toBase58?.() ?? String(entry?.publicKey ?? "");
  const auction = entry?.account ?? {};

  const metadataUri = toStringMaybe(
    auction?.auctionMetadataUri ?? auction?.auction_metadata_uri ?? auction?.metadataUri ?? auction?.uri
  );

  const decimals = Number(auction?.prizeDecimals ?? auction?.prize_decimals ?? 0);
  const saleAmountRaw = auction?.saleAmount ?? auction?.sale_amount;

  let name = `Auction ${shorten(pk)}`;
  let description = "";
  let image = "";

  if (metadataUri) {
    const meta = await fetchJsonWithTimeout(toHttpGateway(metadataUri), METADATA_TIMEOUT_MS);
    if (meta) {
      name = String(meta?.name ?? name);
      description = String(meta?.description ?? "");
      image = toStringMaybe(meta?.image ?? "");
    }
  }

  return {
    auctionPk: pk,
    source: "market",
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
}

function AuctionCard({ item, active }: { item: AuctionSummary; active?: boolean }) {
  const isMetadataOnly = item.assetKind === "metadataonly";

  return (
    <Link
      href={`/bid?auctionPk=${encodeURIComponent(item.auctionPk)}`}
      className={`group block h-full overflow-hidden rounded-[24px] border bg-white/[0.04] shadow-[0_18px_50px_rgba(0,0,0,0.24)] backdrop-blur-xl transition hover:-translate-y-0.5 hover:border-fuchsia-400/40 hover:bg-white/[0.06] ${
        active ? "border-fuchsia-400/60 ring-2 ring-fuchsia-400/20" : "border-white/10"
      }`}
    >
      <article className="flex h-full flex-col">
        <div className="relative aspect-[4/3] w-full overflow-hidden border-b border-white/10 bg-black/20">
          {item.image ? (
            <img
              src={item.image}
              alt={item.name}
              className="h-full w-full object-cover transition duration-300 group-hover:scale-[1.02]"
            />
          ) : (
            <div className="flex h-full items-center justify-center px-4 text-sm text-white/45">
              No image
            </div>
          )}

          <div className="absolute left-3 top-3 flex gap-2">
            <span className="rounded-full border border-white/10 bg-black/55 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.16em] text-white/80">
              {item.auctionType || "auction"}
            </span>
            <span className="rounded-full border border-white/10 bg-black/55 px-2.5 py-1 text-[10px] font-medium uppercase tracking-[0.16em] text-white/80">
              {item.source || "market"}
            </span>
          </div>
        </div>

        <div className="flex flex-1 flex-col p-4">
          <div>
            <div className="text-[10px] font-semibold uppercase tracking-[0.18em] text-white/35">Auction</div>
            <h3 className="mt-1 line-clamp-1 text-lg font-semibold text-white">{item.name}</h3>
          </div>

          <p
            className="mt-2 line-clamp-2 text-xs leading-5 text-white/60"
            title={item.description}
          >
            {item.description || "No description available."}
          </p>

          <div className="mt-4 grid gap-2 text-xs text-white/70">
            <div className="rounded-xl border border-white/10 bg-black/15 px-3 py-2">
              <span className="block text-[10px] uppercase tracking-[0.18em] text-white/35">Token mint</span>
              <span className="mt-0.5 block truncate">{item.tokenMint ? shorten(item.tokenMint, 7, 5) : "Metadata only"}</span>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-white/10 bg-black/15 px-3 py-2">
                <span className="block text-[10px] uppercase tracking-[0.18em] text-white/35">Amount</span>
                <span className="mt-0.5 block truncate">{isMetadataOnly ? "Metadata only" : item.saleAmount || "0"}</span>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/15 px-3 py-2">
                <span className="block text-[10px] uppercase tracking-[0.18em] text-white/35">Asset</span>
                <span className="mt-0.5 block truncate">{item.assetKind || "unknown"}</span>
              </div>
            </div>
          </div>

          <div className="mt-4 flex items-center justify-between gap-3 border-t border-white/10 pt-3 text-[11px] text-white/45">
            <span className="truncate font-mono">{shorten(item.auctionPk, 7, 5)}</span>
            <span className="rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-white/65">
              View
            </span>
          </div>
        </div>
      </article>
    </Link>
  );
}

export default function MarketPage() {
  const [auctions, setAuctions] = useState<AuctionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [status, setStatus] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(INITIAL_VISIBLE);
  const [query, setQuery] = useState("");
  const [suggestionsOpen, setSuggestionsOpen] = useState(false);
  const [jumpTarget, setJumpTarget] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      setLoading(true);
      setStatus(null);

      try {
        const entries = await fetchAllAuctions();
        const settled = await Promise.allSettled(entries.map((entry) => buildAuctionSummary(entry)));

        const summaries = settled
          .filter((r): r is PromiseFulfilledResult<AuctionSummary> => r.status === "fulfilled")
          .map((r) => r.value)
          .sort((a, b) => a.name.localeCompare(b.name));

        if (!cancelled) {
          setAuctions(summaries);
          setVisibleCount(INITIAL_VISIBLE);
          setStatus(summaries.length ? null : "No auctions found yet.");
        }
      } catch (err: any) {
        if (!cancelled) {
          setAuctions([]);
          setStatus(err?.message ?? "Failed to load auctions.");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const suggestions = useMemo<SearchSuggestion[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];

    return auctions
      .filter((item) => {
        return (
          item.name.toLowerCase().includes(q) ||
          item.tokenMint.toLowerCase().includes(q) ||
          item.auctionPk.toLowerCase().includes(q) ||
          item.metadataUri.toLowerCase().includes(q)
        );
      })
      .slice(0, 6)
      .map((item) => ({
        label: `${item.name} · ${shorten(item.auctionPk, 7, 5)}`,
        value: item.name,
        auctionPk: item.auctionPk,
      }));
  }, [auctions, query]);

  const filteredAuctions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return auctions;

    return auctions.filter((item) => {
      return (
        item.name.toLowerCase().includes(q) ||
        item.tokenMint.toLowerCase().includes(q) ||
        item.auctionPk.toLowerCase().includes(q) ||
        item.metadataUri.toLowerCase().includes(q)
      );
    });
  }, [auctions, query]);

  const visibleAuctions = filteredAuctions.slice(0, visibleCount);

  useEffect(() => {
    if (!jumpTarget) return;

    const el = document.getElementById(`auction-${jumpTarget}`);
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [jumpTarget, visibleAuctions]);

  function handleSuggestionPick(item: SearchSuggestion) {
    setQuery(item.value);
    setJumpTarget(item.auctionPk);
    setSuggestionsOpen(false);
    setVisibleCount((current) => Math.max(current, auctions.findIndex((a) => a.auctionPk === item.auctionPk) + 4));
  }

  async function handleLoadMore() {
    setIsRefreshing(true);
    window.setTimeout(() => {
      setVisibleCount((current) => current + LOAD_MORE_STEP);
      setIsRefreshing(false);
    }, 120);
  }

  return (
    <main className="min-h-screen bg-[#080812] px-4 py-6 text-white md:px-6 lg:px-8">
      <div className="mx-auto max-w-[1600px]">
        <div className="relative z-40 overflow-visible mb-6 flex flex-col gap-4 rounded-[28px] border border-white/10 bg-white/[0.03] p-5 backdrop-blur-xl md:p-6">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <div className="inline-flex rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/60">
                Market
              </div>
              <h1 className="mt-3 text-3xl font-semibold tracking-tight md:text-4xl">
                All auctions
              </h1>
              <p className="mt-2 max-w-3xl text-sm leading-6 text-white/55">
                Browse live and historical auctions from anyone. Search by name, token mint, metadata URI, or auction PDA.
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white/60">
              <div className="text-[11px] uppercase tracking-[0.18em] text-white/35">Showing</div>
              <div className="mt-1 font-medium text-white">
                {visibleAuctions.length} / {filteredAuctions.length}
              </div>
            </div>
          </div>

          <div className="relative z-50 max-w-3xl">
            <input
              ref={inputRef}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSuggestionsOpen(true);
                setJumpTarget(null);
                setVisibleCount(INITIAL_VISIBLE);
              }}
              onFocus={() => setSuggestionsOpen(true)}
              onBlur={() => window.setTimeout(() => setSuggestionsOpen(false), 150)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && suggestions[0]) {
                  handleSuggestionPick(suggestions[0]);
                }
              }}
              placeholder="Search name, token mint, auction PDA, metadata URI..."
              className="h-12 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white outline-none placeholder:text-white/30 transition focus:border-fuchsia-400/50 focus:bg-white/[0.06] focus:ring-2 focus:ring-fuchsia-500/20"
            />

            {suggestionsOpen && suggestions.length > 0 ? (
              <div className="absolute z-50 mt-2 w-full overflow-hidden rounded-2xl border border-white/10 bg-[#0b0b12] shadow-2xl">
                <div className="border-b border-white/10 px-4 py-2 text-[11px] uppercase tracking-[0.18em] text-white/35">
                  Suggestions
                </div>
                <div className="max-h-72 overflow-auto">
                  {suggestions.map((s) => (
                    <button
                      key={s.auctionPk}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => handleSuggestionPick(s)}
                      className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left transition hover:bg-white/5"
                    >
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-white">{s.label}</div>
                        <div className="mt-0.5 truncate text-xs text-white/45 font-mono">{s.auctionPk}</div>
                      </div>
                      <span className="shrink-0 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-1 text-[10px] uppercase tracking-[0.16em] text-white/65">
                        Jump
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>

        {loading ? (
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, idx) => (
              <div
                key={idx}
                className="h-[420px] animate-pulse rounded-[24px] border border-white/10 bg-white/[0.03]"
              />
            ))}
          </div>
        ) : null}

        {!loading && status ? (
          <div className="mb-5 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/65">
            {status}
          </div>
        ) : null}

        {!loading && visibleAuctions.length === 0 && !status ? (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/65">
            No auctions matched your search.
          </div>
        ) : null}

        <section className="relative z-0 grid gap-4 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
          {visibleAuctions.map((item) => (
            <div id={`auction-${item.auctionPk}`} key={item.auctionPk}>
              <AuctionCard item={item} active={jumpTarget === item.auctionPk} />
            </div>
          ))}
        </section>

        {visibleCount < filteredAuctions.length ? (
          <div className="mt-6 flex justify-center">
            <button
              type="button"
              onClick={handleLoadMore}
              disabled={isRefreshing}
              className="inline-flex h-11 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] px-5 text-sm font-medium text-white/80 transition hover:bg-white/[0.07] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {isRefreshing ? "Loading..." : "Load more"}
            </button>
          </div>
        ) : null}

        <div className="mt-6 text-sm text-white/45">
          Tip: press Enter in the search bar to jump to the first matching auction.
        </div>
      </div>
    </main>
  );
}
