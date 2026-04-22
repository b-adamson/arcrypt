"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { install } from "@solana/webcrypto-ed25519-polyfill";
import {
  createSignerFromPrivateKeyBytes,
  getClaimableUtxoScannerFunction,
  getEncryptedBalanceToSelfClaimableUtxoCreatorFunction,
  getUmbraClient,
  getUmbraRelayer,
  getUserAccountQuerierFunction,
  getUserRegistrationFunction,
  getEncryptedBalanceQuerierFunction,
  getPublicBalanceToEncryptedBalanceDirectDepositorFunction,
  getEncryptedBalanceToPublicBalanceDirectWithdrawerFunction,
  getSelfClaimableUtxoToEncryptedBalanceClaimerFunction,
  
} from "@umbra-privacy/sdk";


import {
  getCreateSelfClaimableUtxoFromEncryptedBalanceProver,
  getClaimSelfClaimableUtxoIntoEncryptedBalanceProver,
  getUserRegistrationProver,
} from "@umbra-privacy/web-zk-prover";
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

const registrationProver = getUserRegistrationProver();

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
  const [depositAmount, setDepositAmount] = useState("10000");
  const [withdrawAmount, setWithdrawAmount] = useState("10000");
  const [registerConfidential, setRegisterConfidential] = useState(true);
  const [registerAnonymous, setRegisterAnonymous] = useState(true);
  const [queryAddress, setQueryAddress] = useState("");

  const [utxoAmount, setUtxoAmount] = useState("10000");
const [utxoCreating, setUtxoCreating] = useState(false);
const [utxoClaiming, setUtxoClaiming] = useState(false);
const [utxoLog, setUtxoLog] = useState<string[]>([]);

const pushUtxoLog = useCallback((message: string) => {
  setUtxoLog((prev) => [...prev, `${new Date().toISOString()}  ${message}`]);
}, []);

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
    ? toAddress(queryAddress.trim()) // convert string → Address
    : client.signer.address;         // already Address

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

const selfUtxoCreator = useMemo(() => {
  if (!client) return null;

  return getEncryptedBalanceToSelfClaimableUtxoCreatorFunction(
    { client },
    { zkProver: getCreateSelfClaimableUtxoFromEncryptedBalanceProver() },
  );
}, [client]);

const claimableUtxoScanner = useMemo(() => {
  if (!client) return null;
  return getClaimableUtxoScannerFunction({ client });
}, [client]);

const selfUtxoClaimer = useMemo(() => {
  if (!client || !client.fetchBatchMerkleProof) return null;

  const relayer = getUmbraRelayer({
    apiEndpoint:
      process.env.NEXT_PUBLIC_UMBRA_RELAYER_API_ENDPOINT ??
      "https://relayer.api-devnet.umbraprivacy.com",
  });

  return getSelfClaimableUtxoToEncryptedBalanceClaimerFunction(
    { client },
    {
      fetchBatchMerkleProof: client.fetchBatchMerkleProof, // 👈 THIS is what you're missing
      zkProver: getClaimSelfClaimableUtxoIntoEncryptedBalanceProver(),
      relayer,
    },
  );
}, [client]);

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

  const handleCreateSelfUtxo = useCallback(async () => {
  if (!client || !selfUtxoCreator || !activeMint || utxoCreating) return;

  let amount: bigint;
  try {
    amount = BigInt(utxoAmount.trim());

  } catch {
    setStatus("Invalid UTXO amount");
    return;
  }

  if (amount <= 0n) {
    setStatus("UTXO amount must be greater than 0");
    return;
  }

  setUtxoCreating(true);
  setStatus("Creating self-claimable UTXO...");
  setUtxoLog([]);

  try {
    pushUtxoLog(`Creating self-claimable UTXO for ${activeMint}`);
    pushUtxoLog(`Amount: ${amount.toString()} base units`);
    pushUtxoLog(`Recipient: ${client.signer.address}`);

    const result = await selfUtxoCreator({
      destinationAddress: client.signer.address,
      mint: activeMint,
     amount: amount as unknown as Parameters<typeof selfUtxoCreator>[0]["amount"]
    });

    console.log("self-claimable UTXO created:", result);
    pushUtxoLog("UTXO creation succeeded");
    setStatus("Self-claimable UTXO created.");
  } catch (error: any) {
    console.error(error);
    pushUtxoLog(`UTXO creation failed: ${error?.message ?? "unknown error"}`);
    setStatus(`UTXO creation failed: ${error?.message ?? "unknown error"}`);
  } finally {
    setUtxoCreating(false);
  }
}, [activeMint, client, pushUtxoLog, selfUtxoCreator, utxoAmount, utxoCreating]);

