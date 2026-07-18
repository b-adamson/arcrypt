import Link from "next/link";

export const metadata = {
  title: "Risk Disclaimer | ARCRYPT",
};

export default function DisclaimerPage() {
  return (
    <main className="page-shell min-h-screen">
      <div className="mx-auto max-w-3xl px-6 py-24 md:py-32">
        <Link href="/" className="text-xs uppercase tracking-[0.3em] text-[var(--muted)] hover:text-[var(--foreground)]">
          &larr; Back
        </Link>

        <h1 className="mt-6 text-4xl font-black tracking-tight text-[var(--foreground)] md:text-5xl">
          Risk disclaimer
        </h1>

        <div className="mt-10 space-y-6 text-base leading-7 text-[var(--muted)]">
          <p>
            ARCRYPT is experimental, unaudited alpha software deployed on Solana devnet. It has not been
            audited by a third party, and no representation is made about its security, reliability, or
            fitness for any purpose.
          </p>
          <p>
            Nothing on this site is financial advice, and nothing here is an offer or solicitation to buy,
            sell, or bid on any asset. Auction mechanics, pricing, and settlement described on this site are
            illustrative of how the protocol works, not investment recommendations.
          </p>
          <p>
            Smart contracts, cryptographic circuits, and multi-party computation (MPC) networks can contain
            bugs, and interacting with them carries the risk of total, irreversible loss of funds. This
            includes but is not limited to bugs in the Anchor program, the Arcis circuits, the Umbra
            integration, or the underlying Solana or Arcium networks themselves.
          </p>
          <p>
            Do not bid, deposit, or otherwise interact with this protocol using funds you cannot afford to
            lose. You are solely responsible for evaluating the risks of using experimental software before
            you use it.
          </p>
          <p>
            This protocol is currently in alpha and is expected to change, break, or be redeployed without
            notice as it moves toward a mainnet release. Devnet balances, auctions, and state may be reset
            at any time.
          </p>
        </div>
      </div>
    </main>
  );
}
