/**
 * Test fixtures shared across the e2e flow.
 *
 * Identity model:
 *
 *   - `feePayer` = a real wallet keypair (loaded from `WALLET_KEYPAIR_PATH` env,
 *     default `~/.config/solana/id.json`). Signs the outer txs, pays all SOL.
 *
 *   - `K` = a fresh ephemeral ed25519 keypair generated per-test-run. Acts as
 *     the "signer" the dummy-program's Vault PDA conceptually owns. K signs the
 *     `signMessage(...)` calls the SDK makes during masterSeed derivation. K
 *     never signs an on-chain tx for this program.
 *
 *   - `vaultPda` = `[UMBRA_INITIATOR_SEED]` under the dummy program ID. This is
 *     the depositor/initiator/user identity on-chain. The dummy program signs
 *     for it via `invoke_signed` with seeds `[UMBRA_INITIATOR_SEED, &[bump]]`.
 *
 * Custom signer: we implement `IUmbraSigner` ourselves with `address = vaultPda`
 * and `signMessage = K.signMessage(...)`. That way every cryptographic value
 * the SDK derives is bound to the Vault PDA (not K), but masterSeed derivation
 * has a real keypair to call. K is generated fresh each run so the masterSeed
 * is non-deterministic — pin it to a constant if reproducibility matters.
 */
import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

import {
  address,
  type Address,
  createKeyPairFromBytes,
  createKeyPairSignerFromBytes,
  createKeyPairSignerFromPrivateKeyBytes,
  createSolanaRpc,
  createSolanaRpcSubscriptions,
  getAddressEncoder,
  getProgramDerivedAddress,
  signBytes,
  type KeyPairSigner,
  type Rpc,
  type RpcSubscriptions,
  type SolanaRpcApi,
  type SolanaRpcSubscriptionsApi,
} from "@solana/kit";

import {
  createSignerFromPrivateKeyBytes,
  getUmbraClient,
  type IUmbraClient,
  type IUmbraSigner,
  type SignedMessage,
  type MasterSeed,
} from "@umbra-privacy/sdk";

// =============================================================================
// PROGRAM + NETWORK CONSTANTS
// =============================================================================

/** Devnet RPC (override with SOLANA_RPC_URL env). */
export const RPC_URL: string =
  process.env.SOLANA_RPC_URL ?? "https://api.devnet.solana.com";

/** Devnet WSS (override with SOLANA_WS_URL env). */
export const WS_URL: string =
  process.env.SOLANA_WS_URL ?? "wss://api.devnet.solana.com";

/** Devnet Umbra program. */
export const UMBRA_PROGRAM_ID = address(
  "DSuKkyqGVGgo4QtPABfxKJKygUDACbUhirnuv63mEpAJ",
);

/** Dummy program ID (matches declare_id! in lib.rs). */
export const DUMMY_PROGRAM_ID = address(
  "5N7xhsXVadavhqVcWkGLkXsAxVp9v73jpcFZP3tsybUj",
);

/** UTXO indexer endpoint — `api-devnet` is the devnet-current host. */
export const INDEXER_API_ENDPOINT =
  process.env.INDEXER_API_ENDPOINT ??
  "https://utxo-indexer.api-devnet.umbraprivacy.com";

/** UMBRA_INITIATOR_SEED bytes (matches rs-libs/umbra-constants/src/umbra_callback.rs). */
export const UMBRA_INITIATOR_SEED: Uint8Array = new TextEncoder().encode(
  "UmbraInitiator",
);

// =============================================================================
// KEYPAIR LOADERS
// =============================================================================

/**
 * Load a Solana CLI keypair JSON (array of 64 bytes).
 *
 * Defaults to the devnet deployer keypair at
 * `~/.config/solana/deployers/devnet.json`. That's the wallet that:
 * - Pays tx fees for every step.
 * - Holds the test token (mint TEST_MINT) — funds the vault PDA's ATA in step 1b.
 * - Pays rent for the Arcium buffer + computation PDAs in steps 2/3/4.
 *
 * Override with `WALLET_KEYPAIR_PATH=/some/other.json`.
 */
export async function loadCliKeypair(
  path: string = process.env.WALLET_KEYPAIR_PATH ??
    join(homedir(), ".config/solana/deployers/devnet.json"),
): Promise<KeyPairSigner> {
  const bytes = new Uint8Array(JSON.parse(readFileSync(path, "utf-8")));
  return await createKeyPairSignerFromBytes(bytes);
}

// =============================================================================
// VAULT PDA
// =============================================================================

export async function deriveVaultPda(): Promise<{
  address: Address;
  bump: number;
}> {
  const [pda, bump] = await getProgramDerivedAddress({
    programAddress: DUMMY_PROGRAM_ID,
    seeds: [UMBRA_INITIATOR_SEED],
  });
  return { address: pda, bump };
}

// =============================================================================
// CUSTOM SIGNER (Vault address, K signs)
// =============================================================================

