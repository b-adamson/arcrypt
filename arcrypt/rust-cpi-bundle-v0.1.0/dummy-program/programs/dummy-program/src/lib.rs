//! dummy-program — third-party Anchor program demonstrating Umbra CPI integration.
//!
//! ## Topology
//!
//! Single program-owned PDA, the `Vault`, sits at `[UMBRA_INITIATOR_SEED]` under
//! this program's ID. The same PDA acts as:
//!   - `depositor` / `user` / `depositor_address` for every Umbra queue ix,
//!   - `initiator` (UMBRA_INITIATOR_SEED matches what the callback verifies),
//!   - owner of the Umbra-derived `EncryptedUserAccount`,
//!   - the `invoke_signed` signer for all of the above.
//!
//! The integrator's real wallet only ever signs as `fee_payer` (and as
//! `x25519_proving_signer_for_master_viewing_key` during anonymous registration,
//! which is a per-tx ephemeral keypair).
//!
//! ## Instructions
//!
//!   1. `initialise_vault` — one-time setup. Creates the Vault PDA storing
//!      just a bump.
//!   2. `queue_anonymous_registration` — wraps `register_user_for_anonymous_usage_v17`.
//!   3. `queue_deposit_into_new_network_balance` — wraps
//!      `deposit_from_public_balance_into_new_network_balance_v17`.
//!   4. `queue_deposit_into_existing_network_balance` — wraps
//!      `deposit_from_public_balance_into_existing_network_balance_v17`.
//!   5. `load_encrypted_address_deposit_buffer` — preflight populate-buffer for
//!      the encrypted-address deposit (plain Anchor, no Arcium prefix).
//!   6. `queue_encrypted_address_deposit` — wraps
//!      `deposit_into_stealth_pool_from_network_balance_with_encrypted_address_v17`.
//!   7. `on_encrypted_address_deposit_complete` — observer-CPI callback handler
//!      (`network = devnet` pins the callback-signer PDA).

use anchor_lang::prelude::*;
use umbra_codama::instructions::{
    DepositFromPublicBalanceIntoExistingNetworkBalanceV17Cpi as DepositExistingCpi,
    DepositFromPublicBalanceIntoExistingNetworkBalanceV17CpiAccounts as DepositExistingCpiAccounts,
    DepositFromPublicBalanceIntoExistingNetworkBalanceV17InstructionArgs as DepositExistingArgs,
    DepositFromPublicBalanceIntoNewNetworkBalanceV17Cpi as DepositNewCpi,
    DepositFromPublicBalanceIntoNewNetworkBalanceV17CpiAccounts as DepositNewCpiAccounts,
    DepositFromPublicBalanceIntoNewNetworkBalanceV17InstructionArgs as DepositNewArgs,
    DepositIntoStealthPoolFromNetworkBalanceWithEncryptedAddressV17Cpi as DepositEACpi,
    DepositIntoStealthPoolFromNetworkBalanceWithEncryptedAddressV17CpiAccounts as DepositEACpiAccounts,
    DepositIntoStealthPoolFromNetworkBalanceWithEncryptedAddressV17InstructionArgs as DepositEAArgs,
    PopulateStealthPoolDepositWithEncryptedAddressInputBufferCpi as PopulateBufferCpi,
    PopulateStealthPoolDepositWithEncryptedAddressInputBufferCpiAccounts as PopulateBufferCpiAccounts,
    PopulateStealthPoolDepositWithEncryptedAddressInputBufferInstructionArgs as PopulateBufferArgs,
    RegisterUserForAnonymousUsageV17Cpi as RegisterCpi,
    RegisterUserForAnonymousUsageV17CpiAccounts as RegisterCpiAccounts,
    RegisterUserForAnonymousUsageV17InstructionArgs as RegisterArgs,
};
use umbra_codama::types as ut;
use umbra_constants::umbra_callback::UMBRA_INITIATOR_SEED;
use umbra_external_macros::{
    umbra_callback_accounts, umbra_callback_handler, umbra_program, umbra_queue_accounts,
    umbra_queue_handler,
};

