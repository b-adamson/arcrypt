//! # Arcrypt Circuits (Arcis / Arcium)
//!
//! This module defines the **encrypted auction logic** for Arcrypt using Arcis.
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
//! - All bids (`amount`, `price`, `bidder`) are encrypted before computation
//! - State is stored as ciphertext (`Enc<Mxe, AuctionState>`)
//! - Only final outputs (winner, price, allocation) are revealed
//!
//! ## Key Concepts
//!
//! - `amount`: total funds committed (escrow backing)
//! - `price`: bid price used for ranking. NOTE: price === amount as enforced by anchor in single winner auctions
//!
//! In uniform auctions, we use a price sorting method. ONLY 3 WINNERS SUPPORTED FOR UNIFORM, EASILY EXPANDABLE, FOR DEMO PURPOSES 
//!
//! ## Supported Auction Logic
//!
//! - First Price
//! - Vickrey (Second Price)
//! - Uniform Price (top 3, shared clearing price)
//! - Pro Rata (allocation proportional to bid amounts)
//!
//! ## Execution
//!
//! 1. Initialize encrypted auction state
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

    pub struct Bid {
        pub bidder: SerializedSolanaPublicKey,
        pub amount: u64,
        pub price: u64, // NEW
    }

    /// Encrypted auction state tracked across all bids.
    ///
    /// Maintains the top 3 bids ranked by `price`.
    ///
    /// # Fields
    /// - `highest`: best bid
    /// - `second_highest`: second-best bid
    /// - `third_highest`: third-best bid
    /// - `bid_count`: total number of bids processed
    ///
    /// # Notes
    /// - Only top 3 bids are tracked for efficiency
    /// - Used for all auction types
    pub struct AuctionState {
        pub highest: Bid,
        pub second_highest: Bid,
        pub third_highest: Bid,
        pub bid_count: u16,
    }

    /// Result for single-winner auctions (FirstPrice, Vickrey).
    ///
    /// # Fields
    /// - `winner`: winning bidder
    /// - `payment_amount`: amount to be paid
    pub struct AuctionResult {
        pub winner: SerializedSolanaPublicKey,
        pub payment_amount: u64,
    }

    /// Result for Uniform Price auctions.
    ///
    /// # Fields
    /// - `winner1`, `winner2`, `winner3`: top 3 bidders
    /// - `clearing_price`: price paid by all winners
    ///
    /// # Notes
    /// - Clearing price = 3rd highest bid price
    pub struct UniformAuctionResult {
        pub winner1: Bid,
        pub winner2: Bid,
        pub winner3: Bid,
        pub clearing_price: u64,
    }

    /// Result for Pro Rata auctions.
    ///
    /// # Fields
    /// - `winner1`, `winner2`, `winner3`: top bidders
    /// - `total_bid`: sum of all winning bid amounts
    ///
    /// # Notes
    /// - Used to compute proportional allocation off-chain/on-chain
    pub struct ProRataAuctionResult {
        pub winner1: Bid,
        pub winner2: Bid,
        pub winner3: Bid,
        pub total_bid: u64,
    }

    /// Initializes encrypted auction state.
    ///
    /// # Returns
    /// - Empty `AuctionState` with zeroed bids
    ///
    /// # Effects
    /// - Sets initial ciphertext state for the auction
    #[instruction]
    pub fn init_auction_state() -> Enc<Mxe, AuctionState> {
        let initial_state = AuctionState {
            highest: Bid {
                bidder: SerializedSolanaPublicKey { lo: 0, hi: 0 },
                amount: 0,
                price: 0,
            },
            second_highest: Bid {
                bidder: SerializedSolanaPublicKey { lo: 0, hi: 0 },
                amount: 0,
                price: 0,
            },
            third_highest: Bid {
                bidder: SerializedSolanaPublicKey { lo: 0, hi: 0 },
                amount: 0,
                price: 0,
            },
            bid_count: 0,
        };
        Mxe::get().from_arcis(initial_state)
    }

    /// Updates auction state with a new encrypted bid.
    ///
    /// # Arguments
    /// - `bid_ctxt`: encrypted bid (Shared context)
    /// - `state_ctxt`: current encrypted auction state
    ///
    /// # Behavior
    /// - Inserts bid into top 3 ranking
    /// - Ranking is based on `price`
    /// - Shifts existing bids down as needed
    ///
    /// # Effects
    /// - Increments `bid_count`
    /// - Updates encrypted state
    /// Will eventually made legacy in favour of umbra invoked bids (See place_encrypted_bid)
    #[instruction]
    pub fn place_bid(
        bid_ctxt: Enc<Shared, Bid>,
        state_ctxt: Enc<Mxe, AuctionState>,
    ) -> Enc<Mxe, AuctionState> {
        let bid = bid_ctxt.to_arcis();
        let mut state = state_ctxt.to_arcis();

        // 🔥 RANK BY PRICE (NOT AMOUNT)
        if bid.price > state.highest.price {
            state.third_highest = state.second_highest;
            state.second_highest = state.highest;
            state.highest = bid;
        } else if bid.price > state.second_highest.price {
            state.third_highest = state.second_highest;
            state.second_highest = bid;
        } else if bid.price > state.third_highest.price {
            state.third_highest = bid;
        }

        state.bid_count += 1;

        state_ctxt.owner.from_arcis(state)
    }

    /// Updates auction state using separately encrypted inputs, CPIed from UMBRA
    ///
    /// # Arguments
    /// - `bidder`: bidder public key
    /// - `amount_ctxt`: encrypted bid amount
    /// - `price_ctxt`: encrypted bid price
    /// - `state_ctxt`: current encrypted state
    ///
    /// # Behavior
    /// - Constructs `Bid` from inputs
    /// - Inserts into top 3 ranking (by price)
    ///
    /// # Effects
    /// - Updates encrypted state
    /// - Increments bid count
    #[instruction]
    pub fn place_encrypted_bid(
        bidder: SerializedSolanaPublicKey,
        amount_ctxt: Enc<Mxe, u64>,
        price_ctxt: Enc<Mxe, u64>, // NEW
        state_ctxt: Enc<Mxe, AuctionState>,
    ) -> Enc<Mxe, AuctionState> {
        let amount = amount_ctxt.to_arcis();
        let price = price_ctxt.to_arcis();
        let mut state = state_ctxt.to_arcis();

        let bid = Bid { bidder, amount, price };

        // 🔥 RANK BY PRICE
        if bid.price > state.highest.price {
            state.third_highest = state.second_highest;
            state.second_highest = state.highest;
            state.highest = bid;
        } else if bid.price > state.second_highest.price {
            state.third_highest = state.second_highest;
            state.second_highest = bid;
        } else if bid.price > state.third_highest.price {
            state.third_highest = bid;
        }

        state.bid_count += 1;
        state_ctxt.owner.from_arcis(state)
    }

    /// Determines winners for a Uniform Price auction.
    ///
    /// # Behavior
    /// - Selects top 3 bids
    /// - Sets clearing price = 3rd highest price
    ///
    /// # Returns
    /// - Top 3 bidders + clearing price
    ///
    /// # Privacy
    /// - Only result is revealed
    #[instruction]
    pub fn determine_winner_uniform(
        state_ctxt: Enc<Mxe, AuctionState>,
    ) -> UniformAuctionResult {
        let state = state_ctxt.to_arcis();

        let highest = state.highest;
        let second_highest = state.second_highest;
        let third_highest = state.third_highest;

        let clearing_price = third_highest.price;

        UniformAuctionResult {
            winner1: highest,
            winner2: second_highest,
            winner3: third_highest,
            clearing_price,
        }
        .reveal()
    }

    // Deprecated
    #[instruction]
    pub fn determine_winner_pro_rata(
        state_ctxt: Enc<Mxe, AuctionState>,
    ) -> ProRataAuctionResult {
        let state = state_ctxt.to_arcis();

        let highest = state.highest;
        let second_highest = state.second_highest;
        let third_highest = state.third_highest;

        let total_bid = highest.amount + second_highest.amount + third_highest.amount;

        ProRataAuctionResult {
            winner1: highest,
            winner2: second_highest,
            winner3: third_highest,
            total_bid,
        }
        .reveal()
    }

    /// Determines winner for a First Price auction.
    ///
    /// # Behavior
    /// - Highest bidder wins
    /// - Pays their full bid amount
    ///
    /// # Returns
    /// - Winner + payment amount
    #[instruction]
    pub fn determine_winner_first_price(state_ctxt: Enc<Mxe, AuctionState>) -> AuctionResult {
        let state = state_ctxt.to_arcis();

        AuctionResult {
            winner: state.highest.bidder,
            payment_amount: state.highest.amount,
        }
        .reveal()
    }

    /// Determines winner for a Vickrey (second-price) auction.
    ///
    /// # Behavior
    /// - Highest bidder wins
    /// - Pays second-highest bid amount
    ///
    /// # Returns
    /// - Winner + payment amount
    #[instruction]
    pub fn determine_winner_vickrey(state_ctxt: Enc<Mxe, AuctionState>) -> AuctionResult {
        let state = state_ctxt.to_arcis();

        AuctionResult {
            winner: state.highest.bidder,
            payment_amount: state.second_highest.amount,
        }
        .reveal()
    }
}