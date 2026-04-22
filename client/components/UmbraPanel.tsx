"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getWallets } from "@wallet-standard/app";
import { StandardConnect } from "@wallet-standard/features";
import type { Wallet, WalletAccount } from "@wallet-standard/base";

import {
  createSignerFromWalletAccount,
  getUmbraClient,
  getUserRegistrationFunction,
  getUserAccountQuerierFunction,
  getUserAccountX25519KeypairDeriver,
  getMasterViewingKeyX25519KeypairDeriver,
  getPollingComputationMonitor,
} from "@umbra-privacy/sdk";
import { getUserRegistrationProver, type IZkAssetProvider } from "@umbra-privacy/web-zk-prover";

import { Connection } from "@solana/web3.js";
// import { ed25519 as nobleEd25519 } from "@noble/curves/ed25519"; // used only for verification? removed below
import bs58 from "bs58";
import type { Address } from "@solana/kit";

const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL ??
  "https://devnet.helius-rpc.com/?api-key=YOUR_API_KEY";

const RPC_WS_URL =
  process.env.NEXT_PUBLIC_RPC_WS_URL ??
  "wss://devnet.helius-rpc.com/?api-key=YOUR_API_KEY";

const CDN_BASE = "https://d3j9fjdkre529f.cloudfront.net";

type UmbraClient = Awaited<ReturnType<typeof getUmbraClient>>;
type CommitmentKeyMap = Map<string, Uint8Array>;

type ManifestEntry = { url: string };
type ManifestAsset = ManifestEntry | Record<string, ManifestEntry>;
type Manifest = { assets: Record<string, ManifestAsset> };

function compactU16(n: number): Uint8Array {
  if (n < 0x80) return new Uint8Array([n]);
  if (n < 0x4000) return new Uint8Array([(n & 0x7f) | 0x80, n >> 7]);
  return new Uint8Array([(n & 0x7f) | 0x80, ((n >> 7) & 0x7f) | 0x80, n >> 14]);
}

function readCompactU16(bytes: Uint8Array, offset: number): { value: number; bytesRead: number } {
  let value = 0;
  let shift = 0;
  let bytesRead = 0;

  while (true) {
    const byte = bytes[offset + bytesRead++];
    value |= (byte & 0x7f) << shift;
    shift += 7;
    if ((byte & 0x80) === 0) break;
  }

  return { value, bytesRead };
}

async function addressFromSeed(seed: Uint8Array): Promise<string> {
  // Convert seed → PKCS8
  const pkcs8 = new Uint8Array([
    0x30, 0x2e,
    0x02, 0x01, 0x00,
    0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70,
    0x04, 0x22, 0x04, 0x20,
    ...seed,
  ]);

  const key = await crypto.subtle.importKey(
    "pkcs8",
    pkcs8,
    { name: "Ed25519" },
    true,
    ["sign"]
  );

  const raw = await crypto.subtle.exportKey("raw", key);
  return bs58.encode(new Uint8Array(raw));
}

function makeCapturingDeriver<T extends () => Promise<{ ed25519Keypair: { seed: Uint8Array } }>>(
  baseDeriver: T,
  keyMap: CommitmentKeyMap
): T {
  return (async () => {
    const result = await baseDeriver();
    keyMap.set(addressFromSeed(result.ed25519Keypair.seed), result.ed25519Keypair.seed);
    return result;
  }) as T;
}

