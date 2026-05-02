//! # Arcrypt
//!
//! Arcrypt is a privacy-preserving sealed-bid auction program built on Solana.
//!
//! It enables auctions where all bids remain encrypted throughout the bidding
//! phase and are only revealed at settlement. This prevents front-running,
//! bid shading, and information leakage during the auction lifecycle.
//!
//! ## Core Concept
//!
//! Arcrypt implements sealed auctions using encrypted state and off-chain
//! secure computation via the Arcium network.
//!
//! - Bids are never stored in plaintext on-chain
//! - Auction state is maintained as encrypted ciphertext
//! - Winner determination is computed privately via Arcium
//! - Only final outputs (winner and payment) are revealed
//!
//! ## Supported Auction Types
//!
//! - First Price — highest bidder wins and pays their bid
//! - Vickrey (Second Price) — highest bidder wins, pays second-highest bid
//! - Uniform Price — top bidders win at a shared clearing price
//! - Pro Rata — allocation proportional to bid size
//!
//! ## Asset Types
//!
//! - SPL (NFT or Token)
//! - Metadata-only auctions (no token transfer)
//!
//! ## Arcium Integration
//!
//! Arcrypt relies on the Arcium secure computation network to process encrypted
//! bids and determine winners without revealing sensitive data.
//!
//! Each auction step:
//! - queues encrypted computation
//! - verifies outputs via callbacks
//! - updates encrypted state on-chain
//!
//! ## Umbra Integration and Encrypted Escrow Flow
//!
//! Arcrypt integrates with the Umbra privacy system via CPI to enable
//! confidential escrow of bid funds. This allows token balances to remain
//! encrypted and program-controlled without exposing them on-chain.
//!
//! The escrow and bidding process proceeds as follows:
//!
//! 1. Deposit  
//!    The client encrypts their bid amount against Umbra's MXE using wSOL
//!    and invokes Arcrypt.
//!
//! 2. CPI to Umbra  
//!    Arcrypt performs a CPI into Umbra, passing:
//!    - the encrypted token account (ETA)
//!    - the encrypted bid amount
//!
//! 3. Umbra secure allocation  
//!    Umbra decrypts the bid amount inside its MXE and allocates the
//!    corresponding funds from the user's encrypted token account into
//!    its internal shielded pool.
//!
//! 4. Re-encryption for Arcrypt  
//!    Umbra re-encrypts the bid amount, this time against Arcrypt's MXE,
//!    producing a ciphertext that Arcrypt can process.
//!
//! 5. Temporary storage  
//!    Arcrypt receives this encrypted bid and stores it in a temporary
//!    account via `submit_encrypted_bid`.
//!
//! 6. State update via MPC  
//!    A crank triggers `place_encrypted_bid`, which feeds the encrypted bid
//!    into Arcium MPC to update Arcrypt’s internal encrypted auction state.
//!
//! 7. Confidential escrow model  
//!    At no point does escrowed value exist in plaintext on-chain.
//!    All balances remain encrypted and program-controlled, effectively
//!    implementing confidential token balances prior to native C-SPL support.
//!
//! ## Privacy Guarantees
//!
//! - Bid values are encrypted before reaching the chain
//! - Competing bids are never visible to participants
//! - Auction logic operates on encrypted state
//! - Only final results are revealed after computation
//! - Escrowed balances remain confidential throughout
//!
//! ## Escrow Model
//!
//! - Funds are escrowed through Umbra's encrypted balance system
//! - No plaintext token transfers occur during bidding
//! - Settlement occurs only after winner determination
//!
//! ## High-Level
//!
//! 1. Create auction (optionally escrowing assets)
//! 2. Submit encrypted bids (directly or via Umbra CPI)
//! 3. Arcium processes encrypted auction state
//! 4. Winner is determined privately
//! 5. Settlement transfers assets and final payments
//!
//! ## Notes
//!
//! - Nonces must be unique per bid per user per auction
//! - Multi-winner auctions limited to n=3 for hackathon purposes.
//!
//! ---
//!
//! Arcrypt combines on-chain guarantees with off-chain secure computation
//! to enable fully private, trust-minimised auction mechanisms on Solana. This makes Arcrypt the ultimate
//! auction platform on any blockchain, and the first *truly* sealed one. 

use anchor_lang::prelude::*;
use arcium_anchor::prelude::*;
use arcium_client::idl::arcium::types::{CircuitSource, OffChainCircuitSource, CallbackAccount};
use arcium_macros::circuit_hash;
use anchor_lang::prelude::Clock;
use anchor_spl::token_interface::{
    self,
    Mint,
    TokenAccount,
    TokenInterface,
    TransferChecked,
};
use anchor_lang::prelude::InterfaceAccount;
use anchor_spl::associated_token::AssociatedToken;

const COMP_DEF_OFFSET_INIT_AUCTION_STATE: u32 = comp_def_offset("init_auction_state");
const COMP_DEF_OFFSET_PLACE_BID: u32 = comp_def_offset("place_bid");
const COMP_DEF_OFFSET_DETERMINE_WINNER_FIRST_PRICE: u32 =
    comp_def_offset("determine_winner_first_price");
const COMP_DEF_OFFSET_DETERMINE_WINNER_VICKREY: u32 = comp_def_offset("determine_winner_vickrey");
const COMP_DEF_OFFSET_DETERMINE_WINNER_UNIFORM: u32 =
    comp_def_offset("determine_winner_uniform");
const COMP_DEF_OFFSET_DETERMINE_WINNER_PRO_RATA: u32 =
    comp_def_offset("determine_winner_pro_rata");
const COMP_DEF_OFFSET_PLACE_ENCRYPTED_BID: u32 =
    comp_def_offset("place_encrypted_bid");


