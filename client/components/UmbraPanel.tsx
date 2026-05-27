"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import * as nobleEd25519 from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha2.js";
import { getUserRegistrationFunction } from "@umbra-privacy/sdk/registration";
import {
  getUserAccountQuerierFunction,
  getEncryptedBalanceQuerierFunction,
} from "@umbra-privacy/sdk/query";
import {
  getMintX25519KeypairDeriver,
  getMasterViewingKeyX25519KeypairDeriver,
} from "@umbra-privacy/sdk/crypto";
import { getUserRegistrationProver } from "@umbra-privacy/sdk";
import { address as toAddress } from "@solana/kit";

import { useUmbraClient } from "@/lib/useUmbraClient";
import bs58 from "bs58";

nobleEd25519.hashes.sha512 = sha512;

const DEVNET_USDC_MINT = toAddress("4oG4sjmopf5MzvTHLE8rpVJ2uyczxfsw2K84SUTpNDx7");
const FAUCET_URL = "https://faucet.umbraprivacy.com/";

type AccountState =
  | { kind: "idle" }
  | { kind: "non_existent" }
  | {
      kind: "exists";
      isInitialised: boolean;
      isUserAccountX25519KeyRegistered: boolean;
      isUserCommitmentRegistered: boolean;
      isActiveForAnonymousUsage: boolean;
      x25519PublicKey?: string;
      generationIndex?: string;
    };

