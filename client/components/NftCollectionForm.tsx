"use client";

import React, { useMemo, useState } from "react";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { Transaction } from "@solana/web3.js";
import { Buffer } from "buffer";
import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { mplTokenMetadata } from "@metaplex-foundation/mpl-token-metadata";
import { walletAdapterIdentity } from "@metaplex-foundation/umi-signer-wallet-adapters";
import { createMetaplexCollection, mintCollectionNft } from "../lib/mintNftCollection";

const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL ?? "https://api.devnet.solana.com";
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;

type AuctionType = "FirstPrice" | "Vickrey";

type NftItem = {
  id: string;
  name: string;
  description: string;
  imageFile: File | null;
  previewUrl: string | null;
};

function newItem(): NftItem {
  return { id: crypto.randomUUID(), name: "", description: "", imageFile: null, previewUrl: null };
}

const inputClass =
  "h-12 w-full border border-white/20 bg-white/[0.06] px-4 text-sm text-white outline-none placeholder:text-white/40 transition focus:border-white/40 focus:ring-1 focus:ring-white/20";

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-2">
      <label className="block text-[11px] font-semibold uppercase tracking-[0.22em] text-white/70">
        {label}
      </label>
      {children}
      {hint ? <p className="text-xs text-white/50">{hint}</p> : null}
    </div>
  );
}

type Props = {
  onDone?: (auctionPdas: string[]) => void;
};

