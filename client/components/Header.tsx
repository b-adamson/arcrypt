"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { usePathname } from "next/navigation";
import WalletSection from "../components/WalletSection";

export default function Header() {
  const pathname = usePathname();
  const isHomePage = pathname === "/home";
  const [visible, setVisible] = useState(!isHomePage);

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

  return (
    <header
      className={`fixed left-0 top-0 z-50 w-full border-b border-[var(--line)] bg-[var(--background)]/95 backdrop-blur-xl transition-all duration-300 ${
        visible ? "translate-y-0 opacity-100 pointer-events-auto" : "-translate-y-4 opacity-0 pointer-events-none"
      }`}
    >
      <div className="mx-auto flex max-w-7xl items-center justify-between px-6 py-3">
        <Link href="/" className="relative h-10 w-32 overflow-hidden">
          <Image
            src="/logo/GRADIENT_TRANSPARENT.png"
            alt="ARCRYPT logo"
            fill
            className="object-cover scale-110"
            priority
          />
        </Link>

        <nav className="flex items-center gap-6 text-sm text-[var(--muted)]">
          <Link href="/" className="transition hover:text-[var(--foreground)]">
            Home
          </Link>
          <Link href="/auction" className="transition hover:text-[var(--foreground)]">
            Create auction
          </Link>
          <Link href="/market" className="transition hover:text-[var(--foreground)]">
            View auctions
          </Link>
          <Link href="/profile" className="transition hover:text-[var(--foreground)]">
            Profile
          </Link>
          <Link href="/docs" className="transition hover:text-[var(--foreground)]">
            Docs
          </Link>
        </nav>

        <div className="scale-90">
          <WalletSection />
        </div>
      </div>
    </header>
  );
}