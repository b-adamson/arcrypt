/**
 * Manual decrypt of a single leaf so we can see what's failing in the scanner.
 */
import { ReadServiceClient } from "@umbra-privacy/sdk/indexer/utxo";
import { getMasterViewingKeyX25519KeypairDeriver } from "@umbra-privacy/sdk/crypto/key-derivation";
import { getAesDecryptor } from "@umbra-privacy/sdk/crypto/aes";
import { x25519 } from "@noble/curves/ed25519.js";
import { keccak_256 } from "@noble/hashes/sha3";

import { buildTestClient } from "./setup.js";

const INDEXER =
  process.env.INDEXER_API_ENDPOINT ?? "https://utxo-indexer.api-devnet.umbraprivacy.com";

function b64ToBytes(b: string): Uint8Array {
  return new Uint8Array(Buffer.from(b, "base64"));
}
function hex(b: Uint8Array): string {
  return Array.from(b).map((x) => x.toString(16).padStart(2, "0")).join("");
}

async function main(): Promise<void> {
  const tc = await buildTestClient();
  const mvk = await getMasterViewingKeyX25519KeypairDeriver({ client: tc.client })();
  const mvkPriv = mvk.x25519Keypair.privateKey;
  const mvkPub = mvk.x25519Keypair.publicKey;
  console.log(`MVK priv (hex): ${hex(mvkPriv)}`);
  console.log(`MVK pub  (hex): ${hex(mvkPub)}`);

  const client = new ReadServiceClient({ endpoint: INDEXER });
  const utxo = await client.getUtxo(1189n);
  if (!utxo) throw new Error("leaf 1189 not found");

  const depositorPub = b64ToBytes(utxo.depositor_x25519_public_key);
  const aesBlob = b64ToBytes(utxo.aes_encrypted_data);
  console.log(`\nleaf 1189:`);
  console.log(`  depositor pubkey: ${hex(depositorPub)}`);
  console.log(`  aes blob length:  ${aesBlob.length} bytes`);
  console.log(`  aes blob (hex):   ${hex(aesBlob).slice(0, 100)}...`);

  // Shared secret + AES key
  const sharedSecret = x25519.getSharedSecret(mvkPriv, depositorPub);
  console.log(`\nshared secret (hex): ${hex(sharedSecret)}`);
  const aesKey = keccak_256(sharedSecret).slice(0, 32);
  console.log(`AES key (hex):       ${hex(aesKey)}`);

  // AES blob layout per SDK getAesDecryptor: 12 IV | 16 authTag | <ciphertext>
  console.log(`\nlayout: 12 IV | 16 authTag | ciphertext`);
  console.log(`  IV:       ${hex(aesBlob.slice(0, 12))}`);
  console.log(`  authTag:  ${hex(aesBlob.slice(12, 28))}`);
  console.log(`  ct:       ${hex(aesBlob.slice(28))}`);

  // Try decrypt via SDK's wrapper that knows the right layout.
  const decrypt = getAesDecryptor();
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const plaintext = await decrypt(aesKey as any, aesBlob as any);
    console.log(`\nDECRYPT OK. plaintext hex: ${hex(plaintext)}`);
    console.log(`  amount (u64 LE):  ${BigInt(
      "0x" + Array.from(plaintext.slice(0, 8)).reverse().map((b) => b.toString(16).padStart(2, "0")).join(""),
    )}`);
    console.log(`  destination:      ${hex(plaintext.slice(8, 40))}`);
    console.log(`  modGenIndex:      ${hex(plaintext.slice(40, 56))}`);
    console.log(`  domain separator: ${hex(plaintext.slice(56, 68))}`);
  } catch (error) {
    console.error("\nDECRYPT FAILED:", error);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