const handleWithdrawSelfUtxos = useCallback(async () => {
  if (!client || !claimableUtxoScanner || !selfUtxoClaimer || utxoClaiming) return;

  setUtxoClaiming(true);
  setStatus("Scanning for claimable self UTXOs...");
  setUtxoLog([]);

  try {
    // Simple version: scan tree 0 from the start and sweep self-burnable UTXOs.
    // For a production version, you would persist / iterate tree indices.
type ScannerArgs = Parameters<typeof claimableUtxoScanner>;

const scanned = await claimableUtxoScanner(
  0n as ScannerArgs[0],
  0n as ScannerArgs[1]
);
    const utxos = scanned.selfBurnable;

    if (utxos.length === 0) {
      pushUtxoLog("No self-burnable UTXOs found in tree 0.");
      setStatus("No self-claimable UTXOs found.");
      return;
    }

    pushUtxoLog(`Found ${utxos.length} self-burnable UTXO(s). Claiming to encrypted balance...`);

    const claimResult = await selfUtxoClaimer(utxos);

    console.log("claim result:", claimResult);
    pushUtxoLog("Claim succeeded");
    setStatus(`Claimed ${utxos.length} UTXO(s) back to your ETA.`);
    await refreshBalance();
  } catch (error: any) {
    console.error(error);
    pushUtxoLog(`Claim failed: ${error?.message ?? "unknown error"}`);
    setStatus(`Claim failed: ${error?.message ?? "unknown error"}`);
  } finally {
    setUtxoClaiming(false);
  }
}, [claimableUtxoScanner, client, pushUtxoLog, refreshBalance, selfUtxoClaimer, utxoClaiming]);

 const handleRegister = useCallback(async () => {
  if (!client || registering) return;

  setRegistering(true);
  setStatus("Registering...");
  setRegistrationLog([]);

  try {
    pushLog("Starting registration flow");

    // Force master seed derivation up front so lazy mode cannot hide issues.
    pushLog("Deriving master seed...");
    await client.masterSeed.getMasterSeed();
    pushLog("Master seed is available");

    if (registerAnonymous && zkProver?.prepareAnonymousRegistration) {
      pushLog("Preparing anonymous-mode prover...");
      setStatus("Preparing anonymous-mode prover...");
      await zkProver.prepareAnonymousRegistration();
      pushLog("Anonymous-mode prover ready");
    }

    const register = getUserRegistrationFunction({ client }, {zkProver: registrationProver});

    const signatures = await register({
      confidential: registerConfidential,
      anonymous: registerAnonymous,
      accountInfoCommitment: "confirmed",
      callbacks: {
        userAccountInitialisation: {
          pre: async (tx) => {
            pushLog("Step 1 pre: creating EncryptedUserAccount");
            console.log("userAccountInitialisation pre tx:", tx);
          },
          post: async (_tx, sig) => {
            pushLog(`Step 1 post: EncryptedUserAccount confirmed (${sig})`);
          },
        },
        registerX25519PublicKey: {
          pre: async (tx) => {
            pushLog("Step 2 pre: registering X25519 public key");
            console.log("registerX25519PublicKey pre tx:", tx);
          },
          post: async (_tx, sig) => {
            pushLog(`Step 2 post: X25519 public key confirmed (${sig})`);
          },
        },
        registerUserForAnonymousUsage: {
          pre: async (tx) => {
            pushLog("Step 3 pre: registering anonymous commitment");
            console.log("registerUserForAnonymousUsage pre tx:", tx);
          },
          post: async (_tx, sig) => {
            pushLog(`Step 3 post: anonymous commitment confirmed (${sig})`);
          },
        },
      },
    });

    pushLog(`Registration returned ${signatures.length} signature(s)`);

    setStatus(
      signatures.length === 0
        ? "Already registered"
        : `Registered (${signatures.length} tx${signatures.length === 1 ? "" : "s"})`
    );

    await refreshAccount();
  } catch (error: any) {
    console.error(error);
    pushLog(`Registration failed: ${error?.message ?? "unknown error"}`);

    if (isRegistrationError(error)) {
      setStatus(`Registration failed at ${error.stage}: ${error.message}`);
      pushLog(`Registration stage: ${error.stage}`);
    } else {
      setStatus(`Registration failed: ${error?.message ?? "unknown error"}`);
    }
  } finally {
    setRegistering(false);
  }
}, [
  client,
  pushLog,
  refreshAccount,
  registerAnonymous,
  registerConfidential,
  registering,
  zkProver,
]);

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



