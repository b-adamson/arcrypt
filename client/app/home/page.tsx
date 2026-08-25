'use client';

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from "react";

const rotatingWords = [
  "front-running",
  "sandwich bots",
  "copy-trading",
  "sniping",
  "MEV",
  "leaked ceilings",
] as const;

function RotatingWord() {
  const [index, setIndex] = useState(0);
  const [visible, setVisible] = useState(true);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setVisible(false);
      window.setTimeout(() => {
        setIndex((i) => (i + 1) % rotatingWords.length);
        setVisible(true);
      }, 180);
    }, 1600);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <span className="relative inline-flex h-[1.2em] w-[9ch] items-center justify-center overflow-hidden align-bottom sm:w-[10ch]">
      <span
        className={`absolute left-1/2 top-0 -translate-x-1/2 whitespace-nowrap font-black text-accent transition-all duration-300 ${
          visible ? "translate-y-0 opacity-100" : "-translate-y-2 opacity-0"
        }`}
      >
        {rotatingWords[index]}
      </span>
    </span>
  );
}

const cipherStrings = [
  "0x4f3a9c...b21e",
  "Ac91...f0Bd",
  "01001110",
  "0xE7...44a1",
  "9dCe...1b7F",
  "0x2A6f...9c3D",
  "10110100",
  "0x88b1...ef02",
];

function CipherRain() {
  const [items, setItems] = useState<{ id: number; left: number; delay: number; duration: number; text: string }[]>([]);

  useEffect(() => {
    setItems(
      cipherStrings.map((text, i) => ({
        id: i,
        left: (i * 97 + 13) % 100,
        delay: (i * 1.3) % 6,
        duration: 14 + ((i * 3) % 8),
        text,
      }))
    );
  }, []);

  return (
    <div className="pointer-events-none absolute inset-0 overflow-hidden opacity-30">
      {items.map((item) => (
        <span
          key={item.id}
          className="absolute font-mono text-xs text-accent"
          style={{
            left: `${item.left}%`,
            top: "-2rem",
            animation: `cipher-drift ${item.duration}s linear ${item.delay}s infinite`,
          }}
        >
          {item.text}
        </span>
      ))}
    </div>
  );
}

function Reveal({
  children,
  className = "",
  delayMs = 0,
}: {
  children: ReactNode;
  className?: string;
  delayMs?: number;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [shown, setShown] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setShown(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15, rootMargin: "0px 0px -10% 0px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={ref}
      style={{ transitionDelay: shown ? `${delayMs}ms` : "0ms" }}
      className={`transition-all duration-700 ease-out ${
        shown ? "translate-y-0 opacity-100" : "translate-y-8 opacity-0"
      } ${className}`}
    >
      {children}
    </div>
  );
}

/**
 * Tracks scroll progress (0..1) through a tall wrapper whose child is
 * position:sticky. `fillFraction` controls how much of that scroll distance
 * is used to reach 1 — the rest is a "dwell" buffer where progress just
 * holds at 1, so content is fully revealed well before it scrolls away.
 */
function usePinProgress(fillFraction = 0.75) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    let raf = 0;
    const onScroll = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const el = ref.current;
        if (!el) return;
        const rect = el.getBoundingClientRect();
        const vh = window.innerHeight;
        // Count from the moment the wrapper starts entering the viewport
        // (rect.top === vh) through to its bottom leaving the top
        // (rect.top === -(rect.height - vh)) — not just the pinned window —
        // so the fill isn't sitting inert on screen before it starts.
        const raw = (vh - rect.top) / rect.height;
        setProgress(Math.min(1, Math.max(0, raw / fillFraction)));
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    onScroll();
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      cancelAnimationFrame(raf);
    };
  }, [fillFraction]);

  return { ref, progress };
}

function PinWrapper({
  heightVh = 220,
  fillFraction = 0.75,
  children,
}: {
  heightVh?: number;
  fillFraction?: number;
  children: (progress: number) => ReactNode;
}) {
  const { ref, progress } = usePinProgress(fillFraction);
  return (
    <div ref={ref} className="relative" style={{ height: `${heightVh}vh` }}>
      <div className="sticky top-0 flex min-h-[100svh] items-center px-6 py-20">
        {children(progress)}
      </div>
    </div>
  );
}

function ScrollHighlightText({ text }: { text: string }) {
  const words = text.split(" ");

  return (
    <PinWrapper heightVh={115} fillFraction={0.85}>
      {(progress) => {
        const activeCount = Math.round(progress * words.length);
        return (
          <p className="mx-auto max-w-5xl text-3xl font-bold leading-snug tracking-tight md:text-6xl md:leading-[1.15]">
            {words.map((w, i) => (
              <span
                key={i}
                className="transition-colors duration-150"
                style={{ color: i < activeCount ? "var(--foreground)" : "var(--line-strong)" }}
              >
                {w}{" "}
              </span>
            ))}
          </p>
        );
      }}
    </PinWrapper>
  );
}

function CodeReveal({
  lines,
  progress,
  gutter = false,
}: {
  lines: ReactNode[];
  progress: number;
  gutter?: boolean;
}) {
  const visibleLines = Math.ceil(progress * lines.length);
  return (
    <div>
      {lines.map((line, i) => {
        const isCurrent = i === visibleLines - 1;
        return (
          <div
            key={i}
            className={`flex transition-opacity duration-150 ${
              i < visibleLines ? "opacity-100" : "opacity-0"
            } ${gutter && isCurrent ? "bg-white/[0.04]" : ""}`}
          >
            {gutter ? (
              <span className="w-10 shrink-0 select-none pr-4 text-right text-[var(--muted)] opacity-50">
                {i + 1}
              </span>
            ) : null}
            <span className="min-w-0">
              {line}
              {isCurrent ? <span className="ml-1 animate-pulse text-accent">▍</span> : null}
            </span>
          </div>
        );
      })}
    </div>
  );
}