declare_id!("5N7xhsXVadavhqVcWkGLkXsAxVp9v73jpcFZP3tsybUj");

// =============================================================================
// VAULT — the program-global signer PDA
// =============================================================================

#[account]
pub struct Vault {
    pub bump: u8,
}

impl Vault {
    pub const LEN: usize = 8 + 1;
}

// =============================================================================
// initialise_vault
// =============================================================================

#[derive(Accounts)]
pub struct InitialiseVault<'info> {
    #[account(mut)]
    pub payer: Signer<'info>,

    #[account(
        init_if_needed,
        payer = payer,
        space = Vault::LEN,
        seeds = [UMBRA_INITIATOR_SEED],
        bump,
    )]
    pub vault: Account<'info, Vault>,

    pub system_program: Program<'info, System>,
}

// =============================================================================
// queue_anonymous_registration
// =============================================================================
//
// `user = pda` puts the Vault in the `user` slot. The macro emits
// `user: UncheckedAccount`, and we sign for it via `invoke_signed` with
// `[UMBRA_INITIATOR_SEED, &[vault.bump]]`. `x25519_proving_signer_for_master_viewing_key`
// stays a real keypair-signer (per-tx ephemeral), so the outer tx signs it.

#[umbra_queue_accounts(
    register_user_for_anonymous_usage_v17,
    user = pda,
    fee_payer = keypair,
    x25519_proving_signer_for_master_viewing_key = keypair,
)]
#[derive(Accounts)]
pub struct QueueAnonymousRegistration<'info> {
    /// Typed read of the Vault PDA. `address = user.key()` proves the
    /// macro-injected `user` slot is the same account.
    #[account(
        seeds = [UMBRA_INITIATOR_SEED],
        bump = vault.bump,
        address = user.key(),
    )]
    pub vault: Account<'info, Vault>,
}

// =============================================================================
// queue_deposit_into_new_network_balance
// =============================================================================

#[umbra_queue_accounts(
    deposit_from_public_balance_into_new_network_balance_v17,
    depositor_address = pda,
    fee_payer = keypair,
    initiator = pda,
)]
#[derive(Accounts)]
pub struct QueueDepositIntoNewNetworkBalance<'info> {
    /// Vault binds to BOTH `depositor_address` and `initiator` slots — same PDA.
    #[account(
        seeds = [UMBRA_INITIATOR_SEED],
        bump = vault.bump,
        address = depositor_address.key(),
        constraint = initiator.key() == depositor_address.key(),
    )]
    pub vault: Account<'info, Vault>,
}

// =============================================================================
// queue_deposit_into_existing_network_balance
// =============================================================================

#[umbra_queue_accounts(
    deposit_from_public_balance_into_existing_network_balance_v17,
    depositor_address = pda,
    fee_payer = keypair,
    initiator = pda,
)]
#[derive(Accounts)]
pub struct QueueDepositIntoExistingNetworkBalance<'info> {
    #[account(
        seeds = [UMBRA_INITIATOR_SEED],
        bump = vault.bump,
        address = depositor_address.key(),
        constraint = initiator.key() == depositor_address.key(),
    )]
    pub vault: Account<'info, Vault>,
}

// =============================================================================
// load_encrypted_address_deposit_buffer (plain Anchor — no Arcium prefix)
// =============================================================================

#[umbra_queue_accounts(
    populate_stealth_pool_deposit_with_encrypted_address_input_buffer,
    fee_payer = keypair,
)]
#[derive(Accounts)]
pub struct LoadEncryptedAddressDepositBuffer<'info> {
    /// Vault is unused by the buffer write itself but included to demonstrate
    /// that the same `Vault` PDA pubkey is what later queue ixs use as the
    /// depositor / initiator identity bound to this buffer's contents.
    pub vault: Account<'info, Vault>,
}

// =============================================================================
// queue_encrypted_address_deposit
// =============================================================================

