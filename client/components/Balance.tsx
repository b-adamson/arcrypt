"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { install } from "@solana/webcrypto-ed25519-polyfill";
import {
  createSignerFromPrivateKeyBytes,
  // getClaimableUtxoScannerFunction,
  // getEncryptedBalanceToSelfClaimableUtxoCreatorFunction,
  getUmbraClient,
  // getUmbraRelayer,
  getUserAccountQuerierFunction,
  getUserRegistrationFunction,
  getEncryptedBalanceQuerierFunction,
  getPublicBalanceToEncryptedBalanceDirectDepositorFunction,
  getEncryptedBalanceToPublicBalanceDirectWithdrawerFunction,
  // getSelfClaimableUtxoToEncryptedBalanceClaimerFunction,
  
} from "@umbra-privacy/sdk";

import {
  isEncryptedDepositError,
  isEncryptedWithdrawalError,
  isQueryError,
  isRegistrationError,
} from "@umbra-privacy/sdk/errors";
// import type { U64, U32 } from "@solana/kit";
import { address as toAddress, type Address } from "@solana/kit";


import keyFile from "../umbra-devnet.json";


install();

const rpcUrl =
  process.env.NEXT_PUBLIC_RPC_URL ??
  "https://api.devnet.solana.com";

const rpcSubscriptionsUrl =
  process.env.NEXT_PUBLIC_RPC_WS_URL ??
  rpcUrl.replace(/^https:/, "wss:").replace(/^http:/, "ws:");

const DEFAULT_MINT = "GvUQDFLWYH4QHKYot787616f61m1m5eZofhYKyaBkPn9";

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

type MintBalanceState =
  | { kind: "idle" }
  | { kind: "non_existent"; mint: string }
  | { kind: "uninitialized"; mint: string }
  | { kind: "mxe"; mint: string }
  | { kind: "shared"; mint: string; balance: string };

type Props = {
  zkProver?: {
    prepareAnonymousRegistration?: () => Promise<void>;
  };
};

