"use client";

import { isUiamountToAmountInstruction } from "@solana/spl-token";

type Props = {
  // uniform
  bidTokens: string;
  bidPriceSol?: string;
  onBidTokensChange: (value: string) => void;
  onBidPriceSolChange?: (value: string) => void;

  // single-winner
  bidAmountSol?: string;
  onBidAmountSolChange?: (value: string) => void;

  auctionType: string;
  disabled?: boolean;
  isSubmitting?: boolean;
  auctionEnded?: boolean;
  onSubmit: () => void;
};

export default function AuctionBidForm({
  bidTokens,
  bidPriceSol,
  onBidTokensChange,
  onBidPriceSolChange,

  bidAmountSol,
  onBidAmountSolChange,

  auctionType,
  disabled,
  isSubmitting,
  auctionEnded,
  onSubmit,
}: Props) {
  const isUniform = auctionType === "uniform";

  const totalSol =
    Number(bidTokens || 0) * Number(bidPriceSol || 0);

  return (
    <section className="mt-6 overflow-hidden rounded-[24px] border border-white/10 bg-white/[0.04] p-6 shadow-[0_20px_70px_rgba(0,0,0,0.35)] backdrop-blur-xl">
      <div className="mb-5">
        <h3 className="text-lg font-semibold text-white">Place bid</h3>
        <p className="mt-1 text-sm text-white/45">
          Your bid is securely encrypted before being sent on-chain.
        </p>
      </div>

      <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto]">

        {isUniform && (
          <>
            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-white/35">
                Tokens desired
              </span>
              <input
                type="number"
                step="1"
                value={bidTokens}
                min={0}
                onChange={(e) => onBidTokensChange(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white"
              />
            </label>

            <label className="block">
              <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-white/35">
                Max price per token (SOL)
              </span>
              <input
                type="number"
                step="0.000000001"
                value={bidPriceSol ?? ""}
                min={0}
                onChange={(e) => onBidPriceSolChange?.(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white"
              />
            </label>
          </>
        )}

        {!isUniform && (
          <label className="block">
            <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-white/35">
              Bid amount (SOL)
            </span>
            <input
              type="number"
              step="0.000000001"
              value={bidAmountSol ?? ""}
              min={0}
              onChange={(e) => onBidAmountSolChange?.(e.target.value)}
              className="w-full rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white"
            />
          </label>
        )}

        <div className="flex items-end">
          <button
            onClick={onSubmit}
            disabled={disabled}
            className="btn btn-primary w-full md:w-auto"
          >
            {isSubmitting
              ? "Submitting..."
              : auctionEnded
              ? "Auction ended"
              : "Place bid"}
          </button>
        </div>
      </div>

      {isUniform && (
        <div className="mt-6 rounded-xl border border-white/10 bg-black/30 p-4">
          <div className="flex items-baseline justify-between">
            <span className="text-base font-semibold text-white">
              Total Commitment
            </span>
            <span className="text-2xl font-bold text-white">
              {isNaN(totalSol) ? "0" : totalSol.toFixed(2)} SOL
            </span>
          </div>
          <div className="mt-2 text-xs text-white/40">
            {bidTokens || "0"} tokens × {bidPriceSol || "0"} SOL
          </div>
        </div>
      )}
    </section>
  );
}