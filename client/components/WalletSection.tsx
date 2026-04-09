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
      type="button"
      onClick={handleClick}
      className={[
        "btn h-10 px-5 text-sm font-semibold",
        "surface-hover",
        connected ? "border-accent text-accent" : "text-foreground",
      ].join(" ")}
    >
      {connected && address ? shorten(address) : "Connect Wallet"}
    </button>
  );
}