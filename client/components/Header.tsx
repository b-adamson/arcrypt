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
      <Link
        href="/auction"
        className="relative px-4 py-2 text-black bg-[var(--accent)] font-bold tracking-wide border border-[var(--accent)] overflow-hidden transition-all duration-300 hover:scale-105 hover:shadow-[0_0_18px_var(--accent)]"
      >
        <span className="relative z-10">Create project</span>
        <span className="absolute inset-0 opacity-0 hover:opacity-100 transition duration-300 bg-[radial-gradient(circle_at_center,var(--accent)_0%,transparent_70%)] blur-md"></span>
      </Link>

      <Link href="/market" className="text-[var(--foreground)]/80 hover:text-white transition">
        View projects
      </Link>
      <Link href="/profile" className="text-[var(--foreground)]/80 hover:text-white transition">
        Profile
      </Link>
      <Link href="/docs" className="text-[var(--foreground)]/80 hover:text-white transition">
        Docs
      </Link>
      <Link
        href="/umbra"
        className="text-[var(--foreground)]/70 hover:text-white transition leading-tight text-center"
      >
        <span className="block">Encrypted Balance</span>
      </Link>
    </nav>
    <div className="scale-95 brightness-110">
      <WalletSection />
    </div>
  </div>
</header>
  );
}