//! # Arcrypt
//!
//! Arcrypt is a privacy-preserving sealed-bid auction program built on Solana.
//!
//! It enables auctions where all bids, including the escrowed balances remain encrypted throughout the bidding
//! phase and are only revealed at settlement. This prevents front-running, bid shading, and information leakage during the auction lifecycle.
//! We are possibly the first adopter of the UMBRA CPI client which enables confidential program balances for the first time. 
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
//!    The client encrypts their bid amount against Umbra's MXE using usdc
//!    and invokes Arcrypt via deposit_encrypted_bid. Here write price to a temp account
//!    PendingEncryptedBid
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
//! - Auction operates on encrypted state
//! - Only final results are revealed after computation
//! - Escrowed balances remain confidential throughout
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
//! - Due to the early access use of UMBRA CPI we can only support one bid per auction per user
//!   In principle this isnt an issue because it is in the nature of sealed bids that there is no reason / 
//!   information that could develop that would cause you to change your bid. But support is planned anyway. 
//! - Multi-winner auctions limited to n=3 for demo purposes. Change MAX_BIDs to increase. 
//!
//! ---
//!
//! Arcrypt combines on-chain guarantees with off-chain secure computation
//! to enable fully private, trust-minimised auction mechanisms on Solana. This makes Arcrypt the ultimate
//! auction platform on any blockchain, and the first *truly* sealed one. 

// anchor imports
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

// umbra imports
use umbra_codama::instructions::{
    TransferFromSharedBalanceToNewNetworkBalanceV13CpiBuilder,
    TransferFromSharedBalanceToNewNetworkBalanceV13InstructionArgs,
};
use umbra_codama::types::{ AccountOffset, Amount, ArciumX25519Nonce, ArciumX25519PublicKey, BasisPoints, ComputationOffset, InstructionDiscriminator, PoseidonHash, RescueCiphertext, SmallMerkleTreeIndex };

// ARCRYPT ID
declare_id!("BPKLg61gd4FChxuFkn2VEEbT9cMED5nsSYRi84j5FRaK");

const COMP_DEF_OFFSET_INIT_AUCTION_STATE: u32 = comp_def_offset("init_auction_state");
const COMP_DEF_OFFSET_PLACE_BID: u32 = comp_def_offset("place_bid");
const COMP_DEF_OFFSET_DETERMINE_WINNER_FIRST_PRICE: u32 =
    comp_def_offset("determine_winner_first_price");
const COMP_DEF_OFFSET_DETERMINE_WINNER_VICKREY: u32 = comp_def_offset("determine_winner_vickrey");
const COMP_DEF_OFFSET_DETERMINE_WINNER_UNIFORM: u32 =
    comp_def_offset("determine_winner_uniform");
const COMP_DEF_OFFSET_PLACE_ENCRYPTED_BID: u32 =
    comp_def_offset("place_encrypted_bid");

// Auction account byte offset: 8 (discriminator) + 1 + 32 + 1 + 1 + 8 + 8 + 2 + 16 = 77
const AUCTION_HEADER_SIZE: u32 = 8 + 1 + 32 + 1 + 1 + 8 + 8 + 2 + 16;
const ENCRYPTED_STATE_OFFSET: u32 = AUCTION_HEADER_SIZE;
const ENCRYPTED_STATE_SIZE: u32 = 32 * 9;
const ENCRYPTED_BID_BOOK_SIZE: u32 = 32 * 3;

pub const UMBRA_PROGRAM_ID: Pubkey = pubkey!("DSuKkyqGVGgo4QtPABfxKJKygUDACbUhirnuv63mEpAJ"); // umbra privacy devnet deployed address
pub const PAYMENT_MINT: Pubkey = pubkey!("4oG4sjmopf5MzvTHLE8rpVJ2uyczxfsw2K84SUTpNDx7"); // umbra d-usdc

const WINNER_SHARE_BPS: u64 = 8_000;    // 80%
const BPS_DENOM: u64 = 10_000;

// MATH HELPERS

pub fn u64_to_pubkey(id: u64) -> Pubkey {
    let mut bytes = [0u8; 32];
    bytes[..8].copy_from_slice(&id.to_le_bytes());
    Pubkey::new_from_array(bytes)
}

fn mul_bps(amount: u64, bps: u64) -> Result<u64> {
    let v = (amount as u128)
        .checked_mul(bps as u128)
        .ok_or(ErrorCode::LamportOverflow)?
        .checked_div(BPS_DENOM as u128)
        .ok_or(ErrorCode::LamportOverflow)?;

    Ok(v as u64)
}

fn token_winner_share(amount: u64) -> Result<u64> {
    mul_bps(amount, WINNER_SHARE_BPS)
}

fn token_creator_share(amount: u64) -> Result<u64> {
    amount
        .checked_sub(token_winner_share(amount)?)
        .ok_or(ErrorCode::LamportOverflow.into())
}

