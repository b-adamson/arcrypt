//! Schema for `instructions/deposit_into_stealth_pool/from_encrypted_token_account/with_encrypted_address_input_buffer.rs`.
//!
//! This is the populate (init-if-needed + write) ix for the encrypted-address
//! deposit's input buffer — the buffer that the queue ix
//! `deposit_into_stealth_pool_from_network_balance_with_encrypted_address_v16`
//! consumes. It carries the heavy half of the proof payload (Groth16 a/b/c,
//! rescue/aes ciphertexts, AES UTXO data, optional_data, observer CPI
//! pubkeys).
//!
//! Plain Anchor ix (no Arcium-prefix slots): just `fee_payer` + the buffer
//! account + `system_program`.

use crate::{AccountSpec, ArgSpec};

/// Source: `anchor-program/programs/umbra/src/instructions/deposit_into_stealth_pool/from_encrypted_token_account/with_encrypted_address_input_buffer.rs`.
pub(crate) const POPULATE_STEALTH_POOL_DEPOSIT_INPUT_BUFFER: &[AccountSpec] = &[
    AccountSpec { name: "fee_payer", writable: true, signer: true },
    AccountSpec {
        name: "stealth_pool_deposit_with_encrypted_address_input_buffer",
        writable: true,
        signer: false,
    },
    AccountSpec { name: "system_program", writable: false, signer: false },
];

/// Args for the populate ix — 21 total. Order matches the codama-generated
/// `InstructionArgs` struct so the borsh wire layout aligns. The destination
/// address is split into low/high 128-bit limbs so each fits injectively in
/// `BaseField25519` (a single-element encoding would alias addresses with
/// the high bit set onto the canonical reduced form).
pub(crate) const POPULATE_STEALTH_POOL_DEPOSIT_INPUT_BUFFER_ARGS: &[ArgSpec] = args!(
    offset: AccountOffset,
    rescue_encryption_public_key: ArciumX25519PublicKey,
    aes_encryption_public_key: ArciumX25519PublicKey,
    rescue_encryption_nonce: ArciumX25519Nonce,
    rescue_encrypted_address_low: RescueCiphertext,
    rescue_encrypted_address_high: RescueCiphertext,
    rescue_encrypted_random_factor: RescueCiphertext,
    encrypted_address_source_pubkey: ArciumX25519PublicKey,
    encrypted_address_source_nonce: ArciumX25519Nonce,
    encrypted_address_source_ciphertext_low: RescueCiphertext,
    encrypted_address_source_ciphertext_high: RescueCiphertext,
    encryption_validation_polynomial: FieldElement25519,
    rescue_encryption_fiat_shamir_commitment: PoseidonHash,
    groth16_proof_a: Groth16ProofA,
    groth16_proof_b: Groth16ProofB,
    groth16_proof_c: Groth16ProofC,
    aes_encrypted_data: AesEncryptedUnspentTransactionOutputData,
    optional_data: OptionalData,
    destination_program: pubkey,
    cpi_account_1: pubkey,
);
