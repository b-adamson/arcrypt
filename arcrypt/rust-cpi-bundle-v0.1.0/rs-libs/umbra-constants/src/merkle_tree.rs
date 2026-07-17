//! Merkle tree configuration constants for stealth pool UTXO trees.

/// Depth of the indexed Merkle tree used in the stealth pool.
pub const MERKLE_TREE_DEPTH: usize = 20;

/// Maximum number of leaves per Merkle tree (2^MERKLE_TREE_DEPTH).
pub const MAX_LEAVES_PER_TREE: u64 = 1 << MERKLE_TREE_DEPTH;
