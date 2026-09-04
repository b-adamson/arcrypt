"use client";

import "@solana/wallet-adapter-react-ui/styles.css";
import SolanaWalletProvider from "./providers/SolanaWalletProvider";
import Header from "../components/Header";
import Footer from "../components/Footer";
import "../globals.css";

import { Inter_Tight, Fraunces } from "next/font/google";
import { usePathname } from "next/navigation";

const interTight = Inter_Tight({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  display: "swap",
});

const fraunces = Fraunces({
  subsets: ["latin"],
  weight: ["500", "600", "700", "900"],
  style: ["normal", "italic"],
  display: "swap",
  variable: "--font-serif",
});

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isHomePage = pathname === "/home"; 

  return (
    <html lang="en" className={`${interTight.className} ${fraunces.variable}`}>
      <body className="bg-[#05050a] text-white antialiased">
        <SolanaWalletProvider>
          <Header />

          <main className={`min-h-screen bg-[#00000] pb-24 ${isHomePage ? "pt-0" : "pt-10"}`}>
            {children}
          </main>

          <Footer />
        </SolanaWalletProvider>
      </body>
    </html>
  );
}