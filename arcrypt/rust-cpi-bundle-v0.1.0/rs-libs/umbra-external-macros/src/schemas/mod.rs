//! Per-instruction account schemas for the `umbra_queue_accounts` proc macro.
//!
//! Each submodule holds the schemas for one `instructions/` subdir of the umbra
//! anchor program. A schema is `pub(crate) const NAME: &[AccountSpec]` — an
//! ordered list of every account slot the queue ix expects, with the
//! `(writable, signer)` flags Umbra requires.
//!
//! The registry at the bottom of this file dispatches an ix-name string to the
//! right schema. `lookup_schema` and `supported_ix_names` are the only items
//! the parent `lib.rs` consumes — everything else is implementation detail.
//!
//! ## How the prefixes are derived
//!
//! Schemas for **wrapper-macro** ixs (everything outside `reset/`,
//! `claim/to_public_associated_token_account/`, and
//! `user/token_account/initialise_points*`) share a 13-slot prefix emitted by
//! one of the three `define_arcium_queue_computation_instruction_struct*`
//! macro_rules! in `anchor-program/programs/umbra/src/instructions/mod.rs`:
//!
//! ```text
//! <signer>(mut, signer), <fee_payer>(mut, signer), sign_pda_account,
//! mxe_account, mempool_account(mut), executing_pool(mut),
//! computation_account(mut), comp_def_account, cluster_account(mut),
//! pool_account(mut), clock_account(mut), system_program, arcium_program
//! ```
//!
//! Followed by user fields, then per-variant trailing slots:
//! - base: nothing
//! - `_with_observer`: `initiator(signer)`
//! - `_with_observer_and_ata`: `associated_token_program`, `initiator(signer)`
//!
//! Hand-rolled `#[queue_computation_accounts(...)]` structs (in `reset/`,
//! `claim_to_pata/`, and `initialise_points*`) inline their own prefix and
//! have no trailing slots; their schemas list every slot in source order.

use crate::IxSchema;

// =============================================================================
// SCHEMA EMITTERS
// =============================================================================
//
// Each variant gets one macro that produces a complete `&[AccountSpec]`
// slice literal. macro_rules can't expand to a comma-separated list of items
// inside an outer `&[...]`, so we keep the array literal *inside* the macro
// and stitch the user fields in as repeated arms.
//
// User-field syntax (one per line, trailing commas allowed):
//   ("field_name", w = <bool>, s = <bool>)

/// Wrapper-macro `_with_observer_and_ata!` schema.
///
/// Layout: 13-slot Arcium prefix → user fields → associated_token_program →
/// initiator.
macro_rules! schema_observer_ata {
    (
        signer = $signer:literal,
        fee_payer = $fee_payer:literal,
        user = [
            $( ($u_name:literal, w = $u_w:expr, s = $u_s:expr) ),* $(,)?
        ] $(,)?
    ) => {
        &[
            $crate::AccountSpec { name: $signer,                   writable: true,  signer: true  },
            $crate::AccountSpec { name: $fee_payer,                writable: true,  signer: true  },
            $crate::AccountSpec { name: "sign_pda_account",        writable: true,  signer: false },
            $crate::AccountSpec { name: "mxe_account",             writable: false, signer: false },
            $crate::AccountSpec { name: "mempool_account",         writable: true,  signer: false },
            $crate::AccountSpec { name: "executing_pool",          writable: true,  signer: false },
            $crate::AccountSpec { name: "computation_account",     writable: true,  signer: false },
            $crate::AccountSpec { name: "comp_def_account",        writable: false, signer: false },
            $crate::AccountSpec { name: "cluster_account",         writable: true,  signer: false },
            $crate::AccountSpec { name: "pool_account",            writable: true,  signer: false },
            $crate::AccountSpec { name: "clock_account",           writable: true,  signer: false },
            $crate::AccountSpec { name: "system_program",          writable: false, signer: false },
            $crate::AccountSpec { name: "arcium_program",          writable: false, signer: false },
            $( $crate::AccountSpec { name: $u_name, writable: $u_w, signer: $u_s }, )*
            $crate::AccountSpec { name: "associated_token_program", writable: false, signer: false },
            $crate::AccountSpec { name: "initiator",                writable: false, signer: true  },
        ]
    };
}

