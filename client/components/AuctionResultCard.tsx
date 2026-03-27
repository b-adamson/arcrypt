"use client";

import React, { useEffect, useState } from "react";
import { PublicKey } from "@solana/web3.js";

type Props = {
  auctionData: any | null;
  auctionEnded: boolean;
  isWinner?: boolean;
  winnerBase58?: string | null;
  tokenDecimals?: number;
};

type AuctionMetadata = {
  name?: string;
  description?: string;
  image?: string;
};

function enumKey(v: any): string {
  if (v && typeof v === "object") return Object.keys(v)[0];
  return String(v ?? "");
}

function toBase58Maybe(v: any): string {
  if (!v) return "";
  return v?.toBase58?.() ?? new PublicKey(v).toBase58();
}

const LAMPORTS_PER_SOL = 1_000_000_000n;

function formatSolAmount(v: any): string {
  const lamports = BigInt(v?.toString?.() ?? 0);
  const whole = lamports / LAMPORTS_PER_SOL;
  const frac = lamports % LAMPORTS_PER_SOL;

  if (frac === 0n) return `${whole.toString()} SOL`;
  return `${whole.toString()}.${frac.toString().padStart(9, "0").replace(/0+$/, "")} SOL`;
}

function formatTokenAmount(v: any, decimals: number): string {
  const amount = BigInt(v?.toString?.() ?? 0);
  const base = 10n ** BigInt(decimals);

  const whole = amount / base;
  const frac = amount % base;

  if (decimals === 0 || frac === 0n) return whole.toString();

  return `${whole.toString()}.${frac.toString().padStart(decimals, "0").replace(/0+$/, "")}`;
}

function toStringMaybe(v: any): string {
  if (v == null) return "";
  return v?.toString?.() ?? String(v);
}

function shorten(pk: string): string {
  if (!pk) return "";
  if (pk.length <= 12) return pk;
  return `${pk.slice(0, 4)}…${pk.slice(-4)}`;
}

function getAuctionType(auction: any): string {
  return enumKey(auction?.auctionType ?? auction?.auction_type).toLowerCase();
}

function isMultiWinnerAuction(auctionType: string): boolean {
  return auctionType === "uniform" || auctionType === "prorata";
}

function isMetadataOnly(auction: any): boolean {
  return enumKey(auction?.assetKind ?? auction?.asset_kind).toLowerCase() === "metadataonly";
}

function getSingleWinner(auction: any, winnerBase58?: string | null): string | null {
  if (winnerBase58) return winnerBase58;

  const winner = auction?.winner;
  if (!winner) return null;

  try {
    const s = toBase58Maybe(winner);
    return s && s !== PublicKey.default.toBase58() ? s : null;
  } catch {
    return null;
  }
}

function getMultiWinners(auction: any): string[] {
  const winners = auction?.winners;
  if (!Array.isArray(winners)) return [];

  return winners
    .map((w) => {
      try {
        return toBase58Maybe(w);
      } catch {
        return "";
      }
    })
    .filter((w) => w && w !== PublicKey.default.toBase58());
}

function getMetadataUri(auction: any): string {
  const raw =
    auction?.auctionMetadataUri ??
    auction?.auction_metadata_uri ??
    auction?.metadataUri ??
    auction?.metadata_uri ??
    auction?.uri ??
    auction?.metadata?.uri ??
    "";

  return toStringMaybe(raw);
}

