/**
 * Quick debug: fetch the latest UTXO from the indexer and dump its key fields
 * so we can compare against what step 4's deposit emitted.
 */
import { ReadServiceClient } from "@umbra-privacy/sdk/indexer/utxo";

const INDEXER =
  process.env.INDEXER_API_ENDPOINT ??
  "https://utxo-indexer.api-devnet.umbraprivacy.com";

async function main(): Promise<void> {
  const client = new ReadServiceClient({ endpoint: INDEXER });
  const trees = await client.getTreeSummary();
  console.log("=== TREES ===");
  for (const t of trees.trees) {
    console.log(`  tree ${t.tree_index}: num_leaves=${t.num_leaves}`);
  }

  // Fetch ALL UTXOs (paginated)
  const items = await client.getAllUtxoData(0n, undefined, 1000n);
  console.log(`\n=== LAST 5 UTXOs (of ${items.length}) ===`);
  const last = items.slice(-5);
  for (const u of last) {
    console.log(
      `\n  absoluteIndex=${u.absolute_index}  tree=${u.tree_index}  leaf=${u.insertion_index}`,
    );
    console.log(`    slot=${u.slot}  ts=${u.timestamp}  event=${u.event_type}`);
    console.log(`    sender=${u.h1_sender_address}`);
    console.log(`    mint=${u.h1_mint_address}`);
    console.log(`    depositor_x25519_pubkey=${u.depositor_x25519_public_key}`);
    console.log(`    aes_encrypted_data(b64)=${u.aes_encrypted_data.slice(0, 60)}...`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