export default function NftCollectionForm({ onDone }: Props) {
  const { connection } = useConnection();
  const { publicKey, connected, signAllTransactions, wallet } = useWallet();
  const adapter = wallet?.adapter;

  const umi = useMemo(() => {
    if (!adapter) return null;
    return createUmi(RPC_URL).use(walletAdapterIdentity(adapter)).use(mplTokenMetadata());
  }, [adapter]);

  const [collectionName, setCollectionName] = useState("");
  const [collectionDescription, setCollectionDescription] = useState("");
  const [collectionImageFile, setCollectionImageFile] = useState<File | null>(null);
  const [collectionPreview, setCollectionPreview] = useState<string | null>(null);

  const [items, setItems] = useState<NftItem[]>([newItem()]);

  const [minBidUsdc, setMinBidUsdc] = useState("1");
  const [durationSecs, setDurationSecs] = useState(3600);
  const [auctionType, setAuctionType] = useState<AuctionType>("FirstPrice");

  const [isProcessing, setIsProcessing] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [createdPdas, setCreatedPdas] = useState<string[]>([]);

  function setCollectionImage(file: File | null) {
    if (collectionPreview) URL.revokeObjectURL(collectionPreview);
    setCollectionImageFile(file);
    setCollectionPreview(file ? URL.createObjectURL(file) : null);
  }

  function updateItem(id: string, patch: Partial<NftItem>) {
    setItems((prev) =>
      prev.map((item) => {
        if (item.id !== id) return item;
        const next = { ...item, ...patch };
        if (patch.imageFile !== undefined) {
          if (item.previewUrl) URL.revokeObjectURL(item.previewUrl);
          next.previewUrl = patch.imageFile ? URL.createObjectURL(patch.imageFile) : null;
        }
        return next;
      })
    );
  }

  function removeItem(id: string) {
    setItems((prev) => {
      const item = prev.find((i) => i.id === id);
      if (item?.previewUrl) URL.revokeObjectURL(item.previewUrl);
      return prev.filter((i) => i.id !== id);
    });
  }

  async function uploadMetadata(
    name: string,
    description: string,
    imageFile: File | null,
    extra?: Record<string, unknown>
  ): Promise<string> {
    const formData = new FormData();
    formData.append("name", name.trim());
    formData.append("description", description.trim());
    if (imageFile) formData.append("image", imageFile);
    if (extra) formData.append("extra", JSON.stringify(extra));

    const res = await fetch("/api/pin-metadata", { method: "POST", body: formData });
    const json = await res.json();
    if (!res.ok) throw new Error(json?.error ?? "Metadata upload failed");
    return json.metadataUri as string;
  }

  async function handleCreate() {
    if (!publicKey || !umi || !signAllTransactions) return;

    const trimmedName = collectionName.trim();
    if (!trimmedName) { setStatus("Collection name required."); return; }
    if (items.length === 0) { setStatus("Add at least one NFT."); return; }
    for (const item of items) {
      if (!item.name.trim()) { setStatus(`Every NFT needs a name.`); return; }
    }

    setIsProcessing(true);
    setStatus(null);
    setCreatedPdas([]);

    try {
      // 1. Upload collection metadata (image goes to IPFS)
      setStatus("Uploading collection metadata...");
      const formData0 = new FormData();
      formData0.append("name", trimmedName);
      formData0.append("description", collectionDescription);
      if (collectionImageFile) formData0.append("image", collectionImageFile);
      const res0 = await fetch("/api/pin-metadata", { method: "POST", body: formData0 });
      const json0 = await res0.json();
      if (!res0.ok) throw new Error(json0?.error ?? "Collection metadata upload failed");
      const collectionMetadataUri: string = json0.metadataUri;
      const collectionIpfsImage: string = json0.imageUri ?? "";

      // 2. Create Metaplex collection NFT (prompts 1 wallet signature)
      setStatus("Creating collection NFT...");
      const collectionMintAddress = await createMetaplexCollection(umi, collectionMetadataUri, trimmedName);

      // 3. Upload each NFT's metadata (embedding collectionMint) then mint
      const mintedNfts: { nftMint: string; metadataUri: string }[] = [];

      for (let i = 0; i < items.length; i++) {
        const item = items[i];
        setStatus(`Uploading metadata for NFT ${i + 1}/${items.length}: ${item.name}...`);

        const nftMetadataUri = await uploadMetadata(
          item.name.trim(),
          item.description,
          item.imageFile,
          {
            collectionMint: collectionMintAddress,
            collectionName: trimmedName,
            collectionDescription: collectionDescription,
            ...(collectionIpfsImage ? { collectionImage: collectionIpfsImage } : {}),
          }
        );

        setStatus(`Minting NFT ${i + 1}/${items.length}: ${item.name}...`);
        const nftMint = await mintCollectionNft(
          umi,
          publicKey.toBase58(),
          nftMetadataUri,
          item.name.trim(),
          collectionMintAddress
        );

        mintedNfts.push({ nftMint, metadataUri: nftMetadataUri });
      }

      // 4. Build all auction creation transactions on the server
      setStatus("Building auction transactions...");
      const res = await fetch("/api/makeCollection", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          authority: publicKey.toBase58(),
          nfts: mintedNfts,
          minBidUsdc,
          durationSecs,
          auctionType,
        }),
      });

      const json = await res.json();
      if (!res.ok) throw new Error(json?.error ?? "Failed to build auction transactions");

      const results: { txBase64: string; auctionPda: string }[] = json.results;

      // 5. Sign all auction transactions in one batch
      setStatus(`Signing ${results.length} auction transaction(s)...`);
      const txs = results.map((r) => Transaction.from(Buffer.from(r.txBase64, "base64")));
      const signedTxs = await signAllTransactions(txs);

      // 6. Send sequentially
      const auctionPdas: string[] = [];
      for (let i = 0; i < signedTxs.length; i++) {
        setStatus(`Sending auction ${i + 1}/${signedTxs.length}...`);
        const sig = await connection.sendRawTransaction(signedTxs[i].serialize());
        await connection.confirmTransaction(sig, "confirmed");
        auctionPdas.push(results[i].auctionPda);
      }

      setCreatedPdas(auctionPdas);
      setStatus(`Collection created! ${auctionPdas.length} auctions live.`);
      onDone?.(auctionPdas);
    } catch (err: any) {
      console.error("NftCollectionForm error:", err);
      setStatus("Error: " + (err?.message ?? String(err)));
    } finally {
      setIsProcessing(false);
    }
  }

  const disabled = !connected || isProcessing;

  return (
    <section className="relative overflow-hidden border border-[var(--line)] bg-[var(--surface)] p-6 shadow-none md:p-8">
      <div className="absolute inset-x-0 top-0 h-px bg-[var(--accent)]" />

      <div className="relative flex flex-col gap-8">
        <div>
          <h3 className="text-2xl font-semibold tracking-tight text-[var(--foreground)] md:text-3xl">
            NFT Collection
          </h3>
          <p className="mt-2 text-sm leading-6 text-white/70">
            Create a named collection of NFTs, each with its own independent auction.
          </p>
        </div>

        {/* Collection details */}
        <div className="flex flex-col gap-5 border border-[var(--line)] bg-[var(--background)] p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--accent)]">
            Collection details
          </p>

          <Field label="Collection name">
            <input
              value={collectionName}
              onChange={(e) => setCollectionName(e.target.value)}
              className={inputClass}
              placeholder="My Collection"
            />
          </Field>

          <Field label="Description" hint="Optional">
            <input
              value={collectionDescription}
              onChange={(e) => setCollectionDescription(e.target.value)}
              className={inputClass}
              placeholder="Short description"
            />
          </Field>

          <Field label="Collection image" hint="Optional — shown on the collection card (max 5 MB)">
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const f = e.target.files?.[0] ?? null;
                if (f && f.size > MAX_IMAGE_BYTES) { alert("Image must be 5 MB or smaller."); return; }
                setCollectionImage(f);
              }}
              className="block h-12 w-full border border-[var(--line)] bg-[var(--surface)] px-4 py-2 text-sm text-[var(--foreground)] outline-none file:mr-4 file:border-0 file:bg-[var(--background)] file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-[var(--foreground)] hover:file:bg-[var(--surface-2)]"
            />
            {collectionPreview && (
              <img src={collectionPreview} alt="collection" className="mt-3 h-32 w-full object-cover border border-[var(--line)]" />
            )}
          </Field>
        </div>

        {/* Per-NFT list */}
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--accent)]">
              NFTs in collection ({items.length})
            </p>
            <button
              type="button"
              onClick={() => setItems((prev) => [...prev, newItem()])}
              className="h-9 px-4 text-xs font-bold uppercase tracking-[0.14em] border border-[var(--accent)] text-[var(--accent)] hover:bg-[var(--accent)]/10 transition"
            >
              + Add NFT
            </button>
          </div>

          {items.map((item, idx) => (
            <div key={item.id} className="border border-[var(--line)] bg-[var(--background)] p-5 flex flex-col gap-4">
              <div className="flex items-center justify-between">
                <span className="text-xs font-semibold uppercase tracking-[0.18em] text-white/50">
                  NFT #{idx + 1}
                </span>
                {items.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeItem(item.id)}
                    className="text-xs text-white/40 hover:text-red-400 transition"
                  >
                    Remove
                  </button>
                )}
              </div>

              <Field label="Name">
                <input
                  value={item.name}
                  onChange={(e) => updateItem(item.id, { name: e.target.value })}
                  className={inputClass}
                  placeholder={`NFT #${idx + 1}`}
                />
              </Field>

              <Field label="Description" hint="Optional">
                <input
                  value={item.description}
                  onChange={(e) => updateItem(item.id, { description: e.target.value })}
                  className={inputClass}
                  placeholder="Short description"
                />
              </Field>

              <Field label="Image" hint="Optional — max 5 MB">
                <input
                  type="file"
                  accept="image/*"
                  onChange={(e) => {
                    const f = e.target.files?.[0] ?? null;
                    if (f && f.size > MAX_IMAGE_BYTES) { alert("Image must be 5 MB or smaller."); return; }
                    updateItem(item.id, { imageFile: f });
                  }}
                  className="block h-12 w-full border border-[var(--line)] bg-[var(--surface)] px-4 py-2 text-sm text-[var(--foreground)] outline-none file:mr-4 file:border-0 file:bg-[var(--background)] file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-[var(--foreground)] hover:file:bg-[var(--surface-2)]"
                />
                {item.previewUrl && (
                  <img src={item.previewUrl} alt={item.name} className="mt-3 h-28 w-full object-cover border border-[var(--line)]" />
                )}
              </Field>
            </div>
          ))}
        </div>

        {/* Shared auction settings */}
        <div className="flex flex-col gap-5 border border-[var(--line)] bg-[var(--background)] p-5">
          <p className="text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--accent)]">
            Auction settings (shared across all NFTs)
          </p>

          <Field label="Min bid (USDC)">
            <input
              type="number"
              step="0.000001"
              min={0}
              value={minBidUsdc}
              onChange={(e) => setMinBidUsdc(e.target.value)}
              className={inputClass}
              placeholder="1.00"
            />
          </Field>

          <Field label="Duration">
            <div className="flex w-full gap-3">
              {[
                { label: "d", val: Math.floor(durationSecs / 86400) },
                { label: "h", val: Math.floor((durationSecs % 86400) / 3600) },
                { label: "m", val: Math.floor((durationSecs % 3600) / 60) },
                { label: "s", val: durationSecs % 60 },
              ].map((unit, i) => (
                <div key={unit.label} className="flex flex-1 items-center gap-1">
                  <input
                    type="number"
                    min={0}
                    value={unit.val === 0 ? "" : unit.val}
                    onChange={(e) => {
                      const v = Number(e.target.value || 0);
                      const d = Math.floor(durationSecs / 86400);
                      const h = Math.floor((durationSecs % 86400) / 3600);
                      const m = Math.floor((durationSecs % 3600) / 60);
                      const s = durationSecs % 60;
                      const next =
                        i === 0 ? v * 86400 + (durationSecs % 86400)
                        : i === 1 ? d * 86400 + v * 3600 + (durationSecs % 3600)
                        : i === 2 ? d * 86400 + h * 3600 + v * 60 + s
                        : d * 86400 + h * 3600 + m * 60 + v;
                      setDurationSecs(next);
                    }}
                    className={inputClass}
                  />
                  <span className="shrink-0 text-sm text-white/70">{unit.label}</span>
                </div>
              ))}
            </div>
          </Field>

          <Field label="Auction type">
            <select
              value={auctionType}
              onChange={(e) => setAuctionType(e.target.value as AuctionType)}
              className={`${inputClass} appearance-none pr-10 bg-[var(--surface)]`}
            >
              <option value="FirstPrice">FirstPrice</option>
              <option value="Vickrey">Vickrey</option>
            </select>
          </Field>
        </div>

        {/* Status & submit */}
        <div className="flex flex-col gap-3">
          {status && (
            <div className="border border-[var(--line)] bg-[var(--background)] px-4 py-3 text-sm text-white/70">
              {status}
            </div>
          )}

          {createdPdas.length > 0 && (
            <div className="flex flex-col gap-2">
              {createdPdas.map((pda) => (
                <a
                  key={pda}
                  href={`/bid?auctionPk=${encodeURIComponent(pda)}`}
                  className="text-xs text-[var(--accent)] underline underline-offset-2 truncate"
                >
                  Auction: {pda}
                </a>
              ))}
            </div>
          )}

          <button
            onClick={handleCreate}
            disabled={disabled}
            className="btn btn-primary h-12 px-5 text-sm font-bold uppercase tracking-[0.18em] transition-all duration-200 hover:-translate-y-0.5 hover:scale-[1.01] disabled:translate-y-0 disabled:scale-100 disabled:opacity-60"
          >
            {isProcessing
              ? status ?? "Processing..."
              : `Create Collection (${items.length} NFT${items.length !== 1 ? "s" : ""})`}
          </button>

          {!connected && (
            <p className="text-xs text-white/40">Connect your wallet to continue.</p>
          )}
        </div>
      </div>
    </section>
  );
}
