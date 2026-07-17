//! Schemas for `instructions/deposit_into_stealth_pool/from_encrypted_token_account/`.

use crate::{AccountSpec, ArgSpec};

/// Source: `deposit_into_stealth_pool_from_network_balance_v17` (v17 IDL).
pub(crate) const FROM_NETWORK_BALANCE: &[AccountSpec] = schema_observer!(
    signer = "depositor",
    fee_payer = "fee_payer",
    user = [
        ("stealth_pool_deposit_input_buffer", w = true , s = false),
        ("computation_data",                  w = true , s = false),
        ("depositor_user_account",            w = false, s = false),
        ("depositor_token_account",           w = true , s = false),
        ("fee_schedule",                      w = false, s = false),
        ("fee_vault",                         w = true , s = false),
        ("stealth_pool",                      w = false, s = false),
        ("token_pool",                        w = true , s = false),
        ("mint",                              w = false, s = false),
        ("token_program",                     w = false, s = false),
        ("token_pool_spl_ata",                w = false, s = false),
        ("protocol_config",                   w = false, s = false),
        ("zero_knowledge_verifying_key",      w = false, s = false),
        ("lottery_config",                    w = false, s = false),
        ("clock_sysvar_account",              w = false, s = false),
    ],
);

pub(crate) const FROM_NETWORK_BALANCE_ARGS: &[ArgSpec] = args!(
    computation_offset:                       ComputationOffset,
    fee_vault_offset:                         AccountOffset,
    stealth_pool_deposit_input_buffer_offset: AccountOffset,
    mpc_callback_data_offset:                 AccountOffset,
    dispatch_observer_cpi:                    DispatchObserverCpi,
    observer_output_x25519_public_key:        ArciumX25519PublicKey,
    destination_discriminator:                InstructionDiscriminator,
    priority_fees:                            PriorityFees,
    aes_encrypted_data:                       AesEncryptedUnspentTransactionOutputData,
    optional_data:                            OptionalData,
    destination_program:                      pubkey,
    cpi_account_1:                            pubkey,
);

/// Source: `deposit_into_stealth_pool_from_network_balance_with_encrypted_address_v17` (v17 IDL).
pub(crate) const FROM_NETWORK_BALANCE_WITH_ENCRYPTED_ADDRESS: &[AccountSpec] = schema_observer!(
    signer = "depositor",
    fee_payer = "fee_payer",
    user = [
        ("stealth_pool_deposit_with_encrypted_address_input_buffer", w = true , s = false),
        ("computation_data",                                         w = true , s = false),
        ("depositor_user_account",                                   w = false, s = false),
        ("depositor_token_account",                                  w = true , s = false),
        ("fee_schedule",                                             w = false, s = false),
        ("fee_vault",                                                w = true , s = false),
        ("stealth_pool",                                             w = false, s = false),
        ("token_pool",                                               w = true , s = false),
        ("mint",                                                     w = false, s = false),
        ("token_program",                                            w = false, s = false),
        ("token_pool_spl_ata",                                       w = false, s = false),
        ("protocol_config",                                          w = false, s = false),
        ("zero_knowledge_verifying_key",                             w = false, s = false),
        ("clock_sysvar_account",                                     w = false, s = false),
    ],
);

pub(crate) const FROM_NETWORK_BALANCE_WITH_ENCRYPTED_ADDRESS_ARGS: &[ArgSpec] = args!(
    computation_offset:                ComputationOffset,
    fee_vault_offset:                  AccountOffset,
    input_buffer_offset:               AccountOffset,
    mpc_callback_data_offset:          AccountOffset,
    amount_to_deduct:                  Amount,
    insertion_h2_commitment:           PoseidonHash,
    insertion_timestamp:               UnixEpochTimestamp,
    linker_encryption_0:               PoseidonCiphertext,
    linker_encryption_1:               PoseidonCiphertext,
    keystream_commitment_0:            PoseidonHash,
    keystream_commitment_1:            PoseidonHash,
    dispatch_observer_cpi:             DispatchObserverCpi,
    observer_output_x25519_public_key: ArciumX25519PublicKey,
    destination_discriminator:         InstructionDiscriminator,
    priority_fees:                     PriorityFees,
);

/// Source: `deposit_into_stealth_pool_from_shared_balance_v17` (v17 IDL).
pub(crate) const FROM_SHARED_BALANCE: &[AccountSpec] = schema_observer!(
    signer = "depositor",
    fee_payer = "fee_payer",
    user = [
        ("stealth_pool_deposit_input_buffer", w = true , s = false),
        ("computation_data",                  w = true , s = false),
        ("depositor_user_account",            w = false, s = false),
        ("depositor_token_account",           w = true , s = false),
        ("fee_schedule",                      w = false, s = false),
        ("fee_vault",                         w = true , s = false),
        ("stealth_pool",                      w = false, s = false),
        ("token_pool",                        w = true , s = false),
        ("mint",                              w = false, s = false),
        ("token_program",                     w = false, s = false),
        ("token_pool_spl_ata",                w = false, s = false),
        ("protocol_config",                   w = false, s = false),
        ("zero_knowledge_verifying_key",      w = false, s = false),
        ("lottery_config",                    w = false, s = false),
        ("clock_sysvar_account",              w = false, s = false),
    ],
);

pub(crate) const FROM_SHARED_BALANCE_ARGS: &[ArgSpec] = args!(
    computation_offset:                       ComputationOffset,
    fee_vault_offset:                         AccountOffset,
    stealth_pool_deposit_input_buffer_offset: AccountOffset,
    mpc_callback_data_offset:                 AccountOffset,
    dispatch_observer_cpi:                    DispatchObserverCpi,
    observer_output_x25519_public_key:        ArciumX25519PublicKey,
    destination_discriminator:                InstructionDiscriminator,
    priority_fees:                            PriorityFees,
    aes_encrypted_data:                       AesEncryptedUnspentTransactionOutputData,
    optional_data:                            OptionalData,
    destination_program:                      pubkey,
    cpi_account_1:                            pubkey,
);
