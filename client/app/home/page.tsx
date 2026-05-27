'use client';

import Link from "next/link";
import { useEffect, useRef, useState, type MouseEvent, type ReactNode } from "react";
import { createReadOnlyProgram } from "../../lib/anchorClient";
import { enumKey, toHttpGateway, shorten } from "@/lib/utils";

const launchPhrases = [
  "Launch a token",
  "Eliminate rug-pulls",
  "Launch an NFT",
  // "Launch your DAO",
  // "Run sealed liquidation auctions",
  "Sell DAO treasuries",
  // "Liquidate positions",
  "Protect from MEV",
  "Sell a token",
  "Run a private sale",
  "Sell an NFT",
  "Protect bids from MEV",
  "Sell your art",
  "Develop with sealed bids",
  "Avoid OTC",
  "Maximize price discovery",
  "Eliminate bots",
] as const;

const launchUseCases = [
  // "Launch your Project",
  "Launch your token",
  "Launch an NFT",
  "Liquidation auctions",
  "Custom build for apps and protocols",
] as const;

const sdkPanels = [
  {
    title: "Lending protocol liquidation auctions",
    copy: "No MEV leakage for liquidations and arbitrage.",
  },
  {
    title: "Validator bundles",
    copy: "Sealed transaction bundling for block building.",
  },
  {
    title: "DAO launchpads",
    copy: "Fully sealed bid collection for token and governance sales.",
  },
  {
    title: "Launch a token from your site",
    copy: "Use the auction program inside your apps / protocols with our clientside tools.",
  },
] as const;

const flowSteps = [
  {
    id: "fund",
    title: "Use and fund an UMBRA ETA",
    eyebrow: "1 · Fund",
    description:
      "ARCRYPT generates an UMBRA encrypted token account for every user. You can freely move tokens in and out while concealing the funds you actually use to bid from on-chain observers.",
  },
  {
    id: "bid",
    title: "Place a bid",
    eyebrow: "2 · Bid",
    description:
      "ARCRYPT places your funds inside the UMBRA shielded pool, where nobody can see them. Your escrow and bid stay concealed from public Solana ledgers, so no one knows how much you are willing to spend.",
  },
  {
    id: "wait",
    title: "Wait",
    eyebrow: "3 · Process",
    description:
      "UMBRA submits your bid as encrypted ciphertext to the ARCRYPT program, which is processed through Arcium's MPC network. We compare every bid inside a mixed execution environment using thousands of Arcium nodes, so no individual can piece together any bids or computation.",
  },
{
    id: "settle",
  title: "Win!",
  eyebrow: "4 · Settle",
  description: (
    <>
      When the auction ends, the winner is revealed publicly and can claim the reward.{" "}
      <strong>The token can be automatically launched to Raydium once the seller claims (configurable).</strong>
    </>
  ),
},
  {
    id: "create",
    title: "Make an auction",
    eyebrow: "5 · Launch",
    description:
      "Create highest-bid, Vickrey or uniform auctions with the ARCRYPT program. Auction SPL tokens, NFTs, or use DAO treasury mode to create a governance proposal, then post it on the ARCRYPT marketplace or launch with your own program using the SDK.",
  },
] as const;

type TopAuctionItem = {
  auctionPk: string;
  name: string;
  image: string;
  paymentAmount: bigint;
  auctionType: string;
  assetKind: string;
  metadataSymbol: string;
  bidCount: number;
};