/**
 * Wraps a real ed25519 keypair `K` but exposes the Vault PDA as `address`.
 * Result: SDK functions that derive things from `signer.address` bind to the
 * Vault PDA, while `signMessage` calls are answered by K's real signature
 * (needed only for masterSeed derivation, not for on-chain validation).
 *
 * `signTransaction` throws — we don't use the SDK's build/submit path; we
 * construct the on-chain ixs ourselves and sign them with feePayer + K (only
 * K signs when an ix has it as `x25519_proving_signer_*` slot).
 */
export async function makeVaultSpoofSigner(args: {
  vault: Address;
  ephemeralKeypair: KeyPairSigner;
}): Promise<IUmbraSigner> {
  const { vault, ephemeralKeypair } = args;
  return {
    address: vault,
    signMessage: async (message: Uint8Array): Promise<SignedMessage> => {
      const signature = await signBytes(ephemeralKeypair.keyPair.privateKey, message);
      return {
        message,
        signature,
        signer: vault,
      };
    },
    signTransaction: async () => {
      throw new Error(
        "Vault-spoof signer cannot sign transactions; build ixs manually and sign with feePayer.",
      );
    },
    signTransactions: async () => {
      throw new Error(
        "Vault-spoof signer cannot sign transactions; build ixs manually and sign with feePayer.",
      );
    },
  };
}

// =============================================================================
// FRESH EPHEMERAL KEYPAIR
// =============================================================================

/**
 * Persistent ephemeral keypair used as the "real" signer the vault PDA
 * conceptually owns. Stored at `~/.umbra-dummy-test-K.json` so subsequent
 * `vitest run` invocations reuse the same K — critical because:
 *
 * - Step 2's MPC callback writes `user_commitment(K)` to the vault's
 *   on-chain EncryptedUserAccount.
 * - Step 4's Groth16 proof commits to that SAME `user_commitment(K)`.
 *   If K changes between runs, the proof's senderUserCommitment will
 *   not match what's on-chain and verification fails (error 14005).
 *
 * Override the path with `TEST_K_KEYPAIR_PATH`. Delete the file to start
 * fresh (then re-run steps 2 + 3 to re-register on-chain).
 */
export async function freshEphemeralKeypair(): Promise<KeyPairSigner> {
  const { existsSync, writeFileSync } = await import("node:fs");
  const kPath =
    process.env.TEST_K_KEYPAIR_PATH ??
    join(homedir(), ".umbra-dummy-test-K.json");
  if (!existsSync(kPath)) {
    const priv = crypto.getRandomValues(new Uint8Array(32));
    writeFileSync(kPath, JSON.stringify(Array.from(priv)));
    console.log(`[setup] generated new K and saved to ${kPath}`);
    return await createKeyPairSignerFromPrivateKeyBytes(priv);
  }
  const priv = new Uint8Array(JSON.parse(readFileSync(kPath, "utf-8")));
  return await createKeyPairSignerFromPrivateKeyBytes(priv);
}

// =============================================================================
// UMBRA CLIENT (PDA-as-depositor)
// =============================================================================

export interface TestClient {
  client: IUmbraClient;
  rpc: Rpc<SolanaRpcApi>;
  rpcSubscriptions: RpcSubscriptions<SolanaRpcSubscriptionsApi>;
  feePayer: KeyPairSigner;
  vault: { address: Address; bump: number };
  /** The keypair the SDK believes is the depositor's signing material. */
  ephemeralKeypair: KeyPairSigner;
  /** Custom signer routed into `getUmbraClient`. */
  signer: IUmbraSigner;
}

export async function buildTestClient(): Promise<TestClient> {
  const rpc = createSolanaRpc(RPC_URL);
  const rpcSubscriptions = createSolanaRpcSubscriptions(WS_URL);
  const feePayer = await loadCliKeypair();
  const vault = await deriveVaultPda();
  const ephemeralKeypair = await freshEphemeralKeypair();
  const signer = await makeVaultSpoofSigner({
    vault: vault.address,
    ephemeralKeypair,
  });

  const client = await getUmbraClient({
    signer,
    network: "devnet",
    rpcUrl: RPC_URL,
    rpcSubscriptionsUrl: WS_URL,
    indexerApiEndpoint: INDEXER_API_ENDPOINT,
    deferMasterSeedSignature: false,
  });

  return { client, rpc, rpcSubscriptions, feePayer, vault, ephemeralKeypair, signer };
}

// =============================================================================
// HELPERS
// =============================================================================

/** Hex-encode for debug logs. */
export function hex(bytes: Uint8Array | ReadonlyArray<number>): string {
  return "0x" + Array.from(bytes).map((b) => (b as number).toString(16).padStart(2, "0")).join("");
}

/** Encode an `Address` to its 32 raw bytes. */
export function addrBytes(a: Address): Uint8Array {
  return getAddressEncoder().encode(a) as Uint8Array;
}