function formatEndTime(endTime: any): string {
  const ts = Number(endTime ?? 0);
  if (!ts) return "Unavailable";

  return new Date(ts * 1000).toLocaleString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

function toHttpGateway(uri: string): string {
  if (!uri) return "";

  const gateway =
    (process.env.NEXT_PUBLIC_PINATA_GATEWAY_URL || "https://gateway.pinata.cloud/ipfs")
      .replace(/\/$/, "");

  if (uri.startsWith("ipfs://")) {
    const path = uri.slice("ipfs://".length).replace(/^ipfs\/+/, "");
    return `${gateway}/${path}`;
  }

  return uri;
}

export default function AuctionResultCard({
  auctionData,
  auctionEnded,
  isWinner = false,
  winnerBase58 = null,
  tokenDecimals = 0,
}: Props) {
  const [metadata, setMetadata] = useState<AuctionMetadata | null>(null);
  const [metadataError, setMetadataError] = useState<string | null>(null);
  const [metadataLoading, setMetadataLoading] = useState(false);


  const auctionType = getAuctionType(auctionData);
  const status = enumKey(auctionData.status);
  const multi = isMultiWinnerAuction(auctionType);

  const assetKind = enumKey(auctionData.assetKind ?? auctionData.asset_kind);
  const creator = auctionData.authority ? toBase58Maybe(auctionData.authority) : "";

  const singleWinner = winnerBase58 ?? getSingleWinner(auctionData);

const multiWinners = getMultiWinners(auctionData);

  const winnerBids = Array.isArray(auctionData?.winnerBids ?? auctionData?.winner_bids)
    ? (auctionData?.winnerBids ?? auctionData?.winner_bids).map(toStringMaybe)
    : [];

  const clearingPrice = auctionData?.clearingPrice ?? auctionData?.clearing_price;
  const totalBid = auctionData?.totalBid ?? auctionData?.total_bid;
  const paymentAmount = auctionData?.paymentAmount ?? auctionData?.payment_amount;
  const saleAmount = auctionData?.saleAmount ?? auctionData?.sale_amount;
  const tokenMint = auctionData?.tokenMint ?? auctionData?.token_mint;
  const minBid = auctionData?.minBid ?? auctionData?.min_bid;
  const endTime = auctionData?.endTime ?? auctionData?.end_time;

  const metadataUri = getMetadataUri(auctionData);
  const metadataHttpUri = toHttpGateway(metadataUri);

  const formattedPayment = formatSolAmount(paymentAmount ?? 0);
  const formattedSaleAmount = isMetadataOnly(auctionData)
    ? "Metadata only"
    : formatTokenAmount(saleAmount ?? 0, tokenDecimals);

  useEffect(() => {
    let cancelled = false;

    async function loadMetadata() {
      if (!metadataHttpUri) {
        setMetadata(null);
        setMetadataError(null);
        setMetadataLoading(false);
        return;
      }

      setMetadataLoading(true);
      setMetadataError(null);

      try {
        const res = await fetch(metadataHttpUri, { cache: "no-store" });
        if (!res.ok) {
          throw new Error(`Metadata fetch failed (${res.status})`);
        }

        const json = await res.json();
        if (cancelled) return;

        setMetadata({
          name: json?.name ?? "",
          description: json?.description ?? "",
          image: json?.image ?? "",
        });
      } catch (err: any) {
        if (!cancelled) {
          setMetadata(null);
          setMetadataError(err?.message ?? "Failed to load metadata.");
        }
      } finally {
        if (!cancelled) setMetadataLoading(false);
      }
    }

    loadMetadata();

    return () => {
      cancelled = true;
    };
  }, [metadataHttpUri]);
  if (!auctionData) return null;

  const metadataImage = metadata?.image ? toHttpGateway(metadata.image) : "";

  return (
    <section className="mt-6 overflow-hidden rounded-[24px] border border-white/10 bg-white/[0.04] p-6 shadow-[0_20px_70px_rgba(0,0,0,0.35)] backdrop-blur-xl">
      <div className="mb-5 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-white">Auction status</h3>
          <p className="mt-1 text-sm text-white/45">
            Core auction status, settlement details, and pinned metadata
          </p>
        </div>

        <span className="rounded-full border border-white/10 bg-black/25 px-3 py-1 text-xs text-white/60">
          {auctionEnded ? "Ended" : "Live"}
        </span>
      </div>

      {metadataLoading || metadata || metadataError ? (
        <div className="mb-5 overflow-hidden rounded-2xl border border-white/10 bg-black/20">
          <div className="grid gap-0 md:grid-cols-[220px_1fr]">
            <div className="border-b border-white/10 md:border-b-0 md:border-r">
              {metadataImage ? (
                <img
                  src={metadataImage}
                  alt={metadata?.name || "Auction image"}
                  className="h-full min-h-[220px] w-full object-cover"
                />
              ) : (
                <div className="flex min-h-[220px] items-center justify-center px-4 text-sm text-white/40">
                  {metadataLoading ? "Loading metadata..." : "No image in metadata"}
                </div>
              )}
            </div>

            <div className="p-5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/35">
                Metadata
              </div>

              <h4 className="mt-2 text-2xl font-semibold text-white">
                {metadata?.name || (metadataLoading ? "Loading..." : "Untitled auction")}
              </h4>

              <p className="mt-3 max-w-2xl text-sm leading-6 text-white/65">
                {metadata?.description || (metadataLoading ? "Fetching description from IPFS..." : "No description available.")}
              </p>

              <div className="mt-4 grid gap-3 md:grid-cols-2">
                <CopyableField
                  label="Metadata URI"
                  value={metadataUri ? shorten(metadataUri) : "Unavailable"}
                  copyValue={metadataUri}
                />
                <CopyableField
                  label="Image URI"
                  value={metadata?.image ? shorten(metadata.image) : "Unavailable"}
                  copyValue={metadata?.image || ""}
                />
              </div>

              {metadataError ? (
                <p className="mt-3 text-sm text-red-300">{metadataError}</p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
        <CopyableField label="Status" value={status} />
        <CopyableField label="Type" value={auctionType} />
        <CopyableField label="Asset kind" value={assetKind} />
        <CopyableField label="Creator" value={creator || "Unavailable"} copyValue={creator} />
        <CopyableField label="Sale amount" value={formattedSaleAmount} />
        <CopyableField
          label="Sale mint"
          value={isMetadataOnly(auctionData) ? "Metadata only" : shorten(toBase58Maybe(tokenMint))}
          copyValue={isMetadataOnly(auctionData) ? "Metadata only" : toBase58Maybe(tokenMint)}
        />
        <CopyableField label="Min bid" value={formatSolAmount(minBid ?? 0)} />
        <CopyableField label="End time" value={formatEndTime(endTime)} />

        {!multi ? (
          <>
<CopyableField
  label="Winner"
  value={
    isWinner
      ? "You are the winner"
      : singleWinner
        ? shorten(singleWinner)
        : "Not resolved yet"
  }
  copyValue={singleWinner ?? ""}
/>
            <CopyableField
              label="Payment"
              value={formattedPayment}
              copyValue={toStringMaybe(paymentAmount ?? 0)}
            />
          </>
        ) : (
          <>
  <CopyableField
    label="Winners"
    value={multiWinners.length ? multiWinners.map(shorten).join(", ") : "Not resolved yet"}
    copyValue={multiWinners.join(", ")}
  />
            <CopyableField
              label="Winner bids"
              value={winnerBids.length ? winnerBids.join(", ") : "Not available yet"}
              copyValue={winnerBids.join(", ")}
            />
            <CopyableField label="Clearing price" value={toStringMaybe(clearingPrice ?? 0)} />
            <CopyableField label="Total bid" value={toStringMaybe(totalBid ?? 0)} />
          </>
        )}
      </div>
    </section>
  );
}

function CopyableField({
  label,
  value,
  copyValue,
}: {
  label: string;
  value: string;
  copyValue?: string;
}) {
  const [copied, setCopied] = useState(false);
  const copyText = copyValue ?? value;

  async function handleCopy() {
    if (!copyText) return;
    try {
      await navigator.clipboard.writeText(copyText);
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
          disabled={!copyText}
          className="rounded-full border border-white/10 bg-white/5 px-2.5 py-1 text-[11px] font-medium text-white/70 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <div className="mt-1 break-words text-sm text-white/85">{value}</div>
    </div>
  );
}