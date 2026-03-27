// components/WalletConnect.tsx
"use client";

import React from "react";
import { useWallet, useConnection } from "@solana/wallet-adapter-react";
import { WalletMultiButton } from "@solana/wallet-adapter-react-ui";

export default function WalletConnect() {
  const { publicKey, connected } = useWallet();

  return (
    <div>
      <WalletMultiButton />
      <div style={{ marginTop: 8 }}>
        {connected ? <span>Connected: {publicKey?.toBase58()}</span> : <span>Not connected</span>}
      </div>
    </div>
  );
}