function getProxiedZkAssetProvider(): IZkAssetProvider {
  let manifestCache: Manifest | null = null;

  return {
    async getAssetUrls(type: string, variant?: string): Promise<{ zkeyUrl: string; wasmUrl: string }> {
      if (!manifestCache) {
        const res = await fetch(`/api/zk-proxy?url=${encodeURIComponent(`${CDN_BASE}/manifest.json`)}`);
        if (!res.ok) throw new Error(`ZK manifest fetch failed (${res.status})`);
        manifestCache = (await res.json()) as Manifest;
      }

      const assetEntry = manifestCache.assets[type];
      if (!assetEntry) throw new Error(`ZK asset type '${type}' not found in manifest`);

      let rawUrl: string;
      if (variant !== undefined && !("url" in assetEntry)) {
        const variantEntry = (assetEntry as Record<string, ManifestEntry>)[variant];
        if (!variantEntry) throw new Error(`ZK variant '${variant}' not found for '${type}'`);
        rawUrl = variantEntry.url;
      } else {
        rawUrl = (assetEntry as ManifestEntry).url;
      }

      const fullZkeyUrl = rawUrl.startsWith("http") ? rawUrl : `${CDN_BASE}/${rawUrl}`;
      const fullWasmUrl = fullZkeyUrl.replace(/\.zkey$/i, ".wasm");

      return {
        zkeyUrl: `/api/zk-proxy?url=${encodeURIComponent(fullZkeyUrl)}`,
        wasmUrl: `/api/zk-proxy?url=${encodeURIComponent(fullWasmUrl)}`,
      };
    },
  };
}

function makeZkProverDeps() {
  return {
    assetProvider: getProxiedZkAssetProvider(),
    callbacks: {
      onZkeyDownload: {
        pre: async () => console.log("[zkProver] downloading zkey..."),
        post: async () => console.log("[zkProver] zkey download complete"),
      },
      onWasmDownload: {
        pre: async () => console.log("[zkProver] downloading wasm..."),
        post: async () => console.log("[zkProver] wasm download complete"),
      },
      onWitnessGeneration: {
        pre: async () => console.log("[zkProver] generating witness..."),
        post: async () => console.log("[zkProver] witness done"),
      },
      onProofComputation: {
        pre: async () => console.log("[zkProver] computing ZK proof..."),
        post: async () => console.log("[zkProver] proof done"),
      },
    },
  };
}

function encodeTransactionToWire(
  messageBytes: Uint8Array,
  signatures: Record<string, Uint8Array | null>
): Uint8Array {
  const sigs = Object.values(signatures);
  const countBytes = compactU16(sigs.length);
  const wire = new Uint8Array(countBytes.length + sigs.length * 64 + messageBytes.length);

  wire.set(countBytes, 0);
  let off = countBytes.length;
  for (const sig of sigs) {
    wire.set(sig ?? new Uint8Array(64), off);
    off += 64;
  }
  wire.set(messageBytes, off);

  return wire;
}

function makeSkipPreflightForwarder() {
  const conn = new Connection(RPC_URL, "confirmed");

  type SdkSignedTx = {
    messageBytes: Uint8Array;
    signatures: Record<string, Uint8Array | null>;
  };

  async function sendAndConfirm(tx: SdkSignedTx): Promise<string> {
    const wire = encodeTransactionToWire(tx.messageBytes, tx.signatures);

    async function trySend(): Promise<string> {
      try {
        return await conn.sendRawTransaction(wire, { skipPreflight: true, maxRetries: 0 });
      } catch (e) {
        const raw = e instanceof Error ? e.message : String(e);
        if (raw.includes("already been processed")) return "";
        throw new Error(`Transaction send failed: ${raw.split(/[:\n]/)[0]?.trim().slice(0, 80) ?? "RPC send failed"}`);
      }
    }

    const sig = await trySend();
    if (!sig) throw new Error("Transaction send failed: no signature returned");

    const deadline = Date.now() + 90_000;
    const pollMs = 2_000;
    const resubmitMs = 15_000;
    let lastResubmit = Date.now();

    while (Date.now() < deadline) {
      const result = await conn.getSignatureStatus(sig, { searchTransactionHistory: false });
      const status = result.value;

      if (status) {
        if (status.err) {
          throw new Error(`Transaction failed on-chain: ${JSON.stringify(status.err).slice(0, 120)}`);
        }
        if (status.confirmationStatus === "confirmed" || status.confirmationStatus === "finalized") {
          return sig;
        }
      }

      if (Date.now() - lastResubmit >= resubmitMs) {
        lastResubmit = Date.now();
        trySend().catch(() => {});
      }

      await new Promise((r) => setTimeout(r, pollMs));
    }

    const historyCheck = await conn.getSignatureStatus(sig, { searchTransactionHistory: true });
    if (historyCheck.value && !historyCheck.value.err) return sig;

    throw new Error(`Transaction timed out — sig: ${sig}`);
  }

  return {
    forwardSequentially: async (transactions: readonly unknown[]): Promise<readonly string[]> => {
      const sigs: string[] = [];
      for (const tx of transactions) sigs.push(await sendAndConfirm(tx as SdkSignedTx));
      return sigs;
    },
    forwardInParallel: async (transactions: readonly unknown[]): Promise<readonly string[]> => {
      return Promise.all((transactions as SdkSignedTx[]).map(sendAndConfirm));
    },
    fireAndForget: async (tx: unknown): Promise<string> => sendAndConfirm(tx as SdkSignedTx),
  } as any;
}

