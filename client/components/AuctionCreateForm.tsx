"use client";

import React, { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import { TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID } from "@solana/spl-token";
import type { PublicKey } from "@solana/web3.js";
import { PublicKey as PublicKeyCtor } from "@solana/web3.js";

import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import { mplTokenMetadata, fetchDigitalAsset } from "@metaplex-foundation/mpl-token-metadata";
import { publicKey as umiPublicKey } from "@metaplex-foundation/umi";

type AuctionType = "FirstPrice" | "Vickrey" | "Uniform" | "ProRata";
type AssetKind = "Fungible" | "Nft" | "MetadataOnly";

type TokenOption = {
  mint: string;
  ata: string;
  balance: string;
  decimals: number;
  name?: string;
  symbol?: string;
  image?: string;
};

const METADATA_PROGRAM_ID = new PublicKeyCtor("metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s");
const RPC_URL = process.env.NEXT_PUBLIC_RPC_URL ?? "https://api.devnet.solana.com";

const umi = createUmi(RPC_URL).use(mplTokenMetadata());

const tokenMetadataCache = new Map<string, TokenOption>();
const tokenMetadataInFlight = new Map<string, Promise<TokenOption>>();

function shorten(value: string, head = 6, tail = 4): string {
  if (!value) return "";
  if (value.length <= head + tail + 1) return value;
  return `${value.slice(0, head)}…${value.slice(-tail)}`;
}

function formatTokenAmount(rawAmount: bigint, decimals: number): string {
  if (decimals <= 0) return rawAmount.toString();
  const negative = rawAmount < 0n;
  const abs = negative ? -rawAmount : rawAmount;

  const padded = abs.toString().padStart(decimals + 1, "0");
  const integer = padded.slice(0, -decimals);
  const fraction = padded.slice(-decimals).replace(/0+$/, "");

  const out = fraction ? `${integer}.${fraction}` : integer;
  return negative ? `-${out}` : out;
}

function getMetadataPda(mint: string): PublicKey {
  return PublicKeyCtor.findProgramAddressSync(
    [
      new TextEncoder().encode("metadata"),
      METADATA_PROGRAM_ID.toBytes(),
      new PublicKeyCtor(mint).toBytes(),
    ],
    METADATA_PROGRAM_ID
  )[0];
}

async function fetchJson(url?: string): Promise<any | null> {
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

async function enrichTokenOption(option: TokenOption): Promise<TokenOption> {
  const cached = tokenMetadataCache.get(option.mint);
  if (cached) return cached;

  const inFlight = tokenMetadataInFlight.get(option.mint);
  if (inFlight) return inFlight;

  const promise = (async () => {
    let next = { ...option };

    try {
      const asset = await fetchDigitalAsset(umi, umiPublicKey(option.mint));
      const uri = asset.metadata.uri?.replace(/\0/g, "").trim();
      const json = await fetchJson(uri);

      next = {
        ...next,
        name: json?.name?.trim() || asset.metadata.name?.trim() || option.name,
        symbol: json?.symbol?.trim() || asset.metadata.symbol?.trim() || option.symbol,
        image: json?.image?.trim() || option.image,
      };
    } catch {
      // fallback only
    }

    tokenMetadataCache.set(option.mint, next);
    return next;
  })();

  tokenMetadataInFlight.set(option.mint, promise);

  try {
    return await promise;
  } finally {
    tokenMetadataInFlight.delete(option.mint);
  }
}

type Props = {
  minBidSol: string;
  saleAmountToken: string;
  tokenMint: string;
  durationSecs: number;
  auctionType: AuctionType;
  assetKind: AssetKind;
  metadataName: string;
  metadataDescription: string;
  metadataImageFile: File | null;
  auctionPkStr?: string | null;
  disabled?: boolean;
  lockTokenMint?: boolean;
  getAllowedAuctionTypes: (kind: AssetKind) => AuctionType[];
  onAssetKindChange: (v: AssetKind) => void;
  onMetadataNameChange: (v: string) => void;
  onMetadataDescriptionChange: (v: string) => void;
  onMetadataImageChange: (file: File | null) => void;
  onMinBidSolChange: (value: string) => void;
  onSaleAmountTokenChange: (value: string) => void;
  onTokenMintChange: (value: string) => void;
  onDurationSecsChange: (value: number) => void;
  onAuctionTypeChange: (value: AuctionType) => void;
  onSubmit: () => void;
};

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <div className="space-y-2">
      <label className="block text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">
        {label}
      </label>
      {children}
      {hint ? <p className="text-xs text-[var(--muted)]/80">{hint}</p> : null}
    </div>
  );
}