declare_id!("JEJdjPBaWAteXajrhpEJCWcgUci3QUCJbCvEJxwM9ZYq");
// Auction account byte offset: 8 (discriminator) + 1 + 32 + 1 + 1 + 8 + 8 + 2 + 16 = 77
const AUCTION_HEADER_SIZE: u32 = 8 + 1 + 32 + 1 + 1 + 8 + 8 + 2 + 16;
const ENCRYPTED_STATE_OFFSET: u32 = AUCTION_HEADER_SIZE;
const ENCRYPTED_STATE_SIZE: u32 = 32 * 13;

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum AuctionType {
    FirstPrice,
    Vickrey,
    Uniform,
    ProRata,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum AuctionStatus {
    Open,
    Closed,
    Resolved,
}

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum AssetKind {
    Fungible,
    Nft,
    MetadataOnly,
}

#[arcium_program]
pub mod arcrypt {
    use super::*;

    pub fn init_auction_state_comp_def(ctx: Context<InitAuctionStateCompDef>) -> Result<()> {
        init_comp_def(
            ctx.accounts,
            Some(CircuitSource::OffChain(OffChainCircuitSource {
                source: "https://coffee-far-termite-270.mypinata.cloud/ipfs/bafkreiaueovbknzwvu5beoqmkvz37zkz66f6j3zghe7d4vflhgh4whblmy".to_string(),
                hash: circuit_hash!("init_auction_state"),
            })),
            None,
        )?;
        Ok(())
    }

    // legacy. encrypts amounts but not the token balances
    pub fn init_place_bid_comp_def(ctx: Context<InitPlaceBidCompDef>) -> Result<()> {
        init_comp_def(
            ctx.accounts,
            Some(CircuitSource::OffChain(OffChainCircuitSource {
                source: "https://coffee-far-termite-270.mypinata.cloud/ipfs/bafybeieskvhdeiitw5yznxrjrbjfgj4v6gfajisilbjxwm234ad5j3tukq".to_string(),
                hash: circuit_hash!("place_bid"),
            })),
            None,
        )?;
        Ok(())
    }

    // used with umbra escrow method
    pub fn init_place_encrypted_bid_comp_def(
        ctx: Context<InitPlaceEncryptedBidCompDef>,
    ) -> Result<()> {
        init_comp_def(
            ctx.accounts,
            Some(CircuitSource::OffChain(OffChainCircuitSource {
                source: "https://coffee-far-termite-270.mypinata.cloud/ipfs/bafybeibv7lkooq34ppohfmd3bpi7bqi2npf6xid5jzqeb4xd4sb7hylv2q".to_string(),
                hash: circuit_hash!("place_encrypted_bid"),
            })),
            None,
        )?;
        Ok(())
    }

    pub fn init_determine_winner_first_price_comp_def(
        ctx: Context<InitDetermineWinnerFirstPriceCompDef>,
    ) -> Result<()> {
        init_comp_def(
            ctx.accounts,
            Some(CircuitSource::OffChain(OffChainCircuitSource {
                source: "https://coffee-far-termite-270.mypinata.cloud/ipfs/bafybeiefmnztrgiateqpt6y6envwpc3x3njcvdxsfgcwapu2gsgb5ntmma".to_string(),
                hash: circuit_hash!("determine_winner_first_price"),
            })),
            None,
        )?;
        Ok(())
    }

    pub fn init_determine_winner_vickrey_comp_def(
        ctx: Context<InitDetermineWinnerVickreyCompDef>,
    ) -> Result<()> {
        init_comp_def(
            ctx.accounts,
            Some(CircuitSource::OffChain(OffChainCircuitSource {
                source: "https://coffee-far-termite-270.mypinata.cloud/ipfs/bafybeidkfctp2hnqg57hk4axct7n357qivihqw7zsgnd4y6xpczkvubocm".to_string(),
                hash: circuit_hash!("determine_winner_vickrey"),
            })),
            None,
        )?;
        Ok(())
    }

    pub fn init_determine_winner_uniform_comp_def(
    ctx: Context<InitDetermineWinnerUniformCompDef>,
) -> Result<()> {
    init_comp_def(
        ctx.accounts,
        Some(CircuitSource::OffChain(OffChainCircuitSource {
            source: "https://coffee-far-termite-270.mypinata.cloud/ipfs/bafybeidmjicntkzrgw5xbgitdgk3rysaml53r3uqirukzuybr5ljfyqny4".to_string(),
            hash: circuit_hash!("determine_winner_uniform"),
        })),
        None,
    )?;
    Ok(())
}

pub fn init_determine_winner_pro_rata_comp_def(
    ctx: Context<InitDetermineWinnerProRataCompDef>,
) -> Result<()> {
    init_comp_def(
        ctx.accounts,
        Some(CircuitSource::OffChain(OffChainCircuitSource {
            source: "https://coffee-far-termite-270.mypinata.cloud/ipfs/bafybeifkov6ajj5w5kzpmzlkcqmud7jiqjzsj5f47y5pklfjuwge66pi3q".to_string(),
            hash: circuit_hash!("determine_winner_pro_rata"),
        })),
        None,
    )?;
    Ok(())
}


/// Executes a previously submitted encrypted bid.
///
/// Consumes a `PendingEncryptedBid` and queues the encrypted computation. Called via crank after submit_encrypted_bid
///
/// # Requirements
/// - `temp_bid` must not be consumed
/// - Must match auction + shared vault
///
/// # Effects
/// - Marks temp bid as consumed
/// - Queues Arcium computation
pub fn place_encrypted_bid(
    ctx: Context<PlaceEncryptedBid>,
    computation_offset: u64,
) -> Result<()> {
    let auction = &ctx.accounts.auction;

    require_bid_allowed(auction)?;
    require_keys_eq!(
        ctx.accounts.temp_bid.auction,
        auction.key(),
        ErrorCode::EscrowMismatch
    );
    require_keys_eq!(
        ctx.accounts.temp_bid.shared_vault,
        ctx.accounts.shared_vault.key(),
        ErrorCode::InvalidSharedVault
    );
    require!(
        !ctx.accounts.temp_bid.consumed,
        ErrorCode::TempBidAlreadyConsumed
    );

    ctx.accounts.temp_bid.consumed = true;
    ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

    let temp = &ctx.accounts.temp_bid;
    let bidder_bytes = temp.bidder.to_bytes();
    let bidder_lo = u128::from_le_bytes(bidder_bytes[0..16].try_into().unwrap());
    let bidder_hi = u128::from_le_bytes(bidder_bytes[16..32].try_into().unwrap());
    
    let encrypted_price_final = if matches!(
    auction.auction_type,
    AuctionType::FirstPrice | AuctionType::Vickrey
) {
    temp.encrypted_amount
} else {
    temp.encrypted_price
};
    
    

    let args = ArgBuilder::new()
        .plaintext_u128(bidder_lo)
        .plaintext_u128(bidder_hi)
        .plaintext_u128(temp.nonce)
        .encrypted_u64(temp.encrypted_amount)
.encrypted_u64(encrypted_price_final) // NEW
        .plaintext_u128(auction.state_nonce)
        .account(
            auction.key(),
            ENCRYPTED_STATE_OFFSET,
            ENCRYPTED_STATE_SIZE,
        )
        .build();
    
        

    queue_computation(
        ctx.accounts,
        computation_offset,
        args,
        vec![PlaceEncryptedBidCallback::callback_ix(
            computation_offset,
            &ctx.accounts.mxe_account,
            &[CallbackAccount {
                pubkey: auction.key(),
                is_writable: true,
            }],
        )?],
        1,
        0,
    )?;

    Ok(())
}


/// Places an encrypted bid with escrow.
///
/// Transfers WSOL into the bidder's escrow PDA and submits encrypted bid data
/// to Arcium for off-chain computation.
///
/// # Arguments
/// - `escrow_amount`: Total bid amount (lamports)
/// - `encrypted_*`: Ciphertext components for bidder + bid
/// - `nonce`: Unique encryption nonce
///
/// # Behavior
/// - Supports bid top-ups (cannot decrease)
/// - Escrow is tracked per (auction, bidder)
/// - For FP/Vickrey: price = amount
///
/// # Effects
/// - Transfers WSOL into escrow ATA
/// - Queues encrypted computation
pub fn place_bid(
    ctx: Context<PlaceBid>,
    computation_offset: u64,
    escrow_amount: u64,
    encrypted_bidder_lo: [u8; 32],
    encrypted_bidder_hi: [u8; 32],
    encrypted_amount: [u8; 32],
    encrypted_price: [u8; 32], // NEW
    bidder_pubkey: [u8; 32],
    nonce: u128,
) -> Result<()> {
    let auction = &ctx.accounts.auction;

    require_bid_allowed(auction)?;
    require!(escrow_amount >= auction.min_bid, ErrorCode::BidBelowMinimum);
    use anchor_spl::token::spl_token::native_mint;

require_keys_eq!(
    ctx.accounts.wsol_mint.key(),
    native_mint::ID,
    ErrorCode::WrongMint
);

    let escrow = &mut ctx.accounts.escrow_account;

    if escrow.deposited_amount == 0 {
        escrow.bump = ctx.bumps.escrow_account;
        escrow.auction = auction.key();
        escrow.bidder = ctx.accounts.bidder.key();
    } else {
        require_keys_eq!(escrow.auction, auction.key(), ErrorCode::EscrowMismatch);
        require_keys_eq!(escrow.bidder, ctx.accounts.bidder.key(), ErrorCode::EscrowOwnerMismatch);
    }

    require!(
        escrow_amount >= escrow.deposited_amount,
        ErrorCode::BidMustNotDecrease
    );

    let top_up = escrow_amount
        .checked_sub(escrow.deposited_amount)
        .ok_or(ErrorCode::BidMustNotDecrease)?;

    if top_up > 0 {
let cpi_accounts = TransferChecked {
    from: ctx.accounts.bidder_wsol_ata.to_account_info(),
    mint: ctx.accounts.wsol_mint.to_account_info(),
    to: ctx.accounts.escrow_token_account.to_account_info(),
    authority: ctx.accounts.bidder.to_account_info(),
};

let cpi_ctx = CpiContext::new(
    ctx.accounts.token_program.to_account_info(),
    cpi_accounts,
);

token_interface::transfer_checked(
    cpi_ctx,
    top_up,
    ctx.accounts.wsol_mint.decimals,
)?;
    }

    escrow.deposited_amount = escrow_amount;

    ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

    let encrypted_price_final = if matches!(
            auction.auction_type,
            AuctionType::FirstPrice | AuctionType::Vickrey
        ) {
            encrypted_amount 
        } else {
            encrypted_price
        };

let args = ArgBuilder::new()
    .x25519_pubkey(bidder_pubkey)
    .plaintext_u128(nonce)
    .encrypted_u128(encrypted_bidder_lo)
    .encrypted_u128(encrypted_bidder_hi)
    .encrypted_u64(encrypted_amount)
    .encrypted_u64(encrypted_price_final) // NEW
    .plaintext_u128(auction.state_nonce)
    .account(
        ctx.accounts.auction.key(),
        ENCRYPTED_STATE_OFFSET,
        ENCRYPTED_STATE_SIZE,
    )
    .build();

    queue_computation(
        ctx.accounts,
        computation_offset,
        args,
        vec![PlaceBidCallback::callback_ix(
            computation_offset,
            &ctx.accounts.mxe_account,
            &[CallbackAccount {
                pubkey: ctx.accounts.auction.key(),
                is_writable: true,
            }],
        )?],
        1,
        0,
    )?;

    Ok(())
}


#[arcium_callback(encrypted_ix = "place_bid")]
pub fn place_bid_callback(
    ctx: Context<PlaceBidCallback>,
    output: SignedComputationOutputs<PlaceBidOutput>,
) -> Result<()> {
    let o = match output.verify_output(
        &ctx.accounts.cluster_account,
        &ctx.accounts.computation_account,
    ) {
        Ok(PlaceBidOutput { field_0 }) => field_0,
        Err(_) => return Err(ErrorCode::AbortedComputation.into()),
    };

    let auction_key = ctx.accounts.auction.key();
    let auction = &mut ctx.accounts.auction;

    require_not_resolved(auction)?;
    require!(auction.status == AuctionStatus::Open, ErrorCode::AuctionNotOpen);

    auction.encrypted_state = o.ciphertexts;
    auction.state_nonce = o.nonce;

    auction.bid_count = auction
        .bid_count
        .checked_add(1)
        .ok_or(ErrorCode::BidCountOverflow)?;

    emit!(BidPlacedEvent {
        auction: auction_key,
        bid_count: auction.bid_count,
    });

    Ok(())
}

#[arcium_callback(encrypted_ix = "place_encrypted_bid")]
pub fn place_encrypted_bid_callback(
    ctx: Context<PlaceEncryptedBidCallback>,
    output: SignedComputationOutputs<PlaceEncryptedBidOutput>,
) -> Result<()> {
    let o = match output.verify_output(
        &ctx.accounts.cluster_account,
        &ctx.accounts.computation_account,
    ) {
        Ok(PlaceEncryptedBidOutput { field_0 }) => field_0,
        Err(_) => return Err(ErrorCode::AbortedComputation.into()),
    };

    let auction_key = ctx.accounts.auction.key();
    let auction = &mut ctx.accounts.auction;

    require_not_resolved(auction)?;
    require!(auction.status == AuctionStatus::Open, ErrorCode::AuctionNotOpen);

    auction.encrypted_state = o.ciphertexts;
    auction.state_nonce = o.nonce;

    auction.bid_count = auction
        .bid_count
        .checked_add(1)
        .ok_or(ErrorCode::BidCountOverflow)?;

    emit!(BidPlacedEvent {
        auction: auction_key,
        bid_count: auction.bid_count,
    });

    Ok(())
}

/// Creates a token-backed auction (SPL or NFT).
///
/// Transfers the prize tokens from the creator into a vault owned by the program,
/// initializes the `Auction` account, and queues the encrypted state initialization
/// via Arcium.
///
/// # Arguments
/// - `auction_type`: Pricing mechanism (FirstPrice, Vickrey, Uniform, ProRata)
/// - `asset_kind`: Fungible or NFT
/// - `min_bid`: Minimum bid in lamports
/// - `end_time`: Unix timestamp when auction ends
/// - `sale_amount`: Total tokens being auctioned
/// - `auction_metadata_uri`: Off-chain metadata (IPFS / HTTPS)
///
/// # Constraints
/// - NFT must have `decimals == 0` and `sale_amount == 1`
/// - Multi-winner auctions require `sale_amount >= 3`
///
/// # Effects
/// - Moves tokens into `prize_vault`
/// - Initializes auction state
/// - Queues encrypted computation
pub fn create_token_auction(
    ctx: Context<CreateTokenAuction>,
    computation_offset: u64,
    _auction_seed: [u8; 8],
    auction_type: AuctionType,
    asset_kind: AssetKind,
    min_bid: u64,
    end_time: i64,
    sale_amount: u64,
    auction_metadata_uri: String,
) -> Result<()> {
    require!(
        matches!(asset_kind, AssetKind::Fungible | AssetKind::Nft),
        ErrorCode::WrongAssetKind
    );
    require!(
        !auction_metadata_uri.is_empty(),
        ErrorCode::InvalidMetadataUri
    );

    require_keys_eq!(
        ctx.accounts.authority_token_account.mint,
        ctx.accounts.prize_mint.key(),
        ErrorCode::InvalidMint
    );

    if asset_kind == AssetKind::Nft {
        require!(
            matches!(auction_type, AuctionType::FirstPrice | AuctionType::Vickrey),
            ErrorCode::NftAuctionOnlySupportsSingleWinnerModes
        );
        require!(sale_amount == 1, ErrorCode::InvalidMint);
        require!(ctx.accounts.prize_mint.decimals == 0, ErrorCode::InvalidMint);
        require!(
            ctx.accounts.authority_token_account.amount == 1,
            ErrorCode::InvalidMint
        );
    }

    if matches!(auction_type, AuctionType::Uniform | AuctionType::ProRata) {
        require!(
            sale_amount >= 3,
            ErrorCode::InsufficientSupplyForMultiWinnerAuction
        );
    }

    let cpi_accounts = TransferChecked {
        mint: ctx.accounts.prize_mint.to_account_info(),
        from: ctx.accounts.authority_token_account.to_account_info(),
        to: ctx.accounts.prize_vault.to_account_info(),
        authority: ctx.accounts.authority.to_account_info(),
    };

    let cpi_ctx = CpiContext::new(
        ctx.accounts.token_program.to_account_info(),
        cpi_accounts,
    );

    token_interface::transfer_checked(
        cpi_ctx,
        sale_amount,
        ctx.accounts.prize_mint.decimals,
    )?;

    {
        let auction = &mut ctx.accounts.auction;
        init_auction_common(
            auction,
            ctx.accounts.authority.key(),
            ctx.bumps.auction,
            auction_type,
            asset_kind,
            min_bid,
            end_time,
            sale_amount,
            auction_metadata_uri,
            ctx.accounts.prize_mint.key(),
            ctx.accounts.prize_vault.key(),
            ctx.bumps.vault_authority,
            ctx.accounts.prize_mint.decimals,
        )?;
    }

    ctx.accounts.shared_vault.bump = ctx.bumps.shared_vault;
ctx.accounts.shared_vault.auction = ctx.accounts.auction.key();
ctx.accounts.shared_vault.total_deposited = 0;

ctx.accounts.auction.shared_vault = ctx.accounts.shared_vault.key();

    ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

    let args = ArgBuilder::new().build();

    queue_computation(
        ctx.accounts,
        computation_offset,
        args,
        vec![InitAuctionStateCallback::callback_ix(
            computation_offset,
            &ctx.accounts.mxe_account,
            &[CallbackAccount {
                pubkey: ctx.accounts.auction.key(),
                is_writable: true,
            }],
        )?],
        1,
        0,
    )?;

    Ok(())
}

/// Creates a metadata-only auction (no token escrow).
///
/// Used for auctions where only metadata is sold (e.g. rights, off-chain assets).
///
/// # Constraints
/// - Only supports single-winner auctions (FirstPrice, Vickrey)
///
/// # Effects
/// - Initializes auction without token vault
/// - Queues encrypted state initialization
pub fn create_metadata_auction(
    ctx: Context<CreateMetadataAuction>,
    computation_offset: u64,
    _auction_seed: [u8; 8],
    auction_type: AuctionType,
    min_bid: u64,
    end_time: i64,
    auction_metadata_uri: String,
) -> Result<()> {
    require!(
        matches!(auction_type, AuctionType::FirstPrice | AuctionType::Vickrey),
        ErrorCode::MetadataOnlyDoesNotSupportMultiWinnerModes
    );
    require!(
        !auction_metadata_uri.is_empty(),
        ErrorCode::InvalidMetadataUri
    );

    {
        let auction = &mut ctx.accounts.auction;
        init_auction_common(
            auction,
            ctx.accounts.authority.key(),
            ctx.bumps.auction,
            auction_type,
            AssetKind::MetadataOnly,
            min_bid,
            end_time,
            0,
            auction_metadata_uri,
            Pubkey::default(),
            Pubkey::default(),
            0,
            0,
        )?;
    }

    ctx.accounts.shared_vault.bump = ctx.bumps.shared_vault;
ctx.accounts.shared_vault.auction = ctx.accounts.auction.key();
ctx.accounts.shared_vault.total_deposited = 0;

ctx.accounts.auction.shared_vault = ctx.accounts.shared_vault.key();

    ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

    let args = ArgBuilder::new().build();

    queue_computation(
        ctx.accounts,
        computation_offset,
        args,
        vec![InitAuctionStateCallback::callback_ix(
            computation_offset,
            &ctx.accounts.mxe_account,
            &[CallbackAccount {
                pubkey: ctx.accounts.auction.key(),
                is_writable: true,
            }],
        )?],
        1,
        0,
    )?;

    Ok(())
}


/// Stores a pending encrypted bid for later processing by `place_encrypted_bid`.
///
/// # PDA derivation
/// - `shared_vault` = PDA(["shared-vault", auction])
/// - `temp_bid` = PDA(["pending-encrypted-bid", auction, bidder, nonce_le_bytes])
///
/// # Accounts
/// - `payer`: signer that pays rent for `temp_bid`
/// - `auction`: target auction account
/// - `shared_vault`: auction-scoped vault PDA that must already exist
/// - `temp_bid`: pending bid PDA created here
/// - `system_program`: required for account creation
///
/// # Notes
/// - `bidder` is stored in the account and does not need to sign.
/// - `nonce` must be unique per `(auction, bidder)` pair because it is part of the PDA seeds.
/// - This instruction only records the encrypted bid metadata; it does not enqueue settlement.
pub fn submit_encrypted_bid(
    ctx: Context<SubmitEncryptedBid>,
    bidder: Pubkey,
    encrypted_amount: [u8; 32],
    encrypted_price: [u8; 32], // NEW
    nonce: u128,
) -> Result<()> {
    let auction = &ctx.accounts.auction;

    require_bid_allowed(auction)?;
    require_keys_eq!(
        ctx.accounts.shared_vault.auction,
        auction.key(),
        ErrorCode::InvalidSharedVault
    );

    let temp = &mut ctx.accounts.temp_bid;
    temp.bump = ctx.bumps.temp_bid;
    temp.auction = auction.key();
    temp.shared_vault = ctx.accounts.shared_vault.key();
    temp.bidder = bidder;
    temp.nonce = nonce;
    temp.encrypted_amount = encrypted_amount;
    temp.encrypted_price = encrypted_price;
    temp.consumed = false;

    Ok(())
}

/// Closes an auction manually.
///
/// # Requirements
/// - Only authority
/// - Auction must be open
///
/// # Effects
/// - Sets status = Closed
pub fn close_auction(ctx: Context<CloseAuction>) -> Result<()> {
    let auction = &mut ctx.accounts.auction;

    require_not_resolved(auction)?;
    require!(auction.status == AuctionStatus::Open, ErrorCode::AuctionNotOpen);

    auction.status = AuctionStatus::Closed;

    emit!(AuctionClosedEvent {
        auction: auction.key(),
        bid_count: auction.bid_count,
    });

    Ok(())
}


/// Triggers winner computation for a First Price auction.
///
/// # Requirements
/// - Auction must be ended
/// - Auction must not be resolved
///
/// # Effects
/// - Queues encrypted computation
pub fn determine_winner_first_price(
    ctx: Context<DetermineWinnerFirstPrice>,
    computation_offset: u64,
) -> Result<()> {
    let auction = &ctx.accounts.auction;

    require_settlement_allowed(auction)?;
    require!(
        auction.auction_type == AuctionType::FirstPrice,
        ErrorCode::WrongAuctionType
    );

    ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

    let args = ArgBuilder::new()
        .plaintext_u128(auction.state_nonce)
        .account(
            ctx.accounts.auction.key(),
            ENCRYPTED_STATE_OFFSET,
            ENCRYPTED_STATE_SIZE,
        )
        .build();

    queue_computation(
        ctx.accounts,
        computation_offset,
        args,
        vec![DetermineWinnerFirstPriceCallback::callback_ix(
            computation_offset,
            &ctx.accounts.mxe_account,
            &[CallbackAccount {
                pubkey: ctx.accounts.auction.key(),
                is_writable: true,
            }],
        )?],
        1,
        0,
    )?;

    Ok(())
}

/// Triggers winner computation for a Uniform auction.
///
/// Produces:
/// - Top 3 winners
/// - Clearing price
///
/// # Effects
/// - Queues encrypted computation
pub fn determine_winner_uniform(
    ctx: Context<DetermineWinnerUniform>,
    computation_offset: u64,
) -> Result<()> {
    let auction = &ctx.accounts.auction;

    require_settlement_allowed(auction)?;
    require!(
        auction.auction_type == AuctionType::Uniform,
        ErrorCode::WrongAuctionType
    );

    ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

    let args = ArgBuilder::new()
        .plaintext_u128(auction.state_nonce)
        .account(
            ctx.accounts.auction.key(),
            ENCRYPTED_STATE_OFFSET,
            ENCRYPTED_STATE_SIZE,
        )
        .build();

    queue_computation(
        ctx.accounts,
        computation_offset,
        args,
        vec![DetermineWinnerUniformCallback::callback_ix(
            computation_offset,
            &ctx.accounts.mxe_account,
            &[CallbackAccount {
                pubkey: ctx.accounts.auction.key(),
                is_writable: true,
            }],
        )?],
        1,
        0,
    )?;

    Ok(())
}

// DEPRECATED
pub fn determine_winner_pro_rata(
    ctx: Context<DetermineWinnerProRata>,
    computation_offset: u64,
) -> Result<()> {
    let auction = &ctx.accounts.auction;

    require_settlement_allowed(auction)?;
    require!(
        auction.auction_type == AuctionType::ProRata,
        ErrorCode::WrongAuctionType
    );

    ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

    let args = ArgBuilder::new()
        .plaintext_u128(auction.state_nonce)
        .account(
            ctx.accounts.auction.key(),
            ENCRYPTED_STATE_OFFSET,
            ENCRYPTED_STATE_SIZE,
        )
        .build();

    queue_computation(
        ctx.accounts,
        computation_offset,
        args,
        vec![DetermineWinnerProRataCallback::callback_ix(
            computation_offset,
            &ctx.accounts.mxe_account,
            &[CallbackAccount {
                pubkey: ctx.accounts.auction.key(),
                is_writable: true,
            }],
        )?],
        1,
        0,
    )?;

    Ok(())
}

    #[arcium_callback(encrypted_ix = "init_auction_state")]
    pub fn init_auction_state_callback(
        ctx: Context<InitAuctionStateCallback>,
        output: SignedComputationOutputs<InitAuctionStateOutput>,
    ) -> Result<()> {
        let o = match output.verify_output(
            &ctx.accounts.cluster_account,
            &ctx.accounts.computation_account,
        ) {
            Ok(InitAuctionStateOutput { field_0 }) => field_0,
            Err(_) => return Err(ErrorCode::AbortedComputation.into()),
        };

        let auction_key = ctx.accounts.auction.key();
        let authority = ctx.accounts.auction.authority;
        let auction_type = ctx.accounts.auction.auction_type;
        let min_bid = ctx.accounts.auction.min_bid;
        let end_time = ctx.accounts.auction.end_time;

        let auction = &mut ctx.accounts.auction;
        auction.encrypted_state = o.ciphertexts;
        auction.state_nonce = o.nonce;

        emit!(AuctionCreatedEvent {
            auction: auction_key,
            authority,
            auction_type,
            min_bid,
            end_time,
        });

        Ok(())
    }

#[arcium_callback(encrypted_ix = "determine_winner_first_price")]
pub fn determine_winner_first_price_callback(
    ctx: Context<DetermineWinnerFirstPriceCallback>,
    output: SignedComputationOutputs<DetermineWinnerFirstPriceOutput>,
) -> Result<()> {
    let (winner_lo, winner_hi, payment_amount) = match output.verify_output(
        &ctx.accounts.cluster_account,
        &ctx.accounts.computation_account,
    ) {
        Ok(DetermineWinnerFirstPriceOutput {
            field_0:
                DetermineWinnerFirstPriceOutputStruct0 {
                    field_0:
                        DetermineWinnerFirstPriceOutputStruct00 {
                            field_0: winner_lo,
                            field_1: winner_hi,
                        },
                    field_1: payment_amount,
                },
        }) => (winner_lo, winner_hi, payment_amount),
        Err(_) => return Err(ErrorCode::AbortedComputation.into()),
    };

    let mut winner = [0u8; 32];
    winner[..16].copy_from_slice(&winner_lo.to_le_bytes());
    winner[16..].copy_from_slice(&winner_hi.to_le_bytes());
    let winner_pk = Pubkey::new_from_array(winner);

    let auction_key = ctx.accounts.auction.key();
    let auction_type = ctx.accounts.auction.auction_type;
    let auction = &mut ctx.accounts.auction;

    require_not_resolved(auction)?;
    auction.status = AuctionStatus::Resolved;
    auction.winner = winner_pk;
    auction.payment_amount = payment_amount;

    emit!(AuctionResolvedEvent {
        auction: auction_key,
        winner,
        payment_amount,
        auction_type,
    });

    Ok(())
}

/// Triggers winner computation for a Vickrey auction.
///
/// Winner pays second-highest price.
///
/// # Effects
/// - Queues encrypted computation
pub fn determine_winner_vickrey(
    ctx: Context<DetermineWinnerVickrey>,
    computation_offset: u64,
) -> Result<()> {
    let auction = &ctx.accounts.auction;

    require_settlement_allowed(auction)?;
    require!(
        auction.auction_type == AuctionType::Vickrey,
        ErrorCode::WrongAuctionType
    );

    ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

    let args = ArgBuilder::new()
        .plaintext_u128(auction.state_nonce)
        .account(
            ctx.accounts.auction.key(),
            ENCRYPTED_STATE_OFFSET,
            ENCRYPTED_STATE_SIZE,
        )
        .build();

    queue_computation(
        ctx.accounts,
        computation_offset,
        args,
        vec![DetermineWinnerVickreyCallback::callback_ix(
            computation_offset,
            &ctx.accounts.mxe_account,
            &[CallbackAccount {
                pubkey: ctx.accounts.auction.key(),
                is_writable: true,
            }],
        )?],
        1,
        0,
    )?;

    Ok(())
}
 #[arcium_callback(encrypted_ix = "determine_winner_vickrey")]
pub fn determine_winner_vickrey_callback(
    ctx: Context<DetermineWinnerVickreyCallback>,
    output: SignedComputationOutputs<DetermineWinnerVickreyOutput>,
) -> Result<()> {
    let (winner_lo, winner_hi, payment_amount) = match output.verify_output(
        &ctx.accounts.cluster_account,
        &ctx.accounts.computation_account,
    ) {
        Ok(DetermineWinnerVickreyOutput {
            field_0:
                DetermineWinnerVickreyOutputStruct0 {
                    field_0:
                        DetermineWinnerVickreyOutputStruct00 {
                            field_0: winner_lo,
                            field_1: winner_hi,
                        },
                    field_1: payment_amount,
                },
        }) => (winner_lo, winner_hi, payment_amount),
        Err(_) => return Err(ErrorCode::AbortedComputation.into()),
    };

    let mut winner = [0u8; 32];
    winner[..16].copy_from_slice(&winner_lo.to_le_bytes());
    winner[16..].copy_from_slice(&winner_hi.to_le_bytes());
    let winner_pk = Pubkey::new_from_array(winner);

    let auction_key = ctx.accounts.auction.key();
    let auction_type = ctx.accounts.auction.auction_type;
    let auction = &mut ctx.accounts.auction;

    require_not_resolved(auction)?;
    auction.status = AuctionStatus::Resolved;
    auction.winner = winner_pk;
    auction.payment_amount = payment_amount;

    emit!(AuctionResolvedEvent {
        auction: auction_key,
        winner,
        payment_amount,
        auction_type,
    });

    Ok(())
}

// =======================
// AUCTION ACCOUNT
// =======================

#[account]
#[derive(InitSpace)]
pub struct Auction {
    pub bump: u8,
    pub authority: Pubkey,
    pub auction_type: AuctionType,
    pub status: AuctionStatus,
    pub min_bid: u64,
    pub end_time: i64,
    pub bid_count: u16,
    pub state_nonce: u128,
    pub encrypted_state: [[u8; 32]; 13],

    pub asset_kind: AssetKind,
    #[max_len(200)]
    pub auction_metadata_uri: String,

    pub token_mint: Pubkey,
    pub sale_amount: u64,

pub prize_vault: Pubkey,
pub shared_vault: Pubkey,
pub vault_authority_bump: u8,
pub prize_decimals: u8,

    pub winner: Pubkey,
    pub payment_amount: u64,
    pub winner_paid: bool,
    pub raydium_pool_created: bool,

    pub winner_prices: [u64; 3],

    pub winners: [Pubkey; 3],
    pub winner_bids: [u64; 3],
    pub clearing_price: u64,
    pub total_bid: u64,
    pub winner_paid_multi: [bool; 3],
}


#[callback_accounts("init_auction_state")]
#[derive(Accounts)]
pub struct InitAuctionStateCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_INIT_AUCTION_STATE))]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Account<'info, MXEAccount>,
    /// CHECK: computation_account, checked by arcium program via constraints in the callback context.
    pub computation_account: UncheckedAccount<'info>,
    #[account(address = derive_cluster_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    pub cluster_account: Account<'info, Cluster>,
    #[account(address = ::anchor_lang::solana_program::sysvar::instructions::ID)]
    /// CHECK: instructions_sysvar, checked by the account constraint
    pub instructions_sysvar: AccountInfo<'info>,
    #[account(mut)]
    pub auction: Box<Account<'info, Auction>>,
}

