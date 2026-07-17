//! Schemas for `instructions/withdraw/`.

use crate::{AccountSpec, ArgSpec};

/// Source: `withdraw_from_network_balance_into_public_balance_v17` (v17 IDL).
pub(crate) const NETWORK_TO_PUBLIC: &[AccountSpec] = schema_observer_ata!(
    signer = "user_address",
    fee_payer = "fee_payer",
    user = [
        ("user_token_account",                                 w = true , s = false),
        ("fee_schedule",                                       w = false, s = false),
        ("fee_vault",                                          w = true , s = false),
        ("token_pool",                                         w = false, s = false),
        ("mint",                                               w = false, s = false),
        ("protocol_config",                                    w = false, s = false),
        ("user_spl_ata",                                       w = true , s = false),
        ("token_pool_spl_ata",                                 w = false, s = false),
        ("token_program",                                      w = false, s = false),
        ("computation_data",                                   w = true , s = false),
        ("mpc_callback_wrapped_sol_unwrapping_helper_account", w = true , s = false),
    ],
);

pub(crate) const NETWORK_TO_PUBLIC_ARGS: &[ArgSpec] = args!(
    computation_offset:        ComputationOffset,
    fee_vault_offset:          AccountOffset,
    mpc_callback_data_offset:  AccountOffset,
    withdrawal_amount:         Amount,
    priority_fees:             PriorityFees,
    optional_data:             OptionalData,
    destination_discriminator: InstructionDiscriminator,
    destination_program:       pubkey,
    cpi_account_1:             pubkey,
);

/// Source: `withdraw_from_shared_balance_into_public_balance_v17` (v17 IDL).
pub(crate) const SHARED_TO_PUBLIC: &[AccountSpec] = schema_observer_ata!(
    signer = "user_address",
    fee_payer = "fee_payer",
    user = [
        ("user_token_account",                                 w = true , s = false),
        ("fee_schedule",                                       w = false, s = false),
        ("fee_vault",                                          w = true , s = false),
        ("token_pool",                                         w = false, s = false),
        ("mint",                                               w = false, s = false),
        ("protocol_config",                                    w = false, s = false),
        ("user_spl_ata",                                       w = true , s = false),
        ("token_pool_spl_ata",                                 w = false, s = false),
        ("token_program",                                      w = false, s = false),
        ("computation_data",                                   w = true , s = false),
        ("mpc_callback_wrapped_sol_unwrapping_helper_account", w = true , s = false),
    ],
);

pub(crate) const SHARED_TO_PUBLIC_ARGS: &[ArgSpec] = args!(
    computation_offset:        ComputationOffset,
    fee_vault_offset:          AccountOffset,
    mpc_callback_data_offset:  AccountOffset,
    withdrawal_amount:         Amount,
    priority_fees:             PriorityFees,
    optional_data:             OptionalData,
    destination_discriminator: InstructionDiscriminator,
    destination_program:       pubkey,
    cpi_account_1:             pubkey,
);
