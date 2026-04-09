use arcis::*;

#[encrypted]
mod circuits {
    use arcis::*;


pub struct Bid {
    pub bidder: SerializedSolanaPublicKey,
    pub amount: u64,
}

    pub struct AuctionState {
        pub highest: Bid,
        pub second_highest: Bid,
        pub third_highest: Bid,
        pub bid_count: u16,
    }

    pub struct AuctionResult {
        pub winner: SerializedSolanaPublicKey,
        pub payment_amount: u64,
    }

    pub struct UniformAuctionResult {
        pub winner1: Bid,
        pub winner2: Bid,
        pub winner3: Bid,
        pub clearing_price: u64,
    }

    pub struct ProRataAuctionResult {
        pub winner1: Bid,
        pub winner2: Bid,
        pub winner3: Bid,
        pub total_bid: u64,
    }

    #[instruction]
    pub fn init_auction_state() -> Enc<Mxe, AuctionState> {
        let initial_state = AuctionState {
            highest: Bid {
                bidder: SerializedSolanaPublicKey { lo: 0, hi: 0 },
                amount: 0,
            },
            second_highest: Bid {
                bidder: SerializedSolanaPublicKey { lo: 0, hi: 0 },
                amount: 0,
            },
            third_highest: Bid {
                bidder: SerializedSolanaPublicKey { lo: 0, hi: 0 },
                amount: 0,
            },
            bid_count: 0,
        };
        Mxe::get().from_arcis(initial_state)
    }

    #[instruction]
    pub fn place_bid(
        bid_ctxt: Enc<Shared, Bid>,
        state_ctxt: Enc<Mxe, AuctionState>,
    ) -> Enc<Mxe, AuctionState> {
        let bid = bid_ctxt.to_arcis();
        let mut state = state_ctxt.to_arcis();

        if bid.amount > state.highest.amount {
            state.third_highest = state.second_highest;
            state.second_highest = state.highest;
            state.highest = bid;
        } else if bid.amount > state.second_highest.amount {
            state.third_highest = state.second_highest;
            state.second_highest = bid;
        } else if bid.amount > state.third_highest.amount {
            state.third_highest = bid;
        }

        state.bid_count += 1;

        state_ctxt.owner.from_arcis(state)
    }

#[instruction]
pub fn determine_winner_uniform(
    state_ctxt: Enc<Mxe, AuctionState>,
) -> UniformAuctionResult {
    let state = state_ctxt.to_arcis();

    let highest = state.highest;
    let second_highest = state.second_highest;
    let third_highest = state.third_highest;

    let clearing_price = third_highest.amount;

    UniformAuctionResult {
        winner1: highest,
        winner2: second_highest,
        winner3: third_highest,
        clearing_price,
    }
    .reveal()
}

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

    /// Winner pays their bid.
    #[instruction]
    pub fn determine_winner_first_price(state_ctxt: Enc<Mxe, AuctionState>) -> AuctionResult {
        let state = state_ctxt.to_arcis();

        AuctionResult {
            winner: state.highest.bidder,
            payment_amount: state.highest.amount,
        }
        .reveal()
    }

    /// Winner pays second-highest bid (incentivizes truthful bidding).
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