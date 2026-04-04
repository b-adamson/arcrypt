'use client';

import { useEffect, useRef, useState, type MouseEvent } from "react";
import Link from "next/link";

const flowSteps = [
  {
    id: "fund",
    title: "Use and fund an UMBRA ETA",
    eyebrow: "1 · Fund",
    description:
      "ARCIBID generates an UMBRA encrypted token account for every user. You can freely move tokens in and out while concealing the funds you actually use to bid from on-chain observers.",
    accent: "from-[#ff2bd3] to-[#c14bff]",
    stat: "Private balance layer",
  },
  {
    id: "bid",
    title: "Place a bid",
    eyebrow: "2 · Bid",
    description:
      "ARCIBID places your funds inside the UMBRA shielded pool, where nobody can see them. Your escrow and bid stay concealed from public Solana ledgers, so no one knows how much you are willing to spend.",
    accent: "from-[#c14bff] to-[#4ec7ff]",
    stat: "Hidden escrow",
  },
  {
    id: "wait",
    title: "Wait",
    eyebrow: "3 · Process",
    description:
      "UMBRA submits your bid as encrypted ciphertext to the ARCIBID program, which is processed through Arcium's MPC network. We compare every bid inside a mixed execution environment using thousands of Arcium nodes, so no individual can piece together any bids or computation.",
    accent: "from-[#4ec7ff] to-[#7c3aed]",
    stat: "Encrypted MPC",
  },
  {
    id: "win",
    title: "Win!",
    eyebrow: "4 · Settle",
    description:
      "When the auction ends, the winner is revealed publicly (or not - configurable) and can claim the reward. The winning bid amount stays hidden and is never shared (unless you choose to share it).",
    accent: "from-[#7c3aed] to-[#ff2bd3]",
    stat: "Winner public, amount private",
  },
  {
    id: "create",
    title: "Make an auction",
    eyebrow: "5 · Launch",
    description:
      "Create highest-bid, Vickrey, uniform, or pro-rata auctions with the ARCIBID program. Auction SPL tokens, NFTs, or use DAO treasury mode to create a governance proposal, then post it on the ARCIBID marketplace or launch with your own program using the SDK.",
    accent: "from-[#ff2bd3] to-[#4ec7ff]",
    stat: "Multi-format auctions",
  },
] as const;

export default function HomePage() {
  console.log(process.env.NEXT_PUBLIC_RPC_URL);

  const videoRef = useRef<HTMLVideoElement | null>(null);
  const panelsRef = useRef<HTMLElement | null>(null);
  const howItWorksRef = useRef<HTMLElement | null>(null);
const [showTitle, setShowTitle] = useState(false);
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.playbackRate = 0.8;
    }
  }, []);

useEffect(() => {
  const t = setTimeout(() => setShowTitle(true), 200); // slight delay feels nicer
  return () => clearTimeout(t);
}, []);

  function scrollToPanels(e?: MouseEvent<HTMLAnchorElement>) {
    e?.preventDefault();
    panelsRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

function scrollToHowItWorks(e?: MouseEvent<HTMLAnchorElement>) {
  e?.preventDefault();

  if (!howItWorksRef.current) return;

  const yOffset = -60; // tweak this (negative = less scroll)
  const y =
    howItWorksRef.current.getBoundingClientRect().top +
    window.pageYOffset +
    yOffset;

  window.scrollTo({ top: y, behavior: "smooth" });
}

  const active = flowSteps[activeStep];

  return (
    <main className="relative isolate min-h-[100svh] overflow-hidden bg-[#05050a]">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(255,43,211,0.12),transparent_28%),radial-gradient(circle_at_top_right,rgba(78,199,255,0.10),transparent_26%),radial-gradient(circle_at_center,rgba(124,58,237,0.08),transparent_40%)]" />
        <div className="absolute inset-0 opacity-[0.08] bg-[linear-gradient(rgba(255,255,255,0.08)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.08)_1px,transparent_1px)] bg-[size:72px_72px]" />
        <div className="absolute inset-0 bg-gradient-to-b from-transparent via-black/10 to-black/50" />
      </div>

      <section className="relative isolate h-[100svh] w-full overflow-hidden bg-black flex items-center justify-center">
        <video
          ref={videoRef}
          autoPlay
          muted
          loop
          playsInline
          className="absolute inset-0 h-full w-full object-cover z-0 pointer-events-none"
          style={{ opacity: 0.2, transform: "scale(1.02)" }}
        >
          <source src="/backdrop.mp4" type="video/mp4" />
        </video>
        <div className="absolute inset-0 z-10 bg-black/10" />

        <div className="relative z-20 max-w-4xl mx-auto px-6 text-center flex flex-col items-center">
