'use client';

import { useEffect, useRef, useState, type MouseEvent } from "react";
import Link from "next/link";

const flowSteps = [
  {
    id: "fund",
    title: "Use and fund an UMBRA ETA",
    eyebrow: "1 · Fund",
    description:
      "ARCRYPT generates an UMBRA encrypted token account for every user. You can freely move tokens in and out while concealing the funds you actually use to bid from on-chain observers.",
    stat: "Private balance layer",
  },
  {
    id: "bid",
    title: "Place a bid",
    eyebrow: "2 · Bid",
    description:
      "ARCRYPT places your funds inside the UMBRA shielded pool, where nobody can see them. Your escrow and bid stay concealed from public Solana ledgers, so no one knows how much you are willing to spend.",
    stat: "Hidden escrow",
  },
  {
    id: "wait",
    title: "Wait",
    eyebrow: "3 · Process",
    description:
      "UMBRA submits your bid as encrypted ciphertext to the ARCRYPT program, which is processed through Arcium's MPC network. We compare every bid inside a mixed execution environment using thousands of Arcium nodes, so no individual can piece together any bids or computation.",
    stat: "Encrypted MPC",
  },
  {
    id: "win",
    title: "Win!",
    eyebrow: "4 · Settle",
    description:
      "When the auction ends, the winner is revealed publicly (or not - configurable) and can claim the reward. The winning bid amount stays hidden and is never shared (unless you choose to share it).",
    stat: "Winner public, amount private",
  },
  {
    id: "create",
    title: "Make an auction",
    eyebrow: "5 · Launch",
    description:
      "Create highest-bid, Vickrey, uniform, or pro-rata auctions with the ARCRYPT program. Auction SPL tokens, NFTs, or use DAO treasury mode to create a governance proposal, then post it on the ARCRYPT marketplace or launch with your own program using the SDK.",
    stat: "Multi-format auctions",
  },
] as const;

