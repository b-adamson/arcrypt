// app/bid/BidPageClient.tsx
"use client";


import React, { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Buffer } from "buffer";
import { BN } from "@coral-xyz/anchor";
import { useWallet } from "@solana/wallet-adapter-react";
import { LAMPORTS_PER_SOL, PublicKey, Keypair, Connection, Transaction  } from "@solana/web3.js";
import { createAnchorProgramInBrowser, createReadOnlyProgram, assertProviderReady } from "../../lib/anchorClient";
import AuctionBidForm from "../../components/AuctionBidForm";
import AuctionResultCard from "../../components/AuctionResultCard";
import AuctionWinConfetti from "../../components/AuctionWinConfetti";
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  getAssociatedTokenAddressSync,
  getMint
} from "@solana/spl-token";
// import {
//   createSignerFromPrivateKeyBytes,
//   getUmbraClientFromSigner,
//   getUserRegistrationFunction,
//   createInMemorySigner
// } from "@umbra-privacy/sdk";


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

  // single-winner auctions
  if (type === "firstprice" || type === "vickrey") {
    try {
      const winner = toBase58Maybe(auction?.winner);
      return !isDefaultPubkey(winner) ? [winner] : [];
    } catch {
      return [];
    }
  }

  // multi-winner auctions
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

  return winners
    .map((w) => toBase58Maybe(w))
    .findIndex((w) => w === walletBase58);
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