function formatBytes(bytes?: Uint8Array) {
  if (!bytes) return "";
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function captureDeriver(base: any, seedMap: Map<string, Uint8Array>) {
  return (async () => {
    const r = await base();
    const pub = nobleEd25519.getPublicKey(r.ed25519Keypair.seed);
    seedMap.set(bs58.encode(pub), r.ed25519Keypair.seed);
    return r;
  }) as any;
}

export default function UmbraPanel() {
  const wallet = useWallet();
  const seedMapRef = useRef(new Map<string, Uint8Array>());

  const { client, depositFn, withdrawFn } = useUmbraClient();

  const [registered, setRegistered] = useState<boolean | null>(null);
  const [accountState, setAccountState] = useState<AccountState>({ kind: "idle" });
  const [balance, setBalance] = useState("0");
  const [amount, setAmount] = useState("1");

  const [progress, setProgress] = useState(0);
  const [loading, setLoading] = useState(false);
  const [status, setStatus] = useState("Connecting...");
  const [phase, setPhase] = useState<"idle" | "register" | "deposit" | "withdraw">("idle");

  useEffect(() => {
    seedMapRef.current.clear();
  }, [wallet.publicKey?.toBase58()]);

  const userQuery = useMemo(
    () => client && getUserAccountQuerierFunction({ client }),
    [client],
  );
  const balQuery = useMemo(
    () => client && getEncryptedBalanceQuerierFunction({ client }),
    [client],
  );

  const refresh = useCallback(async () => {
    if (!client || !userQuery || !balQuery) return;

    setStatus("Checking registration and balance...");
    const acc = await userQuery(client.signer.address);

    if (acc.state !== "exists" || !acc.data.isInitialised) {
      setRegistered(false);
      setAccountState({ kind: "non_existent" });
      setBalance("0");
      setStatus("Wallet is not registered yet.");
      return;
    }

    setRegistered(true);
    setAccountState({
      kind: "exists",
      isInitialised: acc.data.isInitialised,
      isUserAccountX25519KeyRegistered: acc.data.isUserAccountX25519KeyRegistered,
      isUserCommitmentRegistered: acc.data.isUserCommitmentRegistered,
      isActiveForAnonymousUsage: acc.data.isActiveForAnonymousUsage,
      x25519PublicKey: formatBytes(acc.data.x25519PublicKey),
      generationIndex: acc.data.generationIndex?.toString?.() ?? String(acc.data.generationIndex ?? ""),
    });

    const res = await balQuery([DEVNET_USDC_MINT]);
    const r = res.get(DEVNET_USDC_MINT);

    if (r?.state === "shared") {
      setBalance(r.balance.toString());
      setStatus("USDC balance loaded.");
    } else {
      setBalance("0");
      setStatus("No decrypted USDC balance found for this mint.");
    }
  }, [client, userQuery, balQuery]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleRegister = async () => {
    if (!client) return;

    setLoading(true);
    setPhase("register");
    setProgress(10);
    setStatus("Preparing registration...");

    try {
      await client.masterSeed.getMasterSeed();
      setProgress(25);
      setStatus("Master seed ready. Building registration...");

      const register = getUserRegistrationFunction(
        { client } as any,
        {
          zkProver: getUserRegistrationProver() as any,
          keys: {
            userAccountX25519KeypairDeriver: captureDeriver(
              getMintX25519KeypairDeriver({ client } as any),
              seedMapRef.current,
            ),
            masterViewingKeyEncryptingX25519KeypairDeriver: captureDeriver(
              getMasterViewingKeyX25519KeypairDeriver({ client } as any),
              seedMapRef.current,
            ),
          },
          callbacks: {
            userAccountInitialisation: {
              pre: () => setStatus("Signing account setup transaction..."),
              post: () => setProgress((p) => Math.max(p, 50)),
            },
            registerX25519PublicKey: {
              pre: () => setStatus("Signing shared-key transaction..."),
              post: () => setProgress((p) => Math.max(p, 75)),
            },
            registerUserForAnonymousUsage: {
              pre: () => setStatus("Signing anonymous-registration transaction..."),
              post: () => setProgress((p) => Math.max(p, 95)),
            },
          },
        } as any,
      );

      await register({ confidential: true, anonymous: true });
      setProgress(100);
      setStatus("Registration complete.");
      await refresh();
    } catch (e: any) {
      console.error(e);
      setStatus(e?.message ?? "Registration failed.");
    } finally {
      setLoading(false);
      setPhase("idle");
    }
  };

  const handleDeposit = async () => {
    if (!depositFn || !client) return;

    setLoading(true);
    setPhase("deposit");
    setStatus("Preparing USDC deposit...");

    try {
      const amt = BigInt(amount) as any;
      setStatus("Signing USDC deposit transaction...");
      await depositFn(client.signer.address, DEVNET_USDC_MINT, amt, {
        accountInfoCommitment: "confirmed",
      });

      setStatus("USDC deposit complete.");
      await refresh();
} catch (e: any) {
  console.error("Deposit failed:", e);

  console.error("Top-level logs:", e?.logs);

  console.error("Cause logs:", e?.cause?.logs);

  console.error(
    "Simulation logs:",
    e?.cause?.context?.logs
  );

  console.error(
    "Full error JSON:",
    JSON.stringify(e, null, 2)
  );

  setStatus(e?.message ?? "Deposit failed.");
}finally {
      setLoading(false);
      setPhase("idle");
    }
  };

  const handleWithdraw = async () => {
    if (!withdrawFn || !client) return;

    setLoading(true);
    setPhase("withdraw");
    setStatus("Preparing USDC withdrawal...");

    try {
      const amt = BigInt(amount) as any;
      setStatus("Signing USDC withdrawal transaction...");
      await withdrawFn(client.signer.address, DEVNET_USDC_MINT, amt, {
        accountInfoCommitment: "confirmed",
      });

      setStatus("USDC withdrawal complete.");
      await refresh();
    } catch (e: any) {
      console.error(e);
      setStatus(e?.message ?? "Withdrawal failed.");
    } finally {
      setLoading(false);
      setPhase("idle");
    }
  };

  if (!client) {
    return (
      <div className="page-shell flex min-h-[100svh] items-center justify-center px-4">
        <div className="surface-strong w-[min(92vw,28rem)] p-6 transition-all duration-200 surface-hover">
          <div className="text-xs uppercase tracking-[0.2em] text-muted">Umbra</div>
          <div className="mt-2 text-2xl hero-title">Connecting...</div>
          <div className="mt-3 h-1 w-full overflow-hidden bg-[var(--surface-3)]">
            <div className="h-full w-1/3 animate-pulse bg-accent" />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="page-shell flex min-h-[100svh] items-center justify-center px-4 py-8">
      <div className="surface-strong w-[min(92vw,32rem)] p-6 transition-all duration-200 surface-hover hover:shadow-[0_0_0_1px_var(--line-strong)]">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div>
            <h1 className="hero-title mt-2 text-3xl">
              {registered ? "Encrypted USDC Balance" : "Register"}
            </h1>
            <p className="hero-copy mt-2 text-sm leading-6">
              Use the Umbra devnet faucet to top up dUSDC, then deposit into your encrypted balance.
            </p>
          </div>
        </div>

        {!registered ? (
          <div className="group">
            <div className="mb-6 space-y-2">
              <div className="text-xs uppercase tracking-[0.2em] text-muted">Umbra</div>
              <p className="hero-copy text-sm leading-6">Create your encrypted USDC account.</p>
            </div>

            <div className="mb-2 flex items-center justify-between text-xs uppercase tracking-[0.18em] text-muted">
              <span>{loading ? "Working" : "Ready"}</span>
              <span>{progress}%</span>
            </div>
            <div className="mb-6 h-1 w-full overflow-hidden bg-[var(--surface-3)]">
              <div
                className="h-full bg-accent transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>

            <button
              onClick={handleRegister}
              disabled={loading}
              className="btn-primary w-full py-3 font-bold uppercase tracking-[0.18em] transition-all duration-200 hover:-translate-y-0.5 hover:scale-[1.01] hover:shadow-[0_8px_24px_rgba(0,230,118,0.14)] active:translate-y-0 active:scale-[0.99] disabled:translate-y-0 disabled:scale-100 disabled:opacity-60"
            >
              {loading ? status : "Register"}
            </button>

            <div className="mt-4 text-sm text-muted">{status}</div>
          </div>
        ) : (
          <div className="group">
            <div className="mb-3 rounded-none border border-[var(--line)] bg-[var(--surface)] px-4 py-3 text-sm text-muted transition-colors duration-200 hover:border-[var(--line-strong)] hover:bg-[var(--surface-2)]">
              <div className="flex items-center justify-between gap-3">
                <span>Umbra devnet USDC</span>
                <a
                  href={FAUCET_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="text-accent underline-offset-2 hover:underline"
                >
                  Get more
                </a>
              </div>
              <div className="mt-1 break-all text-xs">Mint: {DEVNET_USDC_MINT}</div>
            </div>

            <div className="mb-8 text-center">
              <div className="text-xs uppercase tracking-[0.2em] text-muted">Balance</div>
                <div className="hero-title mt-2 text-6xl font-semibold transition-transform duration-200 group-hover:scale-[1.01]">
                  {balance} <span className="text-3xl text-muted">USDC</span>
                </div>
            </div>

            <label className="mb-4 block">
              <span className="mb-2 block text-xs uppercase tracking-[0.18em] text-muted">
                Amount
              </span>
              <input
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                inputMode="numeric"
                className="surface w-full px-4 py-3 outline-none transition-colors duration-200 focus:border-accent focus:shadow-[0_0_0_1px_var(--accent)]"
                placeholder="1"
              />
            </label>

            <div className="mb-4 grid grid-cols-2 gap-3">
              <button
                onClick={handleDeposit}
                disabled={loading}
                className="btn-primary py-3 font-bold uppercase tracking-[0.18em] transition-all duration-200 hover:-translate-y-0.5 hover:scale-[1.01] hover:shadow-[0_8px_24px_rgba(0,230,118,0.14)] active:translate-y-0 active:scale-[0.99] disabled:translate-y-0 disabled:scale-100 disabled:opacity-60"
              >
                {phase === "deposit" && loading ? "Signing..." : "Deposit"}
              </button>

              <button
                onClick={handleWithdraw}
                disabled={loading}
                className="btn py-3 font-bold uppercase tracking-[0.18em] transition-all duration-200 hover:-translate-y-0.5 hover:scale-[1.01] hover:border-accent hover:text-accent hover:shadow-[0_8px_24px_rgba(0,230,118,0.10)] active:translate-y-0 active:scale-[0.99] disabled:translate-y-0 disabled:scale-100 disabled:opacity-60"
              >
                {phase === "withdraw" && loading ? "Signing..." : "Withdraw"}
              </button>
            </div>

            <button
              onClick={refresh}
              disabled={loading}
              className="btn w-full py-3 transition-transform duration-200 hover:-translate-y-0.5 hover:border-accent hover:text-accent disabled:translate-y-0 disabled:opacity-60"
            >
              Refresh
            </button>

            <div className="mt-4 rounded-none border border-[var(--line)] bg-[var(--surface-3)] px-4 py-3 text-sm text-muted transition-colors duration-200 hover:border-[var(--line-strong)] hover:bg-[var(--surface-2)]">
              {status}
            </div>
          </div>
        )}

        <details className="mt-5 group/details">
          <summary className="cursor-pointer list-none border-t border-[var(--line)] pt-4 text-xs uppercase tracking-[0.18em] text-muted transition-colors hover:text-foreground">
            Advanced
          </summary>
          <div className="mt-4 grid gap-3 text-sm text-muted">
            <div className="surface px-4 py-3 transition-colors duration-200 hover:border-[var(--line-strong)] hover:bg-[var(--surface-2)]">
              <div className="text-xs uppercase tracking-[0.16em] text-muted">Wallet</div>
              <div className="mt-1 break-all text-foreground">
                {wallet.publicKey?.toBase58() ?? "n/a"}
              </div>
            </div>

            <div className="surface px-4 py-3 transition-colors duration-200 hover:border-[var(--line-strong)] hover:bg-[var(--surface-2)]">
              <div className="text-xs uppercase tracking-[0.16em] text-muted">Account state</div>
              <div className="mt-1 text-foreground">
                {accountState.kind === "exists" ? (
                  <div className="grid gap-1">
                    <div>Initialised: {String(accountState.isInitialised)}</div>
                    <div>
                      Shared key registered: {String(
                        accountState.isUserAccountX25519KeyRegistered,
                      )}
                    </div>
                    <div>
                      Anonymous commitment registered: {String(
                        accountState.isUserCommitmentRegistered,
                      )}
                    </div>
                    <div>
                      Active for anonymous usage: {String(accountState.isActiveForAnonymousUsage)}
                    </div>
                    <div className="break-all">
                      X25519 public key: {accountState.x25519PublicKey || "n/a"}
                    </div>
                    <div>Generation index: {accountState.generationIndex || "n/a"}</div>
                  </div>
                ) : accountState.kind === "non_existent" ? (
                  <span>No Umbra account found yet.</span>
                ) : (
                  <span>Waiting for account lookup...</span>
                )}
              </div>
            </div>

            <div className="surface px-4 py-3 transition-colors duration-200 hover:border-[var(--line-strong)] hover:bg-[var(--surface-2)]">
              <div className="text-xs uppercase tracking-[0.16em] text-muted">Detected Network:</div>
              <div className="mt-1 text-foreground">Devnet</div>
            </div>
          </div>
        </details>
      </div>
    </div>
  );
}