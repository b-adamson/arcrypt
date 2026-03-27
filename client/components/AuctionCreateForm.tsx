"use client";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useConnection, useWallet } from "@solana/wallet-adapter-react";
import {
  TOKEN_PROGRAM_ID,
  TOKEN_2022_PROGRAM_ID,
} from "@solana/spl-token";
import { Metadata } from "@metaplex-foundation/mpl-token-metadata";
import type { Connection, PublicKey } from "@solana/web3.js";
import { PublicKey as PublicKeyCtor } from "@solana/web3.js";

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

const METADATA_PROGRAM_ID = new PublicKeyCtor(
  "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
);

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

async function enrichTokenOption(
  option: TokenOption,
  connection: Connection
): Promise<TokenOption> {
  const cached = tokenMetadataCache.get(option.mint);
  if (cached) return cached;

  const inFlight = tokenMetadataInFlight.get(option.mint);
  if (inFlight) return inFlight;

  const promise = (async () => {
    let next = { ...option };

    try {
      const metadataPda = getMetadataPda(option.mint);
      const info = await connection.getAccountInfo(metadataPda);

      if (info?.data) {
        const [metadata] = Metadata.deserialize(info.data);

        const uri = metadata.data.uri?.replace(/\0/g, "").trim();
        const json = await fetchJson(uri);

        next = {
          ...next,
          name:
            json?.name?.trim() ||
            metadata.data.name?.replace(/\0/g, "").trim() ||
            option.name,
          symbol:
            json?.symbol?.trim() ||
            metadata.data.symbol?.replace(/\0/g, "").trim() ||
            option.symbol,
          image: json?.image?.trim() || option.image,
        };
      }
    } catch {
      // No metadata account or undecodable metadata; fall back to mint-only display.
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
      <label className="block text-[11px] font-semibold uppercase tracking-[0.18em] text-white/55">
        {label}
      </label>
      {children}
      {hint ? <p className="text-xs text-white/40">{hint}</p> : null}
    </div>
  );
}

const inputClass =
  "h-12 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm text-white outline-none " +
  "placeholder:text-white/30 transition focus:border-fuchsia-400/50 focus:bg-white/[0.06] focus:ring-2 focus:ring-fuchsia-500/20";

const selectClass = inputClass + " appearance-none pr-10";

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

  useEffect(() => {
    if (!metadataImageFile) {
      setPreviewUrl(null);
      return;
    }

    const url = URL.createObjectURL(metadataImageFile);
    setPreviewUrl(url);

    return () => URL.revokeObjectURL(url);
  }, [metadataImageFile]);

  useEffect(() => {
    let cancelled = false;

    async function loadWalletTokens() {
      if (!connected || !publicKey) {
        setWalletTokens([]);
        return;
      }

      try {
        const tokenProgramIds = [TOKEN_PROGRAM_ID, TOKEN_2022_PROGRAM_ID];

        const parsedSets = await Promise.all(
          tokenProgramIds.map((programId) =>
            connection.getParsedTokenAccountsByOwner(publicKey, { programId })
          )
        );

        const byMint = new Map<
          string,
          TokenOption & { rawAmount: bigint }
        >();

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

        const enriched = await Promise.all(
          options.map((opt) => enrichTokenOption(opt, connection))
        );

        if (!cancelled) {
          setWalletTokens(enriched);
        }
      } catch {
        if (!cancelled) {
          setWalletTokens([]);
        }
      }
    }

    loadWalletTokens();

    return () => {
      cancelled = true;
    };
  }, [connected, publicKey, connection]);

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
    setTokenSearch(
      option.name ? `${option.name} ${option.symbol ?? ""}`.trim() : option.mint
    );
    setShowTokenDropdown(false);
  }

  return (
    <section className="relative overflow-hidden rounded-[28px] border border-white/10 bg-gradient-to-br from-fuchsia-500/10 via-white/[0.03] to-cyan-400/5 p-6 shadow-[0_30px_90px_rgba(0,0,0,0.45)] backdrop-blur-xl md:p-8">
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-fuchsia-400/70 to-transparent" />
      <div className="absolute -right-24 -top-20 h-56 w-56 rounded-full bg-fuchsia-500/10 blur-3xl" />
      <div className="absolute -left-24 bottom-0 h-56 w-56 rounded-full bg-cyan-400/10 blur-3xl" />

      <div className="relative">
        <div className="mb-6 flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
          <div>
            <div className="mb-2 inline-flex rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white/60">
              Create auction
            </div>
            <h3 className="text-2xl font-semibold tracking-tight text-white md:text-3xl">
              Launch a sealed auction
            </h3>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/55">
              Configure the terms, asset mode, metadata, duration, and settlement type from a single panel.
            </p>
          </div>

          <div className="rounded-2xl border border-white/10 bg-black/25 px-4 py-3 text-sm text-white/60">
            <span className="block text-[11px] uppercase tracking-[0.18em] text-white/35">
              Auction PDA
            </span>
            <span className="mt-1 block font-mono text-xs text-white/85">
              {auctionPkStr ?? "<none>"}
            </span>
          </div>
        </div>

        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-2">
          <Field label="Asset type" hint="Choose SPL token, NFT, or metadata-only mode.">
<select
  value={assetKind}
  onChange={(e) => onAssetKindChange(e.target.value as AssetKind)}
  className={`${selectClass} bg-black text-white`}
>
  <option value="Fungible" className="bg-black text-white">SPL Token</option>
  <option value="Nft" className="bg-black text-white">NFT</option>
  <option value="MetadataOnly" className="bg-black text-white">Metadata Only</option>
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
              className="block h-12 w-full rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm text-white outline-none file:mr-4 file:rounded-full file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-white file:transition hover:file:bg-white/15 focus:border-fuchsia-400/50 focus:bg-white/[0.06] focus:ring-2 focus:ring-fuchsia-500/20"
            />

            {metadataImageFile ? (
              <div className="mt-3 overflow-hidden rounded-2xl border border-white/10 bg-black/20">
                {previewUrl ? (
                  <img
                    src={previewUrl}
                    alt={metadataImageFile.name}
                    className="h-44 w-full object-cover"
                  />
                ) : null}
                <div className="border-t border-white/10 px-4 py-3 text-sm text-white/70">
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
              <input
                type="text"
                value="1"
                disabled
                className={`${inputClass} cursor-not-allowed opacity-60`}
              />
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
                  <div className="absolute z-20 mt-2 max-h-80 w-full overflow-auto rounded-2xl border border-white/10 bg-[#0b0b12] shadow-2xl">
                    <div className="border-b border-white/10 px-4 py-2 text-[11px] uppercase tracking-[0.18em] text-white/35">
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
                            className={`flex w-full items-center gap-3 px-4 py-3 text-left transition hover:bg-white/5 ${
                              isSelected ? "bg-white/[0.06]" : ""
                            }`}
                          >
                            <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-white/[0.04]">
                              {token.image ? (
                                <img src={token.image} alt={token.name ?? token.mint} className="h-full w-full object-cover" />
                              ) : (
                                <span className="text-[10px] text-white/45">TOK</span>
                              )}
                            </div>

                            <div className="min-w-0 flex-1">
                              <div className="truncate text-sm font-medium text-white">
                                {token.name ?? token.symbol ?? "Unknown token"}
                              </div>
                              <div className="mt-0.5 truncate text-xs text-white/45">
                                {shorten(token.mint, 8, 6)} · ATA {shorten(token.ata, 8, 6)}
                              </div>
                            </div>

                            <div className="shrink-0 text-right text-xs text-white/55">
                              <div>{token.balance}</div>
                            </div>
                          </button>
                        );
                      })
                    ) : (
                      <div className="px-4 py-4 text-sm text-white/45">
                        No wallet tokens matched.
                      </div>
                    )}
                  </div>
                ) : null}
              </div>

              {selectedToken ? (
                <div className="mt-3 rounded-2xl border border-white/10 bg-black/20 p-3">
                  <div className="flex items-center gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center overflow-hidden rounded-full border border-white/10 bg-white/[0.04]">
                      {selectedToken.image ? (
                        <img
                          src={selectedToken.image}
                          alt={selectedToken.name ?? selectedToken.mint}
                          className="h-full w-full object-cover"
                        />
                      ) : (
                        <span className="text-[10px] text-white/45">TOK</span>
                      )}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-medium text-white">
                        {selectedToken.name ?? selectedToken.symbol ?? "Selected token"}
                      </div>
                      <div className="truncate text-xs text-white/45">
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
          value={unit.value}
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
          className={`${inputClass} bg-black text-white w-full`}
        />
        <span className="text-white/60 text-sm shrink-0">{unit.label}</span>
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
    className={`${selectClass} bg-black text-white`}
  >
    {allowedTypes.map((type) => (
      <option key={type} value={type} className="bg-black text-white">
        {type}
      </option>
    ))}
  </select>
</Field>

          <div className="rounded-2xl border border-white/10 bg-black/20 px-4 py-3">
            <p className="text-[11px] uppercase tracking-[0.18em] text-white/35">Status</p>
            <p className="mt-1 text-sm text-white/70">
              {isDisabled ? "Connect wallet to continue." : "Ready to create."}
            </p>
          </div>

          <button
            onClick={onSubmit}
            disabled={isDisabled}
            className="inline-flex h-12 items-center justify-center rounded-2xl bg-gradient-to-r from-fuchsia-500 to-cyan-400 px-5 text-sm font-semibold text-black shadow-[0_10px_30px_rgba(217,70,239,0.22)] transition hover:brightness-110 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Make Auction
          </button>
        </div>

        {auctionPkStr ? (
          <div className="mt-5">
            <Link
              href={`/bid?auctionPk=${encodeURIComponent(auctionPkStr)}`}
              className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.03] px-4 py-2 text-sm text-white/75 transition hover:border-fuchsia-400/40 hover:bg-white/[0.06]"
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