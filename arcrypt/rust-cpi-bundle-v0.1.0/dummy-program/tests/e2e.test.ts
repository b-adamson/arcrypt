/**
 * End-to-end devnet test for the dummy program.
 *
 * Sequence (each step is one vitest case, runs sequentially in declaration order):
 *
 *   1. initialise_vault — one-time PDA setup (idempotent on re-run).
 *   2. queue_anonymous_registration — SDK prepares the data (Groth16 + rescue);
 *      dummy program CPIs the umbra ix with vault PDA as `user`.
 *   3. queue_deposit_into_new_network_balance — SDK prepares the data
 *      (mint fetch, variant selection, Arcium PDAs); dummy program CPIs.
 *   4. load_encrypted_address_deposit_buffer + queue_encrypted_address_deposit
 *      — the EA load + queue pair the user's main asks were about.
 *
 * The dummy program's signer identity for every Umbra-side ix is the Vault PDA
 * (signed via invoke_signed inside the program). The outer tx is signed only
 * by fee_payer + per-tx ephemeral proving signers (e.g. the MVK proving signer
 * for anonymous registration). For the EA buffer's "source channel" fields the
 * test repeats the rescue values 1:1 as agreed — that short-circuit means
 * the resulting note won't be recoverable, but the on-chain dispatch path
 * exercises end-to-end.
 */
import { describe, it, beforeAll } from "vitest";
import {
  type Address,
  address,
  appendTransactionMessageInstructions,
  assertIsTransactionWithBlockhashLifetime,
  compressTransactionMessageUsingAddressLookupTables,
  createTransactionMessage,
  getSignatureFromTransaction,
  isSignerRole,
  pipe,
  sendAndConfirmTransactionFactory,
  setTransactionMessageFeePayer,
  setTransactionMessageLifetimeUsingBlockhash,
  signTransactionMessageWithSigners,
  type Instruction,
  type TransactionSigner,
} from "@solana/kit";
import {
  lookupAltEntry,
  buildAltAddressesRecord,
  createSetComputeUnitLimitInstruction,
} from "@umbra-privacy/sdk/solana";
import { type AltEntry } from "@umbra-privacy/sdk/constants";

import { getUserRegistrationProver } from "@umbra-privacy/sdk";
import {
  getRescueEncryptorWithNonceFromPrivateKey,
} from "@umbra-privacy/sdk/crypto/rescue";
import { getDefaultX25519GetPublicKeyAsyncFunction } from "@umbra-privacy/sdk/crypto";
import {
  getMasterViewingKeyX25519KeypairDeriver,
} from "@umbra-privacy/sdk/crypto/key-derivation";
import {
  prepareRegisterUserForAnonymousUsageV17,
  buildRegisterUserForAnonymousUsageV17Data,
} from "@umbra-privacy/sdk/registration";
import {
  prepareDirectDeposit,
  buildDirectDepositData,
  getNetworkBalanceIntoSelfBurnableStealthPoolNoteWithEncryptedAddressGeneratorFunction,
} from "@umbra-privacy/sdk/deposit";
import { getHardcodedCreateUtxoProtocolFeeProvider } from "@umbra-privacy/sdk/fee-provider";
import { getCreateStealthPoolNoteFromNetworkBalanceWithEncryptedAddressProver } from "@umbra-privacy/sdk/zk-prover";
import {
  assertU8,
  assertU64,
  assertU128,
  assertMicroLamportsPerAcu,
  assertX25519PublicKey,
  assertOptionalData32,
  assertRescueCipherEncryptionNonce,
  createRescueCipherPlaintext,
  type U8,
  type U64,
  type U128,
  type MicroLamportsPerAcu,
  type X25519PublicKey,
  type OptionalData32,
  type RescueCipherEncryptionNonce,
  type RescueCipherPlaintext,
} from "@umbra-privacy/sdk/types";

import {
  buildTestClient,
  type TestClient,
  UMBRA_PROGRAM_ID,
  DUMMY_PROGRAM_ID,
  addrBytes,
} from "./setup.js";

import {
  buildInitialiseVault,
  buildLoadEABuffer,
  buildQueueAnonymousRegistration,
  buildQueueDepositIntoNewNetwork,
  buildQueueDepositIntoExistingNetwork,
  buildQueueEADeposit,
  type AnonymousRegistrationArgs,
  type AnonymousRegistrationAccounts,
  type DepositNewNetworkArgs,
  type DepositNewNetworkAccounts,
  type DepositExistingNetworkArgs,
  type DepositExistingNetworkAccounts,
  type LoadEABufferArgs,
  type LoadEABufferAccounts,
  type QueueEAArgs,
  type QueueEAAccounts,
} from "./dummy-ixs.js";

import {
  deriveAta,
  buildCreateAtaIdempotent,
  buildSplTransfer,
} from "./spl-token.js";

const SYSTEM_PROGRAM = address("11111111111111111111111111111111");
const CLOCK_SYSVAR = address("SysvarC1ock11111111111111111111111111111111");

// Test mint — devnet legacy SPL Token (from protocol-config/init/init.devnet.json).
const TEST_MINT = address("4oG4sjmopf5MzvTHLE8rpVJ2uyczxfsw2K84SUTpNDx7");
// Base units to deposit (step 3) and later deduct (step 4). Step 4 draws
// from the network balance created by step 3, so they must match.
const TEST_DEPOSIT_AMOUNT = 1000n;

// =============================================================================
// SHARED FIXTURE
// =============================================================================

let tc: TestClient;

