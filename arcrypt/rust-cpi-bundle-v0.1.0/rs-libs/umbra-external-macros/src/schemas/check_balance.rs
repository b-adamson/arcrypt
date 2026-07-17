//! Schemas for `instructions/check_balance/`.

use crate::{AccountSpec, ArgSpec};

/// Source: `check_balance_above_threshold_v17` (v17 IDL).
pub(crate) const ABOVE_THRESHOLD: &[AccountSpec] = schema_base!(
    signer = "user_address",
    fee_payer = "fee_payer",
    user = [
        ("user_token_account", w = false, s = false),
        ("mint",               w = false, s = false),
        ("protocol_config",    w = false, s = false),
        ("computation_data",   w = true , s = false),
    ],
);

pub(crate) const ABOVE_THRESHOLD_ARGS: &[ArgSpec] = args!(
    computation_offset:              ComputationOffset,
    mpc_callback_data_offset:        AccountOffset,
    priority_fees:                   PriorityFees,
    threshold:                       Amount,
    result_output_x25519_public_key: ArciumX25519PublicKey,
    optional_data:                   OptionalData,
);