#[queue_computation_accounts("place_bid", bidder)]
#[derive(Accounts)]
#[instruction(computation_offset: u64)]
pub struct PlaceBid<'info> {
    #[account(mut)]
    pub bidder: Signer<'info>,

    #[account(mut)]
    pub auction: Box<Account<'info, Auction>>,

    #[account(
        init_if_needed,
        payer = bidder,
        space = 8 + EscrowAccount::INIT_SPACE,
        seeds = [b"escrow", auction.key().as_ref(), bidder.key().as_ref()],
        bump,
    )]
    pub escrow_account: Box<Account<'info, EscrowAccount>>,
#[account(
    mut,
    constraint = bidder_wsol_ata.owner == bidder.key(),
    constraint = bidder_wsol_ata.mint == wsol_mint.key()
)]
pub bidder_wsol_ata: Box<InterfaceAccount<'info, TokenAccount>>,

pub wsol_mint: Box<InterfaceAccount<'info, Mint>>,
pub token_program: Interface<'info, TokenInterface>,

#[account(
    init_if_needed,
    payer = bidder,
    associated_token::mint = wsol_mint,
    associated_token::authority = escrow_account,
)]
pub escrow_token_account: Box<InterfaceAccount<'info, TokenAccount>>,
pub associated_token_program: Program<'info, AssociatedToken>,

    #[account(
        init_if_needed,
        payer = bidder,
        space = 9,
        seeds = [&SIGN_PDA_SEED],
        bump,
        address = derive_sign_pda!(),
    )]
    pub sign_pda_account: Box<Account<'info, ArciumSignerAccount>>,

    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,

    #[account(mut, address = derive_mempool_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    /// CHECK: mempool_account is validated by the address constraint and Arcium runtime.
    pub mempool_account: UncheckedAccount<'info>,

    #[account(mut, address = derive_execpool_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    /// CHECK: executing_pool is validated by the address constraint and Arcium runtime.
    pub executing_pool: UncheckedAccount<'info>,

    #[account(mut, address = derive_comp_pda!(computation_offset, mxe_account, ErrorCode::ClusterNotSet))]
    /// CHECK: computation_account is validated by the address constraint and Arcium runtime.
    pub computation_account: UncheckedAccount<'info>,

    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_PLACE_BID))]
    pub comp_def_account: Box<Account<'info, ComputationDefinitionAccount>>,

    #[account(mut, address = derive_cluster_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    /// CHECK: cluster_account is validated by the address constraint and Arcium runtime.
    pub cluster_account: Box<Account<'info, Cluster>>,

    #[account(mut, address = ARCIUM_FEE_POOL_ACCOUNT_ADDRESS)]
    /// CHECK: fee pool account is validated by the address constraint and Arcium runtime.
    pub pool_account: Box<Account<'info, FeePool>>,

    #[account(mut, address = ARCIUM_CLOCK_ACCOUNT_ADDRESS)]
    /// CHECK: clock account is validated by the address constraint and Arcium runtime.
    pub clock_account: Box<Account<'info, ClockAccount>>,

    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,
}

