//! # Arcrypt Circuits in Arcis
//!
//! This module defines the encrypted auction logic for Arcrypt using Arcis.
//!
//! These circuits operate on encrypted data and are executed via the Arcium
//! secure computation network. They are responsible for:
//!
//! - Maintaining encrypted auction state
//! - Ranking bids privately
//! - Determining winners without revealing bids
//!
//! ## Privacy Model
//!
//! - All bids (`amount`, `price`) are encrypted before computation
//! - Identity for uniform auctions is represented via `bidder_id` (plaintext index)
//! - State is stored as ciphertext (`Enc<Mxe, ...>`)
//! - Only final outputs (winner, price, allocation) are revealed
//!
//! ## Meaning of related terms
//!
//! - `amount`: total funds committed (escrow backing)
//! - `price`: bid price used for ranking
//! - `quantity`: derived as `amount / price` (integer division)
//!
//! Uniform auctions operate on a fixed-size encrypted bid book (`Pack`),
//! while single-winner auctions rely on top-2 tracking to prevent unneccessary extra arcis circuits. 
//!
//! ## Supported Auction Types
//!
//! - First Price
//! - Vickrey (Second Price)
//! - Uniform Price (top N, shared clearing price)
//! - Pro rata is deprecated
//!
//! ## Execution
//!
//! 1. Initialize encrypted auction state and bid book
//! 2. Submit encrypted bids
//! 3. Update encrypted state via `place_bid` / `place_encrypted_bid`
//! 4. Run winner determination circuits
//! 5. Reveal only final outputs
//!
//! These circuits are invoked by the on-chain Arcrypt program via Arcium.

use arcis::*;

#[encrypted]
mod circuits {
    use arcis::*;

    const MAX_BIDS: usize = 3;
    const FLAT_SIZE: usize = MAX_BIDS * 3;

    /// Packed bid book:
    /// [price, amount, bidder_id] repeated MAX_BIDS times
    ///
    /// Pack must be a top-level encrypted type and cannot be nested inside structs.
    pub type BidBook = Pack<[u64; FLAT_SIZE]>;

    /// Value for unused slots
    pub const EMPTY_BIDDER_ID: u64 = u64::MAX;

    // -------------------------
    // BID (USED ONLY FOR FP / VICKREY)
    // -------------------------
    pub struct Bid {
        pub bidder: SerializedSolanaPublicKey,
        pub amount: u64,
        pub price: u64,
    }

    // -------------------------
    // STATE (TOP-2 ONLY)
    // -------------------------
    pub struct AuctionState {
        pub highest: Bid,
        pub second_highest: Bid,
        pub bid_count: u16,
    }

    // -------------------------
    // RESULT (FP / VICKREY)
    // -------------------------
    pub struct AuctionResult {
        pub winner: SerializedSolanaPublicKey,
        pub payment_amount: u64,
    }

    // -------------------------
    // SORTING NETWORK (N = 3)
    // -------------------------
    // Deterministic sorting network required (no dynamic loops / branching).
    fn compare_swap(flat: &mut [u64; FLAT_SIZE], i: usize, j: usize) {
        let pi = 3 * i;
        let pj = 3 * j;

        if flat[pi] < flat[pj] {
            flat.swap(pi, pj);
            flat.swap(pi + 1, pj + 1);
            flat.swap(pi + 2, pj + 2);
        }
    }

    fn sort3(flat: &mut [u64; FLAT_SIZE]) {
        compare_swap(flat, 0, 1);
        compare_swap(flat, 1, 2);
        compare_swap(flat, 0, 1);
    }

    // -------------------------
    // INIT
    // -------------------------
    #[instruction]
    pub fn init_auction() -> (Enc<Mxe, AuctionState>, Enc<Mxe, BidBook>) {
        let mut flat = [0u64; FLAT_SIZE];

        for i in 0..MAX_BIDS {
            flat[3 * i + 2] = EMPTY_BIDDER_ID;
        }

        let highest = Bid {
            bidder: SerializedSolanaPublicKey { lo: 0, hi: 0 },
            amount: 0,
            price: 0,
        };

        let second_highest = Bid {
            bidder: SerializedSolanaPublicKey { lo: 0, hi: 0 },
            amount: 0,
            price: 0,
        };

        (
            Mxe::get().from_arcis(AuctionState {
                highest,
                second_highest,
                bid_count: 0,
            }),
            Mxe::get().from_arcis(Pack::new(flat)),
        )
    }