function findComputeBudgetIndex(msgBytes: Uint8Array): number | null {
  const computeBudgetProgram = bs58.decode("ComputeBudget111111111111111111111111111111");
  let offset = 4;
  const { value: accountCount, bytesRead } = readCompactU16(msgBytes, offset);
  offset += bytesRead;

  for (let i = 0; i < accountCount; i++) {
    const start = offset + i * 32;
    if (computeBudgetProgram.every((b, j) => b === msgBytes[start + j])) return i;
  }
  return null;
}

function hasSetComputeUnitPrice(msgBytes: Uint8Array, cuIdx: number): boolean {
  let offset = 4;
  const { value: accountCount, bytesRead: acBr } = readCompactU16(msgBytes, offset);
  offset += acBr + accountCount * 32 + 32;

  const { value: instrCount, bytesRead: icBr } = readCompactU16(msgBytes, offset);
  offset += icBr;

  for (let i = 0; i < instrCount; i++) {
    const progIdx = msgBytes[offset++];
    const { value: acCount, bytesRead: acBr2 } = readCompactU16(msgBytes, offset);
    offset += acBr2 + acCount;
    const { value: dataLen, bytesRead: dlBr } = readCompactU16(msgBytes, offset);
    offset += dlBr;

    if (progIdx === cuIdx && dataLen >= 1 && msgBytes[offset] === 3) return true;
    offset += dataLen;
  }

  return false;
}

function appendSetComputeUnitPrice(msgBytes: Uint8Array, cuIdx: number, microLamports: bigint): Uint8Array {
  let offset = 4;
  const { value: accountCount, bytesRead: acBr } = readCompactU16(msgBytes, offset);
  offset += acBr + accountCount * 32 + 32;

  const instrCountOffset = offset;
  const { value: instrCount, bytesRead: icBr } = readCompactU16(msgBytes, instrCountOffset);
  offset += icBr;

  for (let i = 0; i < instrCount; i++) {
    offset++;
    const { value: acCount, bytesRead: acBr2 } = readCompactU16(msgBytes, offset);
    offset += acBr2 + acCount;
    const { value: dataLen, bytesRead: dlBr } = readCompactU16(msgBytes, offset);
    offset += dlBr + dataLen;
  }

  const instrSectionEnd = offset;

  const priceData = new Uint8Array(9);
  priceData[0] = 3;
  let ml = microLamports;
  for (let i = 1; i <= 8; i++) {
    priceData[i] = Number(ml & 0xffn);
    ml >>= 8n;
  }

  const newInstr = new Uint8Array([cuIdx, 0x00, 0x09, ...priceData]);
  const newCountBytes = compactU16(instrCount + 1);
  const oldCountBytes = compactU16(instrCount);

  const before = msgBytes.slice(0, instrCountOffset);
  const existingInstrs = msgBytes.slice(instrCountOffset + oldCountBytes.length, instrSectionEnd);
  const altSection = msgBytes.slice(instrSectionEnd);

  const result = new Uint8Array(
    before.length + newCountBytes.length + existingInstrs.length + newInstr.length + altSection.length
  );

  let pos = 0;
  result.set(before, pos);
  pos += before.length;
  result.set(newCountBytes, pos);
  pos += newCountBytes.length;
  result.set(existingInstrs, pos);
  pos += existingInstrs.length;
  result.set(newInstr, pos);
  pos += newInstr.length;
  result.set(altSection, pos);

  return result;
}

