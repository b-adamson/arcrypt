"use client";

import React, { useEffect, useRef, useState } from "react";
import { Buffer } from "buffer";
import { useWallet } from "@solana/wallet-adapter-react";
import {
  PublicKey,
  Transaction,
  VersionedTransaction,
} from "@solana/web3.js";
import {
  createAnchorProgramInBrowser,
  createReadOnlyProgram,
  assertProviderReady,
} from "../../lib/anchorClient";
import AuctionBidForm from "../../components/AuctionBidForm";
import AuctionResultCard from "../../components/AuctionResultCard";
import AuctionWinConfetti from "../../components/AuctionWinConfetti";
import { useRouter } from "next/navigation";
import { address as toAddress } from "@solana/kit";
import {
  enumKey,
  getAuctionType,
  getResolvedWinnerKeys,
  isWinnerClaimed,
  isWinnerOfAuction,
  deriveEscrowPda,
} from "@/lib/utils";
import { getMint } from "@solana/spl-token";

import { useUmbraClient } from "@/lib/useUmbraClient";

const USDC_MINT = "4oG4sjmopf5MzvTHLE8rpVJ2uyczxfsw2K84SUTpNDx7";

// from past deployments that no-longer work
const BLACKLISTED_AUCTION_PKS = new Set<string>([
  "CtnWDiMJXKsB8RCVtkZdyJy1FX49cSWJwkqfb6XaseeW",
  "9eGLtpKrLH6MsdDYH76s9oAFT3mXTseYDCLuPhBgfLiw",
]);

function isBlacklistedAuctionPk(pk: string | null | undefined) {
  return !!pk && BLACKLISTED_AUCTION_PKS.has(pk);
}

