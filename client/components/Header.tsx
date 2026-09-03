"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";

const GITHUB_REPO = "b-adamson/arcrypt";

export default function Header() {
  const pathname = usePathname();
  const isHomePage = pathname === "/home";
  const hideChrome = pathname === "/writeup";
  const [visible, setVisible] = useState(!isHomePage);
  const [stars, setStars] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`https://api.github.com/repos/${GITHUB_REPO}`, {
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
  }, []);

  useEffect(() => {
    if (!isHomePage) {
      setVisible(true);
      return;
    }

    const handleScroll = () => {
      if (window.scrollY > 120) {
        setVisible(true);
      } else {
        setVisible(false);
      }
    };

    const handleMouseMove = (e: MouseEvent) => {
      if (e.clientY < 80) {
        setVisible(true);
      } else if (window.scrollY <= 120) {
        setVisible(false);
      }
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    window.addEventListener("mousemove", handleMouseMove);

    handleScroll();

    return () => {
      window.removeEventListener("scroll", handleScroll);
      window.removeEventListener("mousemove", handleMouseMove);
    };
  }, [isHomePage]);

  if (hideChrome) return null;

  return (
  <header
  className={`fixed left-0 top-0 z-50 w-full border-b border-[var(--line-strong)] bg-[var(--background)]/95 backdrop-blur-xl transition-all duration-300 shadow-[0_4px_30px_rgba(0,0,0,0.6)] ${
    visible
      ? "translate-y-0 opacity-100 pointer-events-auto"
      : "-translate-y-4 opacity-0 pointer-events-none"
  }`}
>
  <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
    <Link href="/" className="relative h-10 w-32 overflow-hidden group">
      <Image
        src="/logo/GRADIENT_TRANSPARENT.png"
        alt="ARCRYPT logo"
        fill
        className="object-cover scale-110 transition duration-300 group-hover:scale-115 group-hover:brightness-125"
        priority
      />
    </Link>
    <nav className="flex items-center gap-6 text-sm font-semibold tracking-wide">
      
      <Link href="/" className="text-[var(--foreground)]/80 hover:text-white transition">
        Home
      </Link>
      <Link href="/docs" className="text-[var(--foreground)]/80 hover:text-white transition">
        Docs
      </Link>
      <a
        href={`https://github.com/${GITHUB_REPO}`}
        target="_blank"
        rel="noopener noreferrer"
        className="flex items-center gap-1.5 text-[var(--foreground)]/80 hover:text-white transition"
      >
        <span>GitHub</span>
        {stars !== null ? (
          <span className="flex items-center gap-1 border-l border-[var(--line)] pl-1.5 text-xs font-medium text-[var(--muted)]">
            <svg width="11" height="11" viewBox="0 0 16 16" fill="currentColor" className="text-accent">
              <path d="M8 .25a.75.75 0 0 1 .673.418l1.882 3.815 4.21.612a.75.75 0 0 1 .416 1.279l-3.046 2.97.719 4.192a.75.75 0 0 1-1.088.79L8 12.347l-3.766 1.98a.75.75 0 0 1-1.088-.79l.72-4.192-3.047-2.97a.75.75 0 0 1 .416-1.28l4.21-.611L7.327.668A.75.75 0 0 1 8 .25Z" />
            </svg>
            {stars}
          </span>
        ) : null}
      </a>
    </nav>
  </div>
</header>
  );
}