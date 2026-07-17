/**
 * Diagnostic: compare leaf 1189's depositor pubkey against the X25519 pubkey
 * our persisted K derives. If they don't match, the scanner won't ECDH-match.
 */
import { ReadServiceClient } from "@umbra-privacy/sdk/indexer/utxo";
import { getMasterViewingKeyX25519KeypairDeriver } from "@umbra-privacy/sdk/crypto/key-derivation";
import { getTokenEncryptionX25519KeypairDeriver } from "@umbra-privacy/sdk/crypto/key-derivation";

import { buildTestClient } from "./setup.js";

const INDEXER =
  process.env.INDEXER_API_ENDPOINT ??
  "https://utxo-indexer.api-devnet.umbraprivacy.com";

function b64ToBytes(b64: string): Uint8Array {
  return new Uint8Array(Buffer.from(b64, "base64"));
}
function hex(b: Uint8Array): string {
  return Array.from(b).map((x) => x.toString(16).padStart(2, "0")).join("");
}

async function main(): Promise<void> {
  const tc = await buildTestClient();
  console.log(`vault PDA = ${tc.vault.address}`);

  // Derive our K's MVK + token X25519 pubkeys (same way the scanner does).
  const mvkKeypair = await getMasterViewingKeyX25519KeypairDeriver({ client: tc.client })();
  const tokenKeypair = await getTokenEncryptionX25519KeypairDeriver({ client: tc.client })();

  const mvkPubHex = hex(mvkKeypair.x25519Keypair.publicKey);
  const tokenPubHex = hex(tokenKeypair.x25519Keypair.publicKey);
  console.log(`our MVK X25519 pubkey   = ${mvkPubHex}`);
  console.log(`our token X25519 pubkey = ${tokenPubHex}`);

  // Pull the last ~10 leaves from the indexer and see if any match.
  const client = new ReadServiceClient({ endpoint: INDEXER });
  const items = await client.getAllUtxoData(0n, undefined, 1000n);
  const recent = items.slice(-10);
  console.log(`\nlast 10 leaves' depositor_x25519_public_key:`);
  for (const u of recent) {
    const depBytes = b64ToBytes(u.depositor_x25519_public_key);
    const depHex = hex(depBytes);
    const matchMvk = depHex === mvkPubHex;
    const matchToken = depHex === tokenPubHex;
    const tag = matchMvk ? "  ← MATCH MVK!" : matchToken ? "  ← MATCH TOKEN!" : "";
    console.log(`  leaf ${u.insertion_index}  slot ${u.slot}  depositor=${depHex}${tag}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