/// Wrapper-macro `_with_observer!` schema.
///
/// Layout: 13-slot Arcium prefix → user fields → initiator.
macro_rules! schema_observer {
    (
        signer = $signer:literal,
        fee_payer = $fee_payer:literal,
        user = [
            $( ($u_name:literal, w = $u_w:expr, s = $u_s:expr) ),* $(,)?
        ] $(,)?
    ) => {
        &[
            $crate::AccountSpec { name: $signer,                   writable: true,  signer: true  },
            $crate::AccountSpec { name: $fee_payer,                writable: true,  signer: true  },
            $crate::AccountSpec { name: "sign_pda_account",        writable: true,  signer: false },
            $crate::AccountSpec { name: "mxe_account",             writable: false, signer: false },
            $crate::AccountSpec { name: "mempool_account",         writable: true,  signer: false },
            $crate::AccountSpec { name: "executing_pool",          writable: true,  signer: false },
            $crate::AccountSpec { name: "computation_account",     writable: true,  signer: false },
            $crate::AccountSpec { name: "comp_def_account",        writable: false, signer: false },
            $crate::AccountSpec { name: "cluster_account",         writable: true,  signer: false },
            $crate::AccountSpec { name: "pool_account",            writable: true,  signer: false },
            $crate::AccountSpec { name: "clock_account",           writable: true,  signer: false },
            $crate::AccountSpec { name: "system_program",          writable: false, signer: false },
            $crate::AccountSpec { name: "arcium_program",          writable: false, signer: false },
            $( $crate::AccountSpec { name: $u_name, writable: $u_w, signer: $u_s }, )*
            $crate::AccountSpec { name: "initiator",                writable: false, signer: true  },
        ]
    };
}

/// Wrapper-macro base schema (no observer-CPI accounts).
///
/// Layout: 13-slot Arcium prefix → user fields.
macro_rules! schema_base {
    (
        signer = $signer:literal,
        fee_payer = $fee_payer:literal,
        user = [
            $( ($u_name:literal, w = $u_w:expr, s = $u_s:expr) ),* $(,)?
        ] $(,)?
    ) => {
        &[
            $crate::AccountSpec { name: $signer,                   writable: true,  signer: true  },
            $crate::AccountSpec { name: $fee_payer,                writable: true,  signer: true  },
            $crate::AccountSpec { name: "sign_pda_account",        writable: true,  signer: false },
            $crate::AccountSpec { name: "mxe_account",             writable: false, signer: false },
            $crate::AccountSpec { name: "mempool_account",         writable: true,  signer: false },
            $crate::AccountSpec { name: "executing_pool",          writable: true,  signer: false },
            $crate::AccountSpec { name: "computation_account",     writable: true,  signer: false },
            $crate::AccountSpec { name: "comp_def_account",        writable: false, signer: false },
            $crate::AccountSpec { name: "cluster_account",         writable: true,  signer: false },
            $crate::AccountSpec { name: "pool_account",            writable: true,  signer: false },
            $crate::AccountSpec { name: "clock_account",           writable: true,  signer: false },
            $crate::AccountSpec { name: "system_program",          writable: false, signer: false },
            $crate::AccountSpec { name: "arcium_program",          writable: false, signer: false },
            $( $crate::AccountSpec { name: $u_name, writable: $u_w, signer: $u_s }, )*
        ]
    };
}

