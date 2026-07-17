//! Schemas for `instructions/claim/to_public_associated_token_account/`.

use crate::{AccountSpec, ArgSpec};

/// Source: `claim_into_public_balance_to_mxe_v17` (v17 IDL).
pub(crate) const TO_MXE: &[AccountSpec] = schema_single_signer!(
    signer = "relayer",
    user = [
        ("public_claim_input_buffer",                          w = true , s = false),
        ("receiver_address",                                   w = false, s = false),
        ("receiver_ata",                                       w = true , s = false),
        ("public_claim_nullifier_and_linker_buffer",           w = false, s = false),
        ("nullifier_set_1",                                    w = true , s = false),
        ("nullifier_set_2",                                    w = true , s = false),
        ("nullifier_set_3",                                    w = true , s = false),
        ("nullifier_set_4",                                    w = true , s = false),
        ("nullifier_set_5",                                    w = true , s = false),
        ("relayer_account",                                    w = false, s = false),
        ("relayer_fee_schedule",                               w = false, s = false),
        ("fee_schedule",                                       w = false, s = false),
        ("fee_vault",                                          w = true , s = false),
        ("zero_knowledge_verifying_key",                       w = false, s = false),
        ("stealth_pool",                                       w = false, s = false),
        ("token_pool",                                         w = false, s = false),
        ("token_pool_ata",                                     w = false, s = false),
        ("mint",                                               w = false, s = false),
        ("protocol_config",                                    w = false, s = false),
        ("token_program",                                      w = false, s = false),
        ("associated_token_program",                           w = false, s = false),
        ("computation_data",                                   w = true , s = false),
        ("mpc_callback_wrapped_sol_unwrapping_helper_account", w = true , s = false),
    ],
);

pub(crate) const TO_MXE_ARGS: &[ArgSpec] = args!(
    computation_offset:                              ComputationOffset,
    fee_vault_offset:                                AccountOffset,
    public_claim_nullifier_and_linker_buffer_offset: AccountOffset,
    public_claim_input_buffer_offset:                AccountOffset,
    mpc_callback_data_offset:                        AccountOffset,
    stealth_pool_index:                              AccountOffset,
    audit_tree_offset:                               AccountOffset,
    amount:                                          Amount,
    relayer_fixed_sol_fees:                          Amount,
    priority_fees:                                   PriorityFees,
);

/// Source: `claim_into_public_balance_to_receiver_v17` (v17 IDL).
pub(crate) const TO_RECEIVER: &[AccountSpec] = schema_single_signer!(
    signer = "relayer",
    user = [
        ("public_claim_input_buffer",                          w = true , s = false),
        ("receiver_address",                                   w = false, s = false),
        ("receiver_ata",                                       w = true , s = false),
        ("receiver_user_account",                              w = false, s = false),
        ("public_claim_nullifier_and_linker_buffer",           w = false, s = false),
        ("nullifier_set_1",                                    w = true , s = false),
        ("nullifier_set_2",                                    w = true , s = false),
        ("nullifier_set_3",                                    w = true , s = false),
        ("nullifier_set_4",                                    w = true , s = false),
        ("nullifier_set_5",                                    w = true , s = false),
        ("relayer_account",                                    w = false, s = false),
        ("relayer_fee_schedule",                               w = false, s = false),
        ("fee_schedule",                                       w = false, s = false),
        ("fee_vault",                                          w = true , s = false),
        ("zero_knowledge_verifying_key",                       w = false, s = false),
        ("stealth_pool",                                       w = false, s = false),
        ("token_pool",                                         w = false, s = false),
        ("token_pool_ata",                                     w = false, s = false),
        ("mint",                                               w = false, s = false),
        ("protocol_config",                                    w = false, s = false),
        ("token_program",                                      w = false, s = false),
        ("associated_token_program",                           w = false, s = false),
        ("computation_data",                                   w = true , s = false),
        ("mpc_callback_wrapped_sol_unwrapping_helper_account", w = true , s = false),
    ],
);

pub(crate) const TO_RECEIVER_ARGS: &[ArgSpec] = args!(
    computation_offset:                              ComputationOffset,
    fee_vault_offset:                                AccountOffset,
    public_claim_nullifier_and_linker_buffer_offset: AccountOffset,
    public_claim_input_buffer_offset:                AccountOffset,
    mpc_callback_data_offset:                        AccountOffset,
    stealth_pool_index:                              AccountOffset,
    amount:                                          Amount,
    relayer_fixed_sol_fees:                          Amount,
    priority_fees:                                   PriorityFees,
    mvk_output_nonce:                                ArciumX25519Nonce,
);