#[queue_computation_accounts("place_encrypted_bid", cranker)]
#[derive(Accounts)]
#[instruction(computation_offset: u64)]
pub struct PlaceEncryptedBid<'info> {
    #[account(mut)]
    pub cranker: Signer<'info>,

    #[account(mut, has_one = shared_vault)]
    pub auction: Box<Account<'info, Auction>>,

    #[account(
        mut,
        seeds = [b"shared-vault", auction.key().as_ref()],
        bump,
        has_one = auction @ ErrorCode::InvalidSharedVault
    )]
    pub shared_vault: Box<Account<'info, SharedVault>>,

    #[account(
        mut,
        has_one = auction @ ErrorCode::EscrowMismatch,
        has_one = shared_vault @ ErrorCode::InvalidSharedVault,
        constraint = !temp_bid.consumed @ ErrorCode::TempBidAlreadyConsumed
    )]
    pub temp_bid: Box<Account<'info, PendingEncryptedBid>>,

    #[account(
        init_if_needed,
        space = 9,
        payer = cranker,
        seeds = [&SIGN_PDA_SEED],
        bump,
        address = derive_sign_pda!(),
    )]
    pub sign_pda_account: Box<Account<'info, ArciumSignerAccount>>,

    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,

    #[account(
        mut,
        address = derive_mempool_pda!(mxe_account, ErrorCode::ClusterNotSet)
    )]
    /// CHECK: mempool_account is validated by the PDA derivation and Arcium runtime.
    pub mempool_account: UncheckedAccount<'info>,

    #[account(
        mut,
        address = derive_execpool_pda!(mxe_account, ErrorCode::ClusterNotSet)
    )]
    /// CHECK: executing_pool is validated by the PDA derivation and Arcium runtime.
    pub executing_pool: UncheckedAccount<'info>,

    #[account(
        mut,
        address = derive_comp_pda!(computation_offset, mxe_account, ErrorCode::ClusterNotSet)
    )]
    /// CHECK: computation_account is validated by the PDA derivation and Arcium runtime.
    pub computation_account: UncheckedAccount<'info>,

    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_PLACE_ENCRYPTED_BID))]
    pub comp_def_account: Box<Account<'info, ComputationDefinitionAccount>>,

    #[account(
        mut,
        address = derive_cluster_pda!(mxe_account, ErrorCode::ClusterNotSet)
    )]
    /// CHECK: cluster_account is validated by the PDA derivation and Arcium runtime.
    pub cluster_account: Box<Account<'info, Cluster>>,

    #[account(mut, address = ARCIUM_FEE_POOL_ACCOUNT_ADDRESS)]
    /// CHECK: pool_account is a fixed Arcium fee pool address.
    pub pool_account: Box<Account<'info, FeePool>>,

    #[account(mut, address = ARCIUM_CLOCK_ACCOUNT_ADDRESS)]
    /// CHECK: clock_account is a fixed Arcium clock address.
    pub clock_account: Box<Account<'info, ClockAccount>>,

    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,
}

#[callback_accounts("place_bid")]
#[derive(Accounts)]
pub struct PlaceBidCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_PLACE_BID))]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Account<'info, MXEAccount>,
    /// CHECK: computation_account, checked by arcium program via constraints in the callback context.
    pub computation_account: UncheckedAccount<'info>,
    #[account(address = derive_cluster_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    pub cluster_account: Account<'info, Cluster>,
    #[account(address = ::anchor_lang::solana_program::sysvar::instructions::ID)]
    /// CHECK: instructions_sysvar, checked by the account constraint
    pub instructions_sysvar: AccountInfo<'info>,
    #[account(mut)]
    pub auction: Box<Account<'info, Auction>>,
}

#[callback_accounts("place_encrypted_bid")]
#[derive(Accounts)]
pub struct PlaceEncryptedBidCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_PLACE_ENCRYPTED_BID))]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Account<'info, MXEAccount>,
    /// CHECK: computation_account, checked by Arcium program via constraints in the callback context.
    pub computation_account: UncheckedAccount<'info>,
    #[account(address = derive_cluster_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    pub cluster_account: Account<'info, Cluster>,
    #[account(address = ::anchor_lang::solana_program::sysvar::instructions::ID)]
    /// CHECK: instructions_sysvar, checked by the account constraint.
    pub instructions_sysvar: AccountInfo<'info>,
    #[account(mut)]
    pub auction: Box<Account<'info, Auction>>,
}

#[derive(Accounts)]
pub struct CloseAuction<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,
    #[account(
        mut,
        has_one = authority @ ErrorCode::Unauthorized,
    )]
    pub auction: Box<Account<'info, Auction>>,
}

#[queue_computation_accounts("determine_winner_first_price", settler)]
#[derive(Accounts)]
#[instruction(computation_offset: u64)]
pub struct DetermineWinnerFirstPrice<'info> {
    #[account(mut)]
    pub settler: Signer<'info>,

    #[account(mut)]
    pub auction: Box<Account<'info, Auction>>,

    #[account(
        init_if_needed,
        space = 9,
        payer = settler,
        seeds = [&SIGN_PDA_SEED],
        bump,
        address = derive_sign_pda!(),
    )]
    pub sign_pda_account: Box<Account<'info, ArciumSignerAccount>>,

    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,

    #[account(mut, address = derive_mempool_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    /// CHECK: mempool_account is validated by the address constraint and Arcium runtime.
    pub mempool_account: UncheckedAccount<'info>,

    #[account(mut, address = derive_execpool_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    /// CHECK: executing_pool is validated by the address constraint and Arcium runtime.
    pub executing_pool: UncheckedAccount<'info>,

    #[account(mut, address = derive_comp_pda!(computation_offset, mxe_account, ErrorCode::ClusterNotSet))]
    /// CHECK: computation_account is validated by the address constraint and Arcium runtime.
    pub computation_account: UncheckedAccount<'info>,

    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_DETERMINE_WINNER_FIRST_PRICE))]
    pub comp_def_account: Box<Account<'info, ComputationDefinitionAccount>>,

    #[account(mut, address = derive_cluster_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    /// CHECK: cluster_account is validated by the address constraint and Arcium runtime.
    pub cluster_account: Box<Account<'info, Cluster>>,

    #[account(mut, address = ARCIUM_FEE_POOL_ACCOUNT_ADDRESS)]
    /// CHECK: fee pool account is validated by the address constraint and Arcium runtime.
    pub pool_account: Box<Account<'info, FeePool>>,

    #[account(mut, address = ARCIUM_CLOCK_ACCOUNT_ADDRESS)]
    /// CHECK: clock account is validated by the address constraint and Arcium runtime.
    pub clock_account: Box<Account<'info, ClockAccount>>,

    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,
}

#[callback_accounts("determine_winner_first_price")]
#[derive(Accounts)]
pub struct DetermineWinnerFirstPriceCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_DETERMINE_WINNER_FIRST_PRICE))]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Account<'info, MXEAccount>,
    /// CHECK: computation_account, checked by arcium program via constraints in the callback context.
    pub computation_account: UncheckedAccount<'info>,
    #[account(address = derive_cluster_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    pub cluster_account: Account<'info, Cluster>,
    #[account(address = ::anchor_lang::solana_program::sysvar::instructions::ID)]
    /// CHECK: instructions_sysvar, checked by the account constraint
    pub instructions_sysvar: AccountInfo<'info>,
    #[account(mut)]
    pub auction: Box<Account<'info, Auction>>,
}

#[queue_computation_accounts("determine_winner_vickrey", settler)]
#[derive(Accounts)]
#[instruction(computation_offset: u64)]
pub struct DetermineWinnerVickrey<'info> {
    #[account(mut)]
    pub settler: Signer<'info>,

    #[account(mut)]
    pub auction: Box<Account<'info, Auction>>,

    #[account(
        init_if_needed,
        space = 9,
        payer = settler,
        seeds = [&SIGN_PDA_SEED],
        bump,
        address = derive_sign_pda!(),
    )]
    pub sign_pda_account: Box<Account<'info, ArciumSignerAccount>>,

    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,

    #[account(mut, address = derive_mempool_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    /// CHECK: mempool_account is validated by the address constraint and Arcium runtime.
    pub mempool_account: UncheckedAccount<'info>,

    #[account(mut, address = derive_execpool_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    /// CHECK: executing_pool is validated by the address constraint and Arcium runtime.
    pub executing_pool: UncheckedAccount<'info>,

    #[account(mut, address = derive_comp_pda!(computation_offset, mxe_account, ErrorCode::ClusterNotSet))]
    /// CHECK: computation_account is validated by the address constraint and Arcium runtime.
    pub computation_account: UncheckedAccount<'info>,

    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_DETERMINE_WINNER_VICKREY))]
    pub comp_def_account: Box<Account<'info, ComputationDefinitionAccount>>,

    #[account(mut, address = derive_cluster_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    /// CHECK: cluster_account is validated by the address constraint and Arcium runtime.
    pub cluster_account: Box<Account<'info, Cluster>>,

    #[account(mut, address = ARCIUM_FEE_POOL_ACCOUNT_ADDRESS)]
    /// CHECK: fee pool account is validated by the address constraint and Arcium runtime.
    pub pool_account: Box<Account<'info, FeePool>>,

    #[account(mut, address = ARCIUM_CLOCK_ACCOUNT_ADDRESS)]
    /// CHECK: clock account is validated by the address constraint and Arcium runtime.
    pub clock_account: Box<Account<'info, ClockAccount>>,

    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,
}

#[callback_accounts("determine_winner_vickrey")]
#[derive(Accounts)]
pub struct DetermineWinnerVickreyCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_DETERMINE_WINNER_VICKREY))]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Account<'info, MXEAccount>,
    /// CHECK: computation_account, checked by arcium program via constraints in the callback context.
    pub computation_account: UncheckedAccount<'info>,
    #[account(address = derive_cluster_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    pub cluster_account: Account<'info, Cluster>,
    #[account(address = ::anchor_lang::solana_program::sysvar::instructions::ID)]
    /// CHECK: instructions_sysvar, checked by the account constraint
    pub instructions_sysvar: AccountInfo<'info>,
    #[account(mut)]
    pub auction: Box<Account<'info, Auction>>,
}

#[init_computation_definition_accounts("init_auction_state", payer)]
#[derive(Accounts)]
pub struct InitAuctionStateCompDef<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    #[account(mut)]
    /// CHECK: comp_def_account, checked by arcium program.
    pub comp_def_account: UncheckedAccount<'info>,
    #[account(mut, address = derive_mxe_lut_pda!(mxe_account.lut_offset_slot))]
    /// CHECK: address_lookup_table, checked by arcium program.
    pub address_lookup_table: UncheckedAccount<'info>,
    #[account(address = LUT_PROGRAM_ID)]
    /// CHECK: lut_program is the Address Lookup Table program.
    pub lut_program: UncheckedAccount<'info>,
    pub arcium_program: Program<'info, Arcium>,
    pub system_program: Program<'info, System>,
}

#[queue_computation_accounts("init_auction_state", authority)]
#[derive(Accounts)]
#[instruction(computation_offset: u64, auction_seed: [u8; 8])]
pub struct CreateMetadataAuction<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = 8 + Auction::INIT_SPACE,
        seeds = [b"auction", authority.key().as_ref(), auction_seed.as_ref()],
        bump,
    )]
    pub auction: Box<Account<'info, Auction>>,

    #[account(
    init,
    payer = authority,
    space = 8 + SharedVault::INIT_SPACE,
    seeds = [b"shared-vault", auction.key().as_ref()],
    bump,
)]
pub shared_vault: Box<Account<'info, SharedVault>>,

    #[account(
        init_if_needed,
        payer = authority,
        space = 9,
        seeds = [&SIGN_PDA_SEED],
        bump,
        address = derive_sign_pda!(),
    )]
    pub sign_pda_account: Box<Account<'info, ArciumSignerAccount>>,

    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,

    #[account(mut, address = derive_mempool_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    /// CHECK: validated by address constraint and Arcium runtime.
    pub mempool_account: UncheckedAccount<'info>,

    #[account(mut, address = derive_execpool_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    /// CHECK: validated by address constraint and Arcium runtime.
    pub executing_pool: UncheckedAccount<'info>,

    #[account(mut, address = derive_comp_pda!(computation_offset, mxe_account, ErrorCode::ClusterNotSet))]
    /// CHECK: validated by address constraint and Arcium runtime.
    pub computation_account: UncheckedAccount<'info>,

    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_INIT_AUCTION_STATE))]
    pub comp_def_account: Box<Account<'info, ComputationDefinitionAccount>>,

    #[account(mut, address = derive_cluster_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    /// CHECK: validated by address constraint and Arcium runtime.
    pub cluster_account: Box<Account<'info, Cluster>>,

    #[account(mut, address = ARCIUM_FEE_POOL_ACCOUNT_ADDRESS)]
    /// CHECK: validated by address constraint and Arcium runtime.
    pub pool_account: Box<Account<'info, FeePool>>,

    #[account(mut, address = ARCIUM_CLOCK_ACCOUNT_ADDRESS)]
    /// CHECK: validated by address constraint and Arcium runtime.
    pub clock_account: Box<Account<'info, ClockAccount>>,

    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,
}

#[queue_computation_accounts("init_auction_state", authority)]
#[derive(Accounts)]
#[instruction(computation_offset: u64, auction_seed: [u8; 8])]
pub struct CreateTokenAuction<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        init,
        payer = authority,
        space = 8 + Auction::INIT_SPACE,
        seeds = [b"auction", authority.key().as_ref(), auction_seed.as_ref()],
        bump,
    )]
    pub auction: Box<Account<'info, Auction>>,

    pub prize_mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(
        seeds = [b"vault-authority", auction.key().as_ref()],
        bump
    )]
    /// CHECK: PDA used only as signer for token transfers; seeds constrain the address.
    pub vault_authority: UncheckedAccount<'info>,