beforeAll(async () => {
  tc = await buildTestClient();
  console.log(`[setup] fee_payer:     ${tc.feePayer.address}`);
  console.log(`[setup] vault PDA:     ${tc.vault.address}  (bump ${tc.vault.bump})`);
  console.log(`[setup] ephemeral K:   ${tc.ephemeralKeypair.address}`);
  console.log(`[setup] umbra program: ${UMBRA_PROGRAM_ID}`);
  console.log(`[setup] dummy program: ${DUMMY_PROGRAM_ID}`);

  const acct = await tc.rpc.getAccountInfo(DUMMY_PROGRAM_ID, { encoding: "base64" }).send();
  if (!acct.value) {
    throw new Error(
      `Dummy program ${DUMMY_PROGRAM_ID} not deployed on devnet. ` +
        `Run: solana program deploy /tmp/dummy-program/target/deploy/dummy_program.so ` +
        `--keypair /tmp/dummy-program/target/deploy/dummy_program-keypair.json --url devnet`,
    );
  }

  const bal = await tc.rpc.getBalance(tc.feePayer.address).send();
  console.log(`[setup] fee_payer SOL: ${Number(bal.value) / 1e9}`);
  if (Number(bal.value) < 1e8) {
    console.warn("[setup] WARNING: low SOL balance — txs may fail. Airdrop on devnet.");
  }
});

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Splice the actual `TransactionSigner` into the matching slots of an
 * already-built `Instruction`. The builders in `dummy-ixs.ts` emit bare
 * `AccountMeta`s (address + role only) because they don't know about any
 * specific keypair; this helper attaches the signer references so
 * `signTransactionMessageWithSigners` can collect and use them.
 */
function attachSigners(
  ix: Instruction,
  signers: ReadonlyArray<TransactionSigner>,
): Instruction {
  const lookup = new Map<string, TransactionSigner>();
  for (const s of signers) lookup.set(s.address, s);
  const updated = ix.accounts?.map((a) => {
    if (!("address" in a)) return a;
    const sig = lookup.get(a.address);
    if (sig === undefined) return a;
    if (!isSignerRole(a.role)) return a;
    return { ...a, signer: sig };
  });
  return { ...ix, accounts: updated } as Instruction;
}

async function sendIxs(
  ixs: ReadonlyArray<Instruction>,
  altEntry?: AltEntry,
): Promise<string> {
  const { value: latestBlockhash } = await tc.rpc.getLatestBlockhash().send();
  const baseMessage = pipe(
    createTransactionMessage({ version: 0 }),
    (m) => setTransactionMessageFeePayer(tc.feePayer.address, m),
    (m) => setTransactionMessageLifetimeUsingBlockhash(latestBlockhash, m),
    (m) => appendTransactionMessageInstructions(ixs, m),
  );
  // Apply ALT compression if provided — without this the registration tx
  // (step 2) exceeds the 1232-byte limit on devnet.
  const tx = altEntry === undefined
    ? baseMessage
    : compressTransactionMessageUsingAddressLookupTables(
        baseMessage,
        buildAltAddressesRecord(altEntry),
      );
  const signed = await signTransactionMessageWithSigners(tx);
  // `signTransactionMessageWithSigners` widens `lifetimeConstraint` to
  // `blockhash | durable-nonce`; we always use blockhash here, so narrow
  // the type before handing to `sendAndConfirmTransactionFactory` (which
  // only takes blockhash-lifetime txs).
  assertIsTransactionWithBlockhashLifetime(signed);
  const sig = getSignatureFromTransaction(signed);
  const send = sendAndConfirmTransactionFactory({
    rpc: tc.rpc,
    rpcSubscriptions: tc.rpcSubscriptions,
  });
  await send(signed, { commitment: "confirmed" });
  return sig;
}

/** Look up the pre-baked ALT for an Arcium instruction on the current network. */
function altFor(instructionName: string, clusterOffset: number): AltEntry {
  const entry = lookupAltEntry({
    addressLookupTables: tc.client.networkConfig.addressLookupTables,
    clusterOffset,
    instructionName,
  });
  if (entry === undefined) {
    throw new Error(
      `[alt] No ALT entry for instructionName="${instructionName}" ` +
        `clusterOffset=${clusterOffset}. Run the ALT-generation step in ts-tooling.`,
    );
  }
  return entry;
}

/** Anchor discriminator for an ix name from the dummy program IDL. */
async function loadIxDisc(name: string): Promise<Uint8Array> {
  const { readFileSync } = await import("node:fs");
  const { join, dirname } = await import("node:path");
  const { fileURLToPath } = await import("node:url");
  const here = dirname(fileURLToPath(import.meta.url));
  const idl = JSON.parse(
    readFileSync(join(here, "../target/idl/dummy_program.json"), "utf-8"),
  );
  const ix = idl.instructions.find((i: { name: string }) => i.name === name);
  return new Uint8Array(ix.discriminator);
}

// ─── Branded-type construction helpers ───────────────────────────────────
// The SDK exposes assertX functions; calling them on a plain bigint /
// Uint8Array narrows the value to the branded type at the type-checker
// level (no runtime change). Use these to feed plain literals into SDK
// APIs that take branded inputs, without resorting to `as` casts.

function asU8(value: bigint): U8 { assertU8(value); return value; }
function asU64(value: bigint): U64 { assertU64(value); return value; }
function asU128(value: bigint): U128 { assertU128(value); return value; }
function asMlpa(value: bigint): MicroLamportsPerAcu {
  assertMicroLamportsPerAcu(value);
  return value;
}
function asX25519Pub(value: Uint8Array): X25519PublicKey {
  assertX25519PublicKey(value);
  return value;
}
function asOptionalData32(value: Uint8Array): OptionalData32 {
  assertOptionalData32(value);
  return value;
}

