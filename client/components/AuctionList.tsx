"use client";

import React from "react";
import Link from "next/link";

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

type Props = {
  auctions: AuctionSummary[];
};

function shorten(pk: string): string {
  if (!pk) return "";
  if (pk.length <= 14) return pk;
  return `${pk.slice(0, 5)}…${pk.slice(-5)}`;
}

function Field({
  label,
  value,
  copyValue,
}: {
  label: string;
  value: string;
  copyValue?: string;
}) {
  const [copied, setCopied] = React.useState(false);
  const text = copyValue ?? value;

  async function handleCopy() {
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 900);
    } catch {
      setCopied(false);
    }
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/35">
          {label}
        </div>
        <button
          type="button"
          onClick={handleCopy}
          disabled={!text}
          className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-white/70 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <div className="mt-1 break-words text-sm text-white/85">{value}</div>
    </div>
  );
}

function AuctionCard({ item }: { item: AuctionSummary }) {
  const isMetadataOnly = item.assetKind === "metadataonly";

  return (
    <article className="w-full overflow-hidden rounded-[28px] border border-white/10 bg-white/[0.04] shadow-[0_18px_70px_rgba(0,0,0,0.28)] backdrop-blur-xl">
      <div className="grid min-h-[260px] gap-0 lg:grid-cols-[320px_1fr]">
        <div className="relative min-h-[260px] border-b border-white/10 lg:border-b-0 lg:border-r">
          {item.image ? (
            <img src={item.image} alt={item.name} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full min-h-[260px] items-center justify-center bg-black/20 px-4 text-sm text-white/45">
              No image
            </div>
          )}

          <div className="absolute left-4 top-4 flex gap-2">
            <span className="rounded-full border border-white/10 bg-black/45 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.16em] text-white/80">
              {item.auctionType || "auction"}
            </span>
            <span className="rounded-full border border-white/10 bg-black/45 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.16em] text-white/80">
              {item.source || "wallet"}
            </span>
          </div>
        </div>

        <div className="flex flex-col p-5 md:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/35">
                Auction
              </div>
              <h3 className="mt-2 text-2xl font-semibold text-white">{item.name}</h3>
            </div>

            <Link
              href={`/bid?auctionPk=${encodeURIComponent(item.auctionPk)}`}
              className="shrink-0 rounded-full border border-white/10 bg-white/5 px-4 py-2 text-sm text-white/80 transition hover:bg-white/10"
            >
              View
            </Link>
          </div>

          <p
            className="mt-4 text-sm leading-6 text-white/65"
            style={{
              display: "-webkit-box",
              WebkitLineClamp: 4,
              WebkitBoxOrient: "vertical",
              overflow: "hidden",
            }}
          >
            {item.description || "No description available."}
          </p>

          <div className="mt-5 grid gap-3 md:grid-cols-2">
            <Field label="Token mint" value={item.tokenMint ? shorten(item.tokenMint) : "Metadata only"} />
            <Field label="Amount" value={isMetadataOnly ? "Metadata only" : item.saleAmount || "0"} />
            <Field label="Auction PK" value={shorten(item.auctionPk)} copyValue={item.auctionPk} />
            <Field
              label="Metadata URI"
              value={item.metadataUri ? shorten(item.metadataUri) : "Unavailable"}
              copyValue={item.metadataUri}
            />
          </div>

          {item.error ? (
            <div className="mt-4 rounded-2xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-200">
              {item.error}
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}

export default function AuctionList({ auctions }: Props) {
  if (!auctions.length) return null;

  return (
    <section className="mt-6 grid gap-5">
      {auctions.map((item) => (
        <AuctionCard key={item.auctionPk} item={item} />
      ))}
    </section>
  );
}