function maybeInjectCUPrice(msgBytes: Uint8Array): Uint8Array {
  const cuIdx = findComputeBudgetIndex(msgBytes);
  if (cuIdx === null) return msgBytes;
  if (hasSetComputeUnitPrice(msgBytes, cuIdx)) return msgBytes;
  return appendSetComputeUnitPrice(msgBytes, cuIdx, 1n);
}

function pkcs8FromEd25519Seed(seed: Uint8Array): Uint8Array {
  if (seed.length !== 32) {
    throw new Error(`Ed25519 seed must be 32 bytes, got ${seed.length}`);
  }

  // PKCS#8 wrapper for an Ed25519 private key seed.
  // 30 2e: SEQUENCE (46 bytes)
  //    02 01 00: version
  //    30 05 06 03 2b 65 70: alg id = Ed25519
  //    04 22 04 20 <32-byte seed>
  const prefix = new Uint8Array([
    0x30, 0x2e,
    0x02, 0x01, 0x00,
    0x30, 0x05, 0x06, 0x03, 0x2b, 0x65, 0x70,
    0x04, 0x22, 0x04, 0x20,
  ]);

  const out = new Uint8Array(prefix.length + seed.length);
  out.set(prefix, 0);
  out.set(seed, prefix.length);
  return out;
}