fn uniform_gross_payout_amount(auction: &Auction, winner_index: usize) -> Result<u64> {
    let amounts = auction.winner_bids;
    let prices = auction.winner_prices;
    let clearing_price = auction.clearing_price;

    let user_amount = amounts[winner_index];
    let user_price = prices[winner_index];

    require!(user_amount >= user_price, ErrorCode::BidTooSmall);

    let user_quantity = (user_amount as u128)
        .checked_div(user_price as u128)
        .ok_or(ErrorCode::LamportOverflow)?;

    let payment_amount = user_quantity
        .checked_mul(clearing_price as u128)
        .ok_or(ErrorCode::LamportOverflow)? as u64;

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

    let user_value = user_quantity
        .checked_mul(clearing_price as u128)
        .ok_or(ErrorCode::LamportOverflow)?;

    let payout_amount = ((auction.sale_amount as u128)
        .checked_mul(user_value)
        .ok_or(ErrorCode::LamportOverflow)?)
        .checked_div(total_value)
        .ok_or(ErrorCode::LamportOverflow)? as u64;

    Ok(payment_amount.max(payout_amount))
}

fn uniform_creator_reserve_amount(auction: &Auction) -> Result<u64> {
    let mut total_winner_share: u128 = 0;

    for i in 0..3 {
        let gross = uniform_gross_payout_amount(auction, i)?;
        let winner_share = token_winner_share(gross)? as u128;
        total_winner_share = total_winner_share
            .checked_add(winner_share)
            .ok_or(ErrorCode::LamportOverflow)?;
    }

    let creator_share = (auction.sale_amount as u128)
        .checked_sub(total_winner_share)
        .ok_or(ErrorCode::LamportOverflow)?;

    Ok(creator_share as u64)
}

// ENUMS

#[derive(AnchorSerialize, AnchorDeserialize, Clone, Copy, PartialEq, Eq, InitSpace)]
pub enum AuctionType {
    FirstPrice,
    Vickrey,
    Uniform,
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