export default function BidPageClient({ auctionPk }: { auctionPk: string | null }) {
  const auctionPkStr = auctionPk;

  const { wallet, publicKey, connected } = useWallet();
  const { client: umbraClient, withdrawFn } = useUmbraClient();

  const isBlacklistedAuction = isBlacklistedAuctionPk(auctionPkStr);


  const [programClient, setProgramClient] = useState<any | null>(null);
  const [readOnlyProgram, setReadOnlyProgram] = useState<any | null>(null);
  const activeProgram = programClient ?? readOnlyProgram;
  const [status, setStatus] = useState<string | null>(null);
  const [bidTokens, setBidTokens] = useState("1");
  const [bidPriceUsdc, setBidPriceUsdc] = useState("1");
  const [bidAmountUsdc, setBidAmountUsdc] = useState("1");


  const [isRefreshing, setIsRefreshing] = useState(false);
  const autoFinalizeAttemptedRef = useRef<string | null>(null);
  const derivedAmountUsdc =
  Number(bidTokens || 0) * Number(bidPriceUsdc || 0);

  const [bidNonceHex, setBidNonceHex] = useState<string | null>(null);
  const [auctionData, setAuctionData] = useState<any | null>(null);
  const [auctionEnded, setAuctionEnded] = useState(false);
  const [tokenDecimals, setTokenDecimals] = useState<number | null>(null);
  const [balanceRefreshKey, setBalanceRefreshKey] = useState(0);
  const [escrowExists, setEscrowExists] = useState<boolean | null>(null);
  const [timeLeft, setTimeLeft] = useState<number | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [encryptedMode, setEncryptedMode] = useState(false);
  const walletBase58 = publicKey?.toBase58() ?? "";
  const auctionStatus = auctionData ? enumKey(auctionData.status).toLowerCase() : "";
  const isResolved = auctionStatus === "resolved";
  const winnerNow = auctionData && publicKey ? isWinnerOfAuction(auctionData, walletBase58) : false;
  const winnerClaimed = auctionData && publicKey ? isWinnerClaimed(auctionData, walletBase58) : false;
  const showWinConfetti = auctionData && isResolved && winnerNow;
  const isCreator = auctionData && publicKey ? new PublicKey(auctionData.authority).equals(publicKey) : false;
  const auctionType = auctionData ? getAuctionType(auctionData) : "";
  const resolvedWinnerKeys = auctionData ? getResolvedWinnerKeys(auctionData) : [];
  const paymentAmountRaw = auctionData?.paymentAmount ?? auctionData?.payment_amount ?? 0;
  const isSettledWithPrice = isResolved && BigInt(paymentAmountRaw?.toString?.() ?? "0") > 0n;
  const showBottomStatusBar = !isBlacklistedAuction && !isSettledWithPrice && !(auctionType === "uniform" && resolvedWinnerKeys.length < 3);
  const resolvedWinnerBase58 = resolvedWinnerKeys[0] ?? null;
  const bidCount = auctionData ? getBidCount(auctionData) : 0;
  const hasNoBids = auctionData ? bidCount === 0 : false;
  const router = useRouter();

  useEffect(() => {
    if (isBlacklistedAuction) return;
    if (isSettledWithPrice) return;
    if (!auctionData || !auctionPkStr || !activeProgram) return;

    const endTime = Number(auctionData.endTime ?? auctionData.end_time ?? 0);
    const now = Math.floor(Date.now() / 1000);
    const statusKey = enumKey(auctionData.status).toLowerCase();
    const ended = now >= endTime || statusKey === "closed" || statusKey === "resolved";

    if (!ended) return;

    const attemptKey = `${auctionPkStr}:${statusKey}:${endTime}:${bidCount}`;
    if (autoFinalizeAttemptedRef.current === attemptKey) return;

    autoFinalizeAttemptedRef.current = attemptKey;
    void handleRefreshAuction();
  }, [auctionData, auctionPkStr, activeProgram, bidCount, isBlacklistedAuction, isSettledWithPrice]);

  const bidAmountUsdcFinal =
    auctionType === "uniform"
      ? derivedAmountUsdc.toString()
      : bidAmountUsdc;
  const canReclaimUnsold = !!auctionData && auctionEnded && !isResolved && isCreator && hasNoBids;
  const canClaimRefund = !!auctionData && auctionEnded && isResolved && publicKey && !winnerNow && escrowExists === true;
  const assetKind = auctionData ? enumKey(auctionData.assetKind ?? auctionData.asset_kind) : "";
  const isTokenAuction = assetKind === "fungible";
  const raydiumPoolCreated = Boolean(
    auctionData?.raydiumPoolCreated ?? auctionData?.raydium_pool_created
  );
  const isBidDisabled = !connected || !auctionPkStr || auctionEnded || isSubmitting;

  const swapUrl =
    raydiumPoolCreated && isTokenAuction
      ? `https://raydium.io/swap/?inputMint=${USDC_MINT}&outputMint=${
          auctionData.tokenMint ?? auctionData.token_mint
        }`
      : null;

  const outcomeText = !auctionData ? "Loading..." : !connected ? (auctionEnded ? "Auction ended — connect wallet to see results" : "Connect wallet to see outcome") : !auctionEnded ? "Auction in progress" : !isResolved && hasNoBids ? "Auction ended — creator can reclaim unsold item" : isResolved ? (winnerNow ? (winnerClaimed ? "You won the auction — settled" : "You won the auction") : isCreator ? "Auction resolved — settlement pending" : canClaimRefund ? "You lost the auction — refund available" : "You lost the auction — no refund to claim") : "Auction ended — winner pending";
  const panelClass = "mt-6 overflow-hidden border border-[var(--accent)] bg-[var(--surface)] p-6 shadow-none";
  const buttonBase = "inline-flex items-center justify-center border px-4 py-3 text-sm font-semibold transition duration-200 ease-out focus:outline-none focus:ring-1 focus:ring-[var(--accent)]/50 disabled:cursor-not-allowed disabled:opacity-40";
  const buttonPrimary = `${buttonBase} border-[var(--accent)] bg-[var(--accent)] text-black hover:opacity-95 hover:-translate-y-0.5`;
  const buttonSecondary = `${buttonBase} border-[var(--accent)] bg-[var(--background)] text-[var(--foreground)] hover:bg-[color-mix(in_srgb,var(--accent)_8%,transparent)] hover:-translate-y-0.5`;
  const outcomeBadgeClass = "inline-flex items-center border border-[var(--accent)] bg-[var(--background)] px-3 py-1 text-xs font-medium text-[var(--foreground)]";

 useEffect(() => {
  if (!auctionData) {
    setTimeLeft(null);
    return;
  }

  const endTime = Number(auctionData.endTime ?? auctionData.end_time ?? 0);

  const tick = () => {
    const now = Math.floor(Date.now() / 1000);
    const remaining = endTime - now;
    setTimeLeft(remaining > 0 ? remaining : 0);
  };

  tick();
  const interval = window.setInterval(tick, 1000);

  return () => window.clearInterval(interval);
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
      if (!auctionPkStr || !activeProgram) return;

      const auctionPk = new PublicKey(auctionPkStr);
      const auction = await activeProgram.account.auction.fetchNullable(auctionPk);

      if (cancelled) return;

      if (!auction) {
        setStatus("Auction not found on chain yet.");
        return;
      }

      setAuctionData(auction);

      const statusKey = enumKey(auction.status).toLowerCase();
      const endTime = Number(auction.endTime ?? auction.end_time ?? 0);
      const now = Math.floor(Date.now() / 1000);

      setAuctionEnded(
        now >= endTime || statusKey === "closed" || statusKey === "resolved"
      );
    } catch (e) {
      console.error("bid fetch failed:", e);
      if (!cancelled) setStatus(String(e));
    }
  })();

  return () => {
    cancelled = true;
  };
}, [auctionPkStr, activeProgram]);

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
          setStatus("Wallet client ready.");
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
        const connection = activeProgram?.provider.connection;

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

