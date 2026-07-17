//! Constants and types for receiving CPI callbacks from the Umbra program.
//!
//! Used by:
//! - The Umbra program itself (signer-PDA seed for the observer-forward CPI).
//! - Third-party "destination" programs receiving Umbra callbacks via the
//!   `umbra_external_macros::umbra_callback` attribute.

use borsh::{BorshDeserialize, BorshSerialize};
use solana_pubkey::{pubkey, Pubkey};

/// SHA-256("UmbraCallbackSigner") — seed for Umbra's callback-signer PDA
/// (derived under the Umbra program ID). This PDA signs every observer-forward
/// CPI that Umbra makes into a destination program.
pub const UMBRA_CALLBACK_SIGNER_SEED: [u8; 32] = [
    0x2e, 0x67, 0x92, 0x8c, 0xb3, 0x9d, 0xb2, 0xd0, 0x2f, 0xb8, 0x69, 0xb1, 0x2d, 0xe1, 0xfe,
    0xca, 0x7d, 0xe2, 0x0d, 0xa1, 0x8c, 0x6e, 0x52, 0x8f, 0x58, 0x1c, 0x18, 0xd8, 0xc3, 0x11,
    0x3e, 0xeb,
];

/// Canonical callback-signer PDA for the mainnet Umbra deployment. Equivalent
/// to `find_program_address([UMBRA_CALLBACK_SIGNER_SEED], UMBRA_PROGRAM_ID_MAINNET).0`.
/// Hardcoded because `find_program_address` is not const — re-deriving each
/// queue ix would burn ~1500 CU for a value that never changes per-network.
pub const UMBRA_CALLBACK_SIGNER_PDA_MAINNET: Pubkey =
    pubkey!("EGktTdWSEmKcTAa33KhEDyq9p34QfLAS8CbHLhjp8sG9");

/// Bump for `UMBRA_CALLBACK_SIGNER_PDA_MAINNET`. Used by callback handlers
/// when CPI'ing into destination programs via `invoke_signed`.
pub const UMBRA_CALLBACK_SIGNER_BUMP_MAINNET: u8 = 255;

/// Canonical callback-signer PDA for the devnet Umbra deployment. Equivalent
/// to `find_program_address([UMBRA_CALLBACK_SIGNER_SEED], UMBRA_PROGRAM_ID_DEVNET).0`
/// where `UMBRA_PROGRAM_ID_DEVNET = DSuKkyqGVGgo4QtPABfxKJKygUDACbUhirnuv63mEpAJ`.
pub const UMBRA_CALLBACK_SIGNER_PDA_DEVNET: Pubkey =
    pubkey!("9Qd62wU2iC3MQnfFpREsAA6ctP8Kxfrf8PvytcUES2G5");

/// Bump for `UMBRA_CALLBACK_SIGNER_PDA_DEVNET`.
pub const UMBRA_CALLBACK_SIGNER_BUMP_DEVNET: u8 = 255;

/// Seed for the destination program's "UmbraInitiator" PDA — derived under
/// the destination's own program ID. Destinations pass this PDA as `initiator`
/// at queue time; Umbra forwards the pubkey inside [`ObserverOutputPayload`]
/// so the destination's callback can verify the request was initiated by
/// its own PDA, not by a third party spoofing the program.
pub const UMBRA_INITIATOR_SEED: &[u8] = b"UmbraInitiator";

/// Borsh-serialized payload that Umbra's observer-forward CPI delivers as
/// instruction data (after the 8-byte discriminator) to the destination
/// program's callback handler.
#[derive(BorshSerialize, BorshDeserialize, Clone, Debug)]
pub struct ObserverOutputPayload {
    pub comp_def_offset: u32,
    pub observer_pubkey: [u8; 32],
    pub observer_nonce: u128,
    pub initiator: Pubkey,
    pub public_data: Vec<u8>,
    pub ciphertext: Vec<u8>,
}