function TopAuctionsSection() {
  const [items, setItems] = useState<TopAuctionItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const programId = process.env.NEXT_PUBLIC_PROGRAM_ID;
        const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL;
        if (!programId || !rpcUrl) return;

        const program = await createReadOnlyProgram(rpcUrl, programId);
        const entries = await program.account.auction.all();

        const summaries = await Promise.all(
          entries.map(async (entry: any) => {
            const pk = entry?.publicKey?.toBase58?.() ?? String(entry?.publicKey ?? "");
            const auction = entry?.account ?? {};

            const paymentRaw = auction?.paymentAmount ?? auction?.payment_amount ?? 0;
            const paymentAmount = BigInt(paymentRaw?.toString?.() ?? "0");
            const auctionType = enumKey(auction?.auctionType ?? auction?.auction_type).toLowerCase();
            const assetKind = enumKey(auction?.assetKind ?? auction?.asset_kind).toLowerCase();
            const bidCount = Number(auction?.bidCount ?? auction?.bid_count ?? 0);

            const metadataUri = String(
              auction?.auctionMetadataUri ??
              auction?.auction_metadata_uri ??
              auction?.metadataUri ??
              auction?.uri ??
              ""
            );

            let name = `Auction ${shorten(pk)}`;
            let image = "";
            let metadataSymbol = "";

            if (metadataUri) {
              try {
                const controller = new AbortController();
                const timeout = window.setTimeout(() => controller.abort(), 2500);
                const res = await fetch(toHttpGateway(metadataUri), { cache: "no-store", signal: controller.signal });
                window.clearTimeout(timeout);
                if (res.ok) {
                  const meta = await res.json().catch(() => null);
                  if (meta) {
                    name = String(meta?.name ?? name);
                    image = toHttpGateway(String(meta?.image ?? ""));
                    metadataSymbol = String(meta?.symbol ?? "");
                  }
                }
              } catch {}
            }

            return { auctionPk: pk, name, image, paymentAmount, auctionType, assetKind, metadataSymbol, bidCount };
          })
        );

        if (cancelled) return;

        const sorted = summaries
          .filter((s) => s.paymentAmount > 0n)
          .sort((a, b) => (b.paymentAmount > a.paymentAmount ? 1 : b.paymentAmount < a.paymentAmount ? -1 : 0))
          .slice(0, 4);

        setItems(sorted);
      } catch (e) {
        console.error("TopAuctions fetch failed:", e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();

    return () => { cancelled = true; };
  }, []);

  if (loading || items.length === 0) return null;

  return (
    <section className="page-section border-t border-[var(--line)] py-20 md:py-28">
      <div className="mx-auto w-full max-w-7xl px-6">
        <div className="flex items-end justify-between gap-4">
          <div>
            <h2 className="mt-4 text-5xl font-black leading-[0.92] tracking-tight text-[var(--foreground)] md:text-7xl lg:text-8xl">
              Trending
            </h2>
          </div>
          <Link
            href="/market"
            className="btn text-sm font-semibold uppercase tracking-[0.2em] md:text-base"
          >
            See all
          </Link>
        </div>

        <div className="mt-10 grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
          {items.map((item) => (
            <Link
              key={item.auctionPk}
              href={`/bid?auctionPk=${encodeURIComponent(item.auctionPk)}`}
              className="group block overflow-hidden border card transition-all duration-300 ease-out hover:scale-[1.03] hover:border-[var(--accent)] hover:shadow-[0_8px_32px_rgba(0,230,118,0.12)]"
            >
              <article className="flex h-full flex-col">
                <div className="relative aspect-square w-full overflow-hidden border-b border-[var(--line)] bg-[var(--background)]">
                  <span className="badge absolute left-3 top-3 z-10 text-[10px] uppercase tracking-[0.16em]">
                    {item.auctionType || "auction"}
                  </span>
                  {item.image ? (
                    <img
                      src={item.image}
                      alt={item.name}
                      className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.06]"
                    />
                  ) : (
                    <div className="flex h-full items-center justify-center text-sm text-[var(--muted)]">
                      No image
                    </div>
                  )}
                </div>

                <div className="flex flex-1 flex-col p-5">
                  <h3 className="line-clamp-1 text-lg font-bold text-[var(--foreground)]">
                    {item.name}
                  </h3>
                  {item.metadataSymbol && item.assetKind !== "nft" ? (
                    <div className="mt-1 text-sm font-medium text-[var(--muted)]">
                      ${item.metadataSymbol}
                    </div>
                  ) : null}

                  <div className="mt-4 flex flex-col gap-3 border-t border-[var(--line)] pt-4">
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.22em] text-[var(--muted)]">
                        Sale price
                      </div>
                      <div className="mt-1 flex items-baseline gap-1.5">
                        <span className="text-3xl font-black tabular-nums text-[var(--accent)]">
                          {(Number(item.paymentAmount) / 1e6).toLocaleString(undefined, {
                            minimumFractionDigits: 2,
                            maximumFractionDigits: 2,
                          })}
                        </span>
                        <span className="text-sm font-semibold text-[var(--muted)]">USDC</span>
                      </div>
                    </div>
                    <div>
                      <div className="text-[10px] uppercase tracking-[0.22em] text-[var(--muted)]">
                        Bids
                      </div>
                      <div className="mt-1 text-3xl font-black tabular-nums text-[var(--foreground)]">
                        {item.bidCount}
                      </div>
                    </div>
                  </div>
                </div>
              </article>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}

function RotatingPhrase() {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setVisible(false);
      window.setTimeout(() => {
        setIndex((current) => (current + 1) % launchPhrases.length);
        setVisible(true);
      }, 180);
    }, 2000);

    return () => window.clearInterval(timer);
  }, []);

  return (
    <span className="relative flex h-[1.4em] w-full items-center justify-center overflow-hidden text-center whitespace-nowrap">
      <span
        className={`absolute left-0 top-0 flex h-full w-full items-center justify-center font-extrabold text-accent transition-all duration-300 ${
          visible ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0"
        }`}
      >
        {launchPhrases[index]}
      </span>
      <span className="invisible font-extrabold text-accent">{launchPhrases[0]}</span>
    </span>
  );
}