async function callPlaceBid(
  auctionPk: string,
  bidderPubkey: string,
  bidAmountUsdc: string,
  bidPriceUsdc: string,
  nonceHex: string | null
) {
    const res = await fetch("/api/placeBid", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          auctionPk,
          bidderPubkey,
          bidAmountUsdc,
          bidPriceUsdc,
          nonceHex,
        }),
    });
    return res.json();
}

async function refreshAuctionState() {
  if (!activeProgram || !auctionPkStr) return null;

  const auctionPk = new PublicKey(auctionPkStr);
  const auction = await activeProgram.account.auction.fetch(auctionPk);

  setAuctionData(auction);

  const statusKey = enumKey(auction.status).toLowerCase();
  const endTime = Number(auction.endTime ?? auction.end_time ?? 0);
  const now = Math.floor(Date.now() / 1000);
  setAuctionEnded(now >= endTime || statusKey === "closed" || statusKey === "resolved");

  return auction;
}

  async function handleRefreshAuction() {
  if (isRefreshing) return;
  if (isBlacklistedAuction) {
    setStatus(null);
    return;
  }
  setIsRefreshing(true);
  try {
    if (!activeProgram || !auctionPkStr) {
      throw new Error("Missing auction or program client");
    }

    const program = activeProgram;
    const connection = program.provider.connection;

    let auction = await refreshAuctionState();
    if (!auction) {
      throw new Error("Auction not found on chain yet.");
    }

    const statusKey = enumKey(auction.status).toLowerCase();
    const endTime = Number(auction.endTime ?? auction.end_time ?? 0);
    const now = Math.floor(Date.now() / 1000);
    const bidCountNow = Number(auction.bidCount ?? auction.bid_count ?? 0);
    const ended = now >= endTime || statusKey === "closed" || statusKey === "resolved";

    if (ended && statusKey !== "resolved" && bidCountNow > 0) {
      const auctionTypeNow = getAuctionType(auction);
      const which =
        auctionTypeNow === "firstprice"
          ? "first"
          : auctionTypeNow === "vickrey"
            ? "vickrey"
            : auctionTypeNow === "uniform"
              ? "uniform"
              : null;

      if (which) {
        const srv = await callAuctionActions({
          kind: "determineWinner",
          auctionPk: auctionPkStr,
          publicKey: publicKey?.toBase58() ?? "",
          which,
        });

        if (srv?.error) throw new Error(srv.error);

        const tx = Transaction.from(Buffer.from(srv.txBase64, "base64"));
        const sig = await connection.sendRawTransaction(tx.serialize());
        await connection.confirmTransaction(sig, "confirmed");
      }
    }

    auction = (await refreshAuctionState()) ?? auction;
    const refreshedStatus = enumKey(auction.status).toLowerCase();

    if (refreshedStatus !== "resolved") {
      setStatus("Auction refreshed.");
      return;
    }

    setStatus("Auction resolved. Settling...");

    const settleRes = await fetch("/api/settleAuction", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ auctionPk: auctionPkStr }),
    });

    const settleJson = await settleRes.json();
    if (!settleRes.ok) throw new Error(settleJson?.error || "Settlement failed");

    const settleTxs = (settleJson.txBase64s ?? []).map((b64: string) =>
      Transaction.from(Buffer.from(b64, "base64"))
    );

    for (const tx of settleTxs) {
      const sig = await connection.sendRawTransaction(tx.serialize());
      await connection.confirmTransaction(sig, "confirmed");
    }

    await refreshAuctionState();
    setStatus(settleTxs.length > 0 ? "Auction refreshed and settled." : "Auction already settled.");
  } catch (err: any) {
    console.error("refresh failed:", err);
    setStatus("Refresh failed: " + (err?.message ?? String(err)));
  } finally {
    setIsRefreshing(false);
  }
}

