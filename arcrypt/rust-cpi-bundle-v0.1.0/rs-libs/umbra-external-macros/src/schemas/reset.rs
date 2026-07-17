//! Schemas for `instructions/reset/`.

use crate::{AccountSpec, ArgSpec};

/// Source: `reset_fee_vault_queue_v17` (v17 IDL).
pub(crate) const FEE_VAULT: &[AccountSpec] = schema_single_signer!(
    signer = "fee_payer",
    user = [
        ("fee_vault",        w = true , s = false),
        ("mint",             w = false, s = false),
        ("protocol_config",  w = false, s = false),
        ("clock",            w = false, s = false),
        ("computation_data", w = true , s = false),
    ],
);

pub(crate) const FEE_VAULT_ARGS: &[ArgSpec] = args!(
    computation_offset:       ComputationOffset,
    instruction_seed:         InstructionSeed,
    fee_vault_offset:         AccountOffset,
    mpc_callback_data_offset: AccountOffset,
    priority_fees:            PriorityFees,
    optional_data:            OptionalData,
);

/// Source: `reset_network_encrypted_token_account_queue_v17` (v17 IDL).
pub(crate) const NETWORK_BALANCE: &[AccountSpec] = schema_single_signer!(
    signer = "fee_payer",
    user = [
        ("user_address",       w = false, s = false),
        ("user_token_account", w = true , s = false),
        ("mint",               w = false, s = false),
        ("protocol_config",    w = false, s = false),
        ("clock",              w = false, s = false),
        ("computation_data",   w = true , s = false),
    ],
);

pub(crate) const NETWORK_BALANCE_ARGS: &[ArgSpec] = args!(
    computation_offset:       ComputationOffset,
    mpc_callback_data_offset: AccountOffset,
    priority_fees:            PriorityFees,
    optional_data:            OptionalData,
);

/// Source: `reset_relayer_fee_vault_queue_v17` (v17 IDL).
pub(crate) const RELAYER_FEE_VAULT: &[AccountSpec] = schema_single_signer!(
    signer = "fee_payer",
    user = [
        ("relayer",          w = false, s = false),
        ("fee_vault",        w = true , s = false),
        ("mint",             w = false, s = false),
        ("protocol_config",  w = false, s = false),
        ("clock",            w = false, s = false),
        ("computation_data", w = true , s = false),
    ],
);

pub(crate) const RELAYER_FEE_VAULT_ARGS: &[ArgSpec] = args!(
    computation_offset:       ComputationOffset,
    instruction_seed:         InstructionSeed,
    fee_vault_offset:         AccountOffset,
    mpc_callback_data_offset: AccountOffset,
    priority_fees:            PriorityFees,
    optional_data:            OptionalData,
);

/// Source: `reset_shared_encrypted_token_account_queue_v17` (v17 IDL).
pub(crate) const SHARED_BALANCE: &[AccountSpec] = schema_single_signer!(
    signer = "fee_payer",
    user = [
        ("user_address",       w = false, s = false),
        ("user_token_account", w = true , s = false),
        ("mint",               w = false, s = false),
        ("protocol_config",    w = false, s = false),
        ("clock",              w = false, s = false),
        ("computation_data",   w = true , s = false),
    ],
);

pub(crate) const SHARED_BALANCE_ARGS: &[ArgSpec] = args!(
    computation_offset:       ComputationOffset,
    mpc_callback_data_offset: AccountOffset,
    priority_fees:            PriorityFees,
    optional_data:            OptionalData,
);