#[account(
    init,
    payer = authority,
    space = 8 + SharedVault::INIT_SPACE,
    seeds = [b"shared-vault", auction.key().as_ref()],
    bump,
)]
pub shared_vault: Box<Account<'info, SharedVault>>,

    #[account(mut)]
    pub authority_token_account: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        init_if_needed,
        payer = authority,
        associated_token::mint = prize_mint,
        associated_token::authority = vault_authority,
        associated_token::token_program = token_program,
    )]
    pub prize_vault: Box<InterfaceAccount<'info, TokenAccount>>,

    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,

    #[account(
        init_if_needed,
        payer = authority,
        space = 9,
        seeds = [&SIGN_PDA_SEED],
        bump,
        address = derive_sign_pda!(),
    )]
    pub sign_pda_account: Box<Account<'info, ArciumSignerAccount>>,

    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,

    #[account(mut, address = derive_mempool_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    /// CHECK: mempool_account is validated by the address constraint and Arcium runtime.
    pub mempool_account: UncheckedAccount<'info>,

    #[account(mut, address = derive_execpool_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    /// CHECK: executing_pool is validated by the address constraint and Arcium runtime.
    pub executing_pool: UncheckedAccount<'info>,

    #[account(mut, address = derive_comp_pda!(computation_offset, mxe_account, ErrorCode::ClusterNotSet))]
    /// CHECK: computation_account is validated by the address constraint and Arcium runtime.
    pub computation_account: UncheckedAccount<'info>,

    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_INIT_AUCTION_STATE))]
    pub comp_def_account: Box<Account<'info, ComputationDefinitionAccount>>,

    #[account(mut, address = derive_cluster_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    /// CHECK: cluster_account is validated by the address constraint and Arcium runtime.
    pub cluster_account: Box<Account<'info, Cluster>>,

    #[account(mut, address = ARCIUM_FEE_POOL_ACCOUNT_ADDRESS)]
    /// CHECK: fee pool account is validated by the address constraint and Arcium runtime.
    pub pool_account: Box<Account<'info, FeePool>>,

    #[account(mut, address = ARCIUM_CLOCK_ACCOUNT_ADDRESS)]
    /// CHECK: clock account is validated by the address constraint and Arcium runtime.
    pub clock_account: Box<Account<'info, ClockAccount>>,

    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,
}

#[init_computation_definition_accounts("place_bid", payer)]
#[derive(Accounts)]
pub struct InitPlaceBidCompDef<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    #[account(mut)]
    /// CHECK: comp_def_account, checked by arcium program.
    pub comp_def_account: UncheckedAccount<'info>,
    #[account(mut, address = derive_mxe_lut_pda!(mxe_account.lut_offset_slot))]
    /// CHECK: address_lookup_table, checked by arcium program.
    pub address_lookup_table: UncheckedAccount<'info>,
    #[account(address = LUT_PROGRAM_ID)]
    /// CHECK: lut_program is the Address Lookup Table program.
    pub lut_program: UncheckedAccount<'info>,
    pub arcium_program: Program<'info, Arcium>,
    pub system_program: Program<'info, System>,
}

#[init_computation_definition_accounts("place_encrypted_bid", payer)]
#[derive(Accounts)]
pub struct InitPlaceEncryptedBidCompDef<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    #[account(mut)]
    /// CHECK: comp_def_account, checked by arcium program.
    pub comp_def_account: UncheckedAccount<'info>,
    #[account(mut, address = derive_mxe_lut_pda!(mxe_account.lut_offset_slot))]
    /// CHECK: address_lookup_table, checked by arcium program.
    pub address_lookup_table: UncheckedAccount<'info>,
    #[account(address = LUT_PROGRAM_ID)]
    /// CHECK: lut_program is the Address Lookup Table program.
    pub lut_program: UncheckedAccount<'info>,
    pub arcium_program: Program<'info, Arcium>,
    pub system_program: Program<'info, System>,
}

#[init_computation_definition_accounts("determine_winner_first_price", payer)]
#[derive(Accounts)]
pub struct InitDetermineWinnerFirstPriceCompDef<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    #[account(mut)]
    /// CHECK: comp_def_account, checked by arcium program.
    pub comp_def_account: UncheckedAccount<'info>,
    #[account(mut, address = derive_mxe_lut_pda!(mxe_account.lut_offset_slot))]
    /// CHECK: address_lookup_table, checked by arcium program.
    pub address_lookup_table: UncheckedAccount<'info>,
    #[account(address = LUT_PROGRAM_ID)]
    /// CHECK: lut_program is the Address Lookup Table program.
    pub lut_program: UncheckedAccount<'info>,
    pub arcium_program: Program<'info, Arcium>,
    pub system_program: Program<'info, System>,
}

#[init_computation_definition_accounts("determine_winner_vickrey", payer)]
#[derive(Accounts)]
pub struct InitDetermineWinnerVickreyCompDef<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    #[account(mut)]
    /// CHECK: comp_def_account, checked by arcium program.
    pub comp_def_account: UncheckedAccount<'info>,
    #[account(mut, address = derive_mxe_lut_pda!(mxe_account.lut_offset_slot))]
    /// CHECK: address_lookup_table, checked by arcium program.
    pub address_lookup_table: UncheckedAccount<'info>,
    #[account(address = LUT_PROGRAM_ID)]
    /// CHECK: lut_program is the Address Lookup Table program.
    pub lut_program: UncheckedAccount<'info>,
    pub arcium_program: Program<'info, Arcium>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
#[instruction(bidder: Pubkey, encrypted_amount: [u8; 32], nonce: u128)]
pub struct SubmitEncryptedBid<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(mut)]
    pub auction: Box<Account<'info, Auction>>,

    #[account(
        mut,
        seeds = [b"shared-vault", auction.key().as_ref()],
        bump,
        has_one = auction @ ErrorCode::InvalidSharedVault
    )]
    pub shared_vault: Box<Account<'info, SharedVault>>,

    #[account(
        init,
        payer = payer,
        space = 8 + PendingEncryptedBid::INIT_SPACE,
        seeds = [
            b"pending-encrypted-bid",
            auction.key().as_ref(),
            bidder.as_ref(),
            &nonce.to_le_bytes()
        ],
        bump
    )]
    pub temp_bid: Box<Account<'info, PendingEncryptedBid>>,

    pub system_program: Program<'info, System>,
}


#[account]
#[derive(InitSpace)]
pub struct EscrowAccount {
    pub bump: u8,
    pub auction: Pubkey,
    pub bidder: Pubkey,
    pub deposited_amount: u64,
}

pub fn mark_pool_created(ctx: Context<MarkPoolCreated>) -> Result<()> {
    let auction = &mut ctx.accounts.auction;
    require_keys_eq!(
        ctx.accounts.authority.key(),
        auction.authority,
        ErrorCode::Unauthorized
    );
    require!(
        auction.status == AuctionStatus::Resolved,
        ErrorCode::AuctionNotResolved
    );
    require!(!auction.raydium_pool_created, ErrorCode::PoolAlreadyCreated);
    auction.raydium_pool_created = true;
    Ok(())
}

#[derive(Accounts)]
pub struct MarkPoolCreated<'info> {
    #[account(mut)]
    pub authority: Signer<'info>,

    #[account(
        mut,
        has_one = authority @ ErrorCode::Unauthorized
    )]
    pub auction: Box<Account<'info, Auction>>,
}

/// Finalizes payout for token/NFT auctions.
///
/// Handles:
/// - Paying creator from escrow
/// - Refunding excess to winner
/// - Transferring prize tokens
///
/// # Behavior
/// - FirstPrice: winner pays bid
/// - Vickrey: winner pays second price
/// - Uniform: multi-winner clearing price
/// - ProRata: proportional distribution (Deprecated)
///
/// # Effects
/// - Moves WSOL from escrow
/// - Transfers prize tokens
/// - Marks winners as paid
pub fn finalize_token_winner_payout(ctx: Context<FinalizeTokenWinnerPayout>) -> Result<()> {
    let auction = &mut ctx.accounts.auction;

    require!(
        matches!(auction.asset_kind, AssetKind::Fungible | AssetKind::Nft),
        ErrorCode::WrongAssetKind
    );
    require!(
        auction.status == AuctionStatus::Resolved,
        ErrorCode::AuctionNotResolved
    );
    require!(
        Clock::get()?.unix_timestamp >= auction.end_time,
        ErrorCode::AuctionNotEnded
    );
  
    use anchor_spl::token::spl_token::native_mint;

require_keys_eq!(
    ctx.accounts.wsol_mint.key(),
    native_mint::ID,
    ErrorCode::WrongMint
);

    let winner_wallet_key = ctx.accounts.winner_wallet.key();
    let escrow = &ctx.accounts.winner_escrow;

require!(
    ctx.accounts.escrow_token_account.amount >= escrow.deposited_amount,
    ErrorCode::EscrowInsufficient
);

    require_keys_eq!(escrow.auction, auction.key(), ErrorCode::EscrowMismatch);
    require_keys_eq!(escrow.bidder, winner_wallet_key, ErrorCode::EscrowOwnerMismatch);

    match auction.auction_type {
        AuctionType::FirstPrice => {
            require_keys_eq!(
                winner_wallet_key,
                auction.winner,
                ErrorCode::InvalidSettlementWinner
            );
            require!(!auction.winner_paid, ErrorCode::AuctionAlreadySettled);

            let payment_amount = auction.payment_amount;
            let sale_amount = auction.sale_amount;

let auction_key = auction.key(); 

let seeds = &[
    b"escrow",
    auction_key.as_ref(),
    winner_wallet_key.as_ref(),
    &[escrow.bump],
];

let signer_seeds: &[&[&[u8]]] = &[seeds];

settle_token_escrow(
    &ctx.accounts.escrow_token_account.to_account_info(),
    &ctx.accounts.creator_wsol_ata.to_account_info(),
    &ctx.accounts.winner_wsol_ata.to_account_info(),
    &ctx.accounts.winner_escrow.to_account_info(),
    &ctx.accounts.token_program.to_account_info(),
    signer_seeds,
    escrow.deposited_amount,
    payment_amount,
    &ctx.accounts.wsol_mint.to_account_info(),
    ctx.accounts.wsol_mint.decimals,
)?;

            let auction_key = auction.key();
            let signer_seeds: &[&[&[u8]]] = &[&[
                b"vault-authority",
                auction_key.as_ref(),
                &[auction.vault_authority_bump],
            ]];

            pay_winner(
                ctx.accounts.token_program.to_account_info(),
                ctx.accounts.prize_mint.to_account_info(),
                ctx.accounts.prize_vault.to_account_info(),
                ctx.accounts.vault_authority.to_account_info(),
                ctx.accounts.winner_ata.to_account_info(),
                sale_amount,
                auction.prize_decimals,
                signer_seeds,
            )?;

            auction.winner_paid = true;
        }

        AuctionType::Vickrey => {
            require_keys_eq!(
                winner_wallet_key,
                auction.winner,
                ErrorCode::InvalidSettlementWinner
            );
            require!(!auction.winner_paid, ErrorCode::AuctionAlreadySettled);

            let payment_amount = auction.payment_amount;
            let sale_amount = auction.sale_amount;

let auction_key = auction.key(); 

let seeds = &[
    b"escrow",
    auction_key.as_ref(),
    winner_wallet_key.as_ref(),
    &[escrow.bump],
];

let signer_seeds: &[&[&[u8]]] = &[seeds];

settle_token_escrow(
    &ctx.accounts.escrow_token_account.to_account_info(),
    &ctx.accounts.creator_wsol_ata.to_account_info(),
    &ctx.accounts.winner_wsol_ata.to_account_info(),
    &ctx.accounts.winner_escrow.to_account_info(),
    &ctx.accounts.token_program.to_account_info(),
    signer_seeds,
    escrow.deposited_amount,
    payment_amount,
    &ctx.accounts.wsol_mint.to_account_info(),
    ctx.accounts.wsol_mint.decimals,
)?;

            let auction_key = auction.key();
            let signer_seeds: &[&[&[u8]]] = &[&[
                b"vault-authority",
                auction_key.as_ref(),
                &[auction.vault_authority_bump],
            ]];

            pay_winner(
                ctx.accounts.token_program.to_account_info(),
                ctx.accounts.prize_mint.to_account_info(),
                ctx.accounts.prize_vault.to_account_info(),
                ctx.accounts.vault_authority.to_account_info(),
                ctx.accounts.winner_ata.to_account_info(),
                sale_amount,
                auction.prize_decimals,
                signer_seeds,
            )?;

            auction.winner_paid = true;
        }

        AuctionType::Uniform => {
            require!(
                auction.bid_count >= 3,
                ErrorCode::NotEnoughBidsForSettlement
            );

            let winner_index = if winner_wallet_key == auction.winners[0] {
                0
            } else if winner_wallet_key == auction.winners[1] {
                1
            } else if winner_wallet_key == auction.winners[2] {
                2
            } else {
                return err!(ErrorCode::InvalidSettlementWinner);
            };

            require!(
                !auction.winner_paid_multi[winner_index],
                ErrorCode::AuctionAlreadySettled
            );

let clearing_price = auction.clearing_price;
let amounts = auction.winner_bids;
let prices = auction.winner_prices;

// ---------- per-user ----------
let user_amount = amounts[winner_index];
let user_price = prices[winner_index];

require!(
    user_amount >= user_price,
    ErrorCode::BidTooSmall
);

// quantity = escrow / bid_price
let user_quantity = (user_amount as u128)
    .checked_div(user_price as u128)
    .ok_or(ErrorCode::LamportOverflow)?;

// payment = quantity * clearing_price
let payment_amount = user_quantity
    .checked_mul(clearing_price as u128)
    .ok_or(ErrorCode::LamportOverflow)? as u64;

// ---------- total value ----------
let mut total_value: u128 = 0;



for i in 0..3 {
    let q = (amounts[i] as u128)
        .checked_div(prices[i] as u128)
        .ok_or(ErrorCode::LamportOverflow)?;

    let v = q
        .checked_mul(clearing_price as u128)
        .ok_or(ErrorCode::LamportOverflow)?;

    total_value = total_value
        .checked_add(v)
        .ok_or(ErrorCode::LamportOverflow)?;
}

// ---------- user value ----------
let user_value = user_quantity
    .checked_mul(clearing_price as u128)
    .ok_or(ErrorCode::LamportOverflow)?;

// ---------- token allocation ----------
let payout_amount = ((auction.sale_amount as u128)
    .checked_mul(user_value)
    .ok_or(ErrorCode::LamportOverflow)?)
    .checked_div(total_value)
    .ok_or(ErrorCode::LamportOverflow)? as u64;

let auction_key = auction.key(); 

let seeds = &[
    b"escrow",
    auction_key.as_ref(),
    winner_wallet_key.as_ref(),
    &[escrow.bump],
];

let signer_seeds: &[&[&[u8]]] = &[seeds];

settle_token_escrow(
    &ctx.accounts.escrow_token_account.to_account_info(),
    &ctx.accounts.creator_wsol_ata.to_account_info(),
    &ctx.accounts.winner_wsol_ata.to_account_info(),
    &ctx.accounts.winner_escrow.to_account_info(),
    &ctx.accounts.token_program.to_account_info(),
    signer_seeds,
    escrow.deposited_amount,
    payment_amount,
    &ctx.accounts.wsol_mint.to_account_info(),
    ctx.accounts.wsol_mint.decimals,
)?;

            let auction_key = auction.key();
            let signer_seeds: &[&[&[u8]]] = &[&[
                b"vault-authority",
                auction_key.as_ref(),
                &[auction.vault_authority_bump],
            ]];

            pay_winner(
                ctx.accounts.token_program.to_account_info(),
                ctx.accounts.prize_mint.to_account_info(),
                ctx.accounts.prize_vault.to_account_info(),
                ctx.accounts.vault_authority.to_account_info(),
                ctx.accounts.winner_ata.to_account_info(),
                payout_amount,
                auction.prize_decimals,
                signer_seeds,
            )?;

            auction.winner_paid_multi[winner_index] = true;
        }

        AuctionType::ProRata => {
            require!(
                auction.bid_count >= 3,
                ErrorCode::NotEnoughBidsForSettlement
            );
            require!(auction.total_bid > 0, ErrorCode::NoBids);

            let winner_index = if winner_wallet_key == auction.winners[0] {
                0
            } else if winner_wallet_key == auction.winners[1] {
                1
            } else if winner_wallet_key == auction.winners[2] {
                2
            } else {
                return err!(ErrorCode::InvalidSettlementWinner);
            };

            require!(
                !auction.winner_paid_multi[winner_index],
                ErrorCode::AuctionAlreadySettled
            );

            let payment_amount = auction.winner_bids[winner_index];

            let total_bid = auction.total_bid as u128;
            let sale_amount = auction.sale_amount as u128;

            let share0 = ((sale_amount * auction.winner_bids[0] as u128) / total_bid) as u64;
            let share1 = ((sale_amount * auction.winner_bids[1] as u128) / total_bid) as u64;
            let share2 = ((sale_amount * auction.winner_bids[2] as u128) / total_bid) as u64;

            let remainder = auction.sale_amount - (share0 + share1 + share2);

            let payout_amount = match winner_index {
                0 => share0 + remainder,
                1 => share1,
                2 => share2,
                _ => unreachable!(),
            };

let auction_key = auction.key();

let seeds = &[
    b"escrow",
    auction_key.as_ref(),
    winner_wallet_key.as_ref(),
    &[escrow.bump],
];

let signer_seeds: &[&[&[u8]]] = &[seeds];

settle_token_escrow(
    &ctx.accounts.escrow_token_account.to_account_info(),
    &ctx.accounts.creator_wsol_ata.to_account_info(),
    &ctx.accounts.winner_wsol_ata.to_account_info(),
    &ctx.accounts.winner_escrow.to_account_info(),
    &ctx.accounts.token_program.to_account_info(),
    signer_seeds,
    escrow.deposited_amount,
    payment_amount,
    &ctx.accounts.wsol_mint.to_account_info(),
    ctx.accounts.wsol_mint.decimals,
)?;

            let auction_key = auction.key();
            let signer_seeds: &[&[&[u8]]] = &[&[
                b"vault-authority",
                auction_key.as_ref(),
                &[auction.vault_authority_bump],
            ]];

            pay_winner(
                ctx.accounts.token_program.to_account_info(),
                ctx.accounts.prize_mint.to_account_info(),
                ctx.accounts.prize_vault.to_account_info(),
                ctx.accounts.vault_authority.to_account_info(),
                ctx.accounts.winner_ata.to_account_info(),
                payout_amount,
                auction.prize_decimals,
                signer_seeds,
            )?;

            auction.winner_paid_multi[winner_index] = true;
        }
    }

    Ok(())
}

