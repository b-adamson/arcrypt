"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { address as toAddress } from "@solana/kit";
import {
  getUserAccountQuerierFunction,
  getEncryptedBalanceQuerierFunction,
} from "@umbra-privacy/sdk";
import {
  isEncryptedDepositError,
  isEncryptedWithdrawalError,
} from "@umbra-privacy/sdk/errors";
import { useUmbraClient } from "@/lib/useUmbraClient";
import { RefreshCw } from "lucide-react";
import {
  fetchJson,
  formatTokenAmount,
  toHttpGateway,
} from "@/lib/utils";

type AuctionMetadata = {
  name?: string;
  symbol?: string;
  description?: string;
  image?: string;
};

type Props = {
  refreshKey?: number;
  auctionData: any | null;
  bidTokens: string;
  bidPriceUsdc: string;
  onBidTokensChange: (value: string) => void;
  onBidPriceUsdcChange: (value: string) => void;
  bidAmountUsdc: string;
  onBidAmountUsdcChange: (value: string) => void;
  auctionType: string;
  disabled?: boolean;
  isSubmitting?: boolean;
  auctionEnded?: boolean;
  onSubmit: () => void;
};

const DEVNET_USDC_MINT = toAddress("4oG4sjmopf5MzvTHLE8rpVJ2uyczxfsw2K84SUTpNDx7");
const UMBRA_PAGE_URL = "/umbra";

function toRawBigInt(input: string): bigint {
  const raw = input.trim();
  if (!raw) return 0n;
  try {
    return BigInt(raw);
  } catch {
    return 0n;
  }
}