return (
  <div className="page-shell min-h-[100svh] px-4 py-6 md:px-8 lg:px-10">
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6">
      {/* Hero / balance center */}
      <section className="surface-strong overflow-hidden p-6 md:p-8">
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-3xl space-y-3">
            <div className="inline-flex items-center gap-2 badge badge-accent text-xs font-semibold uppercase tracking-[0.24em]">
              Umbra Console
            </div>
            <h1 className="hero-title text-3xl font-semibold tracking-tight md:text-5xl">
              [DEVELOPER] Confidential balance dashboard
            </h1>
            <p className="hero-copy max-w-2xl text-sm leading-6 md:text-base">
              Deposit, withdraw, and reclaim self-claimable UTXOs from one centered screen. This page does not yet connect to the auctions in the marketplace.
            </p>
          </div>

          <div className="surface min-w-0 px-5 py-4 lg:min-w-[340px]">
            <div className="text-xs uppercase tracking-[0.24em] text-muted">Current balance</div>
            <div className="mt-2 text-4xl font-semibold text-accent md:text-6xl">
              {balanceState.kind === "shared" ? balanceState.balance : "—"}
            </div>
            <div className="mt-2 break-all text-xs text-muted">
              Mint (devnet currency) {" "}
              <span className="text-foreground">{DEFAULT_MINT}</span>
            </div>
            <div className="mt-4 flex flex-wrap gap-2 text-xs">
              <span className="badge">{client ? "Client ready" : "Client not ready"}</span>
              <span className="badge">{signer ? "Signer loaded" : "Signer not ready"}</span>
              <span className="badge badge-accent">{status}</span>
            </div>
          </div>
        </div>

        <div className="mt-6 grid gap-3 md:grid-cols-3">
          <button
            onClick={handleDeposit}
            disabled={!client || depositing}
            className="btn-primary w-full px-6 py-4 text-base font-semibold disabled:cursor-not-allowed disabled:opacity-50"
          >
            {depositing ? "Depositing..." : `Deposit`}
          </button>
          <button
            onClick={handleWithdraw}
            disabled={!client || withdrawing}
            className="btn-primary w-full px-6 py-4 text-base font-semibold disabled:cursor-not-allowed disabled:opacity-50"
          >
            {withdrawing ? "Withdrawing..." : `Withdraw`}
          </button>
          <button
            onClick={handleWithdrawSelfUtxos}
            disabled={!client || utxoClaiming}
            className="btn w-full px-6 py-4 text-base font-semibold disabled:cursor-not-allowed disabled:opacity-50"
          >
            {utxoClaiming ? "Reclaiming..." : "Reclaim self UTXOs"}
          </button>
        </div>

        <div className="mt-4 grid gap-3 md:grid-cols-3">
          <label className="surface flex items-center gap-3 px-4 py-3 text-sm">
            <span className="text-muted">Deposit amount</span>
            <input
              value={depositAmount}
              onChange={(e) => setDepositAmount(e.target.value)}
              className="ml-auto w-32 bg-transparent text-right outline-none"
              placeholder="10000"
            />
          </label>

          <label className="surface flex items-center gap-3 px-4 py-3 text-sm">
            <span className="text-muted">Withdraw amount</span>
            <input
              value={withdrawAmount}
              onChange={(e) => setWithdrawAmount(e.target.value)}
              className="ml-auto w-32 bg-transparent text-right outline-none"
              placeholder="10000"
            />
          </label>

          <label className="surface flex items-center gap-3 px-4 py-3 text-sm">
            <span className="text-muted">UTXO amount</span>
            <input
              value={utxoAmount}
              onChange={(e) => setUtxoAmount(e.target.value)}
              className="ml-auto w-32 bg-transparent text-right outline-none"
              placeholder="100"
            />
          </label>
        </div>
      </section>

      {/* Dev settings drawer */}
      <details open className="surface-strong overflow-hidden">
        <summary className="cursor-pointer list-none px-6 py-4 text-sm font-semibold uppercase tracking-[0.22em] text-accent">
          Dev settings
        </summary>

        <div className="border-t line p-6">
          <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
            <section className="card p-4">
              <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-accent">Identity</h2>
              <div className="mt-3 space-y-2 text-sm text-foreground">
                <div className="break-all"><strong>Signer:</strong> {signer?.address ?? "Not ready"}</div>
                <div><strong>Client:</strong> {client ? "Ready" : "Not ready"}</div>
                <div className="break-words"><strong>Status:</strong> {status}</div>
              </div>
            </section>

            <section className="card p-4">
              <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-accent">Registration</h2>
              <div className="mt-3 grid gap-3 text-sm">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={registerConfidential}
                    onChange={(e) => setRegisterConfidential(e.target.checked)}
                  />
                  Confidential / shared balance registration
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={registerAnonymous}
                    onChange={(e) => setRegisterAnonymous(e.target.checked)}
                  />
                  Anonymous / mixer registration
                </label>
              </div>
              <button
                onClick={handleRegister}
                disabled={!client || registering}
                className="btn-primary mt-4 w-full px-4 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
              >
                {registering ? "Registering..." : "Register Umbra"}
              </button>
            </section>

            <section className="card p-4">
              <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-accent">Query account state</h2>
              <div className="mt-3 flex gap-2">
                <input
                  value={queryAddress}
                  onChange={(e) => setQueryAddress(e.target.value)}
                  placeholder="Wallet address to inspect"
                  className="surface w-full px-3 py-2 text-sm outline-none"
                />
                <button
                  onClick={refreshAccount}
                  disabled={!client || refreshing}
                  className="btn px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {refreshing ? "Loading..." : "Load account"}
                </button>
              </div>

              <div className="mt-4 space-y-1 text-sm">
                {accountState.kind === "exists" ? (
                  <>
                    <div>Initialised: {String(accountState.isInitialised)}</div>
                    <div>Shared key registered: {String(accountState.isUserAccountX25519KeyRegistered)}</div>
                    <div>Anonymous commitment registered: {String(accountState.isUserCommitmentRegistered)}</div>
                    <div>Active for anonymous usage: {String(accountState.isActiveForAnonymousUsage)}</div>
                    <div className="break-all">X25519 public key: {accountState.x25519PublicKey || "n/a"}</div>
                    <div>Generation index: {accountState.generationIndex || "n/a"}</div>
                  </>
                ) : accountState.kind === "non_existent" ? (
                  <div>No account found.</div>
                ) : (
                  <div>Press “Load account” to inspect state.</div>
                )}
              </div>
            </section>

            <section className="card p-4">
              <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-accent">Mint</h2>
              <div className="mt-3 surface px-3 py-2 text-sm break-all">
                {DEFAULT_MINT}
              </div>
            </section>

            <section className="card p-4">
              <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-accent">Query encrypted balance</h2>
              <div className="mt-3 flex gap-2">
                <button
                  onClick={refreshBalance}
                  disabled={!client || querying}
                  className="btn px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {querying ? "Loading..." : "Load balance"}
                </button>
              </div>
              <div className="mt-4 text-sm">
                {balanceState.kind === "shared" ? (
                  <>
                    <div>Mint: {balanceState.mint}</div>
                    <div>Balance: {balanceState.balance}</div>
                  </>
                ) : balanceState.kind === "mxe" ? (
                  <div>Mint {balanceState.mint} is in MXE mode, so it cannot be decrypted locally.</div>
                ) : balanceState.kind === "uninitialized" ? (
                  <div>Mint {balanceState.mint} exists, but the encrypted balance is not initialized yet.</div>
                ) : balanceState.kind === "non_existent" ? (
                  <div>No encrypted balance exists for mint {balanceState.mint}.</div>
                ) : (
                  <div>Press “Load balance” to inspect the encrypted balance for the selected mint.</div>
                )}
              </div>
            </section>

            <section className="card p-4 xl:col-span-2">
              <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-accent">Logs</h2>
              <div className="mt-3 max-h-[28rem] space-y-2 overflow-auto text-xs leading-5 text-muted">
                {registrationLog.length === 0 && depositLog.length === 0 && utxoLog.length === 0 ? (
                  <div>No logs yet.</div>
                ) : (
                  <>
                    {registrationLog.map((line, i) => (
                      <div key={`reg-${i}`}>{line}</div>
                    ))}
                    {depositLog.map((line, i) => (
                      <div key={`dep-${i}`}>{line}</div>
                    ))}
                    {utxoLog.map((line, i) => (
                      <div key={`utxo-${i}`}>{line}</div>
                    ))}
                  </>
                )}
              </div>
            </section>

            <section className="card p-4">
              <h2 className="text-sm font-semibold uppercase tracking-[0.18em] text-accent">Self-claimable UTXO</h2>
              <div className="mt-3 grid gap-3">
                <button
                  onClick={handleCreateSelfUtxo}
                  disabled={!client || utxoCreating || !activeMint}
                  className="btn-primary w-full px-4 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {utxoCreating ? "Creating..." : "Create self-claimable UTXO"}
                </button>
                <button
                  onClick={handleWithdrawSelfUtxos}
                  disabled={!client || utxoClaiming}
                  className="btn w-full px-4 py-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {utxoClaiming ? "Withdrawing..." : "Reclaim Self UTXOs"}
                </button>
              </div>
            </section>
          </div>

          <div className="mt-5 text-xs text-muted">
            Deposit/withdraw amounts are in native token units. Use the mint’s decimals when entering values.
          </div>
        </div>
      </details>
    </div>
  </div>
);

}
