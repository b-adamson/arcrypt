"use client";

import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { address as toAddress } from "@solana/kit";

import {
  getUserAccountQuerierFunction,
  getEncryptedBalanceQuerierFunction,
} from "@umbra-privacy/sdk";

import {
  isEncryptedDepositError,
  isEncryptedWithdrawalError,
} from "@umbra-privacy/sdk/errors";

import { useUmbraClient } from "@/lib/useUmbraClient";

type Props = {
  refreshKey?: number;
};

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

const DEVNET_USDC_MINT = toAddress(
  "4oG4sjmopf5MzvTHLE8rpVJ2uyczxfsw2K84SUTpNDx7"
);
const UMBRA_PAGE_URL = "/umbra";

function formatBytes(bytes?: Uint8Array) {
  if (!bytes) return "";
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export default function Balance({ refreshKey = 0 }: Props) {
  const wallet = useWallet();
  const seedMapRef = useRef(new Map<string, Uint8Array>());

  const { client, depositFn, withdrawFn } = useUmbraClient();

  const [registered, setRegistered] = useState<boolean | null>(null);
  const [accountState, setAccountState] = useState<AccountState>({ kind: "idle" });
  const [balance, setBalance] = useState("0");
  const [amount, setAmount] = useState("1");
  const [querying, setQuerying] = useState(false);
  const [depositing, setDepositing] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);

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
        generationIndex:
          acc.data.generationIndex?.toString?.() ??
          String(acc.data.generationIndex ?? ""),
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
  }, [refresh, refreshKey]);

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
      console.error("Withdraw failed:", error);
      if (isEncryptedWithdrawalError(error)) {
        console.error(`Withdraw failed at ${error.stage}: ${error.message}`);
      }
    } finally {
      setWithdrawing(false);
    }
  }, [amount, client, withdrawFn, refresh, registered, withdrawing]);

  const isRegistered = registered === true;

  if (!client) {
    return (
      <div className="w-full rounded-2xl border border-white/10 bg-white/[0.03] p-5">
        Loading...
      </div>
    );
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
              Not registered. Go to{" "}
              <a className="underline" href={UMBRA_PAGE_URL}>
                Balance
              </a>{" "}
              to register first.
            </div>
          )}
        </div>
      </div>
    </section>
  );
}