<h1
  className={`text-6xl md:text-8xl lg:text-9xl font-extrabold leading-tight tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-neutral-400 transition-all duration-700 ${
    showTitle ? "opacity-100 translate-y-0" : "opacity-0 translate-y-4"
  }`}
  style={{ fontFamily: "Arial, Helvetica, sans-serif" }}
>
  ARCIBID
</h1>

          <p className="mt-6 text-lg md:text-xl text-gray-400 max-w-2xl">
            Private, sealed-bid auctions powered by Arcium on Solana. Selling DAO treasuries, NFTs
            and more with full encryption.
          </p>

          <div className="mt-8 flex flex-col sm:flex-row gap-3 justify-center">
            <a
              href="/docs"
              className="inline-flex items-center justify-center border border-white/10 px-6 py-3 text-sm text-gray-200 hover:border-white/20 transition"
            >
              Read docs
            </a>

            <a
              href="#how-it-works"
              onClick={scrollToHowItWorks}
              className="inline-flex items-center justify-center bg-gradient-to-r from-[#ff2bd3] via-[#c14bff] to-[#4ec7ff] px-6 py-3 text-sm font-semibold text-black shadow-lg hover:opacity-95 transition cursor-pointer"
            >
              See how it works
            </a>

            <a
              href="#get-started"
              onClick={scrollToPanels}
              className="inline-flex items-center justify-center border border-white/10 px-6 py-3 text-sm text-gray-200 hover:border-white/20 transition"
            >
              Get started
            </a>
          </div>

          <p className="mt-8 text-sm text-gray-400 text-center">🧩 Deployed on Solana devnet</p>
        </div>
      </section>

      <section
        id="how-it-works"
        ref={howItWorksRef}
        className="relative py-16 md:py-18 overflow-hidden bg-[linear-gradient(180deg,#09090f_0%,#12081a_55%,#14091b_100%)]"
        aria-label="How it works flow"
      >
        <div aria-hidden className="absolute inset-0 pointer-events-none">
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/20 to-transparent" />
          <div className="absolute left-0 top-16 h-56 w-56 rounded-full bg-[#ff2bd3]/10 blur-3xl" />
          <div className="absolute right-0 bottom-10 h-64 w-64 rounded-full bg-[#4ec7ff]/10 blur-3xl" />
        </div>

        <div className="relative max-w-7xl mx-auto px-6">
          <div className="max-w-3xl">
            <p className="text-xs uppercase tracking-[0.35em] text-pink-200/70">How it works</p>
            <h2 className="mt-3 text-3xl md:text-5xl font-black tracking-tight text-white">
              Private auctions, private bids and private settlement on Solana
            </h2>
            <p className="mt-3 text-sm md:text-base text-gray-300 max-w-2xl">
              Step through the flow to see how ARCIBID uses UMBRA and Arcium to keep funds and bid
              amounts hidden while the auction still resolves on-chain.
            </p>
          </div>

          <div className="mt-8 grid gap-5 lg:grid-cols-[0.95fr_1.05fr] items-stretch">
            <div className="rounded-[1.6rem] border border-white/10 bg-white/5 p-3 md:p-4 shadow-2xl shadow-black/30 backdrop-blur-xl">
              <div className="grid grid-cols-1 sm:grid-cols-5 gap-2.5">
                {flowSteps.map((step, index) => {
                  const isActive = index === activeStep;
                  const isDone = index < activeStep;

                  return (
                    <button
                      key={step.id}
                      type="button"
                      onClick={() => setActiveStep(index)}
                      className={`group relative rounded-[1.2rem] border p-3 text-left transition duration-300 ${
                        isActive
                          ? "border-white/25 bg-white/12 shadow-lg shadow-black/20"
                          : "border-white/10 bg-black/20 hover:bg-white/8 hover:border-white/15"
                      }`}
                    >
                      <div
                        className={`absolute inset-x-3 top-0 h-px bg-gradient-to-r ${step.accent} opacity-${
                          isActive || isDone ? "100" : "30"
                        }`}
                      />
                      <div className="flex items-center justify-between gap-2">
                        <div>
                          <div className="text-[10px] uppercase tracking-[0.3em] text-white/45">
                            {step.eyebrow}
                          </div>
                          <div className="mt-1 text-xs font-semibold leading-snug text-white/85 group-hover:text-white">
                            {step.title}
                          </div>
                        </div>
                        {/* <div
                          className={`flex h-7 w-7 items-center justify-center rounded-full border text-[11px] font-bold transition ${
                            isActive
                              ? "border-white/30 bg-white text-black"
                              : isDone
                              ? "border-emerald-400/40 bg-emerald-400/15 text-emerald-200"
                              : "border-white/10 bg-white/5 text-white/45"
                          }`}
                        >
                          {index + 1}
                        </div> */}
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="mt-4 rounded-[1.35rem] border border-white/10 bg-black/35 p-4 md:p-5">
                <div className={`inline-flex rounded-full bg-gradient-to-r ${active.accent} p-[1px]`}>
                  <span className="rounded-full bg-black/85 px-3 py-1 text-[10px] font-semibold uppercase tracking-[0.25em] text-white/85">
                    {active.stat}
                  </span>
                </div>

                <h3 className="mt-3 text-2xl md:text-3xl font-black tracking-tight text-white">
                  {active.title}
                </h3>

                <p className="mt-2 text-sm leading-6 text-gray-300">
                  {active.description}
                </p>

                <div className="mt-4 grid gap-2 sm:grid-cols-3">
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                    <div className="text-[10px] uppercase tracking-[0.25em] text-white/45">Privacy</div>
                    <div className="mt-1 text-sm text-white/90">Funds and bids stay shielded.</div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                    <div className="text-[10px] uppercase tracking-[0.25em] text-white/45">Execution</div>
                    <div className="mt-1 text-sm text-white/90">Arcium processes ciphertext.</div>
                  </div>
                  <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
                    <div className="text-[10px] uppercase tracking-[0.25em] text-white/45">Outcome</div>
                    <div className="mt-1 text-sm text-white/90">Winner visible, amount hidden.</div>
                  </div>
                </div>
              </div>
            </div>

            <div className="rounded-[1.6rem] border border-white/10 bg-[radial-gradient(circle_at_top,rgba(255,255,255,0.12),transparent_34%),linear-gradient(180deg,rgba(10,10,16,0.92),rgba(6,6,10,0.96))] p-5 md:p-6 shadow-2xl shadow-black/30 backdrop-blur-xl">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <p className="text-xs uppercase tracking-[0.3em] text-white/45">Flow map</p>
                  <h3 className="mt-1 text-xl md:text-2xl font-bold text-white">Click to move through the flow</h3>
                </div>
                <div className="rounded-full border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/70">
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
                      className={`group relative overflow-hidden rounded-[1.2rem] border p-4 text-left transition duration-300 ${
                        isActive
                          ? "border-white/25 bg-white/10"
                          : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06] hover:border-white/15"
                      }`}
                    >
                      <div className={`absolute inset-0 bg-gradient-to-r ${step.accent} opacity-0 transition-opacity duration-300 ${isActive ? "opacity-12" : "group-hover:opacity-6"}`} />

                      <div className="relative flex flex-col md:flex-row md:items-center gap-3">
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl border text-base font-black ${
                              isActive
                                ? "border-white/25 bg-black text-white"
                                : isBefore
                                ? "border-emerald-400/25 bg-emerald-400/10 text-emerald-200"
                                : "border-white/10 bg-black/30 text-white/55"
                            }`}
                          >
                            {index + 1}
                          </div>
                          <div className="min-w-0">
                            <div className="text-[10px] uppercase tracking-[0.3em] text-white/45">
                              {step.eyebrow}
                            </div>
                            <div className="mt-1 text-base font-semibold text-white">
                              {step.title}
                            </div>
                          </div>
                        </div>

                        <div className="md:ml-auto flex items-center gap-3 text-xs text-white/70">
                          <div className={`h-2.5 w-2.5 rounded-full bg-gradient-to-r ${step.accent}`} />
                          <span>{isActive ? "Selected" : isBefore ? "Completed" : "Preview"}</span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>


              <div className="mt-5 flex flex-col sm:flex-row gap-3">
                <button
                  type="button"
                  onClick={() => setActiveStep((s) => (s + 1) % flowSteps.length)}
                  className="inline-flex items-center justify-center rounded-full bg-gradient-to-r from-[#ff2bd3] via-[#c14bff] to-[#4ec7ff] px-6 py-3 text-sm font-semibold text-black transition hover:opacity-90"
                >
                  Next step
                </button>
                <a
                  href="#get-started"
                  onClick={scrollToPanels}
                  className="inline-flex items-center justify-center rounded-full border border-white/10 px-6 py-3 text-sm font-semibold text-white/80 transition hover:border-white/20 hover:text-white"
                >
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
        className="py-20 bg-gradient-to-b from-[#1a021a] to-[#120014]"
        aria-label="Get started panels"
      >
        <div className="max-w-7xl mx-auto px-6">
          <h2 className="text-3xl font-bold mb-8 text-pink-300">Get started — pick an option</h2>

          <div className="w-full overflow-x-auto">
            <div className="min-w-full grid grid-cols-1 md:grid-cols-3 gap-6">
              <Link href="/auction" className="block h-full">
                <article className="h-full min-h-[320px] flex flex-col justify-between border border-white/10 bg-[#0b0b12] p-8 transition hover:border-white/20 hover:bg-[#10101a]">
                  <div>
                    <div className="text-sm font-medium text-pink-50/90 uppercase tracking-wide">
                      Create Sealed Auction
                    </div>
                    <h3 className="mt-4 text-2xl font-extrabold tracking-tight text-pink-50">
                      Make a sealed auction and share the link
                    </h3>

                    <p className="mt-4 text-sm text-pink-100/75">
                      Launch your item on the public arcibid marketplace, or get a private but
                      shareable link.
                    </p>

                    <div className="mt-4 p-3 rounded-md bg-black/30 text-xs text-pink-50/80">
                      <div className="font-medium">Example shareable link (mock):</div>
                      <div className="mt-1 break-all text-sm">
                        https://arcibid-client.vercel.app/bid?auctionPk=abcxyz
                      </div>
                    </div>
                  </div>

                  <div className="mt-6 text-xs text-gray-300/70">{/* empty but forces alignment */}</div>
                </article>
              </Link>

              <Link href="/auction?panel=governance" className="block h-full">
                <article className="h-full flex flex-col justify-between border border-white/10 bg-[#0b0b12] p-8 shadow-none transition hover:border-white/20 hover:bg-[#10101a]">
                  <div>
                    <div className="text-sm font-medium text-white/90 uppercase tracking-wide">
                      DAO / Realms integration
                    </div>
                    <h3 className="mt-4 text-2xl font-extrabold tracking-tight text-white">
                      Prepare a governance proposal payload
                    </h3>

                    <p className="mt-4 text-sm text-gray-200/80">
                      Generate a sealed-auction instruction bundle that can be inserted into Realms
                      or another DAO governance flow. Auction SPL tokens in the treasury.
                    </p>

                    <pre
                      className="mt-4 p-4 rounded-md bg-black/40 text-xs text-pink-100 overflow-auto"
                      aria-hidden="true"
                    >
{`AAECAwQFBgcICQ==
`}
                    </pre>
                  </div>

                  <div className="mt-6 text-xs text-gray-300/70"></div>
                </article>
              </Link>

              <Link href="/docs#developers" className="block h-full">
                <article className="h-full flex flex-col justify-between border border-white/10 bg-[#0b0b12] p-8 shadow-none transition hover:border-white/20 hover:bg-[#10101a]">
                  <div>
                    <div className="text-sm font-medium text-white/90 uppercase tracking-wide">
                      Build with our SDK
                    </div>
                    <h3 className="mt-4 text-2xl font-extrabold tracking-tight text-white">
                      Use encrypted auctions in your app
                    </h3>

                    <p className="mt-4 text-sm text-gray-200/80">
                      Integrate ARCIBID SDKs to add sealed-bid auctions to lending protocols, DAO
                      launchpads, marketplaces, and more.
                    </p>

                    <div className="mt-4 p-4 rounded-md bg-black/40 border border-white/5 text-xs text-pink-100 overflow-auto">
                      <pre className="whitespace-pre-wrap break-words">
{`npm install @arcibid/sdk

cargo install arcibid-sdk`}
                      </pre>
                    </div>
                  </div>

                  <div className="mt-6 text-xs text-gray-300/70">
                    <div className="italic">
                      Example use cases: lending protocols, DAO launchpads, treasury tooling, and
                      auction-based DeFi apps.
                    </div>
                  </div>
                </article>
              </Link>

              <article className="h-full flex flex-col justify-between border border-white/10 bg-[#0b0b12] p-8 shadow-none transition hover:border-white/20 hover:bg-[#10101a]">
                <div>
                  <div className="text-sm font-medium text-pink-100/90 uppercase tracking-wide">
                    Create Sealed Auction DAO
                  </div>
                  <h3 className="mt-4 text-2xl font-extrabold tracking-tight text-pink-50">
                    (Coming Soon)
                  </h3>

                  <p className="mt-4 text-sm text-pink-100/70">
                    Launch a DAO that tokenizes part of the treasury token pool for auction. Raise
                    capital for your startup using sealed bids.
                  </p>
                </div>

                <div className="mt-6 text-xs text-pink-200/80">
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