    // compdefs called once globally for entire program
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

// INSTRUCTIONS

/// Deposits a confidential bid via Umbra and prepares it for later Arcium processing.
/// Entrypoint of the encrypted_bid mechanism using UMBRA
///
/// # Arguments
/// - `ctx`: Account context for the auction, bidder, Umbra CPI, and temporary bid PDA.
/// - `computation_offset`: Arcium computation offset used to derive the queued computation account.
/// - `encrypted_amount`: Encrypted bid amount / escrow amount.
/// - `encrypted_price`: Encrypted price value used for bid modes that need it.
pub fn deposit_encrypted_bid(
    ctx: Context<DepositEncryptedBid>,
    computation_offset: u64,
    encrypted_amount: [u8; 32],
    encrypted_price: [u8; 32],
) -> Result<()> {
    let auction = &ctx.accounts.auction;

    require_bid_allowed(auction)?;
    require_keys_eq!(
        ctx.accounts.shared_vault.auction,
        auction.key(),
        ErrorCode::InvalidSharedVault
    );

    ctx.accounts.sign_pda_account.bump = ctx.bumps.sign_pda_account;

    {
        let temp = &mut ctx.accounts.temp_bid;
        temp.bump = ctx.bumps.temp_bid;
        temp.auction = auction.key();
        temp.shared_vault = ctx.accounts.shared_vault.key();
        temp.bidder = ctx.accounts.bidder.key();
        temp.encrypted_amount = [0u8; 32];
        temp.encrypted_price = encrypted_price;
        temp.consumed = false;
        temp.umbra_context_account = ctx.accounts.umbra_context_account.key();
        temp.umbra_persistence_account = ctx.accounts.umbra_persistence_account.key();
    }

    let args = TransferFromSharedBalanceToNewNetworkBalanceV13InstructionArgs {
        computation_offset: ComputationOffset {
            first: computation_offset,
        },
        fee_vault_offset: AccountOffset { first: 0 },
        mpc_callback_data_offset: AccountOffset { first: 0 },
        fees_amount_lower_bound: Amount { first: 0 },
        fees_amount_upper_bound: Amount { first: 0 },
        fees_base_fees_in_spl: Amount { first: 0 },
        fees_commission_fee_in_spl: BasisPoints { first: 0 },
        fees_merkle_path: core::array::from_fn(|_| PoseidonHash { first: [0u8; 32] }),
        fees_leaf_index: SmallMerkleTreeIndex { first: 0 },
        rescue_encryption_nonce: ArciumX25519Nonce { first: 0u128 },
        rescue_encrypted_transfer_amount: RescueCiphertext { first: encrypted_amount },
        rescue_encryption_public_key: ArciumX25519PublicKey { first: [0u8; 32] },
        dispatch_observer_cpi: unsafe { core::mem::zeroed() },
        observer_output_x25519_public_key: ArciumX25519PublicKey { first: [0u8; 32] },
        destination_discriminator: InstructionDiscriminator {
            first: [79, 24, 114, 130, 197, 38, 79, 99],
        },
        priority_fees: unsafe { core::mem::zeroed() },
        optional_data: unsafe { core::mem::zeroed() },
        random_generation_seed: unsafe { core::mem::zeroed() },
    };

    let bidder_ai = ctx.accounts.bidder.to_account_info();
    let umbra_program_ai = ctx.accounts.umbra_program.to_account_info();
    let destination_program_ai = ctx.accounts.destination_program.to_account_info();

    let sign_pda_ai = ctx.accounts.sign_pda_account.to_account_info();
    let mxe_ai = ctx.accounts.mxe_account.to_account_info();
    let mempool_ai = ctx.accounts.mempool_account.to_account_info();
    let executing_pool_ai = ctx.accounts.executing_pool.to_account_info();
    let computation_ai = ctx.accounts.computation_account.to_account_info();
    let comp_def_ai = ctx.accounts.comp_def_account.to_account_info();
    let cluster_ai = ctx.accounts.cluster_account.to_account_info();
    let pool_ai = ctx.accounts.pool_account.to_account_info();
    let clock_ai = ctx.accounts.clock_account.to_account_info();
    let system_ai = ctx.accounts.system_program.to_account_info();
    let arcium_ai = ctx.accounts.arcium_program.to_account_info();
    let sender_token_ai = ctx.accounts.sender_token_account.to_account_info();
    let receiver_address_ai = ctx.accounts.receiver_address.to_account_info();
    let receiver_token_ai = ctx.accounts.receiver_token_account.to_account_info();
    let receiver_user_ai = ctx.accounts.receiver_user_account.to_account_info();
    let fee_schedule_ai = ctx.accounts.fee_schedule.to_account_info();
    let fee_vault_ai = ctx.accounts.fee_vault.to_account_info();
    let token_pool_ai = ctx.accounts.token_pool.to_account_info();
    let mint_ai = ctx.accounts.mint.to_account_info();
    let protocol_config_ai = ctx.accounts.protocol_config.to_account_info();
    let computation_data_ai = ctx.accounts.computation_data.to_account_info();
    let umbra_callback_signer_ai = ctx.accounts.umbra_callback_signer.to_account_info();
    let umbra_context_ai = ctx.accounts.umbra_context_account.to_account_info();
    let umbra_persistence_ai = ctx.accounts.umbra_persistence_account.to_account_info();

    TransferFromSharedBalanceToNewNetworkBalanceV13CpiBuilder::new(&umbra_program_ai)
        .sender(&bidder_ai)
        .fee_payer(&bidder_ai)
        .sign_pda_account(&sign_pda_ai)
        .mxe_account(&mxe_ai)
        .mempool_account(&mempool_ai)
        .executing_pool(&executing_pool_ai)
        .computation_account(&computation_ai)
        .comp_def_account(&comp_def_ai)
        .cluster_account(&cluster_ai)
        .pool_account(&pool_ai)
        .clock_account(&clock_ai)
        .system_program(&system_ai)
        .arcium_program(&arcium_ai)
        .sender_token_account(&sender_token_ai)
        .receiver_address(&receiver_address_ai)
        .receiver_token_account(&receiver_token_ai)
        .receiver_user_account(&receiver_user_ai)
        .fee_schedule(&fee_schedule_ai)
        .fee_vault(&fee_vault_ai)
        .token_pool(&token_pool_ai)
        .mint(&mint_ai)
        .protocol_config(&protocol_config_ai)
        .computation_data(&computation_data_ai)
        .initiator(&bidder_ai)
        .destination_program(&destination_program_ai)
        .umbra_callback_signer(&umbra_callback_signer_ai)
        .cpi_account1(&umbra_context_ai)
        .cpi_account2(&umbra_persistence_ai)
        .computation_offset(args.computation_offset)
        .fee_vault_offset(args.fee_vault_offset)
        .mpc_callback_data_offset(args.mpc_callback_data_offset)
        .fees_amount_lower_bound(args.fees_amount_lower_bound)
        .fees_amount_upper_bound(args.fees_amount_upper_bound)
        .fees_base_fees_in_spl(args.fees_base_fees_in_spl)
        .fees_commission_fee_in_spl(args.fees_commission_fee_in_spl)
        .fees_merkle_path(args.fees_merkle_path)
        .fees_leaf_index(args.fees_leaf_index)
        .rescue_encryption_nonce(args.rescue_encryption_nonce)
        .rescue_encrypted_transfer_amount(args.rescue_encrypted_transfer_amount)
        .rescue_encryption_public_key(args.rescue_encryption_public_key)
        .dispatch_observer_cpi(args.dispatch_observer_cpi)
        .observer_output_x25519_public_key(args.observer_output_x25519_public_key)
        .destination_discriminator(args.destination_discriminator)
        .priority_fees(args.priority_fees)
        .optional_data(args.optional_data)
        .random_generation_seed(args.random_generation_seed)
        .invoke_signed(&[])?;

    Ok(())
}


/// Executes a previously submitted encrypted bid.
/// Perfomed via client crank
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
        .encrypted_u64(temp.encrypted_amount)
        .encrypted_u64(encrypted_price_final)
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
/// Transfers usdc into the bidder's escrow PDA and submits encrypted bid data
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
/// - Transfers usdc into escrow ATA
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
    require_keys_eq!(
        ctx.accounts.payment_mint.key(),
        PAYMENT_MINT,
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
            from: ctx.accounts.bidder_payment_ata.to_account_info(),
            mint: ctx.accounts.payment_mint.to_account_info(),
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
            ctx.accounts.payment_mint.decimals,
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



/// Creates a token-backed auction (SPL or NFT).
///
/// Transfers the prize tokens from the creator into a vault owned by the program,
/// initializes the `Auction` account, and queues the encrypted state initialization
/// via Arcium.
///
/// # Arguments
/// - `auction_type`: Pricing mechanism (FirstPrice, Vickrey, Uniform)
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

    if matches!(auction_type, AuctionType::Uniform) {
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
/// - This instruction is called by UMBRA on the deposit callback. It contained the re-encrypted
/// "encrypted_amount" which is encrypted against our MXE, used for our own mirror of each bid. This cannot be
/// spoofed since it was generated directly by UMBRA when it moved the tokens. 
pub fn submit_encrypted_bid(
    ctx: Context<SubmitEncryptedBid>,
    bidder: Pubkey,
    encrypted_amount: [u8; 32],
) -> Result<()> {
    let auction = &ctx.accounts.auction;

    require_bid_allowed(auction)?;
    require_keys_eq!(
        ctx.accounts.shared_vault.auction,
        auction.key(),
        ErrorCode::InvalidSharedVault
    );
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
    require_keys_eq!(
        ctx.accounts.temp_bid.bidder,
        bidder,
        ErrorCode::EscrowOwnerMismatch
    );

    let temp = &mut ctx.accounts.temp_bid;
    temp.encrypted_amount = encrypted_amount;

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
///
/// # Effects
/// - Moves usdc from escrow
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

    require_keys_eq!(
        ctx.accounts.payment_mint.key(),
        PAYMENT_MINT,
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

    let is_fungible = matches!(auction.asset_kind, AssetKind::Fungible);
    let auction_key = auction.key();

    match auction.auction_type {
        AuctionType::FirstPrice => {
            require_keys_eq!(
                winner_wallet_key,
                auction.winner,
                ErrorCode::InvalidSettlementWinner
            );
            require!(!auction.winner_paid, ErrorCode::AuctionAlreadySettled);

            let seeds = &[
                b"escrow",
                auction_key.as_ref(),
                winner_wallet_key.as_ref(),
                &[escrow.bump],
            ];
            let signer_seeds: &[&[&[u8]]] = &[seeds];

            let payment_amount = auction.payment_amount;
            let sale_amount = auction.sale_amount;

            settle_token_escrow(
                &ctx.accounts.escrow_token_account.to_account_info(),
                &ctx.accounts.creator_payment_ata.to_account_info(),
                &ctx.accounts.winner_payment_ata.to_account_info(),
                &ctx.accounts.winner_escrow.to_account_info(),
                &ctx.accounts.token_program.to_account_info(),
                signer_seeds,
                escrow.deposited_amount,
                payment_amount,
                &ctx.accounts.payment_mint.to_account_info(),
                ctx.accounts.payment_mint.decimals,
            )?;

            let signer_seeds: &[&[&[u8]]] = &[&[
                b"vault-authority",
                auction_key.as_ref(),
                &[auction.vault_authority_bump],
            ]];

            let winner_tokens = if is_fungible {
                token_winner_share(sale_amount)?
            } else {
                sale_amount
            };

            pay_winner(
                ctx.accounts.token_program.to_account_info(),
                ctx.accounts.prize_mint.to_account_info(),
                ctx.accounts.prize_vault.to_account_info(),
                ctx.accounts.vault_authority.to_account_info(),
                ctx.accounts.winner_ata.to_account_info(),
                winner_tokens,
                auction.prize_decimals,
                signer_seeds,
            )?;

            if is_fungible {
                let creator_tokens = token_creator_share(sale_amount)?;
                pay_winner(
                    ctx.accounts.token_program.to_account_info(),
                    ctx.accounts.prize_mint.to_account_info(),
                    ctx.accounts.prize_vault.to_account_info(),
                    ctx.accounts.vault_authority.to_account_info(),
                    ctx.accounts.creator_ata.to_account_info(),
                    creator_tokens,
                    auction.prize_decimals,
                    signer_seeds,
                )?;
                auction.creator_reserve_paid = true;
            }

            auction.winner_paid = true;
        }

        AuctionType::Vickrey => {
            require_keys_eq!(
                winner_wallet_key,
                auction.winner,
                ErrorCode::InvalidSettlementWinner
            );
            require!(!auction.winner_paid, ErrorCode::AuctionAlreadySettled);

            let seeds = &[
                b"escrow",
                auction_key.as_ref(),
                winner_wallet_key.as_ref(),
                &[escrow.bump],
            ];
            let signer_seeds: &[&[&[u8]]] = &[seeds];

            let payment_amount = auction.payment_amount;
            let sale_amount = auction.sale_amount;

            settle_token_escrow(
                &ctx.accounts.escrow_token_account.to_account_info(),
                &ctx.accounts.creator_payment_ata.to_account_info(),
                &ctx.accounts.winner_payment_ata.to_account_info(),
                &ctx.accounts.winner_escrow.to_account_info(),
                &ctx.accounts.token_program.to_account_info(),
                signer_seeds,
                escrow.deposited_amount,
                payment_amount,
                &ctx.accounts.payment_mint.to_account_info(),
                ctx.accounts.payment_mint.decimals,
            )?;

            let signer_seeds: &[&[&[u8]]] = &[&[
                b"vault-authority",
                auction_key.as_ref(),
                &[auction.vault_authority_bump],
            ]];

            let winner_tokens = if is_fungible {
                token_winner_share(sale_amount)?
            } else {
                sale_amount
            };

            pay_winner(
                ctx.accounts.token_program.to_account_info(),
                ctx.accounts.prize_mint.to_account_info(),
                ctx.accounts.prize_vault.to_account_info(),
                ctx.accounts.vault_authority.to_account_info(),
                ctx.accounts.winner_ata.to_account_info(),
                winner_tokens,
                auction.prize_decimals,
                signer_seeds,
            )?;

            if is_fungible {
                let creator_tokens = token_creator_share(sale_amount)?;
                pay_winner(
                    ctx.accounts.token_program.to_account_info(),
                    ctx.accounts.prize_mint.to_account_info(),
                    ctx.accounts.prize_vault.to_account_info(),
                    ctx.accounts.vault_authority.to_account_info(),
                    ctx.accounts.creator_ata.to_account_info(),
                    creator_tokens,
                    auction.prize_decimals,
                    signer_seeds,
                )?;
                auction.creator_reserve_paid = true;
            }

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

            let seeds = &[
                b"escrow",
                auction_key.as_ref(),
                winner_wallet_key.as_ref(),
                &[escrow.bump],
            ];
            let signer_seeds: &[&[&[u8]]] = &[seeds];

            let clearing_price = auction.clearing_price;
            let amounts = auction.winner_bids;
            let prices = auction.winner_prices;

            let user_amount = amounts[winner_index];
            let user_price = prices[winner_index];

            require!(user_amount >= user_price, ErrorCode::BidTooSmall);

            let user_quantity = (user_amount as u128)
                .checked_div(user_price as u128)
                .ok_or(ErrorCode::LamportOverflow)?;

            let payment_amount = user_quantity
                .checked_mul(clearing_price as u128)
                .ok_or(ErrorCode::LamportOverflow)? as u64;

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

            let user_value = user_quantity
                .checked_mul(clearing_price as u128)
                .ok_or(ErrorCode::LamportOverflow)?;

            let gross_payout = ((auction.sale_amount as u128)
                .checked_mul(user_value)
                .ok_or(ErrorCode::LamportOverflow)?)
                .checked_div(total_value)
                .ok_or(ErrorCode::LamportOverflow)? as u64;

            settle_token_escrow(
                &ctx.accounts.escrow_token_account.to_account_info(),
                &ctx.accounts.creator_payment_ata.to_account_info(),
                &ctx.accounts.winner_payment_ata.to_account_info(),
                &ctx.accounts.winner_escrow.to_account_info(),
                &ctx.accounts.token_program.to_account_info(),
                signer_seeds,
                escrow.deposited_amount,
                payment_amount,
                &ctx.accounts.payment_mint.to_account_info(),
                ctx.accounts.payment_mint.decimals,
            )?;

            let winner_tokens = if is_fungible {
                token_winner_share(gross_payout)?
            } else {
                gross_payout
            };

            let vault_signer_seeds: &[&[&[u8]]] = &[&[
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
                winner_tokens,
                auction.prize_decimals,
                vault_signer_seeds,
            )?;

            auction.winner_paid_multi[winner_index] = true;

            if is_fungible
                && auction.winner_paid_multi.iter().all(|p| *p)
                && !auction.creator_reserve_paid
            {
                let creator_tokens = uniform_creator_reserve_amount(auction)?;
                pay_winner(
                    ctx.accounts.token_program.to_account_info(),
                    ctx.accounts.prize_mint.to_account_info(),
                    ctx.accounts.prize_vault.to_account_info(),
                    ctx.accounts.vault_authority.to_account_info(),
                    ctx.accounts.creator_ata.to_account_info(),
                    creator_tokens,
                    auction.prize_decimals,
                    vault_signer_seeds,
                )?;
                auction.creator_reserve_paid = true;
            }
        }
    }

    Ok(())
}



/// Finalizes payout for metadata-only auctions.
///
/// Only transfers usdc (no token payout).
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

    require_keys_eq!(
        ctx.accounts.payment_mint.key(),
        PAYMENT_MINT,
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
                &ctx.accounts.creator_payment_ata.to_account_info(),
                &ctx.accounts.winner_payment_ata.to_account_info(),
                &ctx.accounts.winner_escrow.to_account_info(),
                &ctx.accounts.token_program.to_account_info(),
                signer_seeds,
                escrow.deposited_amount,
                payment_amount,
                &ctx.accounts.payment_mint.to_account_info(),
                ctx.accounts.payment_mint.decimals,
            )?;

            auction.winner_paid = true;
        }
        _ => return err!(ErrorCode::WrongAuctionType),
    }
    Ok(())
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


/// Allows losing bidders to reclaim escrowed funds.
///
/// # Requirements
/// - Auction must be ended
/// - Caller must NOT be a winner
///
/// # Effects
/// - Transfers usdc back to bidder
/// - Closes escrow account
pub fn claim_refund(ctx: Context<ClaimRefund>) -> Result<()> {
    let auction = &ctx.accounts.auction;

    require!(auction.status != AuctionStatus::Open, ErrorCode::AuctionNotClosed);
    require!(Clock::get()?.unix_timestamp >= auction.end_time, ErrorCode::AuctionNotEnded);
    require_keys_eq!(
        ctx.accounts.payment_mint.key(),
        PAYMENT_MINT,
        ErrorCode::WrongMint
    );

    let bidder_key = ctx.accounts.bidder.key();

    match auction.auction_type {
        AuctionType::FirstPrice | AuctionType::Vickrey => {
            require_keys_neq!(bidder_key, auction.winner, ErrorCode::WinnerCannotClaimRefund);
        }
        AuctionType::Uniform => {
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
            mint: ctx.accounts.payment_mint.to_account_info(),
            to: ctx.accounts.bidder_payment_ata.to_account_info(),
            authority: ctx.accounts.escrow_account.to_account_info(),
        },
        signer_seeds,
    );

    token_interface::transfer_checked(
        cpi_ctx,
        amount,
        ctx.accounts.payment_mint.decimals,
    )?;
    Ok(())
}

// CALLBACKS

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

    auction.encrypted_state = o.field_0.ciphertexts;
    auction.state_nonce = o.field_0.nonce;
    auction.encrypted_bid_book = o.field_1.ciphertexts;
    auction.encrypted_bid_book_nonce = o.field_1.nonce;

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

    auction.encrypted_state = o.field_0.ciphertexts;
    auction.state_nonce = o.field_0.nonce;
    auction.encrypted_bid_book = o.field_1.ciphertexts;
    auction.encrypted_bid_book_nonce = o.field_1.nonce;

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

    let auction = &mut ctx.accounts.auction;
    auction.encrypted_state = o.field_0.ciphertexts;
    auction.state_nonce = o.field_0.nonce;
    auction.encrypted_bid_book = o.field_1.ciphertexts;
    auction.encrypted_bid_book_nonce = o.field_1.nonce;

    emit!(AuctionCreatedEvent {
        auction: auction.key(),
        authority: auction.authority,
        auction_type: auction.auction_type,
        min_bid: auction.min_bid,
        end_time: auction.end_time,
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

    let clearing_price = o.field_0;
    let fills = o.field_1;
    let amounts = o.field_2;
    let ids = o.field_3;

    let auction_key = ctx.accounts.auction.key();
    let auction_type = ctx.accounts.auction.auction_type;
    let auction = &mut ctx.accounts.auction;

    require_not_resolved(auction)?;
    require!(auction.auction_type == AuctionType::Uniform, ErrorCode::WrongAuctionType);

    auction.status = AuctionStatus::Resolved;
    auction.winners = [
        u64_to_pubkey(ids[0]),
        u64_to_pubkey(ids[1]),
        u64_to_pubkey(ids[2]),
    ];
    auction.winner_bids = amounts;
    auction.winner_prices = [clearing_price; 3];
    auction.clearing_price = clearing_price;
    auction.total_bid = fills
        .iter()
        .copied()
        .try_fold(0u64, |acc, v| acc.checked_add(v))
        .ok_or(ErrorCode::LamportOverflow)?;
    auction.winner_paid_multi = [false; 3];

    auction.winner = Pubkey::default();
    auction.payment_amount = 0;
    auction.winner_paid = false;

    emit!(MultiWinnerAuctionResolvedEvent {
        auction: auction_key,
        auction_type,
        winners: [
            ids[0].to_le_bytes().repeat(4).try_into().unwrap(),
            ids[1].to_le_bytes().repeat(4).try_into().unwrap(),
            ids[2].to_le_bytes().repeat(4).try_into().unwrap(),
        ],
        winner_bids: amounts,
        winner_prices: [clearing_price; 3],
        clearing_price,
        total_bid: auction.total_bid,
    });

    Ok(())
}

// =======================
// ACCOUNTS
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
    // pub encrypted_state: [[u8; 32]; 13],
    
    pub encrypted_state: [[u8; 32]; 9],
    pub encrypted_bid_book_nonce: u128,
    pub encrypted_bid_book: [[u8; 32]; 3],

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

    pub creator_reserve_paid: bool,
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
pub struct EscrowAccount {
    pub bump: u8,
    pub auction: Pubkey,
    pub bidder: Pubkey,
    pub deposited_amount: u64,
}

#[account]
#[derive(InitSpace)]
pub struct PendingEncryptedBid {
    pub bump: u8,
    pub auction: Pubkey,
    pub shared_vault: Pubkey,
    pub bidder: Pubkey,
    pub encrypted_amount: [u8; 32],
    pub encrypted_price: [u8; 32],
    pub consumed: bool,
    pub umbra_context_account: Pubkey,
    pub umbra_persistence_account: Pubkey,
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
        constraint = bidder_payment_ata.owner == bidder.key(),
        constraint = bidder_payment_ata.mint == payment_mint.key()
    )]
    pub bidder_payment_ata: Box<InterfaceAccount<'info, TokenAccount>>,

    pub payment_mint: Box<InterfaceAccount<'info, Mint>>,
    pub token_program: Interface<'info, TokenInterface>,

    #[account(
        init_if_needed,
        payer = bidder,
        associated_token::mint = payment_mint,
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

#[derive(Accounts)]
#[instruction(
    computation_offset: u64,
    encrypted_amount: [u8; 32],
    encrypted_price: [u8; 32]
)]
pub struct DepositEncryptedBid<'info> {
    #[account(mut)]
    pub bidder: Signer<'info>,
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
        payer = bidder,
        space = 8 + PendingEncryptedBid::INIT_SPACE,
        seeds = [
            b"pending-encrypted-bid",
            auction.key().as_ref(),
            bidder.key().as_ref()
        ],
        bump
    )]
    pub temp_bid: Box<Account<'info, PendingEncryptedBid>>,
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
    /// CHECK: validated by the address constraint and Arcium runtime.
    pub mempool_account: UncheckedAccount<'info>,
    #[account(mut, address = derive_execpool_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    /// CHECK: validated by the address constraint and Arcium runtime.
    pub executing_pool: UncheckedAccount<'info>,
    #[account(mut, address = derive_comp_pda!(computation_offset, mxe_account, ErrorCode::ClusterNotSet))]
    /// CHECK: validated by the address constraint and Arcium runtime.
    pub computation_account: UncheckedAccount<'info>,
    #[account(address = derive_comp_def_pda!(COMP_DEF_OFFSET_PLACE_ENCRYPTED_BID))]
    pub comp_def_account: Box<Account<'info, ComputationDefinitionAccount>>,
    #[account(mut, address = derive_cluster_pda!(mxe_account, ErrorCode::ClusterNotSet))]
    /// CHECK: validated by the address constraint and Arcium runtime.
    pub cluster_account: Box<Account<'info, Cluster>>,
    #[account(mut, address = ARCIUM_FEE_POOL_ACCOUNT_ADDRESS)]
    /// CHECK: validated by the address constraint and Arcium runtime.
    pub pool_account: Box<Account<'info, FeePool>>,
    #[account(mut, address = ARCIUM_CLOCK_ACCOUNT_ADDRESS)]
    /// CHECK: validated by the address constraint and Arcium runtime.
    pub clock_account: Box<Account<'info, ClockAccount>>,
    pub system_program: Program<'info, System>,
    pub arcium_program: Program<'info, Arcium>,
    #[account(address = UMBRA_PROGRAM_ID)]
    /// CHECK: fixed Umbra program id used for the CPI.
    pub umbra_program: UncheckedAccount<'info>,
    #[account(mut)]
    pub sender_token_account: Box<InterfaceAccount<'info, TokenAccount>>,
    /// CHECK: Umbra callback context account, protocol-defined.
    pub umbra_context_account: UncheckedAccount<'info>,
    /// CHECK: Umbra callback persistence account, protocol-defined.
    #[account(mut)]
    pub umbra_persistence_account: UncheckedAccount<'info>,
    /// CHECK: Umbra receiver plumbing.
    pub receiver_address: UncheckedAccount<'info>,
    /// CHECK: Umbra receiver token account.
    #[account(mut)]
    pub receiver_token_account: UncheckedAccount<'info>,
    /// CHECK: Umbra receiver user account.
    #[account(mut)]
    pub receiver_user_account: UncheckedAccount<'info>,
    /// CHECK: Umbra fee schedule account.
    pub fee_schedule: UncheckedAccount<'info>,
    /// CHECK: Umbra fee vault.
    #[account(mut)]
    pub fee_vault: UncheckedAccount<'info>,
    /// CHECK: Umbra token pool.
    pub token_pool: UncheckedAccount<'info>,
    #[account(address = PAYMENT_MINT)]
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    /// CHECK: Umbra protocol config.
    pub protocol_config: UncheckedAccount<'info>,
    /// CHECK: Umbra computation data PDA.
    #[account(mut)]
    pub computation_data: UncheckedAccount<'info>,
    /// CHECK: Umbra callback signer PDA.
    pub umbra_callback_signer: UncheckedAccount<'info>,
    /// CHECK: this is your program's own id passed to Umbra as the callback target.
    #[account(address = crate::ID)]
    pub destination_program: UncheckedAccount<'info>,
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
#[instruction(bidder: Pubkey, encrypted_amount: [u8; 32])]
pub struct SubmitEncryptedBid<'info> {
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
        mut,
        seeds = [
            b"pending-encrypted-bid",
            auction.key().as_ref(),
            bidder.key().as_ref()
        ],
        bump,
        constraint = temp_bid.auction == auction.key() @ ErrorCode::EscrowMismatch,
        constraint = temp_bid.shared_vault == shared_vault.key() @ ErrorCode::InvalidSharedVault,
        constraint = temp_bid.bidder == bidder.key() @ ErrorCode::EscrowOwnerMismatch
    )]
    pub temp_bid: Box<Account<'info, PendingEncryptedBid>>,
    /// CHECK: bidder identity forwarded by Umbra; used only for PDA verification and state writes.
    pub bidder: UncheckedAccount<'info>,
    /// CHECK: Umbra callback context account, protocol-defined.
    pub umbra_context_account: UncheckedAccount<'info>,
    /// CHECK: Umbra callback persistence account, protocol-defined.
    #[account(mut)]
    pub umbra_persistence_account: UncheckedAccount<'info>,
    pub system_program: Program<'info, System>,
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
        constraint = bidder_payment_ata.owner == bidder.key(),
        constraint = bidder_payment_ata.mint == payment_mint.key()
    )]
    pub bidder_payment_ata: InterfaceAccount<'info, TokenAccount>,
    #[account(
        mut,
        associated_token::mint = payment_mint,
        associated_token::authority = escrow_account,
    )]
    pub escrow_token_account: InterfaceAccount<'info, TokenAccount>,
    pub payment_mint: InterfaceAccount<'info, Mint>,
    pub token_program: Interface<'info, TokenInterface>,
}

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

