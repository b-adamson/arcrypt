/**
 * Time-instrumented claim flow using the SDK's burn factory + lifecycle hooks
 * so we can see exactly where time is spent: key derivation, batch assembly,
 * Groth16 prove, relayer submit, relayer-side polling.
 */
import {
  getBurnableStealthPoolNoteScannerFunction,
  getSelfBurnableStealthPoolNoteIntoETABurnerFunction,
} from "@umbra-privacy/sdk/burn";
import { getClaimReceiverClaimableUtxoIntoEncryptedBalanceProver } from "@umbra-privacy/sdk/zk-prover";
import { getUmbraRelayer } from "@umbra-privacy/sdk/relayer";
import { getBatchMerkleProofFetcher } from "@umbra-privacy/sdk/indexer";

import { buildTestClient } from "./setup.js";

const RELAYER_URL =
  process.env.RELAYER_URL ?? "https://relayer.api-devnet.umbraprivacy.com";
const INDEXER =
  process.env.INDEXER_API_ENDPOINT ??
  "https://utxo-indexer.api-devnet.umbraprivacy.com";

function ms(t0: number): string {
  return `${(Date.now() - t0).toFixed(0)} ms`;
}

async function main(): Promise<void> {
  const t0 = Date.now();
  const tc = await buildTestClient();
  console.log(`[0] buildTestClient: ${ms(t0)}  vault=${tc.vault.address}`);

  // ── 1. Scan ──────────────────────────────────────────────────────────
  const t1 = Date.now();
  const scan = getBurnableStealthPoolNoteScannerFunction({ client: tc.client });
  const result = await scan();
  const selfNotes = [
    ...result.networkBalanceToStealthPoolSelfBurnableWithEncryptedAddress,
    ...result.etaToStealthPoolSelfBurnable,
    ...result.ataToStealthPoolSelfBurnable,
  ];
  console.log(`[1] scan: ${ms(t1)}  decrypted=${selfNotes.length}`);
  if (selfNotes.length === 0) throw new Error("no notes");

  selfNotes.sort((a, b) => Number(BigInt(b.insertionIndex) - BigInt(a.insertionIndex)));
  const note = selfNotes[0];
  if (note.kind !== "self-burnable") throw new Error("expected self-burnable");
  console.log(
    `    picked newest: leaf=${note.insertionIndex} amount=${note.amount} ` +
      `source=${note.source}`,
  );

  // ── 2. Factory deps ──────────────────────────────────────────────────
  const t2 = Date.now();
  const zkProver = getClaimReceiverClaimableUtxoIntoEncryptedBalanceProver();
  const umbraRelayer = getUmbraRelayer({ apiEndpoint: RELAYER_URL });
  const fetchBatchMerkleProof = getBatchMerkleProofFetcher({ apiEndpoint: INDEXER });
  console.log(`[2] init factory deps: ${ms(t2)}`);

  // ── 3. Build burn fn with timing hooks ───────────────────────────────
  let tKeyDeriv = Date.now();
  let tAssembly = Date.now();
  let tZkStart = Date.now();
  let tSubmitStart = Date.now();

  const burn = getSelfBurnableStealthPoolNoteIntoETABurnerFunction(
    { client: tc.client },
    {
      zkProver,
      fetchBatchMerkleProof,
      relayer: {
        submitBurn: umbraRelayer.submitClaim,
        pollBurnStatus: umbraRelayer.pollClaimStatus,
        getRelayerAddress: umbraRelayer.getRelayerAddress,
      },
      awaitCompletion: true,
      pollingIntervalMs: 2000,
      timeoutMs: 180_000,
      hooks: {
        onKeyDerivationStart: async () => {
          tKeyDeriv = Date.now();
          console.log("    [hook] keyDerivation start");
        },
        onKeyDerivationComplete: async ({ elapsedMs }) => {
          console.log(`    [hook] keyDerivation complete: ${elapsedMs} ms`);
        },
        onBatchAssemblyStart: async () => {
          tAssembly = Date.now();
          console.log("    [hook] batchAssembly start");
        },
        onBatchAssemblyComplete: async ({ batchCount, totalStealthPoolNotes }) => {
          console.log(
            `    [hook] batchAssembly complete: ${ms(tAssembly)}  batches=${batchCount} notes=${totalStealthPoolNotes}`,
          );
        },
        onBatchStart: async ({ batchIndex, batchCount }) => {
          console.log(`    [hook] batch ${batchIndex}/${batchCount} start`);
        },
        onBatchZkProofGenerationStart: async ({ batchIndex }) => {
          tZkStart = Date.now();
          console.log(`    [hook] batch ${batchIndex} ZK prove START (snarkjs + Groth16)...`);
        },
        onBatchZkProofGenerationComplete: async ({ batchIndex, elapsedMs }) => {
          console.log(
            `    [hook] batch ${batchIndex} ZK prove DONE: SDK-reported=${elapsedMs} ms ` +
              `wall=${ms(tZkStart)}`,
          );
          tSubmitStart = Date.now();
        },
        onBatchSubmitted: async ({ batchIndex, requestId }) => {
          console.log(
            `    [hook] batch ${batchIndex} submitted to relayer: ${ms(tSubmitStart)}  ` +
              `requestId=${requestId}`,
          );
        },
        onBatchProgress: async ({ batchIndex, status }) => {
          console.log(`    [hook] batch ${batchIndex} status: ${String(status)}`);
        },
      },
    },
  );

  // ── 4. Dispatch ──────────────────────────────────────────────────────
  const tBurn = Date.now();
  console.log("[4] calling burn() ...");
  const burnResult = await burn([{ ...note, kind: "self-burnable" }]);
  console.log(`[4] burn() returned: ${ms(tBurn)}`);
  console.log(
    `    result: ${JSON.stringify(burnResult, (_k, v) =>
      typeof v === "bigint" ? v.toString() : v,
    ).slice(0, 600)}`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
