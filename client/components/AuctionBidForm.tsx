"use client";

type Props = {
  bidAmountSol: string;
  bidNonceHex: string | null;
  disabled?: boolean;
  onBidAmountSolChange: (value: string) => void;
  onBidNonceHexChange: (value: string | null) => void;
  onSubmit: () => void;
};

export default function AuctionBidForm({
  bidAmountSol,
  bidNonceHex,
  disabled,
  onBidAmountSolChange,
  onBidNonceHexChange,
  onSubmit,
}: Props) {
  return (
    <section className="mt-6 overflow-hidden rounded-[24px] border border-white/10 bg-white/[0.04] p-6 shadow-[0_20px_70px_rgba(0,0,0,0.35)] backdrop-blur-xl">
      <div className="mb-5">
        <h3 className="text-lg font-semibold text-white">Place bid</h3>
        <p className="mt-1 text-sm text-white/45">
          The server encrypts your bid inputs before the on-chain transaction is sent.
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

        <label className="block">
          <span className="mb-2 block text-xs font-semibold uppercase tracking-[0.18em] text-white/35">
            Nonce (optional hex)
          </span>
          <input
            placeholder="random hex optional"
            value={bidNonceHex ?? ""}
            onChange={(e) => onBidNonceHexChange(e.target.value || null)}
            className="w-full rounded-xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white outline-none transition placeholder:text-white/25 focus:border-white/20"
          />
        </label>

        <div className="flex items-end">
          <button
            onClick={onSubmit}
            disabled={disabled}
            className="w-full rounded-xl border border-white/10 bg-white/10 px-5 py-3 text-sm font-semibold text-white transition hover:bg-white/15 disabled:cursor-not-allowed disabled:opacity-50 md:w-auto"
          >
            Place bid
          </button>
        </div>
      </div>
    </section>
  );
}