function ApplicationsList() {
  const [active, setActive] = useState(0);

  return (
    <div className="border-t border-[var(--line)]">
      {applications.map((app, i) => {
        const isActive = i === active;
        return (
          <div key={app.num} className="border-b border-[var(--line)]">
            <button
              type="button"
              onClick={() => setActive(i)}
              className="flex w-full items-center gap-6 py-6 text-left transition hover:bg-[var(--surface-2)]"
            >
              <span
                className={`shrink-0 font-mono text-3xl font-black transition-colors md:text-5xl ${
                  isActive ? "text-accent" : "text-[var(--line-strong)]"
                }`}
              >
                {app.num}
              </span>
              <span
                className={`flex-1 text-2xl font-bold tracking-tight transition-colors md:text-4xl ${
                  isActive ? "text-[var(--foreground)]" : "text-[var(--muted)]"
                }`}
              >
                {app.title}
              </span>
              <span
                className={`shrink-0 badge text-[10px] uppercase tracking-[0.2em] ${
                  app.badge === "LIVE" ? "badge-accent" : ""
                }`}
              >
                {app.badge}
              </span>
            </button>
            <div
              className="grid overflow-hidden transition-all duration-300 ease-out"
              style={{ gridTemplateRows: isActive ? "1fr" : "0fr" }}
            >
              <div className="min-h-0">
                <p className="max-w-2xl pb-6 pl-0 text-base leading-7 text-[var(--muted)] md:pl-[3.5rem] md:text-lg">
                  {app.body}
                </p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function GitHubPanel({ repo }: { repo: string }) {
  const [stars, setStars] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`https://api.github.com/repos/${repo}`, {
          headers: { Accept: "application/vnd.github+json" },
        });
        if (!res.ok) throw new Error(String(res.status));
        const data = await res.json();
        if (!cancelled) setStars(data.stargazers_count ?? 0);
      } catch {
        // silently fall back to no count
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [repo]);

  return (
    <a
      href={`https://github.com/${repo}`}
      target="_blank"
      rel="noopener noreferrer"
      className="group inline-flex items-center gap-3 border border-[var(--line-strong)] bg-[var(--surface-2)] px-5 py-3 transition hover:border-accent"
    >
      <svg width="18" height="18" viewBox="0 0 16 16" fill="currentColor" className="shrink-0 text-[var(--foreground)]">
        <path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.01 8.01 0 0 0 16 8c0-4.42-3.58-8-8-8Z" />
      </svg>
      <span className="text-sm font-semibold text-[var(--foreground)] group-hover:text-accent">{repo}</span>
      <span className="flex items-center gap-1 border-l border-[var(--line)] pl-3 text-sm text-[var(--muted)]">
        <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor" className="text-accent">
          <path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.75.75 0 0 1-1.088.79L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.192-3.047-2.97a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z" />
        </svg>
        {stars ?? "…"}
      </span>
    </a>
  );
}

function BidPreview() {
  const [encrypted, setEncrypted] = useState(true);
  const [timeLeft, setTimeLeft] = useState(8117);
  const [bidCount, setBidCount] = useState(7);
  const [flash, setFlash] = useState(false);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setTimeLeft((t) => (t > 0 ? t - 1 : 8117));
    }, 1000);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    let timeout: number;
    const scheduleNext = () => {
      const delay = 350 + Math.random() * 650;
      timeout = window.setTimeout(() => {
        setBidCount((c) => c + 1);
        setFlash(true);
        window.setTimeout(() => setFlash(false), 500);
        scheduleNext();
      }, delay);
    };
    scheduleNext();
    return () => window.clearTimeout(timeout);
  }, []);

  const h = String(Math.floor(timeLeft / 3600)).padStart(2, "0");
  const m = String(Math.floor((timeLeft % 3600) / 60)).padStart(2, "0");
  const s = String(timeLeft % 60).padStart(2, "0");

  return (
    <div className="border border-[var(--line-strong)]">
      <div className="flex items-center gap-3 border-b border-[var(--line-strong)] bg-[#151515] px-4 py-2.5">
        <div className="flex gap-1.5">
          <span className="chrome-dot h-2.5 w-2.5 bg-[#ff5f56]" />
          <span className="chrome-dot h-2.5 w-2.5 bg-[#ffbd2e]" />
          <span className="chrome-dot h-2.5 w-2.5 bg-[#27c93f]" />
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-2 border border-[var(--line)] bg-[var(--background)] px-3 py-1.5">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" className="shrink-0 text-[var(--muted)]">
            <path d="M4 7V5a4 4 0 1 1 8 0v2M3.5 7h9A1.5 1.5 0 0 1 14 8.5v4A1.5 1.5 0 0 1 12.5 14h-9A1.5 1.5 0 0 1 2 12.5v-4A1.5 1.5 0 0 1 3.5 7Z" stroke="currentColor" strokeWidth="1.2" />
          </svg>
          <span className="truncate font-mono text-xs text-[var(--muted)]">
            arcrypt.bid/bid?auctionPk=7xKk...9Qm2
          </span>
        </div>
      </div>

      <div className="relative bg-[var(--surface)] p-5 md:p-8">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="inline-flex items-center gap-2 border border-[var(--line)] px-4 py-2 text-sm font-medium text-[var(--muted)]">
          ← Back to auctions
        </span>
        <div className="border border-accent bg-[var(--background)] px-5 py-3">
          <div className="text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">Time left</div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-[var(--foreground)] md:text-3xl">
            {h}:{m}:{s}
          </div>
          <div className="mt-1 text-xs text-accent">Live</div>
        </div>
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <div>
          <div className="relative aspect-square w-full overflow-hidden border border-[var(--line)] bg-black">
            <span className="badge absolute left-3 top-3 z-10 text-[10px] uppercase tracking-[0.16em]">Vickrey</span>
            <div className="flex h-full items-center justify-center">
              <Cube3D size={88} />
            </div>
          </div>
          <div className="mt-4">
            <div className="text-2xl font-black tracking-tight text-[var(--foreground)]">Genesis Vault #001</div>
            <div className="mt-1 text-sm text-[var(--muted)]">Sealed until settlement, second-price auction</div>
            <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
              One-of-one access pass to the alpha program. Winner is revealed on settlement, along with the
              second-highest bid. Every other bid stays sealed.
            </p>
          </div>

          <div className="mt-4 grid grid-cols-3 gap-3">
            <div
              className={`border p-3 transition-colors duration-300 ${
                flash ? "border-accent bg-[color-mix(in_srgb,var(--accent)_12%,var(--background))]" : "border-[var(--line)] bg-[var(--background)]"
              }`}
            >
              <div className="text-[9px] uppercase tracking-[0.2em] text-[var(--muted)]">Bids submitted</div>
              <div className={`mt-1 text-lg font-bold tabular-nums text-[var(--foreground)] ${flash ? "pulse-accent" : ""}`}>
                {bidCount}
              </div>
            </div>
            <div className="border border-[var(--line)] bg-[var(--background)] p-3">
              <div className="text-[9px] uppercase tracking-[0.2em] text-[var(--muted)]">Min bid</div>
              <div className="mt-1 text-lg font-bold tabular-nums text-[var(--foreground)]">50 USDC</div>
            </div>
            <div className="border border-[var(--line)] bg-[var(--background)] p-3">
              <div className="text-[9px] uppercase tracking-[0.2em] text-[var(--muted)]">Creator</div>
              <div className="mt-1 truncate text-sm font-medium text-accent">7xKk...9Qm2</div>
            </div>
          </div>
        </div>

        <div>
          <div className="mb-3 flex items-center gap-3">
            <span
              className={`relative inline-flex h-5 w-9 items-center transition-colors ${encrypted ? "bg-accent" : "bg-[var(--line)]"}`}
              style={{ borderRadius: "9999px" }}
              role="presentation"
            >
              <span
                className="chrome-dot inline-block h-3 w-3 bg-white transition-transform"
                style={{ transform: encrypted ? "translateX(1.25rem)" : "translateX(0.25rem)" }}
              />
            </span>
            <button
              type="button"
              onClick={() => setEncrypted((v) => !v)}
              className="text-xs font-medium text-[var(--muted)] hover:text-[var(--foreground)]"
            >
              {encrypted ? "Encrypted bid (ETA)" : "Normal bid (ATA)"}
            </button>
          </div>

          <div className="border border-accent bg-[var(--surface)] p-6">
            <label className="text-[10px] uppercase tracking-[0.2em] text-[var(--muted)]">Your bid</label>
            <div className="mt-1 flex items-baseline gap-2 border border-[var(--line)] bg-[var(--background)] px-4 py-3">
              <span className="text-3xl font-black tabular-nums text-[var(--foreground)]">250.00</span>
              <span className="text-sm font-semibold text-[var(--muted)]">USDC</span>
            </div>
            <div className="mt-3 text-xs text-[var(--muted)]">
              One item, one bid. Sealed, nobody sees this number until the auction resolves.
            </div>

            <button
              type="button"
              className="btn btn-primary mt-6 w-full text-sm font-semibold uppercase tracking-[0.2em]"
            >
              Place sealed bid
            </button>
          </div>

          <div className="mt-4 border border-[var(--line)] bg-[var(--surface)] p-5">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-[var(--muted)]">Refresh, refund, or reclaim depending on auction state.</p>
              <span className="badge-accent text-xs">Live</span>
            </div>
          </div>
        </div>
      </div>
      </div>
    </div>
  );
}