async function handleClaimPayoutAndCreatePool() {
  try {
    if (!activeProgram || !publicKey || !auctionData || !auctionPkStr) {
      throw new Error("Missing state");
    }

    const assetKind = enumKey(auctionData.assetKind).toLowerCase();
    if (assetKind !== "fungible") {
      throw new Error("Only fungible token auctions can create a pool");
    }

    const creatorPk = new PublicKey(auctionData.authority);
    if (!creatorPk.equals(publicKey)) {
      throw new Error("Only the creator can create the pool");
    }

    const connection = activeProgram.provider.connection;
    const auctionPkObj = new PublicKey(auctionPkStr);

    setStatus("Ensuring settlement is complete...");

    const settleRes = await fetch("/api/settleAuction", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ auctionPk: auctionPkStr }),
    });

    const settleJson = await settleRes.json();
    if (!settleRes.ok) {
      throw new Error(settleJson?.error || "Settlement failed");
    }

    const settleTxs = (settleJson.txBase64s ?? []).map((b64: string) =>
      Transaction.from(Buffer.from(b64, "base64"))
    );

    for (const tx of settleTxs) {
      const sig = await connection.sendRawTransaction(tx.serialize());
      await connection.confirmTransaction(sig, "confirmed");
    }

    await refreshAuctionState();

    setStatus("Creating Raydium pool...");

    const rayRes = await fetch("/api/createRaydiumPool", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        auctionPk: auctionPkStr,
        publicKey: publicKey.toBase58(),
      }),
    });

    const rayJson = await rayRes.json();
    if (!rayRes.ok) {
      throw new Error(rayJson?.error || "Raydium creation failed");
    }

    const rayTxs = (rayJson.txBase64s ?? []).map((b64: string) =>
      VersionedTransaction.deserialize(Buffer.from(b64, "base64"))
    );

    if (rayTxs.length > 0) {
      const adapter = wallet?.adapter as any;
      if (!adapter?.signAllTransactions) {
        throw new Error("Wallet does not support batch signing");
      }

      const { blockhash } = await connection.getLatestBlockhash();
      for (const tx of rayTxs) {
        tx.message.recentBlockhash = blockhash;
      }

      const signedTxs = await adapter.signAllTransactions(rayTxs);

      for (const tx of signedTxs) {
        const sig = await connection.sendRawTransaction(tx.serialize());
        await connection.confirmTransaction(sig, "confirmed");
      }
    }

    setStatus("Marking pool created...");

    const markIx = await (activeProgram.methods as any)
      .markPoolCreated()
      .accounts({
        authority: publicKey,
        auction: auctionPkObj,
      })
      .instruction();

    const markTx = new Transaction().add(markIx);
    await safeSendTx(activeProgram, markTx);

    await refreshAuctionState();
    setStatus("Claim payout and pool creation complete.");
  } catch (err: any) {
    console.error("claim payout + pool failed:", err);
    setStatus("Failed: " + (err?.message ?? String(err)));
  }
}