function formatBytes(bytes?: Uint8Array) {
  if (!bytes) return "";
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
const UMBRA_ASSET_HOST = "d3j9fjdkre529f.cloudfront.net";
function createUmbraAssetProxyFetch(originalFetch: typeof fetch): typeof fetch {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    let url: URL | null = null;

    try {
      if (typeof input === "string" || input instanceof URL) {
        url = new URL(input.toString(), window.location.origin);
      } else if (input instanceof Request) {
        url = new URL(input.url);
      }
    } catch {
      url = null;
    }

    if (url && url.hostname === UMBRA_ASSET_HOST) {
      const proxied = new URL("/api/umbra", window.location.origin);
      proxied.searchParams.set("url", url.toString());
      return originalFetch(proxied.toString(), init);
    }

    return originalFetch(input as RequestInfo, init);
  };
}
type UmbraSigner = Awaited<ReturnType<typeof createSignerFromPrivateKeyBytes>>;
export default function UmbraPanel({ zkProver }: Props) {
  const [mounted, setMounted] = useState(false);
  const [status, setStatus] = useState("Loading...");
  const [registering, setRegistering] = useState(false);
  const [querying, setQuerying] = useState(false);
  const [depositing, setDepositing] = useState(false);
  const [withdrawing, setWithdrawing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
const [registrationLog, setRegistrationLog] = useState<string[]>([]);
const [signer, setSigner] = useState<UmbraSigner | null>(null);
  const [client, setClient] = useState<Awaited<ReturnType<typeof getUmbraClient>> | null>(null);

  const [accountState, setAccountState] = useState<AccountState>({ kind: "idle" });
  const [selectedMint, setSelectedMint] = useState(DEFAULT_MINT);
  const [balanceState, setBalanceState] = useState<MintBalanceState>({ kind: "idle" });
  const [depositAmount, setDepositAmount] = useState("1");
  const [withdrawAmount, setWithdrawAmount] = useState("1");
  const [registerConfidential, setRegisterConfidential] = useState(true);
  const [registerAnonymous, setRegisterAnonymous] = useState(true);
  const [queryAddress, setQueryAddress] = useState("");

  useEffect(() => {
  const originalFetch = globalThis.fetch.bind(globalThis);
  const proxiedFetch = createUmbraAssetProxyFetch(originalFetch);

  globalThis.fetch = proxiedFetch;

  return () => {
    globalThis.fetch = originalFetch;
  };
}, []);
const [depositLog, setDepositLog] = useState<string[]>([]);

const pushDepositLog = useCallback((message: string) => {
  setDepositLog((prev) => [...prev, `${new Date().toISOString()}  ${message}`]);
}, []);
const activeMint: Address | null = useMemo(() => {
  const trimmed = selectedMint.trim();
  return trimmed.length > 0 ? toAddress(trimmed) : null;
}, [selectedMint]);

  const pushLog = useCallback((message: string) => {
  setRegistrationLog((prev) => [...prev, `${new Date().toISOString()}  ${message}`]);
}, []);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function initSigner() {
      try {
        const nextSigner = await createSignerFromPrivateKeyBytes(
          new Uint8Array(keyFile as number[])
        );

        if (!cancelled) setSigner(nextSigner);
      } catch (error: any) {
        if (!cancelled) {
          console.error(error);
          setStatus(`Failed to create signer: ${error?.message ?? "unknown error"}`);
        }
      }
    }

    void initSigner();

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function initClient() {
      if (!signer) return;

      try {
        setStatus("Creating Umbra client...");

const nextClient = await getUmbraClient({
  signer,
  network: "devnet",
  rpcUrl,
  rpcSubscriptionsUrl,
  indexerApiEndpoint: "/api/umbra-indexer",
}
        );
        if (!cancelled) {
          setClient(nextClient);
          setQueryAddress(nextClient.signer.address);
          setStatus(`Umbra client ready for ${nextClient.signer.address}`);
        }
      } catch (error: any) {
        if (!cancelled) {
          console.error(error);
          setStatus(`Failed to create client: ${error?.message ?? "unknown error"}`);
        }
      }
    }
    void initClient();
    return () => {
      cancelled = true;
    };
  }, [signer]);

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
const refreshAccount = useCallback(async () => {
  if (!client || !userAccountQuery) return;

  setRefreshing(true);
  try {
    
const address =
  queryAddress.trim().length > 0
    ? toAddress(queryAddress.trim()) 
    : client.signer.address;      

    console.log(address)

   const result = await userAccountQuery(address);

    console.log("raw x25519PublicKey:", result.state === "exists" ? result.data.x25519PublicKey : null);
    console.log(result)

    if (result.state === "non_existent") {
      setAccountState({ kind: "non_existent" });
      setStatus(`No Umbra account found for ${address}`);
      return;
    }

    setAccountState({
      kind: "exists",
      isInitialised: result.data.isInitialised,
      isUserAccountX25519KeyRegistered: result.data.isUserAccountX25519KeyRegistered,
      isUserCommitmentRegistered: result.data.isUserCommitmentRegistered,
      isActiveForAnonymousUsage: result.data.isActiveForAnonymousUsage,
      x25519PublicKey: formatBytes(result.data.x25519PublicKey),
      generationIndex: result.data.generationIndex.toString(),
    });

    setStatus(`Loaded account state for ${address}`);
  } finally {
    setRefreshing(false);
  }
}, [client, queryAddress, userAccountQuery]);

  const refreshBalance = useCallback(async () => {
    if (!client || !encryptedBalanceQuery) return;
    if (!activeMint) {
      setStatus("Paste a mint first.");
      return;
    }

    setQuerying(true);
    try {
      const results = await encryptedBalanceQuery([activeMint]);
      const result = results.get(activeMint);

      if (!result) {
        setBalanceState({ kind: "non_existent", mint: activeMint });
        setStatus(`No balance response for ${activeMint}`);
        return;
      }

      switch (result.state) {
        case "non_existent":
          setBalanceState({ kind: "non_existent", mint: activeMint });
          setStatus(`No encrypted balance exists yet for ${activeMint}`);
          break;
        case "uninitialized":
          setBalanceState({ kind: "uninitialized", mint: activeMint });
          setStatus(`Encrypted account exists but is not initialized for ${activeMint}`);
          break;
        case "mxe":
          setBalanceState({ kind: "mxe", mint: activeMint });
          setStatus(`Balance is MXE-only for ${activeMint}`);
          break;
        case "shared":
          setBalanceState({ kind: "shared", mint: activeMint, balance: result.balance.toString() });
          setStatus(`Shared-mode balance loaded for ${activeMint}`);
          break;
      }
    } catch (error: any) {
      console.error(error);
      if (isQueryError(error)) {
        setStatus(`Balance query failed at ${error.stage}: ${error.message}`);
      } else {
        setStatus(`Balance query failed: ${error?.message ?? "unknown error"}`);
      }
    } finally {
      setQuerying(false);
    }
  }, [activeMint, client, encryptedBalanceQuery]);

