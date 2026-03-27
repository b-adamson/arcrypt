"use client";

import dynamic from "next/dynamic";
import { PublicKey } from "@solana/web3.js";

const WalletMultiButton = dynamic(
  () => import("@solana/wallet-adapter-react-ui").then((mod) => mod.WalletMultiButton),
  { ssr: false }
);

type Props = {
  publicKey?: PublicKey | null;
  title?: string;
};

export default function WalletSection({ publicKey, title }: Props) {
  return (
    <section style={{ display: "flex", gap: 12, alignItems: "center", flexWrap: "wrap", marginBottom: 16 }}>
      <WalletMultiButton />
      {title ? <strong>{title}</strong> : null}
      {publicKey ? (
        <span style={{ color: "#6b7280" }}>
          Connected: {publicKey.toBase58()}
        </span>
      ) : null}
    </section>
  );
}
