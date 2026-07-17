//! Schemas for `instructions/transfer/`.

use crate::{AccountSpec, ArgSpec};

/// Source: `transfer_from_network_balance_to_existing_network_balance_v17` (v17 IDL).
pub(crate) const NETWORK_TO_EXISTING_NETWORK: &[AccountSpec] = schema_observer!(
    signer = "sender",
    fee_payer = "fee_payer",
    user = [
        ("sender_token_account",   w = true , s = false),
        ("receiver_address",       w = false, s = false),
        ("receiver_token_account", w = true , s = false),
        ("fee_schedule",           w = false, s = false),
        ("fee_vault",              w = true , s = false),
        ("token_pool",             w = false, s = false),
        ("mint",                   w = false, s = false),
        ("protocol_config",        w = false, s = false),
        ("computation_data",       w = true , s = false),
    ],
);

pub(crate) const NETWORK_TO_EXISTING_NETWORK_ARGS: &[ArgSpec] = args!(
    computation_offset:                ComputationOffset,
    fee_vault_offset:                  AccountOffset,
    mpc_callback_data_offset:          AccountOffset,
    rescue_encryption_public_key:      ArciumX25519PublicKey,
    rescue_encryption_nonce:           ArciumX25519Nonce,
    rescue_encrypted_transfer_amount:  RescueCiphertext,
    dispatch_observer_cpi:             DispatchObserverCpi,
    observer_output_x25519_public_key: ArciumX25519PublicKey,
    destination_discriminator:         InstructionDiscriminator,
    priority_fees:                     PriorityFees,
    optional_data:                     OptionalData,
    destination_program:               pubkey,
    cpi_account_1:                     pubkey,
);

/// Source: `transfer_from_network_balance_to_existing_shared_balance_v17` (v17 IDL).
pub(crate) const NETWORK_TO_EXISTING_SHARED: &[AccountSpec] = schema_observer!(
    signer = "sender",
    fee_payer = "fee_payer",
    user = [
        ("sender_token_account",   w = true , s = false),
        ("receiver_address",       w = false, s = false),
        ("receiver_token_account", w = true , s = false),
        ("fee_schedule",           w = false, s = false),
        ("fee_vault",              w = true , s = false),
        ("token_pool",             w = false, s = false),
        ("mint",                   w = false, s = false),
        ("protocol_config",        w = false, s = false),
        ("computation_data",       w = true , s = false),
    ],
);

pub(crate) const NETWORK_TO_EXISTING_SHARED_ARGS: &[ArgSpec] = args!(
    computation_offset:                ComputationOffset,
    fee_vault_offset:                  AccountOffset,
    mpc_callback_data_offset:          AccountOffset,
    rescue_encryption_public_key:      ArciumX25519PublicKey,
    rescue_encryption_nonce:           ArciumX25519Nonce,
    rescue_encrypted_transfer_amount:  RescueCiphertext,
    dispatch_observer_cpi:             DispatchObserverCpi,
    observer_output_x25519_public_key: ArciumX25519PublicKey,
    destination_discriminator:         InstructionDiscriminator,
    priority_fees:                     PriorityFees,
    optional_data:                     OptionalData,
    destination_program:               pubkey,
    cpi_account_1:                     pubkey,
);

/// Source: `transfer_from_network_balance_to_new_network_balance_v17` (v17 IDL).
pub(crate) const NETWORK_TO_NEW_NETWORK: &[AccountSpec] = schema_observer!(
    signer = "sender",
    fee_payer = "fee_payer",
    user = [
        ("sender_token_account",   w = true , s = false),
        ("receiver_address",       w = false, s = false),
        ("receiver_token_account", w = true , s = false),
        ("receiver_user_account",  w = true , s = false),
        ("fee_schedule",           w = false, s = false),
        ("fee_vault",              w = true , s = false),
        ("token_pool",             w = false, s = false),
        ("mint",                   w = false, s = false),
        ("protocol_config",        w = false, s = false),
        ("computation_data",       w = true , s = false),
    ],
);