export default function HomePage() {
  const panelsRef = useRef<HTMLElement | null>(null);
  const howItWorksRef = useRef<HTMLElement | null>(null);
  const [showTitle, setShowTitle] = useState(false);
  const [activeStep, setActiveStep] = useState(0);

  const activeDetailRef = useRef<HTMLDivElement | null>(null);

useEffect(() => {
  if (window.innerWidth < 1024) {
    activeDetailRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  }
}, [activeStep]);

  useEffect(() => {
    const t = setTimeout(() => setShowTitle(true), 200);
    return () => clearTimeout(t);
  }, []);

  function scrollToPanels(e?: MouseEvent<HTMLAnchorElement>) {
    e?.preventDefault();
    panelsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function scrollToHowItWorks(e?: MouseEvent<HTMLAnchorElement>) {
    e?.preventDefault();

    if (!howItWorksRef.current) return;

    const yOffset = -60;
    const y =
      howItWorksRef.current.getBoundingClientRect().top +
      window.pageYOffset +
      yOffset;

    window.scrollTo({ top: y, behavior: "smooth" });
  }

  const active = flowSteps[activeStep];

  return (
    <main className="page-shell min-h-[100svh] overflow-hidden">
      <section className="page-section relative isolate flex h-[100svh] w-full items-center justify-center">
        <div className="absolute inset-0 z-0 overflow-hidden">
<video
  autoPlay
  muted
  loop
  playsInline
  className="h-full w-full object-cover brightness-75 contrast-125"
>
  <source src="/backdrop.mp4" type="video/mp4" />
</video>

  <div className="absolute inset-0 bg-black/50" />
</div>

        <div className="relative z-10 mx-auto flex max-w-4xl flex-col items-center px-6 text-center">
          <h1
            className={`hero-title text-6xl font-extrabold leading-tight tracking-tight transition-all duration-700 md:text-8xl lg:text-9xl ${
              showTitle ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0"
            }`}
            style={{ fontFamily: "Arial, Helvetica, sans-serif" }}
          >
            ARCRYPT
          </h1>

          <p className="hero-copy mt-6 max-w-2xl text-lg md:text-xl">
            Private, sealed-bid auctions powered by Arcium on Solana. Selling DAO treasuries, NFTs
            and more with full encryption.
          </p>

          <div className="mt-8 flex flex-col justify-center gap-3 sm:flex-row">
            <a href="/docs" className="btn">
              Read docs
            </a>

            <a href="#how-it-works" onClick={scrollToHowItWorks} className="btn btn-primary">
              See how it works
            </a>

            <a href="#get-started" onClick={scrollToPanels} className="btn">
              Get started
            </a>
          </div>

          <p className="mt-8 text-sm text-[var(--muted)] text-center">
            🧩 Deployed on Solana devnet
          </p>
        </div>
      </section>

      <section
        id="how-it-works"
        ref={howItWorksRef}
        className="page-section relative overflow-hidden py-16 md:py-20"
        aria-label="How it works flow"
      >
        <div className="relative mx-auto max-w-7xl px-6">
          <div className="max-w-3xl">
            <p className="text-xs uppercase tracking-[0.35em] text-[var(--muted)]">
              How it works
            </p>
            <h2 className="mt-3 text-3xl font-black tracking-tight text-[var(--foreground)] md:text-5xl">
              Private auctions, private bids and private settlement on Solana
            </h2>
            <p className="mt-3 max-w-2xl text-sm text-[var(--muted)] md:text-base">
              Step through the flow to see how ARCRYPT uses UMBRA and Arcium to keep funds and bid
              amounts hidden while the auction still resolves on-chain.
            </p>
          </div>

          <div className="mt-8 grid gap-5 lg:grid-cols-[0.95fr_1.05fr] items-stretch">
            <div className="surface p-3 md:p-4">
              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-5">
                {flowSteps.map((step, index) => {
                  const isActive = index === activeStep;
                  const isDone = index < activeStep;

                  return (
                    <button
                      key={step.id}
                      type="button"
                      onClick={() => setActiveStep(index)}
                      className={`group relative border p-3 text-left transition duration-300 ${
                        isActive ? "card-active" : "surface surface-hover"
                      }`}
                    >
                      <div
                        className={`absolute inset-x-3 top-0 h-px ${
                          isActive || isDone ? "bg-accent" : "bg-[var(--line)]"
                        }`}
                      />

                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <div className="text-[10px] uppercase tracking-[0.3em] text-[var(--muted)]">
                            {step.eyebrow}
                          </div>
                          <div className="mt-1 text-xs font-semibold leading-snug text-[var(--foreground)] group-hover:text-white">
                            {step.title}
                          </div>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div
  ref={activeDetailRef}
  className="mt-4 border border-[var(--line)] bg-[var(--background)] p-4 md:p-5"
>
                <div className="badge-accent">{active.stat}</div>

                <h3 className="mt-3 text-2xl font-black tracking-tight text-[var(--foreground)] md:text-3xl">
                  {active.title}
                </h3>

                <p className="mt-2 text-sm leading-6 text-[var(--muted)]">
                  {active.description}
                </p>

                <div className="mt-4 grid gap-2 sm:grid-cols-3">
                  <div className="card p-3">
                    <div className="text-[10px] uppercase tracking-[0.25em] text-[var(--muted)]">
                      Privacy
                    </div>
                    <div className="mt-1 text-sm text-[var(--foreground)]">
                      Funds and bids stay shielded.
                    </div>
                  </div>
                  <div className="card p-3">
                    <div className="text-[10px] uppercase tracking-[0.25em] text-[var(--muted)]">
                      Execution
                    </div>
                    <div className="mt-1 text-sm text-[var(--foreground)]">
                      Arcium processes ciphertext.
                    </div>
                  </div>
                  <div className="card p-3">
                    <div className="text-[10px] uppercase tracking-[0.25em] text-[var(--muted)]">
                      Outcome
                    </div>
                    <div className="mt-1 text-sm text-[var(--foreground)]">
                      Winner visible, amount hidden.
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="surface p-5 md:p-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">
                    Flow map
                  </p>
                  <h3 className="mt-1 text-xl font-bold text-[var(--foreground)] md:text-2xl">
                    Click to move through the flow
                  </h3>
                </div>
                <div className="badge">
                  {activeStep + 1}/{flowSteps.length}
                </div>
              </div>

              <div className="mt-5 grid gap-3">
                {flowSteps.map((step, index) => {
                  const isActive = index === activeStep;
                  const isBefore = index < activeStep;

                  return (
                    <button
                      key={step.id}
                      type="button"
                      onClick={() => setActiveStep(index)}
                      className={`group relative overflow-hidden border p-4 text-left transition duration-300 ${
                        isActive ? "card-active" : "surface surface-hover"
                      }`}
                    >
                      <div
                        className={`absolute inset-0 ${
                          isActive ? "bg-[var(--accent)] opacity-[0.06]" : "bg-transparent"
                        }`}
                      />

                      <div className="relative flex flex-col gap-3 md:flex-row md:items-center">
                        <div className="flex min-w-0 items-center gap-3">
                          <div
                            className={`flex h-12 w-12 shrink-0 items-center justify-center border text-base font-black ${
                              isActive
                                ? "bg-accent text-black"
                                : isBefore
                                  ? "border-[var(--accent)] bg-[var(--accent)] text-black"
                                  : "border-[var(--line)] bg-[var(--background)] text-[var(--muted)]"
                            }`}
                          >
                            {index + 1}
                          </div>
                          <div className="min-w-0">
                            <div className="text-[10px] uppercase tracking-[0.3em] text-[var(--muted)]">
                              {step.eyebrow}
                            </div>
                            <div className="mt-1 text-base font-semibold text-[var(--foreground)]">
                              {step.title}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-3 text-xs text-[var(--muted)] md:ml-auto">
                          <div
                            className={`h-2.5 w-2.5 ${
                              isActive || isBefore ? "bg-accent" : "bg-[var(--surface-3)]"
                            }`}
                          />
                          <span>
                            {isActive ? "Selected" : isBefore ? "Completed" : "Preview"}
                          </span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

<div className="sticky bottom-4 z-20 mt-5 flex flex-col gap-3 rounded-2xl border border-[var(--line)] bg-[var(--background)]/95 p-3 shadow-lg backdrop-blur sm:flex-row lg:static lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none lg:backdrop-blur-0">
  <button
    type="button"
    onClick={() => setActiveStep((s) => (s + 1) % flowSteps.length)}
    className="btn btn-primary w-full sm:w-auto"
  >
    Next step
  </button>
  <a href="#get-started" onClick={scrollToPanels} className="btn w-full sm:w-auto">
    Get started
  </a>
</div>
            </div>
          </div>
        </div>
      </section>

      <section
        id="get-started"
        ref={panelsRef}
        className="page-section py-20"
        aria-label="Get started panels"
      >
        <div className="mx-auto max-w-7xl px-6">
          <h2 className="mb-8 text-3xl font-bold text-[var(--foreground)]">
            Get started — pick an option
          </h2>

          <div className="w-full overflow-x-auto">
            <div className="grid min-w-full grid-cols-1 gap-6 md:grid-cols-3">
              <Link href="/auction" className="block h-full">
                <article className="card surface-hover flex h-full min-h-[320px] flex-col justify-between p-8 transition">
                  <div>
                    <div className="text-sm font-medium uppercase tracking-wide text-[var(--muted)]">
                      Create Sealed Auction
                    </div>
                    <h3 className="mt-4 text-2xl font-extrabold tracking-tight text-[var(--foreground)]">
                      Make a sealed auction and share the link
                    </h3>

                    <p className="mt-4 text-sm text-[var(--muted)]">
                      Launch your item on the public ARCRYPT marketplace, or get a private but
                      shareable link.
                    </p>

                    <div className="mt-4 border border-[var(--line)] bg-[var(--background)] p-3 text-xs text-[var(--foreground)]">
                      <div className="font-medium">Example shareable link (mock):</div>
                      <div className="mt-1 break-all text-sm text-[var(--accent)]">
                        https://arcrypt.bid/bid?auctionPk=abcxyz
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 text-xs text-[var(--muted)]" />
                </article>
              </Link>

              <Link href="/auction?panel=governance" className="block h-full">
                <article className="card surface-hover flex h-full flex-col justify-between p-8 transition">
                  <div>
                    <div className="text-sm font-medium uppercase tracking-wide text-[var(--muted)]">
                      DAO / Realms integration
                    </div>
                    <h3 className="mt-4 text-2xl font-extrabold tracking-tight text-[var(--foreground)]">
                      Prepare a governance proposal payload
                    </h3>

                    <p className="mt-4 text-sm text-[var(--muted)]">
                      Generate a sealed-auction instruction bundle that can be inserted into Realms
                      or another DAO governance flow. Auction SPL tokens in the treasury.
                    </p>

<div className="mt-4 border border-[var(--line)] bg-[var(--background)] p-4 text-xs text-[var(--accent)]">
  <pre
    className="whitespace-pre-wrap break-all leading-relaxed"
    style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace" }}
    aria-hidden="true"
  >
{`AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8gISIjJCUmJygpKissLS4vMDEyMzQ1Njc4OTo7PD0+Pw==`}
  </pre>
</div>
                  </div>

                  <div className="mt-6 text-xs text-[var(--muted)]" />
                </article>
              </Link>

              <Link href="/docs#developers" className="block h-full">
                <article className="card surface-hover flex h-full flex-col justify-between p-8 transition">
                  <div>
                    <div className="text-sm font-medium uppercase tracking-wide text-[var(--muted)]">
                      Build with our SDK
                    </div>
                    <h3 className="mt-4 text-2xl font-extrabold tracking-tight text-[var(--foreground)]">
                      Use encrypted auctions in your app
                    </h3>

                    <p className="mt-4 text-sm text-[var(--muted)]">
                      Integrate ARCRYPT SDKs to add sealed-bid auctions to lending protocols, DAO
                      launchpads, marketplaces, and more.
                    </p>

<div className="mt-4 border border-[var(--line)] bg-[var(--background)] p-4 text-xs text-[var(--accent)]">
  <pre
    className="whitespace-pre-wrap break-all leading-relaxed"
    style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace" }}
    aria-hidden="true"
  >
{`npm install @arcrypt/sdk

cargo install arcrypt-sdk`}
  </pre>
</div>
                  </div>

                  <div className="mt-6 text-xs text-[var(--muted)]">
                    <div className="italic">
                      Example use cases: lending protocols, DAO launchpads, treasury tooling, and
                      auction-based DeFi apps.
                    </div>
                  </div>
                </article>
              </Link>

              <article className="card surface-hover flex h-full flex-col justify-between p-8 transition">
                <div>
                  <div className="text-sm font-medium uppercase tracking-wide text-[var(--muted)]">
                    Create Sealed Auction DAO
                  </div>
                  <h3 className="mt-4 text-2xl font-extrabold tracking-tight text-[var(--foreground)]">
                    (Coming Soon)
                  </h3>

                  <p className="mt-4 text-sm text-[var(--muted)]">
                    Launch a DAO that tokenizes part of the treasury token pool for auction. Raise
                    capital for your startup using sealed bids.
                  </p>
                </div>

                <div className="mt-6 text-xs text-[var(--muted)]">
                  <div className="italic">Status: UI only — no live functionality.</div>
                </div>
              </article>
            </div>
          </div>
        </div>
      </section>
    </main>
  );
}