#[umbra_queue_accounts(
    deposit_into_stealth_pool_from_network_balance_with_encrypted_address_v17,
    depositor = pda,
    fee_payer = keypair,
    initiator = pda,
)]
#[derive(Accounts)]
pub struct QueueEncryptedAddressDeposit<'info> {
    #[account(
        seeds = [UMBRA_INITIATOR_SEED],
        bump = vault.bump,
        address = depositor.key(),
        constraint = initiator.key() == depositor.key(),
    )]
    pub vault: Account<'info, Vault>,
}

// =============================================================================
// on_encrypted_address_deposit_complete (callback)
// =============================================================================

// Arcium's observer-CPI forwards only the two macro-injected accounts
// (`umbra_callback_signer` + `cpi_account_1`); no extra trailing accounts
// can be passed. We set `cpi_account_1 = vault.address` at queue time, so
// the dummy program reads the vault via `ctx.accounts.cpi_account_1`.
#[umbra_callback_accounts(network = devnet)]
#[derive(Accounts)]
pub struct OnEncryptedAddressDepositComplete<'info> {}

// =============================================================================
// PROGRAM MODULE
// =============================================================================

#[umbra_program]
#[program]
pub mod dummy_program {
    use super::*;

    // ---- initialise_vault ----
    pub fn initialise_vault(ctx: Context<InitialiseVault>) -> Result<()> {
        ctx.accounts.vault.bump = ctx.bumps.vault;
        Ok(())
    }

    // ---- queue_anonymous_registration ----
    #[umbra_queue_handler(register_user_for_anonymous_usage_v17)]
    pub fn queue_anonymous_registration(
        ctx: Context<QueueAnonymousRegistration>,
    ) -> Result<()> {
        let vault_bump = ctx.accounts.vault.bump;
        let umbra_program = ctx.accounts.umbra_program.to_account_info();
        let user = ctx.accounts.user.to_account_info();
        let fee_payer = ctx.accounts.fee_payer.to_account_info();
        let sign_pda_account = ctx.accounts.sign_pda_account.to_account_info();
        let mxe_account = ctx.accounts.mxe_account.to_account_info();
        let mempool_account = ctx.accounts.mempool_account.to_account_info();
        let executing_pool = ctx.accounts.executing_pool.to_account_info();
        let computation_account = ctx.accounts.computation_account.to_account_info();
        let comp_def_account = ctx.accounts.comp_def_account.to_account_info();
        let cluster_account = ctx.accounts.cluster_account.to_account_info();
        let pool_account = ctx.accounts.pool_account.to_account_info();
        let clock_account = ctx.accounts.clock_account.to_account_info();
        let system_program_acct = ctx.accounts.system_program.to_account_info();
        let arcium_program = ctx.accounts.arcium_program.to_account_info();
        let user_account = ctx.accounts.user_account.to_account_info();
        let zero_knowledge_verifying_key =
            ctx.accounts.zero_knowledge_verifying_key.to_account_info();
        let protocol_config = ctx.accounts.protocol_config.to_account_info();
        let x25519_proving_signer = ctx
            .accounts
            .x25519_proving_signer_for_master_viewing_key
            .to_account_info();
        let computation_data = ctx.accounts.computation_data.to_account_info();

        let cpi = RegisterCpi::new(
            &umbra_program,
            RegisterCpiAccounts {
                user: &user,
                fee_payer: &fee_payer,
                sign_pda_account: &sign_pda_account,
                mxe_account: &mxe_account,
                mempool_account: &mempool_account,
                executing_pool: &executing_pool,
                computation_account: &computation_account,
                comp_def_account: &comp_def_account,
                cluster_account: &cluster_account,
                pool_account: &pool_account,
                clock_account: &clock_account,
                system_program: &system_program_acct,
                arcium_program: &arcium_program,
                user_account: &user_account,
                zero_knowledge_verifying_key: &zero_knowledge_verifying_key,
                protocol_config: &protocol_config,
                x25519_proving_signer_for_master_viewing_key: &x25519_proving_signer,
                computation_data: &computation_data,
            },
            RegisterArgs {
                computation_offset: ut::ComputationOffset { first: computation_offset },
                mpc_callback_data_offset: ut::AccountOffset { first: mpc_callback_data_offset },
                rescue_encryption_nonce: ut::ArciumX25519Nonce { first: rescue_encryption_nonce },
                rescue_encrypted_master_viewing_key: ut::RescueCiphertext {
                    first: rescue_encrypted_master_viewing_key,
                },
                rescue_encrypted_random_factor_for_polynomial: ut::RescueCiphertext {
                    first: rescue_encrypted_random_factor_for_polynomial,
                },
                rescue_encryption_commitment: ut::PoseidonHash {
                    first: rescue_encryption_commitment,
                },
                rescue_encryption_polynomial_validator: ut::FieldElement25519 {
                    first: rescue_encryption_polynomial_validator,
                },
                user_commitment: ut::PoseidonHash { first: user_commitment },
                groth16_proof_a: ut::Groth16ProofA { first: groth16_proof_a },
                groth16_proof_b: ut::Groth16ProofB { first: groth16_proof_b },
                groth16_proof_c: ut::Groth16ProofC { first: groth16_proof_c },
                random_generation_seed: ut::RandomGenerationSeed { first: random_generation_seed },
                priority_fees: ut::PriorityFees { first: priority_fees },
                optional_data: ut::OptionalData { first: optional_data },
            },
        );
        cpi.invoke_signed(&[&[UMBRA_INITIATOR_SEED, &[vault_bump]]])?;
        Ok(())
    }