const handleDeposit = useCallback(async () => {
  if (!client || !depositFn || depositing) return;
  if (!activeMint) {
    setStatus("Paste a mint first.");
    return;
  }

  const trimmedAmount = depositAmount.trim();
  const trimmedDestination = queryAddress.trim();

  let amountBigInt: bigint;
  try {
    amountBigInt = BigInt(trimmedAmount);
  } catch {
    setStatus("Invalid deposit amount");
    return;
  }

  if (amountBigInt <= 0n) {
    setStatus("Deposit amount must be greater than 0");
    return;
  }

  const destination: Address =
    trimmedDestination.length > 0 ? toAddress(trimmedDestination) : client.signer.address;

  setDepositing(true);
  setStatus("Depositing...");
  setDepositLog([]);

  try {
    pushDepositLog("Starting deposit flow");
    pushDepositLog(`Destination: ${destination}`);
    pushDepositLog(`Mint: ${activeMint}`);
    pushDepositLog(`Amount: ${amountBigInt.toString()} base units`);
    pushDepositLog("Submitting deposit transaction...");

const result = await depositFn(
  destination,
  activeMint,
  amountBigInt as Parameters<typeof depositFn>[2],
  {
    // awaitCallback: true,
    // skipPreflight: true,
    accountInfoCommitment: "confirmed",
  }
);
    pushDepositLog(`Queue signature: ${result.queueSignature}`);

    if (result.callbackSignature) {
      pushDepositLog(`Callback signature: ${result.callbackSignature}`);
    }

    if (result.callbackStatus) {
      pushDepositLog(`Callback status: ${result.callbackStatus}`);
    }

    if (result.callbackElapsedMs != null) {
      pushDepositLog(`Callback elapsed ms: ${result.callbackElapsedMs}`);
    }

    setStatus(
      `Deposit submitted for ${activeMint}. Queue=${result.queueSignature}${
        result.callbackSignature ? `, callback=${result.callbackSignature}` : ""
      }`
    );

    pushDepositLog("Refreshing balance after deposit...");
    await refreshBalance();
    pushDepositLog("Balance refresh complete");
  } catch (error: any) {
    console.error("Deposit failed:", error);
    console.error("Deposit error cause:", error?.cause);
    console.error("Deposit error logs:", error?.logs);

    pushDepositLog(`Deposit failed: ${error?.message ?? "unknown error"}`);

    if (isEncryptedDepositError(error)) {
      pushDepositLog(`Stage: ${error.stage}`);
      setStatus(`Deposit failed at ${error.stage}: ${error.message}`);
    } else {
      setStatus(`Deposit failed: ${error?.message ?? "unknown error"}`);
    }
  } finally {
    setDepositing(false);
  }
}, [
  activeMint,
  client,
  depositAmount,
  depositFn,
  depositing,
  pushDepositLog,
  queryAddress,
  refreshBalance,
]);
  const handleWithdraw = useCallback(async () => {
    if (!client || !withdrawFn || withdrawing) return;
    if (!activeMint) {
      setStatus("Paste a mint first.");
      return;
    }

    setWithdrawing(true);
    setStatus("Withdrawing...");

    try {
type WithdrawArgs = Parameters<typeof withdrawFn>;

const amount = BigInt(withdrawAmount) as WithdrawArgs[2];
const destination = (queryAddress.trim() || client.signer.address) as WithdrawArgs[0];
const result = await withdrawFn(destination, activeMint, amount);

      setStatus(
        `Withdraw submitted for ${activeMint}. Queue=${result.queueSignature}${
          result.callbackSignature ? `, callback=${result.callbackSignature}` : ""
        }`
      );

      await refreshBalance();
    } catch (error: any) {
      console.error(error);
      if (isEncryptedWithdrawalError(error)) {
        setStatus(`Withdrawal failed at ${error.stage}: ${error.message}`);
      } else {
        setStatus(`Withdrawal failed: ${error?.message ?? "unknown error"}`);
      }
    } finally {
      setWithdrawing(false);
    }
  }, [activeMint, client, refreshBalance, queryAddress, withdrawAmount, withdrawFn, withdrawing]);

  useEffect(() => {
    if (!client) return;
    void refreshAccount();
    void refreshBalance();
  }, [client, refreshAccount, refreshBalance]);

  if (!mounted) {
    return <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">Loading...</div>;
  }

  const isRegistered =
  accountState.kind === "exists" &&
  accountState.isInitialised &&
  accountState.isUserAccountX25519KeyRegistered &&
  accountState.isUserCommitmentRegistered;