async function handlePlaceBid() {
  setStatus("Preparing bid...");
  if (isSubmitting) return;
  setIsSubmitting(true);

  try {
    if (!programClient || !publicKey) {
      throw new Error("Connect wallet and ensure program client ready");
    }
    if (!auctionPkStr) {
      throw new Error("Select or create an auction first (auction PDA)");
    }
    if (!umbraClient || !withdrawFn) {
      throw new Error("Umbra client not ready");
    }

    const program = programClient;
    assertProviderReady(program);

    const withdrawAmount = BigInt(bidAmountUsdcFinal.trim());

    if (withdrawAmount <= 0n) {
      throw new Error("Bid amount must be greater than 0");
    }

    setStatus("Awaiting UMBRA deposit callback from Arcium...");

    await withdrawFn(
      toAddress(publicKey.toBase58()),
      toAddress(USDC_MINT),
      withdrawAmount as any,
      {
        accountInfoCommitment: "confirmed",
      }
    );

    setBalanceRefreshKey((v) => v + 1);

    setStatus("Encrypted balance updated, building placeBid tx...");

    if (auctionType === "uniform") {
      if (Number(bidAmountUsdcFinal) < Number(bidPriceUsdc)) {
        throw new Error("Amount must be >= price");
      }
    }

    const finalPrice =
      auctionType === "uniform" ? bidPriceUsdc : bidAmountUsdcFinal;

    const srv = await callPlaceBid(
      auctionPkStr,
      publicKey.toBase58(),
      bidAmountUsdcFinal,
      finalPrice,
      bidNonceHex ?? null
    );

    if (srv?.error) {
      throw new Error(srv.error);
    }

    const tx = Transaction.from(Buffer.from(srv.txBase64, "base64"));

    setStatus("Signing and sending placeBid tx...");
    const sig = await safeSendTx(program, tx);

    setAuctionData((prev: any) => {
      if (!prev) return prev;
      const current = Number(prev?.bidCount ?? prev?.bid_count ?? 0);
      return {
        ...prev,
        bidCount: current + 1,
        bid_count: current + 1,
      };
    });

    setStatus(
      sig === "already-processed"
        ? "Transaction already processed (confirmed)"
        : "placeBid tx sent: " + sig
    );
  } catch (err: any) {
    console.error("placeBid failed:", err);
    setStatus("placeBid failed: " + (err?.message ?? String(err)));
  } finally {
    setIsSubmitting(false);
  }
}

