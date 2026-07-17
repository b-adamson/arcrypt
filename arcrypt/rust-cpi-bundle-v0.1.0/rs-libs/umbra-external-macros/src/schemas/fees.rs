//! Schemas for `instructions/fees/`.

use crate::{AccountSpec, ArgSpec};

/// Source: `collect_fees_v17` (v17 IDL).
pub(crate) const COLLECT: &[AccountSpec] = schema_base!(
    signer = "signer",
    fee_payer = "fee_payer",
    user = [
        ("fee_vault",        w = true , s = false),
        ("admin_wallet",     w = false, s = false),
        ("mint",             w = false, s = false),
        ("protocol_config",  w = false, s = false),
        ("computation_data", w = true , s = false),
    ],
);

pub(crate) const COLLECT_ARGS: &[ArgSpec] = args!(
    computation_offset:       ComputationOffset,
    instruction_seed:         InstructionSeed,
    fee_vault_offset:         AccountOffset,
    mpc_callback_data_offset: AccountOffset,
    priority_fees:            PriorityFees,
    optional_data:            OptionalData,
);

/// Source: `initialise_fee_vault_v17` (v17 IDL).
pub(crate) const INITIALISE_PROTOCOL_POOL: &[AccountSpec] = schema_base!(
    signer = "signer",
    fee_payer = "fee_payer",
    user = [
        ("fee_vault",        w = true , s = false),
        ("admin_wallet",     w = false, s = false),
        ("mint",             w = false, s = false),
        ("protocol_config",  w = false, s = false),
        ("computation_data", w = true , s = false),
    ],
);

pub(crate) const INITIALISE_PROTOCOL_POOL_ARGS: &[ArgSpec] = args!(
    computation_offset:       ComputationOffset,
    instruction_seed:         InstructionSeed,
    fee_vault_offset:         AccountOffset,
    mpc_callback_data_offset: AccountOffset,
    random_generation_seed:   RandomGenerationSeed,
    priority_fees:            PriorityFees,
    optional_data:            OptionalData,
);

/// Source: `initialise_total_volume_for_protocol_fee_vault_v17` (v17 IDL).
pub(crate) const INITIALISE_TOTAL_VOLUME: &[AccountSpec] = schema_base!(
    signer = "signer",
    fee_payer = "fee_payer",
    user = [
        ("fee_vault",        w = true , s = false),
        ("protocol_config",  w = false, s = false),
        ("computation_data", w = true , s = false),
    ],
);

pub(crate) const INITIALISE_TOTAL_VOLUME_ARGS: &[ArgSpec] = args!(
    computation_offset:       ComputationOffset,
    mpc_callback_data_offset: AccountOffset,
    priority_fees:            PriorityFees,
    optional_data:            OptionalData,
);
