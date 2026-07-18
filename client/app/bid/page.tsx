import Link from "next/link";

export default function Page() {
  return (
    <main className="page-shell flex min-h-screen items-center justify-center px-6">
      <div className="max-w-md text-center">
        <div className="badge-accent mx-auto inline-flex text-[10px] uppercase tracking-[0.2em]">Alpha</div>
        <h1 className="mt-6 text-3xl font-black tracking-tight text-[var(--foreground)]">
          This auction view isn&rsquo;t public yet
        </h1>
        <p className="mt-4 text-sm leading-6 text-[var(--muted)]">
          Live bidding is gated during alpha. Read how sealed bids work in the docs, or come back once
          auctions open up.
        </p>
        <Link href="/docs" className="btn btn-primary mt-8 inline-flex text-sm font-semibold uppercase tracking-[0.2em]">
          Read the docs
        </Link>
      </div>
    </main>
  );
}