/// Wrapper-macro `_relayer_paid_with_observer!` schema.
///
/// One signer that plays both domain-signer and rent-payer roles, plus the
/// observer-CPI initiator trailer. Used by v17 claim-to-ETA ixs after the
/// claim-path slim-down dropped the separate `fee_payer` signer
/// (`81dfbbe0 refactor(anchor,sdk,relayer): claim-path slim-down`).
///
/// Layout: signer → 11-slot Arcium prefix → user fields → initiator.
macro_rules! schema_single_signer_observer {
    (
        signer = $signer:literal,
        user = [
            $( ($u_name:literal, w = $u_w:expr, s = $u_s:expr) ),* $(,)?
        ] $(,)?
    ) => {
        &[
            $crate::AccountSpec { name: $signer,                   writable: true,  signer: true  },
            $crate::AccountSpec { name: "sign_pda_account",        writable: true,  signer: false },
            $crate::AccountSpec { name: "mxe_account",             writable: false, signer: false },
            $crate::AccountSpec { name: "mempool_account",         writable: true,  signer: false },
            $crate::AccountSpec { name: "executing_pool",          writable: true,  signer: false },
            $crate::AccountSpec { name: "computation_account",     writable: true,  signer: false },
            $crate::AccountSpec { name: "comp_def_account",        writable: false, signer: false },
            $crate::AccountSpec { name: "cluster_account",         writable: true,  signer: false },
            $crate::AccountSpec { name: "pool_account",            writable: true,  signer: false },
            $crate::AccountSpec { name: "clock_account",           writable: true,  signer: false },
            $crate::AccountSpec { name: "system_program",          writable: false, signer: false },
            $crate::AccountSpec { name: "arcium_program",          writable: false, signer: false },
            $( $crate::AccountSpec { name: $u_name, writable: $u_w, signer: $u_s }, )*
            $crate::AccountSpec { name: "initiator",                writable: false, signer: true  },
        ]
    };
}

/// Hand-rolled `#[queue_computation_accounts]` schema with single signer
/// (used by `reset/`, `initialise_points*`, `initialise_total_volume_*`,
/// `claim_to_pata/` — single account plays both domain-signer and rent-payer
/// roles, no separate `fee_payer` slot, no observer trailer).
///
/// Layout: signer → 11-slot Arcium prefix → user fields.
macro_rules! schema_single_signer {
    (
        signer = $signer:literal,
        user = [
            $( ($u_name:literal, w = $u_w:expr, s = $u_s:expr) ),* $(,)?
        ] $(,)?
    ) => {
        &[
            $crate::AccountSpec { name: $signer,                   writable: true,  signer: true  },
            $crate::AccountSpec { name: "sign_pda_account",        writable: true,  signer: false },
            $crate::AccountSpec { name: "mxe_account",             writable: false, signer: false },
            $crate::AccountSpec { name: "mempool_account",         writable: true,  signer: false },
            $crate::AccountSpec { name: "executing_pool",          writable: true,  signer: false },
            $crate::AccountSpec { name: "computation_account",     writable: true,  signer: false },
            $crate::AccountSpec { name: "comp_def_account",        writable: false, signer: false },
            $crate::AccountSpec { name: "cluster_account",         writable: true,  signer: false },
            $crate::AccountSpec { name: "pool_account",            writable: true,  signer: false },
            $crate::AccountSpec { name: "clock_account",           writable: true,  signer: false },
            $crate::AccountSpec { name: "system_program",          writable: false, signer: false },
            $crate::AccountSpec { name: "arcium_program",          writable: false, signer: false },
            $( $crate::AccountSpec { name: $u_name, writable: $u_w, signer: $u_s }, )*
        ]
    };
}

/// Builds a `&[ArgSpec]` from `name: TypeName` pairs.
///
/// The IDL-level type name maps to the primitive Rust type with the same
/// borsh wire layout (every umbra-codama wrapper is a single-field newtype,
/// so `Foo { first: T }` and `T` are wire-equivalent). Emitting primitives
/// avoids a borsh-version mismatch between `umbra-codama` (borsh 1.x) and
/// `anchor-lang` 0.32 (borsh 0.10): anchor's `#[program]` macro derives
/// arg-deserialization with its own borsh re-export, so injected args must
/// implement traits anchor recognises. Primitives do; codama wrappers don't.
///
/// Callers convert at the CPI boundary, e.g.
/// `let computation_offset = umbra_codama::types::ComputationOffset { first: computation_offset };`
/// when building the codama `Cpi`.
macro_rules! args {
    ( $( $name:ident : $kind:tt ),* $(,)? ) => {
        &[ $( $crate::schemas::__arg_spec!($name : $kind) ),* ]
    };
}