    // ---- queue_deposit_into_new_network_balance ----
    #[umbra_queue_handler(deposit_from_public_balance_into_new_network_balance_v17)]
    pub fn queue_deposit_into_new_network_balance(
        ctx: Context<QueueDepositIntoNewNetworkBalance>,
    ) -> Result<()> {
        let vault_bump = ctx.accounts.vault.bump;
        let umbra_program = ctx.accounts.umbra_program.to_account_info();
        let depositor_address = ctx.accounts.depositor_address.to_account_info();
        let fee_payer = ctx.accounts.fee_payer.to_account_info();
        let sign_pda_account = ctx.accounts.sign_pda_account.to_account_info();
        let mxe_account = ctx.accounts.mxe_account.to_account_info();
        let mempool_account = ctx.accounts.mempool_account.to_account_info();
        let executing_pool = ctx.accounts.executing_pool.to_account_info();
        let computation_account = ctx.accounts.computation_account.to_account_info();
        let comp_def_account = ctx.accounts.comp_def_account.to_account_info();
        let cluster_account = ctx.accounts.cluster_account.to_account_info();
        let pool_account = ctx.accounts.pool_account.to_account_info();
        let clock_account = ctx.accounts.clock_account.to_account_info();
        let system_program_acct = ctx.accounts.system_program.to_account_info();
        let arcium_program = ctx.accounts.arcium_program.to_account_info();
        let depositor_spl_ata = ctx.accounts.depositor_spl_ata.to_account_info();
        let receiver_address = ctx.accounts.receiver_address.to_account_info();
        let receiver_token_account = ctx.accounts.receiver_token_account.to_account_info();
        let receiver_user_account = ctx.accounts.receiver_user_account.to_account_info();
        let fee_schedule = ctx.accounts.fee_schedule.to_account_info();
        let fee_vault = ctx.accounts.fee_vault.to_account_info();
        let protocol_config = ctx.accounts.protocol_config.to_account_info();
        let token_pool = ctx.accounts.token_pool.to_account_info();
        let token_pool_spl_ata = ctx.accounts.token_pool_spl_ata.to_account_info();
        let mint = ctx.accounts.mint.to_account_info();
        let token_program = ctx.accounts.token_program.to_account_info();
        let computation_data = ctx.accounts.computation_data.to_account_info();
        let associated_token_program = ctx.accounts.associated_token_program.to_account_info();
        let initiator_ai = ctx.accounts.initiator.to_account_info();

        let cpi = DepositNewCpi::new(
            &umbra_program,
            DepositNewCpiAccounts {
                depositor_address: &depositor_address,
                fee_payer: &fee_payer,
                sign_pda_account: &sign_pda_account,
                mxe_account: &mxe_account,
                mempool_account: &mempool_account,
                executing_pool: &executing_pool,
                computation_account: &computation_account,
                comp_def_account: &comp_def_account,
                cluster_account: &cluster_account,
                pool_account: &pool_account,
                clock_account: &clock_account,
                system_program: &system_program_acct,
                arcium_program: &arcium_program,
                depositor_spl_ata: &depositor_spl_ata,
                receiver_address: &receiver_address,
                receiver_token_account: &receiver_token_account,
                receiver_user_account: &receiver_user_account,
                fee_schedule: &fee_schedule,
                fee_vault: &fee_vault,
                protocol_config: &protocol_config,
                token_pool: &token_pool,
                token_pool_spl_ata: &token_pool_spl_ata,
                mint: &mint,
                token_program: &token_program,
                computation_data: &computation_data,
                associated_token_program: &associated_token_program,
                initiator: &initiator_ai,
            },
            DepositNewArgs {
                computation_offset: ut::ComputationOffset { first: computation_offset },
                fee_vault_offset: ut::AccountOffset { first: fee_vault_offset },
                mpc_callback_data_offset: ut::AccountOffset { first: mpc_callback_data_offset },
                transfer_amount: ut::Amount { first: transfer_amount },
                deposit_amount: ut::Amount { first: deposit_amount },
                priority_fees: ut::PriorityFees { first: priority_fees },
                optional_data: ut::OptionalData { first: optional_data },
                random_generation_seed: ut::RandomGenerationSeed { first: random_generation_seed },
                destination_discriminator: ut::InstructionDiscriminator {
                    first: destination_discriminator,
                },
                destination_program,
                cpi_account1: cpi_account_1,
            },
        );
        cpi.invoke_signed(&[&[UMBRA_INITIATOR_SEED, &[vault_bump]]])?;
        Ok(())
    }

