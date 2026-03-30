"use client";

import React, { useEffect, useState } from "react";
import { Buffer } from "buffer";
import { BN } from "@coral-xyz/anchor";
import { useWallet } from "@solana/wallet-adapter-react";
import { useSearchParams } from "next/navigation";

import { createAnchorProgramInBrowser } from "../../lib/anchorClient";
import AuctionCreateForm from "../../components/AuctionCreateForm";
import AuctionResultCard from "../../components/AuctionResultCard";
import GovernanceProposalPanel from "@/components/GovernanceProposalPanel";

import {
  PublicKey,
  Transaction,
  TransactionInstruction,
} from "@solana/web3.js";

const REALMS_PROGRAM_ID = "GovER5Lthms3bLBqWub97yVrMmEogzX7xNjdXpPPCVZw";

type RawIxView = {
  label: string;
  dataBase64: string;
};
type AssetKind = "Fungible" | "Nft" | "MetadataOnly";


function enumKey(v: any): string {
  if (v && typeof v === "object") return Object.keys(v)[0];
  return String(v ?? "");
}

function toBase58Maybe(v: any): string {
  if (!v) return "";
  return v?.toBase58?.() ?? new PublicKey(v).toBase58();
}

function getResolvedWinnerKeys(auction: any): string[] {
  const winners = auction?.winners;
  if (Array.isArray(winners) && winners.length > 0) {
    return winners
      .map((w) => {
        try {
          return toBase58Maybe(w);
        } catch {
          return "";
        }
      })
      .filter(Boolean);
  }

  if (auction?.winner) {
    try {
      return [toBase58Maybe(auction.winner)];
    } catch {
      return [];
    }
  }

  return [];
}

function isWinnerOfAuction(auction: any, walletBase58: string): boolean {
  return getResolvedWinnerKeys(auction).includes(walletBase58);
}

function persistAuctionForWallet(walletBase58: string, auctionPk: string) {
  try {
    const key = `sealed-auctions:${walletBase58}`;
    const current = JSON.parse(localStorage.getItem(key) || "[]") as string[];
    const next = Array.from(new Set([auctionPk, ...current]));
    localStorage.setItem(key, JSON.stringify(next));
  } catch {
    // ignore storage issues
  }
}