#[doc(hidden)]
macro_rules! __arg_spec {
    // Bare `Pubkey` (not a segmented path) — anchor's `#[instruction(...)]`
    // parser rejects segmented paths, so emit the short name and rely on
    // `use anchor_lang::prelude::*;` being in scope at the use site (the
    // standard anchor program layout).
    ($name:ident : pubkey) => {
        $crate::ArgSpec {
            name: stringify!($name),
            ty: "Pubkey",
        }
    };
    ($name:ident : ComputationOffset) => {
        $crate::ArgSpec { name: stringify!($name), ty: "u64" }
    };
    ($name:ident : AccountOffset) => {
        $crate::ArgSpec { name: stringify!($name), ty: "u128" }
    };
    ($name:ident : Amount) => {
        $crate::ArgSpec { name: stringify!($name), ty: "u64" }
    };
    ($name:ident : PriorityFees) => {
        $crate::ArgSpec { name: stringify!($name), ty: "u64" }
    };
    ($name:ident : OptionalData) => {
        $crate::ArgSpec { name: stringify!($name), ty: "[u8; 32]" }
    };
    ($name:ident : RandomGenerationSeed) => {
        $crate::ArgSpec { name: stringify!($name), ty: "[u8; 32]" }
    };
    ($name:ident : InstructionDiscriminator) => {
        $crate::ArgSpec { name: stringify!($name), ty: "[u8; 8]" }
    };
    ($name:ident : ArciumX25519Nonce) => {
        $crate::ArgSpec { name: stringify!($name), ty: "u128" }
    };
    ($name:ident : RescueCiphertext) => {
        $crate::ArgSpec { name: stringify!($name), ty: "[u8; 32]" }
    };
    ($name:ident : PoseidonHash) => {
        $crate::ArgSpec { name: stringify!($name), ty: "[u8; 32]" }
    };
    ($name:ident : FieldElement25519) => {
        $crate::ArgSpec { name: stringify!($name), ty: "[u8; 32]" }
    };
    ($name:ident : Groth16ProofA) => {
        $crate::ArgSpec { name: stringify!($name), ty: "[u8; 64]" }
    };
    ($name:ident : Groth16ProofB) => {
        $crate::ArgSpec { name: stringify!($name), ty: "[u8; 128]" }
    };
    ($name:ident : Groth16ProofC) => {
        $crate::ArgSpec { name: stringify!($name), ty: "[u8; 64]" }
    };
    ($name:ident : ArciumX25519PublicKey) => {
        $crate::ArgSpec { name: stringify!($name), ty: "[u8; 32]" }
    };
    ($name:ident : DispatchObserverCpi) => {
        $crate::ArgSpec { name: stringify!($name), ty: "u8" }
    };
    ($name:ident : InstructionSeed) => {
        $crate::ArgSpec { name: stringify!($name), ty: "u128" }
    };
    ($name:ident : NumberOfBurns) => {
        $crate::ArgSpec { name: stringify!($name), ty: "u8" }
    };
    ($name:ident : UnixEpochTimestamp) => {
        $crate::ArgSpec { name: stringify!($name), ty: "i64" }
    };
    ($name:ident : PoseidonCiphertext) => {
        $crate::ArgSpec { name: stringify!($name), ty: "[u8; 32]" }
    };
    ($name:ident : AesEncryptedUnspentTransactionOutputData) => {
        $crate::ArgSpec { name: stringify!($name), ty: "[u8; 96]" }
    };
    ($name:ident : NumberOfUnspentTransactionOutputs) => {
        $crate::ArgSpec { name: stringify!($name), ty: "u32" }
    };
    // Arrays of hashes / ciphertexts — used by the populate-buffer ixs which
    // batch up to 6 UTXO linker encryptions/commitments per call. Each
    // PoseidonHash is wire-equivalent to [u8; 32], so [PoseidonHash; 6]
    // serialises as [[u8; 32]; 6].
    ($name:ident : PoseidonHashArray6) => {
        $crate::ArgSpec { name: stringify!($name), ty: "[[u8; 32]; 6]" }
    };
    ($name:ident : PoseidonHashArray5) => {
        $crate::ArgSpec { name: stringify!($name), ty: "[[u8; 32]; 5]" }
    };
    // Raw integer primitives — for handler args whose IDL type is a plain
    // integer (not a codama wrapper).
    ($name:ident : u8_raw) => {
        $crate::ArgSpec { name: stringify!($name), ty: "u8" }
    };
    ($name:ident : u32_raw) => {
        $crate::ArgSpec { name: stringify!($name), ty: "u32" }
    };
    // Fallback for any future IDL types — caller must add an arm above with
    // the matching primitive. Emitting the codama path here would compile
    // only on borsh-1.x consumers.
    ($name:ident : $ty:ident) => {
        $crate::ArgSpec {
            name: stringify!($name),
            ty: concat!("::umbra_codama::types::", stringify!($ty)),
        }
    };
}

