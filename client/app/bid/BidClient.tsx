"use client";

import React, { useEffect, useRef, useState } from "react";
import { Buffer } from "buffer";
import { useWallet } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL, PublicKey, Connection, Transaction } from "@solana/web3.js";
import { createAnchorProgramInBrowser, createReadOnlyProgram, assertProviderReady } from "../../lib/anchorClient";
import AuctionBidForm from "../../components/AuctionBidForm";
import AuctionResultCard from "../../components/AuctionResultCard";
import AuctionWinConfetti from "../../components/AuctionWinConfetti";
import {
  getMint,
} from "@solana/spl-token";
import { SystemProgram } from "@solana/web3.js";
import {
  NATIVE_MINT,
  createAssociatedTokenAccountInstruction,
  createSyncNativeInstruction,
  getAssociatedTokenAddressSync,
} from "@solana/spl-token";
import { TransactionInstruction } from "@solana/web3.js";
import { VersionedTransaction } from "@solana/web3.js";

function deriveEscrowPda(auctionPk: PublicKey, bidderPk: PublicKey, programId: PublicKey) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("escrow"), auctionPk.toBuffer(), bidderPk.toBuffer()],
    programId
  )[0];
}

const LOCAL_UMBRA_SIGNER_KEY = "umbra:local-signer-secret-key";

function enumKey(v: any): string {
  if (v && typeof v === "object") return Object.keys(v)[0];
  return String(v ?? "");
}

function toBase58Maybe(v: any): string {
  if (!v) return "";
  return v?.toBase58?.() ?? new PublicKey(v).toBase58();
}

const DEFAULT_PUBKEY = "11111111111111111111111111111111";

function isDefaultPubkey(v: string) {
  return !v || v === DEFAULT_PUBKEY;
}

function getAuctionType(auction: any): string {
  return enumKey(auction?.auctionType ?? auction?.auction_type).toLowerCase();
}