/// Finalizes payout for metadata-only auctions.
///
/// Only transfers WSOL (no token payout).
///
/// # Effects
/// - Pays creator
/// - Refunds winner excess
pub fn finalize_metadata_winner_payout(
    ctx: Context<FinalizeMetadataWinnerPayout>,
) -> Result<()> {
    let auction = &mut ctx.accounts.auction;

    require!(
        auction.asset_kind == AssetKind::MetadataOnly,
        ErrorCode::WrongAssetKind
    );
    require!(
        auction.status == AuctionStatus::Resolved,
        ErrorCode::AuctionNotResolved
    );
    require!(
        Clock::get()?.unix_timestamp >= auction.end_time,
        ErrorCode::AuctionNotEnded
    );

    use anchor_spl::token::spl_token::native_mint;

    require_keys_eq!(
        ctx.accounts.wsol_mint.key(),
        native_mint::ID,
        ErrorCode::WrongMint
    );

    let winner_wallet_key = ctx.accounts.winner_wallet.key();
    let escrow = &ctx.accounts.winner_escrow;

    require_keys_eq!(escrow.auction, auction.key(), ErrorCode::EscrowMismatch);
    require_keys_eq!(escrow.bidder, winner_wallet_key, ErrorCode::EscrowOwnerMismatch);

    require!(
        ctx.accounts.escrow_token_account.amount >= escrow.deposited_amount,
        ErrorCode::EscrowInsufficient
    );

    match auction.auction_type {
        AuctionType::FirstPrice | AuctionType::Vickrey => {
            require_keys_eq!(
                winner_wallet_key,
                auction.winner,
                ErrorCode::InvalidSettlementWinner
            );
            require!(!auction.winner_paid, ErrorCode::AuctionAlreadySettled);

            let payment_amount = auction.payment_amount;
let auction_key = auction.key(); 

let seeds = &[
    b"escrow",
    auction_key.as_ref(),
    winner_wallet_key.as_ref(),
    &[escrow.bump],
];

let signer_seeds: &[&[&[u8]]] = &[seeds];

            settle_token_escrow(
                &ctx.accounts.escrow_token_account.to_account_info(),
                &ctx.accounts.creator_wsol_ata.to_account_info(),
                &ctx.accounts.winner_wsol_ata.to_account_info(),
                &ctx.accounts.winner_escrow.to_account_info(),
                &ctx.accounts.token_program.to_account_info(),
                signer_seeds,
                escrow.deposited_amount,
                payment_amount,
                &ctx.accounts.wsol_mint.to_account_info(),
                ctx.accounts.wsol_mint.decimals,
            )?;

            auction.winner_paid = true;
        }

        _ => return err!(ErrorCode::WrongAuctionType),
    }

    Ok(())
}


/// Allows losing bidders to reclaim escrowed funds.
///
/// # Requirements
/// - Auction must be ended
/// - Caller must NOT be a winner
///
/// # Effects
/// - Transfers WSOL back to bidder
/// - Closes escrow account
pub fn claim_refund(ctx: Context<ClaimRefund>) -> Result<()> {
    let auction = &ctx.accounts.auction;

    require!(auction.status != AuctionStatus::Open, ErrorCode::AuctionNotClosed);
    require!(Clock::get()?.unix_timestamp >= auction.end_time, ErrorCode::AuctionNotEnded);
    use anchor_spl::token::spl_token::native_mint;

require_keys_eq!(
    ctx.accounts.wsol_mint.key(),
    native_mint::ID,
    ErrorCode::WrongMint
);

    let bidder_key = ctx.accounts.bidder.key();

    match auction.auction_type {
        AuctionType::FirstPrice | AuctionType::Vickrey => {
            require_keys_neq!(bidder_key, auction.winner, ErrorCode::WinnerCannotClaimRefund);
        }
        AuctionType::Uniform | AuctionType::ProRata => {
            require_keys_neq!(bidder_key, auction.winners[0], ErrorCode::WinnerCannotClaimRefund);
            require_keys_neq!(bidder_key, auction.winners[1], ErrorCode::WinnerCannotClaimRefund);
            require_keys_neq!(bidder_key, auction.winners[2], ErrorCode::WinnerCannotClaimRefund);
        }
    }
    let escrow = &ctx.accounts.escrow_account;

require_keys_eq!(escrow.auction, auction.key(), ErrorCode::EscrowMismatch);
require_keys_eq!(escrow.bidder, bidder_key, ErrorCode::EscrowOwnerMismatch);

let amount = escrow.deposited_amount;
require!(
    ctx.accounts.escrow_token_account.amount >= amount,
    ErrorCode::EscrowInsufficient
);
require!(amount > 0, ErrorCode::NoFundsInEscrow);

let auction_key = auction.key();

let seeds = &[
    b"escrow",
    auction_key.as_ref(),
    bidder_key.as_ref(),
    &[escrow.bump],
];

let signer_seeds: &[&[&[u8]]] = &[seeds];

let cpi_ctx = CpiContext::new_with_signer(
    ctx.accounts.token_program.to_account_info(),
    TransferChecked {
        from: ctx.accounts.escrow_token_account.to_account_info(),
        mint: ctx.accounts.wsol_mint.to_account_info(),
        to: ctx.accounts.bidder_wsol_ata.to_account_info(),
        authority: ctx.accounts.escrow_account.to_account_info(),
    },
    signer_seeds,
);

token_interface::transfer_checked(
    cpi_ctx,
    amount,
    ctx.accounts.wsol_mint.decimals,
)?;

    Ok(())
}



#[derive(Accounts)]
pub struct ClaimRefund<'info> {
    #[account(mut)]
    pub bidder: Signer<'info>,

    #[account(mut)]
    pub auction: Box<Account<'info, Auction>>,

    #[account(
        mut,
        seeds = [b"escrow", auction.key().as_ref(), bidder.key().as_ref()],
        bump,
        close = bidder,
    )]
    pub escrow_account: Account<'info, EscrowAccount>,
   #[account(
    mut,
    constraint = bidder_wsol_ata.owner == bidder.key(),
    constraint = bidder_wsol_ata.mint == wsol_mint.key()
)]
pub bidder_wsol_ata: InterfaceAccount<'info, TokenAccount>,

#[account(
    mut,
    associated_token::mint = wsol_mint,
    associated_token::authority = escrow_account,
)]
pub escrow_token_account: InterfaceAccount<'info, TokenAccount>,

pub wsol_mint: InterfaceAccount<'info, Mint>,
pub token_program: Interface<'info, TokenInterface>,
}
// =======================
// 1) NEW COMP-DEF INIT FUNCTIONS
// =======================


#[init_computation_definition_accounts("determine_winner_uniform", payer)]
#[derive(Accounts)]
pub struct InitDetermineWinnerUniformCompDef<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    #[account(mut)]
    /// CHECK: comp_def_account, checked by arcium program.
    pub comp_def_account: UncheckedAccount<'info>,
    #[account(mut, address = derive_mxe_lut_pda!(mxe_account.lut_offset_slot))]
    /// CHECK: address_lookup_table, checked by arcium program.
    pub address_lookup_table: UncheckedAccount<'info>,
    #[account(address = LUT_PROGRAM_ID)]
    /// CHECK: lut_program is the Address Lookup Table program.
    pub lut_program: UncheckedAccount<'info>,
    pub arcium_program: Program<'info, Arcium>,
    pub system_program: Program<'info, System>,
}

#[init_computation_definition_accounts("determine_winner_pro_rata", payer)]
#[derive(Accounts)]
pub struct InitDetermineWinnerProRataCompDef<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,
    #[account(mut, address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,
    #[account(mut)]
    /// CHECK: comp_def_account, checked by arcium program.
    pub comp_def_account: UncheckedAccount<'info>,
    #[account(mut, address = derive_mxe_lut_pda!(mxe_account.lut_offset_slot))]
    /// CHECK: address_lookup_table, checked by arcium program.
    pub address_lookup_table: UncheckedAccount<'info>,
    #[account(address = LUT_PROGRAM_ID)]
    /// CHECK: lut_program is the Address Lookup Table program.
    pub lut_program: UncheckedAccount<'info>,
    pub arcium_program: Program<'info, Arcium>,
    pub system_program: Program<'info, System>,
}


// =======================
// 2) NEW QUEUE/SETTLEMENT ACCOUNTS
// =======================

#[queue_computation_accounts("determine_winner_uniform", settler)]
#[derive(Accounts)]
#[instruction(computation_offset: u64)]
pub struct DetermineWinnerUniform<'info> {
    #[account(mut)]
    pub settler: Signer<'info>,

    #[account(mut)]
    pub auction: Box<Account<'info, Auction>>,

    #[account(
        init_if_needed,
        space = 9,
        payer = settler,
        seeds = [&SIGN_PDA_SEED],
        bump,
        address = derive_sign_pda!(),
    )]
    pub sign_pda_account: Box<Account<'info, ArciumSignerAccount>>,

    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,

    #[account(mut, address = derive_mempool_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    /// CHECK: mempool_account is validated by the address constraint and Arcium runtime.
    pub mempool_account: UncheckedAccount<'info>,

    #[account(mut, address = derive_execpool_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    /// CHECK: executing_pool is validated by the address constraint and Arcium runtime.
    pub executing_pool: UncheckedAccount<'info>,

    #[account(mut, address = derive_comp_pda!(computation_offset, mxe_account, ErrorCode::ClusterNotSet))]
    /// CHECK: computation_account is validated by the address constraint and Arcium runtime.
    pub computation_account: UncheckedAccount<'info>,

    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_DETERMINE_WINNER_UNIFORM))]
    pub comp_def_account: Box<Account<'info, ComputationDefinitionAccount>>,

    #[account(mut, address = derive_cluster_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    /// CHECK: cluster_account is validated by the address constraint and Arcium runtime.
    pub cluster_account: Box<Account<'info, Cluster>>,

    #[account(mut, address = ARCIUM_FEE_POOL_ACCOUNT_ADDRESS)]
    /// CHECK: fee pool account is validated by the address constraint and Arcium runtime.
    pub pool_account: Box<Account<'info, FeePool>>,

    #[account(mut, address = ARCIUM_CLOCK_ACCOUNT_ADDRESS)]
    /// CHECK: clock account is validated by the address constraint and Arcium runtime.
    pub clock_account: Box<Account<'info, ClockAccount>>,

    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,
}

