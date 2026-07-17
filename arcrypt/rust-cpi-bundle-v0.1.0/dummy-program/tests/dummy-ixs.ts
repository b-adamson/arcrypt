/**
 * Builders for the dummy program's instructions. Each helper:
 *   1. Computes the 8-byte anchor discriminator from the IDL's recorded value.
 *   2. Borsh-encodes the args in the on-chain declaration order.
 *   3. Assembles the `AccountMeta` list (positions matter).
 *
 * We don't use @coral-xyz/anchor here because its TS resolver pulls a
 * solana-web3 version incompatible with @solana/kit. Hand-rolling stays in the
 * one toolchain we already have.
 */
import { readFileSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

import {
  type AccountMeta,
  AccountRole,
  type Address,
  type Instruction,
} from "@solana/kit";

import { BorshWriter } from "./borsh.js";
import { UMBRA_PROGRAM_ID, DUMMY_PROGRAM_ID } from "./setup.js";

// =============================================================================
// IDL loader — pull discriminators from the anchor-emitted IDL
// =============================================================================

const __dirname = dirname(fileURLToPath(import.meta.url));
const IDL_PATH = join(__dirname, "../target/idl/dummy_program.json");

interface AnchorIdl {
  instructions: Array<{ name: string; discriminator: number[] }>;
}

const idl: AnchorIdl = JSON.parse(readFileSync(IDL_PATH, "utf-8"));

function disc(ixName: string): Uint8Array {
  const found = idl.instructions.find((i) => i.name === ixName);
  if (!found) throw new Error(`ix ${ixName} not in IDL`);
  return new Uint8Array(found.discriminator);
}

// =============================================================================
// AccountMeta helpers
// =============================================================================

function ro(addr: Address): AccountMeta {
  return { address: addr, role: AccountRole.READONLY };
}
function rw(addr: Address): AccountMeta {
  return { address: addr, role: AccountRole.WRITABLE };
}
function signer(addr: Address): AccountMeta {
  return { address: addr, role: AccountRole.READONLY_SIGNER };
}
function rwSigner(addr: Address): AccountMeta {
  return { address: addr, role: AccountRole.WRITABLE_SIGNER };
}

// =============================================================================
// initialise_vault
// =============================================================================

export function buildInitialiseVault(args: {
  payer: Address;
  vault: Address;
  systemProgram: Address;
}): Instruction {
  return {
    programAddress: DUMMY_PROGRAM_ID,
    accounts: [
      rwSigner(args.payer),
      rw(args.vault),
      ro(args.systemProgram),
    ],
    data: disc("initialise_vault"),
  };
}

// =============================================================================
// queue_anonymous_registration
// =============================================================================
//
// Macro-injected accounts (in schema order):
//   user (UncheckedAccount, the Vault PDA — signed via invoke_signed inside the
//        program; ext tx provides it as ReadOnly)
//   fee_payer (signer)
//   sign_pda_account
//   mxe_account
//   mempool_account (mut)
//   executing_pool (mut)
//   computation_account (mut)
//   comp_def_account
//   cluster_account (mut)
//   pool_account (mut)
//   clock_account (mut)
//   system_program
//   arcium_program
//   user_account (mut)
//   zero_knowledge_verifying_key
//   protocol_config
//   x25519_proving_signer_for_master_viewing_key (signer)
//   computation_data (mut)
//   umbra_program (trailing — the real Umbra program ID)
//   vault (user-side, the typed Vault PDA — same as `user` above)

export interface AnonymousRegistrationArgs {
  computation_offset: bigint;
  mpc_callback_data_offset: bigint;
  rescue_encryption_nonce: bigint;
  rescue_encrypted_master_viewing_key: Uint8Array; // [u8; 32]
  rescue_encrypted_random_factor_for_polynomial: Uint8Array;
  rescue_encryption_commitment: Uint8Array;
  rescue_encryption_polynomial_validator: Uint8Array;
  user_commitment: Uint8Array;
  groth16_proof_a: Uint8Array; // [u8; 64]
  groth16_proof_b: Uint8Array; // [u8; 128]
  groth16_proof_c: Uint8Array; // [u8; 64]
  random_generation_seed: Uint8Array; // [u8; 32]
  priority_fees: bigint;
  optional_data: Uint8Array; // [u8; 32]
}

export interface AnonymousRegistrationAccounts {
  user: Address; // vault PDA
  fee_payer: Address;
  sign_pda_account: Address;
  mxe_account: Address;
  mempool_account: Address;
  executing_pool: Address;
  computation_account: Address;
  comp_def_account: Address;
  cluster_account: Address;
  pool_account: Address;
  clock_account: Address;
  system_program: Address;
  arcium_program: Address;
  user_account: Address;
  zero_knowledge_verifying_key: Address;
  protocol_config: Address;
  x25519_proving_signer_for_master_viewing_key: Address;
  computation_data: Address;
  vault: Address;
}

export function buildQueueAnonymousRegistration(args: {
  accounts: AnonymousRegistrationAccounts;
  args: AnonymousRegistrationArgs;
}): Instruction {
  const a = args.accounts;
  const w = new BorshWriter();
  w.bytes(disc("queue_anonymous_registration"));
  w.u64(args.args.computation_offset);
  w.u128(args.args.mpc_callback_data_offset);
  w.u128(args.args.rescue_encryption_nonce);
  w.bytes(args.args.rescue_encrypted_master_viewing_key);
  w.bytes(args.args.rescue_encrypted_random_factor_for_polynomial);
  w.bytes(args.args.rescue_encryption_commitment);
  w.bytes(args.args.rescue_encryption_polynomial_validator);
  w.bytes(args.args.user_commitment);
  w.bytes(args.args.groth16_proof_a);
  w.bytes(args.args.groth16_proof_b);
  w.bytes(args.args.groth16_proof_c);
  w.bytes(args.args.random_generation_seed);
  w.u64(args.args.priority_fees);
  w.bytes(args.args.optional_data);

  return {
    programAddress: DUMMY_PROGRAM_ID,
    accounts: [
      // user (pda mode): umbra-side spec is writable+signer, so the macro
      // emits `#[account(mut)] UncheckedAccount` on the dummy side. The
      // outer tx must therefore mark it WRITABLE (the dummy program signs
      // for it via invoke_signed; we don't pass a real signer here).
      rw(a.user),
      rwSigner(a.fee_payer),
      rw(a.sign_pda_account),
      ro(a.mxe_account),
      rw(a.mempool_account),
      rw(a.executing_pool),
      rw(a.computation_account),
      ro(a.comp_def_account),
      rw(a.cluster_account),
      rw(a.pool_account),
      rw(a.clock_account),
      ro(a.system_program),
      ro(a.arcium_program),
      rw(a.user_account),
      ro(a.zero_knowledge_verifying_key),
      ro(a.protocol_config),
      signer(a.x25519_proving_signer_for_master_viewing_key),
      rw(a.computation_data),
      ro(UMBRA_PROGRAM_ID), // macro-appended `umbra_program` slot
      ro(a.vault),
    ],
    data: w.build(),
  };
}

// =============================================================================
// queue_deposit_into_new_network_balance
// =============================================================================

export interface DepositNewNetworkArgs {
  computation_offset: bigint;
  fee_vault_offset: bigint;
  mpc_callback_data_offset: bigint;
  transfer_amount: bigint;
  deposit_amount: bigint;
  priority_fees: bigint;
  optional_data: Uint8Array;
  random_generation_seed: Uint8Array;
  destination_discriminator: Uint8Array; // [u8; 8]
  destination_program: Address;
  cpi_account_1: Address;
}

export interface DepositNewNetworkAccounts {
  depositor_address: Address; // vault PDA
  fee_payer: Address;
  sign_pda_account: Address;
  mxe_account: Address;
  mempool_account: Address;
  executing_pool: Address;
  computation_account: Address;
  comp_def_account: Address;
  cluster_account: Address;
  pool_account: Address;
  clock_account: Address;
  system_program: Address;
  arcium_program: Address;
  depositor_spl_ata: Address;
  receiver_address: Address;
  receiver_token_account: Address;
  receiver_user_account: Address;
  fee_schedule: Address;
  fee_vault: Address;
  protocol_config: Address;
  token_pool: Address;
  token_pool_spl_ata: Address;
  mint: Address;
  token_program: Address;
  computation_data: Address;
  associated_token_program: Address;
  initiator: Address; // vault PDA (same pubkey as depositor_address)
  vault: Address;
}

export function buildQueueDepositIntoNewNetwork(args: {
  accounts: DepositNewNetworkAccounts;
  args: DepositNewNetworkArgs;
}): Instruction {
  const a = args.accounts;
  const w = new BorshWriter();
  w.bytes(disc("queue_deposit_into_new_network_balance"));
  w.u64(args.args.computation_offset);
  w.u128(args.args.fee_vault_offset);
  w.u128(args.args.mpc_callback_data_offset);
  w.u64(args.args.transfer_amount);
  w.u64(args.args.deposit_amount);
  w.u64(args.args.priority_fees);
  w.bytes(args.args.optional_data);
  w.bytes(args.args.random_generation_seed);
  w.bytes(args.args.destination_discriminator);
  w.bytes(addressToBytes(args.args.destination_program));
  w.bytes(addressToBytes(args.args.cpi_account_1));

  return {
    programAddress: DUMMY_PROGRAM_ID,
    accounts: [
      // depositor_address (pda mode): umbra side is writable+signer,
      // dummy side keeps `#[account(mut)]`. Must be WRITABLE on outer tx.
      rw(a.depositor_address),
      rwSigner(a.fee_payer),
      rw(a.sign_pda_account),
      ro(a.mxe_account),
      rw(a.mempool_account),
      rw(a.executing_pool),
      rw(a.computation_account),
      ro(a.comp_def_account),
      rw(a.cluster_account),
      rw(a.pool_account),
      rw(a.clock_account),
      ro(a.system_program),
      ro(a.arcium_program),
      rw(a.depositor_spl_ata),
      ro(a.receiver_address),
      rw(a.receiver_token_account),
      rw(a.receiver_user_account),
      ro(a.fee_schedule),
      rw(a.fee_vault),
      ro(a.protocol_config),
      ro(a.token_pool),
      rw(a.token_pool_spl_ata),
      ro(a.mint),
      ro(a.token_program),
      rw(a.computation_data),
      ro(a.associated_token_program),
      ro(a.initiator),
      ro(UMBRA_PROGRAM_ID),
      ro(a.vault),
    ],
    data: w.build(),
  };
}

// =============================================================================
// queue_deposit_into_existing_network_balance
// =============================================================================
//
// Same shape as new-network except:
//   - No `receiver_user_account` account (EUA already exists)
//   - No `random_generation_seed` arg (no `init_if_needed` to seed)

export interface DepositExistingNetworkArgs {
  computation_offset: bigint;
  fee_vault_offset: bigint;
  mpc_callback_data_offset: bigint;
  transfer_amount: bigint;
  deposit_amount: bigint;
  priority_fees: bigint;
  optional_data: Uint8Array;
  destination_discriminator: Uint8Array;
  destination_program: Address;
  cpi_account_1: Address;
}

export interface DepositExistingNetworkAccounts {
  depositor_address: Address;
  fee_payer: Address;
  sign_pda_account: Address;
  mxe_account: Address;
  mempool_account: Address;
  executing_pool: Address;
  computation_account: Address;
  comp_def_account: Address;
  cluster_account: Address;
  pool_account: Address;
  clock_account: Address;
  system_program: Address;
  arcium_program: Address;
  depositor_spl_ata: Address;
  receiver_address: Address;
  receiver_token_account: Address;
  fee_schedule: Address;
  fee_vault: Address;
  protocol_config: Address;
  token_pool: Address;
  token_pool_spl_ata: Address;
  mint: Address;
  token_program: Address;
  computation_data: Address;
  associated_token_program: Address;
  initiator: Address;
  vault: Address;
}

export function buildQueueDepositIntoExistingNetwork(args: {
  accounts: DepositExistingNetworkAccounts;
  args: DepositExistingNetworkArgs;
}): Instruction {
  const a = args.accounts;
  const w = new BorshWriter();
  w.bytes(disc("queue_deposit_into_existing_network_balance"));
  w.u64(args.args.computation_offset);
  w.u128(args.args.fee_vault_offset);
  w.u128(args.args.mpc_callback_data_offset);
  w.u64(args.args.transfer_amount);
  w.u64(args.args.deposit_amount);
  w.u64(args.args.priority_fees);
  w.bytes(args.args.optional_data);
  w.bytes(args.args.destination_discriminator);
  w.bytes(addressToBytes(args.args.destination_program));
  w.bytes(addressToBytes(args.args.cpi_account_1));

  return {
    programAddress: DUMMY_PROGRAM_ID,
    accounts: [
      rw(a.depositor_address),
      rwSigner(a.fee_payer),
      rw(a.sign_pda_account),
      ro(a.mxe_account),
      rw(a.mempool_account),
      rw(a.executing_pool),
      rw(a.computation_account),
      ro(a.comp_def_account),
      rw(a.cluster_account),
      rw(a.pool_account),
      rw(a.clock_account),
      ro(a.system_program),
      ro(a.arcium_program),
      rw(a.depositor_spl_ata),
      ro(a.receiver_address),
      rw(a.receiver_token_account),
      ro(a.fee_schedule),
      rw(a.fee_vault),
      ro(a.protocol_config),
      ro(a.token_pool),
      rw(a.token_pool_spl_ata),
      ro(a.mint),
      ro(a.token_program),
      rw(a.computation_data),
      ro(a.associated_token_program),
      ro(a.initiator),
      ro(UMBRA_PROGRAM_ID),
      ro(a.vault),
    ],
    data: w.build(),
  };
}

// =============================================================================
// load_encrypted_address_deposit_buffer  (plain ix; fee_payer is the only signer)
// =============================================================================

export interface LoadEABufferArgs {
  offset: bigint;
  rescue_encryption_public_key: Uint8Array; // [u8; 32]
  aes_encryption_public_key: Uint8Array;
  rescue_encryption_nonce: bigint; // u128
  rescue_encrypted_address_low: Uint8Array;
  rescue_encrypted_address_high: Uint8Array;
  rescue_encrypted_random_factor: Uint8Array;
  encrypted_address_source_pubkey: Uint8Array;
  encrypted_address_source_nonce: bigint;
  encrypted_address_source_ciphertext_low: Uint8Array;
  encrypted_address_source_ciphertext_high: Uint8Array;
  encryption_validation_polynomial: Uint8Array;
  rescue_encryption_fiat_shamir_commitment: Uint8Array;
  groth16_proof_a: Uint8Array; // [u8; 64]
  groth16_proof_b: Uint8Array; // [u8; 128]
  groth16_proof_c: Uint8Array; // [u8; 64]
  aes_encrypted_data: Uint8Array; // [u8; 96]
  optional_data: Uint8Array; // [u8; 32]
  destination_program: Address;
  cpi_account_1: Address;
}

export interface LoadEABufferAccounts {
  fee_payer: Address;
  stealth_pool_deposit_with_encrypted_address_input_buffer: Address;
  system_program: Address;
  vault: Address;
}

export function buildLoadEABuffer(args: {
  accounts: LoadEABufferAccounts;
  args: LoadEABufferArgs;
}): Instruction {
  const a = args.accounts;
  const w = new BorshWriter();
  w.bytes(disc("load_encrypted_address_deposit_buffer"));
  w.u128(args.args.offset);
  w.bytes(args.args.rescue_encryption_public_key);
  w.bytes(args.args.aes_encryption_public_key);
  w.u128(args.args.rescue_encryption_nonce);
  w.bytes(args.args.rescue_encrypted_address_low);
  w.bytes(args.args.rescue_encrypted_address_high);
  w.bytes(args.args.rescue_encrypted_random_factor);
  w.bytes(args.args.encrypted_address_source_pubkey);
  w.u128(args.args.encrypted_address_source_nonce);
  w.bytes(args.args.encrypted_address_source_ciphertext_low);
  w.bytes(args.args.encrypted_address_source_ciphertext_high);
  w.bytes(args.args.encryption_validation_polynomial);
  w.bytes(args.args.rescue_encryption_fiat_shamir_commitment);
  w.bytes(args.args.groth16_proof_a);
  w.bytes(args.args.groth16_proof_b);
  w.bytes(args.args.groth16_proof_c);
  w.bytes(args.args.aes_encrypted_data);
  w.bytes(args.args.optional_data);
  w.bytes(addressToBytes(args.args.destination_program));
  w.bytes(addressToBytes(args.args.cpi_account_1));

  return {
    programAddress: DUMMY_PROGRAM_ID,
    accounts: [
      rwSigner(a.fee_payer),
      rw(a.stealth_pool_deposit_with_encrypted_address_input_buffer),
      ro(a.system_program),
      ro(UMBRA_PROGRAM_ID),
      ro(a.vault),
    ],
    data: w.build(),
  };
}

// =============================================================================
// queue_encrypted_address_deposit
// =============================================================================

export interface QueueEAArgs {
  computation_offset: bigint;
  fee_vault_offset: bigint;
  input_buffer_offset: bigint;
  mpc_callback_data_offset: bigint;
  amount_to_deduct: bigint;
  insertion_h2_commitment: Uint8Array;
  insertion_timestamp: bigint;
  linker_encryption_0: Uint8Array;
  linker_encryption_1: Uint8Array;
  keystream_commitment_0: Uint8Array;
  keystream_commitment_1: Uint8Array;
  dispatch_observer_cpi: number; // u8
  observer_output_x25519_public_key: Uint8Array;
  destination_discriminator: Uint8Array; // [u8; 8]
  priority_fees: bigint;
}

export interface QueueEAAccounts {
  depositor: Address; // vault
  fee_payer: Address;
  sign_pda_account: Address;
  mxe_account: Address;
  mempool_account: Address;
  executing_pool: Address;
  computation_account: Address;
  comp_def_account: Address;
  cluster_account: Address;
  pool_account: Address;
  clock_account: Address;
  system_program: Address;
  arcium_program: Address;
  stealth_pool_deposit_with_encrypted_address_input_buffer: Address;
  computation_data: Address;
  depositor_user_account: Address;
  depositor_token_account: Address;
  fee_schedule: Address;
  fee_vault: Address;
  stealth_pool: Address;
  token_pool: Address;
  mint: Address;
  token_program: Address;
  token_pool_spl_ata: Address;
  protocol_config: Address;
  zero_knowledge_verifying_key: Address;
  clock_sysvar_account: Address;
  initiator: Address; // vault (same pubkey)
  vault: Address;
}

export function buildQueueEADeposit(args: {
  accounts: QueueEAAccounts;
  args: QueueEAArgs;
}): Instruction {
  const a = args.accounts;
  const w = new BorshWriter();
  w.bytes(disc("queue_encrypted_address_deposit"));
  w.u64(args.args.computation_offset);
  w.u128(args.args.fee_vault_offset);
  w.u128(args.args.input_buffer_offset);
  w.u128(args.args.mpc_callback_data_offset);
  w.u64(args.args.amount_to_deduct);
  w.bytes(args.args.insertion_h2_commitment);
  w.i64(args.args.insertion_timestamp);
  w.bytes(args.args.linker_encryption_0);
  w.bytes(args.args.linker_encryption_1);
  w.bytes(args.args.keystream_commitment_0);
  w.bytes(args.args.keystream_commitment_1);
  w.u8(args.args.dispatch_observer_cpi);
  w.bytes(args.args.observer_output_x25519_public_key);
  w.bytes(args.args.destination_discriminator);
  w.u64(args.args.priority_fees);

  return {
    programAddress: DUMMY_PROGRAM_ID,
    accounts: [
      // depositor (pda mode): umbra side is writable+signer, dummy side
      // keeps `#[account(mut)]`. Must be WRITABLE on outer tx.
      rw(a.depositor),
      rwSigner(a.fee_payer),
      rw(a.sign_pda_account),
      ro(a.mxe_account),
      rw(a.mempool_account),
      rw(a.executing_pool),
      rw(a.computation_account),
      ro(a.comp_def_account),
      rw(a.cluster_account),
      rw(a.pool_account),
      rw(a.clock_account),
      ro(a.system_program),
      ro(a.arcium_program),
      rw(a.stealth_pool_deposit_with_encrypted_address_input_buffer),
      rw(a.computation_data),
      ro(a.depositor_user_account),
      rw(a.depositor_token_account),
      ro(a.fee_schedule),
      rw(a.fee_vault),
      ro(a.stealth_pool),
      // token_pool is `#[account(mut)]` on the umbra side (the queue ix
      // bumps the pool's volume counter). token_pool_spl_ata is readonly
      // (only read to snapshot `pool_volume_spl` into computation_data).
      rw(a.token_pool),
      ro(a.mint),
      ro(a.token_program),
      ro(a.token_pool_spl_ata),
      ro(a.protocol_config),
      ro(a.zero_knowledge_verifying_key),
      ro(a.clock_sysvar_account),
      ro(a.initiator),
      ro(UMBRA_PROGRAM_ID),
      ro(a.vault),
    ],
    data: w.build(),
  };
}

// =============================================================================
// Address → 32 raw bytes (re-export from setup helpers)
// =============================================================================

function addressToBytes(a: Address): Uint8Array {
  // bs58 → 32 bytes. @solana/kit exposes getAddressEncoder but importing it
  // here would circularly hit setup.ts; inline a minimal base58 decoder.
  const ALPHABET =
    "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
  const BASE = 58n;
  let value = 0n;
  for (const ch of a) {
    const i = ALPHABET.indexOf(ch);
    if (i < 0) throw new Error(`bad base58 char: ${ch}`);
    value = value * BASE + BigInt(i);
  }
  const bytes = new Uint8Array(32);
  for (let i = 31; i >= 0; i--) {
    bytes[i] = Number(value & 0xffn);
    value >>= 8n;
  }
  // leading 1s = leading zero bytes
  let leadingZeros = 0;
  for (const ch of a) {
    if (ch === "1") leadingZeros++;
    else break;
  }
  if (leadingZeros > 0) {
    // already-zero leading is fine since pubkey is 32 bytes
  }
  return bytes;
}
