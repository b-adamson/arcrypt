//! Schemas for `instructions/convert/`.

use crate::{AccountSpec, ArgSpec};

/// Source: `convert_network_balance_to_shared_balance_v17` (v17 IDL).
pub(crate) const NETWORK_TO_SHARED: &[AccountSpec] = schema_base!(
    signer = "user_address",
    fee_payer = "fee_payer",
    user = [
        ("user_account",       w = false, s = false),
        ("user_token_account", w = true , s = false),
        ("mint",               w = false, s = false),
        ("protocol_config",    w = false, s = false),
        ("computation_data",   w = true , s = false),
    ],
);

pub(crate) const NETWORK_TO_SHARED_ARGS: &[ArgSpec] = args!(
    computation_offset:       ComputationOffset,
    mpc_callback_data_offset: AccountOffset,
    priority_fees:            PriorityFees,
    optional_data:            OptionalData,
);

/// Source: `reencrypt_shared_balance_v17` (v17 IDL).
pub(crate) const REENCRYPT_SHARED: &[AccountSpec] = schema_base!(
    signer = "user_address",
    fee_payer = "fee_payer",
    user = [
        ("user_token_account",    w = true , s = false),
        ("mint",                  w = false, s = false),
        ("protocol_config",       w = false, s = false),
        ("x25519_proving_signer", w = false, s = true ),
        ("computation_data",      w = true , s = false),
    ],
);

pub(crate) const REENCRYPT_SHARED_ARGS: &[ArgSpec] = args!(
    computation_offset:       ComputationOffset,
    mpc_callback_data_offset: AccountOffset,
    priority_fees:            PriorityFees,
    optional_data:            OptionalData,
);