pub(crate) const NETWORK_TO_NEW_NETWORK_ARGS: &[ArgSpec] = args!(
    computation_offset:                ComputationOffset,
    fee_vault_offset:                  AccountOffset,
    mpc_callback_data_offset:          AccountOffset,
    rescue_encryption_nonce:           ArciumX25519Nonce,
    rescue_encrypted_transfer_amount:  RescueCiphertext,
    rescue_encryption_public_key:      ArciumX25519PublicKey,
    dispatch_observer_cpi:             DispatchObserverCpi,
    observer_output_x25519_public_key: ArciumX25519PublicKey,
    destination_discriminator:         InstructionDiscriminator,
    priority_fees:                     PriorityFees,
    optional_data:                     OptionalData,
    random_generation_seed:            RandomGenerationSeed,
    destination_program:               pubkey,
    cpi_account_1:                     pubkey,
);

/// Source: `transfer_from_network_balance_to_new_shared_balance_v17` (v17 IDL).
pub(crate) const NETWORK_TO_NEW_SHARED: &[AccountSpec] = schema_observer!(
    signer = "sender",
    fee_payer = "fee_payer",
    user = [
        ("sender_token_account",   w = true , s = false),
        ("receiver_address",       w = false, s = false),
        ("receiver_token_account", w = true , s = false),
        ("receiver_user_account",  w = true , s = false),
        ("fee_schedule",           w = false, s = false),
        ("fee_vault",              w = true , s = false),
        ("token_pool",             w = false, s = false),
        ("mint",                   w = false, s = false),
        ("protocol_config",        w = false, s = false),
        ("computation_data",       w = true , s = false),
    ],
);

pub(crate) const NETWORK_TO_NEW_SHARED_ARGS: &[ArgSpec] = args!(
    computation_offset:                ComputationOffset,
    fee_vault_offset:                  AccountOffset,
    mpc_callback_data_offset:          AccountOffset,
    rescue_encryption_nonce:           ArciumX25519Nonce,
    rescue_encrypted_transfer_amount:  RescueCiphertext,
    rescue_encryption_public_key:      ArciumX25519PublicKey,
    dispatch_observer_cpi:             DispatchObserverCpi,
    observer_output_x25519_public_key: ArciumX25519PublicKey,
    destination_discriminator:         InstructionDiscriminator,
    priority_fees:                     PriorityFees,
    optional_data:                     OptionalData,
    destination_program:               pubkey,
    cpi_account_1:                     pubkey,
);

/// Source: `transfer_from_shared_balance_to_existing_network_balance_v17` (v17 IDL).
pub(crate) const SHARED_TO_EXISTING_NETWORK: &[AccountSpec] = schema_observer!(
    signer = "sender",
    fee_payer = "fee_payer",
    user = [
        ("sender_token_account",   w = true , s = false),
        ("receiver_address",       w = false, s = false),
        ("receiver_token_account", w = true , s = false),
        ("fee_schedule",           w = false, s = false),
        ("fee_vault",              w = true , s = false),
        ("token_pool",             w = false, s = false),
        ("mint",                   w = false, s = false),
        ("protocol_config",        w = false, s = false),
        ("computation_data",       w = true , s = false),
    ],
);

pub(crate) const SHARED_TO_EXISTING_NETWORK_ARGS: &[ArgSpec] = args!(
    computation_offset:                ComputationOffset,
    fee_vault_offset:                  AccountOffset,
    mpc_callback_data_offset:          AccountOffset,
    rescue_encryption_public_key:      ArciumX25519PublicKey,
    rescue_encryption_nonce:           ArciumX25519Nonce,
    rescue_encrypted_transfer_amount:  RescueCiphertext,
    dispatch_observer_cpi:             DispatchObserverCpi,
    observer_output_x25519_public_key: ArciumX25519PublicKey,
    destination_discriminator:         InstructionDiscriminator,
    priority_fees:                     PriorityFees,
    optional_data:                     OptionalData,
    destination_program:               pubkey,
    cpi_account_1:                     pubkey,
);

/// Source: `transfer_from_shared_balance_to_existing_shared_balance_v17` (v17 IDL).
pub(crate) const SHARED_TO_EXISTING_SHARED: &[AccountSpec] = schema_observer!(
    signer = "sender",
    fee_payer = "fee_payer",
    user = [
        ("sender_token_account",   w = true , s = false),
        ("receiver_address",       w = false, s = false),
        ("receiver_token_account", w = true , s = false),
        ("fee_schedule",           w = false, s = false),
        ("fee_vault",              w = true , s = false),
        ("token_pool",             w = false, s = false),
        ("mint",                   w = false, s = false),
        ("protocol_config",        w = false, s = false),
        ("computation_data",       w = true , s = false),
    ],
);