    // ---- queue_deposit_into_existing_network_balance ----
    #[umbra_queue_handler(deposit_from_public_balance_into_existing_network_balance_v17)]
    pub fn queue_deposit_into_existing_network_balance(
        ctx: Context<QueueDepositIntoExistingNetworkBalance>,
    ) -> Result<()> {
        let vault_bump = ctx.accounts.vault.bump;
        let umbra_program = ctx.accounts.umbra_program.to_account_info();
        let depositor_address = ctx.accounts.depositor_address.to_account_info();
        let fee_payer = ctx.accounts.fee_payer.to_account_info();
        let sign_pda_account = ctx.accounts.sign_pda_account.to_account_info();
        let mxe_account = ctx.accounts.mxe_account.to_account_info();
        let mempool_account = ctx.accounts.mempool_account.to_account_info();
        let executing_pool = ctx.accounts.executing_pool.to_account_info();
        let computation_account = ctx.accounts.computation_account.to_account_info();
        let comp_def_account = ctx.accounts.comp_def_account.to_account_info();
        let cluster_account = ctx.accounts.cluster_account.to_account_info();
        let pool_account = ctx.accounts.pool_account.to_account_info();
        let clock_account = ctx.accounts.clock_account.to_account_info();
        let system_program_acct = ctx.accounts.system_program.to_account_info();
        let arcium_program = ctx.accounts.arcium_program.to_account_info();
        let depositor_spl_ata = ctx.accounts.depositor_spl_ata.to_account_info();
        let receiver_address = ctx.accounts.receiver_address.to_account_info();
        let receiver_token_account = ctx.accounts.receiver_token_account.to_account_info();
        let fee_schedule = ctx.accounts.fee_schedule.to_account_info();
        let fee_vault = ctx.accounts.fee_vault.to_account_info();
        let protocol_config = ctx.accounts.protocol_config.to_account_info();
        let token_pool = ctx.accounts.token_pool.to_account_info();
        let token_pool_spl_ata = ctx.accounts.token_pool_spl_ata.to_account_info();
        let mint = ctx.accounts.mint.to_account_info();
        let token_program = ctx.accounts.token_program.to_account_info();
        let computation_data = ctx.accounts.computation_data.to_account_info();
        let associated_token_program = ctx.accounts.associated_token_program.to_account_info();
        let initiator_ai = ctx.accounts.initiator.to_account_info();

        let cpi = DepositExistingCpi::new(
            &umbra_program,
            DepositExistingCpiAccounts {
                depositor_address: &depositor_address,
                fee_payer: &fee_payer,
                sign_pda_account: &sign_pda_account,
                mxe_account: &mxe_account,
                mempool_account: &mempool_account,
                executing_pool: &executing_pool,
                computation_account: &computation_account,
                comp_def_account: &comp_def_account,
                cluster_account: &cluster_account,
                pool_account: &pool_account,
                clock_account: &clock_account,
                system_program: &system_program_acct,
                arcium_program: &arcium_program,
                depositor_spl_ata: &depositor_spl_ata,
                receiver_address: &receiver_address,
                receiver_token_account: &receiver_token_account,
                fee_schedule: &fee_schedule,
                fee_vault: &fee_vault,
                protocol_config: &protocol_config,
                token_pool: &token_pool,
                token_pool_spl_ata: &token_pool_spl_ata,
                mint: &mint,
                token_program: &token_program,
                computation_data: &computation_data,
                associated_token_program: &associated_token_program,
                initiator: &initiator_ai,
            },
            DepositExistingArgs {
                computation_offset: ut::ComputationOffset { first: computation_offset },
                fee_vault_offset: ut::AccountOffset { first: fee_vault_offset },
                mpc_callback_data_offset: ut::AccountOffset { first: mpc_callback_data_offset },
                transfer_amount: ut::Amount { first: transfer_amount },
                deposit_amount: ut::Amount { first: deposit_amount },
                priority_fees: ut::PriorityFees { first: priority_fees },
                optional_data: ut::OptionalData { first: optional_data },
                destination_discriminator: ut::InstructionDiscriminator {
                    first: destination_discriminator,
                },
                destination_program,
                cpi_account1: cpi_account_1,
            },
        );
        cpi.invoke_signed(&[&[UMBRA_INITIATOR_SEED, &[vault_bump]]])?;
        Ok(())
    }