export default function AuctionBidForm({
  refreshKey = 0,
  bidTokens,
  bidPriceUsdc,
  onBidTokensChange,
  onBidPriceUsdcChange,
  bidAmountUsdc,
  onBidAmountUsdcChange,
  auctionType,
  disabled,
  isSubmitting,
  auctionEnded,
  auctionData,
  onSubmit,
}: Props) {
  const wallet = useWallet();
  const { client, depositFn, withdrawFn } = useUmbraClient();

  const [registered, setRegistered] = useState<boolean | null>(null);
  const [balanceRaw, setBalanceRaw] = useState<bigint>(0n);
  const [amount, setAmount] = useState(bidAmountUsdc || "1");
  const [querying, setQuerying] = useState(false);
  const [depositing, setDepositing] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [metadata, setMetadata] = useState<AuctionMetadata | null>(null);

// function toStringMaybe(v: any): string {
//   if (v == null) return "";
//   return v?.toString?.() ?? String(v);
// }

// function getMetadataUri(auction: any): string {
//   const raw =
//     auction?.auctionMetadataUri ??
//     auction?.auction_metadata_uri ??
//     auction?.metadataUri ??
//     auction?.metadata_uri ??
//     auction?.uri ??
//     auction?.metadata?.uri ??
//     "";

//   return toStringMaybe(raw);
// }

// function toHttpGateway(uri: string): string {
//   if (!uri) return "";
//   if (uri.startsWith("ipfs://")) return uri.replace("ipfs://", "https://ipfs.io/ipfs/");
//   return uri;
// }

const metadataUri =
  auctionData?.auctionMetadataUri ??
  auctionData?.auction_metadata_uri ??
  auctionData?.metadataUri ??
  auctionData?.metadata_uri ??
  auctionData?.uri ??
  auctionData?.metadata?.uri ??
  "";

const metadataHttpUri = toHttpGateway(String(metadataUri ?? ""));

useEffect(() => {
  let cancelled = false;

  async function loadMetadata() {
    const json = await fetchJson(metadataHttpUri);

    if (cancelled) return;

    if (!json) {
      setMetadata(null);
      return;
    }

    setMetadata({
      name: json?.name ?? "",
      symbol: json?.symbol ?? "",
      description: json?.description ?? "",
      image: json?.image ?? "",
    });
  }

  void loadMetadata();

  return () => {
    cancelled = true;
  };
}, [metadataHttpUri]);

const tokenLabel =
  metadata?.symbol && metadata.symbol.trim().length > 0
    ? metadata.symbol.toUpperCase()
    : "TOKENS";

  useEffect(() => {
    setAmount(bidAmountUsdc || "1");
  }, [bidAmountUsdc]);

  useEffect(() => {
    void wallet.publicKey?.toBase58();
  }, [wallet.publicKey]);

  const userAccountQuery = useMemo(() => {
    if (!client) return null;
    return getUserAccountQuerierFunction({ client });
  }, [client]);

  const encryptedBalanceQuery = useMemo(() => {
    if (!client) return null;
    return getEncryptedBalanceQuerierFunction({ client });
  }, [client]);

  const refresh = useCallback(async () => {
    if (!client || !userAccountQuery || !encryptedBalanceQuery) return;

    setQuerying(true);
    try {
      const acc = await userAccountQuery(client.signer.address);

      if (acc.state !== "exists" || !acc.data.isInitialised) {
        setRegistered(false);
        setBalanceRaw(0n);
        return;
      }

      setRegistered(true);

      const res = await encryptedBalanceQuery([DEVNET_USDC_MINT]);
      const r = res.get(DEVNET_USDC_MINT);

      if (r?.state === "shared") {
        setBalanceRaw(BigInt(r.balance.toString()));
      } else {
        setBalanceRaw(0n);
      }
    } finally {
      setQuerying(false);
    }
  }, [client, encryptedBalanceQuery, userAccountQuery]);

  useEffect(() => {
    void refresh();
  }, [refresh, refreshKey]);
  


  const isRegistered = registered === true;

  const amountRaw = useMemo(() => toRawBigInt(amount), [amount]);
  const withdrawTooLarge = amountRaw > balanceRaw;

  const bidCommitmentRaw = useMemo(() => {
    if (auctionType === "uniform") {
      const tokens = toRawBigInt(bidTokens);
      const price = toRawBigInt(bidPriceUsdc);
      return tokens * price;
    }

    return amountRaw;
  }, [auctionType, amountRaw, bidTokens, bidPriceUsdc]);

  const bidTooLarge = bidCommitmentRaw > balanceRaw;

  const handleAmountChange = useCallback(
    (value: string) => {
      setAmount(value);
      onBidAmountUsdcChange(value);
    },
    [onBidAmountUsdcChange]
  );

    const placeBidButton = (
  <button
    onClick={onSubmit}
    disabled={
      disabled ||
      isSubmitting ||
      auctionEnded ||
      !isRegistered ||
      bidTooLarge
    }
    className="shrink-0 rounded-lg border border-green-500 bg-green-500 px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-black transition-all duration-300 hover:scale-105 disabled:cursor-not-allowed disabled:opacity-50"
  >
    {isSubmitting
      ? "Submitting..."
      : auctionEnded
      ? "Auction ended"
      : bidTooLarge
      ? "Too much"
      : "Place Bid"}
  </button>
);

  const handleDeposit = useCallback(async () => {
    if (!client || !depositFn || !isRegistered || depositing) return;

    const amt = toRawBigInt(amount);
    if (amt <= 0n) return;

    setDepositing(true);
    try {
      await depositFn(client.signer.address, DEVNET_USDC_MINT, amt as any, {
        accountInfoCommitment: "confirmed",
      });
      await refresh();
    } catch (error: any) {
      console.error("Deposit failed:", error);
      if (isEncryptedDepositError(error)) {
        console.error(`Deposit failed at ${error.stage}: ${error.message}`);
      }
    } finally {
      setDepositing(false);
    }
  }, [amount, client, depositFn, depositing, isRegistered, refresh]);

  const handleWithdraw = useCallback(async () => {
    if (!client || !withdrawFn || !isRegistered || withdrawing) return;

    const amt = toRawBigInt(amount);
    if (amt <= 0n) return;
    if (amt > balanceRaw) return;

    setWithdrawing(true);
    try {
      await withdrawFn(client.signer.address, DEVNET_USDC_MINT, amt as any, {
        accountInfoCommitment: "confirmed",
      });
      await refresh();
    } catch (error: any) {
      console.error("Withdraw failed:", error);
      if (isEncryptedWithdrawalError(error)) {
        console.error(`Withdraw failed at ${error.stage}: ${error.message}`);
      }
    } finally {
      setWithdrawing(false);
    }
  }, [amount, balanceRaw, client, isRegistered, refresh, withdrawing, withdrawFn]);

  return (
    <section className="mt-6 overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3">
      <div className="flex w-full items-center gap-4">
        <div className="shrink-0 min-w-[4rem]">
            <div className="flex items-center gap-2">
              <div className="text-[10px] font-semibold uppercase tracking-[0.24em] opacity-60">
                Encrypted Balance
              </div>

              <button
                type="button"
                onClick={() => void refresh()}
                disabled={querying}
                aria-label="Refresh encrypted balance"
                className="inline-flex h-6 w-6 items-center justify-center rounded-full border border-[var(--line)] bg-[var(--surface-2)] text-[var(--foreground)] transition hover:scale-105 disabled:cursor-not-allowed disabled:opacity-50"
                title="Refresh"
              >
                <RefreshCw className={`h-3.5 w-3.5 ${querying ? "animate-spin" : ""}`} />
              </button>
            </div>
              <div className="mt-1 flex items-baseline gap-2 text-4xl font-semibold leading-none md:text-5xl">
                {querying ? (
                  "…"
                ) : (
                  <>
                    <span>{balanceRaw.toString()}</span>
                    <span className="text-2xl font-medium opacity-70">USDC</span>
                  </>
                )}
              </div>
          </div>

                  <div className="flex flex-1 min-w-0 flex-col gap-2">
                  <div className="flex w-full gap-2">
            <div
              className={`flex min-w-0 flex-1 items-center rounded-xl border border-[var(--line)] px-3 py-2 ${
                !isRegistered ? "opacity-50" : ""
              }`}
            >
              <input
                value={amount}
                onChange={(e) => handleAmountChange(e.target.value)}
                disabled={!isRegistered}
                inputMode="numeric"
                placeholder="Amount"
                className="w-full min-w-0 flex-1 bg-transparent text-sm outline-none disabled:cursor-not-allowed"
              />

              <span className="ml-2 shrink-0 text-xs font-semibold uppercase tracking-[0.14em] opacity-60">
                USDC
              </span>
            </div>

            <button
              onClick={handleDeposit}
              disabled={!isRegistered || depositing}
              className="shrink-0 rounded-lg border border-black bg-black px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-white transition-all duration-300 hover:scale-105 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {depositing ? "Depositing" : "Deposit"}
            </button>

            <button
              onClick={handleWithdraw}
              disabled={!isRegistered || withdrawing || withdrawTooLarge}
              className="shrink-0 rounded-lg border border-black bg-black px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-white transition-all duration-300 hover:scale-105 disabled:cursor-not-allowed disabled:opacity-50"
            >
              {withdrawing ? "Withdrawing" : withdrawTooLarge ? "Too much" : "Withdraw"}
            </button>

            {auctionType !== "uniform" && placeBidButton}
          </div>

          {!isRegistered && (
            <div className="text-xs text-[var(--muted)]">
              Not registered. Go to{" "}
              <a className="underline" href={UMBRA_PAGE_URL}>
                Balance
              </a>{" "}
              to register first.
            </div>
          )}
        </div>
      </div>

  {auctionType === "uniform" && (
  <div className="mt-6 border border-[var(--line)] bg-[var(--background)] p-4">
    <div className="grid gap-4 md:grid-cols-[1fr_1fr]">
        <label className="block">
          <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
            Tokens desired
          </span>

          <div className="flex items-center rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3">
            <input
              type="number"
              step="1"
              value={bidTokens}
              min={0}
              onChange={(e) => onBidTokensChange(e.target.value)}
              className="w-full bg-transparent text-sm text-[var(--foreground)] outline-none"
            />

            <span className="ml-2 shrink-0 text-xs font-semibold uppercase tracking-[0.14em] opacity-60">
              {tokenLabel}
            </span>
          </div>
        </label>
        <label className="block">
          <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-[var(--muted)]">
            Max price per token
          </span>

          <div className="flex items-center rounded-xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3">
            <input
              type="number"
              step="1"
              value={bidPriceUsdc}
              min={0}
              onChange={(e) => onBidPriceUsdcChange(e.target.value)}
              className="w-full bg-transparent text-sm text-[var(--foreground)] outline-none"
            />

            <span className="ml-2 shrink-0 text-xs font-semibold uppercase tracking-[0.14em] opacity-60">
              USDC / {tokenLabel}
            </span>
          </div>
        </label>
    </div>

    <div className="mt-4 rounded-xl border border-[var(--line)] bg-[var(--surface-2)] p-4">
      <div className="flex items-baseline justify-between gap-3">
        <span className="text-base font-semibold text-[var(--foreground)]">
          Total Commitment
        </span>
        <span className="text-2xl font-bold text-[var(--foreground)]">
          {bidCommitmentRaw.toString()} USDC
        </span>
      </div>

      <div className="mt-2 text-xs text-[var(--muted)]">
        {bidTokens || "0"} tokens × {bidPriceUsdc || "0"} USDC
      </div>

      {bidTooLarge && (
        <div className="mt-2 text-xs text-red-500">
          Commitment is above your encrypted balance.
        </div>
      )}
    </div>

    <div className="mt-4 flex justify-end">
      {placeBidButton}
    </div>
  </div>
)}
    </section>
  );
}