const inputClass =
  "h-12 w-full border border-[var(--line)] bg-[var(--surface)] px-4 text-sm text-[var(--foreground)] outline-none placeholder:text-[var(--muted)] transition " +
  "focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/40";

const selectClass = `${inputClass} appearance-none pr-10`;

export default function AuctionCreateForm({
  minBidSol,
  saleAmountToken,
  tokenMint,
  durationSecs,
  auctionType,
  assetKind,
  metadataName,
  metadataDescription,
  metadataImageFile,
  auctionPkStr,
  disabled,
  lockTokenMint,
  getAllowedAuctionTypes,
  onAssetKindChange,
  onMetadataNameChange,
  onMetadataDescriptionChange,
  onMetadataImageChange,
  onMinBidSolChange,
  onSaleAmountTokenChange,
  onTokenMintChange,
  onDurationSecsChange,
  onAuctionTypeChange,
  onSubmit,
}: Props) {
  const isDisabled = !!disabled;
  const allowedTypes = getAllowedAuctionTypes(assetKind);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);

  const { connection } = useConnection();
  const { publicKey, connected } = useWallet();

  const [walletTokens, setWalletTokens] = useState<TokenOption[]>([]);
  const [tokenSearch, setTokenSearch] = useState("");
  const [showTokenDropdown, setShowTokenDropdown] = useState(false);

  const loadedKeyRef = useRef<string>("");
  const debounceRef = useRef<number | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const ownerBase58 = publicKey?.toBase58() ?? "";
  const rpcEndpoint = connection.rpcEndpoint;

  useEffect(() => {
    if (debounceRef.current !== null) {
      window.clearTimeout(debounceRef.current);
    }

    debounceRef.current = window.setTimeout(() => {
      const owner = publicKey;
      if (!connected || !owner) {
        abortRef.current?.abort();
        loadedKeyRef.current = "";
        setWalletTokens([]);
        return;
      }

      const cacheKey = `${owner.toBase58()}@${rpcEndpoint}`;
      if (loadedKeyRef.current === cacheKey) {
        return;
      }
      loadedKeyRef.current = cacheKey;

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      const loadWalletTokens = async () => {
        try {
          const tokenProgramIds = [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID];

          const parsedSets = await Promise.all(
            tokenProgramIds.map((programId) => connection.getParsedTokenAccountsByOwner(owner, { programId }))
          );

          if (controller.signal.aborted) return;

          const byMint = new Map<string, TokenOption & { rawAmount: bigint }>();

          for (const parsed of parsedSets) {
            for (const entry of parsed.value) {
              const info = (entry.account.data as any)?.parsed?.info;
              const mint = String(info?.mint ?? "");
              const rawAmount = BigInt(String(info?.tokenAmount?.amount ?? "0"));
              const decimals = Number(info?.tokenAmount?.decimals ?? 0);

              if (!mint || rawAmount <= 0n) continue;

              const existing = byMint.get(mint);
              if (existing) {
                existing.rawAmount += rawAmount;
                existing.balance = formatTokenAmount(existing.rawAmount, existing.decimals);
              } else {
                byMint.set(mint, {
                  mint,
                  ata: entry.pubkey.toBase58(),
                  balance: formatTokenAmount(rawAmount, decimals),
                  decimals,
                  rawAmount,
                });
              }
            }
          }

          const options = [...byMint.values()].map(({ rawAmount, ...rest }) => rest);

          const enriched = await Promise.all(options.slice(0, 8).map((opt) => enrichTokenOption(opt)));

          if (!controller.signal.aborted) {
            setWalletTokens(enriched);
          }
        } catch {
          if (!controller.signal.aborted) {
            setWalletTokens([]);
          }
        }
      };

      void loadWalletTokens();
    }, 250);

    return () => {
      if (debounceRef.current !== null) {
        window.clearTimeout(debounceRef.current);
        debounceRef.current = null;
      }
      abortRef.current?.abort();
    };
  }, [connected, ownerBase58, rpcEndpoint, connection, publicKey]);

  useEffect(() => {
    if (!metadataImageFile) {
      setPreviewUrl(null);
      return;
    }

    const url = URL.createObjectURL(metadataImageFile);
    setPreviewUrl(url);

    return () => URL.revokeObjectURL(url);
  }, [metadataImageFile]);

  const selectedToken = useMemo(() => {
    const value = tokenMint.trim();
    if (!value) return null;
    return walletTokens.find((t) => t.mint === value || t.ata === value) ?? null;
  }, [tokenMint, walletTokens]);

  const tokenSuggestions = useMemo(() => {
    const q = tokenSearch.trim().toLowerCase();

    const items = walletTokens.filter((t) => {
      if (!q) return true;
      return (
        t.mint.toLowerCase().includes(q) ||
        t.ata.toLowerCase().includes(q) ||
        (t.name ?? "").toLowerCase().includes(q) ||
        (t.symbol ?? "").toLowerCase().includes(q)
      );
    });

    return items.slice(0, 8);
  }, [tokenSearch, walletTokens]);

  function pickToken(option: TokenOption) {
    onTokenMintChange(option.mint);
    setTokenSearch(option.name ? `${option.name} ${option.symbol ?? ""}`.trim() : option.mint);
    setShowTokenDropdown(false);
  }

  return (
    <section className="relative overflow-hidden border border-[var(--line)] bg-[var(--surface)] p-6 shadow-none md:p-8">
      <div className="absolute inset-x-0 top-0 h-px bg-[var(--accent)]" />

      <div className="relative">
        <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="mb-2 inline-flex border border-[var(--line)] bg-[var(--background)] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.22em] text-[var(--muted)]">
              Create auction
            </div>
            <h3 className="text-2xl font-semibold tracking-tight text-[var(--foreground)] md:text-3xl">
              Launch a sealed auction
            </h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-[var(--muted)]">
              Configure the terms, asset mode, metadata, duration, and settlement type from a single panel.
            </p>
          </div>

          <div className="border border-[var(--line)] bg-[var(--background)] px-4 py-3 text-sm text-[var(--muted)]">
            <span className="block text-[11px] uppercase tracking-[0.22em] text-[var(--muted)]/70">
              Auction PDA
            </span>
            <span className="mt-1 block font-mono text-xs text-[var(--foreground)]">
              {auctionPkStr ?? "<none>"}
            </span>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-2">
          <Field label="Asset type" hint="Choose SPL token, NFT, or metadata-only mode.">
            <select
              value={assetKind}
              onChange={(e) => onAssetKindChange(e.target.value as AssetKind)}
              className={selectClass}
            >
              <option value="Fungible">SPL Token</option>
              <option value="Nft">NFT</option>
              <option value="MetadataOnly">Metadata Only</option>
            </select>
          </Field>

          <Field label="Name" hint="Optional. Saved into JSON metadata if provided.">
            <input
              value={metadataName}
              onChange={(e) => onMetadataNameChange(e.target.value)}
              className={inputClass}
              placeholder="Auction title"
            />
          </Field>

          <Field label="Description" hint="Optional. Saved into JSON metadata if provided.">
            <input
              value={metadataDescription}
              onChange={(e) => onMetadataDescriptionChange(e.target.value)}
              className={inputClass}
              placeholder="Short description"
            />
          </Field>

          <Field label="Image" hint="Optional. Uploaded first, then referenced from the JSON metadata.">
            <input
              type="file"
              accept="image/*"
              onChange={(e) => onMetadataImageChange(e.target.files?.[0] ?? null)}
              className="block h-12 w-full border border-[var(--line)] bg-[var(--surface)] px-4 py-2 text-sm text-[var(--foreground)] outline-none file:mr-4 file:border-0 file:bg-[var(--background)] file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-[var(--foreground)] hover:file:bg-[var(--surface-2)] focus:border-[var(--accent)] focus:ring-1 focus:ring-[var(--accent)]/40"
            />

            {metadataImageFile ? (
              <div className="mt-3 overflow-hidden border border-[var(--line)] bg-[var(--background)]">
                {previewUrl ? (
                  <img src={previewUrl} alt={metadataImageFile.name} className="h-44 w-full object-cover" />
                ) : null}
                <div className="border-t border-[var(--line)] px-4 py-3 text-sm text-[var(--muted)]">
                  {metadataImageFile.name}
                </div>
              </div>
            ) : null}
          </Field>

          <Field label="Min bid (SOL)" hint="Lowest bid allowed for this auction.">
            <input
              type="number"
              step="0.000000001"
              min={0}
              value={minBidSol}
              onChange={(e) => onMinBidSolChange(e.target.value)}
              className={inputClass}
              placeholder="0.10"
            />
          </Field>

          {assetKind === "Fungible" ? (
            <Field label="Prize amount" hint="Token amount sent to the winner(s).">
              <input
                type="number"
                step="0.000001"
                min={0}
                value={saleAmountToken}
                onChange={(e) => onSaleAmountTokenChange(e.target.value)}
                className={inputClass}
                placeholder="1000"
              />
            </Field>
          ) : assetKind === "Nft" ? (
            <Field label="Prize amount" hint="NFT mode is fixed to exactly 1.">
              <input type="text" value="1" disabled className={`${inputClass} cursor-not-allowed opacity-60`} />
            </Field>
          ) : null}

          {assetKind !== "MetadataOnly" ? (
            <Field
              label="Token mint"
              hint={lockTokenMint ? "Locked in proposal mode." : "Type a mint directly or pick one from your wallet tokens."}
            >
              <div className="relative">
                <input
                  type="text"
                  value={tokenMint}
                  onFocus={() => setShowTokenDropdown(true)}
                  onChange={(e) => {
                    onTokenMintChange(e.target.value);
                    setTokenSearch(e.target.value);
                    setShowTokenDropdown(true);
                  }}
                  onBlur={() => {
                    window.setTimeout(() => setShowTokenDropdown(false), 150);
                  }}
                  disabled={lockTokenMint}
                  className={`${inputClass} ${lockTokenMint ? "cursor-not-allowed opacity-60" : ""}`}
                  placeholder="Mint address"
                />

                {showTokenDropdown && !lockTokenMint ? (
                  <div className="absolute z-20 mt-2 max-h-80 w-full overflow-auto border border-[var(--line)] bg-[var(--background)] shadow-none">
                    <div className="border-b border-[var(--line)] px-4 py-2 text-[11px] uppercase tracking-[0.22em] text-[var(--muted)]/70">
                      Wallet suggestions
                    </div>

                    {tokenSuggestions.length ? (
                      tokenSuggestions.map((token) => {
                        const isSelected = tokenMint === token.mint || tokenMint === token.ata;
                        return (
                          <button
                            key={`${token.mint}:${token.ata}`}
                            type="button"
                            onMouseDown={(e) => e.preventDefault()}
                            onClick={() => pickToken(token)}
                            className={`flex w-full items-center gap-3 border-b border-[var(--line)] px-4 py-3 text-left transition hover:bg-[var(--surface-2)] ${
                              isSelected ? "bg-[var(--surface-2)]" : "bg-[var(--background)]"
                            }`}
                          >
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden border border-[var(--line)] bg-[var(--surface)]">
                              {token.image ? (
                                <img src={token.image} alt={token.name ?? token.mint} className="h-full w-full object-cover" />
                              ) : (
                                <span className="text-[10px] text-[var(--muted)]">TOK</span>
                              )}
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-medium text-[var(--foreground)]">
                                {token.name ?? token.symbol ?? "Unknown token"}
                              </div>
                              <div className="mt-0.5 truncate text-xs text-[var(--muted)]">
                                {shorten(token.mint, 8, 6)} · ATA {shorten(token.ata, 8, 6)}
                              </div>
                            </div>

                            <div className="shrink-0 text-right text-xs text-[var(--muted)]">
                              <div>{token.balance}</div>
                            </div>
                          </button>
                        );
                      })
                    ) : (
                      <div className="px-4 py-4 text-sm text-[var(--muted)]">No wallet tokens matched.</div>
                    )}
                  </div>
                ) : null}
              </div>

              {selectedToken ? (
                <div className="mt-3 border border-[var(--line)] bg-[var(--background)] p-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden border border-[var(--line)] bg-[var(--surface)]">
                      {selectedToken.image ? (
                        <img
                          src={selectedToken.image}
                          alt={selectedToken.name ?? selectedToken.mint}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="text-[10px] text-[var(--muted)]">TOK</span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-[var(--foreground)]">
                        {selectedToken.name ?? selectedToken.symbol ?? "Selected token"}
                      </div>
                      <div className="truncate text-xs text-[var(--muted)]">
                        Mint {shorten(selectedToken.mint, 8, 6)} · ATA {shorten(selectedToken.ata, 8, 6)}
                      </div>
                    </div>
                  </div>
                </div>
              ) : null}
            </Field>
          ) : null}

          <Field label="Duration" hint="Set auction length (days, hours, minutes, seconds).">
            <div className="flex w-full gap-3">
              {[
                { label: "d", value: Math.floor(durationSecs / 86400), max: undefined },
                { label: "h", value: Math.floor((durationSecs % 86400) / 3600), max: 23 },
                { label: "m", value: Math.floor((durationSecs % 3600) / 60), max: 59 },
                { label: "s", value: durationSecs % 60, max: 59 },
              ].map((unit, i) => (
                <div key={unit.label} className="flex flex-1 items-center gap-1">
                  <input
                    type="number"
                    min={0}
                    max={unit.max}
                    value={unit.value === 0 ? "" : unit.value}
                    onChange={(e) => {
                      const val = Number(e.target.value || 0);

                      const days = Math.floor(durationSecs / 86400);
                      const hours = Math.floor((durationSecs % 86400) / 3600);
                      const mins = Math.floor((durationSecs % 3600) / 60);
                      const secs = durationSecs % 60;

                      const next =
                        i === 0
                          ? val * 86400 + (durationSecs % 86400)
                          : i === 1
                          ? days * 86400 + val * 3600 + (durationSecs % 3600)
                          : i === 2
                          ? days * 86400 + hours * 3600 + val * 60 + secs
                          : days * 86400 + hours * 3600 + mins * 60 + val;

                      onDurationSecsChange(next);
                    }}
                    className={`${inputClass} w-full bg-[var(--surface)]`}
                  />
                  <span className="shrink-0 text-sm text-[var(--muted)]">{unit.label}</span>
                </div>
              ))}
            </div>
          </Field>
        </div>

        <div className="mt-4 grid gap-4 md:grid-cols-[1.2fr_0.8fr_auto] md:items-end">
          <Field label="Auction type" hint="Uniform and Pro Rata are hidden for NFT / metadata-only.">
            <select
              value={auctionType}
              onChange={(e) => onAuctionTypeChange(e.target.value as AuctionType)}
              className={selectClass}
            >
              {allowedTypes.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </Field>

          <div className="border border-[var(--line)] bg-[var(--background)] px-4 py-3">
            <p className="text-[11px] uppercase tracking-[0.22em] text-[var(--muted)]/70">Status</p>
            <p className="mt-1 text-sm text-[var(--foreground)]">
              {isDisabled ? "Connect wallet to continue." : "Ready to create."}
            </p>
          </div>

          <button onClick={onSubmit} disabled={isDisabled} className="btn btn-primary h-12 px-5 text-sm font-semibold">
            Make Auction
          </button>
        </div>

        {auctionPkStr ? (
          <div className="mt-5">
            <Link
              href={`/bid?auctionPk=${encodeURIComponent(auctionPkStr)}`}
              className="btn surface-hover inline-flex items-center gap-2 px-4 py-2 text-sm text-[var(--foreground)]"
            >
              Open this auction’s bid page
              <span aria-hidden>→</span>
            </Link>
          </div>
        ) : null}
      </div>
    </section>
  );
}