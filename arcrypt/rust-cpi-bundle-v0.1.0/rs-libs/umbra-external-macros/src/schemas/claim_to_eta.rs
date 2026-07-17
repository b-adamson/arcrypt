//! Schemas for `instructions/claim/to_encrypted_token_account/`.
//! All 4 ixs use the single-signer + observer pattern (claim-path slim-down — `81dfbbe0`).

use crate::{AccountSpec, ArgSpec};

/// Source: `claim_into_existing_network_balance_v17` (v17 IDL).
pub(crate) const EXISTING_NETWORK: &[AccountSpec] = schema_single_signer_observer!(
    signer = "relayer",
    user = [
        ("claim_input_buffer",           w = true , s = false),
        ("receiver_address",             w = false, s = false),
        ("receiver_token_account",       w = true , s = false),
        ("relayer_account",              w = true , s = false),
        ("relayer_fee_schedule",         w = false, s = false),
        ("fee_schedule",                 w = false, s = false),
        ("fee_vault",                    w = true , s = false),
        ("token_pool",                   w = true , s = false),
        ("mint",                         w = false, s = false),
        ("protocol_config",              w = false, s = false),
        ("stealth_pool",                 w = false, s = false),
        ("nullifier_and_linker_buffer",  w = true , s = false),
        ("nullifier_set_1",              w = true , s = false),
        ("nullifier_set_2",              w = true , s = false),
        ("nullifier_set_3",              w = true , s = false),
        ("nullifier_set_4",              w = true , s = false),
        ("nullifier_set_5",              w = true , s = false),
        ("zero_knowledge_verifying_key", w = false, s = false),
        ("computation_data",             w = true , s = false),
        ("lottery_config",               w = false, s = false),
    ],
);

pub(crate) const EXISTING_NETWORK_ARGS: &[ArgSpec] = args!(
    computation_offset:                 ComputationOffset,
    fee_vault_offset:                   AccountOffset,
    mpc_callback_data_offset:           AccountOffset,
    number_of_burns:                    NumberOfBurns,
    claim_input_buffer_offset:          AccountOffset,
    stealth_pool_index:                 AccountOffset,
    nullifier_and_linker_buffer_offset: AccountOffset,
    audit_tree_offset:                  AccountOffset,
    dispatch_observer_cpi:              DispatchObserverCpi,
    observer_output_x25519_public_key:  ArciumX25519PublicKey,
    destination_discriminator:          InstructionDiscriminator,
    priority_fees:                      PriorityFees,
    optional_data:                      OptionalData,
);

/// Source: `claim_into_existing_shared_balance_v17` (v17 IDL).
pub(crate) const EXISTING_SHARED: &[AccountSpec] = schema_single_signer_observer!(
    signer = "relayer",
    user = [
        ("claim_input_buffer",           w = true , s = false),
        ("receiver_address",             w = false, s = false),
        ("receiver_user_account",        w = false, s = false),
        ("receiver_token_account",       w = true , s = false),
        ("relayer_account",              w = true , s = false),
        ("relayer_fee_schedule",         w = false, s = false),
        ("fee_schedule",                 w = false, s = false),
        ("fee_vault",                    w = true , s = false),
        ("token_pool",                   w = true , s = false),
        ("mint",                         w = false, s = false),
        ("protocol_config",              w = false, s = false),
        ("stealth_pool",                 w = false, s = false),
        ("nullifier_and_linker_buffer",  w = true , s = false),
        ("nullifier_set_1",              w = true , s = false),
        ("nullifier_set_2",              w = true , s = false),
        ("nullifier_set_3",              w = true , s = false),
        ("nullifier_set_4",              w = true , s = false),
        ("nullifier_set_5",              w = true , s = false),
        ("zero_knowledge_verifying_key", w = false, s = false),
        ("computation_data",             w = true , s = false),
        ("lottery_config",               w = false, s = false),
    ],
);

pub(crate) const EXISTING_SHARED_ARGS: &[ArgSpec] = args!(
    computation_offset:                 ComputationOffset,
    fee_vault_offset:                   AccountOffset,
    mpc_callback_data_offset:           AccountOffset,
    number_of_burns:                    NumberOfBurns,
    claim_input_buffer_offset:          AccountOffset,
    stealth_pool_index:                 AccountOffset,
    nullifier_and_linker_buffer_offset: AccountOffset,
    dispatch_observer_cpi:              DispatchObserverCpi,
    observer_output_x25519_public_key:  ArciumX25519PublicKey,
    destination_discriminator:          InstructionDiscriminator,
    priority_fees:                      PriorityFees,
    optional_data:                      OptionalData,
);