#[callback_accounts("determine_winner_uniform")]
#[derive(Accounts)]
pub struct DetermineWinnerUniformCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_DETERMINE_WINNER_UNIFORM))]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Account<'info, MXEAccount>,
    /// CHECK: computation_account, checked by arcium program via constraints in the callback context.
    pub computation_account: UncheckedAccount<'info>,
    #[account(address = derive_cluster_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    pub cluster_account: Account<'info, Cluster>,
    #[account(address = ::anchor_lang::solana_program::sysvar::instructions::ID)]
    /// CHECK: instructions_sysvar, checked by the account constraint
    pub instructions_sysvar: AccountInfo<'info>,
    #[account(mut)]
    pub auction: Box<Account<'info, Auction>>,
}

#[queue_computation_accounts("determine_winner_pro_rata", settler)]
#[derive(Accounts)]
#[instruction(computation_offset: u64)]
pub struct DetermineWinnerProRata<'info> {
    #[account(mut)]
    pub settler: Signer<'info>,

    #[account(mut)]
    pub auction: Box<Account<'info, Auction>>,

    #[account(
        init_if_needed,
        space = 9,
        payer = settler,
        seeds = [&SIGN_PDA_SEED],
        bump,
        address = derive_sign_pda!(),
    )]
    pub sign_pda_account: Box<Account<'info, ArciumSignerAccount>>,

    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Box<Account<'info, MXEAccount>>,

    #[account(mut, address = derive_mempool_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    /// CHECK: mempool_account is validated by the address constraint and Arcium runtime.
    pub mempool_account: UncheckedAccount<'info>,

    #[account(mut, address = derive_execpool_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    /// CHECK: executing_pool is validated by the address constraint and Arcium runtime.
    pub executing_pool: UncheckedAccount<'info>,

    #[account(mut, address = derive_comp_pda!(computation_offset, mxe_account, ErrorCode::ClusterNotSet))]
    /// CHECK: computation_account is validated by the address constraint and Arcium runtime.
    pub computation_account: UncheckedAccount<'info>,

    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_DETERMINE_WINNER_PRO_RATA))]
    pub comp_def_account: Box<Account<'info, ComputationDefinitionAccount>>,

    #[account(mut, address = derive_cluster_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    /// CHECK: cluster_account is validated by the address constraint and Arcium runtime.
    pub cluster_account: Box<Account<'info, Cluster>>,

    #[account(mut, address = ARCIUM_FEE_POOL_ACCOUNT_ADDRESS)]
    /// CHECK: fee pool account is validated by the address constraint and Arcium runtime.
    pub pool_account: Box<Account<'info, FeePool>>,

    #[account(mut, address = ARCIUM_CLOCK_ACCOUNT_ADDRESS)]
    /// CHECK: clock account is validated by the address constraint and Arcium runtime.
    pub clock_account: Box<Account<'info, ClockAccount>>,

    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,
}

#[callback_accounts("determine_winner_pro_rata")]
#[derive(Accounts)]
pub struct DetermineWinnerProRataCallback<'info> {
    pub arcium_program: Program<'info, Arcium>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_DETERMINE_WINNER_PRO_RATA))]
    pub comp_def_account: Account<'info, ComputationDefinitionAccount>,
    #[account(address = derive_mxe_pda!())]
    pub mxe_account: Account<'info, MXEAccount>,
    /// CHECK: computation_account, checked by arcium program via constraints in the callback context.
    pub computation_account: UncheckedAccount<'info>,
    #[account(address = derive_cluster_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    pub cluster_account: Account<'info, Cluster>,
    #[account(address = ::anchor_lang::solana_program::sysvar::instructions::ID)]
    /// CHECK: instructions_sysvar, checked by the account constraint
    pub instructions_sysvar: AccountInfo<'info>,
    #[account(mut)]
    pub auction: Box<Account<'info, Auction>>,
}

#[arcium_callback(encrypted_ix = "determine_winner_uniform")]
pub fn determine_winner_uniform_callback(
    ctx: Context<DetermineWinnerUniformCallback>,
    output: SignedComputationOutputs<DetermineWinnerUniformOutput>,
) -> Result<()> {
    let o = match output.verify_output(
        &ctx.accounts.cluster_account,
        &ctx.accounts.computation_account,
    ) {
        Ok(DetermineWinnerUniformOutput { field_0 }) => field_0,
        Err(_) => return Err(ErrorCode::AbortedComputation.into()),
    };

    let DetermineWinnerUniformOutputStruct0 {
        field_0: winner1_bid,
        field_1: winner2_bid,
        field_2: winner3_bid,
        field_3: clearing_price,
        ..
    } = o;

    let mut winner1 = [0u8; 32];
    winner1[..16].copy_from_slice(&winner1_bid.field_0.field_0.to_le_bytes());
    winner1[16..].copy_from_slice(&winner1_bid.field_0.field_1.to_le_bytes());
    let winner1_pk = Pubkey::new_from_array(winner1);

    let mut winner2 = [0u8; 32];
    winner2[..16].copy_from_slice(&winner2_bid.field_0.field_0.to_le_bytes());
    winner2[16..].copy_from_slice(&winner2_bid.field_0.field_1.to_le_bytes());
    let winner2_pk = Pubkey::new_from_array(winner2);

    let mut winner3 = [0u8; 32];
    winner3[..16].copy_from_slice(&winner3_bid.field_0.field_0.to_le_bytes());
    winner3[16..].copy_from_slice(&winner3_bid.field_0.field_1.to_le_bytes());
    let winner3_pk = Pubkey::new_from_array(winner3);

    let auction_key = ctx.accounts.auction.key();
    let auction_type = ctx.accounts.auction.auction_type;
    let auction = &mut ctx.accounts.auction;

    require_not_resolved(auction)?;
    require!(auction.auction_type == AuctionType::Uniform, ErrorCode::WrongAuctionType);

    

    auction.status = AuctionStatus::Resolved;
    auction.winners = [winner1_pk, winner2_pk, winner3_pk];
auction.winner_bids = [
    winner1_bid.field_1, 
    winner2_bid.field_1,
    winner3_bid.field_1,
];
auction.winner_prices = [
    winner1_bid.field_2,
    winner2_bid.field_2,
    winner3_bid.field_2,
];
    auction.clearing_price = clearing_price;
    auction.total_bid = winner1_bid
        .field_1
        .checked_add(winner2_bid.field_1)
        .and_then(|v| v.checked_add(winner3_bid.field_1))
        .ok_or(ErrorCode::LamportOverflow)?;
    auction.winner_paid_multi = [false; 3];

    auction.winner = Pubkey::default();
    auction.payment_amount = 0;
    auction.winner_paid = false;

emit!(MultiWinnerAuctionResolvedEvent {
    auction: auction_key,
    auction_type,
    winners: [winner1, winner2, winner3],
    winner_bids: [
        winner1_bid.field_1,
        winner2_bid.field_1,
        winner3_bid.field_1
    ],
    winner_prices: [
        winner1_bid.field_2,
        winner2_bid.field_2,
        winner3_bid.field_2
    ],
    clearing_price,
    total_bid: auction.total_bid,
});

    Ok(())
}

#[arcium_callback(encrypted_ix = "determine_winner_pro_rata")]
pub fn determine_winner_pro_rata_callback(
    ctx: Context<DetermineWinnerProRataCallback>,
    output: SignedComputationOutputs<DetermineWinnerProRataOutput>,
) -> Result<()> {
    let o = match output.verify_output(
        &ctx.accounts.cluster_account,
        &ctx.accounts.computation_account,
    ) {
        Ok(DetermineWinnerProRataOutput { field_0 }) => field_0,
        Err(_) => return Err(ErrorCode::AbortedComputation.into()),
    };

    let DetermineWinnerProRataOutputStruct0 {
        field_0: winner1_bid,
        field_1: winner2_bid,
        field_2: winner3_bid,
        field_3: total_bid,
        ..
    } = o;

    let mut winner1 = [0u8; 32];
    winner1[..16].copy_from_slice(&winner1_bid.field_0.field_0.to_le_bytes());
    winner1[16..].copy_from_slice(&winner1_bid.field_0.field_1.to_le_bytes());
    let winner1_pk = Pubkey::new_from_array(winner1);

    let mut winner2 = [0u8; 32];
    winner2[..16].copy_from_slice(&winner2_bid.field_0.field_0.to_le_bytes());
    winner2[16..].copy_from_slice(&winner2_bid.field_0.field_1.to_le_bytes());
    let winner2_pk = Pubkey::new_from_array(winner2);

    let mut winner3 = [0u8; 32];
    winner3[..16].copy_from_slice(&winner3_bid.field_0.field_0.to_le_bytes());
    winner3[16..].copy_from_slice(&winner3_bid.field_0.field_1.to_le_bytes());
    let winner3_pk = Pubkey::new_from_array(winner3);

    let auction_key = ctx.accounts.auction.key();
    let auction_type = ctx.accounts.auction.auction_type;
    let auction = &mut ctx.accounts.auction;

    require_not_resolved(auction)?;
    require!(auction.auction_type == AuctionType::ProRata, ErrorCode::WrongAuctionType);

    auction.status = AuctionStatus::Resolved;
    auction.winners = [winner1_pk, winner2_pk, winner3_pk];
    auction.winner_bids = [
        winner1_bid.field_1,
        winner2_bid.field_1,
        winner3_bid.field_1,
    ];
    auction.total_bid = total_bid;
    auction.clearing_price = 0;
    auction.winner_paid_multi = [false; 3];

    auction.winner = Pubkey::default();
    auction.payment_amount = 0;
    auction.winner_paid = false;

emit!(MultiWinnerAuctionResolvedEvent {
    auction: auction_key,
    auction_type,
    winners: [winner1, winner2, winner3],
    winner_bids: [
        winner1_bid.field_1,
        winner2_bid.field_1,
        winner3_bid.field_1
    ],
    winner_prices: [
        winner1_bid.field_2,
        winner2_bid.field_2,
        winner3_bid.field_2
    ],
    clearing_price: 0,
    total_bid,
});

    Ok(())
}

/// Allows creator to reclaim unsold tokens if no bids were placed.
///
/// # Requirements
/// - Auction ended
/// - `bid_count == 0`
///
/// # Effects
/// - Transfers tokens back to creator
/// - Closes auction
pub fn reclaim_unsold_token_item(ctx: Context<ReclaimUnsoldTokenItem>) -> Result<()> {
    let auction = &mut ctx.accounts.auction;

    require!(
        matches!(auction.asset_kind, AssetKind::Fungible | AssetKind::Nft),
        ErrorCode::WrongAssetKind
    );

    require_keys_eq!(
        ctx.accounts.creator.key(),
        auction.authority,
        ErrorCode::Unauthorized
    );

    require!(
        Clock::get()?.unix_timestamp >= auction.end_time,
        ErrorCode::AuctionNotEnded
    );

    require!(
        auction.bid_count == 0,
        ErrorCode::CannotReclaimWithBids
    );

    require!(
        auction.status != AuctionStatus::Resolved,
        ErrorCode::AuctionAlreadyResolved
    );

    require_keys_eq!(
        ctx.accounts.prize_vault.mint,
        ctx.accounts.prize_mint.key(),
        ErrorCode::InvalidMint
    );

    require_keys_eq!(
        ctx.accounts.prize_vault.owner,
        ctx.accounts.vault_authority.key(),
        ErrorCode::Unauthorized
    );

    require_keys_eq!(
        auction.prize_vault,
        ctx.accounts.prize_vault.key(),
        ErrorCode::EscrowMismatch
    );

    require!(
        ctx.accounts.prize_vault.amount == auction.sale_amount,
        ErrorCode::AuctionAlreadySettled
    );

    let auction_key = auction.key();
    let signer_seeds: &[&[&[u8]]] = &[&[
        b"vault-authority",
        auction_key.as_ref(),
        &[auction.vault_authority_bump],
    ]];

    pay_winner(
        ctx.accounts.token_program.to_account_info(),
        ctx.accounts.prize_mint.to_account_info(),
        ctx.accounts.prize_vault.to_account_info(),
        ctx.accounts.vault_authority.to_account_info(),
        ctx.accounts.creator_ata.to_account_info(),
        auction.sale_amount,
        auction.prize_decimals,
        signer_seeds,
    )?;

    auction.status = AuctionStatus::Closed;

    Ok(())
}

#[derive(Accounts)]
pub struct ReclaimUnsoldTokenItem<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(mut)]
    pub auction: Box<Account<'info, Auction>>,

    pub prize_mint: InterfaceAccount<'info, Mint>,

    #[account(mut)]
    pub prize_vault: InterfaceAccount<'info, TokenAccount>,

    #[account(
        seeds = [b"vault-authority", auction.key().as_ref()],
        bump = auction.vault_authority_bump
    )]
    /// CHECK: PDA used only as signer for token transfers.
    pub vault_authority: UncheckedAccount<'info>,

    #[account(
        init_if_needed,
        payer = creator,
        associated_token::mint = prize_mint,
        associated_token::authority = creator,
        associated_token::token_program = token_program,
    )]
    pub creator_ata: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