const balanceText =
  balanceState.kind === "shared"
    ? balanceState.balance
    : balanceState.kind === "mxe"
      ? "MXE"
      : "—";

const transferAmount = depositAmount;
const setTransferAmount = (value: string) => {
  setDepositAmount(value);
  setWithdrawAmount(value);
};


return (
  <section className="flex w-full max-w-6xl flex-col gap-3 rounded-2xl border border-[var(--line)] bg-[var(--surface)] px-4 py-3 md:flex-row md:items-center md:justify-between">
    <div className="min-w-0">
      <div className="text-[10px] font-semibold uppercase tracking-[0.24em] opacity-60">
        Encrypted Balance
      </div>
      <div className="mt-1 text-4xl font-semibold leading-none md:text-5xl">
        {querying ? "…" : balanceText}
      </div>
    </div>

  <div className="flex w-full flex-1 items-center gap-2">
  <div
    className={`flex flex-1 items-center rounded-xl border border-[var(--line)] px-3 py-2 ${
      !isRegistered ? "opacity-50" : ""
    }`}
  >
    <input
      value={transferAmount}
      onChange={(e) => setTransferAmount(e.target.value)}
      disabled={!isRegistered}
      inputMode="numeric"
      placeholder="Amount"
      className="w-full bg-transparent text-sm outline-none disabled:cursor-not-allowed"
    />
  </div>

  <button
    onClick={handleDeposit}
    disabled={!isRegistered || depositing}
    className="relative overflow-hidden rounded-lg px-3 py-2 text-xs font-bold uppercase tracking-[0.18em]
    bg-[var(--accent)] text-black border border-[var(--accent)]
    transition-all duration-300 hover:scale-105 hover:shadow-[0_0_18px_var(--accent)]
    disabled:cursor-not-allowed disabled:opacity-50"
  >
    <span className="relative z-10">
      {depositing ? "Depositing" : "Deposit"}
    </span>
    <span className="absolute inset-0 opacity-0 hover:opacity-100 transition duration-300 bg-[radial-gradient(circle_at_center,var(--accent)_0%,transparent_70%)] blur-md"></span>
  </button>

  <button
    onClick={handleWithdraw}
    disabled={!isRegistered || withdrawing}
    className="relative overflow-hidden rounded-lg px-3 py-2 text-xs font-bold uppercase tracking-[0.18em]
    bg-[var(--accent)] text-black border border-[var(--accent)]
    transition-all duration-300 hover:scale-105 hover:shadow-[0_0_18px_var(--accent)]
    disabled:cursor-not-allowed disabled:opacity-50"
  >
    <span className="relative z-10">
      {withdrawing ? "Withdrawing" : "Withdraw"}
    </span>
    <span className="absolute inset-0 opacity-0 hover:opacity-100 transition duration-300 bg-[radial-gradient(circle_at_center,var(--accent)_0%,transparent_70%)] blur-md"></span>
  </button>
</div>
  </section>
);
}