function SectionTitle({
  kicker,
  title,
  subtitle,
}: {
  kicker: string;
  title: ReactNode;
  subtitle: ReactNode;
}) {
  return (
    <div className="max-w-5xl">
      <p className="text-xs uppercase tracking-[0.45em] text-[var(--muted)] md:text-sm">{kicker}</p>
      <h2 className="mt-4 text-5xl font-black leading-[0.92] tracking-tight text-[var(--foreground)] md:text-7xl lg:text-8xl">
        {title}
      </h2>
      <p className="mt-6 max-w-3xl text-lg leading-8 text-[var(--muted)] md:text-2xl md:leading-10">
        {subtitle}
      </p>
    </div>
  );
}

export default function HomePage() {
  const launchRef = useRef<HTMLElement | null>(null);
  const waitlistRef = useRef<HTMLElement | null>(null);
  const sdkRef = useRef<HTMLElement | null>(null);
  const howItWorksRef = useRef<HTMLElement | null>(null);
  const getStartedRef = useRef<HTMLElement | null>(null);

  const [showTitle, setShowTitle] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const [activeUseCase, setActiveUseCase] = useState(0);
  const [activeSdkUseCase, setActiveSdkUseCase] = useState(0);

  const activeDetailRef = useRef<HTMLDivElement | null>(null);
  const didMountRef = useRef(false);
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [referralLink, setReferralLink] = useState("");

  const highlightTransition =
  "transition-[border-color,background-color,box-shadow,color] duration-200 ease-out";

  useEffect(() => {
    if (!didMountRef.current) {
      didMountRef.current = true;
      return;
    }

    if (window.innerWidth < 1024) {
      activeDetailRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    }
  }, [activeStep]);

  useEffect(() => {
    const t = setTimeout(() => setShowTitle(true), 180);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveUseCase((current) => (current + 1) % launchUseCases.length);
    }, 2400);

    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setActiveSdkUseCase((current) => (current + 1) % sdkPanels.length);
    }, 2200);

    return () => window.clearInterval(timer);
  }, []);