function isTokenAuction(auction: any): boolean {
  const kind = getAssetKind(auction);
  return kind === "fungible" || kind === "nft";
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export default function BidPageClient({
  auctionPk,
}: {
  auctionPk: string | null;
}) {

  const auctionPkStr = auctionPk

  const { wallet, publicKey, connected} = useWallet();

  const [programClient, setProgramClient] = useState<any | null>(null);
  const [readOnlyProgram, setReadOnlyProgram] = useState<any | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [bidAmountSol, setBidAmountSol] = useState<string>("1");
  const [bidNonceHex, setBidNonceHex] = useState<string | null>(null);
  const [auctionSeedHex, setAuctionSeedHex] = useState<string | null>(null);
  const [auctionData, setAuctionData] = useState<any | null>(null);
  const [auctionEnded, setAuctionEnded] = useState(false);
  const [isWinner, setIsWinner] = useState(false);
const [tokenDecimals, setTokenDecimals] = useState<number | null>(null);
const refreshedAtZeroRef = useRef(false);

const [umbraClient, setUmbraClient] = useState<any | null>(null);
const [umbraReady, setUmbraReady] = useState(false);
const [umbraStatus, setUmbraStatus] = useState<string>("Not set up");
const [escrowExists, setEscrowExists] = useState<boolean | null>(null);
const [timeLeft, setTimeLeft] = useState<number | null>(null);

const walletBase58 = publicKey?.toBase58() ?? "";

const auctionStatus = auctionData ? enumKey(auctionData.status).toLowerCase() : "";
const isOpen = auctionStatus === "open";
const isResolved = auctionStatus === "resolved";
const isFinal = auctionData && !isOpen && !isResolved;

const winnerNow =
  auctionData && publicKey ? isWinnerOfAuction(auctionData, walletBase58) : false;

const winnerClaimed =
  auctionData && publicKey ? isWinnerClaimed(auctionData, walletBase58) : false;

const metadataOnly = auctionData ? isMetadataAuction(auctionData) : false;

const showWinConfetti =
  auctionData &&
  isResolved &&
  winnerNow;

const isCreator =
  auctionData && publicKey
    ? new PublicKey(auctionData.authority).equals(publicKey)
    : false;

const auctionType = auctionData ? getAuctionType(auctionData) : "";


const resolvedWinnerKeys = auctionData ? getResolvedWinnerKeys(auctionData) : [];
const resolvedWinnerBase58 = resolvedWinnerKeys[0] ?? null;

const bidCount = auctionData ? getBidCount(auctionData) : 0;
const hasNoBids = auctionData ? bidCount === 0 : false;

const canDetermineWinner =
  !!auctionData &&
  auctionEnded &&
  !isResolved &&
  !isFinal &&
  !hasNoBids;

const canReclaimUnsold =
  !!auctionData &&
  auctionEnded &&
  !isResolved &&
  isCreator &&
  hasNoBids;

const canWinnerSettle =
  !!auctionData &&
  auctionEnded &&
  isResolved &&
  publicKey &&
  winnerNow &&
  !winnerClaimed;

const canCreatorSettle =
  !!auctionData &&
  auctionEnded &&
  isResolved &&
  publicKey &&
  isCreator &&
  !winnerNow;

const canClaimRefund =
  !!auctionData &&
  auctionEnded &&
  isResolved &&
  publicKey &&
  !winnerNow &&
  escrowExists === true;

const noRefundToClaim =
  !!auctionData &&
  auctionEnded &&
  isResolved &&
  publicKey &&
  !winnerNow &&
  escrowExists === false;

const primaryActionLabel =
  metadataOnly || isCreator ? "Settle auction" : "Claim winner payout";

const outcomeText = !auctionData
  ? "Loading..."
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

const showDetermineWinnerPanel = canDetermineWinner;

const determineWinnerKind =
  auctionType === "firstprice"
    ? "first"
    : auctionType === "vickrey"
      ? "vickrey"
      : auctionType === "uniform"
        ? "uniform"
        : auctionType === "prorata"
          ? "proRata"
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
  "mt-6 overflow-hidden rounded-[24px] border border-white/10 bg-white/[0.04] p-6 shadow-[0_20px_70px_rgba(0,0,0,0.35)] backdrop-blur-xl";

const buttonBase =
  "inline-flex items-center justify-center rounded-xl border px-4 py-3 text-sm font-semibold transition duration-200 ease-out focus:outline-none focus:ring-2 focus:ring-white/20 disabled:cursor-not-allowed disabled:opacity-40";

const buttonPrimary =
  `${buttonBase} border-white/10 bg-white/10 text-white hover:bg-white/15 hover:-translate-y-0.5`;

const buttonSecondary =
  `${buttonBase} border-white/10 bg-black/20 text-white/80 hover:bg-black/30 hover:text-white hover:-translate-y-0.5`;

const outcomeBadgeClass =
  "inline-flex items-center rounded-full border border-white/10 bg-black/25 px-3 py-1 text-xs font-medium text-white/70";

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

    // Refresh once when the timer hits zero
    if (next === 0 && !refreshedAtZeroRef.current) {
      refreshedAtZeroRef.current = true;
      try {
        await refreshAuctionState();
      } catch (err) {
        console.error("Failed to refresh auction state at timer end:", err);
      }
    }

    // If time is still running, allow a future zero transition to refresh again
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


  async function callPlaceBid(
  auctionPk: string,
  bidderPubkey: string,
  bidAmountSol: string,
  nonceHex: string | null
) {
  const res = await fetch("/api/placeBid", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      auctionPk,
      bidderPubkey,
      bidAmountSol,
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

    setIsWinner(isWinnerOfAuction(auction, publicKey?.toBase58() ?? ""));
  }

  async function handlePlaceBid() {
  setStatus("Preparing placeBid...");
  try {
    if (!programClient || !publicKey) {
      throw new Error("Connect wallet and ensure program client ready");
    }
    if (!auctionPkStr) {
      throw new Error("Select or create an auction first (auction PDA)");
    }

    const program = programClient;
    assertProviderReady(program);

    const srv = await callPlaceBid(
      auctionPkStr,
      publicKey.toBase58(),
      bidAmountSol,
      bidNonceHex ?? null
    );

    if (srv?.error) {
      throw new Error(srv.error);
    }

    const tx = Transaction.from(Buffer.from(srv.txBase64, "base64"));

    setStatus("Signing and sending placeBid tx...");
    const sig = await program.provider.sendAndConfirm(tx);

    setStatus("placeBid tx sent: " + sig);
    await refreshAuctionState();
  } catch (err: any) {
    console.error("placeBid failed:", err);
    setStatus("placeBid failed: " + (err?.message ?? String(err)));
  }
}

  async function handleReclaimUnsoldItem() {
  try {
    if (!programClient || !publicKey || !auctionPkStr) {
      throw new Error("Missing program client, wallet, or auction");
    }

    const program = programClient;
    assertProviderReady(program);

    const auctionPk = new PublicKey(auctionPkStr);
    const auction = auctionData ?? (await program.account.auction.fetch(auctionPk));

    const creatorPk = new PublicKey(auction.authority);
    if (!creatorPk.equals(publicKey)) {
      throw new Error("Only the creator can reclaim an unsold item.");
    }

    const bidCountNow = getBidCount(auction);
    if (bidCountNow !== 0) {
      throw new Error("This auction has bids, so it cannot be reclaimed as unsold.");
    }

    const statusKey = enumKey(auction.status).toLowerCase();
    const endTime = Number(auction.endTime ?? auction.end_time ?? 0);
    const now = Math.floor(Date.now() / 1000);

    if (now < endTime && statusKey === "open") {
      throw new Error("Auction has not ended yet.");
    }

    if (isMetadataAuction(auction)) {
      const sig = await (program.methods as any)
        .reclaimUnsoldMetadataItem()
        .accounts({
          creator: publicKey,
          auction: auctionPk,
        })
        .rpc();

      setStatus("Unsold metadata auction reclaimed: " + sig);
      await program.provider.connection.confirmTransaction(sig, "confirmed");
      await refreshAuctionState();
      return;
    }

    if (!isTokenAuction(auction)) {
      throw new Error("Unsupported asset kind for reclaim.");
    }

    const prizeMintPk = new PublicKey(auction.tokenMint ?? auction.token_mint);
    const prizeVaultPk = new PublicKey(auction.prizeVault ?? auction.prize_vault);

    const vaultAuthorityPda = PublicKey.findProgramAddressSync(
      [Buffer.from("vault-authority"), auctionPk.toBuffer()],
      program.programId
    )[0];

    const creatorAta = getAssociatedTokenAddressSync(
      prizeMintPk,
      publicKey,
      false,
      TOKEN_PROGRAM_ID,
      ASSOCIATED_TOKEN_PROGRAM_ID
    );

    const sig = await (program.methods as any)
      .reclaimUnsoldTokenItem()
      .accounts({
        creator: publicKey,
        auction: auctionPk,
        prizeMint: prizeMintPk,
        prizeVault: prizeVaultPk,
        vaultAuthority: vaultAuthorityPda,
        creatorAta,
        tokenProgram: TOKEN_PROGRAM_ID,
        associatedTokenProgram: ASSOCIATED_TOKEN_PROGRAM_ID,
        // systemProgram: SystemProgram.programId,
      })
      .rpc();

    setStatus("Unsold token item reclaimed: " + sig);
    await program.provider.connection.confirmTransaction(sig, "confirmed");
    await refreshAuctionState();
  } catch (err: any) {
    setStatus("Reclaim failed: " + (err?.message ?? String(err)));
  }
}

async function callAuctionActions(body: {
  kind: "determineWinner" | "settlement";
  auctionPk: string;
  publicKey: string;
  which?: "first" | "vickrey" | "uniform" | "proRata";
  action?: "auto" | "reclaimUnsold" | "claimRefund" | "settleWinner";
}) {
  const res = await fetch("/api/auctionAction", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  return res.json();
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
    const sig = await program.provider.sendAndConfirm(tx);

    setStatus("Settlement tx sent: " + sig);
    await refreshAuctionState();
  } catch (err: any) {
    console.error("Settlement failed:", err);
    setStatus("Settlement failed: " + (err?.message ?? String(err)));
  }
}


  async function handleDetermineWinner(which: "first" | "vickrey" | "uniform" | "proRata") {
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
    const sig = await program.provider.sendAndConfirm(tx);

    setStatus("determineWinner tx sent: " + sig);
    await refreshAuctionState();
  } catch (err: any) {
    console.error("determineWinner failed:", err);
    setStatus("determineWinner failed: " + (err?.message ?? String(err)));
  }
}










    return(
  <main style={{ padding: 20 }}>
    <AuctionWinConfetti show={showWinConfetti} />
    <h1>Sealed-bid Auction</h1>

    {auctionData ? (
  <div className="fixed top-4 right-4 z-50 rounded-2xl border border-white/15 bg-black/70 px-5 py-4 shadow-2xl backdrop-blur-md">
    <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-white/45">
      Time left
    </div>
    <div className="mt-1 text-4xl font-bold tabular-nums text-white">
      {formatTimeLeft(timeLeft)}
    </div>
    <div className="mt-1 text-xs text-white/45">
      {auctionEnded ? "Auction ended" : "Live"}
    </div>
  </div>
) : null}

    {auctionData ? (
<AuctionResultCard
  auctionData={auctionData}
  auctionEnded={auctionEnded}
  isWinner={winnerNow}
  winnerBase58={resolvedWinnerBase58}
  tokenDecimals={tokenDecimals ?? undefined}
/>
    ) : null}

    <AuctionBidForm
      bidAmountSol={bidAmountSol}
      bidNonceHex={bidNonceHex}
      disabled={!connected || !auctionPkStr}
      onBidAmountSolChange={setBidAmountSol}
      onBidNonceHexChange={setBidNonceHex}
      onSubmit={handlePlaceBid}
    />

    <div className={panelClass}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-white">Auction actions</h3>
          <p className="mt-1 text-sm text-white/45">
            Claim payout, refund, or determine winner depending on auction state.
          </p>
        </div>
        <span className={outcomeBadgeClass}>
          {auctionEnded ? "Ended" : "Live"}
        </span>
      </div>

      <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/35">
          Outcome
        </div>


        <div className="mt-1 text-sm text-white/85">{outcomeText}</div>
      </div>

<div className="mt-5 flex flex-wrap gap-3">
{canReclaimUnsold ? (
  <button onClick={() => handleSettleAuction("reclaimUnsold")} className={buttonPrimary}>
    Reclaim unsold item
  </button>
) : null}

{canWinnerSettle ? (
  <button onClick={() => handleSettleAuction("settleWinner")} className={buttonPrimary}>
    {primaryActionLabel}
  </button>
) : null}

{canCreatorSettle ? (
  <button onClick={() => handleSettleAuction("settleWinner")} className={buttonPrimary}>
    Settle auction
  </button>
) : null}

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

    {/* {showDetermineWinnerPanel && determineWinnerKind ? (
      <div className={panelClass}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <div>
            <h3 className="text-lg font-semibold text-white">Determine winner</h3>
            <p className="mt-1 text-sm text-white/45">
              Run settlement once the auction is over.
            </p>
          </div>
          <span className={outcomeBadgeClass}>Ready</span>
        </div>

        <button
          onClick={() => handleDetermineWinner(determineWinnerKind)}
          disabled={!connected || !auctionPkStr}
          className={buttonPrimary}
        >
          {determineWinnerLabel}
        </button>
      </div>
    ) : null} */}

    {/* <section style={{ border: "1px solid #eee", padding: 12, borderRadius: 8, marginTop: 12 }}>
      <h3>Umbra ETA</h3>
      <div>Status: {umbraStatus}</div>

      <button
        onClick={() => {
          clearPersistentSigner();
          setUmbraClient(null);
          setUmbraReady(false);
          setUmbraStatus("Persistent signer cleared");
        }}
        style={{ marginLeft: 8 }}
      >
        Reset local signer
      </button>

      <PhantomUmbraPanel
        rpcUrl="https://api.devnet.solana.com"
        rpcSubscriptionsUrl="wss://api.devnet.solana.com"
      />
    </section> */}

    <div style={{ marginTop: 12, color: "#333" }}>
      <strong>Status:</strong> {status}
    </div>
  </main>)
}