// Re-export to submodules. The `pub(crate) use` is needed for macro
// resolution from sibling files, even though rustc's import-usage tracker
// flags it as unused (false positive — see rust-lang/rust#78894).
#[allow(unused_imports)]
pub(crate) use {
    __arg_spec, args, schema_base, schema_observer, schema_observer_ata, schema_single_signer,
    schema_single_signer_observer,
};

// =============================================================================
// CATEGORY SUBMODULES
// =============================================================================

pub mod buffers;
pub mod check_balance;
pub mod claim_to_eta;
pub mod claim_to_pata;
pub mod compliance;
pub mod convert;
pub mod deposit;
pub mod fees;
pub mod relayer_fees;
pub mod reset;
pub mod stealth_pool;
pub mod transfer;
pub mod user;
pub mod withdraw;

// =============================================================================
// REGISTRY
// =============================================================================

/// Maps an ix-name literal to its full schema (accounts + args). Adding a
/// new ix is a one-line edit here plus two consts (`X_ACCOUNTS`, `X_ARGS`)
/// in the appropriate submodule.
macro_rules! ix {
    ($accounts:expr, $args:expr) => {
        $crate::IxSchema {
            accounts: $accounts,
            args: $args,
        }
    };
}

const REGISTRY: &[(&str, IxSchema)] = &[
    // ----- deposit/ -----
    ("deposit_from_public_balance_into_existing_network_balance_v17", ix!(deposit::EXISTING_NETWORK, deposit::EXISTING_NETWORK_ARGS)),
    ("deposit_from_public_balance_into_existing_shared_balance_v17", ix!(deposit::EXISTING_SHARED, deposit::EXISTING_SHARED_ARGS)),
    ("deposit_from_public_balance_into_new_network_balance_v17", ix!(deposit::NEW_NETWORK, deposit::NEW_NETWORK_ARGS)),
    ("deposit_from_public_balance_into_new_shared_balance_v17", ix!(deposit::NEW_SHARED, deposit::NEW_SHARED_ARGS)),
    // ----- deposit_into_stealth_pool/from_encrypted_token_account/ -----
    ("deposit_into_stealth_pool_from_network_balance_v17", ix!(stealth_pool::FROM_NETWORK_BALANCE, stealth_pool::FROM_NETWORK_BALANCE_ARGS)),
    ("deposit_into_stealth_pool_from_network_balance_with_encrypted_address_v17", ix!(stealth_pool::FROM_NETWORK_BALANCE_WITH_ENCRYPTED_ADDRESS, stealth_pool::FROM_NETWORK_BALANCE_WITH_ENCRYPTED_ADDRESS_ARGS)),
    ("deposit_into_stealth_pool_from_shared_balance_v17", ix!(stealth_pool::FROM_SHARED_BALANCE, stealth_pool::FROM_SHARED_BALANCE_ARGS)),
    // ----- input-buffer populate (plain Anchor ix, no Arcium prefix) -----
    ("populate_stealth_pool_deposit_with_encrypted_address_input_buffer", ix!(buffers::POPULATE_STEALTH_POOL_DEPOSIT_INPUT_BUFFER, buffers::POPULATE_STEALTH_POOL_DEPOSIT_INPUT_BUFFER_ARGS)),
    // ----- claim/to_encrypted_token_account/ -----
    ("claim_into_existing_network_balance_v17", ix!(claim_to_eta::EXISTING_NETWORK, claim_to_eta::EXISTING_NETWORK_ARGS)),
    ("claim_into_existing_shared_balance_v17", ix!(claim_to_eta::EXISTING_SHARED, claim_to_eta::EXISTING_SHARED_ARGS)),
    ("claim_into_new_network_balance_v17", ix!(claim_to_eta::NEW_NETWORK, claim_to_eta::NEW_NETWORK_ARGS)),
    ("claim_into_new_shared_balance_v17", ix!(claim_to_eta::NEW_SHARED, claim_to_eta::NEW_SHARED_ARGS)),
    // ----- claim/to_public_associated_token_account/ -----
    ("claim_into_public_balance_to_mxe_v17", ix!(claim_to_pata::TO_MXE, claim_to_pata::TO_MXE_ARGS)),
    ("claim_into_public_balance_to_receiver_v17", ix!(claim_to_pata::TO_RECEIVER, claim_to_pata::TO_RECEIVER_ARGS)),
    // ----- transfer/ -----
    ("transfer_from_network_balance_to_existing_network_balance_v17", ix!(transfer::NETWORK_TO_EXISTING_NETWORK, transfer::NETWORK_TO_EXISTING_NETWORK_ARGS)),
    ("transfer_from_network_balance_to_existing_shared_balance_v17", ix!(transfer::NETWORK_TO_EXISTING_SHARED, transfer::NETWORK_TO_EXISTING_SHARED_ARGS)),
    ("transfer_from_network_balance_to_new_network_balance_v17", ix!(transfer::NETWORK_TO_NEW_NETWORK, transfer::NETWORK_TO_NEW_NETWORK_ARGS)),
    ("transfer_from_network_balance_to_new_shared_balance_v17", ix!(transfer::NETWORK_TO_NEW_SHARED, transfer::NETWORK_TO_NEW_SHARED_ARGS)),
    ("transfer_from_shared_balance_to_existing_network_balance_v17", ix!(transfer::SHARED_TO_EXISTING_NETWORK, transfer::SHARED_TO_EXISTING_NETWORK_ARGS)),
    ("transfer_from_shared_balance_to_existing_shared_balance_v17", ix!(transfer::SHARED_TO_EXISTING_SHARED, transfer::SHARED_TO_EXISTING_SHARED_ARGS)),
    ("transfer_from_shared_balance_to_new_network_balance_v17", ix!(transfer::SHARED_TO_NEW_NETWORK, transfer::SHARED_TO_NEW_NETWORK_ARGS)),
    ("transfer_from_shared_balance_to_new_shared_balance_v17", ix!(transfer::SHARED_TO_NEW_SHARED, transfer::SHARED_TO_NEW_SHARED_ARGS)),
    // ----- withdraw/ -----
    ("withdraw_from_network_balance_into_public_balance_v17", ix!(withdraw::NETWORK_TO_PUBLIC, withdraw::NETWORK_TO_PUBLIC_ARGS)),
    ("withdraw_from_shared_balance_into_public_balance_v17", ix!(withdraw::SHARED_TO_PUBLIC, withdraw::SHARED_TO_PUBLIC_ARGS)),
    // ----- convert/ -----
    ("convert_network_balance_to_shared_balance_v17", ix!(convert::NETWORK_TO_SHARED, convert::NETWORK_TO_SHARED_ARGS)),
    ("reencrypt_shared_balance_v17", ix!(convert::REENCRYPT_SHARED, convert::REENCRYPT_SHARED_ARGS)),
    // ----- compliance/reencrypt/ -----
    ("reencrypt_network_grant_for_network_balance_v17", ix!(compliance::NETWORK_GRANT_NETWORK, compliance::NETWORK_GRANT_NETWORK_ARGS)),
    ("reencrypt_network_grant_for_shared_balance_v17", ix!(compliance::NETWORK_GRANT_SHARED, compliance::NETWORK_GRANT_SHARED_ARGS)),
    ("reencrypt_user_grant_v17", ix!(compliance::USER_GRANT, compliance::USER_GRANT_ARGS)),
    // ----- fees/ -----
    ("collect_fees_v17", ix!(fees::COLLECT, fees::COLLECT_ARGS)),
    ("initialise_fee_vault_v17", ix!(fees::INITIALISE_PROTOCOL_POOL, fees::INITIALISE_PROTOCOL_POOL_ARGS)),
    ("initialise_total_volume_for_protocol_fee_vault_v17", ix!(fees::INITIALISE_TOTAL_VOLUME, fees::INITIALISE_TOTAL_VOLUME_ARGS)),
    // ----- relayer/fees/pool/ -----
    ("collect_relayer_fees_v17", ix!(relayer_fees::COLLECT, relayer_fees::COLLECT_ARGS)),
    ("initialise_total_volume_for_relayer_fee_vault_v17", ix!(relayer_fees::INITIALISE_TOTAL_VOLUME, relayer_fees::INITIALISE_TOTAL_VOLUME_ARGS)),
    ("initialise_relayer_fee_vault_v17", ix!(relayer_fees::INITIALISE_UNIFIED, relayer_fees::INITIALISE_UNIFIED_ARGS)),
    // ----- user/ -----
    ("close_initialised_encrypted_token_account_v17", ix!(user::CLOSE_INITIALISED_TOKEN_ACCOUNT, user::CLOSE_INITIALISED_TOKEN_ACCOUNT_ARGS)),
    ("initialise_points_for_network_balance_v17", ix!(user::INITIALISE_POINTS_NETWORK, user::INITIALISE_POINTS_NETWORK_ARGS)),
    ("initialise_points_for_shared_balance_v17", ix!(user::INITIALISE_POINTS_SHARED, user::INITIALISE_POINTS_SHARED_ARGS)),
    ("register_user_for_anonymous_usage_v17", ix!(user::REGISTER_FOR_ANONYMOUS_USAGE, user::REGISTER_FOR_ANONYMOUS_USAGE_ARGS)),
    // ----- reset/ -----
    ("reset_fee_vault_queue_v17", ix!(reset::FEE_VAULT, reset::FEE_VAULT_ARGS)),
    ("reset_network_encrypted_token_account_queue_v17", ix!(reset::NETWORK_BALANCE, reset::NETWORK_BALANCE_ARGS)),
    ("reset_relayer_fee_vault_queue_v17", ix!(reset::RELAYER_FEE_VAULT, reset::RELAYER_FEE_VAULT_ARGS)),
    ("reset_shared_encrypted_token_account_queue_v17", ix!(reset::SHARED_BALANCE, reset::SHARED_BALANCE_ARGS)),
    // ----- check_balance/ -----
    ("check_balance_above_threshold_v17", ix!(check_balance::ABOVE_THRESHOLD, check_balance::ABOVE_THRESHOLD_ARGS)),
];

