"use client";

import React from "react";
import Link from "next/link";

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

  async function handleCopy(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
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
    <div className="border border-[var(--line)] bg-[var(--background)] px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">
          {label}
        </div>
        <button
          type="button"
          onClick={handleCopy}
          disabled={!text}
          className="btn px-2.5 py-1 text-[11px] font-medium disabled:cursor-not-allowed disabled:opacity-40"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <div className="mt-1 break-words text-sm text-[var(--foreground)]">{value}</div>
    </div>
  );
}

function AuctionCard({ item }: { item: AuctionSummary }) {
  const isMetadataOnly = item.assetKind === "metadataonly";

  return (
    <Link
      href={`/bid?auctionPk=${encodeURIComponent(item.auctionPk)}`}
      className="block w-full overflow-hidden border border-[var(--line)] bg-[var(--surface)] shadow-none transition surface-hover"
    >
      <article className="grid min-h-[260px] gap-0 lg:grid-cols-[320px_1fr]">
        <div className="relative min-h-[260px] border-b border-[var(--line)] lg:border-b-0 lg:border-r">
          {item.image ? (
            <img src={item.image} alt={item.name} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full min-h-[260px] items-center justify-center bg-[var(--background)] px-4 text-sm text-[var(--muted)]">
              No image
            </div>
          )}

          <div className="absolute left-4 top-4 flex gap-2">
            <span className="badge badge-accent text-[11px] font-medium uppercase tracking-[0.18em]">
              {item.auctionType || "auction"}
            </span>
          </div>
        </div>

        <div className="flex flex-col p-5 md:p-6">
          <div className="flex items-start justify-between gap-4">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">
                Auction
              </div>
              <h3 className="mt-2 text-2xl font-semibold text-[var(--foreground)]">{item.name}</h3>
            </div>
          </div>

          <p
            className="mt-4 text-sm leading-6 text-[var(--muted)]"
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
            {!isMetadataOnly ? <Field label="Token mint" value={item.tokenMint ? shorten(item.tokenMint) : "Unavailable"} /> : null}
            <Field label="Amount" value={isMetadataOnly ? "Metadata only" : item.saleAmount || "0"} />
            <Field label="Auction PK" value={shorten(item.auctionPk)} copyValue={item.auctionPk} />
            <Field
              label="Metadata URI"
              value={item.metadataUri ? shorten(item.metadataUri) : "Unavailable"}
              copyValue={item.metadataUri}
            />
          </div>

          {item.error ? (
            <div className="mt-4 border border-[var(--accent)] bg-[var(--background)] px-4 py-3 text-sm text-[var(--accent)]">
              {item.error}
            </div>
          ) : null}
        </div>
      </article>
    </Link>
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