async function ed25519Sign(message: Uint8Array, seed: Uint8Array): Promise<Uint8Array> {
  const pkcs8 = pkcs8FromEd25519Seed(seed);
  const key = await crypto.subtle.importKey(
    "pkcs8",
    pkcs8,
    { name: "Ed25519" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("Ed25519", key, message);
  return new Uint8Array(sig);
}

function createBrowserSigner(
  wallet: Wallet,
  account: WalletAccount,
  commitmentKeyMap?: CommitmentKeyMap
) {
  const signTxFeature = (wallet.features as Record<string, unknown>)["solana:signTransaction"] as
    | {
        signTransaction: (
          ...inputs: readonly { account: WalletAccount; transaction: Uint8Array }[]
        ) => Promise<readonly { signedTransaction: Uint8Array }[]>;
      }
    | undefined;

  const base = createSignerFromWalletAccount(wallet, account) as any;

  if (!signTxFeature?.signTransaction) {
    return base;
  }

  const walletAddr = account.address as string;

  return {
    address: account.address as typeof base.address,

    async signTransaction(transaction: { messageBytes: Uint8Array; signatures: Record<string, Uint8Array | null> }) {
      const numSigs = Object.keys(transaction.signatures).length;
      const countBytes = compactU16(numSigs);

      const preSignerAddrs = Object.keys(transaction.signatures).filter((a) => a !== walletAddr);
      const hasSeed = preSignerAddrs.some((a) => commitmentKeyMap?.has(a));

      const msgToSign = hasSeed
        ? new Uint8Array(transaction.messageBytes)
        : maybeInjectCUPrice(new Uint8Array(transaction.messageBytes));

      const wireBytes = new Uint8Array(countBytes.length + numSigs * 64 + msgToSign.length);
      wireBytes.set(countBytes, 0);
      wireBytes.set(msgToSign, countBytes.length + numSigs * 64);

      const [output] = await signTxFeature.signTransaction({
        account,
        transaction: wireBytes,
      });

      const signedBytes = output.signedTransaction;
      const { value: returnedNumSigs, bytesRead: headerSize } = readCompactU16(signedBytes, 0);

      const sigsFromWallet: Array<Uint8Array | null> = [];
      for (let i = 0; i < returnedNumSigs; i++) {
        const start = headerSize + i * 64;
        const bytes = signedBytes.slice(start, start + 64);
        sigsFromWallet.push(bytes.every((b) => b === 0) ? null : bytes);
      }

      const phantomMsgBytes = signedBytes.slice(headerSize + returnedNumSigs * 64);
      const msgMatches =
        phantomMsgBytes.length === msgToSign.length &&
        phantomMsgBytes.every((b, i) => b === msgToSign[i]);

      const effectiveMessageBytes = msgMatches ? msgToSign : phantomMsgBytes;

      const signerAddresses = Object.keys(transaction.signatures);
      const origSigs = transaction.signatures as Record<string, Uint8Array | null>;
      const newSigs = { ...origSigs };

      for (const [idx, addr] of signerAddresses.entries()) {
        if (addr === walletAddr) {
          const fromWallet = idx < sigsFromWallet.length ? sigsFromWallet[idx] : null;
          if (fromWallet !== null) newSigs[addr] = fromWallet;
        } else if (commitmentKeyMap?.has(addr)) {
          const seed = commitmentKeyMap.get(addr)!;
          newSigs[addr] = await ed25519Sign(effectiveMessageBytes, seed);
        } else {
          const fromWallet = idx < sigsFromWallet.length ? sigsFromWallet[idx] : null;
          if (fromWallet !== null) newSigs[addr] = fromWallet;
        }
      }

      return {
        ...transaction,
        messageBytes: effectiveMessageBytes,
        signatures: newSigs,
      };
    },

    async signTransactions(transactions: { messageBytes: Uint8Array; signatures: Record<string, Uint8Array | null> }[]) {
      return Promise.all(transactions.map((tx) => (this as any).signTransaction(tx)));
    },

    signMessage: base.signMessage?.bind(base),
  } as typeof base;
}

async function makeClient(
  signer: Awaited<ReturnType<typeof createSignerFromWalletAccount>>,
  opts?: { skipPreflight?: boolean }
) {
  const transactionForwarder = opts?.skipPreflight ? makeSkipPreflightForwarder() : undefined;
  const computationMonitor = opts?.skipPreflight
    ? getPollingComputationMonitor({ rpcUrl: RPC_URL })
    : undefined;

  return getUmbraClient(
    {
      signer,
      network: "devnet",
      rpcUrl: RPC_URL,
      rpcSubscriptionsUrl: RPC_WS_URL,
      indexerApiEndpoint: "/api/umbra-indexer",
      deferMasterSeedSignature: true,
    },
    {
      ...(transactionForwarder ? { transactionForwarder } : {}),
      ...(computationMonitor ? { computationMonitor } : {}),
    }
  );
}

export default function UmbraRegisterPage() {
  const [status, setStatus] = useState("idle");
  const [busy, setBusy] = useState(false);
  const [wallet, setWallet] = useState<Wallet | null>(null);
  const [account, setAccount] = useState<WalletAccount | null>(null);
  const [client, setClient] = useState<UmbraClient | null>(null);

  // Important: keep this stable across renders so captured seeds survive until register() uses them.
  const commitmentKeyMapRef = useRef<CommitmentKeyMap>(new Map());

  const connectPhantom = useCallback(async () => {
    setBusy(true);
    try {
      setStatus("finding wallet...");

      const wallets = getWallets().get();
      const compatible = wallets.filter((w) => {
        const features = Object.keys(w.features);
        return features.includes("solana:signTransaction") && features.includes("solana:signMessage");
      });

      const phantom =
        compatible.find((w) => w.name.toLowerCase().includes("phantom")) ??
        compatible[0];

      if (!phantom) {
        throw new Error("No Wallet Standard wallet with signTransaction + signMessage was found");
      }

      const connectFeature = phantom.features[StandardConnect];
      if (!connectFeature) {
        throw new Error("Wallet does not support standard:connect");
      }

      setStatus("connecting...");
      const { accounts } = await connectFeature.connect();
      const nextAccount = accounts[0];

      if (!nextAccount) {
        throw new Error("Wallet returned no account");
      }

      setWallet(phantom);
      setAccount(nextAccount);
      setStatus(`connected: ${nextAccount.address}`);
    } catch (error: any) {
      console.error(error);
      setStatus(`connect error: ${error?.message ?? "unknown error"}`);
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function initClient() {
      if (!wallet || !account) {
        setClient(null);
        return;
      }

      try {
        setStatus("creating Umbra client...");

        const signer = createBrowserSigner(wallet, account, commitmentKeyMapRef.current);
        const nextClient = await makeClient(signer as any, { skipPreflight: true });

        if (!cancelled) {
          setClient(nextClient);
          setStatus(`Umbra client ready for ${nextClient.signer.address}`);
        }
      } catch (error: any) {
        console.error(error);
        if (!cancelled) {
          setClient(null);
          setStatus(`client error: ${error?.message ?? "unknown error"}`);
        }
      }
    }

    void initClient();
    return () => {
      cancelled = true;
    };
  }, [wallet, account]);

  const register = useCallback(async () => {
    if (!client || busy) return;

    setBusy(true);
    try {
      setStatus("checking existing registration...");

      const querier = getUserAccountQuerierFunction({ client });
      const existing = await querier(client.signer.address as Address);

      if (
        existing.state === "exists" &&
        existing.data.isUserCommitmentRegistered &&
        existing.data.isUserAccountX25519KeyRegistered
      ) {
        setStatus("already registered");
        return;
      }

      setStatus("deriving master seed...");
      await client.masterSeed.getMasterSeed();

      const registerUser = getUserRegistrationFunction(
        { client },
        {
          zkProver: getUserRegistrationProver(makeZkProverDeps()),
          keys: {
            userAccountX25519KeypairDeriver: makeCapturingDeriver(
              getUserAccountX25519KeypairDeriver({ client }),
              commitmentKeyMapRef.current
            ),
            masterViewingKeyEncryptingX25519KeypairDeriver: makeCapturingDeriver(
              getMasterViewingKeyX25519KeypairDeriver({ client }),
              commitmentKeyMapRef.current
            ),
          },
        }
      );

      setStatus("registering...");
      const signatures = await registerUser({
        confidential: true,
        anonymous: true,
        accountInfoCommitment: "confirmed",
        callbacks: {
          userAccountInitialisation: {
            pre: async () => setStatus("step 1/3: creating account..."),
            post: async (_tx, sig) => setStatus(`step 1/3 done: ${sig}`),
          },
          registerX25519PublicKey: {
            pre: async () => setStatus("step 2/3: registering X25519 key..."),
            post: async (_tx, sig) => setStatus(`step 2/3 done: ${sig}`),
          },
          registerUserForAnonymousUsage: {
            pre: async () => setStatus("step 3/3: registering anonymous commitment..."),
            post: async (_tx, sig) => setStatus(`step 3/3 done: ${sig}`),
          },
        },
      });

      setStatus(signatures.length === 0 ? "already registered" : `registered: ${signatures.length} tx(s)`);
    } catch (error: any) {
      console.error(error);
      setStatus(`registration error: ${error?.message ?? "unknown error"}`);
    } finally {
      setBusy(false);
    }
  }, [client, busy]);

  return (
    <main style={{ minHeight: "100svh", display: "grid", placeItems: "center", padding: 24 }}>
      <section style={{ width: "min(720px, 100%)", display: "grid", gap: 16 }}>
        <div>
          <h1 style={{ margin: 0, fontSize: 32, fontWeight: 700 }}>
            Umbra registration only
          </h1>
          <p style={{ marginTop: 8, opacity: 0.75 }}>
            Connect Phantom, create the Umbra client, and register the account.
          </p>
        </div>

        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
          <button onClick={connectPhantom} disabled={busy}>
            Connect Phantom
          </button>
          <button onClick={() => void register()} disabled={busy || !client}>
            Register Umbra
          </button>
        </div>

        <div style={{ border: "1px solid rgba(255,255,255,0.12)", borderRadius: 16, padding: 16 }}>
          <div><strong>Status:</strong> {status}</div>
          <div><strong>Wallet:</strong> {wallet?.name ?? "not connected"}</div>
          <div style={{ wordBreak: "break-all" }}>
            <strong>Account:</strong> {account?.address ?? "not connected"}
          </div>
          <div><strong>Client:</strong> {client ? "ready" : "not ready"}</div>
        </div>
      </section>
    </main>
  );
}