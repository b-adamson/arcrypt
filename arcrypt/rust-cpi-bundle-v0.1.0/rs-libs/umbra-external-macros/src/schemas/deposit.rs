//! Schemas for `instructions/deposit/` (public-token deposits into encrypted token accounts).

use crate::{AccountSpec, ArgSpec};

/// Source: `deposit_from_public_balance_into_existing_network_balance_v17` (v17 IDL).
pub(crate) const EXISTING_NETWORK: &[AccountSpec] = schema_observer_ata!(
    signer = "depositor_address",
    fee_payer = "fee_payer",
    user = [
        ("depositor_spl_ata",      w = true , s = false),
        ("receiver_address",       w = false, s = false),
        ("receiver_token_account", w = true , s = false),
        ("fee_schedule",           w = false, s = false),
        ("fee_vault",              w = true , s = false),
        ("protocol_config",        w = false, s = false),
        ("token_pool",             w = false, s = false),
        ("token_pool_spl_ata",     w = true , s = false),
        ("mint",                   w = false, s = false),
        ("token_program",          w = false, s = false),
        ("computation_data",       w = true , s = false),
    ],
);

pub(crate) const EXISTING_NETWORK_ARGS: &[ArgSpec] = args!(
    computation_offset:        ComputationOffset,
    fee_vault_offset:          AccountOffset,
    mpc_callback_data_offset:  AccountOffset,
    transfer_amount:           Amount,
    deposit_amount:            Amount,
    priority_fees:             PriorityFees,
    optional_data:             OptionalData,
    destination_discriminator: InstructionDiscriminator,
    destination_program:       pubkey,
    cpi_account_1:             pubkey,
);

/// Source: `deposit_from_public_balance_into_existing_shared_balance_v17` (v17 IDL).
pub(crate) const EXISTING_SHARED: &[AccountSpec] = schema_observer_ata!(
    signer = "depositor_address",
    fee_payer = "fee_payer",
    user = [
        ("depositor_spl_ata",      w = true , s = false),
        ("receiver_address",       w = false, s = false),
        ("receiver_token_account", w = true , s = false),
        ("fee_schedule",           w = false, s = false),
        ("fee_vault",              w = true , s = false),
        ("protocol_config",        w = false, s = false),
        ("token_pool",             w = false, s = false),
        ("token_pool_spl_ata",     w = true , s = false),
        ("mint",                   w = false, s = false),
        ("token_program",          w = false, s = false),
        ("computation_data",       w = true , s = false),
    ],
);

pub(crate) const EXISTING_SHARED_ARGS: &[ArgSpec] = args!(
    computation_offset:        ComputationOffset,
    fee_vault_offset:          AccountOffset,
    mpc_callback_data_offset:  AccountOffset,
    transfer_amount:           Amount,
    deposit_amount:            Amount,
    priority_fees:             PriorityFees,
    optional_data:             OptionalData,
    destination_discriminator: InstructionDiscriminator,
    destination_program:       pubkey,
    cpi_account_1:             pubkey,
);

/// Source: `deposit_from_public_balance_into_new_network_balance_v17` (v17 IDL).
pub(crate) const NEW_NETWORK: &[AccountSpec] = schema_observer_ata!(
    signer = "depositor_address",
    fee_payer = "fee_payer",
    user = [
        ("depositor_spl_ata",      w = true , s = false),
        ("receiver_address",       w = false, s = false),
        ("receiver_token_account", w = true , s = false),
        ("receiver_user_account",  w = true , s = false),
        ("fee_schedule",           w = false, s = false),
        ("fee_vault",              w = true , s = false),
        ("protocol_config",        w = false, s = false),
        ("token_pool",             w = false, s = false),
        ("token_pool_spl_ata",     w = true , s = false),
        ("mint",                   w = false, s = false),
        ("token_program",          w = false, s = false),
        ("computation_data",       w = true , s = false),
    ],
);

pub(crate) const NEW_NETWORK_ARGS: &[ArgSpec] = args!(
    computation_offset:        ComputationOffset,
    fee_vault_offset:          AccountOffset,
    mpc_callback_data_offset:  AccountOffset,
    transfer_amount:           Amount,
    deposit_amount:            Amount,
    priority_fees:             PriorityFees,
    optional_data:             OptionalData,
    random_generation_seed:    RandomGenerationSeed,
    destination_discriminator: InstructionDiscriminator,
    destination_program:       pubkey,
    cpi_account_1:             pubkey,
);

/// Source: `deposit_from_public_balance_into_new_shared_balance_v17` (v17 IDL).
pub(crate) const NEW_SHARED: &[AccountSpec] = schema_observer_ata!(
    signer = "depositor_address",
    fee_payer = "fee_payer",
    user = [
        ("depositor_spl_ata",      w = true , s = false),
        ("receiver_address",       w = false, s = false),
        ("receiver_token_account", w = true , s = false),
        ("receiver_user_account",  w = false, s = false),
        ("fee_schedule",           w = false, s = false),
        ("fee_vault",              w = true , s = false),
        ("protocol_config",        w = false, s = false),
        ("token_pool",             w = false, s = false),
        ("token_pool_spl_ata",     w = true , s = false),
        ("mint",                   w = false, s = false),
        ("token_program",          w = false, s = false),
        ("computation_data",       w = true , s = false),
    ],
);

pub(crate) const NEW_SHARED_ARGS: &[ArgSpec] = args!(
    computation_offset:        ComputationOffset,
    fee_vault_offset:          AccountOffset,
    mpc_callback_data_offset:  AccountOffset,
    transfer_amount:           Amount,
    deposit_amount:            Amount,
    priority_fees:             PriorityFees,
    optional_data:             OptionalData,
    destination_discriminator: InstructionDiscriminator,
    destination_program:       pubkey,
    cpi_account_1:             pubkey,
);