function GovernancePreview() {
  const fieldClass =
    "flex h-11 w-full items-center border border-[var(--line)] bg-[var(--surface-2)] px-4 text-sm text-[var(--foreground)] transition-colors";

  return (
    <div className="border border-[var(--line-strong)]">
      <div className="flex items-center gap-3 border-b border-[var(--line-strong)] bg-[#151515] px-4 py-2.5">
        <div className="flex gap-1.5">
          <span className="chrome-dot h-2.5 w-2.5 bg-[#ff5f56]" />
          <span className="chrome-dot h-2.5 w-2.5 bg-[#ffbd2e]" />
          <span className="chrome-dot h-2.5 w-2.5 bg-[#27c93f]" />
        </div>
        <div className="flex min-w-0 flex-1 items-center gap-2 border border-[var(--line)] bg-[var(--background)] px-3 py-1.5">
          <svg width="12" height="12" viewBox="0 0 16 16" fill="none" className="shrink-0 text-[var(--muted)]">
            <path d="M4 7V5a4 4 0 1 1 8 0v2M3.5 7h9A1.5 1.5 0 0 1 14 8.5v4A1.5 1.5 0 0 1 12.5 14h-9A1.5 1.5 0 0 1 2 12.5v-4A1.5 1.5 0 0 1 3.5 7Z" stroke="currentColor" strokeWidth="1.2" />
          </svg>
          <span className="truncate font-mono text-xs text-[var(--muted)]">
            arcrypt.bid/auction?panel=governance
          </span>
        </div>
      </div>

      <div className="relative overflow-hidden bg-[var(--surface)] p-5 md:p-8">
        <div className="absolute inset-x-0 top-0 h-px bg-accent" />

        <div className="mb-2 inline-flex border border-[var(--line)] bg-[var(--background)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">
          DAO proposal
        </div>
        <h3 className="text-2xl font-semibold tracking-tight text-[var(--foreground)] md:text-3xl">
          Governance proposal
        </h3>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
          Pick a realm, load treasury accounts, and prepare a sealed-auction proposal in one place.
        </p>

        <div className="mt-6 grid gap-4">
          <div>
            <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">
              Proposal name
            </label>
            <div className={fieldClass}>Liquidate treasury NFT #4 via sealed auction</div>
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">
                Realm address
              </label>
              <div className={`${fieldClass} truncate font-mono text-xs`}>9WzD...AWWM</div>
            </div>
            <div>
              <label className="mb-2 block text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">
                Treasury wallet
              </label>
              <div className={`${fieldClass} truncate font-mono text-xs`}>3rDE...k9Lp &middot; 4 ATAs</div>
            </div>
          </div>

          <div className="border border-[var(--line)] bg-[var(--background)] px-4 py-3 text-sm text-[var(--muted)]">
            <div className="mb-2 text-[11px] uppercase tracking-[0.22em] text-[var(--muted)]/70">
              Proposal description preview
            </div>
            <div className="whitespace-pre-line font-mono text-xs text-[var(--foreground)]">
              {"Auction the treasury's 1/1 NFT via sealed bid. Reserve stays sealed until settlement.\n\nCheck it out here: arcrypt.bid/bid?auctionPk=<filled after creation>"}
            </div>
          </div>

          <button
            type="button"
            className="btn btn-primary mt-2 w-full text-sm font-semibold uppercase tracking-[0.2em]"
          >
            Create sealed auction proposal
          </button>
        </div>
      </div>
    </div>
  );
}

function EditorPanel({ filename, children }: { filename: string; children: ReactNode }) {
  return (
    <div className="border border-[var(--line-strong)] bg-[#1e1e1e] shadow-[0_0_60px_rgba(0,230,118,0.06)]">
      <div className="flex items-stretch border-b border-black/40 bg-[#252526]">
        <div className="flex items-center gap-2 border-r border-black/40 bg-[#1e1e1e] px-4 py-2.5">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" className="shrink-0 text-[#3178c6]">
            <rect width="24" height="24" rx="3" fill="currentColor" />
            <text x="12" y="16.5" textAnchor="middle" fontSize="11" fontWeight="700" fill="#1e1e1e">TS</text>
          </svg>
          <span className="text-xs text-[#e8e8e8]">{filename}</span>
          <span className="chrome-dot ml-2 h-1.5 w-1.5 bg-[#e8e8e8]/60" />
        </div>
        <div className="flex-1" />
      </div>
      <div className="h-[3px] w-[6rem] bg-accent" />
      <div className="overflow-x-auto p-5 font-mono text-base leading-8 md:p-6 md:text-lg md:leading-9">
        {children}
      </div>
    </div>
  );
}

function Cube3D({ size = 56 }: { size?: number }) {
  const half = size / 2;
  const faceStyle: CSSProperties = {
    position: "absolute",
    width: size,
    height: size,
    border: "1px solid rgba(0,230,118,0.55)",
    background: "rgba(0,230,118,0.08)",
  };

  return (
    <div style={{ perspective: 500, width: size, height: size }}>
      <div
        style={{
          position: "relative",
          width: size,
          height: size,
          transformStyle: "preserve-3d",
          animation: "spin-cube 9s linear infinite",
        }}
      >
        <div style={{ ...faceStyle, transform: `rotateY(0deg) translateZ(${half}px)` }} />
        <div style={{ ...faceStyle, transform: `rotateY(180deg) translateZ(${half}px)` }} />
        <div style={{ ...faceStyle, transform: `rotateY(90deg) translateZ(${half}px)` }} />
        <div style={{ ...faceStyle, transform: `rotateY(-90deg) translateZ(${half}px)` }} />
        <div style={{ ...faceStyle, transform: `rotateX(90deg) translateZ(${half}px)` }} />
        <div style={{ ...faceStyle, transform: `rotateX(-90deg) translateZ(${half}px)` }} />
      </div>
    </div>
  );
}

function TiltCard({
  index,
  total,
  title,
  subtitle,
}: {
  index: number;
  total: number;
  title: string;
  subtitle: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const raf = useRef(0);

  const handleMove = (e: React.MouseEvent<HTMLDivElement>) => {
    const el = ref.current;
    if (!el) return;
    const clientX = e.clientX;
    const clientY = e.clientY;
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      const rect = el.getBoundingClientRect();
      const px = (clientX - rect.left) / rect.width;
      const py = (clientY - rect.top) / rect.height;
      el.style.setProperty("--rx", `${(0.5 - py) * 16}deg`);
      el.style.setProperty("--ry", `${(px - 0.5) * 16}deg`);
      el.style.setProperty("--gx", `${px * 100}%`);
      el.style.setProperty("--gy", `${py * 100}%`);
    });
  };

  const handleLeave = () => {
    cancelAnimationFrame(raf.current);
    const el = ref.current;
    if (!el) return;
    el.style.setProperty("--rx", "0deg");
    el.style.setProperty("--ry", "0deg");
  };

  return (
    <div style={{ perspective: "1000px" }}>
      <div
        ref={ref}
        onMouseMove={handleMove}
        onMouseLeave={handleLeave}
        className="tilt-card relative aspect-[3/4] overflow-hidden border border-[var(--line-strong)] bg-[var(--surface-2)] p-5"
        style={{ ["--rx" as string]: "0deg", ["--ry" as string]: "0deg", ["--gx" as string]: "50%", ["--gy" as string]: "50%" }}
      >
        <div className="tilt-card-glow pointer-events-none absolute inset-0" />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,transparent_40%,rgba(255,255,255,0.05)_50%,transparent_60%)]" />

        <div className="relative flex h-full flex-col justify-between">
          <div className="flex items-start justify-between">
            <span className="font-mono text-xs text-[var(--muted)]">
              {String(index + 1).padStart(2, "0")}/{String(total).padStart(2, "0")}
            </span>
            <span className="badge-accent text-[9px] uppercase tracking-[0.2em]">1 of 1</span>
          </div>

          <div className="flex flex-1 items-center justify-center">
            <Cube3D size={56} />
          </div>

          <div>
            <div className="text-lg font-bold text-[var(--foreground)]">{title}</div>
            <div className="mt-1 text-xs leading-5 text-[var(--muted)]">{subtitle}</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Eyebrow({ n, label }: { n: string; label: string }) {
  return (
    <div className="flex items-center gap-3 text-xs uppercase tracking-[0.4em] text-[var(--muted)]">
      <span className="font-black text-accent">{n}</span>
      <span className="h-px w-8 bg-[var(--line-strong)]" />
      <span>{label}</span>
    </div>
  );
}