/** 32 LE bytes of a U256/Bn254/Curve25519/RescueCiphertext bigint. */
function u256LeBytes(value: bigint): Uint8Array {
  const out = new Uint8Array(32);
  let v = value;
  for (let i = 0; i < 32; i++) {
    out[i] = Number(v & 0xffn);
    v >>= 8n;
  }
  return out;
}

// =============================================================================
// TEST SUITE
// =============================================================================

describe("dummy-program e2e", () => {
  // ===========================================================================
  // 1. initialise_vault
  // ===========================================================================
  it("step 1: initialise_vault (idempotent)", async () => {
    const existing = await tc.rpc.getAccountInfo(tc.vault.address).send();
    if (existing.value) {
      console.log("[step 1] vault already initialised — skipping");
      return;
    }
    const ix = buildInitialiseVault({
      payer: tc.feePayer.address,
      vault: tc.vault.address,
      systemProgram: SYSTEM_PROGRAM,
    });
    const sig = await sendIxs([attachSigners(ix, [tc.feePayer])]);
    console.log(`[step 1] initialise_vault tx: ${sig}`);
  });

  // ===========================================================================
  // 1b. Fund vault's SPL ATA from fee_payer.
  // ===========================================================================
  //
  // Step 3 (new-network deposit) ultimately does `invoke_signed` for an
  // SPL transfer from `vault_ata → token_pool_spl_ata`. The vault PDA's
  // ATA must therefore (a) exist and (b) hold at least TEST_DEPOSIT_AMOUNT
  // base units before step 3 runs. We pre-fund from fee_payer's ATA
  // (assumed to already hold the test token — get devnet faucet drops or
  // mint to your wallet beforehand).
  //
  // Idempotent: `createIdempotent` won't error if the vault ATA exists;
  // the transfer adds to whatever balance is already there.

  it("step 1b: fund vault ATA from fee_payer", async () => {
    const feePayerAta = await deriveAta({
      owner: tc.feePayer.address,
      mint: TEST_MINT,
    });
    const vaultAta = await deriveAta({
      owner: tc.vault.address,
      mint: TEST_MINT,
    });

    const feePayerAtaInfo = await tc.rpc
      .getAccountInfo(feePayerAta, { encoding: "base64" })
      .send();
    if (!feePayerAtaInfo.value) {
      throw new Error(
        `[step 1b] fee_payer (${tc.feePayer.address}) has no ATA for mint ` +
          `${TEST_MINT}. Mint or transfer some of this token to fee_payer ` +
          `first (e.g. spl-token mint or a devnet faucet drop).`,
      );
    }

    const createIx = buildCreateAtaIdempotent({
      payer: tc.feePayer.address,
      ata: vaultAta,
      owner: tc.vault.address,
      mint: TEST_MINT,
    });
    const transferIx = buildSplTransfer({
      source: feePayerAta,
      destination: vaultAta,
      authority: tc.feePayer.address,
      amount: TEST_DEPOSIT_AMOUNT,
    });

    const sig = await sendIxs([
      attachSigners(createIx, [tc.feePayer]),
      attachSigners(transferIx, [tc.feePayer]),
    ]);
    console.log(`[step 1b] vault ATA funded (${TEST_DEPOSIT_AMOUNT}n base units): ${sig}`);
    console.log(`[step 1b] vault ATA: ${vaultAta}`);
  });

  // ===========================================================================
  // 2. queue_anonymous_registration
  // ===========================================================================
  it("step 2: queue_anonymous_registration", async () => {
    // SDK prepare → returns Rescue ciphertexts, Groth16 proof, Arcium PDAs.
    // Uses client.signer.address (= vault PDA via the spoof signer) as the
    // user identity throughout.
    const zkProver = getUserRegistrationProver();
    const preparation = await prepareRegisterUserForAnonymousUsageV17(
      { client: tc.client },
      { zkProver },
    );

    // SDK build → maps preparation into named (accounts, args) bundle.
    const data = await buildRegisterUserForAnonymousUsageV17Data({
      userAddress: tc.vault.address,
      feePayerAddress: tc.feePayer.address,
      mvkProvingSigner: preparation.mvkProvingSigner,
      arciumPdas: preparation.arciumContext.arciumPdas,
      clusterOffset: preparation.arciumContext.clusterOffset,
      computationOffset: preparation.arciumContext.computationOffset,
      mpcCallbackDataOffset: preparation.arciumContext.mpcCallbackDataOffset,
      rescueEncryptionNonce: preparation.zk.rescueEncryptionNonce,
      rescueEncryptedMasterViewingKey: preparation.zk.rescueEncryptedMasterViewingKey,
      rescueEncryptedRandomFactorForPolynomial: preparation.zk.rescueEncryptedRandomFactorForPolynomial,
      rescueEncryptionCommitment: preparation.zk.rescueEncryptionCommitment,
      rescueEncryptionPolynomialValidator: preparation.zk.rescueEncryptionPolynomialValidator,
      userCommitment: preparation.zk.userCommitment,
      groth16ProofA: preparation.zk.groth16ProofA,
      groth16ProofB: preparation.zk.groth16ProofB,
      groth16ProofC: preparation.zk.groth16ProofC,
      randomGenerationSeed: preparation.randomGenerationSeed,
      priorityFees: asMlpa(0n),
      optionalData: asOptionalData32(preparation.optionalData),
      programAddress: UMBRA_PROGRAM_ID,
    });

    const ra = data.registerAnonymous;

    const accounts: AnonymousRegistrationAccounts = {
      user: tc.vault.address,
      fee_payer: tc.feePayer.address,
      sign_pda_account: ra.accounts.signPdaAccount,
      mxe_account: ra.accounts.mxeAccount,
      mempool_account: ra.accounts.mempoolAccount,
      executing_pool: ra.accounts.executingPool,
      computation_account: ra.accounts.computationAccount,
      comp_def_account: ra.accounts.compDefAccount,
      cluster_account: ra.accounts.clusterAccount,
      pool_account: ra.accounts.poolAccount,
      clock_account: ra.accounts.clockAccount,
      system_program: SYSTEM_PROGRAM,
      arcium_program: ra.accounts.arciumProgram,
      user_account: ra.accounts.userAccount,
      zero_knowledge_verifying_key: ra.accounts.zeroKnowledgeVerifyingKey,
      protocol_config: ra.accounts.protocolConfig,
      x25519_proving_signer_for_master_viewing_key: preparation.mvkProvingSigner.address,
      computation_data: ra.accounts.computationData,
      vault: tc.vault.address,
    };

    const args: AnonymousRegistrationArgs = {
      computation_offset: BigInt(ra.args.computationOffset),
      mpc_callback_data_offset: BigInt(ra.args.mpcCallbackDataOffset),
      rescue_encryption_nonce: BigInt(ra.args.rescueEncryptionNonce),
      rescue_encrypted_master_viewing_key: ra.args.rescueEncryptedMasterViewingKey,
      rescue_encrypted_random_factor_for_polynomial: ra.args.rescueEncryptedRandomFactorForPolynomial,
      rescue_encryption_commitment: ra.args.rescueEncryptionCommitment,
      rescue_encryption_polynomial_validator: ra.args.rescueEncryptionPolynomialValidator,
      user_commitment: ra.args.userCommitment,
      groth16_proof_a: ra.args.groth16ProofA,
      groth16_proof_b: ra.args.groth16ProofB,
      groth16_proof_c: ra.args.groth16ProofC,
      random_generation_seed: ra.args.randomGenerationSeed,
      priority_fees: BigInt(ra.args.priorityFees),
      optional_data: ra.args.optionalData,
    };

    const ix = buildQueueAnonymousRegistration({ accounts, args });
    // ALT keyed on the umbra-side ix name (the dummy program is a thin
    // forwarder — same accounts under the hood, same ALT applies).
    const alt = altFor(
      "register_user_for_anonymous_usage_v17",
      preparation.arciumContext.clusterOffset,
    );
    // The umbra ix's ZK verification + Arcium queuing consume ~1.4M CU.
    // Default tx limit is 200K — must raise via ComputeBudgetProgram.
    const cuLimitIx = createSetComputeUnitLimitInstruction(1_400_000);
    const sig = await sendIxs(
      [cuLimitIx, attachSigners(ix, [tc.feePayer, preparation.mvkProvingSigner])],
      alt,
    );
    console.log(`[step 2] queue_anonymous_registration tx: ${sig}`);
    console.log(
      `[step 2] computation_account ${ra.accounts.computationAccount} — ` +
        `callback fires when MPC completes (mvk registration finalised)`,
    );
  });

  // ===========================================================================
  // 3. queue_deposit_into_{new,existing}_network_balance
  // ===========================================================================
  // Handles both variants — SDK auto-selects based on on-chain state. First
  // run after step 2: NewMxeBalance (creates the ETA). Subsequent runs:
  // ExistingMxeBalance (tops up the network balance for more step-4 draws).
  it("step 3: queue_deposit_into_network_balance", async () => {
    // Vault ATA was funded in step 1b. To top up multiple times, fund vault
    // ATA externally with more of TEST_MINT before re-running.
    const mint = TEST_MINT;
    const transferAmount = TEST_DEPOSIT_AMOUNT;

    const preparation = await prepareDirectDeposit(
      {
        destinationAddress: tc.vault.address,
        mint,
        transferAmount: asU64(transferAmount),
        optionalData: asOptionalData32(new Uint8Array(32)),
        accountInfoCommitment: "confirmed",
        epochInfoCommitment: "confirmed",
        microLamportsPerAcu: asMlpa(0n),
      },
      {
        client: tc.client,
        accountInfoProvider: tc.client.accountInfoProvider,
        getEpochInfo: tc.client.epochInfoProvider,
      },
    );

    console.log(
      `[step 3] variant: ${preparation.variant}  ` +
        `ETA: ${preparation.etaPda}  user: ${preparation.encryptedUserAccountPda}`,
    );

    if (preparation.variant !== "NewMxeBalance" && preparation.variant !== "ExistingMxeBalance") {
      throw new Error(
        `[step 3] only Mxe variants supported (got ${preparation.variant}). ` +
          `Shared variants would mean the token X25519 key was registered, which ` +
          `our test flow never does.`,
      );
    }

    // Build via codama — same call works for both variants; the returned
    // `queue.accounts` shape differs (NewMxe has `receiverUserAccount` +
    // `randomGenerationSeed`; ExistingMxe drops both).
    const built = await buildDirectDepositData(
      {
        signerAddress: tc.vault.address,
        feePayerAddress: tc.feePayer.address,
        programId: UMBRA_PROGRAM_ID,
      },
      preparation,
    );

    const ba = built.queue.accounts;
    const bargs = built.queue.args;
    const cuLimitIx = createSetComputeUnitLimitInstruction(1_200_000);

    if (preparation.variant === "NewMxeBalance") {
      if (ba.receiverUserAccount === undefined) {
        throw new Error("[step 3] NewMxeBalance must include receiverUserAccount");
      }
      if (bargs.randomGenerationSeed === undefined) {
        throw new Error("[step 3] NewMxeBalance must include randomGenerationSeed");
      }

      const accounts: DepositNewNetworkAccounts = {
        depositor_address: tc.vault.address,
        fee_payer: tc.feePayer.address,
        sign_pda_account: ba.signPdaAccount,
        mxe_account: ba.mxeAccount,
        mempool_account: ba.mempoolAccount,
        executing_pool: ba.executingPool,
        computation_account: ba.computationAccount,
        comp_def_account: ba.compDefAccount,
        cluster_account: ba.clusterAccount,
        pool_account: ba.poolAccount,
        clock_account: ba.clockAccount,
        system_program: SYSTEM_PROGRAM,
        arcium_program: ba.arciumProgram,
        depositor_spl_ata: ba.depositorSplAta,
        receiver_address: tc.vault.address,
        receiver_token_account: ba.receiverTokenAccount,
        receiver_user_account: ba.receiverUserAccount,
        fee_schedule: ba.feeSchedule,
        fee_vault: ba.feeVault,
        protocol_config: ba.protocolConfig,
        token_pool: ba.tokenPool,
        token_pool_spl_ata: ba.tokenPoolSplAta,
        mint: ba.mint,
        token_program: ba.tokenProgram,
        computation_data: ba.computationData,
        associated_token_program: ba.associatedTokenProgram,
        initiator: tc.vault.address,
        vault: tc.vault.address,
      };

      const args: DepositNewNetworkArgs = {
        computation_offset: BigInt(bargs.computationOffset),
        fee_vault_offset: BigInt(bargs.feeVaultOffset),
        mpc_callback_data_offset: BigInt(bargs.mpcCallbackDataOffset),
        transfer_amount: BigInt(bargs.transferAmount),
        deposit_amount: BigInt(bargs.depositAmount),
        priority_fees: BigInt(bargs.priorityFees),
        optional_data: new Uint8Array(bargs.optionalData),
        random_generation_seed: bargs.randomGenerationSeed,
        destination_discriminator: bargs.destinationDiscriminator,
        destination_program: bargs.destinationProgram,
        cpi_account_1: bargs.cpiAccount1,
      };

      const ix = buildQueueDepositIntoNewNetwork({ accounts, args });
      const alt = altFor(
        "deposit_from_public_balance_into_new_network_balance_v17",
        preparation.clusterOffset,
      );
      const sig = await sendIxs([cuLimitIx, attachSigners(ix, [tc.feePayer])], alt);
      console.log(`[step 3] queue_deposit_into_new_network_balance tx: ${sig}`);
    } else {
      // ExistingMxeBalance — tops up the network balance.
      const accounts: DepositExistingNetworkAccounts = {
        depositor_address: tc.vault.address,
        fee_payer: tc.feePayer.address,
        sign_pda_account: ba.signPdaAccount,
        mxe_account: ba.mxeAccount,
        mempool_account: ba.mempoolAccount,
        executing_pool: ba.executingPool,
        computation_account: ba.computationAccount,
        comp_def_account: ba.compDefAccount,
        cluster_account: ba.clusterAccount,
        pool_account: ba.poolAccount,
        clock_account: ba.clockAccount,
        system_program: SYSTEM_PROGRAM,
        arcium_program: ba.arciumProgram,
        depositor_spl_ata: ba.depositorSplAta,
        receiver_address: tc.vault.address,
        receiver_token_account: ba.receiverTokenAccount,
        fee_schedule: ba.feeSchedule,
        fee_vault: ba.feeVault,
        protocol_config: ba.protocolConfig,
        token_pool: ba.tokenPool,
        token_pool_spl_ata: ba.tokenPoolSplAta,
        mint: ba.mint,
        token_program: ba.tokenProgram,
        computation_data: ba.computationData,
        associated_token_program: ba.associatedTokenProgram,
        initiator: tc.vault.address,
        vault: tc.vault.address,
      };

      const args: DepositExistingNetworkArgs = {
        computation_offset: BigInt(bargs.computationOffset),
        fee_vault_offset: BigInt(bargs.feeVaultOffset),
        mpc_callback_data_offset: BigInt(bargs.mpcCallbackDataOffset),
        transfer_amount: BigInt(bargs.transferAmount),
        deposit_amount: BigInt(bargs.depositAmount),
        priority_fees: BigInt(bargs.priorityFees),
        optional_data: new Uint8Array(bargs.optionalData),
        destination_discriminator: bargs.destinationDiscriminator,
        destination_program: bargs.destinationProgram,
        cpi_account_1: bargs.cpiAccount1,
      };

      const ix = buildQueueDepositIntoExistingNetwork({ accounts, args });
      const alt = altFor(
        "deposit_from_public_balance_into_existing_network_balance_v17",
        preparation.clusterOffset,
      );
      const sig = await sendIxs([cuLimitIx, attachSigners(ix, [tc.feePayer])], alt);
      console.log(`[step 3] queue_deposit_into_existing_network_balance tx: ${sig}`);
    }
  });

  // ===========================================================================
  // 4. EA deposit: load buffer + queue
  // ===========================================================================
  it("step 4: load + queue encrypted-address deposit (self)", async () => {
    const mint = TEST_MINT;
    // Real X25519 keypair for the observer — random bytes don't survive
    // Arcium's ECDH derivation and cause the MPC to abort. Use the SDK's
    // default X25519 getPublicKey (noble/curves) to derive a valid point
    // from a fresh random scalar.
    const observerX25519PrivateKey = crypto.getRandomValues(new Uint8Array(32));
    const getX25519Pubkey = getDefaultX25519GetPublicKeyAsyncFunction();
    const observerOutputX25519PublicKey = await getX25519Pubkey(observerX25519PrivateKey);
    const masterSeed = await tc.client.masterSeed.getMasterSeed();
    const destinationDiscriminator = await loadIxDisc(
      "on_encrypted_address_deposit_complete",
    );

    const generate = getNetworkBalanceIntoSelfBurnableStealthPoolNoteWithEncryptedAddressGeneratorFunction({
      client: tc.client,
      zkProver: getCreateStealthPoolNoteFromNetworkBalanceWithEncryptedAddressProver(),
      protocolFeeProvider: getHardcodedCreateUtxoProtocolFeeProvider(),
    });

    const data = await generate({
      depositor: tc.vault.address,
      feePayer: tc.feePayer.address,
      initiator: tc.vault.address,
      mint,
      recipientAddress: tc.vault.address,
      masterSeed,
      generationIndex: asU128(0n),
      observerOutputX25519PublicKey: asX25519Pub(observerOutputX25519PublicKey),
      amountToDeduct: asU64(TEST_DEPOSIT_AMOUNT),
      insertionTimestamp: asU64(BigInt(Math.floor(Date.now() / 1000))),
      // Enable observer-CPI dispatch — the dummy program's
      // `on_encrypted_address_deposit_complete` callback receives the
      // amount_to_deduct encrypted to `observerOutputX25519PublicKey`
      // (derived above from a proper X25519 scalar via noble/curves).
      dispatchObserverCpi: asU8(1n),
      destinationProgram: DUMMY_PROGRAM_ID,
      destinationDiscriminator,
      // User asked for "something random" — vault works as a benign sentinel.
      cpiAccount1: tc.vault.address,
      priorityFees: asU64(0n),
    });

    console.log(`[step 4] buffer PDA: ${data.populateBuffer.accounts.stealthPoolDepositWithEncryptedAddressInputBuffer}`);
    console.log(`[step 4] computation_account: ${data.queue.accounts.computationAccount}`);

    // ── Load buffer (one tx) ──────────────────────────────────────────────
    const pb = data.populateBuffer.args;

    const loadAccounts: LoadEABufferAccounts = {
      fee_payer: tc.feePayer.address,
      stealth_pool_deposit_with_encrypted_address_input_buffer:
        data.populateBuffer.accounts.stealthPoolDepositWithEncryptedAddressInputBuffer,
      system_program: SYSTEM_PROGRAM,
      vault: tc.vault.address,
    };

    // Buffer args: SDK returns the rescue ciphertexts as bigints
    // (Curve25519FieldElement-branded). Convert to 32 LE bytes for the
    // on-chain wire shape.
    const rescueLowBytes = u256LeBytes(pb.rescueEncryptedAddressLow);
    const rescueHighBytes = u256LeBytes(pb.rescueEncryptedAddressHigh);

    // ── Source channel — properly encrypted (was duplicating before) ────
    //
    // The MPC's `Enc<Shared, (AddressLow, AddressHigh)>` decrypts using
    // counter-mode at lanes [0, 1] of a fresh keystream block. We encrypt
    // the recipient address (= vault PDA, same as sender for self-deposit)
    // as a 2-element batch with a fresh nonce. Using a different nonce
    // from the rescue channel keeps the keystream blocks distinct (good
    // hygiene; same nonce + same plaintext + lanes 0/1 would also work,
    // but reusing a (key, nonce) pair across distinct ciphertext batches
    // leaks the keystream by xor-cancellation if any plaintext repeats).
    const senderKeypairDeriver = getMasterViewingKeyX25519KeypairDeriver({ client: tc.client });
    const senderKeypair = await senderKeypairDeriver();
    const senderX25519PrivateKey = senderKeypair.x25519Keypair.privateKey;

    // Split recipient address (vault) into two 16-byte halves as u128 LE.
    const recipientBytes = addrBytes(tc.vault.address);
    const recipientLow: bigint = (() => {
      let v = 0n;
      for (let i = 15; i >= 0; i--) v = (v << 8n) | BigInt(recipientBytes[i]);
      return v;
    })();
    const recipientHigh: bigint = (() => {
      let v = 0n;
      for (let i = 31; i >= 16; i--) v = (v << 8n) | BigInt(recipientBytes[i]);
      return v;
    })();

    const sourceEncryptor = getRescueEncryptorWithNonceFromPrivateKey({
      privateKey: senderX25519PrivateKey,
      umbraX25519PublicKey: tc.client.networkConfig.mxePubkey,
    });

    // Brand recipient halves as U128.
    assertU128(recipientLow);
    assertU128(recipientHigh);

    // Fresh 16-byte random nonce → u128 LE → branded RescueCipherEncryptionNonce.
    const sourceNonceRaw = crypto.getRandomValues(new Uint8Array(16));
    let sourceNonceBigint = 0n;
    for (let i = 15; i >= 0; i--) {
      sourceNonceBigint = (sourceNonceBigint << 8n) | BigInt(sourceNonceRaw[i]);
    }
    assertRescueCipherEncryptionNonce(sourceNonceBigint);
    const sourceNonce: RescueCipherEncryptionNonce = sourceNonceBigint;

    const sourcePlaintexts: RescueCipherPlaintext[] = [
      createRescueCipherPlaintext({ value: recipientLow }),
      createRescueCipherPlaintext({ value: recipientHigh }),
    ];
    const sourceCiphertexts = await sourceEncryptor(sourcePlaintexts, sourceNonce);
    const sourceLowBytes = u256LeBytes(sourceCiphertexts[0]);
    const sourceHighBytes = u256LeBytes(sourceCiphertexts[1]);

    console.log(`[step 4] source channel encrypted with nonce 0x${sourceNonce.toString(16)}`);

    const loadArgs: LoadEABufferArgs = {
      offset: BigInt(pb.offset),
      rescue_encryption_public_key: pb.rescueEncryptionPublicKey,
      aes_encryption_public_key: pb.aesEncryptionPublicKey,
      rescue_encryption_nonce: BigInt(pb.rescueEncryptionNonce),
      rescue_encrypted_address_low: rescueLowBytes,
      rescue_encrypted_address_high: rescueHighBytes,
      rescue_encrypted_random_factor: u256LeBytes(pb.rescueEncryptedRandomFactor),
      // Source channel — properly encrypted (sender's x25519 key, fresh nonce).
      encrypted_address_source_pubkey: pb.rescueEncryptionPublicKey,
      encrypted_address_source_nonce: BigInt(sourceNonce),
      encrypted_address_source_ciphertext_low: sourceLowBytes,
      encrypted_address_source_ciphertext_high: sourceHighBytes,
      encryption_validation_polynomial: u256LeBytes(pb.encryptionValidationPolynomial),
      rescue_encryption_fiat_shamir_commitment: u256LeBytes(pb.rescueEncryptionFiatShamirCommitment),
      groth16_proof_a: pb.groth16ProofA,
      groth16_proof_b: pb.groth16ProofB,
      groth16_proof_c: pb.groth16ProofC,
      aes_encrypted_data: pb.aesEncryptedData,
      optional_data: pb.optionalData,
      destination_program: pb.destinationProgram,
      cpi_account_1: pb.cpiAccount1,
    };

    const loadIx = buildLoadEABuffer({ accounts: loadAccounts, args: loadArgs });
    const loadSig = await sendIxs([attachSigners(loadIx, [tc.feePayer])]);
    console.log(`[step 4] load buffer tx: ${loadSig}`);

    // ── Queue ix (second tx) ──────────────────────────────────────────────
    const qa = data.queue.args;
    const qaccts = data.queue.accounts;

    const queueAccounts: QueueEAAccounts = {
      depositor: qaccts.depositor,
      fee_payer: tc.feePayer.address,
      sign_pda_account: qaccts.signPdaAccount,
      mxe_account: qaccts.mxeAccount,
      mempool_account: qaccts.mempoolAccount,
      executing_pool: qaccts.executingPool,
      computation_account: qaccts.computationAccount,
      comp_def_account: qaccts.compDefAccount,
      cluster_account: qaccts.clusterAccount,
      pool_account: qaccts.poolAccount,
      clock_account: qaccts.clockAccount,
      system_program: SYSTEM_PROGRAM,
      arcium_program: qaccts.arciumProgram,
      stealth_pool_deposit_with_encrypted_address_input_buffer:
        qaccts.stealthPoolDepositWithEncryptedAddressInputBuffer,
      computation_data: qaccts.computationData,
      depositor_user_account: qaccts.depositorUserAccount,
      depositor_token_account: qaccts.depositorTokenAccount,
      fee_schedule: qaccts.protocolFeeSchedule,
      fee_vault: qaccts.feeVault,
      stealth_pool: qaccts.stealthPool,
      token_pool: qaccts.tokenPool,
      mint: qaccts.mint,
      token_program: qaccts.tokenProgram,
      token_pool_spl_ata: qaccts.tokenPoolSplAta,
      protocol_config: qaccts.protocolConfig,
      zero_knowledge_verifying_key: qaccts.zeroKnowledgeVerifyingKey,
      clock_sysvar_account: qaccts.clockSysvarAccount ?? CLOCK_SYSVAR,
      initiator: qaccts.initiator,
      vault: tc.vault.address,
    };

    const queueArgs: QueueEAArgs = {
      computation_offset: BigInt(qa.computationOffset),
      fee_vault_offset: BigInt(qa.feeVaultOffset),
      input_buffer_offset: BigInt(qa.inputBufferOffset),
      mpc_callback_data_offset: BigInt(qa.mpcCallbackDataOffset),
      amount_to_deduct: BigInt(qa.amountToDeduct),
      // Bn254/Curve25519 field-element bigints → 32 LE bytes.
      insertion_h2_commitment: u256LeBytes(qa.insertionH2Commitment),
      insertion_timestamp: BigInt(qa.insertionTimestamp),
      linker_encryption_0: u256LeBytes(qa.linkerEncryption0),
      linker_encryption_1: u256LeBytes(qa.linkerEncryption1),
      keystream_commitment_0: u256LeBytes(qa.keystreamCommitment0),
      keystream_commitment_1: u256LeBytes(qa.keystreamCommitment1),
      dispatch_observer_cpi: Number(qa.dispatchObserverCpi),
      observer_output_x25519_public_key: qa.observerOutputX25519PublicKey,
      destination_discriminator: qa.destinationDiscriminator,
      priority_fees: BigInt(qa.priorityFees),
    };

    const queueIx = buildQueueEADeposit({ accounts: queueAccounts, args: queueArgs });
    const cuLimitIx = createSetComputeUnitLimitInstruction(1_400_000);
    // We don't know clusterOffset from the EA generate() output directly; the
    // SDK encodes it inside the comp-def PDA derivation. Pull it off the MXE
    // account on-chain — same source the SDK uses.
    const { extractClusterOffsetFromMxeAccount } = await import("@umbra-privacy/sdk/arcium");
    const mxeMap = await tc.client.accountInfoProvider(
      [tc.client.networkConfig.mxeAccountAddress],
      { commitment: "confirmed" },
    );
    const mxe = mxeMap.get(tc.client.networkConfig.mxeAccountAddress);
    if (mxe === undefined) throw new Error("[step 4] mxe account fetch failed");
    const clusterOffset = extractClusterOffsetFromMxeAccount(mxe);
    const alt = altFor(
      "deposit_into_stealth_pool_from_network_balance_with_encrypted_address_v17",
      clusterOffset,
    );
    const queueSig = await sendIxs(
      [cuLimitIx, attachSigners(queueIx, [tc.feePayer])],
      alt,
    );
    console.log(`[step 4] queue EA deposit tx: ${queueSig}`);
    console.log(
      `[step 4] computation_account ${qaccts.computationAccount} queued — ` +
        `callback (on_encrypted_address_deposit_complete) fires when MPC completes`,
    );
  });

  // ===========================================================================
  // 5. Claim a self-burnable UTXO back into vault's ETA via the relayer
  // ===========================================================================
  //
  // Claim flows in Umbra DO NOT go through the integrator's wrapper
  // program. They're dispatched off-chain via a relayer service that
  // signs and submits the on-chain `claim_*_v17` ix on the user's
  // behalf — by design (claims must NOT be linkable to the depositor
  // identity on-chain, so the depositor cannot be the tx signer).
  //
  // Flow:
  //   1. Scanner returns self-burnable notes (decrypted with our K).
  //   2. We pick one unclaimed UTXO.
  //   3. SDK + relayer service do the rest: build BurnRequest with a
  //      Groth16 proof of UTXO ownership, POST to relayer, relayer
  //      assembles the claim ix and submits it.
  //   4. Funds land back in vault PDA's ETA (encrypted balance ↑).
  //
  // The dummy program is not touched. The vault PDA is the receiver
  // address (because client.signer.address = vault PDA) but never
  // signs anything — `receiver_address` is non-signer in the claim ix.

  it("step 5: claim a UTXO back into vault's ETA via relayer", async () => {
    // ── Dependencies ─────────────────────────────────────────────────────
    const {
      getBurnableStealthPoolNoteScannerFunction,
      getSelfBurnableStealthPoolNoteIntoETABurnerFunction,
    } = await import("@umbra-privacy/sdk/burn");
    const { getClaimReceiverClaimableUtxoIntoEncryptedBalanceProver } = await import(
      "@umbra-privacy/sdk/zk-prover"
    );
    const { getUmbraRelayer } = await import("@umbra-privacy/sdk/relayer");
    const { getBatchMerkleProofFetcher } = await import("@umbra-privacy/sdk/indexer");

    const RELAYER_URL =
      process.env.RELAYER_URL ?? "https://relayer.api-devnet.umbraprivacy.com";

    // ── Scan UTXOs the persisted K can decrypt ───────────────────────────
    const scan = getBurnableStealthPoolNoteScannerFunction({ client: tc.client });
    const result = await scan();
    const selfNotes = [
      ...result.networkBalanceToStealthPoolSelfBurnableWithEncryptedAddress,
      ...result.etaToStealthPoolSelfBurnable,
      ...result.ataToStealthPoolSelfBurnable,
    ];
    console.log(`[step 5] decrypted self-burnable notes: ${selfNotes.length}`);
    if (selfNotes.length === 0) {
      throw new Error(
        "[step 5] no self-burnable notes to claim. Run step 4 first and wait " +
          "for the MPC callback + indexer to catch up.",
      );
    }

    // Pick the most-recently-inserted note (highest leaf index). Earlier
    // EA-self insertions from before the modifiedGenerationIndex fix
    // are still in the indexer but will fail the burn ZK proof's merkle
    // verifier — only post-fix insertions can actually be claimed.
    selfNotes.sort((a, b) => Number(BigInt(b.insertionIndex) - BigInt(a.insertionIndex)));
    const note = selfNotes[0];
    console.log(
      `[step 5] claiming note: tree=${note.treeIndex} leaf=${note.insertionIndex} ` +
        `amount=${note.amount} dest=${note.destinationAddress}`,
    );

    // ── Wire up the burn factory ─────────────────────────────────────────
    const zkProver = getClaimReceiverClaimableUtxoIntoEncryptedBalanceProver();
    const umbraRelayer = getUmbraRelayer({ apiEndpoint: RELAYER_URL });
    console.log(`[step 5] relayer address: ${await umbraRelayer.getRelayerAddress()}`);

    const fetchBatchMerkleProof = getBatchMerkleProofFetcher({
      apiEndpoint: process.env.INDEXER_API_ENDPOINT ??
        "https://utxo-indexer.api-devnet.umbraprivacy.com",
    });

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
      },
    );

    // ── Dispatch ─────────────────────────────────────────────────────────
    // Narrow the note's kind — the scanner buckets it into the self-burnable
    // arrays but the static type still has the unionized `kind` field. The
    // bucket is the discriminator, so we narrow with a runtime guard.
    if (note.kind !== "self-burnable") {
      throw new Error("[step 5] expected self-burnable bucket");
    }
    const selfNote: typeof note & { kind: "self-burnable" } = { ...note, kind: "self-burnable" };
    const burnResult = await burn([selfNote]);
    console.log(`[step 5] burn result:`, JSON.stringify(burnResult, (_k, v) =>
      typeof v === "bigint" ? v.toString() : v,
    ).slice(0, 500));
    console.log(
      `[step 5] claim dispatched — relayer will sign + submit the on-chain ` +
        `claim_into_*_v17 ix. Funds will land in vault's ETA when the MPC callback fires.`,
    );
  });
});