function getResolvedWinnerKeys(auction: any): string[] {
  const type = getAuctionType(auction);

  if (type === "firstprice" || type === "vickrey") {
    try {
      const winner = toBase58Maybe(auction?.winner);
      return !isDefaultPubkey(winner) ? [winner] : [];
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
      .filter((w) => !isDefaultPubkey(w));
  }

  return [];
}

function getWinnerIndex(auction: any, walletBase58: string): number {
  const winners = auction?.winners;
  if (!Array.isArray(winners)) return -1;

  return winners.map((w) => toBase58Maybe(w)).findIndex((w) => w === walletBase58);
}

function isWinnerClaimed(auction: any, walletBase58: string): boolean {
  const type = getAuctionType(auction);

  if (type === "firstprice" || type === "vickrey") {
    return Boolean(auction?.winnerPaid ?? auction?.winner_paid);
  }

  const idx = getWinnerIndex(auction, walletBase58);
  if (idx < 0) return false;

  const paidMulti = auction?.winnerPaidMulti ?? auction?.winner_paid_multi;
  return Array.isArray(paidMulti) ? Boolean(paidMulti[idx]) : false;
}

function isWinnerOfAuction(auction: any, walletBase58: string): boolean {
  return getResolvedWinnerKeys(auction).includes(walletBase58);
}

function getAssetKind(auction: any): string {
  return enumKey(auction?.assetKind ?? auction?.asset_kind).toLowerCase();
}

function isMetadataAuction(auction: any): boolean {
  return getAssetKind(auction) === "metadataonly";
}

export default function BidPageClient({ auctionPk }: { auctionPk: string | null }) {
  const auctionPkStr = auctionPk;

  const { wallet, publicKey, connected } = useWallet();

  const [programClient, setProgramClient] = useState<any | null>(null);
  const [readOnlyProgram, setReadOnlyProgram] = useState<any | null>(null);
  const [status, setStatus] = useState<string | null>(null);
const [bidAmountSol, setBidAmountSol] = useState("1");
const [bidPriceSol, setBidPriceSol] = useState("1"); // NEW
  const [bidNonceHex, setBidNonceHex] = useState<string | null>(null);
  const [auctionData, setAuctionData] = useState<any | null>(null);
  const [auctionEnded, setAuctionEnded] = useState(false);
  const [tokenDecimals, setTokenDecimals] = useState<number | null>(null);
  const refreshedAtZeroRef = useRef(false);

  const [umbraClient, setUmbraClient] = useState<any | null>(null);
  const [umbraReady, setUmbraReady] = useState(false);
  const [umbraStatus, setUmbraStatus] = useState<string>("Not set up");
  const [escrowExists, setEscrowExists] = useState<boolean | null>(null);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);

  const [isSubmitting, setIsSubmitting] = useState(false);

  const walletBase58 = publicKey?.toBase58() ?? "";

const [txSigs, setTxSigs] = useState<string[]>([]);
  const auctionStatus = auctionData ? enumKey(auctionData.status).toLowerCase() : "";
  const isOpen = auctionStatus === "open";
  const isResolved = auctionStatus === "resolved";

  const winnerNow = auctionData && publicKey ? isWinnerOfAuction(auctionData, walletBase58) : false;

  const winnerClaimed = auctionData && publicKey ? isWinnerClaimed(auctionData, walletBase58) : false;

  const metadataOnly = auctionData ? isMetadataAuction(auctionData) : false;

  const showWinConfetti = auctionData && isResolved && winnerNow;

  const isCreator = auctionData && publicKey ? new PublicKey(auctionData.authority).equals(publicKey) : false;

  const auctionType = auctionData ? getAuctionType(auctionData) : "";

  const resolvedWinnerKeys = auctionData ? getResolvedWinnerKeys(auctionData) : [];
  const resolvedWinnerBase58 = resolvedWinnerKeys[0] ?? null;

  const bidCount = auctionData ? getBidCount(auctionData) : 0;
  const hasNoBids = auctionData ? bidCount === 0 : false;

  const canDetermineWinner =
  !!auctionData &&
  auctionEnded &&
  auctionStatus === "closed" &&
  !hasNoBids;

  const canReclaimUnsold = !!auctionData && auctionEnded && !isResolved && isCreator && hasNoBids;

  const canClaimRefund = !!auctionData && auctionEnded && isResolved && publicKey && !winnerNow && escrowExists === true;

  const swapUrl =
  auctionData?.raydiumPoolCreated
    ? `https://raydium.io/swap/?inputMint=So11111111111111111111111111111111111111112&outputMint=${
        auctionData.tokenMint ?? auctionData.token_mint
      }`
    : null;

const outcomeText = !auctionData
  ? "Loading..."
  : !connected
    ? auctionEnded
      ? "Auction ended — connect wallet to see results"
      : "Connect wallet to see outcome"
    : !auctionEnded
      ? "Auction in progress"
      : !isResolved && hasNoBids
        ? "Auction ended — creator can reclaim unsold item"
        : isResolved
          ? winnerNow
            ? winnerClaimed
              ? "You won the auction — settled"
              : "You won the auction"
            : isCreator
              ? "Auction resolved — settlement pending"
              : canClaimRefund
                ? "You lost the auction — refund available"
                : "You lost the auction — no refund to claim"
          : "Auction ended — winner pending";



const determineWinnerKind =
  auctionType === "firstprice"
    ? "first"
    : auctionType === "vickrey"
      ? "vickrey"
      : auctionType === "uniform"
        ? "uniform"
        : null;

  const determineWinnerLabel =
    determineWinnerKind === "first"
      ? "Determine first-price winner"
      : determineWinnerKind === "vickrey"
        ? "Determine Vickrey winner"
        : determineWinnerKind === "uniform"
          ? "Determine uniform winner"
          : "Determine pro-rata winner";

  const panelClass =
    "mt-6 overflow-hidden border border-[var(--line)] bg-[var(--surface)] p-6 shadow-none";

  const buttonBase =
    "inline-flex items-center justify-center border px-4 py-3 text-sm font-semibold transition duration-200 ease-out focus:outline-none focus:ring-1 focus:ring-[var(--accent)]/50 disabled:cursor-not-allowed disabled:opacity-40";

  const buttonPrimary =
    `${buttonBase} border-[var(--accent)] bg-[var(--accent)] text-black hover:opacity-95 hover:-translate-y-0.5`;

  const buttonSecondary =
    `${buttonBase} border-[var(--line)] bg-[var(--background)] text-[var(--foreground)] hover:border-[var(--line-strong)] hover:bg-[var(--surface-2)] hover:-translate-y-0.5`;

  const outcomeBadgeClass =
    "inline-flex items-center border border-[var(--line)] bg-[var(--background)] px-3 py-1 text-xs font-medium text-[var(--foreground)]";

  useEffect(() => {
    if (!auctionData) {
      setTimeLeft(null);
      refreshedAtZeroRef.current = false;
      return;
    }

    const endTime = Number(auctionData.endTime ?? auctionData.end_time ?? 0);

    const tick = async () => {
      const now = Math.floor(Date.now() / 1000);
      const remaining = endTime - now;
      const next = remaining > 0 ? remaining : 0;

      setTimeLeft(next);

      if (next === 0 && !refreshedAtZeroRef.current) {
        refreshedAtZeroRef.current = true;
        try {
          await refreshAuctionState();
        } catch (err) {
          console.error("Failed to refresh auction state at timer end:", err);
        }
      }

      if (next > 0) {
        refreshedAtZeroRef.current = false;
      }
    };

    tick();
    const interval = setInterval(() => {
      void tick();
    }, 1000);

    return () => clearInterval(interval);
  }, [auctionData]);


  function formatTimeLeft(seconds: number | null): string {
    if (seconds === null) return "Loading...";
    if (seconds <= 0) return "0s";

    const days = Math.floor(seconds / 86400);
    const hrs = Math.floor((seconds % 86400) / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;

    if (days > 0) return `${days}d ${hrs}h ${mins}m ${secs}s`;
    if (hrs > 0) return `${hrs}h ${mins}m ${secs}s`;
    if (mins > 0) return `${mins}m ${secs}s`;
    return `${secs}s`;
  }

  function getBidCount(auction: any): number {
    return Number(auction?.bidCount ?? auction?.bid_count ?? 0);
  }

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        console.log("auctionPkStr", auctionPkStr);
        if (!auctionPkStr) return;

        const program = programClient ?? readOnlyProgram;
        if (!program) return;

        const auctionPk = new PublicKey(auctionPkStr);
        const auction = await program.account.auction.fetchNullable(auctionPk);

        if (cancelled) return;

        if (!auction) {
          setStatus("Auction not found on chain yet.");
          return;
        }

        setAuctionData(auction);
      } catch (e) {
        console.error("bid fetch failed:", e);
        if (!cancelled) setStatus(String(e));
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [auctionPkStr, programClient, readOnlyProgram]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        const program = programClient ?? readOnlyProgram;
        if (!auctionPkStr || !publicKey || !program || !auctionData) {
          setEscrowExists(null);
          return;
        }

        const auctionPk = new PublicKey(auctionPkStr);
        const escrowPda = deriveEscrowPda(auctionPk, publicKey, program.programId);

        const escrow = await program.account.escrowAccount.fetchNullable(escrowPda);
        if (!cancelled) {
          setEscrowExists(Boolean(escrow));
        }
      } catch {
        if (!cancelled) {
          setEscrowExists(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [auctionPkStr, publicKey, auctionData, programClient, readOnlyProgram]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!connected || !publicKey) {
        setProgramClient(null);
        return;
      }

      try {
        const { program } = await createAnchorProgramInBrowser(wallet as any, process.env.NEXT_PUBLIC_PROGRAM_ID);
        if (!cancelled) {
          setProgramClient(program);
          setStatus("Program client ready (wallet).");
        }
      } catch (e: any) {
        if (!cancelled) {
          setStatus("Could not create program client: " + (e?.message ?? String(e)));
          setProgramClient(null);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [wallet, connected, publicKey]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        if (!auctionData) {
          setTokenDecimals(null);
          return;
        }

        const mintStr = auctionData.tokenMint ?? auctionData.token_mint;
        if (!mintStr) {
          setTokenDecimals(null);
          return;
        }

        const mintPk = new PublicKey(mintStr);
        const connection = programClient?.provider.connection ?? readOnlyProgram?.provider.connection;

        if (!connection) return;

        const mintInfo = await getMint(connection, mintPk);
        if (!cancelled) {
          setTokenDecimals(mintInfo.decimals);
        }
      } catch (e) {
        if (!cancelled) {
          setTokenDecimals(null);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [auctionData, programClient, readOnlyProgram]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const p = await createReadOnlyProgram(process.env.NEXT_PUBLIC_RPC_URL, process.env.NEXT_PUBLIC_PROGRAM_ID);
        if (!mounted) return;
        setReadOnlyProgram(p);
      } catch {
        setReadOnlyProgram(null);
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

async function safeSendTx(program: any, tx: Transaction) {
  try {
    const sig = await program.provider.sendAndConfirm(tx);
    return sig;
  } catch (e: any) {
    if (String(e?.message).includes("already been processed")) {
      console.warn("Tx already processed, treating as success");
      return "already-processed";
    }
    throw e;
  }
}

  async function callPlaceBid(auctionPk: string, bidderPubkey: string, bidAmountSol: string, bidPriceSol: string, nonceHex: string | null) {
    const res = await fetch("/api/placeBid", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
body: JSON.stringify({
  auctionPk,
  bidderPubkey,
  bidAmountSol,
  bidPriceSol, // NEW
  nonceHex,
}),
    });
    return res.json();
  }

  async function refreshAuctionState() {
    if (!programClient || !auctionPkStr) return;
    const auctionPk = new PublicKey(auctionPkStr);
    const auction = await programClient.account.auction.fetch(auctionPk);
    setAuctionData(auction);

    const statusKey = enumKey(auction.status).toLowerCase();
    const endTime = Number(auction.endTime ?? auction.end_time ?? 0);
    const now = Math.floor(Date.now() / 1000);
    const ended = now >= endTime || statusKey === "closed" || statusKey === "resolved";
    setAuctionEnded(ended);

  }

  async function handlePlaceBid() {
    setStatus("Preparing placeBid...");
      if (isSubmitting) return;
  setIsSubmitting(true);
    try {
      if (!programClient || !publicKey) {
        throw new Error("Connect wallet and ensure program client ready");
      }
      if (!auctionPkStr) {
        throw new Error("Select or create an auction first (auction PDA)");
      }
      if (auctionType === "uniform") {
  if (Number(bidAmountSol) < Number(bidPriceSol)) {
    throw new Error("Amount must be >= price");
  }
}

      const program = programClient;
      assertProviderReady(program);

      const finalPrice =
  auctionType === "uniform"
    ? bidPriceSol
    : bidAmountSol;

const srv = await callPlaceBid(
  auctionPkStr,
  publicKey.toBase58(),
  bidAmountSol,
  finalPrice, // NEW
  bidNonceHex ?? null
);

      if (srv?.error) {
        throw new Error(srv.error);
      }

 const tx = Transaction.from(Buffer.from(srv.txBase64, "base64"));

const connection = program.provider.connection;

const lamports = Math.floor(Number(bidAmountSol) * LAMPORTS_PER_SOL);

const ata = getAssociatedTokenAddressSync(NATIVE_MINT, publicKey);

let wrapIxs: TransactionInstruction[] = [];

const ataInfo = await connection.getAccountInfo(ata);

let currentBalance = 0;

if (ataInfo) {
  try {
    const bal = await connection.getTokenAccountBalance(ata);
    currentBalance = Number(bal.value.amount);
  } catch {}
}

const needed = lamports - currentBalance;

if (!ataInfo) {
  wrapIxs.push(
    createAssociatedTokenAccountInstruction(
      publicKey,
      ata,
      publicKey,
      NATIVE_MINT
    )
  );
}

if (needed > 0) {
  wrapIxs.push(
    SystemProgram.transfer({
      fromPubkey: publicKey,
      toPubkey: ata,
      lamports: needed,
    })
  );

  wrapIxs.push(createSyncNativeInstruction(ata));
}
tx.instructions = [...wrapIxs, ...tx.instructions];

      setStatus("Signing and sending placeBid tx...");
      console.log("placeBid triggered");
      const sig = await safeSendTx(program, tx);

      setAuctionData((prev: any) => {
  if (!prev) return prev;

  const current = Number(prev?.bidCount ?? prev?.bid_count ?? 0);

  return {
    ...prev,
    bidCount: current + 1,
    bid_count: current + 1, // keep both for safety
  };
});

setStatus(
  sig === "already-processed"
    ? "Transaction already processed (confirmed)"
    : "placeBid tx sent: " + sig
);

// await refreshAuctionState();

      // setStatus("placeBid tx sent: " + sig);
      // await refreshAuctionState();
    } catch (err: any) {
      console.error("placeBid failed:", err);
      setStatus("placeBid failed: " + (err?.message ?? String(err)));
    } finally {
    setIsSubmitting(false);
  }
  }

  async function callAuctionActions(body: {
    kind: "determineWinner" | "settlement";
    auctionPk: string;
    publicKey: string;
    which?: "first" | "vickrey" | "uniform";
    action?: "auto" | "reclaimUnsold" | "claimRefund" | "settleWinner";
  }) {
    const res = await fetch("/api/auctionAction", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });

    return res.json();
  }

async function handleFinalizeAll() {
  try {
    if (!programClient || !publicKey || !auctionData) {
      throw new Error("Missing state");
    }

    const connection = programClient.provider.connection;

    const paymentAmount = Number(
      auctionData.paymentAmount ?? auctionData.payment_amount ?? 0
    );

    const liquidityTokens = Number(
      localStorage.getItem("raydiumReserve") || "0"
    );

    setStatus("Building transactions...");

    const res = await fetch("/api/finalizeAuction", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        auctionPk: auctionPkStr,
        publicKey: publicKey.toBase58(),
        tokenMint: auctionData.tokenMint ?? auctionData.token_mint,
        wsolAmount: paymentAmount,
        tokenAmount: liquidityTokens,
      }),
    });

    

    const json = await res.json();

    if (!res.ok) {
      throw new Error(json?.error || "Failed");
    }

    const adapter = wallet?.adapter as any;
const txs = json.txs.map((b64: string) =>
  VersionedTransaction.deserialize(Buffer.from(b64, "base64"))
);

if (!json.txs || json.txs.length === 0) {
  setStatus("Nothing to execute — already settled");
  return;
}

// ✅ ONE shared blockhash
const { blockhash } = await connection.getLatestBlockhash();

for (const tx of txs) {
  tx.message.recentBlockhash = blockhash;
}

// ✅ ONE SIGN PROMPT
const signedTxs = await adapter.signAllTransactions(txs);

const sigs: string[] = [];



// ✅ SEND IN ORDER
let settlementSucceeded = false;

for (let i = 0; i < signedTxs.length; i++) {
  try {
    const sig = await connection.sendRawTransaction(
      signedTxs[i].serialize()
    );

    await connection.confirmTransaction(sig, "confirmed");

    sigs.push(sig);

    if (i === 0) {
      settlementSucceeded = true;
      setStatus("✅ SOL claimed successfully...");
    }

  } catch (err: any) {
    console.error("TX failed:", err);

    const msg = err?.message || "";

    // 🔥 Detect insufficient liquidity error
    if (msg.includes("insufficient lamports")) {
        setStatus(
          "✅ Bid rewards claimed. ❌ Not enough liquidity to create pool."
        );
    } else {
      setStatus(
        "❌ Transaction failed: " + msg
      );
    }

    return; // stop further tx execution
  }
}

setTxSigs(sigs);

// ✅ OPTIMISTIC UI UPDATE
setAuctionData((prev: any) =>
  prev
    ? {
        ...prev,
        raydiumPoolCreated: true,
      }
    : prev
);

// ✅ proper status
setStatus("All done: " + sigs.join(", "));

  } catch (err: any) {
    console.error(err);
    setStatus("Failed: " + err.message);
  }
}

  async function handleSettleAuction(action: "auto" | "reclaimUnsold" | "claimRefund" | "settleWinner" = "auto") {
    setStatus("Preparing settlement...");
    try {
      if (!programClient || !publicKey) {
        throw new Error("Missing program client or wallet");
      }
      if (!auctionPkStr) {
        throw new Error("Missing auction");
      }

      const program = programClient;
      assertProviderReady(program);

      const srv = await callAuctionActions({
        kind: "settlement",
        auctionPk: auctionPkStr,
        publicKey: publicKey.toBase58(),
        action,
      });

      if (srv?.error) {
        throw new Error(srv.error);
      }

      const tx = Transaction.from(Buffer.from(srv.txBase64, "base64"));

      setStatus("Signing and sending settlement tx...");
const sig = await safeSendTx(program, tx);

setStatus(
  sig === "already-processed"
    ? "Settlement already processed"
    : "Settlement tx sent: " + sig
);

await refreshAuctionState();
    } catch (err: any) {
      console.error("Settlement failed:", err);
      setStatus("Settlement failed: " + (err?.message ?? String(err)));
    }
  }

  async function handleDetermineWinner(which: "first" | "vickrey" | "uniform") {
    setStatus("Preparing determine winner...");
    try {
      if (!programClient || !publicKey) {
        throw new Error("Connect wallet and ensure program client ready");
      }
      if (!auctionPkStr) {
        throw new Error("Select/create auction first");
      }

      const program = programClient;
      assertProviderReady(program);

      const srv = await callAuctionActions({
        kind: "determineWinner",
        auctionPk: auctionPkStr,
        publicKey: publicKey.toBase58(),
        which,
      });

      if (srv?.error) {
        throw new Error(srv.error);
      }

      const tx = Transaction.from(Buffer.from(srv.txBase64, "base64"));

      setStatus("Signing and sending determineWinner tx...");
const sig = await safeSendTx(program, tx);

setStatus(
  sig === "already-processed"
    ? "Determine winner already processed"
    : "determineWinner tx sent: " + sig
);

await refreshAuctionState();
    } catch (err: any) {
      console.error("determineWinner failed:", err);
      setStatus("determineWinner failed: " + (err?.message ?? String(err)));
    }
  }

  const isBidDisabled =
  !connected ||
  !auctionPkStr ||
  auctionEnded ||
  isSubmitting;

  return (
    <main className="page-shell min-h-screen px-5 py-5 md:px-8 md:py-8">
      <AuctionWinConfetti show={showWinConfetti} />

      <div className="mx-auto max-w-6xl">
        <div className="mb-6 border border-[var(--line)] bg-[var(--surface)] px-5 py-4 md:px-6">
          <h1 className="text-2xl font-semibold tracking-tight text-[var(--foreground)] md:text-3xl">
            Sealed-bid Auction
          </h1>
          <p className="mt-2 text-sm text-[var(--muted)]">
            Bid, settle, reclaim, and resolve auction outcomes from one page.
          </p>
        </div>

        {auctionData ? (
          <div className="fixed right-4 top-4 z-50 border border-[var(--line)] bg-[var(--background)] px-5 py-4 shadow-none backdrop-blur-md">
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">
              Time left
            </div>
            <div className="mt-1 text-4xl font-bold tabular-nums text-[var(--foreground)]">
              {formatTimeLeft(timeLeft)}
            </div>
            <div className="mt-1 text-xs text-[var(--muted)]">{auctionEnded ? "Auction ended" : "Live"}</div>
          </div>
        ) : null}

        {auctionData ? (
<AuctionResultCard
  auctionData={auctionData}
  auctionEnded={auctionEnded}
  isWinner={winnerNow}
  winnerBase58={resolvedWinnerBase58}
  tokenDecimals={tokenDecimals ?? undefined}
  bidCount={bidCount}  
/>
        ) : null}

{auctionData?.raydiumPoolCreated && (
  <div className="mt-6 border border-[var(--line)] bg-[var(--surface)] p-5">
    <h3 className="text-lg font-semibold text-[var(--foreground)]">
      Liquidity Pool Created
    </h3>

    <div className="mt-3 space-y-3 text-sm">
      <div>
        <span className="text-[var(--muted)]">Trade on Raydium:</span>
        <br />
        <a
          href={swapUrl!}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-500 underline break-all"
        >
          {swapUrl}
        </a>
      </div>
    </div>
  </div>
)}
{txSigs.length > 0 && (
  <div className="mt-4 text-sm">
    <span className="text-[var(--muted)]">Recent Transactions:</span>
    <ul className="mt-1 space-y-1">
      {txSigs.map((sig, i) => (
        <li key={sig}>
          <a
            href={`https://explorer.solana.com/tx/${sig}?cluster=devnet`}
            target="_blank"
            rel="noopener noreferrer"
            className="text-blue-500 underline break-all"
          >
            TX {i + 1}: {sig.slice(0, 8)}...{sig.slice(-8)}
          </a>
        </li>
      ))}
    </ul>
  </div>
)}

        <div className="mt-6">
<AuctionBidForm
  bidAmountSol={bidAmountSol}
  disabled={isBidDisabled}
  isSubmitting={isSubmitting}
    bidPriceSol={bidPriceSol}
  auctionType={auctionType}
  auctionEnded={auctionEnded}
  onBidAmountSolChange={setBidAmountSol}
  onBidPriceSolChange={setBidPriceSol} 
  onSubmit={handlePlaceBid}
/>
        </div>

        {!connected && (
  <div className="mb-6 border border-yellow-500/40 bg-yellow-500/10 px-4 py-3 text-sm">
    <strong>Wallet not connected.</strong> Connect your wallet to interact with this auction and view full results.
  </div>
)}

        <div className={panelClass}>
          <div className="mb-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-[var(--foreground)]">Auction actions</h3>
              <p className="mt-1 text-sm text-[var(--muted)]">
                Claim payout, refund, or determine winner depending on auction state.
              </p>
            </div>
            <span className={outcomeBadgeClass}>{auctionEnded ? "Ended" : "Live"}</span>
          </div>

          <div className="border border-[var(--line)] bg-[var(--background)] px-4 py-3">
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">
              Outcome
            </div>

            <div className="mt-1 text-sm text-[var(--foreground)]">{outcomeText}</div>
          </div>

          <div className="mt-5 flex flex-wrap gap-3">
            {canReclaimUnsold ? (
              <button onClick={() => handleSettleAuction("reclaimUnsold")} className={buttonPrimary}>
                Reclaim unsold item
              </button>
            ) : null}



{auctionEnded && isResolved && !auctionData.raydiumPoolCreated && (
  <button onClick={handleFinalizeAll} className={buttonPrimary}>
    {isCreator ? "Claim payout" : "Settle auction"}
  </button>
)}


            {canDetermineWinner ? (
              <button
                onClick={() => handleDetermineWinner(determineWinnerKind!)}
                disabled={!connected || !auctionPkStr}
                className={buttonPrimary}
              >
                {determineWinnerLabel}
              </button>
            ) : null}

            {canClaimRefund ? (
              <button onClick={() => handleSettleAuction("claimRefund")} className={buttonSecondary}>
                Claim refund
              </button>
            ) : null}
          </div>
        </div>

        <div className="mt-4 border border-[var(--line)] bg-[var(--background)] px-4 py-3 text-sm text-[var(--muted)]">
          <strong className="text-[var(--foreground)]">Status:</strong> {status}
        </div>
      </div>
    </main>
  );
}