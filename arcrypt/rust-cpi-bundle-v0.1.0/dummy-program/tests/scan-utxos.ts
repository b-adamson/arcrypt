/**
 * UTXO scanner for the dummy-program e2e test.
 *
 * Uses the same persisted K (at ~/.umbra-dummy-test-K.json) the e2e tests use,
 * which means the spoofed Vault-PDA signer's master seed matches what was
 * registered on-chain in step 2 and used to encrypt step 4's stealth-pool note.
 *
 * Outputs:
 *   - All UTXOs the SDK could decrypt with our master seed
 *   - Per-UTXO: tree+leaf index, amount, mint, destination, source, kind
 *   - For each: nullifier hash + whether that hash appears in the
 *     nullifier-indexer's burnt list (i.e. the note has been claimed/spent)
 *
 * Run with:
 *   npx tsx scan-utxos.ts
 */
import { homedir } from "node:os";
import { join } from "node:path";

import {
  getBurnableStealthPoolNoteScannerFunction,
  type DecryptedStealthPoolNoteData,
} from "@umbra-privacy/sdk/burn";
import {
  deriveNullifierFromModifiedGenerationIndex,
} from "@umbra-privacy/sdk/crypto/key-derivation";
import { NullifierIndexerClient } from "@umbra-privacy/sdk/indexer/nullifier";

import { buildTestClient } from "./setup.js";

// Nullifier indexer URL. Try `api-devnet` first (matches the UTXO indexer
// host convention); override via env if needed.
const NULLIFIER_INDEXER_URL =
  process.env.NULLIFIER_INDEXER_URL ??
  "https://nullifier-indexer.api-devnet.umbraprivacy.com";

/** Convert a Bn254FieldElement (bigint) to 32 LE bytes, matching the indexer's encoding. */
function bigIntToLeBytes32(value: bigint): Uint8Array {
  const out = new Uint8Array(32);
  let v = value;
  for (let i = 0; i < 32; i++) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return out;
}

function hex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Fetch every burnt nullifier from the indexer (pool 0 only for the dummy demo). */
async function fetchAllBurntNullifiers(
  client: NullifierIndexerClient,
  pool: number,
): Promise<Set<string>> {
  const set = new Set<string>();
  let cursor = 0n;
  for (;;) {
    const page = await client.getBurntNullifiers(pool, cursor, 1000);
    for (const entry of page.entries) {
      set.add(hex(entry.nullifierHash));
    }
    if (!page.hasMore || page.nextCursor === 0n) break;
    cursor = page.nextCursor;
  }
  return set;
}

async function main(): Promise<void> {
  console.log("[scan] K source:", join(homedir(), ".umbra-dummy-test-K.json"));
  console.log("[scan] building test client (loads persisted K, derives master seed)...");
  const tc = await buildTestClient();
  console.log(`[scan] vault PDA = ${tc.vault.address}`);
  console.log(`[scan] fee_payer = ${tc.feePayer.address}`);

  // --------------------------------------------------------------------------
  // Scan UTXOs decryptable by our master seed.
  // --------------------------------------------------------------------------
  console.log("[scan] running SDK scanner (auto-discovers trees, decrypts notes)...");
  const scan = getBurnableStealthPoolNoteScannerFunction({ client: tc.client });
  const result = await scan();

  // Flatten into one list with provenance.
  type Tagged = DecryptedStealthPoolNoteData & { bucket: string };
  const all: Tagged[] = [];
  const buckets: Record<string, readonly DecryptedStealthPoolNoteData[]> = {
    etaToStealthPoolSelfBurnable: result.etaToStealthPoolSelfBurnable,
    etaToStealthPoolReceiverBurnable: result.etaToStealthPoolReceiverBurnable,
    ataToStealthPoolSelfBurnable: result.ataToStealthPoolSelfBurnable,
    ataToStealthPoolReceiverBurnable: result.ataToStealthPoolReceiverBurnable,
    networkBalanceToStealthPoolSelfBurnableWithEncryptedAddress:
      result.networkBalanceToStealthPoolSelfBurnableWithEncryptedAddress,
    networkBalanceToStealthPoolReceiverBurnableWithEncryptedAddress:
      result.networkBalanceToStealthPoolReceiverBurnableWithEncryptedAddress,
  };
  for (const [bucket, notes] of Object.entries(buckets)) {
    for (const n of notes) all.push({ ...n, bucket });
  }

  console.log(`[scan] trees scanned: ${result.scannedTrees.length}`);
  for (const t of result.scannedTrees) {
    console.log(
      `         tree ${t.treeIndex}: ${t.scannedRange ? `[${t.scannedRange.start}..${t.scannedRange.end}]` : "(empty)"} ` +
        `of ${t.totalLeaves} leaves, fullyScanned=${String(t.fullyScanned)}`,
    );
  }
  console.log(`[scan] total UTXOs decrypted: ${all.length}`);

  if (all.length === 0) {
    console.log(
      "[scan] no UTXOs found. Either step 4's MPC hasn't finalised yet, " +
        "the EA flow's UTXOs aren't decryptable by this K, or the indexer " +
        "hasn't caught up.",
    );
    return;
  }

  // --------------------------------------------------------------------------
  // Fetch burnt-nullifier set so we can flag claimed UTXOs.
  // --------------------------------------------------------------------------
  console.log(`[scan] fetching burnt nullifiers from ${NULLIFIER_INDEXER_URL}...`);
  const nullifierClient = new NullifierIndexerClient({ endpoint: NULLIFIER_INDEXER_URL });
  const burnt = await fetchAllBurntNullifiers(nullifierClient, 0);
  console.log(`[scan] burnt nullifiers (pool 0): ${burnt.size}`);

  // --------------------------------------------------------------------------
  // Per-UTXO report with claim status.
  // --------------------------------------------------------------------------
  console.log("\n=== UTXOs ===");
  for (let i = 0; i < all.length; i++) {
    const u = all[i];
    const nullifier = await deriveNullifierFromModifiedGenerationIndex(u.modifiedGenerationIndex);
    const nullifierBytes = bigIntToLeBytes32(nullifier);
    const nullifierHex = hex(nullifierBytes);
    const isClaimed = burnt.has(nullifierHex);

    console.log(`\n  [${i}] bucket: ${u.bucket}`);
    console.log(`      tree: ${u.treeIndex}  leaf: ${u.insertionIndex}`);
    console.log(`      amount: ${u.amount} (base units)`);
    console.log(
      `      mint (low/high u128): 0x${u.h1Components.mintAddressLow.toString(16)} / ` +
        `0x${u.h1Components.mintAddressHigh.toString(16)}`,
    );
    console.log(`      destination: ${u.destinationAddress}`);
    console.log(`      kind: ${u.kind}  source: ${u.source}`);
    console.log(`      h2: 0x${hex(u.h2Hash)}`);
    console.log(`      nullifier: 0x${nullifierHex}`);
    console.log(`      claimed: ${isClaimed ? "YES" : "no"}`);
  }

  // --------------------------------------------------------------------------
  // Summary
  // --------------------------------------------------------------------------
  const claimedCount = (
    await Promise.all(
      all.map(async (u) => {
        const n = await deriveNullifierFromModifiedGenerationIndex(u.modifiedGenerationIndex);
        return burnt.has(hex(bigIntToLeBytes32(n)));
      }),
    )
  ).filter(Boolean).length;
  console.log("\n=== Summary ===");
  console.log(`  total UTXOs: ${all.length}`);
  console.log(`  claimed:     ${claimedCount}`);
  console.log(`  unclaimed:   ${all.length - claimedCount}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("[scan] fatal:", error);
    process.exit(1);
  });