    // ---- load_encrypted_address_deposit_buffer (no Arcium prefix; plain CPI) ----
    #[umbra_queue_handler(populate_stealth_pool_deposit_with_encrypted_address_input_buffer)]
    pub fn load_encrypted_address_deposit_buffer(
        ctx: Context<LoadEncryptedAddressDepositBuffer>,
    ) -> Result<()> {
        let umbra_program = ctx.accounts.umbra_program.to_account_info();
        let fee_payer = ctx.accounts.fee_payer.to_account_info();
        let stealth_pool_deposit_with_encrypted_address_input_buffer = ctx
            .accounts
            .stealth_pool_deposit_with_encrypted_address_input_buffer
            .to_account_info();
        let system_program_acct = ctx.accounts.system_program.to_account_info();

        let cpi = PopulateBufferCpi::new(
            &umbra_program,
            PopulateBufferCpiAccounts {
                fee_payer: &fee_payer,
                stealth_pool_deposit_with_encrypted_address_input_buffer:
                    &stealth_pool_deposit_with_encrypted_address_input_buffer,
                system_program: &system_program_acct,
            },
            PopulateBufferArgs {
                offset: ut::AccountOffset { first: offset },
                rescue_encryption_public_key: ut::ArciumX25519PublicKey {
                    first: rescue_encryption_public_key,
                },
                aes_encryption_public_key: ut::ArciumX25519PublicKey {
                    first: aes_encryption_public_key,
                },
                rescue_encryption_nonce: ut::ArciumX25519Nonce {
                    first: rescue_encryption_nonce,
                },
                rescue_encrypted_address_low: ut::RescueCiphertext {
                    first: rescue_encrypted_address_low,
                },
                rescue_encrypted_address_high: ut::RescueCiphertext {
                    first: rescue_encrypted_address_high,
                },
                rescue_encrypted_random_factor: ut::RescueCiphertext {
                    first: rescue_encrypted_random_factor,
                },
                encrypted_address_source_pubkey: ut::ArciumX25519PublicKey {
                    first: encrypted_address_source_pubkey,
                },
                encrypted_address_source_nonce: ut::ArciumX25519Nonce {
                    first: encrypted_address_source_nonce,
                },
                encrypted_address_source_ciphertext_low: ut::RescueCiphertext {
                    first: encrypted_address_source_ciphertext_low,
                },
                encrypted_address_source_ciphertext_high: ut::RescueCiphertext {
                    first: encrypted_address_source_ciphertext_high,
                },
                encryption_validation_polynomial: ut::FieldElement25519 {
                    first: encryption_validation_polynomial,
                },
                rescue_encryption_fiat_shamir_commitment: ut::PoseidonHash {
                    first: rescue_encryption_fiat_shamir_commitment,
                },
                groth16_proof_a: ut::Groth16ProofA { first: groth16_proof_a },
                groth16_proof_b: ut::Groth16ProofB { first: groth16_proof_b },
                groth16_proof_c: ut::Groth16ProofC { first: groth16_proof_c },
                aes_encrypted_data: ut::AesEncryptedUnspentTransactionOutputData {
                    first: aes_encrypted_data,
                },
                optional_data: ut::OptionalData { first: optional_data },
                destination_program,
                cpi_account1: cpi_account_1,
            },
        );
        cpi.invoke()?;
        Ok(())
    }