const scrollTo =
  (ref: React.RefObject<HTMLElement | null>) =>
  (e?: MouseEvent<HTMLAnchorElement>) => {
    e?.preventDefault();
    if (!ref.current) return;

    const y = ref.current.getBoundingClientRect().top + window.pageYOffset;
    window.scrollTo({ top: y, behavior: "smooth" });
  };

  const scrollToHowItWorks = (e?: MouseEvent<HTMLAnchorElement>) => {
    e?.preventDefault();
    if (!howItWorksRef.current) return;

    const y = howItWorksRef.current.getBoundingClientRect().top + window.pageYOffset;
    window.scrollTo({ top: y, behavior: "smooth" });
  };

  const active = flowSteps[activeStep];

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setStatus("loading");

    const res = await fetch("/api/updateWaitlist", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    });

    const data = await res.json();

    if (!res.ok) {
      setStatus("error");
      return;
    }

    setReferralLink(data.referralLink || "");
    setStatus("success");
  }

  return (
    <main className="page-shell min-h-[100svh] overflow-hidden">
      <section className="page-section relative isolate flex min-h-[100svh] w-full items-center justify-center overflow-hidden py-20 md:py-28">
        <div className="absolute inset-0 z-0 overflow-hidden">
          <video
            autoPlay
            muted
            loop
            playsInline
            className="h-full w-full object-cover brightness-[0.4] contrast-125"
          >
            <source src="/backdrop.mp4" type="video/mp4" />
          </video>
          <div className="absolute inset-0 bg-black/55" />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(0,230,118,0.15),transparent_42%),radial-gradient(circle_at_bottom,rgba(255,255,255,0.08),transparent_28%)]" />
        </div>

        <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-col items-center px-6 text-center">
          <h1
            className={`hero-title text-7xl font-extrabold leading-tight tracking-tight text-white transition-all duration-700 md:text-9xl lg:text-[10rem] ${
              showTitle ? "translate-y-0 opacity-100" : "translate-y-5 opacity-0"
            }`}
            style={{ fontFamily: "Arial, Helvetica, sans-serif", color: "white" }}
          >
            ARCRYPT
          </h1>

          <div className="max-w-6xl text-center">
            <div className="text-2xl font-semibold tracking-[0.1em] text-[var(--muted)] md:text-4xl lg:text-5xl">
              The fairest way to
            </div>

            <div className="mt-2 text-3xl font-extrabold tracking-tight text-accent md:text-5xl lg:text-6xl">
              <RotatingPhrase />
            </div>

            <div className="mt-2 text-2xl font-semibold tracking-[0.1em] text-[var(--muted)] md:text-4xl lg:text-5xl">
              with 100% sealed auctions on Solana
            </div>
          </div>

          <div className="mt-6 max-w-4xl flex flex-col items-center gap-2">
            <p className="hero-copy max-w-4xl text-lg leading-8 text-[var(--muted)] md:text-xl md:leading-9 lg:text-2xl lg:leading-[1.45]">
              ARCRYPT is a sealed-bid auction platform for Solana that keeps escrow balances and bids 100% private. Eliminate MEV entirely and launch with ARCRYPT. 
            </p>

            <div className="mt-6 flex flex-col justify-center gap-4 sm:flex-row">
              <a
                href="#launch-section"
                onClick={scrollTo(launchRef)}
                className="btn btn-primary text-sm font-semibold uppercase tracking-[0.2em] md:text-base"
              >
                Begin
              </a>

              <a
                href="#waitlist"
                onClick={scrollTo(waitlistRef)}
                className="btn btn-primary text-sm font-semibold uppercase tracking-[0.2em] md:text-base"
              >
                Join the waitlist
              </a>

              <Link
                href="/docs"
                className="btn text-sm font-semibold uppercase tracking-[0.2em] md:text-base"
              >
                Read docs
              </Link>
            </div>
          </div>

          <p className="mt-6 text-xs uppercase tracking-[0.32em] text-[var(--muted)] md:text-sm">
            Deployed on Solana devnet
          </p>
        </div>
      </section>

      <TopAuctionsSection />

      <section
        id="launch-section"
        ref={launchRef}
        className="page-section relative overflow-hidden border-t border-[var(--line)] min-h-[100svh] flex items-center py-20 md:py-28"
        aria-label="Launch section"
      >
        <div className="mx-auto grid w-full max-w-7xl gap-16 px-6 lg:grid-cols-[1.05fr_0.95fr] lg:items-center">
          <div className="flex flex-col justify-center">
            <SectionTitle
              kicker="01 · Market"
              title={
                <>
                  <span className="block">The fairest way to</span>
                  <span className="block text-accent">launch your project</span>
                </>
              }
              subtitle={
                <>
                  ARCRYPT brings 100% sealed auctions to Solana so escrows, pricing, and settlement happen without exposing bids to the public mempool. This provides total MEV protection, no bot front-runs, no false-hype, uniform allocation, maximal price discovery, real buyers and real liquidity. We use state-of-the-art cryptography including Arcium MPC for winner calculation, and CPI with Umbra to keep escrows private.
                </>
              }
            />

            <div className="mt-8 flex flex-col gap-4 sm:flex-row self-start">
              <a
                href="#sdk-section"
                onClick={scrollTo(sdkRef)}
                className="btn btn-primary text-base font-semibold uppercase tracking-[0.2em] md:text-lg"
              >
                Build with the SDK
              </a>
              <a
                href="#how-it-works"
                onClick={scrollToHowItWorks}
                className="btn text-base font-semibold uppercase tracking-[0.2em] md:text-lg"
              >
                Continue with the mechanics
              </a>
            </div>
          </div>

          <div className="surface-strong p-6 md:p-8 lg:p-10">
            <div className="text-xs uppercase tracking-[0.35em] text-[var(--muted)]">
              A few ways to use Arcrypt
            </div>

            <div className="mt-6 grid gap-4">
              {launchUseCases.map((item, index) => {
                const isActive = index === activeUseCase;
                return (
                <div
                  key={item}
                  className={`border p-5 ${highlightTransition} ${
                    isActive ? "card-active" : "card"
                  }`}
                >
                  <div
                    className={`text-xl font-black tracking-tight md:text-3xl ${highlightTransition} ${
                      isActive ? "text-accent" : "text-[var(--foreground)]"
                    }`}
                  >
                    {item}
                  </div>
                  <div className="mt-3 text-sm leading-6 text-[var(--muted)] md:text-base">
                      {index === 0 && "Bootstrap liquidity for a token to Raydium with a sealed-bid auction"}
                      {index === 1 && "Auction and bid for NFTs, completely sealed - create your own or sell an existing one"}
                      {index === 2 && "Plug in with DAOs and Realms governance to propose treasury liquidations"}
                      {index === 3 && "Use the auction program directly inside your app or protocol with the SDK"}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </section>

      <section
        id="sdk-section"
        ref={sdkRef}
        className="page-section relative overflow-hidden border-t border-[var(--line)] min-h-[100svh] flex items-center py-20 md:py-28"
        aria-label="Developer SDK section"
      >
        <div className="mx-auto grid max-w-7xl gap-16 px-6 lg:grid-cols-[0.95fr_1.05fr] lg:items-center">
          <div className="surface-strong p-6 md:p-8 lg:p-10">
            <div className="border border-[var(--line)] bg-black/40 p-5 md:p-6">
              <div className="text-xs uppercase tracking-[0.35em] text-[var(--muted)]">
                Quick build
              </div>
              <pre
                className="mt-4 overflow-x-auto text-sm leading-7 md:text-base"
                style={{
                  fontFamily:
                    "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace",
                }}
              >
                <code>
                  <span className="text-accent">{"createAuction({"}</span>
                  <span className="text-[var(--foreground)]">{`\n`}</span>
                  <span className="text-[var(--foreground)]">  programClient: </span>
                  <span className="text-white">...</span>
                  <span className="text-[var(--foreground)]">{`,\n`}</span>
                  <span className="text-[var(--foreground)]">  programId: </span>
                  <span className="text-white">...</span>
                  <span className="text-[var(--foreground)]">{`,\n`}</span>
                  <span className="text-[var(--foreground)]">  publicKey: </span>
                  <span className="text-white">...</span>
                  <span className="text-[var(--foreground)]">{`,\n`}</span>
                  <span className="text-[var(--foreground)]">  authorityBase58: </span>
                  <span className="text-white">"..."</span>
                  <span className="text-[var(--foreground)]">{`,\n`}</span>
                  <span className="text-[var(--foreground)]">  minBidSol: </span>
                  <span className="text-white">"1.5"</span>
                  <span className="text-[var(--foreground)]">{`,\n`}</span>
                  <span className="text-[var(--foreground)]">  durationSecs: </span>
                  <span className="text-white">3600</span>
                  <span className="text-[var(--foreground)]">{`,\n`}</span>
                  <span className="text-[var(--foreground)]">  auctionType: </span>
                  <span className="text-white">"Vickrey"</span>
                  <span className="text-[var(--foreground)]">{`,\n`}</span>
                  <span className="text-[var(--foreground)]">  assetKind: </span>
                  <span className="text-white">"Fungible"</span>
                  <span className="text-[var(--foreground)]">{`,\n`}</span>
                  <span className="text-[var(--foreground)]">  metadataUri: </span>
                  <span className="text-white">"..."</span>
                  <span className="text-[var(--foreground)]">{`,\n`}</span>
                  <span className="text-[var(--foreground)]">  ...</span>
                  {`\n`}
                  <span className="text-[var(--foreground)]">{"});"}</span>
                </code>
              </pre>
            </div>

            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              {sdkPanels.map((item, index) => {
                const isActive = index === activeSdkUseCase;
                return (
                <div
                  key={item.title}
                  className={`border p-5 ${highlightTransition} ${
                    isActive ? "card-active" : "card"
                  }`}
                >
                  <div
                    className={`text-lg font-black tracking-tight md:text-2xl ${highlightTransition} ${
                      isActive ? "text-accent" : "text-[var(--foreground)]"
                    }`}
                  >
                    {item.title}
                  </div>
                  <div className="mt-3 text-sm leading-6 text-[var(--muted)] md:text-base">
                    {item.copy}
                  </div>
                </div>
                );
              })}
            </div>
          </div>

          <div>
            <p className="text-xs uppercase tracking-[0.45em] text-[var(--muted)] md:text-sm">
              02 · Developers
            </p>
            <h2 className="mt-4 text-5xl font-black leading-[0.92] tracking-tight text-[var(--foreground)] md:text-7xl lg:text-8xl">
              A comprehensive sealed auction <span className="text-accent">SDK for developers</span>
            </h2>
            <p className="mt-6 max-w-3xl text-lg leading-8 text-[var(--muted)] md:text-2xl md:leading-10">
              Build sealed-bid markets into protocols, launchpads, validators, and webclients without exposing bidder intent. ARCRYPT gives you the primitives to ship encrypted auctions with low latency.
            </p>

            <div className="mt-8 flex flex-col gap-4 sm:flex-row">
              <a
                href="#how-it-works"
                onClick={scrollToHowItWorks}
                className="btn btn-primary text-base font-semibold uppercase tracking-[0.2em] md:text-lg"
              >
                See how it works
              </a>
              <Link
                href="/docs"
                className="btn text-base font-semibold uppercase tracking-[0.2em] md:text-lg"
              >
                Read the docs
              </Link>
            </div>
          </div>
        </div>
      </section>

      <section
        id="how-it-works"
        ref={howItWorksRef}
        className="page-section relative overflow-hidden border-t border-[var(--line)] min-h-[100svh] flex items-center py-20 md:py-28"
        aria-label="How it works flow"
      >
        <div className="relative mx-auto max-w-7xl px-6">
          <div className="max-w-6xl">
            <p className="text-xs uppercase tracking-[0.45em] text-[var(--muted)] md:text-sm">
              03 · How it works
            </p>
            <h2 className="mt-4 text-5xl font-black tracking-tight text-[var(--foreground)] md:text-7xl lg:text-8xl">
              Invisible USDC investments with MPC
            </h2>
            <p className="mt-6 max-w-4xl text-lg leading-8 text-[var(--muted)] md:text-2xl md:leading-10">
              Bid in the dark with Arcrypt. Nobody can see how much USDC you have bid, even if they know your wallet address. See how ARCRYPT securely locks encrypted bid escrows and determines the result of the auction without revealing the bid quantity anywhere on-chain using multi-party computation.
            </p>
          </div>

          <div className="mt-10 grid gap-5 lg:grid-cols-[0.95fr_1.05fr] items-stretch">
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
                {/* <div className="badge-accent">{active.stat}</div> */}

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
                      Bid commitments stay fully shielded and locked.
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
                      Token launches move to Raydium DEX.
                    </div>
                  </div>
                </div>
              </div>
            </div>

            <div className="surface p-5 md:p-6">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="mt-1 text-xl font-bold text-[var(--foreground)] md:text-2xl">
                    Click to learn how Arcrypt works
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
                          <span>{isActive ? "Selected" : isBefore ? "Completed" : "Preview"}</span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>

              <div className="sticky bottom-4 z-20 mt-5 flex flex-col gap-3 rounded-2xl border border-[var(--line)] bg-[var(--background)]/95 p-3 shadow-lg backdrop-blur sm:flex-row lg:static lg:rounded-none lg:border-0 lg:bg-transparent lg:p-0 lg:shadow-none lg:backdrop-blur-0">
                <button
                  type="button"
                  onClick={() => {
                    if (activeStep === flowSteps.length - 1) {
                      getStartedRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
                      return;
                    }

                    setActiveStep((s) => (s + 1) % flowSteps.length);
                  }}
                  className="btn btn-primary w-full sm:w-auto"
                >
                  {activeStep === flowSteps.length - 1 ? "Get started" : "Next step"}
                </button>

                <a href="#launch-section" onClick={scrollTo(launchRef)} className="btn w-full sm:w-auto">
                  Back to launch
                </a>
              </div>
            </div>
          </div>
        </div>
      </section>

      <section
        id="get-started"
        ref={waitlistRef}
        className="page-section border-t border-[var(--line)] min-h-[100svh] flex items-center py-20 md:py-28"
        aria-label="Get started panels"
      >
        <div className="mx-auto w-full max-w-7xl px-6">
          <div className="max-w-4xl">
            <p className="text-xs uppercase tracking-[0.45em] text-[var(--muted)] md:text-sm">
              04 · Get Started
            </p>
            <h2 className="mt-4 text-5xl font-black tracking-tight text-[var(--foreground)] md:text-7xl lg:text-8xl">
              Get Started
            </h2>
            <p className="mt-6 max-w-3xl text-lg leading-8 text-[var(--muted)] md:text-2xl md:leading-10">
              Pick how you want to begin with ARCRYPT.
            </p>
          </div>

          <div className="mt-12 grid gap-6 md:grid-cols-2 xl:grid-cols-4">
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
                    Launch your item on the public ARCRYPT marketplace, or get a private but shareable link.
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
                    or another DAO governance path. Auction SPL tokens in the treasury (perfect for TGEs)
                  </p>

                  <div className="mt-4 border border-[var(--line)] bg-[var(--background)] p-4 text-xs text-[var(--accent)]">
                    <pre
                      className="whitespace-pre-wrap break-all leading-relaxed"
                      style={{
                        fontFamily:
                          "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace",
                      }}
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
                      style={{
                        fontFamily:
                          "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, 'Liberation Mono', monospace",
                      }}
                      aria-hidden="true"
                    >
                      {`npm install @arcrypt/sdk`}
                    </pre>
                  </div>
                </div>

                <div className="mt-6 text-xs text-[var(--muted)]">
                  <div className="italic">
                    Examples: lending protocols, sealed auction tx validators, DAO launchpads
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

            </article>
              <a
    href="https://www.youtube.com/watch?v=RJwPN_H7-DU"
    target="_blank"
    rel="noopener noreferrer"
    className="block h-full"
  >
    <article className="card surface-hover flex h-full min-h-[220px] flex-col justify-center p-8 transition">
      <div className="text-sm font-medium uppercase tracking-wide text-[var(--muted)]">
        View the pitch
      </div>
      <h3 className="mt-4 text-2xl font-extrabold tracking-tight text-[var(--foreground)]">
        Watch the pitch video
      </h3>
    </article>
  </a>

  <a
    href="https://www.youtube.com/watch?v=y2xpd_ST2ZY"
    target="_blank"
    rel="noopener noreferrer"
    className="block h-full"
  >
    <article className="card surface-hover flex h-full min-h-[220px] flex-col justify-center p-8 transition">
      <div className="text-sm font-medium uppercase tracking-wide text-[var(--muted)]">
        View the demo
      </div>
      <h3 className="mt-4 text-2xl font-extrabold tracking-tight text-[var(--foreground)]">
        Watch the demo video
      </h3>
    </article>
  </a>
  
            
          </div>
          <section className="page-section border-t border-[var(--line)] py-20 md:py-28">
  <div className="mx-auto max-w-7xl px-6">
    <div className="surface-strong p-8 md:p-10 lg:p-12">
      <p className="text-xs uppercase tracking-[0.45em] text-[var(--muted)]">
        05 · Waitlist
      </p>
      <h2 className="mt-4 text-4xl font-black tracking-tight md:text-6xl">
        Join the waitlist.
      </h2>
      <p className="mt-4 max-w-2xl text-lg text-[var(--muted)]">
        Get early access and move up the list by inviting friends.
      </p>

      <form onSubmit={handleSubmit} className="mt-8 flex flex-col gap-4 sm:flex-row">
        <input
          type="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Enter your email"
          className="min-w-0 flex-1 border border-[var(--line)] bg-[var(--background)] px-4 py-3 text-[var(--foreground)]"
        />
        <button type="submit" className="btn btn-primary">
          {status === "loading" ? "Joining..." : "Join waitlist"}
        </button>
      </form>
      </div>
  </div>
  {status === "success" ? (
  <div className="mt-6 border border-[var(--line)] bg-[var(--background)] p-4">
    <div className="text-sm text-[var(--muted)]">You are on the waitlist.</div>
    <div className="mt-2 break-all text-sm text-[var(--accent)]">{referralLink}</div>
  </div>
) : null}
</section>
          
        </div>
        
      </section>
      
    </main>
  );
}