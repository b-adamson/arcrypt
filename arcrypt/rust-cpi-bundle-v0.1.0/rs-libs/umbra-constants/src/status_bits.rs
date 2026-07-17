//! Status bit flag positions per account type.
//!
//! Each account type has its own set of flag positions. These MUST match
//! the `flags(...)` definitions in the `#[umbra_account]` macro or the
//! manual `status_bit_flag!` / const definitions in the smart contract.

/// Pool account status bits
/// Source: `smart-contract/programs/umbra/src/state/pool/pool.rs`
pub mod pool {
    pub const IS_INITIALISED: u32 = 0;
    pub const IS_CONFIDENTIAL_POOL_INITIALISED: u32 = 1;
    pub const IS_CONFIDENTIAL_POOL_ACTIVE: u32 = 2;
    pub const IS_MIXER_POOL_INITIALISED: u32 = 3;
    pub const IS_MIXER_POOL_ACTIVE: u32 = 4;
}

/// ProgramInformation account status bits
/// Source: `smart-contract/programs/umbra/src/state/global/program_information.rs`
pub mod program_information {
    pub const IS_INITIALISED: u32 = 0;
    pub const IS_ACTIVE: u32 = 1;
}

/// WalletSpecifier account status bits
/// Source: `smart-contract/programs/umbra/src/state/global/wallet_specifier.rs`
pub mod wallet_specifier {
    pub const IS_INITIALISED: u32 = 0;
}

/// MixerTree account status bits (zero-copy, manual flags)
/// Source: `smart-contract/programs/umbra/src/state/pool/mixer_tree.rs`
pub mod mixer_tree {
    pub const IS_INITIALISED: u32 = 0;
    pub const IS_MIXER_POOL_INITIALISED: u32 = 1;
    pub const IS_MIXER_POOL_ACTIVE: u32 = 2;
}

/// TreapHeader account status bits (bytemuck, manual consts)
/// Source: `smart-contract/programs/umbra/src/state/treap/treap_header.rs`
pub mod treap_header {
    pub const IS_INITIALISED: u32 = 0;
    pub const IS_ACTIVE: u32 = 1;
}

/// ProtocolFeesConfiguration account status bits
/// Source: `smart-contract/programs/umbra/src/state/fees/protocol_fees_configuration.rs`
pub mod protocol_fees_configuration {
    pub const IS_INITIALISED: u32 = 0;
    pub const IS_ACTIVE: u32 = 1;
}

/// RelayerAccount status bits
/// Source: `smart-contract/programs/umbra/src/state/relayer/relayer_account.rs`
pub mod relayer_account {
    pub const IS_INITIALISED: u32 = 0;
    pub const IS_ACTIVE: u32 = 1;
}

/// RelayerFeesConfiguration status bits
/// Source: `smart-contract/programs/umbra/src/state/relayer/relayer_fees_configuration.rs`
pub mod relayer_fees_configuration {
    pub const IS_INITIALISED: u32 = 0;
    pub const IS_ACTIVE: u32 = 1;
}

/// ArciumEncryptedTokenAccount status bits
/// Source: `smart-contract/programs/umbra/src/state/arcium/arcium_encrypted_token_account.rs`
pub mod arcium_encrypted_token_account {
    pub const IS_INITIALISED: u32 = 0;
    pub const IS_ACTIVE_FOR_CONFIDENTIAL_USAGE: u32 = 1;
    pub const IS_ACTIVE_FOR_ANONYMOUS_USAGE: u32 = 2;
    pub const IS_SHARED_MODE: u32 = 3;
    pub const IS_ARCIUM_BALANCE_INITIALISED: u32 = 4;
}

/// ArciumEncryptedUserAccount status bits
/// Source: `smart-contract/programs/umbra/src/state/arcium/arcium_encrypted_user_account.rs`
pub mod arcium_encrypted_user_account {
    pub const IS_INITIALISED: u32 = 0;
    pub const IS_ACTIVE_FOR_ANONYMOUS_USAGE: u32 = 1;
    pub const IS_USER_COMMITMENT_REGISTERED: u32 = 2;
    pub const IS_X25519_MVK_PUBKEY_REGISTERED: u32 = 3;
    pub const IS_X25519_TOKEN_PUBKEY_REGISTERED: u32 = 4;
}

/// Check if a specific bit is set in a status bits value
#[inline]
pub fn is_bit_set(status_bits: u64, bit: u32) -> bool {
    status_bits & (1u64 << bit) != 0
}