#[queue_computation_accounts("determine_winner_uniform", settler)]
#[derive(Accounts)]
#[instruction(computation_offset: u64)]
pub struct DetermineWinnerUniform<'info> {
    #[account(mut)]
    pub settler: Signer<'info>,
    #[account(mut)]
    pub auction: Box<Account<'info, Auction>>,
    #[account( init_if_needed, space = 9, payer = settler, seeds = [&SIGN_PDA_SEED], bump, address = derive_sign_pda!())]
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
    associated_token::mint = payment_mint,
    associated_token::authority = winner_escrow,
    )]
    pub escrow_token_account: InterfaceAccount<'info, TokenAccount>,
    #[account(
        mut,
        constraint = creator_payment_ata.owner == creator.key(),
        constraint = creator_payment_ata.mint == payment_mint.key()
    )]
    pub creator_payment_ata: InterfaceAccount<'info, TokenAccount>,
    #[account(
        mut,
        constraint = winner_payment_ata.owner == winner_wallet.key(),
        constraint = winner_payment_ata.mint == payment_mint.key()
    )]
    pub winner_payment_ata: InterfaceAccount<'info, TokenAccount>,
    pub payment_mint: Box<InterfaceAccount<'info, Mint>>,
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
    pub payment_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        mut,
        associated_token::mint = payment_mint,
        associated_token::authority = winner_escrow,
    )]
    pub escrow_token_account: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        mut,
        constraint = creator_payment_ata.owner == creator.key(),
        constraint = creator_payment_ata.mint == payment_mint.key()
    )]
    pub creator_payment_ata: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        mut,
        constraint = winner_payment_ata.owner == winner_wallet.key(),
        constraint = winner_payment_ata.mint == payment_mint.key()
    )]
    pub winner_payment_ata: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        init_if_needed,
        payer = payer,
        associated_token::mint = prize_mint,
        associated_token::authority = creator,
        associated_token::token_program = token_program,
    )]
    pub creator_ata: Box<InterfaceAccount<'info, TokenAccount>>,
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

// TOKEN MOVE HELPERS

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

// internal
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

    auction.raydium_pool_created = false;
    auction.creator_reserve_paid = false;

    auction.encrypted_state = [[0u8; 32]; 9];
    auction.encrypted_bid_book_nonce = 0;
    auction.encrypted_bid_book = [[0u8; 32]; 3];

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