"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import dynamic from "next/dynamic";
import Image from "next/image";
import { usePathname } from "next/navigation";

const WalletMultiButton = dynamic(
  () =>
    import("@solana/wallet-adapter-react-ui").then(
      (mod) => mod.WalletMultiButton
    ),
  { ssr: false }
);

export default function Header() {
  const pathname = usePathname();
  const isHomePage = pathname === "/home"; // change to "/" if your homepage route is root
  const [visible, setVisible] = useState(!isHomePage);

  useEffect(() => {
    if (!isHomePage) {
      setVisible(true);
      return;
    }

    const handleScroll = () => {
      setVisible(window.scrollY > 120);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    handleScroll();

    return () => window.removeEventListener("scroll", handleScroll);
  }, [isHomePage]);

  return (
    <header
      className={`fixed top-0 left-0 w-full z-50 backdrop-blur-xl bg-white/5 border-b border-white/10 transition-all duration-300 ${
        visible
          ? "opacity-100 translate-y-0 pointer-events-auto"
          : "opacity-0 -translate-y-4 pointer-events-none"
      }`}
    >
      <div className="max-w-7xl mx-auto flex items-center justify-between px-6 py-3">
        <Link href="/" className="relative h-10 w-32 overflow-hidden">
          <Image
            src="/logo/GRADIENT_TRANSPARENT.png"
            alt="ARCIBID logo"
            fill
            className="object-cover scale-110"
            priority
          />
        </Link>

        <nav className="flex items-center gap-6 text-sm text-gray-300">
          <Link href="/" className="hover:text-white transition">
            Home
          </Link>
          <Link href="/auction" className="hover:text-white transition">
            Create auction
          </Link>
          <Link href="/market" className="hover:text-white transition">
            View auctions
          </Link>
          <Link href="/profile" className="hover:text-white transition">
            Profile
          </Link>
          <Link href="/docs" className="hover:text-white transition">
            Docs
          </Link>
        </nav>

        <div className="scale-90">
          <WalletMultiButton />
        </div>
      </div>
    </header>
  );
}