    // -------------------------
    // INTERNAL INSERT HELPER FN
    // -------------------------
    fn insert_bid(
        state: &mut AuctionState,
        flat: &mut [u64; FLAT_SIZE],
        price: u64,
        amount: u64,
        bidder_id: u64,
    ) {
        // Maintain top-2 for FP / Vickrey
        if price > state.highest.price {
            state.second_highest = Bid {
                bidder: SerializedSolanaPublicKey { lo: 0, hi: 0 },
                amount: state.highest.amount,
                price: state.highest.price,
            };

            state.highest = Bid {
                bidder: SerializedSolanaPublicKey { lo: 0, hi: 0 },
                amount,
                price,
            };
        } else if price > state.second_highest.price {
            state.second_highest = Bid {
                bidder: SerializedSolanaPublicKey { lo: 0, hi: 0 },
                amount,
                price,
            };
        }

        // Insert into packed book
        // When full, index 2 is always worst after sorting network
        let idx = if state.bid_count < MAX_BIDS as u16 {
            state.bid_count as usize
        } else {
            MAX_BIDS - 1
        };

        flat[3 * idx] = price;
        flat[3 * idx + 1] = amount;
        flat[3 * idx + 2] = bidder_id;

        sort3(flat);

        state.bid_count += 1;
    }

    // --------------------------------------
    // PLACE BID 
    // Legacy, uses `Shared` as this is 
    // called by a client invoked anchor ix
    // --------------------------------------
    #[instruction]
    pub fn place_bid(
        bidder_id: u64,
        bid_ctxt: Enc<Shared, Bid>,
        state_ctxt: Enc<Mxe, AuctionState>,
        book_ctxt: Enc<Mxe, BidBook>,
    ) -> (Enc<Mxe, AuctionState>, Enc<Mxe, BidBook>) {
        let bid = bid_ctxt.to_arcis();
        let mut state = state_ctxt.to_arcis();
        let mut flat = book_ctxt.to_arcis().unpack();

        insert_bid(&mut state, &mut flat, bid.price, bid.amount, bidder_id);

        (
            state_ctxt.owner.from_arcis(state),
            book_ctxt.owner.from_arcis(Pack::new(flat)),
        )
    }

    // -------------------------------------------------------
    // PLACE ENCRYPTED BID 
    // More advanced and uses `Mxe` instead of `Shared`. 
    // Cranked by place_encrypted_bid and receives 
    // ciphertext directly via CPI from UMBRA program on-chain
    // -------------------------------------------------------
    #[instruction]
    pub fn place_encrypted_bid(
        bidder_id: u64,
        amount_ctxt: Enc<Mxe, u64>,
        price_ctxt: Enc<Mxe, u64>,
        state_ctxt: Enc<Mxe, AuctionState>,
        book_ctxt: Enc<Mxe, BidBook>,
    ) -> (Enc<Mxe, AuctionState>, Enc<Mxe, BidBook>) {
        let amount = amount_ctxt.to_arcis();
        let price = price_ctxt.to_arcis();
        let mut state = state_ctxt.to_arcis();
        let mut flat = book_ctxt.to_arcis().unpack();

        insert_bid(&mut state, &mut flat, price, amount, bidder_id);

        (
            state_ctxt.owner.from_arcis(state),
            book_ctxt.owner.from_arcis(Pack::new(flat)),
        )
    }

    // -------------------------
    // UNIFORM 
    // -------------------------
    #[instruction]
    pub fn determine_winner_uniform(
        book_ctxt: Enc<Mxe, BidBook>,
        total_supply: u64,
    ) -> (u64, [u64; MAX_BIDS], [u64; MAX_BIDS], [u64; MAX_BIDS]) {
        let flat = book_ctxt.to_arcis().unpack();

        let mut remaining = total_supply;
        let mut clearing_price = 0;

        let mut fills = [0u64; MAX_BIDS];
        let mut amounts = [0u64; MAX_BIDS];
        let mut ids = [0u64; MAX_BIDS];

        // Arcis requires masking instead of control flow (no continue/break)
        for i in 0..MAX_BIDS {
            let price = flat[3 * i];
            let amount = flat[3 * i + 1];
            let id = flat[3 * i + 2];

            let is_valid = id != EMPTY_BIDDER_ID;

            let qty = if price == 0 { 0 } else { amount / price };
            let qty = if is_valid { qty } else { 0 };

            let fill = if qty <= remaining { qty } else { remaining };

            fills[i] = if is_valid { fill } else { 0 };
            amounts[i] = if is_valid { amount } else { 0 };
            ids[i] = id;

            remaining = if is_valid { remaining - fill } else { remaining };

            if is_valid && fill > 0 {
                clearing_price = price;
            }
        }

        (
            clearing_price.reveal(),
            fills.reveal(),
            amounts.reveal(),
            ids.reveal(),
        )
    }

    // -------------------------
    // FIRST PRICE 
    // -------------------------
    #[instruction]
    pub fn determine_winner_first_price(
        state_ctxt: Enc<Mxe, AuctionState>,
    ) -> AuctionResult {
        let state = state_ctxt.to_arcis();

        AuctionResult {
            winner: state.highest.bidder,
            payment_amount: state.highest.amount,
        }
        .reveal()
    }

    // -------------------------
    // VICKREY
    // -------------------------
    #[instruction]
    pub fn determine_winner_vickrey(
        state_ctxt: Enc<Mxe, AuctionState>,
    ) -> AuctionResult {
        let state = state_ctxt.to_arcis();

        AuctionResult {
            winner: state.highest.bidder,
            payment_amount: state.second_highest.amount,
        }
        .reveal()
    }
}