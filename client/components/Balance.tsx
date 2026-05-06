"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { install } from "@solana/webcrypto-ed25519-polyfill";
import { useWallet } from "@solana/wallet-adapter-react";
import { Connection, Transaction, VersionedTransaction } from "@solana/web3.js";
import * as nobleEd25519 from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha2.js";

import {
  getUmbraClient,
  getUserAccountQuerierFunction,
  getEncryptedBalanceQuerierFunction,
  getPublicBalanceToEncryptedBalanceDirectDepositorFunction,
  getEncryptedBalanceToPublicBalanceDirectWithdrawerFunction,
} from "@umbra-privacy/sdk";

import {
  isEncryptedDepositError,
  isEncryptedWithdrawalError,
} from "@umbra-privacy/sdk/errors";

import {
  address as toAddress,
  getTransactionDecoder,
  getTransactionEncoder,
} from "@solana/kit";

install();
nobleEd25519.hashes.sha512 = sha512;

const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL ?? "https://api.devnet.solana.com";
const rpcSubscriptionsUrl =
  process.env.NEXT_PUBLIC_RPC_WS_URL ??
  rpcUrl.replace(/^https:/, "wss:").replace(/^http:/, "ws:");

const DEVNET_USDC_MINT = toAddress("4oG4sjmopf5MzvTHLE8rpVJ2uyczxfsw2K84SUTpNDx7");
const UMBRA_PAGE_URL = "/umbra";

const txEncoder = getTransactionEncoder();
const txDecoder = getTransactionDecoder();

function createSkipPreflightForwarder(rpcEndpoint: string) {
  const conn = new Connection(rpcEndpoint, "confirmed");

  return {
    forwardSequentially: async (txs: readonly any[]) => {
      for (const tx of txs) {
        const wire = new Uint8Array(txEncoder.encode(tx));
        const sig = await conn.sendRawTransaction(wire, {
          skipPreflight: true,
          maxRetries: 0,
        });
        await conn.confirmTransaction(sig, "confirmed");
      }
      return txs.map(() => ({ signedTransaction: new Uint8Array() }));
    },
  } as any;
}

function createWalletAdapterSigner(wallet: any) {
  const toWalletTx = (tx: any) => {
    const wire = new Uint8Array(txEncoder.encode(tx));
    try {
      return VersionedTransaction.deserialize(wire);
    } catch {
      return Transaction.from(wire);
    }
  };

  return {
    address: toAddress(wallet.publicKey.toBase58()),

    signMessage: async (msg: Uint8Array) => {
      const sig = await wallet.signMessage!(msg);
      return {
        address: toAddress(wallet.publicKey.toBase58()),
        message: msg,
        signature: sig,
      };
    },

    signTransaction: async (tx: any) => {
      const walletTx = toWalletTx(tx);
      const signed = await wallet.signTransaction!(walletTx);
      const wire = signed.serialize();
      const decoded = txDecoder.decode(wire);

      const nextDecoded: any = {
        ...decoded,
        signatures: { ...(decoded.signatures ?? {}) },
      };

      nextDecoded.signatures[wallet.publicKey.toBase58()] = signed.signatures[0];
      return nextDecoded;
    },
  } as any;
}

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

