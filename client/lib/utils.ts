import { Buffer } from "buffer";
import { PublicKey, Transaction } from "@solana/web3.js";

// --------------------------------------------------
// General helpers
// --------------------------------------------------

export function enumKey(v: any): string {
  if (v && typeof v === "object") return Object.keys(v)[0];
  return String(v ?? "");
}

export function shorten(value: string, head = 6, tail = 4): string {
  if (!value) return "";
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

export function toBase58Maybe(v: any): string {
  if (!v) return "";
  return v?.toBase58?.() ?? new PublicKey(v).toBase58();
}

export function toHttpGateway(uri: string): string {
  if (!uri) return "";

  const gateway = (process.env.NEXT_PUBLIC_PINATA_GATEWAY_URL || "https://gateway.pinata.cloud/ipfs").replace(
    /\/$/,
    ""
  );

  if (uri.startsWith("ipfs://")) {
    const path = uri.slice("ipfs://".length).replace(/^ipfs\/+/, "");
    return `${gateway}/${path}`;
  }

  return uri;
}

export async function fetchJson(url?: string): Promise<any | null> {
  const clean = (url ?? "").replace(/\0/g, "").trim();
  if (!clean || !/^https?:\/\//i.test(clean)) return null;

  try {
    const res = await fetch(clean);
    if (!res.ok) return null;
    return await res.json();
  } catch {
    return null;
  }
}

export function deserializeTxFromBase64(txBase64: string): Transaction {
  return Transaction.from(Buffer.from(txBase64, "base64"));
}

// --------------------------------------------------
// Amount / formatting helpers
// --------------------------------------------------

const LAMPORTS_PER_SOL = 1_000_000_000n;

export function formatSolAmount(v: any): string {
  const lamports = BigInt(v?.toString?.() ?? 0);
  const whole = lamports / LAMPORTS_PER_SOL;
  const frac = lamports % LAMPORTS_PER_SOL;

  if (frac === 0n) return `${whole.toString()} SOL`;
  return `${whole.toString()}.${frac.toString().padStart(9, "0").replace(/0+$/, "")} SOL`;
}

export function formatTokenAmount(v: any, decimals: number): string {
  const amount = BigInt(v?.toString?.() ?? 0);
  const base = 10n ** BigInt(decimals);

  const whole = amount / base;
  const frac = amount % base;

  if (decimals === 0 || frac === 0n) return whole.toString();

  return `${whole.toString()}.${frac.toString().padStart(decimals, "0").replace(/0+$/, "")}`;
}

export function formatEndTime(endTime: any): string {
  const ts = Number(endTime ?? 0);
  if (!ts) return "Unavailable";

  return new Date(ts * 1000).toLocaleString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    second: "2-digit",
  });
}

// --------------------------------------------------
// Auction helpers
// --------------------------------------------------

export function getAuctionType(auction: any): string {
  return enumKey(auction?.auctionType ?? auction?.auction_type).toLowerCase();
}

export function getAssetKind(auction: any): string {
  return enumKey(auction?.assetKind ?? auction?.asset_kind).toLowerCase();
}

export function isMetadataOnly(auction: any): boolean {
  return getAssetKind(auction) === "metadataonly";
}

export function getResolvedWinnerKeys(auction: any): string[] {
  const type = getAuctionType(auction);

  if (type === "firstprice" || type === "vickrey") {
    try {
      const winner = toBase58Maybe(auction?.winner);
      return winner && winner !== PublicKey.default.toBase58() ? [winner] : [];
    } catch {
      return [];
    }
  }

  const winners = auction?.winners;
  if (Array.isArray(winners)) {
    return winners
      .map((w) => {
        try {
          return toBase58Maybe(w);
        } catch {
          return "";
        }
      })
      .filter((w) => w && w !== PublicKey.default.toBase58());
  }

  return [];
}

export function getSingleWinner(auction: any, winnerBase58?: string | null): string | null {
  if (winnerBase58) return winnerBase58;

  const winner = auction?.winner;
  if (!winner) return null;

  try {
    const s = toBase58Maybe(winner);
    return s && s !== PublicKey.default.toBase58() ? s : null;
  } catch {
    return null;
  }
}

export function getMultiWinners(auction: any): string[] {
  const winners = auction?.winners;
  if (!Array.isArray(winners)) return [];

  return winners
    .map((w) => {
      try {
        return toBase58Maybe(w);
      } catch {
        return "";
      }
    })
    .filter((w) => w && w !== PublicKey.default.toBase58());
}

export function getWinnerIndex(auction: any, walletBase58: string): number {
  const winners = auction?.winners;
  if (!Array.isArray(winners)) return -1;

  return winners.map((w) => toBase58Maybe(w)).findIndex((w) => w === walletBase58);
}

export function isWinnerClaimed(auction: any, walletBase58: string): boolean {
  const type = getAuctionType(auction);

  if (type === "firstprice" || type === "vickrey") {
    return Boolean(auction?.winnerPaid ?? auction?.winner_paid);
  }

  const idx = getWinnerIndex(auction, walletBase58);
  if (idx < 0) return false;

  const paidMulti = auction?.winnerPaidMulti ?? auction?.winner_paid_multi;
  return Array.isArray(paidMulti) ? Boolean(paidMulti[idx]) : false;
}

export function isWinnerOfAuction(auction: any, walletBase58: string): boolean {
  return getResolvedWinnerKeys(auction).includes(walletBase58);
}

// --------------------------------------------------
// Local storage helpers
// --------------------------------------------------

export function persistAuctionForWallet(walletBase58: string, auctionPk: string): void {
  try {
    const key = `sealed-auctions:${walletBase58}`;
    const current = JSON.parse(localStorage.getItem(key) || "[]") as string[];
    const next = Array.from(new Set([auctionPk, ...current]));
    localStorage.setItem(key, JSON.stringify(next));
  } catch {
    // ignore storage issues
  }
}

export async function fetchAuctionPdasForWallet(walletBase58: string): Promise<{ auctionPk: string }[]> {
  const localKey = `sealed-auctions:${walletBase58}`;
  let localEntries: { auctionPk: string }[] = [];

  try {
    const raw = localStorage.getItem(localKey);
    if (raw) {
      const parsed = JSON.parse(raw) as string[];
      localEntries = parsed.map((auctionPk) => ({ auctionPk }));
    }
  } catch {
    localEntries = [];
  }

  try {
    const res = await fetch(`/api/profileAuctions?authority=${encodeURIComponent(walletBase58)}`);
    if (res.ok) {
      const data = await res.json();
      const apiEntries: { auctionPk: string }[] = Array.isArray(data?.auctions)
        ? data.auctions.map((item: any) => ({
            auctionPk: String(item.auctionPk ?? item),
          }))
        : Array.isArray(data)
          ? data.map((item: any) => ({ auctionPk: String(item.auctionPk ?? item) }))
          : [];

      const merged = new Map<string, { auctionPk: string }>();
      for (const entry of [...apiEntries, ...localEntries]) {
        if (entry.auctionPk) merged.set(entry.auctionPk, entry);
      }
      return [...merged.values()];
    }
  } catch {
    // ignore api failures and fall back to local list
  }

  return localEntries;
}

// --------------------------------------------------
// Solana helpers
// --------------------------------------------------

export function deriveEscrowPda(auctionPk: PublicKey, bidderPk: PublicKey, programId: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("escrow"), auctionPk.toBuffer(), bidderPk.toBuffer()],
    programId
  )[0];
}
