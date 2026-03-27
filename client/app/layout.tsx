// app/layout.tsx (or wherever your RootLayout lives)
import "@solana/wallet-adapter-react-ui/styles.css";
import SolanaWalletProvider from "./providers/SolanaWalletProvider";
import Header from "../components/Header";
import Footer from "../components/Footer";
import "../globals.css";

import { Inter_Tight } from "next/font/google";

// Call the font function to get the object that contains `.className`
const interTight = Inter_Tight({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  display: "swap",
});

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={interTight.className}>
<body className="bg-[#05050a] text-white antialiased">
  <SolanaWalletProvider>
    <Header />
    <main className="min-h-screen bg-[radial-gradient(circle_at_top,rgba(217,70,239,0.10),transparent_30%),radial-gradient(circle_at_bottom_right,rgba(34,211,238,0.08),transparent_28%)] pt-20 pb-24">
      {children}
    </main>
    <Footer />
  </SolanaWalletProvider>
</body>
    </html>
  );
}