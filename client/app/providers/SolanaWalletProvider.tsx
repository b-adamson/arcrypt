// app/providers/SolanaWalletProvider.tsx
"use client";

import React, { useMemo } from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { PhantomWalletAdapter } from "@solana/wallet-adapter-phantom";
import { clusterApiUrl } from "@solana/web3.js";
import { WalletAdapterNetwork } from "@solana/wallet-adapter-base";

type Props = { children: React.ReactNode };

export default function SolanaWalletProvider({ children }: Props) {
  // choose network
  const network = WalletAdapterNetwork.Devnet;

  // endpoint for ConnectionProvider
  const endpoint = useMemo(() => clusterApiUrl(network), [network]);

  // list of adapters: add more adapters here if you want (Solflare, Torus, etc.)
  const wallets = useMemo(
    () => [
      new PhantomWalletAdapter({ network }),
      // e.g. new SolflareWalletAdapter({ network }), etc.
    ],
    [network]
  );

  return (
    <ConnectionProvider endpoint={endpoint}>
      <WalletProvider
        wallets={wallets}
        autoConnect
        onError={(err) => {
          console.error("WalletProvider error:", err?.message ?? err);
        }}
      >
        <WalletModalProvider>{children}</WalletModalProvider>
      </WalletProvider>
    </ConnectionProvider>
  );
}