pub fn reclaim_unsold_metadata_item(ctx: Context<ReclaimUnsoldMetadataItem>) -> Result<()> {
    let auction = &mut ctx.accounts.auction;

    require!(
        auction.asset_kind == AssetKind::MetadataOnly,
        ErrorCode::WrongAssetKind
    );

    require_keys_eq!(
        ctx.accounts.creator.key(),
        auction.authority,
        ErrorCode::Unauthorized
    );

    require!(
        Clock::get()?.unix_timestamp >= auction.end_time,
        ErrorCode::AuctionNotEnded
    );

    require!(
        auction.bid_count == 0,
        ErrorCode::CannotReclaimWithBids
    );

    require!(
        auction.status != AuctionStatus::Resolved,
        ErrorCode::AuctionAlreadyResolved
    );

    auction.status = AuctionStatus::Closed;

    Ok(())
}

#[derive(Accounts)]
pub struct ReclaimUnsoldMetadataItem<'info> {
    #[account(mut)]
    pub creator: Signer<'info>,

    #[account(mut)]
    pub auction: Box<Account<'info, Auction>>,
}

#[derive(Accounts)]
pub struct FinalizeMetadataWinnerPayout<'info> {
    #[account(mut)]
    pub auction: Box<Account<'info, Auction>>,

    #[account(mut, address = auction.authority)]
    pub creator: SystemAccount<'info>,

    #[account(mut)]
    pub winner_wallet: SystemAccount<'info>,
pub associated_token_program: Program<'info, AssociatedToken>,
    #[account(
        mut,
        seeds = [b"escrow", auction.key().as_ref(), winner_wallet.key().as_ref()],
        bump,
        close = winner_wallet,
    )]
    pub winner_escrow: Account<'info, EscrowAccount>,

    pub system_program: Program<'info, System>,
    #[account(
    mut,
    associated_token::mint = wsol_mint,
    associated_token::authority = winner_escrow,
)]
pub escrow_token_account: InterfaceAccount<'info, TokenAccount>,

#[account(
    mut,
    constraint = creator_wsol_ata.owner == creator.key(),
    constraint = creator_wsol_ata.mint == wsol_mint.key()
)]
pub creator_wsol_ata: InterfaceAccount<'info, TokenAccount>,

#[account(
    mut,
    constraint = winner_wsol_ata.owner == winner_wallet.key(),
    constraint = winner_wsol_ata.mint == wsol_mint.key()
)]
pub winner_wsol_ata: InterfaceAccount<'info, TokenAccount>,

pub wsol_mint: InterfaceAccount<'info, Mint>,
pub token_program: Interface<'info, TokenInterface>,
}

#[derive(Accounts)]
pub struct FinalizeTokenWinnerPayout<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(mut)]
    pub auction: Box<Account<'info, Auction>>,

    #[account(mut, address = auction.authority)]
    pub creator: SystemAccount<'info>,

    #[account(mut)]
    pub winner_wallet: SystemAccount<'info>,

    #[account(
        mut,
        seeds = [b"escrow", auction.key().as_ref(), winner_wallet.key().as_ref()],
        bump,
        close = winner_wallet,
    )]
    pub winner_escrow: Box<Account<'info, EscrowAccount>>,

    pub prize_mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(
        mut,
        associated_token::mint = wsol_mint,
        associated_token::authority = winner_escrow,
    )]
    pub escrow_token_account: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        mut,
        constraint = creator_wsol_ata.owner == creator.key(),
        constraint = creator_wsol_ata.mint == wsol_mint.key()
    )]
    pub creator_wsol_ata: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        mut,
        constraint = winner_wsol_ata.owner == winner_wallet.key(),
        constraint = winner_wsol_ata.mint == wsol_mint.key()
    )]
    pub winner_wsol_ata: Box<InterfaceAccount<'info, TokenAccount>>,

    pub wsol_mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(
        mut,
        seeds = [b"vault-authority", auction.key().as_ref()],
        bump = auction.vault_authority_bump
    )]
    /// CHECK: PDA used only as signer
    pub vault_authority: UncheckedAccount<'info>,

    #[account(
        init_if_needed,
        payer = payer,
        associated_token::mint = prize_mint,
        associated_token::authority = winner_wallet,
    )]
    pub winner_ata: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(mut)]
    pub prize_vault: Box<InterfaceAccount<'info, TokenAccount>>,

    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
    pub system_program: Program<'info, System>,
}

}
#[event]
pub struct AuctionCreatedEvent {
    pub auction: Pubkey,
    pub authority: Pubkey,
    pub auction_type: AuctionType,
    pub min_bid: u64,
    pub end_time: i64,
}

#[event]
pub struct BidPlacedEvent {
    pub auction: Pubkey,
    pub bid_count: u16,
}


#[event]
pub struct AuctionClosedEvent {
    pub auction: Pubkey,
    pub bid_count: u16,
}

#[event]
pub struct AuctionResolvedEvent {
    pub auction: Pubkey,
    pub winner: [u8; 32],
    pub payment_amount: u64,
    pub auction_type: AuctionType,
}

#[event]
pub struct EscrowCreatedEvent {
    pub auction: Pubkey,
    pub bidder: Pubkey,
    pub escrow_ata: Pubkey,
}

#[event]
pub struct EscrowWithdrawnEvent {
    pub auction: Pubkey,
    pub bidder: Pubkey,
    pub destination: Pubkey,
    pub amount: u64,
}

#[event]
pub struct EscrowClosedEvent {
    pub auction: Pubkey,
    pub bidder: Pubkey,
    pub escrow_ata: Pubkey,
}

#[event]
pub struct MultiWinnerAuctionResolvedEvent {
    pub auction: Pubkey,
    pub auction_type: AuctionType,
    pub winners: [[u8; 32]; 3],
    pub winner_bids: [u64; 3],   
    pub winner_prices: [u64; 3],  
    pub clearing_price: u64,
    pub total_bid: u64,
}


// =======================
// ERRORS
// =======================

#[error_code]
pub enum ErrorCode {
    #[msg("Pool already created")]
    PoolAlreadyCreated,
    #[msg("The computation was aborted")]
    AbortedComputation,
    #[msg("Cluster not set")]
    ClusterNotSet,
    #[msg("Auction is not open for bidding")]
    AuctionNotOpen,
    #[msg("Auction is not closed yet")]
    AuctionNotClosed,
    #[msg("Wrong auction type for this operation")]
    WrongAuctionType,
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Token mint does not match the auction's configured mint")]
    WrongMint,
    #[msg("Escrow token account owner mismatch")]
    EscrowOwnerMismatch,
    #[msg("Escrow account not empty")]
    EscrowNotEmpty,
    #[msg("No funds in escrow")]
    NoFundsInEscrow,
    #[msg("Auction has not ended yet")]
    AuctionNotEnded,
    #[msg("Bid count overflow")]
    BidCountOverflow,
    #[msg("No bids placed")]
    NoBids,
    #[msg("Auction has ended")]
    AuctionEnded,
    #[msg("Auction is already resolved")]
    AuctionAlreadyResolved,
    #[msg("Bid is below the auction minimum")]
    BidBelowMinimum,
    #[msg("New bid cannot be lower than the current escrowed amount")]
    BidMustNotDecrease,
    #[msg("Escrow does not match this auction")]
    EscrowMismatch,
    #[msg("Insufficient escrow for settlement")]
    EscrowInsufficient,
    #[msg("Auction is not resolved")]
    AuctionNotResolved,
    #[msg("Winner payout has already been completed")]
    AuctionAlreadySettled,
    #[msg("Winner cannot claim a refund")]
    WinnerCannotClaimRefund,
    #[msg("Lamport addition overflow")]
    LamportOverflow,
    #[msg("The provided winner is not one of the resolved winners")]
    InvalidSettlementWinner,
    #[msg("Invalid mint")]
    InvalidMint,
    #[msg("At least three bids are required for this auction type")]
    NotEnoughBidsForSettlement,
    #[msg("NFT auctions only support single-winner modes")]
    NftAuctionOnlySupportsSingleWinnerModes,
    #[msg("Multi-winner auctions require at least 3 units of supply")]
    InsufficientSupplyForMultiWinnerAuction,
    #[msg("Metadata-only auctions do not support multi-winner modes")]
    MetadataOnlyDoesNotSupportMultiWinnerModes,
    #[msg("Invalid metadata URI")]
    InvalidMetadataUri,
    #[msg("Wrong asset kind for this instruction")]
    WrongAssetKind,
    #[msg("This auction already has bids and cannot be reclaimed as unsold")]
    CannotReclaimWithBids,
    #[msg("Invalid shared vault")]
    InvalidSharedVault,
    #[msg("Pending encrypted bid already consumed")]
    TempBidAlreadyConsumed,
    #[msg("Escrow must be >= price")]
BidTooSmall,
}

fn require_not_resolved(auction: &Auction) -> Result<()> {
    require!(
        auction.status != AuctionStatus::Resolved,
        ErrorCode::AuctionAlreadyResolved
    );
    Ok(())
}

fn require_bid_allowed(auction: &Auction) -> Result<()> {
    require_not_resolved(auction)?;
    require!(auction.status == AuctionStatus::Open, ErrorCode::AuctionNotOpen);
    require!(Clock::get()?.unix_timestamp < auction.end_time, ErrorCode::AuctionEnded);
    Ok(())
}

fn require_settlement_allowed(auction: &Auction) -> Result<()> {
    require_not_resolved(auction)?;
    require!(Clock::get()?.unix_timestamp >= auction.end_time, ErrorCode::AuctionNotEnded);
    Ok(())
}

/// Transfers funds from escrow:
/// - Pays creator
/// - Refunds winner remainder
///
/// Used during settlement.
fn settle_token_escrow<'info>(
    escrow_token: &AccountInfo<'info>,
    creator_token: &AccountInfo<'info>,
    winner_token: &AccountInfo<'info>,
    escrow_authority: &AccountInfo<'info>,
    token_program: &AccountInfo<'info>,
    signer_seeds: &[&[&[u8]]],
    deposited_amount: u64,
    payment_amount: u64,
    mint: &AccountInfo<'info>,
    decimals: u8,
) -> Result<()> {
    require!(deposited_amount >= payment_amount, ErrorCode::EscrowInsufficient);

    // pay creator
    let pay_ctx = CpiContext::new_with_signer(
        token_program.clone(),
        TransferChecked {
            from: escrow_token.clone(),
            mint: mint.clone(),
            to: creator_token.clone(),
            authority: escrow_authority.clone(),
        },
        signer_seeds,
    );

    token_interface::transfer_checked(pay_ctx, payment_amount, decimals)?;

    // refund winner
    let refund = deposited_amount - payment_amount;

    if refund > 0 {
        let refund_ctx = CpiContext::new_with_signer(
            token_program.clone(),
            TransferChecked {
                from: escrow_token.clone(),
                mint: mint.clone(),
                to: winner_token.clone(),
                authority: escrow_authority.clone(),
            },
            signer_seeds,
        );

        token_interface::transfer_checked(refund_ctx, refund, decimals)?;
    }

    Ok(())
}

/// Transfers prize tokens from vault to winner.
///
/// Uses PDA signer (`vault_authority`).
pub fn pay_winner<'info>(
    token_program: AccountInfo<'info>,
    mint: AccountInfo<'info>,
    vault: AccountInfo<'info>,
    vault_authority: AccountInfo<'info>,
    winner_ata: AccountInfo<'info>,
    amount: u64,
    decimals: u8,
    signer_seeds: &[&[&[u8]]],
) -> Result<()> {
    let cpi_accounts = TransferChecked {
        from: vault,
        mint,
        to: winner_ata,
        authority: vault_authority,
    };

    let cpi_ctx = CpiContext::new_with_signer(
        token_program,
        cpi_accounts,
        signer_seeds,
    );

    token_interface::transfer_checked(cpi_ctx, amount, decimals)?;
    Ok(())
}

fn init_auction_common(
    auction: &mut Auction,
    authority: Pubkey,
    bump: u8,
    auction_type: AuctionType,
    asset_kind: AssetKind,
    min_bid: u64,
    end_time: i64,
    sale_amount: u64,
    auction_metadata_uri: String,
    token_mint: Pubkey,
    prize_vault: Pubkey,
    vault_authority_bump: u8,
    prize_decimals: u8,
) -> Result<()> {
    require!(!auction_metadata_uri.is_empty(), ErrorCode::InvalidMetadataUri);

    auction.bump = bump;
    auction.authority = authority;
    auction.auction_type = auction_type;
    auction.asset_kind = asset_kind;
    auction.status = AuctionStatus::Open;
    auction.min_bid = min_bid;
    auction.end_time = end_time;
    auction.bid_count = 0;
    auction.state_nonce = 0;
    auction.encrypted_state = [[0u8; 32]; 13];

    auction.raydium_pool_created = false;

    auction.token_mint = token_mint;
    auction.sale_amount = sale_amount;
    auction.prize_vault = prize_vault;
    auction.shared_vault = Pubkey::default();
    auction.vault_authority_bump = vault_authority_bump;
    auction.prize_decimals = prize_decimals;

    auction.winner = Pubkey::default();
    auction.payment_amount = 0;
    auction.winner_paid = false;
    auction.auction_metadata_uri = auction_metadata_uri;
    auction.winners = [Pubkey::default(); 3];
    auction.winner_bids = [0; 3];
    auction.clearing_price = 0;
    auction.total_bid = 0;
    auction.winner_paid_multi = [false; 3];

    Ok(())
}

#[account]
#[derive(InitSpace)]
pub struct SharedVault {
    pub bump: u8,
    pub auction: Pubkey,
    pub total_deposited: u64,
}

#[account]
#[derive(InitSpace)]
pub struct PendingEncryptedBid {
    pub bump: u8,
    pub auction: Pubkey,
    pub shared_vault: Pubkey,
    pub bidder: Pubkey,
    pub nonce: u128,
    pub encrypted_amount: [u8; 32],
    pub consumed: bool,
    pub encrypted_price: [u8; 32], 
}