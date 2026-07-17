//! Schemas for `instructions/user/` (account + token_account ixs).

use crate::{AccountSpec, ArgSpec};

/// Source: `close_initialised_encrypted_token_account_v17` (v17 IDL).
pub(crate) const CLOSE_INITIALISED_TOKEN_ACCOUNT: &[AccountSpec] = schema_base!(
    signer = "user_address",
    fee_payer = "fee_payer",
    user = [
        ("encrypted_token_account", w = true , s = false),
        ("token_pool",              w = true , s = false),
        ("token_pool_spl_ata",      w = true , s = false),
        ("destination",             w = true , s = false),
        ("destination_ata",         w = true , s = false),
        ("mint",                    w = false, s = false),
        ("token_program",           w = false, s = false),
        ("protocol_config",         w = false, s = false),
        ("computation_data",        w = true , s = false),
    ],
);

pub(crate) const CLOSE_INITIALISED_TOKEN_ACCOUNT_ARGS: &[ArgSpec] = args!(
    computation_offset:       ComputationOffset,
    mpc_callback_data_offset: AccountOffset,
    priority_fees:            PriorityFees,
    optional_data:            OptionalData,
);

/// Source: `initialise_points_for_network_balance_v17` (v17 IDL).
pub(crate) const INITIALISE_POINTS_NETWORK: &[AccountSpec] = schema_base!(
    signer = "signer",
    fee_payer = "fee_payer",
    user = [
        ("encrypted_token_account", w = true , s = false),
        ("protocol_config",         w = false, s = false),
        ("computation_data",        w = true , s = false),
    ],
);

pub(crate) const INITIALISE_POINTS_NETWORK_ARGS: &[ArgSpec] = args!(
    computation_offset:       ComputationOffset,
    mpc_callback_data_offset: AccountOffset,
    priority_fees:            PriorityFees,
    optional_data:            OptionalData,
);

/// Source: `initialise_points_for_shared_balance_v17` (v17 IDL).
pub(crate) const INITIALISE_POINTS_SHARED: &[AccountSpec] = schema_base!(
    signer = "signer",
    fee_payer = "fee_payer",
    user = [
        ("encrypted_token_account", w = true , s = false),
        ("protocol_config",         w = false, s = false),
        ("computation_data",        w = true , s = false),
    ],
);

pub(crate) const INITIALISE_POINTS_SHARED_ARGS: &[ArgSpec] = args!(
    computation_offset:       ComputationOffset,
    mpc_callback_data_offset: AccountOffset,
    priority_fees:            PriorityFees,
    optional_data:            OptionalData,
);

/// Source: `register_user_for_anonymous_usage_v17` (v17 IDL).
pub(crate) const REGISTER_FOR_ANONYMOUS_USAGE: &[AccountSpec] = schema_base!(
    signer = "user",
    fee_payer = "fee_payer",
    user = [
        ("user_account",                                 w = true , s = false),
        ("zero_knowledge_verifying_key",                 w = false, s = false),
        ("protocol_config",                              w = false, s = false),
        ("x25519_proving_signer_for_master_viewing_key", w = false, s = true ),
        ("computation_data",                             w = true , s = false),
    ],
);

pub(crate) const REGISTER_FOR_ANONYMOUS_USAGE_ARGS: &[ArgSpec] = args!(
    computation_offset:                            ComputationOffset,
    mpc_callback_data_offset:                      AccountOffset,
    rescue_encryption_nonce:                       ArciumX25519Nonce,
    rescue_encrypted_master_viewing_key:           RescueCiphertext,
    rescue_encrypted_random_factor_for_polynomial: RescueCiphertext,
    rescue_encryption_commitment:                  PoseidonHash,
    rescue_encryption_polynomial_validator:        FieldElement25519,
    user_commitment:                               PoseidonHash,
    groth16_proof_a:                               Groth16ProofA,
    groth16_proof_b:                               Groth16ProofB,
    groth16_proof_c:                               Groth16ProofC,
    random_generation_seed:                        RandomGenerationSeed,
    priority_fees:                                 PriorityFees,
    optional_data:                                 OptionalData,
);
