"use client";

import { useWallet } from "@solana/wallet-adapter-react";
import { useWalletModal } from "@solana/wallet-adapter-react-ui";

function shorten(address: string) {
  return `${address.slice(0, 4)}…${address.slice(-4)}`;
}

export default function WalletButton() {
  const { publicKey, connected, disconnect } = useWallet();
  const { setVisible } = useWalletModal();

  const address = publicKey?.toBase58();

  const handleClick = () => {
    if (connected) {
      void disconnect();
    } else {
      setVisible(true);
    }
  };

  return (
    <button
      onClick={handleClick}
      className="h-10 px-5 text-sm font-semibold text-white border border-white/15 rounded-none backdrop-blur-md transition-all
      bg-[linear-gradient(135deg,rgba(217,70,239,0.18),rgba(124,58,237,0.18),rgba(34,211,238,0.16))]
      hover:bg-[linear-gradient(135deg,rgba(217,70,239,0.28),rgba(124,58,237,0.28),rgba(34,211,238,0.24))]
      hover:border-white/25
      shadow-[0_10px_30px_rgba(0,0,0,0.25)]"
    >
      {connected && address ? shorten(address) : "Connect Wallet"}
    </button>
  );
}