const flowSteps: { n: string; title: string; body: string }[] = [
  {
    n: "01",
    title: "Fund a shielded balance",
    body: "You move USDC into an Umbra encrypted token account. From the outside, it's just a balance, nobody can see what's inside it.",
  },
  {
    n: "02",
    title: "Encrypt and submit your bid",
    body: "Your bid amount is encrypted client-side against Umbra's MXE before it ever touches the network. The plaintext number never exists on-chain.",
  },
  {
    n: "03",
    title: "Escrow, sealed",
    body: "ARCRYPT CPIs into Umbra to lock your funds inside its shielded pool. The escrow account itself is hidden, not just the amount, the fact that it holds a bid at all.",
  },
  {
    n: "04",
    title: "Ranked without being read",
    body: "When the auction closes, ciphertexts are compared inside Arcium's MPC network, split across nodes so no single party ever reconstructs a bid.",
  },
  {
    n: "05",
    title: "One reveal, ever",
    body: "Only the winner and the clearing price are published. Every losing bid stays exactly as private as it started.",
  },
];

type DiagramBoxId =
  | "start"
  | "encryptUmbra"
  | "crank"
  | "placeBid"
  | "umbraDeposit"
  | "placeEncBid"
  | "submitEncBid"
  | "depositCallback"
  | "mxeDeposit"
  | "mxeReencrypt"
  | "mxeLedger";

const diagramSteps: {
  title: string;
  body: string;
  boxes: DiagramBoxId[];
  cpi?: boolean;
}[] = [
  {
    title: "Register and fund",
    body: "The client automatically registers an Umbra Encrypted Token Account (ETA) and funds it. This shielded balance is what every bid draws from.",
    boxes: ["start"],
  },
  {
    title: "Encrypt for Umbra",
    body: "The bid amount is encrypted so that only Umbra's MXE can decrypt it: bid = Enc_UMBRA(amount). ARCRYPT's own program never sees the plaintext.",
    boxes: ["encryptUmbra"],
  },
  {
    title: "CPI into Umbra's deposit",
    body: "ARCRYPT's place_bid instruction CPIs straight across into Umbra's deposit instruction, handing over the encrypted bid, vault address, and ETA.",
    boxes: ["placeBid", "umbraDeposit"],
    cpi: true,
  },
  {
    title: "Umbra's MXE takes over",
    body: "Umbra's own deposit instruction hands the encrypted bid to its MXE, which moves the decrypted amount into the vault's derived ETA.",
    boxes: ["umbraDeposit", "mxeDeposit"],
  },
  {
    title: "Re-encrypted for ARCRYPT",
    body: "Inside the same MXE, that amount is re-encrypted so only ARCRYPT's MXE can read it: bid = Enc_ARCRYPT(amount).",
    boxes: ["mxeDeposit", "mxeReencrypt"],
  },
  {
    title: "Umbra CPIs back",
    body: "Umbra's deposit_callback CPIs back into ARCRYPT's own program, calling submit_encrypted_bid and writing temp.bid / temp.ETA.",
    boxes: ["mxeReencrypt", "depositCallback", "submitEncBid"],
    cpi: true,
  },
  {
    title: "Back to placeEncryptedBid",
    body: "The confirmed bid is routed back down to the client's placeEncryptedBid call.",
    boxes: ["submitEncBid", "crank"],
  },
  {
    title: "Cranked into a temp account",
    body: "The cranked placeEncryptedBid call is picked up by ARCRYPT's place_encrypted_bid instruction.",
    boxes: ["crank", "placeEncBid"],
  },
  {
    title: "ARCRYPT updates its ledger",
    body: "ARCRYPT's own MXE decrypts the ciphertext and updates its internal bid ledger. The amount was never plaintext outside an MXE, and never visible in either program's on-chain state.",
    boxes: ["placeEncBid", "mxeLedger"],
  },
];

type BoxDef = {
  x: number;
  y: number;
  w: number;
  h: number;
  tag?: string;
  tagPos?: "above" | "below";
  lines: string[];
};

const BOX_DEFS: Record<DiagramBoxId, BoxDef> = {
  mxeLedger: { x: 90, y: 155, w: 200, h: 55, tag: "place_encrypted_bid", tagPos: "above", lines: ["update internal bid ledger"] },
  mxeReencrypt: { x: 435, y: 170, w: 150, h: 50, lines: ["bid =", "Enc_ARCRYPT(amount)"] },
  mxeDeposit: { x: 605, y: 150, w: 150, h: 75, tag: "deposit", tagPos: "above", lines: ["decrypted amount", "moves to vault_address", "derived ETA"] },

  placeEncBid: { x: 60, y: 300, w: 150, h: 55, tag: "place_encrypted_bid", tagPos: "above", lines: ["bid, ETA"] },
  submitEncBid: { x: 225, y: 300, w: 155, h: 55, tag: "submit_encrypted_bid", tagPos: "above", lines: ["temp.bid = bid", "temp.ETA = ETA"] },
  depositCallback: { x: 435, y: 300, w: 165, h: 55, tag: "deposit_callback", tagPos: "above", lines: ["submit_encrypted_bid(bid,", "ETA)"] },
  placeBid: { x: 60, y: 520, w: 195, h: 55, tag: "place_bid", tagPos: "above", lines: ["deposit(bid,", "vault_address, ETA)"] },
  umbraDeposit: { x: 595, y: 520, w: 165, h: 55, tag: "deposit", tagPos: "above", lines: ["bid, vault_address, ETA"] },

  encryptUmbra: { x: 60, y: 665, w: 300, h: 55, lines: ["bid = Enc_UMBRA(amount)", "createPlaceBid(bid, ETA)"] },
  crank: { x: 60, y: 820, w: 300, h: 55, tag: "auto cranker", tagPos: "below", lines: ["placeEncryptedBid(bid, ETA)"] },
  start: { x: 60, y: 935, w: 300, h: 65, tag: "start", tagPos: "above", lines: ["Automatically register an Umbra", "Encrypted Token Account (ETA)", "and fund it"] },
};

type ArrowDef = {
  path: string;
  cpi?: boolean;
  label?: { x: number; y: number };
  from: DiagramBoxId;
  to: DiagramBoxId;
};

const ARROW_DEFS: ArrowDef[] = [
  { from: "start", to: "encryptUmbra", path: "M 150 935 L 150 720" },
  { from: "encryptUmbra", to: "placeBid", path: "M 150 665 L 150 575" },
  { from: "crank", to: "placeEncBid", path: "M 290 820 L 290 400 L 135 355" },
  { from: "submitEncBid", to: "crank", path: "M 300 355 L 390 355 L 390 847 L 360 847" },
  { from: "placeEncBid", to: "mxeLedger", path: "M 135 300 L 135 240 L 190 210" },
  {
    from: "placeBid",
    to: "umbraDeposit",
    path: "M 255 547 L 595 547",
    cpi: true,
    label: { x: 425, y: 535 },
  },
  {
    from: "depositCallback",
    to: "submitEncBid",
    path: "M 435 327 L 380 327",
    cpi: true,
    label: { x: 407, y: 315 },
  },
  { from: "umbraDeposit", to: "mxeDeposit", path: "M 677 520 L 680 225" },
  { from: "mxeDeposit", to: "mxeReencrypt", path: "M 605 190 L 585 195" },
  { from: "mxeReencrypt", to: "depositCallback", path: "M 500 220 L 470 300" },
];

