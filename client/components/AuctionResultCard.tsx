"use client";

import React, { useEffect, useMemo, useState } from "react";
import { PublicKey, Connection } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import { useBidFlash } from "../hooks/addBidFlash";
import {
  shorten,
  enumKey,
  toBase58Maybe,
  formatTokenAmount,
  formatEndTime,
  toHttpGateway,
  getAuctionType,
  isMetadataOnly,
  getSingleWinner,
  getMultiWinners,
} from "@/lib/utils";

type Props = {
  auctionData: any | null;
  auctionEnded: boolean;
  isWinner?: boolean;
  winnerBase58?: string | null;
  tokenDecimals?: number;
  bidCount?: number;
  connection?: Connection | null;
};

type AuctionMetadata = {
  name?: string;
  description?: string;
  image?: string;
};

const USDC_DECIMALS = 6;

function toStringMaybe(v: any): string {
  if (v == null) return "";
  return v?.toString?.() ?? String(v);
}

function isMultiWinnerAuction(auctionType: string): boolean {
  return auctionType === "uniform";
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

function formatUsdcAmount(raw: any): string {
  return formatTokenAmount(raw ?? 0, USDC_DECIMALS);
}

export default function AuctionResultCard({
  auctionData,
  auctionEnded,
  isWinner = false,
  winnerBase58 = null,
  tokenDecimals = 0,
  connection = null,
}: Props) {
  const [metadata, setMetadata] = useState<AuctionMetadata | null>(null);
  const [metadataError, setMetadataError] = useState<string | null>(null);
  const [metadataLoading, setMetadataLoading] = useState(false);
  const [devBalanceRaw, setDevBalanceRaw] = useState<bigint>(0n);
  const [programBalanceRaw, setProgramBalanceRaw] = useState<bigint>(0n);

  const auctionType = getAuctionType(auctionData);
  const status = enumKey(auctionData?.status);
  const multi = isMultiWinnerAuction(auctionType);

  const assetKind = enumKey(auctionData?.assetKind ?? auctionData?.asset_kind);
  const creator = auctionData?.authority ? toBase58Maybe(auctionData.authority) : "";

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

  const tokenDecimalsSafe = tokenDecimals ?? 0;

const paymentAmountRaw = paymentAmount ?? 0;
const shouldShowSoldCard = BigInt(paymentAmountRaw.toString?.() ?? "0") > 0n;

const formattedSaleAmount = isMetadataOnly(auctionData)
  ? "Metadata only"
  : formatTokenAmount(saleAmount ?? 0, tokenDecimalsSafe);

    const displayedSupplyRaw = devBalanceRaw + programBalanceRaw;

const formattedDisplayedSupply = isMetadataOnly(auctionData)
  ? "Metadata only"
  : formatTokenAmount(displayedSupplyRaw, tokenDecimalsSafe);

const formattedCreatorBalance = isMetadataOnly(auctionData)
  ? "Metadata only"
  : formatTokenAmount(devBalanceRaw, tokenDecimalsSafe);

const formattedVaultBalance = isMetadataOnly(auctionData)
  ? "Metadata only"
  : formatTokenAmount(programBalanceRaw, tokenDecimalsSafe);

  const metadataUri = getMetadataUri(auctionData);
  const metadataHttpUri = toHttpGateway(metadataUri);

  const formattedPayment = formatUsdcAmount(paymentAmount ?? 0);
  // const formattedSaleAmount = isMetadataOnly(auctionData)
  //   ? "Metadata only"
  //   : formatTokenAmount(saleAmount ?? 0, tokenDecimals);

  const bidCount = Number(auctionData?.bidCount ?? auctionData?.bid_count ?? 0);
  const flash = useBidFlash(bidCount);

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

  const mintStr = useMemo(
    () => toBase58Maybe(auctionData?.tokenMint ?? auctionData?.token_mint),
    [auctionData?.tokenMint, auctionData?.token_mint]
  );

  const vaultStr = useMemo(
    () => toBase58Maybe(auctionData?.prizeVault ?? auctionData?.prize_vault),
    [auctionData?.prizeVault, auctionData?.prize_vault]
  );

  const creatorStr = useMemo(
    () => toBase58Maybe(auctionData?.authority),
    [auctionData?.authority]
  );

  useEffect(() => {
    let cancelled = false;

    async function loadBalances() {
      try {
        if (!connection || !mintStr || !vaultStr || !creatorStr || isMetadataOnly(auctionData)) {
          if (!cancelled) {
            setDevBalanceRaw(0n);
            setProgramBalanceRaw(0n);
          }
          return;
        }

        const vaultPk = new PublicKey(vaultStr);
        const creatorPk = new PublicKey(creatorStr);

        let vaultAmount = 0n;
        try {
          const bal = await connection.getTokenAccountBalance(vaultPk);
          vaultAmount = BigInt(bal.value.amount);
        } catch {
          vaultAmount = 0n;
        }

        const [legacyAccounts, token2022Accounts] = await Promise.all([
          connection.getParsedTokenAccountsByOwner(creatorPk, { programId: TOKEN_PROGRAM_ID }),
          connection.getParsedTokenAccountsByOwner(creatorPk, { programId: TOKEN_2022_PROGRAM_ID }),
        ]);

        let creatorAmount = 0n;

        for (const parsedSet of [legacyAccounts, token2022Accounts]) {
          for (const entry of parsedSet.value) {
            const info = (entry.account.data as any)?.parsed?.info;
            const accMint = String(info?.mint ?? "");
            const rawAmount = BigInt(String(info?.tokenAmount?.amount ?? "0"));

            if (accMint === mintStr && rawAmount > 0n) {
              creatorAmount += rawAmount;
            }
          }
        }

        if (!cancelled) {
          setProgramBalanceRaw(vaultAmount);
          setDevBalanceRaw(creatorAmount);
        }
      } catch {
        if (!cancelled) {
          setDevBalanceRaw(0n);
          setProgramBalanceRaw(0n);
        }
      }
    }

    void loadBalances();

    return () => {
      cancelled = true;
    };
  }, [connection, mintStr, vaultStr, creatorStr, auctionData?.assetKind, auctionData?.asset_kind, auctionData]);



  // const formattedDisplayedSupply = isMetadataOnly(auctionData)
  //   ? "Metadata only"
  //   : formatTokenAmount(displayedSupplyRaw, tokenDecimals);

  const formattedDevBalance = isMetadataOnly(auctionData)
    ? "Metadata only"
    : formatTokenAmount(devBalanceRaw, tokenDecimals);

  const formattedProgramBalance = isMetadataOnly(auctionData)
    ? "Metadata only"
    : formatTokenAmount(programBalanceRaw, tokenDecimals);

  if (!auctionData) return null;

  const metadataImage = metadata?.image ? toHttpGateway(metadata.image) : "";

  const winnerPrices = Array.isArray(auctionData?.winnerPrices ?? auctionData?.winner_prices)
    ? (auctionData?.winnerPrices ?? auctionData?.winner_prices)
    : [];

  const formatOrDash = (v: any) => {
    const val = BigInt(v?.toString?.() ?? 0);
    return val === 0n ? "-" : formatUsdcAmount(v);
  };

  const formattedWinnerBids = winnerBids.length
    ? winnerBids.map((v: any) => formatOrDash(v)).join(", ")
    : "Not available yet";

  const formattedWinnerPrices = winnerPrices.length
    ? winnerPrices.map((v: any) => formatOrDash(v)).join(", ")
    : "Not available yet";

  const hasEnoughBids = bidCount >= 3;

  const formattedClearingPrice = hasEnoughBids
    ? formatUsdcAmount(clearingPrice ?? 0)
    : "Not enough bids";

  const formattedMinBid = formatUsdcAmount(minBid ?? 0);
  const formattedTotalBid = formatUsdcAmount(totalBid ?? 0);

  return (
    <section className="mt-6 overflow-hidden border border-[var(--line)] bg-[var(--surface)] p-6 shadow-none">
      <div className="mb-5 flex items-center justify-between gap-3 border-b border-[var(--line)] pb-4">
        <div>
          <h3 className="text-lg font-semibold text-[var(--foreground)]">Project status</h3>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Core project status, settlement details, and pinned metadata
          </p>
        </div>

        <span className="badge badge-accent">{auctionEnded ? "Ended" : "Live"}</span>
      </div>

      {metadataLoading || metadata || metadataError ? (
        <div className="mb-5 overflow-hidden border border-[var(--line)] bg-[var(--background)]">
          <div className="grid gap-0 md:grid-cols-[220px_1fr]">
            <div className="border-b border-[var(--line)] md:border-b-0 md:border-r">
              {metadataImage ? (
                <img
                  src={metadataImage}
                  alt={metadata?.name || "Auction image"}
                  className="h-full min-h-[220px] w-full object-cover"
                />
              ) : (
                <div className="flex min-h-[220px] items-center justify-center px-4 text-sm text-[var(--muted)]">
                  {metadataLoading ? "Loading metadata..." : "No image in metadata"}
                </div>
              )}
            </div>

            <div className="p-5">
              <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">
                Metadata
              </div>

              <h4 className="mt-2 text-2xl font-semibold text-[var(--foreground)]">
                {metadata?.name || (metadataLoading ? "Loading..." : "Untitled auction")}
              </h4>

              <p className="mt-3 max-w-2xl text-sm leading-6 text-[var(--muted)]">
                {metadata?.description ||
                  (metadataLoading ? "Fetching description from IPFS..." : "No description available.")}
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

                <CopyableField label="Dev balance" value={formattedDevBalance} />
                <CopyableField label="Program balance" value={formattedProgramBalance} />
                <CopyableField label="Supply (dev + program)" value={formattedDisplayedSupply} />
              </div>

              {metadataError ? (
                <p className="mt-3 text-sm text-[var(--accent)]">{metadataError}</p>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}

      <div className="mb-5">
        <div
          className={`
            surface-strong px-6 py-5 transition-all
            ${flash ? "border-accent pulse-accent" : ""}
          `}
        >
          <div className="text-[11px] uppercase tracking-[0.22em] text-[var(--muted)]">
            Bids submitted
          </div>

          <div
            className={`
              mt-2 text-4xl font-bold transition-colors
              ${flash ? "text-accent" : "text-[var(--foreground)]"}
            `}
          >
            {bidCount}
          </div>
        </div>
      </div>

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
        <CopyableField label="Min bid (USDC)" value={formattedMinBid} />
        <CopyableField label="End time" value={formatEndTime(endTime)} />

          {multi && auctionEnded && bidCount < 3 && (
            <div className="col-span-full border border-yellow-500/40 bg-yellow-500/10 px-4 py-3 text-sm">
              Uniform auctions require at least 3 bids. Results are incomplete.
            </div>
          )}

        {!multi ? (
          <>
            <CopyableField
              label="Winner"
              value={isWinner ? "You are the winner" : singleWinner ? shorten(singleWinner) : "Not resolved yet"}
              copyValue={singleWinner ?? ""}
            />
{shouldShowSoldCard && (
  <div
    className={`col-span-full border px-5 py-5 ${
      auctionEnded
        ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_12%,transparent)]"
        : "border-[var(--line)] bg-[var(--background)]"
    }`}
  >
    <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">
      SOLD
    </div>

    <div
      className={`mt-2 flex items-end gap-2 ${
        auctionEnded ? "text-accent" : "text-[var(--foreground)]"
      }`}
    >
      <span className="text-4xl font-bold tabular-nums">
        {formattedPayment}
      </span>

      <span className="pb-1 text-sm font-semibold uppercase tracking-[0.18em] opacity-70">
        USDC
      </span>
    </div>

    <button
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(toStringMaybe(paymentAmount ?? 0));
        } catch {}
      }}
      className={`mt-3 inline-flex min-w-[52px] items-center justify-center border px-2 py-1 text-xs transition ${
        auctionEnded
          ? "border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] text-accent hover:opacity-80"
          : "border-[var(--line)] bg-[var(--background)] text-[var(--muted)] hover:border-[var(--line-strong)] hover:text-[var(--foreground)]"
      }`}
      title="Copy"
    >
      Copy
    </button>
  </div>
)}
          </>
        ) : (
          <>
            <CopyableField
              label="Winners"
              value={
                multiWinners.length
                  ? multiWinners.map((w) => shorten(w)).join(", ")
                  : "Not resolved yet"
              }
              copyValue={multiWinners.join(", ")}
            />

            <CopyableField
              label="Winner allocations (USDC)"
              value={formattedWinnerBids}
              copyValue={winnerBids.join(", ")}
            />

            <CopyableField
              label="Winner prices (USDC)"
              value={formattedWinnerPrices}
              copyValue={winnerPrices.join(", ")}
            />

            <CopyableField
              label="Clearing price (USDC)"
              value={formattedClearingPrice}
            />

            <CopyableField
              label="Total bid (USDC)"
              value={formattedTotalBid}
            />
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
    <div className="border border-[var(--line)] bg-[var(--background)] px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">
          {label}
        </div>
        <button
          onClick={handleCopy}
          className="inline-flex min-w-[52px] items-center justify-center border border-[var(--line)]
                     bg-[var(--background)] px-2 py-1 text-xs text-[var(--muted)]
                     transition hover:border-[var(--line-strong)] hover:text-[var(--foreground)]"
          title="Copy"
        >
          {copied ? <span className="text-[var(--accent)]">Copied</span> : "⧉"}
        </button>
      </div>
      <div className="mt-1 break-words text-sm text-[var(--foreground)]">{value}</div>
    </div>
  );
}