export default function Balance() {
  const wallet = useWallet();

  const [client, setClient] = useState<any>(null);
  const [registered, setRegistered] = useState<boolean | null>(null);
  const [accountState, setAccountState] = useState<AccountState>({ kind: "idle" });
  const [balance, setBalance] = useState("0");
  const [amount, setAmount] = useState("1");
  const [querying, setQuerying] = useState(false);
  const [depositing, setDepositing] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
   const seedMapRef = useRef(new Map<string, Uint8Array>());

  const signer = useMemo(() => {
    if (!wallet.connected || !wallet.publicKey) return null;
    return createWalletAdapterSigner(wallet);
  }, [wallet]);

  useEffect(() => {
    if (!signer) return;

    getUmbraClient(
      {
        signer,
        network: "devnet",
        rpcUrl,
        rpcSubscriptionsUrl,
        deferMasterSeedSignature: true,
      },
      {
        transactionForwarder: createSkipPreflightForwarder(rpcUrl),
          masterSeedStorage: {
  load: (async () => {
    try {
      const pubkey = wallet.publicKey?.toBase58();
      if (!pubkey) return { exists: false };

      const stored = sessionStorage.getItem(`umbra:seed:${pubkey}`);

      if (!stored) return { exists: false };

      return {
        exists: true,
        seed: new Uint8Array(JSON.parse(stored)),
      };
    } catch {
      return { exists: false };
    }
  }) as any,

  store: (async (seed: Uint8Array) => {
    try {
      const pubkey = wallet.publicKey?.toBase58();
      if (!pubkey) return { ok: false };

      sessionStorage.setItem(
        `umbra:seed:${pubkey}`,
        JSON.stringify(Array.from(seed)),
      );

      return { ok: true };
    } catch {
      return { ok: false };
    }
          }) as any,
        } as any,
      } as any,
    )
      .then((nextClient) => {
        setClient(nextClient);
      })
      .catch((err) => {
        console.error(err);
      });
  }, [signer]);

      useEffect(() => {
    seedMapRef.current.clear();
  }, [wallet.publicKey?.toBase58()]);

  const userAccountQuery = useMemo(() => {
    if (!client) return null;
    return getUserAccountQuerierFunction({ client });
  }, [client]);

  const encryptedBalanceQuery = useMemo(() => {
    if (!client) return null;
    return getEncryptedBalanceQuerierFunction({ client });
  }, [client]);

  const depositFn = useMemo(() => {
    if (!client) return null;
    return getPublicBalanceToEncryptedBalanceDirectDepositorFunction({ client });
  }, [client]);

  const withdrawFn = useMemo(() => {
    if (!client) return null;
    return getEncryptedBalanceToPublicBalanceDirectWithdrawerFunction({ client });
  }, [client]);

  const refresh = useCallback(async () => {
    if (!client || !userAccountQuery || !encryptedBalanceQuery) return;

    setQuerying(true);

    try {
      const acc = await userAccountQuery(client.signer.address);

      if (acc.state !== "exists" || !acc.data.isInitialised) {
        setRegistered(false);
        setAccountState({ kind: "non_existent" });
        setBalance("0");
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

      const res = await encryptedBalanceQuery([DEVNET_USDC_MINT]);
      const r = res.get(DEVNET_USDC_MINT);

      if (r?.state === "shared") {
        setBalance(r.balance.toString());
      } else {
        setBalance("0");
      }
    } finally {
      setQuerying(false);
    }
  }, [client, encryptedBalanceQuery, userAccountQuery]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const handleDeposit = useCallback(async () => {
    if (!client || !depositFn || !registered || depositing) return;

    let amt: bigint;
    try {
      amt = BigInt(amount.trim());
    } catch {
      return;
    }

    if (amt <= 0n) return;

    setDepositing(true);

    try {
      await depositFn(client.signer.address, DEVNET_USDC_MINT, amt as any, {
        accountInfoCommitment: "confirmed",
      });

      await refresh();
    } catch (error: any) {
      console.error("Deposit failed:", error);
      if (isEncryptedDepositError(error)) {
        console.error(`Deposit failed at ${error.stage}: ${error.message}`);
      }
    } finally {
      setDepositing(false);
    }
  }, [amount, client, depositFn, depositing, refresh, registered]);

  const handleWithdraw = useCallback(async () => {
    if (!client || !withdrawFn || !registered || withdrawing) return;

    let amt: bigint;
    try {
      amt = BigInt(amount.trim());
    } catch {
      return;
    }

    if (amt <= 0n) return;

    setWithdrawing(true);

    try {
      await withdrawFn(client.signer.address, DEVNET_USDC_MINT, amt as any, {
        accountInfoCommitment: "confirmed",
      });

      await refresh();
    } catch (error: any) {
      console.error(error);
      if (isEncryptedWithdrawalError(error)) {
        console.error(`Withdrawal failed at ${error.stage}: ${error.message}`);
      }
    } finally {
      setWithdrawing(false);
    }
  }, [amount, client, registered, refresh, withdrawing, withdrawFn]);

  const isRegistered = registered === true;

  if (!client) {
    return <div className="w-full rounded-2xl border border-white/10 bg-white/[0.03] p-5">Loading...</div>;
  }


return (
  <section className="flex w-full flex-col gap-3 rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3">
    <div className="flex w-full items-center gap-4">
      <div className="shrink-0 min-w-[4rem]">
        <div className="text-[10px] font-semibold uppercase tracking-[0.24em] opacity-60">
          Encrypted Balance
        </div>
        <div className="mt-1 text-4xl font-semibold leading-none md:text-5xl">
          {querying ? "…" : balance}
        </div>
      </div>

      <div className="flex flex-1 min-w-0 flex-col gap-2">
        <div className="flex w-full gap-2">
          <div
            className={`flex min-w-0 flex-1 items-center rounded-xl border border-[var(--line)] px-3 py-2 ${
              !isRegistered ? "opacity-50" : ""
            }`}
          >
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={!isRegistered}
              inputMode="numeric"
              placeholder="Amount"
              className="w-full min-w-0 flex-1 bg-transparent text-sm outline-none disabled:cursor-not-allowed"
            />
          </div>

          {isRegistered ? (
            <>
              <button
                onClick={handleDeposit}
                disabled={depositing}
                className="shrink-0 rounded-lg border border-[var(--accent)] bg-[var(--accent)] px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-black transition-all duration-300 hover:scale-105 hover:shadow-[0_0_18px_var(--accent)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {depositing ? "Depositing" : "Deposit"}
              </button>

              <button
                onClick={handleWithdraw}
                disabled={withdrawing}
                className="shrink-0 rounded-lg border border-[var(--accent)] bg-[var(--accent)] px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-black transition-all duration-300 hover:scale-105 hover:shadow-[0_0_18px_var(--accent)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                {withdrawing ? "Withdrawing" : "Withdraw"}
              </button>
            </>
          ) : (
            <a
              href={UMBRA_PAGE_URL}
              className="shrink-0 rounded-lg border border-[var(--accent)] bg-[var(--accent)] px-4 py-2 text-xs font-bold uppercase tracking-[0.18em] text-black transition-all duration-300 hover:scale-105 hover:shadow-[0_0_18px_var(--accent)]"
            >
              Register
            </a>
          )}
        </div>

        {!isRegistered && (
          <div className="text-xs text-muted">
            Not registered. Go to <a className="underline" href={UMBRA_PAGE_URL}>Balance</a> to register first.
          </div>
        )}
      </div>
    </div>
  </section>
);
}