pub(crate) fn lookup_schema(name: &str) -> Option<IxSchema> {
    REGISTRY
        .iter()
        .find(|(n, _)| *n == name)
        .map(|(_, s)| *s)
}

pub(crate) fn supported_ix_names() -> impl Iterator<Item = &'static str> {
    REGISTRY.iter().map(|(n, _)| *n)
}

// =============================================================================
// SCHEMA INVARIANT TESTS
// =============================================================================
//
// These run with `cargo test -p umbra-external-macros` and catch structural
// mistakes in the schema tables that would otherwise only surface when a
// caller tries to use the macro.

#[cfg(test)]
mod tests {
    use super::*;
    use crate::ArgSpec;
    use std::collections::HashSet;

    /// Every registry entry must point at a non-empty accounts list. An
    /// empty list would silently produce a struct with no Umbra fields.
    #[test]
    fn no_empty_accounts() {
        for (name, schema) in REGISTRY {
            assert!(
                !schema.accounts.is_empty(),
                "accounts for `{}` is empty",
                name
            );
        }
    }

    /// Every registry entry must have at least one arg (the implicit
    /// `computation_offset` Arcium injects on every queue ix).
    #[test]
    fn no_empty_args() {
        for (name, schema) in REGISTRY {
            assert!(!schema.args.is_empty(), "args for `{}` is empty", name);
        }
    }

