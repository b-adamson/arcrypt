"use client";

import React from "react";
import { ConnectionProvider, WalletProvider } from "@solana/wallet-adapter-react";
import { WalletModalProvider } from "@solana/wallet-adapter-react-ui";
import { useStandardWalletAdapters } from "@solana/wallet-standard-wallet-adapter-react";

type Props = { children: React.ReactNode };

export default function SolanaWalletProvider({ children }: Props) {
  const endpoint = process.env.NEXT_PUBLIC_RPC_URL!;

  // Bridge Wallet Standard wallets into wallet-adapter-react so the modal still works.
  const wallets = useStandardWalletAdapters([]);

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