function FlowchartDiagram() {
  const [step, setStep] = useState(0);
  const active = diagramSteps[step];
  const isBoxActive = (id: DiagramBoxId) => active.boxes.includes(id);
  const isArrowActive = (a: ArrowDef) =>
    active.boxes.includes(a.from) && active.boxes.includes(a.to);

  return (
    <div className="grid gap-5 lg:grid-cols-[1.35fr_0.65fr]">
      <div className="surface overflow-x-auto p-3 md:p-5">
        <svg viewBox="0 0 780 1040" className="w-full min-w-[640px]" style={{ fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace" }}>
          <defs>
            <marker id="arrow" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 Z" fill="var(--muted)" />
            </marker>
            <marker id="arrow-active" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 Z" fill="var(--accent)" />
            </marker>
            <marker id="arrow-cpi" markerWidth="8" markerHeight="8" refX="6" refY="3" orient="auto">
              <path d="M0,0 L6,3 L0,6 Z" fill="#22d3ee" />
            </marker>
          </defs>

          {/* header */}
          <text x="210" y="34" textAnchor="middle" fill="var(--foreground)" fontSize="20" fontWeight="800">ARCRYPT SIDE</text>
          <text x="595" y="34" textAnchor="middle" fill="var(--foreground)" fontSize="20" fontWeight="800">UMBRA SIDE</text>

          {/* outer frame + row dividers */}
          <rect x="40" y="70" width="725" height="930" fill="none" stroke="var(--line-strong)" strokeWidth="1" />
          <line x1="40" y1="255" x2="765" y2="255" stroke="var(--line)" strokeWidth="1" />
          <line x1="40" y1="610" x2="765" y2="610" stroke="var(--line)" strokeWidth="1" />
          <line x1="403" y1="70" x2="403" y2="1000" stroke="#a68a2c" strokeWidth="2" />

          {/* row labels */}
          <text x="20" y="165" textAnchor="middle" fill="var(--muted)" fontSize="12" fontWeight="700" letterSpacing="1" transform="rotate(-90 20 165)">ARCIUM MXE</text>
          <text x="20" y="435" textAnchor="middle" fill="var(--muted)" fontSize="12" fontWeight="700" letterSpacing="1" transform="rotate(-90 20 435)">ANCHOR PROGRAM</text>
          <text x="20" y="805" textAnchor="middle" fill="var(--muted)" fontSize="12" fontWeight="700" letterSpacing="1" transform="rotate(-90 20 805)">CLIENT</text>

          {/* arrows (behind boxes) */}
          {ARROW_DEFS.map((a, i) => {
            const on = isArrowActive(a);
            const stroke = on ? (a.cpi ? "#22d3ee" : "var(--accent)") : a.cpi ? "#22d3ee" : "var(--line-strong)";
            const marker = on ? "url(#arrow-active)" : a.cpi ? "url(#arrow-cpi)" : "url(#arrow)";
            return (
              <g key={i} opacity={on ? 1 : a.cpi ? 0.55 : 0.45}>
                <path
                  d={a.path}
                  fill="none"
                  stroke={stroke}
                  strokeWidth={a.cpi ? 3 : on ? 2 : 1.5}
                  markerEnd={marker}
                  className="transition-all duration-300"
                />
                {a.label ? (
                  <text x={a.label.x} y={a.label.y} textAnchor="middle" fill="#22d3ee" fontSize="11" fontWeight="800" letterSpacing="1">
                    CPI
                  </text>
                ) : null}
              </g>
            );
          })}

          {/* boxes */}
          {(Object.entries(BOX_DEFS) as [DiagramBoxId, BoxDef][]).map(([id, b]) => {
            const on = isBoxActive(id);
            return (
              <g key={id} className="transition-all duration-300">
                {b.tag ? (
                  <text
                    x={b.x}
                    y={b.tagPos === "below" ? b.y + b.h + 16 : b.y - 8}
                    fill={on ? "var(--accent)" : "var(--muted)"}
                    fontSize="10"
                  >
                    {b.tag}
                  </text>
                ) : null}
                <rect
                  x={b.x}
                  y={b.y}
                  width={b.w}
                  height={b.h}
                  fill={on ? "color-mix(in srgb, var(--accent) 12%, var(--surface))" : "var(--surface)"}
                  stroke={on ? "var(--accent)" : "var(--line-strong)"}
                  strokeWidth={on ? 2 : 1}
                  className="transition-all duration-300"
                />
                {b.lines.map((line, i) => (
                  <text
                    key={i}
                    x={b.x + b.w / 2}
                    y={b.y + b.h / 2 - ((b.lines.length - 1) * 12) / 2 + i * 12 + 4}
                    textAnchor="middle"
                    fill={on ? "var(--foreground)" : "var(--muted)"}
                    fontSize="10.5"
                  >
                    {line}
                  </text>
                ))}
              </g>
            );
          })}

          <text x="40" y="1022" fill="var(--muted)" fontSize="10.5">
            Enc_UMBRA() = encrypted so only Umbra&#8217;s MXE can decrypt it. Enc_ARCRYPT() = encrypted so only ARCRYPT&#8217;s MXE can decrypt it.
          </text>
        </svg>
      </div>

      <div className="surface-strong flex flex-col justify-center p-6 md:p-8">
        <div className="text-xs uppercase tracking-[0.35em] text-[var(--muted)]">
          Step {step + 1} of {diagramSteps.length}
        </div>
        <h4 className="mt-3 text-2xl font-black tracking-tight text-[var(--foreground)]">{active.title}</h4>
        <p className="mt-3 text-sm leading-6 text-[var(--muted)]">{active.body}</p>
        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={() => setStep((s) => (s + diagramSteps.length - 1) % diagramSteps.length)}
            className="btn text-xs font-semibold uppercase tracking-[0.2em]"
          >
            Back
          </button>
          <button
            type="button"
            onClick={() => setStep((s) => (s + 1) % diagramSteps.length)}
            className="btn btn-primary text-xs font-semibold uppercase tracking-[0.2em]"
          >
            Next
          </button>
        </div>
      </div>
    </div>
  );
}

const capabilities: { title: string; body: string }[] = [
  { title: "First-price", body: "Highest bidder wins, pays their own bid." },
  { title: "Vickrey", body: "Highest bidder wins, pays the second-highest bid." },
  { title: "Uniform-price", body: "Multiple winners, one clearing price for everyone." },
  { title: "DAO treasuries", body: "Sealed liquidations through Realms governance proposals." },
];

const applications: { num: string; title: string; body: string; badge: "LIVE" | "NEXT" }[] = [
  {
    num: "i",
    title: "Real-world assets",
    body: "A house. A graded trading card. A single .sol domain. The kind of sale where there's only one of the thing, and a fair price only shows up if nobody can see the other bids. The rails to list these already exist on Solana. The sealed sale doesn't, yet.",
    badge: "NEXT",
  },
  {
    num: "ii",
    title: "1-of-1 digital collectibles",
    body: "Sealed single-item sales: an NFT, a rare in-game item, anything with exactly one or a handful of winners at the end, for a single item or a limited number of prizes. The winners and price are the only things anyone ever sees.",
    badge: "LIVE",
  },
  {
    num: "iii",
    title: "DAO treasury sales",
    body: "Plug straight into Realms governance: propose a sealed liquidation, vote, settle. No public reserve price to give away before the vote even passes.",
    badge: "LIVE",
  },
  {
    num: "iv",
    title: "Private B2B tenders",
    body: "Same circuits, off-chain settlement, for procurement and deals that were never going to be public anyway.",
    badge: "NEXT",
  },
];

const rwaRails: { rail: string; sells: string }[] = [
  { rail: "Jupiter Gacha", sells: "Single mystery-box pull, sealed" },
  { rail: "Collector Crypt", sells: "Single graded card, sealed" },
  { rail: "Credix", sells: "Lenders sealed-bid the rate, lowest wins" },
  { rail: "Bonfida SNS", sells: "Premium .sol domain drops, sealed" },
];

const builtItems = [
  "Anchor program: auctions, escrow, settlement",
  "Arcis circuits: private bid ranking",
];

const notBuiltItems = [
  "Umbra CPI: sealed, shielded escrow",
  "Devnet redeployment",
  "Mainnet deployment",
  "Public marketplace / discovery UI",
  "Third-party asset adapters",
];

const teamMembers: { name: string; role: string }[] = [
  { name: "badam3000", role: "Oxford, Electrical Engineering" },
];

export default function HomePage() {
  const [showTitle, setShowTitle] = useState(false);
  const [activeStep, setActiveStep] = useState(0);
  const heroRef = useRef<HTMLElement | null>(null);
  const heroVideoRef = useRef<HTMLVideoElement | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setShowTitle(true), 150);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    const video = heroVideoRef.current;
    if (!video) return;
    video.muted = true;
    video.setAttribute("muted", "");
    const playPromise = video.play();
    if (playPromise && typeof playPromise.catch === "function") {
      playPromise.catch(() => {});
    }
  }, []);

  useEffect(() => {
    const el = heroRef.current;
    if (!el) return;
    const handleMove = (e: MouseEvent) => {
      const rect = el.getBoundingClientRect();
      el.style.setProperty("--mx", `${((e.clientX - rect.left) / rect.width) * 100}%`);
      el.style.setProperty("--my", `${((e.clientY - rect.top) / rect.height) * 100}%`);
    };
    el.addEventListener("mousemove", handleMove);
    return () => el.removeEventListener("mousemove", handleMove);
  }, []);

  return (
    <main className="page-shell min-h-[100svh] overflow-x-hidden">
      {/* HERO */}
      <section
        ref={heroRef}
        className="page-section relative isolate flex min-h-[100svh] w-full items-center justify-center overflow-hidden py-20 md:py-28"
        style={{ ["--mx" as string]: "50%", ["--my" as string]: "50%" }}
      >
        <div className="absolute inset-0 z-0 overflow-hidden">
          <video
            ref={heroVideoRef}
            autoPlay
            muted
            loop
            playsInline
            disablePictureInPicture
            disableRemotePlayback
            preload="auto"
            aria-hidden="true"
            tabIndex={-1}
            controlsList="nodownload nofullscreen noremoteplayback"
            className="pointer-events-none h-full w-full object-cover brightness-[0.55] contrast-125"
          >
            <source src="/backdrop.mp4" type="video/mp4" />
          </video>
          <div className="absolute inset-0 bg-black/40" />
          <div
            className="absolute inset-0 transition-[background] duration-200"
            style={{
              background:
                "radial-gradient(circle at var(--mx) var(--my), rgba(0,230,118,0.22), transparent 32%)",
            }}
          />
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,rgba(0,230,118,0.12),transparent_45%),radial-gradient(circle_at_bottom,rgba(255,255,255,0.05),transparent_30%)]" />
          <CipherRain />
        </div>

        <div className="relative z-10 mx-auto flex w-full max-w-6xl flex-col items-center px-6 text-center">
          <div
            className={`badge-accent text-[10px] uppercase tracking-[0.4em] transition-all duration-700 ${
              showTitle ? "translate-y-0 opacity-100" : "translate-y-3 opacity-0"
            }`}
          >