    /// Returns true for non-queue, plain-Anchor ixs (e.g. the buffer
    /// populate/close pair). These don't carry the Arcium-prefix slots,
    /// their first arg is the buffer offset (not the computation offset),
    /// and their first slot is a read-only signer.
    fn is_non_queue_ix(name: &str) -> bool {
        name.starts_with("populate_") || name.starts_with("close_")
    }

    /// First arg of every queue ix must be `computation_offset`, matching
    /// the wrapper-macro convention. Non-queue ixs are skipped (see
    /// `is_non_queue_ix`).
    #[test]
    fn first_arg_is_computation_offset() {
        for (name, schema) in REGISTRY {
            if is_non_queue_ix(name) {
                continue;
            }
            let first = &schema.args[0];
            assert_eq!(
                first.name, "computation_offset",
                "ix `{}` first arg is `{}`, expected `computation_offset`",
                name, first.name,
            );
        }
    }

    /// Ix names in the registry must be unique.
    #[test]
    fn unique_ix_names() {
        let mut seen: HashSet<&str> = HashSet::new();
        for (name, _) in REGISTRY {
            assert!(
                seen.insert(*name),
                "duplicate ix name in REGISTRY: `{}`",
                name
            );
        }
    }

    /// Within a single schema, every slot name must be unique.
    #[test]
    fn unique_slot_names_per_schema() {
        for (ix, schema) in REGISTRY {
            let mut seen: HashSet<&str> = HashSet::new();
            for spec in schema.accounts {
                assert!(
                    seen.insert(spec.name),
                    "duplicate slot `{}` in schema `{}`",
                    spec.name,
                    ix,
                );
            }
        }
    }