    // ---- queue_encrypted_address_deposit ----
    #[umbra_queue_handler(deposit_into_stealth_pool_from_network_balance_with_encrypted_address_v17)]
    pub fn queue_encrypted_address_deposit(
        ctx: Context<QueueEncryptedAddressDeposit>,
    ) -> Result<()> {
        let vault_bump = ctx.accounts.vault.bump;
        let umbra_program = ctx.accounts.umbra_program.to_account_info();
        let depositor = ctx.accounts.depositor.to_account_info();
        let fee_payer = ctx.accounts.fee_payer.to_account_info();
        let sign_pda_account = ctx.accounts.sign_pda_account.to_account_info();
        let mxe_account = ctx.accounts.mxe_account.to_account_info();
        let mempool_account = ctx.accounts.mempool_account.to_account_info();
        let executing_pool = ctx.accounts.executing_pool.to_account_info();
        let computation_account = ctx.accounts.computation_account.to_account_info();
        let comp_def_account = ctx.accounts.comp_def_account.to_account_info();
        let cluster_account = ctx.accounts.cluster_account.to_account_info();
        let pool_account = ctx.accounts.pool_account.to_account_info();
        let clock_account = ctx.accounts.clock_account.to_account_info();
        let system_program_acct = ctx.accounts.system_program.to_account_info();
        let arcium_program = ctx.accounts.arcium_program.to_account_info();
        let stealth_pool_deposit_with_encrypted_address_input_buffer = ctx
            .accounts
            .stealth_pool_deposit_with_encrypted_address_input_buffer
            .to_account_info();
        let computation_data = ctx.accounts.computation_data.to_account_info();
        let depositor_user_account = ctx.accounts.depositor_user_account.to_account_info();
        let depositor_token_account = ctx.accounts.depositor_token_account.to_account_info();
        let fee_schedule = ctx.accounts.fee_schedule.to_account_info();
        let fee_vault = ctx.accounts.fee_vault.to_account_info();
        let stealth_pool = ctx.accounts.stealth_pool.to_account_info();
        let token_pool = ctx.accounts.token_pool.to_account_info();
        let mint = ctx.accounts.mint.to_account_info();
        let token_program = ctx.accounts.token_program.to_account_info();
        let token_pool_spl_ata = ctx.accounts.token_pool_spl_ata.to_account_info();
        let protocol_config = ctx.accounts.protocol_config.to_account_info();
        let zero_knowledge_verifying_key =
            ctx.accounts.zero_knowledge_verifying_key.to_account_info();
        let clock_sysvar_account = ctx.accounts.clock_sysvar_account.to_account_info();
        let initiator_ai = ctx.accounts.initiator.to_account_info();

        let cpi = DepositEACpi::new(
            &umbra_program,
            DepositEACpiAccounts {
                depositor: &depositor,
                fee_payer: &fee_payer,
                sign_pda_account: &sign_pda_account,
                mxe_account: &mxe_account,
                mempool_account: &mempool_account,
                executing_pool: &executing_pool,
                computation_account: &computation_account,
                comp_def_account: &comp_def_account,
                cluster_account: &cluster_account,
                pool_account: &pool_account,
                clock_account: &clock_account,
                system_program: &system_program_acct,
                arcium_program: &arcium_program,
                stealth_pool_deposit_with_encrypted_address_input_buffer:
                    &stealth_pool_deposit_with_encrypted_address_input_buffer,
                computation_data: &computation_data,
                depositor_user_account: &depositor_user_account,
                depositor_token_account: &depositor_token_account,
                fee_schedule: &fee_schedule,
                fee_vault: &fee_vault,
                stealth_pool: &stealth_pool,
                token_pool: &token_pool,
                mint: &mint,
                token_program: &token_program,
                token_pool_spl_ata: &token_pool_spl_ata,
                protocol_config: &protocol_config,
                zero_knowledge_verifying_key: &zero_knowledge_verifying_key,
                clock_sysvar_account: &clock_sysvar_account,
                initiator: &initiator_ai,
            },
            DepositEAArgs {
                computation_offset: ut::ComputationOffset { first: computation_offset },
                fee_vault_offset: ut::AccountOffset { first: fee_vault_offset },
                input_buffer_offset: ut::AccountOffset { first: input_buffer_offset },
                mpc_callback_data_offset: ut::AccountOffset { first: mpc_callback_data_offset },
                amount_to_deduct: ut::Amount { first: amount_to_deduct },
                insertion_h2_commitment: ut::PoseidonHash { first: insertion_h2_commitment },
                insertion_timestamp: ut::UnixEpochTimestamp { first: insertion_timestamp },
                linker_encryption0: ut::PoseidonCiphertext { first: linker_encryption_0 },
                linker_encryption1: ut::PoseidonCiphertext { first: linker_encryption_1 },
                keystream_commitment0: ut::PoseidonHash { first: keystream_commitment_0 },
                keystream_commitment1: ut::PoseidonHash { first: keystream_commitment_1 },
                dispatch_observer_cpi: ut::DispatchObserverCpi { first: dispatch_observer_cpi },
                observer_output_x25519_public_key: ut::ArciumX25519PublicKey {
                    first: observer_output_x25519_public_key,
                },
                destination_discriminator: ut::InstructionDiscriminator {
                    first: destination_discriminator,
                },
                priority_fees: ut::PriorityFees { first: priority_fees },
            },
        );
        cpi.invoke_signed(&[&[UMBRA_INITIATOR_SEED, &[vault_bump]]])?;
        Ok(())
    }

    // ---- on_encrypted_address_deposit_complete (callback) ----
    #[umbra_callback_handler]
    pub fn on_encrypted_address_deposit_complete(
        _ctx: Context<OnEncryptedAddressDepositComplete>,
        // injected args: comp_def_offset, observer_pubkey, observer_nonce,
        //                initiator, public_data, ciphertext
    ) -> Result<()> {
        // Real integrations parse public_data / decrypt ciphertext here.
        // The macro already injected `require_keys_eq!(initiator, vault PDA)`.
        let _unused = (
            comp_def_offset,
            observer_pubkey,
            observer_nonce,
            public_data,
            ciphertext,
        );
        Ok(())
    }
}