pub(crate) const SHARED_TO_EXISTING_SHARED_ARGS: &[ArgSpec] = args!(
    computation_offset:                ComputationOffset,
    fee_vault_offset:                  AccountOffset,
    mpc_callback_data_offset:          AccountOffset,
    rescue_encryption_public_key:      ArciumX25519PublicKey,
    rescue_encryption_nonce:           ArciumX25519Nonce,
    rescue_encrypted_transfer_amount:  RescueCiphertext,
    dispatch_observer_cpi:             DispatchObserverCpi,
    observer_output_x25519_public_key: ArciumX25519PublicKey,
    destination_discriminator:         InstructionDiscriminator,
    priority_fees:                     PriorityFees,
    optional_data:                     OptionalData,
    destination_program:               pubkey,
    cpi_account_1:                     pubkey,
);

/// Source: `transfer_from_shared_balance_to_new_network_balance_v17` (v17 IDL).
pub(crate) const SHARED_TO_NEW_NETWORK: &[AccountSpec] = schema_observer!(
    signer = "sender",
    fee_payer = "fee_payer",
    user = [
        ("sender_token_account",   w = true , s = false),
        ("receiver_address",       w = false, s = false),
        ("receiver_token_account", w = true , s = false),
        ("receiver_user_account",  w = true , s = false),
        ("fee_schedule",           w = false, s = false),
        ("fee_vault",              w = true , s = false),
        ("token_pool",             w = false, s = false),
        ("mint",                   w = false, s = false),
        ("protocol_config",        w = false, s = false),
        ("computation_data",       w = true , s = false),
    ],
);

pub(crate) const SHARED_TO_NEW_NETWORK_ARGS: &[ArgSpec] = args!(
    computation_offset:                ComputationOffset,
    fee_vault_offset:                  AccountOffset,
    mpc_callback_data_offset:          AccountOffset,
    rescue_encryption_nonce:           ArciumX25519Nonce,
    rescue_encrypted_transfer_amount:  RescueCiphertext,
    rescue_encryption_public_key:      ArciumX25519PublicKey,
    dispatch_observer_cpi:             DispatchObserverCpi,
    observer_output_x25519_public_key: ArciumX25519PublicKey,
    destination_discriminator:         InstructionDiscriminator,
    priority_fees:                     PriorityFees,
    optional_data:                     OptionalData,
    random_generation_seed:            RandomGenerationSeed,
    destination_program:               pubkey,
    cpi_account_1:                     pubkey,
);

/// Source: `transfer_from_shared_balance_to_new_shared_balance_v17` (v17 IDL).
pub(crate) const SHARED_TO_NEW_SHARED: &[AccountSpec] = schema_observer!(
    signer = "sender",
    fee_payer = "fee_payer",
    user = [
        ("sender_token_account",   w = true , s = false),
        ("receiver_address",       w = false, s = false),
        ("receiver_token_account", w = true , s = false),
        ("receiver_user_account",  w = true , s = false),
        ("fee_schedule",           w = false, s = false),
        ("fee_vault",              w = true , s = false),
        ("token_pool",             w = false, s = false),
        ("mint",                   w = false, s = false),
        ("protocol_config",        w = false, s = false),
        ("computation_data",       w = true , s = false),
    ],
);

pub(crate) const SHARED_TO_NEW_SHARED_ARGS: &[ArgSpec] = args!(
    computation_offset:                ComputationOffset,
    fee_vault_offset:                  AccountOffset,
    mpc_callback_data_offset:          AccountOffset,
    rescue_encryption_nonce:           ArciumX25519Nonce,
    rescue_encrypted_transfer_amount:  RescueCiphertext,
    rescue_encryption_public_key:      ArciumX25519PublicKey,
    dispatch_observer_cpi:             DispatchObserverCpi,
    observer_output_x25519_public_key: ArciumX25519PublicKey,
    destination_discriminator:         InstructionDiscriminator,
    priority_fees:                     PriorityFees,
    optional_data:                     OptionalData,
    destination_program:               pubkey,
    cpi_account_1:                     pubkey,
);