    /// Within a single args list, every arg name must be unique.
    #[test]
    fn unique_arg_names_per_schema() {
        for (ix, schema) in REGISTRY {
            let mut seen: HashSet<&str> = HashSet::new();
            for spec in schema.args {
                assert!(
                    seen.insert(spec.name),
                    "duplicate arg `{}` in schema `{}`",
                    spec.name,
                    ix,
                );
            }
        }
    }

    /// First account slot must be a signer. Queue ixs additionally require
    /// the first slot to be writable (the domain signer pays for state
    /// updates); non-queue buffer ixs use a read-only `signer` + a separate
    /// writable `fee_payer`, so the writable check is skipped for those.
    #[test]
    fn first_slot_is_signer() {
        for (ix, schema) in REGISTRY {
            let first = &schema.accounts[0];
            assert!(
                first.signer,
                "schema `{}` first slot `{}` must be a signer",
                ix, first.name,
            );
            if is_non_queue_ix(ix) {
                continue;
            }
            assert!(
                first.writable,
                "schema `{}` first slot `{}` must be writable (signers always are)",
                ix, first.name,
            );
        }
    }

    /// The 11 Arcium-managed slots (sign_pda_account through arcium_program)
    /// must appear in every queue schema. Non-queue ixs (plain Anchor
    /// populate/close pairs) are skipped — they have their own short slot
    /// list and don't talk to Arcium.
    #[test]
    fn all_schemas_carry_arcium_prefix() {
        const REQUIRED: &[&str] = &[
            "sign_pda_account",
            "mxe_account",
            "mempool_account",
            "executing_pool",
            "computation_account",
            "comp_def_account",
            "cluster_account",
            "pool_account",
            "clock_account",
            "system_program",
            "arcium_program",
        ];
        for (ix, schema) in REGISTRY {
            if is_non_queue_ix(ix) {
                continue;
            }
            let names: HashSet<&str> = schema.accounts.iter().map(|s| s.name).collect();
            for req in REQUIRED {
                assert!(
                    names.contains(req),
                    "schema `{}` missing required Arcium slot `{}`",
                    ix, req,
                );
            }
        }
    }

    /// Every arg type must parse as a Rust path / type with `syn::parse_str`.
    /// Catches typos in the stringly-typed `ArgSpec::ty` fields.
    #[test]
    fn arg_types_parse() {
        for (ix, schema) in REGISTRY {
            for arg in schema.args {
                syn::parse_str::<syn::Type>(arg.ty).unwrap_or_else(|e| {
                    panic!(
                        "ix `{}` arg `{}` has unparseable type `{}`: {}",
                        ix, arg.name, arg.ty, e
                    )
                });
            }
        }
    }

    #[test]
    fn lookup_round_trip() {
        for (name, _) in REGISTRY {
            assert!(lookup_schema(name).is_some(), "lookup miss for `{}`", name);
        }
        assert!(lookup_schema("not_a_real_ix_xyz_v99").is_none());
    }

    #[test]
    fn ix_count_unchanged() {
        assert_eq!(REGISTRY.len(), 44, "ix count drifted; update the constant");
    }

    /// Sanity check — `ArgSpec` is in scope and the args macro emits valid
    /// shape. `_unused` silences an "ArgSpec import not used" warning when
    /// no submodule directly references the type.
    #[test]
    fn argspec_in_scope() {
        let _unused: Option<ArgSpec> = None;
    }
}
