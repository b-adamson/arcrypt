/**
 * Compare on-chain user_commitment vs what our persisted K derives.
 */
import {
  getMasterViewingKeyDeriver,
  getMasterViewingKeyBlindingFactorDeriver,
  getPoseidonPrivateKeyDeriver,
  getPoseidonBlindingFactorDeriver,
} from "@umbra-privacy/sdk/crypto/key-derivation";
import { getUserCommitmentGeneratorFunction } from "@umbra-privacy/sdk/crypto/commitment";

import { buildTestClient } from "./setup.js";

async function main(): Promise<void> {
  const tc = await buildTestClient();

  const mvk = await getMasterViewingKeyDeriver({ client: tc.client })();
  const mvkBlinding = await getMasterViewingKeyBlindingFactorDeriver({ client: tc.client })();
  const poseidonPriv = await getPoseidonPrivateKeyDeriver({ client: tc.client })();
  const poseidonBlinding = await getPoseidonBlindingFactorDeriver({ client: tc.client })();

  const userCommitmentGen = getUserCommitmentGeneratorFunction();
  const localUc = await userCommitmentGen(mvk, mvkBlinding, poseidonPriv, poseidonBlinding);
  console.log(`local user_commitment (Bn254 bigint hex): 0x${localUc.toString(16)}`);

  // Fetch + decode on-chain user account via the SDK's codama decoder.
  const { decodeEncryptedUserAccount } = await import("@umbra-privacy/umbra-codama");
  const { findEncryptedUserAccountPda } = await import("@umbra-privacy/sdk/pda");
  const { fetchEncodedAccount } = await import("@solana/kit");
  const userPda = await findEncryptedUserAccountPda({
    userPubkey: tc.vault.address,
    umbraProgram: tc.client.networkConfig.programId,
  });
  console.log(`user account PDA: ${userPda}`);
  const maybe = await fetchEncodedAccount(tc.rpc as never, userPda);
  if (!maybe.exists) throw new Error("user account doesn't exist");
  const decoded = decodeEncryptedUserAccount(maybe);
  const onChainUcBytes = new Uint8Array(decoded.data.userCommitment.first);
  let onChainUc = 0n;
  for (let i = onChainUcBytes.length - 1; i >= 0; i--) {
    onChainUc = (onChainUc << 8n) | BigInt(onChainUcBytes[i]);
  }
  console.log(`on-chain user_commitment (Bn254 bigint hex): 0x${onChainUc.toString(16)}`);
  console.log(`match: ${localUc === onChainUc}`);
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
