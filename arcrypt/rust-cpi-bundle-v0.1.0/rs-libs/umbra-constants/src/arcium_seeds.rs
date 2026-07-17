//! Raw byte-string seeds for Arcium infrastructure PDA derivation.
//!
//! These are NOT SHA-256 hashed — they are used as-is in `Pubkey::find_program_address`
//! when deriving Arcium infrastructure account addresses.

// =============================================================================
// ARCIUM INFRASTRUCTURE PDA SEEDS
// =============================================================================

/// Seed for deriving Arcium computation account PDAs.
pub const ARCIUM_COMPUTATION_ACCOUNT_SEED: &[u8] = b"ComputationAccount";

/// Seed for deriving the Arcium MXE (Multi-party eXecution Environment) account PDA.
pub const ARCIUM_MXE_ACCOUNT_SEED: &[u8] = b"MXEAccount";

/// Seed for deriving the Arcium mempool account PDA.
pub const ARCIUM_MEMPOOL_SEED: &[u8] = b"Mempool";

/// Seed for deriving the Arcium cluster account PDA.
pub const ARCIUM_CLUSTER_SEED: &[u8] = b"Cluster";

/// Seed for deriving Arcium computation definition account PDAs.
pub const ARCIUM_COMP_DEF_SEED: &[u8] = b"ComputationDefinitionAccount";

/// Seed for deriving the Arcium executing pool account PDA.
pub const ARCIUM_EXECPOOL_SEED: &[u8] = b"Execpool";

/// Seed for deriving the Arcium fee pool account PDA.
pub const ARCIUM_FEE_POOL_SEED: &[u8] = b"FeePool";

/// Seed for deriving the Arcium clock account PDA.
pub const ARCIUM_CLOCK_SEED: &[u8] = b"ClockAccount";