async function handleEncryptedBid() {
  setStatus("Preparing encrypted bid...");
  if (isSubmitting) return;
  setIsSubmitting(true);

  try {
    if (!programClient || !publicKey) {
      throw new Error("Connect wallet and ensure program client is ready");
    }
    if (!auctionPkStr) {
      throw new Error("Select or create an auction first");
    }

    const UMBRA_PROGRAM_ID = new PublicKey("DSuKkyqGVGgo4QtPABfxKJKygUDACbUhirnuv63mEpAJ");
    const ETA_SEED = Buffer.from([88, 246, 238, 102, 30, 119, 174, 223, 76, 239, 136, 176, 202, 120, 177, 11, 48, 67, 190, 35, 5, 219, 76, 155, 193, 2, 61, 126, 253, 142, 11, 153]);
    const USDC_MINT_PK = new PublicKey(USDC_MINT);
    const etaPk = PublicKey.findProgramAddressSync(
      [ETA_SEED, publicKey.toBuffer(), USDC_MINT_PK.toBuffer()],
      UMBRA_PROGRAM_ID
    )[0];

    const finalPrice = auctionType === "uniform" ? bidPriceUsdc : bidAmountUsdcFinal;

    setStatus("Building encrypted bid tx...");
    const res = await fetch("/api/place_encrypted_bid", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        auctionPk: auctionPkStr,
        bidderPubkey: publicKey.toBase58(),
        etaAddress: etaPk.toBase58(),
        bidAmountUsdc: bidAmountUsdcFinal,
        bidPriceUsdc: finalPrice,
        nonceHex: bidNonceHex ?? null,
      }),
    });

    const srv = await res.json();
    if (srv?.error) throw new Error(srv.error);

    const tx = Transaction.from(Buffer.from(srv.txBase64, "base64"));
    setStatus("Signing and sending encrypted bid tx...");
    const sig = await safeSendTx(programClient, tx);

    setStatus(
      sig === "already-processed"
        ? "Encrypted bid already processed (confirmed)"
        : `Encrypted bid sent: ${sig} | tempBid: ${srv.tempBidPda}`
    );
  } catch (err: any) {
    console.error("encryptedBid failed:", err);
    setStatus("Encrypted bid failed: " + (err?.message ?? String(err)));
  } finally {
    setIsSubmitting(false);
  }
}