Preview closed &middot; Alpha next &middot; Devnet
          </div>

          <h1
            className={`mt-8 text-7xl font-extrabold leading-none tracking-tight text-white transition-all duration-700 md:text-9xl lg:text-[10rem] ${
              showTitle ? "translate-y-0 opacity-100" : "translate-y-5 opacity-0"
            }`}
            style={{ fontFamily: "Arial, Helvetica, sans-serif", textShadow: "0 0 40px rgba(0,230,118,0.25)" }}
          >
            ARCRYPT
          </h1>

          <p
            className={`mt-6 max-w-3xl text-2xl font-semibold leading-tight tracking-tight text-[var(--muted)] transition-all delay-100 duration-700 md:text-4xl ${
              showTitle ? "translate-y-0 opacity-100" : "translate-y-5 opacity-0"
            }`}
          >
            Sealed-bid auctions on Solana, built to kill
            <br className="sm:hidden" /> <RotatingWord />
          </p>

          <div
            className={`mt-10 flex flex-col justify-center gap-4 sm:flex-row transition-all delay-300 duration-700 ${
              showTitle ? "translate-y-0 opacity-100" : "translate-y-5 opacity-0"
            }`}
          >
            <a
              href="#how-it-works"
              onClick={(e) => {
                e.preventDefault();
                document.getElementById("how-it-works")?.scrollIntoView({ behavior: "smooth" });
              }}
              className="btn btn-primary text-sm font-semibold uppercase tracking-[0.2em] md:text-base"
            >
              See how it works
            </a>
            <Link href="/docs" className="btn text-sm font-semibold uppercase tracking-[0.2em] md:text-base">
              Read the docs
            </Link>
          </div>
        </div>

        <div className="absolute bottom-8 left-1/2 z-10 -translate-x-1/2 animate-bounce text-[var(--muted)]">
          <span className="text-xs uppercase tracking-[0.3em]">Scroll</span>
        </div>
      </section>

      {/* TEAM / CONTACT */}
      <section className="page-section border-t border-[var(--line)] px-6 py-16 md:py-20">
        <div className="mx-auto max-w-6xl">
          <Reveal>
            <Eyebrow n="02" label="Who's behind it" />
            <h2 className="mt-4 text-5xl font-black leading-[0.95] tracking-tight text-[var(--foreground)] md:text-7xl">
              Created by an Oxford electrical engineering undergraduate
            </h2>
          </Reveal>

          <div className="mt-14 border-t border-[var(--line)]">
            {teamMembers.map((member, i) => (
              <Reveal key={member.name} delayMs={i * 100}>
                <div className="flex flex-col justify-between gap-1 border-b border-[var(--line)] py-6 sm:flex-row sm:items-baseline">
                  <div className="text-2xl font-bold tracking-tight text-[var(--foreground)] md:text-3xl">
                    {member.name}
                  </div>
                  <div className="text-sm text-[var(--muted)]">{member.role}</div>
                </div>
              </Reveal>
            ))}
          </div>

          <Reveal className="mt-16 border-t border-[var(--line)] pt-10">
            <div>
              <div className="text-[10px] uppercase tracking-[0.3em] text-[var(--muted)]">Twitter</div>
              <a
                href="https://x.com/arcrypt_bid"
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 block text-sm font-semibold text-accent hover:underline"
              >
                @arcrypt_bid
              </a>
            </div>
          </Reveal>
        </div>
      </section>

      {/* WRITEUP */}
      <section className="page-section border-t border-[var(--line)]">
        <div className="flex min-h-[70svh] w-full gap-2">
          <Link
            href="/writeup"
            className="group relative flex w-3/4 items-end overflow-hidden"
          >
            <div className="absolute inset-0">
              <Image
                src="/backdrop-snow.jpg"
                alt=""
                fill
                className="object-cover opacity-80 grayscale transition duration-700 group-hover:opacity-100 group-hover:grayscale-0"
              />
              <div className="absolute inset-0 bg-black/45" />
            </div>

            <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
              <Image
                src="/logo/icon-transparent.png"
                alt=""
                width={220}
                height={220}
                className="opacity-90 drop-shadow-[0_0_40px_rgba(0,230,118,0.35)] transition duration-700 group-hover:scale-105"
              />
            </div>

            <div className="relative z-10 w-full px-6 pb-12 md:px-10 md:pb-16">
              <div className="text-4xl font-black tracking-tight text-white underline decoration-2 underline-offset-8 md:text-6xl">
                arcrypt
              </div>
              <div className="mt-2 text-sm uppercase tracking-[0.3em] text-white/70">2026</div>
              <div className="mt-6 inline-flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.2em] text-accent">
                Read the writeup
                <span className="transition-transform group-hover:translate-x-1">→</span>
              </div>
            </div>
          </Link>

          <a
            href="https://x.com/ginxnumerouno/status/2060090127418843506"
            target="_blank"
            rel="noopener noreferrer"
            className="group relative flex w-1/4 items-end overflow-hidden bg-[var(--surface-2)]"
          >
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,rgba(0,230,118,0.12),transparent_60%)]" />

            <div className="pointer-events-none absolute inset-0 flex items-center justify-center opacity-20 transition-opacity duration-500 group-hover:opacity-35">
              <svg width="72" height="72" viewBox="0 0 24 24" fill="currentColor" className="text-[var(--foreground)]">
                <path d="M18.9 2H22l-7.6 8.7L23.3 22h-6.9l-5.4-6.9L4.8 22H1.7l8.1-9.3L1 2h7l4.9 6.3L18.9 2Zm-1.2 18h1.9L7.4 4H5.4l12.3 16Z" />
              </svg>
            </div>

            <div className="relative z-10 w-full px-5 pb-12 md:pb-16">
              <div className="text-xs uppercase tracking-[0.3em] text-[var(--muted)]">Also worth a read</div>
              <div className="mt-2 text-lg font-bold tracking-tight text-white">@ginxnumerouno</div>
              <div className="mt-4 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.2em] text-accent">
                Read the thread
                <span className="transition-transform group-hover:translate-x-1">→</span>
              </div>
            </div>
          </a>
        </div>
      </section>

      {/* WHY SEALED */}
      <section className="page-section border-t border-[var(--line)]">
        <div className="mx-auto max-w-6xl px-6 pt-16 md:pt-20">
          <Reveal>
            <Eyebrow n="03" label="The problem" />
            <h2 className="mt-4 text-5xl font-black leading-[0.95] tracking-tight text-[var(--foreground)] md:text-7xl">
              We solved an open problem in cryptography
            </h2>
          </Reveal>
        </div>

        <ScrollHighlightText text="On a public blockchain, a bid is never private. The instant it lands, bots read it and front-run you. Rivals see your ceiling before you've finished typing it. What should be an auction becomes a leak, one bid at a time." />
      </section>

      {/* HOW IT WORKS */}
      <section id="how-it-works" className="page-section border-t border-[var(--line)] px-6 py-16 md:py-20">
        <div className="mx-auto max-w-6xl">
          <Reveal>
            <Eyebrow n="04" label="How it works" />
            <h2 className="mt-4 text-5xl font-black leading-[0.95] tracking-tight text-[var(--foreground)] md:text-7xl">
              Encrypted from the first click to the last reveal
            </h2>
            <p className="mt-6 max-w-3xl text-lg leading-8 text-[var(--muted)] md:text-2xl md:leading-10">
              Three pieces of cryptography work together so that a bid amount is never visible in
              plaintext, anywhere, at any point. Not to other bidders, not to validators, not to us.
              As far as we know, nobody has combined MPC-computed auctions with encrypted, Umbra-shielded
              bid escrows before. That combination is what ARCRYPT actually is.
            </p>
          </Reveal>

          <div className="mt-14 grid gap-5 lg:grid-cols-[0.85fr_1.15fr]">
            <Reveal>
              <div className="surface flex h-full flex-col gap-3 p-2">
                {flowSteps.map((step, i) => {
                  const active = i === activeStep;
                  return (
                    <button
                      key={step.n}
                      type="button"
                      onClick={() => setActiveStep(i)}
                      className={`group flex items-center gap-4 border p-4 text-left transition duration-300 ${
                        active ? "card-active" : "surface surface-hover"
                      }`}
                    >
                      <div
                        className={`flex h-10 w-10 shrink-0 items-center justify-center border text-sm font-black ${
                          active
                            ? "bg-accent text-black"
                            : "border-[var(--line)] bg-[var(--background)] text-[var(--muted)]"
                        }`}
                      >
                        {step.n}
                      </div>
                      <div className="min-w-0">
                        <div
                          className={`text-sm font-semibold ${
                            active ? "text-[var(--foreground)]" : "text-[var(--muted)] group-hover:text-white"
                          }`}
                        >
                          {step.title}
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </Reveal>

            <Reveal>
              <div className="surface-strong flex h-full flex-col justify-center p-8 md:p-10">
                <div className="text-xs uppercase tracking-[0.35em] text-[var(--muted)]">
                  Step {activeStep + 1} of {flowSteps.length}
                </div>
                <h3 className="mt-4 text-3xl font-black tracking-tight text-[var(--foreground)] md:text-4xl">
                  {flowSteps[activeStep].title}
                </h3>
                <p className="mt-4 text-base leading-7 text-[var(--muted)] md:text-lg">
                  {flowSteps[activeStep].body}
                </p>

                <div className="mt-8 flex gap-3">
                  <button
                    type="button"
                    onClick={() => setActiveStep((s) => (s + flowSteps.length - 1) % flowSteps.length)}
                    className="btn text-sm font-semibold uppercase tracking-[0.2em]"
                  >
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveStep((s) => (s + 1) % flowSteps.length)}
                    className="btn btn-primary text-sm font-semibold uppercase tracking-[0.2em]"
                  >
                    Next
                  </button>
                </div>
              </div>
            </Reveal>
          </div>

          <Reveal className="mt-14">
            <div className="grid gap-5 sm:grid-cols-3">
              <div className="card p-6">
                <div className="text-[10px] uppercase tracking-[0.3em] text-accent">Solana program</div>
                <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
                  Owns auction state, settlement, and every instruction that moves an asset or a fee.
                </p>
              </div>
              <div className="card p-6">
                <div className="text-[10px] uppercase tracking-[0.3em] text-accent">Umbra</div>
                <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
                  A shielded pool ARCRYPT CPIs into so escrow balances stay hidden, not just encrypted.
                </p>
              </div>
              <div className="card p-6">
                <div className="text-[10px] uppercase tracking-[0.3em] text-accent">Arcium MPC</div>
                <p className="mt-3 text-sm leading-6 text-[var(--muted)]">
                  Compares bids as ciphertext, split across independent nodes so no one node sees a full bid.
                </p>
              </div>
            </div>
          </Reveal>

          <Reveal className="mt-14">
            <div className="mb-6">
              <div className="text-[10px] uppercase tracking-[0.3em] text-accent">Under the hood</div>
              <h3 className="mt-2 text-2xl font-black tracking-tight text-[var(--foreground)] md:text-3xl">
                The actual CPI handoff between ARCRYPT and Umbra
              </h3>
            </div>
            <FlowchartDiagram />
          </Reveal>
        </div>
      </section>

      {/* CODE SHOWCASE */}
      <section className="page-section relative overflow-hidden border-t border-[var(--line)]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_20%,rgba(0,230,118,0.10),transparent_50%)]" />

        <div className="relative mx-auto max-w-5xl px-6 pt-16 md:pt-20">
          <Eyebrow n="05" label="The SDK" />
          <h2 className="mt-4 max-w-3xl text-4xl font-black leading-[0.95] tracking-tight text-[var(--foreground)] md:text-6xl">
            A super simple SDK
          </h2>
        </div>

        <PinWrapper heightVh={145} fillFraction={0.8}>
          {(progress) => (
            <div className="relative mx-auto w-full max-w-6xl">
              <div className="grid gap-5 md:grid-cols-2 md:[&>*]:min-w-0">
                <EditorPanel filename="auction.ts">
                  <CodeReveal
                    progress={progress}
                    gutter
                    lines={[
                      <span key="1" className="text-[var(--muted)]">
                        <span className="text-[#c586c0]">import</span> {"{ "}
                        <span className="text-accent font-black">createAuction</span>
                        {" }"} <span className="text-[#c586c0]">from</span> <span className="text-[#ce9178]">&quot;@arcrypt/sdk&quot;</span>;
                      </span>,
                      <span key="2">&nbsp;</span>,
                      <span key="3">
                        <span className="text-accent font-black">createAuction</span>
                        <span className="text-white">{"({"}</span>
                      </span>,
                      <span key="4">
                        <span className="pl-6 text-[#9cdcfe]">auctionType</span>: <span className="text-[#ce9178]">&quot;Vickrey&quot;</span>,
                      </span>,
                      <span key="5">
                        <span className="pl-6 text-[#9cdcfe]">assetKind</span>: <span className="text-[#ce9178]">&quot;Fungible&quot;</span>,
                      </span>,
                      <span key="6">
                        <span className="pl-6 text-[#9cdcfe]">minBidSol</span>: <span className="text-[#ce9178]">&quot;1.5&quot;</span>,
                      </span>,
                      <span key="7">
                        <span className="pl-6 text-[#9cdcfe]">durationSecs</span>: <span className="text-[#b5cea8]">3600</span>,
                      </span>,
                      <span key="8">
                        <span className="text-white">{"});"}</span>
                      </span>,
                    ]}
                  />
                </EditorPanel>

                <EditorPanel filename="bid.ts">
                  <CodeReveal
                    progress={progress}
                    gutter
                    lines={[
                      <span key="1" className="text-[var(--muted)]">
                        <span className="text-[#c586c0]">import</span> {"{ "}
                        <span className="text-accent font-black">createPlaceBid</span>
                        {" }"} <span className="text-[#c586c0]">from</span> <span className="text-[#ce9178]">&quot;@arcrypt/sdk&quot;</span>;
                      </span>,
                      <span key="2">&nbsp;</span>,
                      <span key="3">
                        <span className="text-accent font-black">createPlaceBid</span>
                        <span className="text-white">{"({"}</span>
                      </span>,
                      <span key="4">
                        <span className="pl-6 text-[#9cdcfe]">auctionPk</span>,
                      </span>,
                      <span key="5">
                        <span className="pl-6 text-[#9cdcfe]">bidAmountSol</span>: <span className="text-[#ce9178]">&quot;2.5&quot;</span>,
                      </span>,
                      <span key="6">
                        <span className="text-white">{"});"}</span>
                      </span>,
                      <span key="7">&nbsp;</span>,
                      <span key="8" className="text-[var(--muted)]">
                        <span className="text-[#6a9955]">// sealed. nobody sees this until it wins.</span>
                      </span>,
                    ]}
                  />
                </EditorPanel>
              </div>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <Link href="/docs" className="btn btn-primary text-sm font-semibold uppercase tracking-[0.2em] md:text-base">
                  Read the SDK docs
                </Link>
              </div>
            </div>
          )}
        </PinWrapper>
      </section>

      {/* PRODUCT PREVIEW */}
      <section className="page-section border-t border-[var(--line)] px-6 py-16 md:py-20">
        <div className="mx-auto max-w-6xl">
          <Reveal>
            <Eyebrow n="06" label="The app" />
            <h2 className="mt-4 text-5xl font-black leading-[0.95] tracking-tight text-[var(--foreground)] md:text-7xl">
              Placing a sealed bid
            </h2>
          </Reveal>

          <Reveal className="mt-12">
            <BidPreview />
          </Reveal>

          <Reveal className="mt-16">
            <h3 className="text-3xl font-black tracking-tight text-[var(--foreground)] md:text-4xl">
              DAO treasury proposals
            </h3>
          </Reveal>

          <Reveal className="mt-6">
            <GovernancePreview />
          </Reveal>
        </div>
      </section>

      {/* APPLICATIONS */}
      <section className="page-section border-t border-[var(--line)] px-6 py-16 md:py-20">
        <div className="mx-auto max-w-6xl">
          <Reveal>
            <Eyebrow n="08" label="Applications" />
            <h2 className="mt-4 text-5xl font-black leading-[0.95] tracking-tight text-[var(--foreground)] md:text-7xl">
              Not tokens. Items.
            </h2>
            <p className="mt-6 max-w-3xl text-lg leading-8 text-[var(--muted)] md:text-2xl md:leading-10">
              Platforms like crafts.dev already do fungible token raises well, a pool of buyers, a
              pool of tokens, everyone gets a slice. That model breaks down the moment there's only
              one of something. ARCRYPT is a different mechanism entirely: one asset, one winner, no
              order book, no shared pool, built specifically for single-item sales.
            </p>
          </Reveal>

          <Reveal className="mt-14">
            <ApplicationsList />
          </Reveal>

          <Reveal className="mt-14" delayMs={100}>
            <div className="text-xs uppercase tracking-[0.35em] text-[var(--muted)]">
              Where real-world assets could plug in
            </div>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--muted)]">
              Each rail needs its own asset adapter, but the settlement rails already exist on Solana.
              Every card below is one item, one sale, one winner.
            </p>
            <div className="mt-6 grid grid-cols-2 gap-4 lg:grid-cols-4">
              {rwaRails.map((row, i) => (
                <TiltCard key={row.rail} index={i} total={rwaRails.length} title={row.rail} subtitle={row.sells} />
              ))}
            </div>
          </Reveal>
        </div>
      </section>

      {/* STATUS */}
      <section className="page-section border-t border-[var(--line)]">
        <div className="mx-auto max-w-6xl px-6 pt-16 md:pt-20">
          <Reveal>
            <Eyebrow n="09" label="Status" />
            <h2 className="mt-4 text-5xl font-black leading-[0.95] tracking-tight text-[var(--foreground)] md:text-7xl">
              The preview is over. Alpha is next.
            </h2>
            <p className="mt-6 max-w-3xl text-lg leading-8 text-[var(--muted)] md:text-2xl md:leading-10">
              The protocol works end to end on devnet. Alpha is where it gets used, broken, and
              hardened before mainnet.
            </p>
          </Reveal>

          <Reveal className="mt-10">
            <div className="flex flex-wrap gap-3">
              <span className="badge-accent text-[10px] uppercase tracking-[0.2em]">Alpha</span>
              <span className="badge text-[10px] uppercase tracking-[0.2em]">Devnet &middot; program live</span>
            </div>
          </Reveal>
        </div>

        <PinWrapper heightVh={105} fillFraction={0.9}>
          {(progress) => (
            <div className="mx-auto w-full max-w-6xl px-6">
              <div className="border border-[var(--line-strong)] bg-black">
                <div className="flex items-center gap-2 border-b border-[var(--line)] bg-[#0a0a0a] px-4 py-3">
                  <span className="chrome-dot h-3 w-3 bg-[#ff5f56]" />
                  <span className="chrome-dot h-3 w-3 bg-[#ffbd2e]" />
                  <span className="chrome-dot h-3 w-3 bg-[#27c93f]" />
                  <span className="ml-3 text-xs text-[var(--muted)]">status.log</span>
                </div>
                <div className="p-6 font-mono text-sm leading-8 md:p-8 md:text-base">
                  <CodeReveal
                    progress={progress}
                    lines={[
                      ...builtItems.map((item, i) => (
                        <div key={`built-${i}`}>
                          <span className="text-accent">[OK]</span>{" "}
                          <span className="text-[var(--foreground)]">{item}</span>
                        </div>
                      )),
                      ...notBuiltItems.map((item, i) => (
                        <div key={`todo-${i}`}>
                          <span className="text-[var(--muted)]">[TODO]</span>{" "}
                          <span className="text-[var(--muted)]">{item}</span>
                        </div>
                      )),
                    ]}
                  />
                </div>
              </div>
            </div>
          )}
        </PinWrapper>
      </section>

      {/* SOURCE AVAILABLE */}
      <section className="page-section border-t border-[var(--line)] px-6 py-16 md:py-20">
        <div className="mx-auto max-w-6xl">
          <Reveal>
            <Eyebrow n="10" label="Source available" />
          </Reveal>

          <Reveal className="mt-6">
            <GitHubPanel repo="b-adamson/arcrypt" />
          </Reveal>
        </div>
      </section>

    </main>
  );
}
