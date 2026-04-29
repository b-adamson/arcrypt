"use client";

type Props = {
  bidAmountSol: string;
  bidPriceSol?: string; // NEW
  auctionType: string;  // NEW
  disabled?: boolean;
  isSubmitting?: boolean;
  auctionEnded?: boolean;
  onBidAmountSolChange: (value: string) => void;
  onBidPriceSolChange?: (value: string) => void;
  onSubmit: () => void;
};

export default function AuctionBidForm({
  bidAmountSol,
  disabled,
  isSubmitting,
  auctionEnded,
  onBidAmountSolChange,
  onBidPriceSolChange,
  onSubmit,
  auctionType,
  bidPriceSol,
}: Props) {
  return (
    
    <section className="mt-6 overflow-hidden rounded-[24px] border border-white/10 bg-white/[0.04] p-6 shadow-[0_20px_70px_rgba(0,0,0,0.35)] backdrop-blur-xl">
      <div className="mb-5">
        <h3 className="text-lg font-semibold text-white">Place bid</h3>
        <p className="mt-1 text-sm text-white/45">
          Your bid is securely encrypted before being sent on-chain.
        </p>
      </div>
      

      <div className="grid gap-4 md:grid-cols-[1fr_1fr_auto]">
        <label className="block">
          <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-white/35">
            Bid amount (SOL)
          </span>
          <input
            type="number"
            step="0.000000001"
            value={bidAmountSol}
            min={0}
            onChange={(e) => onBidAmountSolChange(e.target.value)}
            className="w-full rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-white/20"
          />
          
        </label>
        {auctionType === "uniform" && (
  <label className="block">
    <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-white/35">
      Max price per unit (SOL)
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
    </section>
  );
}