/// Source: `claim_into_new_network_balance_v17` (v17 IDL).
pub(crate) const NEW_NETWORK: &[AccountSpec] = schema_single_signer_observer!(
    signer = "relayer",
    user = [
        ("claim_input_buffer",           w = true , s = false),
        ("receiver_address",             w = false, s = false),
        ("receiver_token_account",       w = true , s = false),
        ("receiver_user_account",        w = true , s = false),
        ("relayer_account",              w = true , s = false),
        ("relayer_fee_schedule",         w = false, s = false),
        ("fee_schedule",                 w = false, s = false),
        ("fee_vault",                    w = true , s = false),
        ("token_pool",                   w = true , s = false),
        ("mint",                         w = false, s = false),
        ("protocol_config",              w = false, s = false),
        ("stealth_pool",                 w = false, s = false),
        ("nullifier_and_linker_buffer",  w = true , s = false),
        ("nullifier_set_1",              w = true , s = false),
        ("nullifier_set_2",              w = true , s = false),
        ("nullifier_set_3",              w = true , s = false),
        ("nullifier_set_4",              w = true , s = false),
        ("nullifier_set_5",              w = true , s = false),
        ("zero_knowledge_verifying_key", w = false, s = false),
        ("computation_data",             w = true , s = false),
        ("lottery_config",               w = false, s = false),
    ],
);

pub(crate) const NEW_NETWORK_ARGS: &[ArgSpec] = args!(
    computation_offset:                 ComputationOffset,
    fee_vault_offset:                   AccountOffset,
    mpc_callback_data_offset:           AccountOffset,
    number_of_burns:                    NumberOfBurns,
    claim_input_buffer_offset:          AccountOffset,
    stealth_pool_index:                 AccountOffset,
    nullifier_and_linker_buffer_offset: AccountOffset,
    audit_tree_offset:                  AccountOffset,
    random_generation_seed:             RandomGenerationSeed,
    dispatch_observer_cpi:              DispatchObserverCpi,
    observer_output_x25519_public_key:  ArciumX25519PublicKey,
    destination_discriminator:          InstructionDiscriminator,
    priority_fees:                      PriorityFees,
    optional_data:                      OptionalData,
);

/// Source: `claim_into_new_shared_balance_v17` (v17 IDL).
pub(crate) const NEW_SHARED: &[AccountSpec] = schema_single_signer_observer!(
    signer = "relayer",
    user = [
        ("claim_input_buffer",           w = true , s = false),
        ("receiver_address",             w = false, s = false),
        ("receiver_user_account",        w = false, s = false),
        ("receiver_token_account",       w = true , s = false),
        ("relayer_account",              w = true , s = false),
        ("relayer_fee_schedule",         w = false, s = false),
        ("fee_schedule",                 w = false, s = false),
        ("fee_vault",                    w = true , s = false),
        ("token_pool",                   w = true , s = false),
        ("mint",                         w = false, s = false),
        ("protocol_config",              w = false, s = false),
        ("stealth_pool",                 w = false, s = false),
        ("nullifier_and_linker_buffer",  w = true , s = false),
        ("nullifier_set_1",              w = true , s = false),
        ("nullifier_set_2",              w = true , s = false),
        ("nullifier_set_3",              w = true , s = false),
        ("nullifier_set_4",              w = true , s = false),
        ("nullifier_set_5",              w = true , s = false),
        ("zero_knowledge_verifying_key", w = false, s = false),
        ("computation_data",             w = true , s = false),
        ("lottery_config",               w = false, s = false),
    ],
);

pub(crate) const NEW_SHARED_ARGS: &[ArgSpec] = args!(
    computation_offset:                 ComputationOffset,
    fee_vault_offset:                   AccountOffset,
    mpc_callback_data_offset:           AccountOffset,
    number_of_burns:                    NumberOfBurns,
    claim_input_buffer_offset:          AccountOffset,
    stealth_pool_index:                 AccountOffset,
    nullifier_and_linker_buffer_offset: AccountOffset,
    dispatch_observer_cpi:              DispatchObserverCpi,
    observer_output_x25519_public_key:  ArciumX25519PublicKey,
    destination_discriminator:          InstructionDiscriminator,
    priority_fees:                      PriorityFees,
    optional_data:                      OptionalData,
);