async function handleManualCrank() {
  setStatus("Cranking encrypted bid...");
  try {
    if (!programClient || !publicKey) {
      throw new Error("Connect wallet and ensure program client is ready");
    }
    if (!auctionPkStr) {
      throw new Error("Select an auction first");
    }

    const res = await fetch("/api/test-crank", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        auctionPk: auctionPkStr,
        bidderPubkey: publicKey.toBase58(),
        crankerPubkey: publicKey.toBase58(),
      }),
    });

    const srv = await res.json();
    if (srv?.error) throw new Error(srv.error);

    const tx = Transaction.from(Buffer.from(srv.txBase64, "base64"));
    setStatus("Signing and sending crank tx...");
    const sig = await safeSendTx(programClient, tx);

    setStatus(
      sig === "already-processed"
        ? "Crank already processed"
        : `Crank tx sent: ${sig}`
    );
  } catch (err: any) {
    console.error("manualCrank failed:", err);
    setStatus("Crank failed: " + (err?.message ?? String(err)));
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


  return (
<main className="page-shell min-h-screen px-5 py-5 md:px-8 md:py-8">
  <AuctionWinConfetti show={showWinConfetti} />
  <div className="mx-auto max-w-6xl">
    <div className="mb-6">
      <button
        onClick={() => router.push("/market")}
        className="inline-flex items-center gap-2 border border-[var(--line)] px-4 py-2 text-sm font-medium hover:bg-[var(--surface-2)] transition"
      >
        ← Back to projects
      </button>
    </div>

    {auctionData ? (
      <div className="fixed right-4 top-4 z-50 border border-[var(--accent)] bg-[var(--background)] px-5 py-4 shadow-none backdrop-blur-md">
        <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">
          Time left
        </div>

        <div className="mt-1 text-4xl font-bold tabular-nums text-[var(--foreground)]">
          {formatTimeLeft(timeLeft)}
        </div>

        <div className="mt-1 text-xs text-[var(--muted)]">
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
        bidCount={bidCount}
        connection={
          programClient?.provider.connection ??
          readOnlyProgram?.provider.connection ??
          null
        }
      />
    ) : null}

    {auctionData?.raydiumPoolCreated && isTokenAuction && (
      <div className="mt-6 border border-[var(--accent)] bg-[var(--surface)] p-5">
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

    <div className="mt-6">
      <div className="mb-3 flex items-center gap-3">
        <button
          onClick={() => setEncryptedMode((v) => !v)}
          className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none ${encryptedMode ? "bg-[var(--accent)]" : "bg-[var(--line)]"}`}
          role="switch"
          aria-checked={encryptedMode}
        >
          <span className={`inline-block h-3 w-3 rounded-full bg-white transition-transform ${encryptedMode ? "translate-x-5" : "translate-x-1"}`} />
        </button>
        <span className="text-xs font-medium text-[var(--muted)]">
          {encryptedMode ? "Encrypted bid (ETA)" : "Normal bid (ATA)"}
        </span>
      </div>
    <AuctionBidForm
      refreshKey={balanceRefreshKey}
      auctionData={auctionData}
      auctionType={auctionType}
      bidTokens={bidTokens}
      bidPriceUsdc={bidPriceUsdc}
      onBidTokensChange={setBidTokens}
      onBidPriceUsdcChange={setBidPriceUsdc}
      bidAmountUsdc={bidAmountUsdc}
      onBidAmountUsdcChange={setBidAmountUsdc}
      disabled={isBidDisabled}
      isSubmitting={isSubmitting}
      auctionEnded={auctionEnded}
      onSubmit={encryptedMode ? handleEncryptedBid : handlePlaceBid}
    />
    </div>

    {!connected && (
      <div className="mb-6 border border-yellow-500/40 bg-yellow-500/10 px-4 py-3 text-sm">
        <strong>Wallet not connected.</strong> Connect your wallet to interact
        with this auction and view full results.
      </div>
    )}

    <div className={panelClass}>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="mt-1 text-sm text-[var(--muted)]">
            Refresh, refund, or reclaim depending on auction state.
          </p>
        </div>

        <span className={outcomeBadgeClass}>
          {auctionEnded ? "Ended" : "Live"}
        </span>
      </div>

      <div className="border border-[var(--accent)] bg-[var(--background)] px-4 py-3">
        <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">
          Outcome
        </div>

        <div className="mt-1 text-sm text-[var(--foreground)]">
          {outcomeText}
        </div>
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        {encryptedMode && !auctionEnded && connected ? (
          <button
            onClick={handleManualCrank}
            disabled={isSubmitting}
            className={buttonSecondary}
          >
            Manual crank
          </button>
        ) : null}

        {canReclaimUnsold ? (
          <button
            onClick={() => handleSettleAuction("reclaimUnsold")}
            className={buttonPrimary}
          >
            Reclaim unsold item
          </button>
        ) : null}

      {!isBlacklistedAuction && !isSettledWithPrice ? (
        <button
          onClick={handleRefreshAuction}
          disabled={isRefreshing}
          className={buttonPrimary}
        >
          {isRefreshing ? "Refreshing..." : "Refresh"}
        </button>
      ) : null}

        {auctionEnded &&
        isResolved &&
        isCreator &&
        isTokenAuction &&
        !raydiumPoolCreated &&
        !(auctionType === "uniform" && resolvedWinnerKeys.length < 3) ? (
          <button
            onClick={handleClaimPayoutAndCreatePool}
            className={buttonPrimary}
          >
            Claim payout and create pool
          </button>
        ) : null}

        {canClaimRefund ? (
          <button
            onClick={() => handleSettleAuction("claimRefund")}
            className={buttonSecondary}
          >
            Claim refund
          </button>
        ) : null}
      </div>
    </div>

      {showBottomStatusBar ? (
        <div className="mt-4 border border-[var(--accent)] bg-[var(--background)] px-4 py-3 text-sm text-[var(--muted)]">
          {status}
        </div>
      ) : null}
  </div>
</main>
  );
}