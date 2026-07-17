//! Permissionless-address constant.
//!
//! Mirrors `PERMISSIONLESS_ADDRESS` in
//! `anchor-program/programs/umbra/src/constants/umbra.rs`. Used as the
//! `allowed_address` seed for permissionless `FeeSchedule` /
//! `RelayerFeeSchedule` PDAs — i.e. schedules anyone may use.
//!
//! The vanity address is `UmbraPr1vacy1111111111111111111111111111111`.
//! Its private key is unknown by construction (the trailing `1`s force the
//! base-58 decoding to land on a curve point with no preimage), so a schedule
//! keyed under this address can never be re-targeted to a user-restricted
//! variant.

use crate::program_ids::SolanaPublicKey;

/// 32-byte raw representation of `UmbraPr1vacy1111111111111111111111111111111`.
pub const PERMISSIONLESS_ADDRESS: SolanaPublicKey = SolanaPublicKey {
    first: [
        0x07, 0x1d, 0x1c, 0xbf, 0x3f, 0xc2, 0x59, 0xa1, 0xc4, 0x56, 0xc5, 0xcf, 0x61, 0x45, 0xbf,
        0x96, 0xf0, 0xf8, 0x8f, 0x15, 0x5d, 0xed, 0xd7, 0x6f, 0xdb, 0xde, 0x10, 0xed, 0x00, 0x00,
        0x00, 0x00,
    ],
};

/// Base-58 string form of `PERMISSIONLESS_ADDRESS`. Convenience for callers
/// that pass pubkeys around as strings.
pub const PERMISSIONLESS_ADDRESS_STR: &str = "UmbraPr1vacy1111111111111111111111111111111";
