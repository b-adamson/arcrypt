//! Schemas for `instructions/compliance/reencrypt/`.

use crate::{AccountSpec, ArgSpec};

/// Source: `reencrypt_network_grant_for_network_balance_v17` (v17 IDL).
pub(crate) const NETWORK_GRANT_NETWORK: &[AccountSpec] = schema_base!(
    signer = "receiver",
    fee_payer = "fee_payer",
    user = [
        ("viewing_grant",    w = false, s = false),
        ("protocol_config",  w = false, s = false),
        ("computation_data", w = true , s = false),
    ],
);

pub(crate) const NETWORK_GRANT_NETWORK_ARGS: &[ArgSpec] = args!(
    computation_offset:       ComputationOffset,
    receiver_x25519_key:      ArciumX25519PublicKey,
    nonce:                    ArciumX25519Nonce,
    input_encryption_nonce:   ArciumX25519Nonce,
    input_ciphertext_0:       RescueCiphertext,
    input_ciphertext_1:       RescueCiphertext,
    input_ciphertext_2:       RescueCiphertext,
    input_ciphertext_3:       RescueCiphertext,
    input_ciphertext_4:       RescueCiphertext,
    input_ciphertext_5:       RescueCiphertext,
    mpc_callback_data_offset: AccountOffset,
    priority_fees:            PriorityFees,
    optional_data:            OptionalData,
);

/// Source: `reencrypt_network_grant_for_shared_balance_v17` (v17 IDL).
pub(crate) const NETWORK_GRANT_SHARED: &[AccountSpec] = schema_base!(
    signer = "receiver",
    fee_payer = "fee_payer",
    user = [
        ("viewing_grant",    w = false, s = false),
        ("protocol_config",  w = false, s = false),
        ("computation_data", w = true , s = false),
    ],
);

pub(crate) const NETWORK_GRANT_SHARED_ARGS: &[ArgSpec] = args!(
    computation_offset:       ComputationOffset,
    granter_x25519_key:       ArciumX25519PublicKey,
    receiver_x25519_key:      ArciumX25519PublicKey,
    nonce:                    ArciumX25519Nonce,
    input_encryption_nonce:   ArciumX25519Nonce,
    input_ciphertext_0:       RescueCiphertext,
    input_ciphertext_1:       RescueCiphertext,
    input_ciphertext_2:       RescueCiphertext,
    input_ciphertext_3:       RescueCiphertext,
    input_ciphertext_4:       RescueCiphertext,
    input_ciphertext_5:       RescueCiphertext,
    mpc_callback_data_offset: AccountOffset,
    priority_fees:            PriorityFees,
    optional_data:            OptionalData,
);

/// Source: `reencrypt_user_grant_v17` (v17 IDL).
pub(crate) const USER_GRANT: &[AccountSpec] = schema_base!(
    signer = "receiver",
    fee_payer = "fee_payer",
    user = [
        ("viewing_grant",    w = false, s = false),
        ("protocol_config",  w = false, s = false),
        ("computation_data", w = true , s = false),
    ],
);

pub(crate) const USER_GRANT_ARGS: &[ArgSpec] = args!(
    computation_offset:       ComputationOffset,
    granter_x25519_key:       ArciumX25519PublicKey,
    receiver_x25519_key:      ArciumX25519PublicKey,
    nonce:                    ArciumX25519Nonce,
    input_encryption_nonce:   ArciumX25519Nonce,
    input_ciphertext_0:       RescueCiphertext,
    input_ciphertext_1:       RescueCiphertext,
    input_ciphertext_2:       RescueCiphertext,
    input_ciphertext_3:       RescueCiphertext,
    input_ciphertext_4:       RescueCiphertext,
    input_ciphertext_5:       RescueCiphertext,
    mpc_callback_data_offset: AccountOffset,
    priority_fees:            PriorityFees,
    optional_data:            OptionalData,
);