export default function AuctionClient() {

      const { wallet, publicKey, connected, signAllTransactions } = useWallet();
  const searchParams = useSearchParams();

//   // keep the rest of your existing state + logic here
//   const [mode, setMode] = useState<"auction" | "proposal">(() =>
//     searchParams.get("panel") === "governance" ? "proposal" : "auction"
//   );

  useEffect(() => {
    const panel = searchParams.get("panel");
    setMode(panel === "governance" ? "proposal" : "auction");
  }, [searchParams]);

    type Mode = "auction" | "proposal";
    
    // const [mode, setMode] = useState<Mode>("auction");
    
    // governance / realm inputs
    const [proposalName, setProposalName] = useState(
      "Create sealed auction for treasury tokens"
    );
    const [proposalDescription, setProposalDescription] = useState(
      "Proposal to create a sealed-bid auction for DAO treasury tokens with ARCIBID."
    );
    const [realmAddress, setRealmAddress] = useState("");
    const [governanceAddress, setGovernanceAddress] = useState("");
    
    type AuctionType = "FirstPrice" | "Vickrey" | "Uniform" | "ProRata";
    type TreasuryAccountRow = {
      pubkey: string;
      mint: string;
      owner: string;
      amount: string;
      decimals: number;
      uiAmountString: string;
    };
    
    type TreasuryGroup = {
      governance: string;
      nativeTreasury: string;
      tokenAccounts: TreasuryAccountRow[];
    };
    // ATA dropdown
    type AtaRow = {
      pubkey: string;
      mint: string;
      owner: string;
      amount: string;
      decimals: number;
      uiAmountString: string;
    };
    
    const [selectedTreasuryAccount, setSelectedTreasuryAccount] = useState("");
    const [showRawInstructions, setShowRawInstructions] = useState(false);
    const [rawInstructions, setRawInstructions] = useState<RawIxView[]>([]);
      const [programClient, setProgramClient] = useState<any | null>(null);
      const [status, setStatus] = useState<string | null>(null);
      const [minBidSol, setMinBidSol] = useState<string>("1");
      const [auctionType, setAuctionType] = useState<AuctionType>("FirstPrice");
      const [durationSecs, setDurationSecs] = useState<number>(60 * 60);
      const [auctionSeedHex, setAuctionSeedHex] = useState<string | null>(null);
      const [auctionData, setAuctionData] = useState<any | null>(null);
      const [auctionEnded, setAuctionEnded] = useState(false);
      const [isWinner, setIsWinner] = useState(false);
      const [auctionPkStr, setAuctionPkStr] = useState<string | null>(null);
    const [saleAmountToken, setSaleAmountToken] = useState<string>("100.0");
    const [tokenDecimals, setTokenDecimals] = useState<number>(6);
    const [tokenMint, setTokenMint] = useState<string>("");
    
    const [assetKind, setAssetKind] = useState<AssetKind>("Fungible");
    const [metadataName, setMetadataName] = useState("");
    const [metadataDescription, setMetadataDescription] = useState("");
    
    const [governanceProgramId, setGovernanceProgramId] = useState("");
    
    const [treasuryGroups, setTreasuryGroups] = useState<TreasuryGroup[]>([]);
    const [selectedTreasuryGroup, setSelectedTreasuryGroup] = useState("");
    
    const [realmCommunityMint, setRealmCommunityMint] = useState("");
    const [metadataImageFile, setMetadataImageFile] = useState<File | null>(null);
    

      const [activePanel, setActivePanel] = useState<"sealed" | "governance">("sealed");
    
    
    
    const [loadingTreasuries, setLoadingTreasuries] = useState(false);
    
    function getAllowedAuctionTypes(kind: AssetKind): AuctionType[] {
      if (kind === "Fungible") return ["FirstPrice", "Vickrey", "Uniform", "ProRata"];
      return ["FirstPrice", "Vickrey"];
    }
    
    function normalizeAuctionType(kind: AssetKind, current: AuctionType): AuctionType {
      const allowed = getAllowedAuctionTypes(kind);
      return allowed.includes(current) ? current : allowed[0];
    }
    
    function handleAssetKindChange(nextKind: AssetKind) {
      setAssetKind(nextKind);
      setAuctionType((current) => normalizeAuctionType(nextKind, current));
    
      if (nextKind === "Nft") {
        setSaleAmountToken("1");
      }
    
      if (nextKind === "MetadataOnly") {
        setTokenMint("");
        setSaleAmountToken("");
      }
    }
    
    function deserializeTxFromBase64(txBase64: string): Transaction {
      return Transaction.from(Buffer.from(txBase64, "base64"));
    }
      // const searchParams = useSearchParams();
    
      const [mode, setMode] = useState<Mode>(() =>
        searchParams.get("panel") === "governance" ? "proposal" : "auction"
      );
    
      useEffect(() => {
        const panel = searchParams.get("panel");
        setMode(panel === "governance" ? "proposal" : "auction");
      }, [searchParams]);
    
    async function signAndSendSerializedTxs(txBase64s: string[]) {
      if (!programClient) throw new Error("Program client not ready.");
      if (!publicKey) throw new Error("Wallet not connected.");
      if (!signAllTransactions) {
        throw new Error("This wallet does not support batch signing.");
      }
    
      const txs = txBase64s.map(deserializeTxFromBase64);
      const signedTxs = await signAllTransactions(txs);
    
      const connection = programClient.provider.connection;
      const sigs: string[] = [];
    
      for (const tx of signedTxs) {
        const sig = await connection.sendRawTransaction(tx.serialize());
        await connection.confirmTransaction(sig, "confirmed");
        sigs.push(sig);
      }
    
      return sigs;
    }
    
    async function loadRealmTreasuryAccounts() {
      if (!realmAddress) throw new Error("Enter a realm address first.");
      if (!governanceProgramId) throw new Error("Enter the owner program ID first.");
    
      setLoadingTreasuries(true);
      try {
        const res = await fetch(
          `/api/treasuryTokenAccounts?realm=${encodeURIComponent(realmAddress)}&programId=${encodeURIComponent(governanceProgramId)}`
        );
        const json = await res.json();
    
        if (!res.ok) {
          throw new Error(json?.error ?? "Failed to load treasury accounts");
        }
    
        if (json.communityMint) {
          setRealmCommunityMint(json.communityMint);
        }
    
        const groups: TreasuryGroup[] = (json.treasuries ?? []).map((g: any) => ({
          governance: g.governance,
          nativeTreasury: g.nativeTreasury,
          tokenAccounts: (g.tokenAccounts ?? []).map((a: any) => ({
            pubkey: a.pubkey,
            mint: a.mint,
            owner: a.owner,
            amount: a.amount,
            decimals: a.decimals,
            uiAmountString: a.uiAmountString ?? "0",
          })),
        }));
    
        setTreasuryGroups(groups);
    
        const firstGroup = groups[0];
        setSelectedTreasuryGroup(firstGroup?.nativeTreasury ?? "");
        setGovernanceAddress(firstGroup?.governance ?? "");
    
        const firstAccount = firstGroup?.tokenAccounts?.find((a) => BigInt(a.amount) > 0n);
        setSelectedTreasuryAccount(firstAccount?.pubkey ?? "");
    
        if (firstAccount) {
          setTokenMint(firstAccount.mint);
          setTokenDecimals(firstAccount.decimals);
        }
    
        setStatus(
          groups.length > 0
            ? `Loaded ${groups.length} treasury wallet(s).`
            : "No treasury token accounts found for this realm."
        );
      } finally {
        setLoadingTreasuries(false);
      }
    }
    //   useEffect(() => {
    //     let cancelled = false;
    //     (async () => {
    //       if (!connected || !publicKey) {
    //         setProgramClient(null);
    //         return;
    //       }
    
    //       try {
    //         const { program } = await createAnchorProgramInBrowser(wallet as any, process.env.NEXT_PUBLIC_PROGRAM_ID);
    //         if (!cancelled) {
    //           setProgramClient(program);
    //           setStatus("Program client ready (wallet).");
    //         }
    //       } catch (e: any) {
    //         if (!cancelled) {
    //           setStatus("Could not create program client: " + (e?.message ?? String(e)));
    //           setProgramClient(null);
    //         }
    //       }
    //     })();
    //     return () => {
    //       cancelled = true;
    //     };
    //   }, [wallet, connected, publicKey]);
    
      useEffect(() => {
        let cancelled = false;
    
        (async () => {
          try {
            if (!programClient || !auctionPkStr || !publicKey) {
              setAuctionData(null);
              setAuctionEnded(false);
              setIsWinner(false);
              return;
            }
    
            const auctionPk = new PublicKey(auctionPkStr);
            const auction = await programClient.account.auction.fetch(auctionPk);
            if (cancelled) return;
    
            setAuctionData(auction);
            const statusKey = enumKey(auction.status).toLowerCase();
            const endTime = Number(auction.endTime ?? auction.end_time ?? 0);
            const now = Math.floor(Date.now() / 1000);
            const ended = now >= endTime || statusKey === "closed" || statusKey === "resolved";
            setAuctionEnded(ended);
    
            setIsWinner(isWinnerOfAuction(auction, publicKey.toBase58()));
          } catch {
            if (!cancelled) {
              setAuctionData(null);
              setAuctionEnded(false);
              setIsWinner(false);
            }
          }
        })();
    
        return () => {
          cancelled = true;
        };
      }, [programClient, auctionPkStr, publicKey]);
      async function sendIxs(ixs: TransactionInstruction[]) {
      if (!ixs.length) return;
    
      const tx = new Transaction().add(...ixs);
      tx.feePayer = publicKey!;
      tx.recentBlockhash = (await programClient.provider.connection.getLatestBlockhash()).blockhash;
    
      return await programClient.provider.sendAndConfirm(tx, []);
    }
    
    async function handleCreateGovernanceProposal() {
      setStatus("Preparing governance proposal...");
      try {
        if (!programClient || !publicKey) throw new Error("Connect wallet first.");
        if (!realmAddress || !governanceProgramId || !governanceAddress) {
          throw new Error("Realm address, owner program ID, and governance address are required.");
        }
        if (!realmCommunityMint) {
          throw new Error("Realm community mint is missing. Load treasury accounts first.");
        }
        if (!selectedTreasuryGroup || !selectedTreasuryAccount) {
          throw new Error("Select a treasury wallet and token account to auction.");
        }
    
        const treasuryGroup = treasuryGroups.find((g) => g.nativeTreasury === selectedTreasuryGroup);
        if (!treasuryGroup) throw new Error("Selected treasury wallet was not found.");
    
        const treasuryRow = treasuryGroup.tokenAccounts.find(
          (row) => row.pubkey === selectedTreasuryAccount
        );
        if (!treasuryRow) throw new Error("Selected treasury token account was not found.");
    
        setStatus("Uploading metadata to Pinata...");
        const { metadataUri } = await uploadAuctionMetadata();
    
        const res = await fetch("/api/makeGovernanceAuction", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            authority: publicKey.toBase58(),
            realmAddress,
            governanceProgramId,
            governanceAddress,
            communityMint: realmCommunityMint,
            proposalName,
            proposalDescription,
            minBidSol,
            durationSecs,
            auctionType,
            assetKind,
            metadataUri,
            tokenMint: treasuryRow.mint,
            saleAmountToken,
            sourceTokenAccountBase58: treasuryRow.pubkey,
          }),
        });
    
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json?.error ?? "Failed to build governance auction");
        }
    
        const sigs = await signAndSendSerializedTxs(json.txBase64s);
    
        setRawInstructions(json.rawInstructions ?? []);
        setShowRawInstructions(true);
        setStatus(`Governance proposal sent: ${sigs.join(", ")}`);
        setAuctionPkStr(json.auctionPda);
        setAuctionSeedHex(json.auctionSeedHex ?? null);
        persistAuctionForWallet(publicKey.toBase58(), json.auctionPda);
        await refreshAuctionState(json.auctionPda);
      } catch (err: any) {
        console.error("governance proposal failed:", err);
        setStatus("Governance proposal failed: " + (err?.message ?? String(err)));
      }
    }
      async function callMakeAuction(authorityBase58: string) {
        const res = await fetch("/api/makeAuction", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ authority: authorityBase58 }),
        });
        return res.json();
      }
    
      type PinMetadataResponse = {
      imageCid: string | null;
      imageUri: string | null;
      metadataCid: string;
      metadataUri: string;
      metadata: {
        name?: string;
        description?: string;
        image?: string;
      };
    };
    
    async function uploadAuctionMetadata(): Promise<PinMetadataResponse> {
      if (!metadataName.trim()) {
        throw new Error("Enter a name first.");
      }
    
      const formData = new FormData();
      formData.append("name", metadataName.trim());
      formData.append("description", metadataDescription.trim());
    
      if (metadataImageFile) {
        formData.append("image", metadataImageFile);
      }
    
      const res = await fetch("/api/pin-metadata", {
        method: "POST",
        body: formData,
      });
    
      const json = await res.json();
    
      if (!res.ok) {
        throw new Error(json?.error ?? "Failed to upload metadata to Pinata.");
      }
    
      return json as PinMetadataResponse;
    }
    
    async function refreshAuctionState(auctionPkOverride?: string) {
      const pkStr = auctionPkOverride ?? auctionPkStr;
      if (!programClient || !pkStr) return;
    
      const auctionPk = new PublicKey(pkStr);
      const auction = await programClient.account.auction.fetch(auctionPk);
      setAuctionData(auction);
    
      const statusKey = enumKey(auction.status).toLowerCase();
      const endTime = Number(auction.endTime ?? auction.end_time ?? 0);
      const now = Math.floor(Date.now() / 1000);
      const ended = now >= endTime || statusKey === "closed" || statusKey === "resolved";
      setAuctionEnded(ended);
    
      setIsWinner(isWinnerOfAuction(auction, publicKey?.toBase58() ?? ""));
    }
    
    async function handleMakeAuction() {
      setStatus("Preparing createAuction...");
      try {
        if (!programClient || !publicKey) {
          throw new Error("Connect wallet and ensure program client ready");
        }
    
        setStatus("Uploading metadata to Pinata...");
        const { metadataUri } = await uploadAuctionMetadata();
    
        const res = await fetch("/api/makeAuction", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            authority: publicKey.toBase58(),
            metadataUri,
            minBidSol,
            durationSecs,
            auctionType,
            assetKind,
            tokenMint: tokenMint || undefined,
            saleAmountToken: saleAmountToken || undefined,
          }),
        });
    
        const json = await res.json();
    
        if (!res.ok) {
          throw new Error(json?.error ?? "Failed to build auction transaction");
        }
    
        const [sig] = await signAndSendSerializedTxs([json.txBase64]);
    
        setStatus(`createAuction sent: ${sig}`);
        setAuctionPkStr(json.auctionPda);
        setAuctionSeedHex(json.auctionSeedHex ?? null);
        persistAuctionForWallet(publicKey.toBase58(), json.auctionPda);
        await refreshAuctionState(json.auctionPda);
      } catch (err: any) {
        console.error("createAuction failed:", err);
        setStatus("createAuction failed: " + (err?.message ?? String(err)));
      }
    }


  // ...paste the rest of your current component here...
  return (
<main style={{ padding: 20 }}>
  <h1>Sealed-bid Auction</h1>

  <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
    <div
      style={{
        display: "inline-flex",
        position: "relative",
        padding: 4,
        borderRadius: 999,
        background:
          "linear-gradient(180deg, rgba(255,255,255,0.08), rgba(255,255,255,0.03))",
        border: "1px solid rgba(255,255,255,0.10)",
        boxShadow: "0 12px 40px rgba(0,0,0,0.35)",
        minWidth: 280,
        backdropFilter: "blur(18px)",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: 4,
          bottom: 4,
          left: mode === "auction" ? 4 : "calc(50% + 2px)",
          width: "calc(50% - 6px)",
          borderRadius: 999,
          background:
            mode === "auction"
              ? "linear-gradient(135deg, rgba(255,255,255,0.16), rgba(255,255,255,0.08))"
              : "linear-gradient(135deg, rgba(217,70,239,0.28), rgba(34,211,238,0.22))",
          boxShadow:
            mode === "proposal"
              ? "0 0 0 1px rgba(255,255,255,0.10), 0 10px 30px rgba(217,70,239,0.20)"
              : "0 0 0 1px rgba(255,255,255,0.08)",
          transition: "all 220ms cubic-bezier(0.22, 1, 0.36, 1)",
        }}
      />
      <button
        onClick={() => setMode("auction")}
        style={{
          position: "relative",
          zIndex: 1,
          flex: 1,
          color: mode === "auction" ? "#fff" : "rgba(255,255,255,0.68)",
          background: "transparent",
          border: 0,
          padding: "11px 16px",
          borderRadius: 999,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Auction
      </button>
      <button
        onClick={() => setMode("proposal")}
        style={{
          position: "relative",
          zIndex: 1,
          flex: 1,
          color: mode === "proposal" ? "#fff" : "rgba(255,255,255,0.68)",
          background: "transparent",
          border: 0,
          padding: "11px 16px",
          borderRadius: 999,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        Governance
      </button>
    </div>
  </div>

  {mode === "proposal" ? (
    <section className="relative overflow-hidden rounded-[32px] border border-white/10 bg-gradient-to-br from-fuchsia-500/10 via-white/[0.03] to-cyan-400/5 p-5 shadow-[0_30px_100px_rgba(0,0,0,0.45)] backdrop-blur-xl md:p-8">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-fuchsia-400/70 to-transparent" />
      <div className="absolute -right-24 -top-20 h-56 w-56 rounded-full bg-fuchsia-500/10 blur-3xl" />
      <div className="absolute -left-24 bottom-0 h-56 w-56 rounded-full bg-cyan-400/10 blur-3xl" />

      <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[28px] border border-white/10 bg-black/20 p-4 md:p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/35">
                Step 1
              </div>
              <div className="mt-1 text-lg font-semibold text-white">
                Configure governance proposal
              </div>
            </div>
          </div>

          <GovernanceProposalPanel
            proposalName={proposalName}
            proposalDescription={proposalDescription}
            realmAddress={realmAddress}
            governanceProgramId={governanceProgramId}
            governanceAddress={governanceAddress}
            treasuryGroups={treasuryGroups}
            selectedTreasuryGroup={selectedTreasuryGroup}
            selectedTreasuryAccount={selectedTreasuryAccount}
            loadingTreasuries={loadingTreasuries}
            realmCommunityMint={realmCommunityMint}
            onProposalNameChange={setProposalName}
            onProposalDescriptionChange={setProposalDescription}
            onRealmAddressChange={setRealmAddress}
            onGovernanceProgramIdChange={setGovernanceProgramId}
            onSelectedTreasuryGroupChange={(nativeTreasury) => {
              setSelectedTreasuryGroup(nativeTreasury);
              const group = treasuryGroups.find((g) => g.nativeTreasury === nativeTreasury);
              setGovernanceAddress(group?.governance ?? "");
              const firstAccount = group?.tokenAccounts?.find((a) => BigInt(a.amount) > 0n) ?? null;
              setSelectedTreasuryAccount(firstAccount?.pubkey ?? "");
              if (firstAccount) {
                setTokenMint(firstAccount.mint);
                setTokenDecimals(firstAccount.decimals);
              }
            }}
            onSelectedTreasuryAccountChange={(pubkey) => {
              setSelectedTreasuryAccount(pubkey);
              const group = treasuryGroups.find((g) => g.nativeTreasury === selectedTreasuryGroup);
              const row = group?.tokenAccounts.find((a) => a.pubkey === pubkey);
              if (row) {
                setTokenMint(row.mint);
                setTokenDecimals(row.decimals);
              }
            }}
            onLoadTreasuries={async () => {
              try {
                await loadRealmTreasuryAccounts();
              } catch (e: any) {
                setStatus(e?.message ?? String(e));
              }
            }}
            onUseRealms={() => setGovernanceProgramId(REALMS_PROGRAM_ID)}
          />
        </div>

        <div className="rounded-[28px] border border-white/10 bg-black/20 p-4 md:p-5">
          <div className="mb-4 flex items-center justify-between">
            <div>
              <div className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/35">
                Step 2
              </div>
              <div className="mt-1 text-lg font-semibold text-white">
                Configure auction for proposal
              </div>
            </div>
          </div>

<AuctionCreateForm
  minBidSol={minBidSol}
  saleAmountToken={saleAmountToken}
  tokenMint={tokenMint}
  durationSecs={durationSecs}
  auctionType={auctionType}
  assetKind={assetKind}
  metadataName={metadataName}
  metadataDescription={metadataDescription}
  metadataImageFile={metadataImageFile}
  auctionPkStr={auctionPkStr}
  disabled={!connected}
  lockTokenMint={true}
  getAllowedAuctionTypes={getAllowedAuctionTypes}
  onAssetKindChange={handleAssetKindChange}
  onMetadataNameChange={setMetadataName}
  onMetadataDescriptionChange={setMetadataDescription}
  onMetadataImageChange={setMetadataImageFile}
  onMinBidSolChange={setMinBidSol}
  onSaleAmountTokenChange={setSaleAmountToken}
  onTokenMintChange={setTokenMint}
  onDurationSecsChange={setDurationSecs}
  onAuctionTypeChange={setAuctionType}
  onSubmit={handleCreateGovernanceProposal}
/>

          <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/55">
            This auction will be created through the proposal, not directly from the wallet.
          </div>
        </div>
      </div>

      <div className="mt-5">
        {rawInstructions.length > 0 ? (
          <div>
            <button
              type="button"
              onClick={() => setShowRawInstructions((v) => !v)}
              style={{
                background: "#1b1b1b",
                color: "#fff",
                border: "1px solid #333",
                padding: "10px 12px",
                borderRadius: 10,
                cursor: "pointer",
              }}
            >
              {showRawInstructions ? "Hide raw tx bytes" : "Show raw tx bytes"}
            </button>

            {showRawInstructions && (
              <div style={{ marginTop: 12 }}>
                {rawInstructions.map((ix, idx) => (
                  <div key={idx} style={{ marginBottom: 12 }}>
                    <div>
                      <strong>{ix.label}</strong>
                    </div>

                    <textarea
                      readOnly
                      value={ix.dataBase64}
                      style={{
                        width: "100%",
                        background: "#111",
                        color: "#fff",
                        border: "1px solid #333",
                        borderRadius: 8,
                        padding: 8,
                        fontFamily: "monospace",
                      }}
                    />

                    <button onClick={() => navigator.clipboard.writeText(ix.dataBase64)}>
                      Copy
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        ) : (
          <div className="rounded-2xl border border-white/10 bg-white/[0.03] px-4 py-3 text-sm text-white/50">
            Raw tx bytes will appear after you create the governance proposal.
          </div>
        )}
      </div>
    </section>
  ) : (
<AuctionCreateForm
  minBidSol={minBidSol}
  saleAmountToken={saleAmountToken}
  tokenMint={tokenMint}
  durationSecs={durationSecs}
  auctionType={auctionType}
  assetKind={assetKind}
  metadataName={metadataName}
  metadataDescription={metadataDescription}
  metadataImageFile={metadataImageFile}
  auctionPkStr={auctionPkStr}
  disabled={!connected}
  lockTokenMint={false}
  getAllowedAuctionTypes={getAllowedAuctionTypes}
  onAssetKindChange={handleAssetKindChange}
  onMetadataNameChange={setMetadataName}
  onMetadataDescriptionChange={setMetadataDescription}
  onMetadataImageChange={setMetadataImageFile}
  onMinBidSolChange={setMinBidSol}
  onSaleAmountTokenChange={setSaleAmountToken}
  onTokenMintChange={setTokenMint}
  onDurationSecsChange={setDurationSecs}
  onAuctionTypeChange={setAuctionType}
  onSubmit={handleMakeAuction}
/>
  )}

  {auctionData ? (
    <AuctionResultCard
      auctionData={auctionData}
      auctionEnded={auctionEnded}
      winnerBase58={isWinner ? publicKey?.toBase58() : undefined}
    />
  ) : null}

  <div style={{ marginTop: 12, color: "#333" }}>
    <strong>Status:</strong> {status}
  </div>
</main>
  );
}