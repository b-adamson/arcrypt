//! Procedural macros for third-party programs that integrate with Umbra:
//! both for **queuing** MPC computations (CPI into Umbra) and for
//! **receiving** observer-CPI callbacks once an MPC computation finishes.
//!
//! ### Queue side
//!
//! - [`umbra_queue_accounts`] — placed on an Anchor `Accounts` struct.
//!   Injects every account slot the named Umbra queue ix expects at the
//!   start of the struct, preserving the user's own fields and any existing
//!   `#[instruction(...)]` attribute (whose params get merged with Umbra's).
//! - [`umbra_queue_handler`] — placed on the public ix function. Injects
//!   the Umbra arg list as parameters between `Context<…>` and the user's
//!   own parameters.
//!
//! ### Callback side (observer-CPI receiver)
//!
//! - [`umbra_callback_accounts`] — placed on an Anchor `Accounts` struct
//!   for the handler your destination program registers as the observer-CPI
//!   target. **Requires `network = mainnet | devnet`**: anchor pins
//!   `umbra_callback_signer` to the matching `UMBRA_CALLBACK_SIGNER_PDA_*`
//!   so any non-Umbra signer is rejected before your handler runs. Also
//!   injects `cpi_account_1: UncheckedAccount<'info>` (`#[account(mut)]`).
//! - [`umbra_callback_handler`] — placed on the callback fn. Injects the
//!   six `ObserverOutputPayload` fields (`comp_def_offset`, `observer_pubkey`,
//!   `observer_nonce`, `initiator`, `public_data`, `ciphertext`) AND prepends
//!   an equality check requiring `initiator == find_program_address(
//!   [UMBRA_INITIATOR_SEED], &crate::ID).0` — refusing callbacks initiated
//!   by any other destination program.
//!
//! Together they free callers from hand-maintaining the ~40 Umbra-required
//! queue accounts, 3–12 queue args per ix, and the universal 2-account /
//! 6-arg callback envelope.
//!
//! ### Schemas live in `schemas/` and target the **v17** on-chain program.
//! Schemas are regenerated from `idl-archive/latest/umbra.json`; the ix
//! names accepted by the queue macros all end in `_v17`.
//!
//! ### Queue example
//!
//! ```ignore
//! use anchor_lang::prelude::*;
//! use umbra_external_macros::{umbra_queue_accounts, umbra_queue_handler};
//!
//! #[umbra_queue_accounts(
//!     deposit_from_public_balance_into_new_network_balance_v17,
//!     depositor_address = keypair,
//!     fee_payer = keypair,
//!     initiator = pda,
//! )]
//! #[derive(Accounts)]
//! pub struct MyDepositIx<'info> {
//!     pub my_state: Account<'info, MyState>,
//! }
//!
//! #[umbra_queue_handler(deposit_from_public_balance_into_new_network_balance_v17)]
//! pub fn my_deposit(
//!     ctx: Context<MyDepositIx>,
//!     my_extra: u64,
//! ) -> Result<()> { Ok(()) }
//! ```
//!
//! ### Callback example
//!
//! ```ignore
//! use anchor_lang::prelude::*;
//! use umbra_external_macros::{umbra_callback_accounts, umbra_callback_handler};
//!
//! #[umbra_callback_accounts(network = mainnet)]   // or `network = devnet`
//! #[derive(Accounts)]
//! pub struct OnDepositComplete<'info> {
//!     #[account(mut)]
//!     pub my_state: Account<'info, MyState>,
//! }
//!
//! #[umbra_callback_handler]
//! pub fn on_deposit_complete(
//!     ctx: Context<OnDepositComplete>,
//!     // injected args: comp_def_offset, observer_pubkey, observer_nonce,
//!     //                initiator, public_data, ciphertext
//!     // injected stmt: require_keys_eq!(initiator, <UmbraInitiator PDA under crate::ID>);
//! ) -> Result<()> { Ok(()) }
//! ```

use proc_macro::TokenStream;
use proc_macro2::{Span, TokenStream as TokenStream2};
use quote::{format_ident, quote};
use syn::{
    parse::{Parse, ParseStream},
    parse_macro_input, parse_quote, parse_str,
    punctuated::Punctuated,
    token::Comma,
    Attribute, FnArg, Ident, Item, ItemFn, ItemMod, ItemStruct, Meta, Token, Type,
};

mod schemas;

// =============================================================================
// SCHEMA DATA TYPES
// =============================================================================

/// One account slot required by an Umbra queue ix.
///
/// The macro emits a `Signer<'info>` field for slots with `signer = true`,
/// otherwise an `UncheckedAccount<'info>` field. Slots with `writable = true`
/// receive an `#[account(mut)]` attribute; non-signer slots also receive a
/// `/// CHECK:` doc-comment so Anchor accepts the unchecked type.
#[derive(Copy, Clone)]
pub(crate) struct AccountSpec {
    /// Identifier emitted on the Anchor struct.
    pub name: &'static str,
    /// Umbra expects this slot writable.
    pub writable: bool,
    /// Umbra expects this slot to be a `Signer<'info>`.
    pub signer: bool,
}

/// One arg the Umbra queue ix declares in its `#[instruction(...)]` block
/// and on its handler function.
#[derive(Copy, Clone)]
pub(crate) struct ArgSpec {
    /// Parameter name.
    pub name: &'static str,
    /// Fully-qualified type path, parsed at macro-expansion time.
    /// Use `::umbra_codama::types::*` paths so the generated code resolves
    /// without forcing the caller to manage type imports.
    pub ty: &'static str,
}

/// Full schema for one queue ix: ordered accounts list + ordered args list.
#[derive(Copy, Clone)]
pub(crate) struct IxSchema {
    pub accounts: &'static [AccountSpec],
    pub args: &'static [ArgSpec],
}

// =============================================================================
// PROC MACROS
// =============================================================================

/// Injects every Umbra-required account at the top of an Anchor `Accounts`
/// struct and merges Umbra's `#[instruction(...)]` args with any the user
/// declared.
///
/// Place this attribute *above* `#[derive(Accounts)]` so it sees the raw
/// struct before Anchor's derive processes it. The user keeps full control
/// over their own fields; the macro only prepends.
///
/// ### Generated shape
///
/// User writes:
///
/// ```ignore
/// #[umbra_queue_accounts(deposit_from_public_balance_into_new_network_balance_v17)]
/// #[derive(Accounts)]
/// #[instruction(user_label: Pubkey)]  // optional
/// pub struct MyDepositIx<'info> {
///     #[account(seeds = [user_label.as_ref()], bump)]
///     pub user_pda: Account<'info, MyPda>,
/// }
/// ```
///
/// Macro emits:
///
/// ```ignore
/// #[derive(Accounts)]
/// #[instruction(
///     // Umbra args (always first):
///     computation_offset: ::umbra_codama::types::ComputationOffset,
///     fee_vault_offset: ::umbra_codama::types::AccountOffset,
///     mpc_callback_data_offset: ::umbra_codama::types::AccountOffset,
///     // User args:
///     user_label: Pubkey,
/// )]
/// pub struct MyDepositIx<'info> {
///     // Injected Umbra accounts (~40 slots):
///     #[account(mut)] pub depositor_address: Signer<'info>,
///     #[account(mut)] pub fee_payer: Signer<'info>,
///     /// CHECK: umbra-validated.
///     pub sign_pda_account: UncheckedAccount<'info>,
///     // ... etc ...
///     pub initiator: Signer<'info>,
///
///     // User's own fields (unchanged):
///     #[account(seeds = [user_label.as_ref()], bump)]
///     pub user_pda: Account<'info, MyPda>,
/// }
/// ```
///
/// ### Per-slot signer mode
///
/// Every `signer: true` slot in the schema MUST be tagged explicitly with
/// `pda` or `keypair`. The macro errors at compile time if any signer slot
/// is missing or unknown — the error lists the valid (or required) names
/// for the ix.
///
/// - `<slot> = keypair` → emit `Signer<'info>` (real keypair signs in the
///   outer tx).
/// - `<slot> = pda` → emit `UncheckedAccount<'info>` (the slot is a PDA
///   owned by the caller's program; the caller verifies its address and
///   signs the Umbra CPI via `invoke_signed(&[&[seeds…, &[bump]]])`).
///
/// ```ignore
/// // Vault-program pattern: depositor is a program-owned PDA,
/// // user wallet pays fees, callback initiator is the standard
/// // UmbraInitiator PDA.
/// #[umbra_queue_accounts(
///     deposit_from_public_balance_into_new_network_balance_v17,
///     depositor_address = pda,
///     fee_payer = keypair,
///     initiator = pda,
/// )]
/// ```
///
/// The exact slot names per family follow the schemas in `schemas/*.rs`:
/// `depositor_address` (deposit), `sender` (transfer), `user_address`
/// (withdraw / convert), `relayer` (claim / relayer_fees),
/// `depositor` (stealth_pool), `receiver` (compliance), `user`
/// (register), `signer` (fees / initialise_points), plus `fee_payer` and
/// (when present) `initiator`.
///
/// ### Account typing
///
/// All injected non-signer slots are `UncheckedAccount<'info>`. External
/// programs CPI-passing into Umbra do not need to deserialize Umbra's PDAs;
/// the Umbra program re-validates every account on its end. The caller
/// looks up the right pubkeys via Umbra's SDK or constants.
#[proc_macro_attribute]
pub fn umbra_queue_accounts(attr: TokenStream, item: TokenStream) -> TokenStream {
    let attr = parse_macro_input!(attr as QueueAccountsAttr);
    let mut input = parse_macro_input!(item as ItemStruct);

    let schema = match schemas::lookup_schema(&attr.ix.to_string()) {
        Some(s) => s,
        None => return unknown_ix_error(&attr.ix).into(),
    };

    let signer_modes = match resolve_signer_modes(schema.accounts, &attr.signer_modes) {
        Ok(m) => m,
        Err(err) => return err.to_compile_error().into(),
    };

    // Build injected fields from the schema.
    let injected: Punctuated<syn::Field, Comma> =
        match build_injected_fields(schema.accounts, &signer_modes) {
            Ok(fields) => fields,
            Err(err) => return err.to_compile_error().into(),
        };

    // Inject at the front of whatever fields the user already declared.
    let user_fields = match &mut input.fields {
        syn::Fields::Named(named) => &mut named.named,
        syn::Fields::Unit => {
            input.fields = syn::Fields::Named(syn::FieldsNamed {
                brace_token: Default::default(),
                named: Punctuated::new(),
            });
            if let syn::Fields::Named(named) = &mut input.fields {
                &mut named.named
            } else {
                unreachable!()
            }
        }
        _ => {
            return syn::Error::new_spanned(
                &input,
                "#[umbra_queue_accounts] requires a struct with named fields (or a unit struct)",
            )
            .to_compile_error()
            .into();
        }
    };

    // Prepend injected fields.
    let mut new_fields: Punctuated<syn::Field, Comma> = injected;
    for f in user_fields.iter().cloned() {
        new_fields.push(f);
    }
    *user_fields = new_fields;

    // Merge `#[instruction(...)]` attrs: build Umbra arg-tokens, then either
    // splice them into an existing `#[instruction(...)]` or emit a fresh one.
    if let Err(err) = merge_instruction_attr(&mut input.attrs, schema.args) {
        return err.to_compile_error().into();
    }

    let expanded = quote! { #input };
    expanded.into()
}

/// Injects the Umbra arg list into a public ix function signature, right
/// after `Context<…>` and before the user's own params. The function body
/// is untouched.
///
/// ### Generated shape
///
/// User writes:
///
/// ```ignore
/// #[umbra_queue_handler(deposit_from_public_balance_into_new_network_balance_v17)]
/// pub fn my_deposit(
///     ctx: Context<MyDepositIx>,
///     my_label: Pubkey,  // user extra
/// ) -> Result<()> {
///     // body uses `computation_offset`, `fee_vault_offset`,
///     // `mpc_callback_data_offset`, AND `my_label` freely
///     Ok(())
/// }
/// ```
///
/// Macro emits:
///
/// ```ignore
/// pub fn my_deposit(
///     ctx: Context<MyDepositIx>,
///     computation_offset: ::umbra_codama::types::ComputationOffset,
///     fee_vault_offset: ::umbra_codama::types::AccountOffset,
///     mpc_callback_data_offset: ::umbra_codama::types::AccountOffset,
///     my_label: Pubkey,
/// ) -> Result<()> {
///     // body unchanged
/// }
/// ```
#[proc_macro_attribute]
pub fn umbra_queue_handler(attr: TokenStream, item: TokenStream) -> TokenStream {
    let ix = parse_macro_input!(attr as Ident);
    let mut input = parse_macro_input!(item as ItemFn);

    let schema = match schemas::lookup_schema(&ix.to_string()) {
        Some(s) => s,
        None => return unknown_ix_error(&ix).into(),
    };

    let injected: Vec<FnArg> = match build_injected_args(schema.args) {
        Ok(args) => args,
        Err(err) => return err.to_compile_error().into(),
    };

    inject_umbra_args_after_context(&mut input.sig.inputs, injected);

    let expanded = quote! { #input };
    expanded.into()
}

// =============================================================================
// CALLBACK SIDE — receivers of Umbra's observer-CPI forwarding
// =============================================================================
//
// When an Umbra MPC computation finishes, Umbra invokes a CPI into a
// third-party "destination" program with a fixed payload shape. The two
// macros below inject the boilerplate accounts + handler args so a third
// party doesn't have to re-derive the wire format from Umbra's source.
//
// Wire format (matches `ObserverOutputPayload` in
// `rs-libs/umbra-constants/src/umbra_callback.rs`):
//   - ix data: 8-byte caller-chosen discriminator || borsh(ObserverOutputPayload)
//   - accounts: [umbra_callback_signer (read-only signer), cpi_account_1 (writable)]
//
// `umbra_callback_signer` is a PDA owned by the Umbra program; the
// destination program MUST constrain its pubkey to the right network's
// `UMBRA_CALLBACK_SIGNER_PDA_{MAINNET,DEVNET}` to refuse forged callbacks.
// We document that constraint via a `/// CHECK:` doc-comment rather than
// pinning it ourselves: each callsite chooses the network constant relevant
// to its deployment.

/// Injects the two observer-CPI receiver accounts at the top of an Anchor
/// `Accounts` struct, with `umbra_callback_signer` pinned to the
/// network-specific `UMBRA_CALLBACK_SIGNER_PDA`.
///
/// **`network = mainnet | devnet` is required.** Without it the macro fails
/// at compile time so a callback handler cannot be defined without the
/// signer-address check.
///
/// Place this attribute above `#[derive(Accounts)]`. The macro prepends:
///
/// - `umbra_callback_signer: Signer<'info>` with
///   `#[account(address = ::umbra_constants::umbra_callback::UMBRA_CALLBACK_SIGNER_PDA_<NETWORK>)]`
///   — Umbra's PDA. Anchor refuses any other signer.
/// - `cpi_account_1: UncheckedAccount<'info>` (`#[account(mut)]`) — the
///   writable slot Umbra forwards to. Carries no protocol meaning beyond
///   "the caller picked this slot at queue time"; receiver validates contents.
///
/// ### Example
///
/// ```ignore
/// #[umbra_callback_accounts(network = mainnet)]
/// #[derive(Accounts)]
/// pub struct OnDepositComplete<'info> {
///     #[account(mut)]
///     pub my_state: Account<'info, MyState>,
/// }
/// ```
///
/// Forgetting the attribute argument:
///
/// ```ignore
/// #[umbra_callback_accounts]                       // compile error
/// #[umbra_callback_accounts(network = testnet)]    // compile error
/// ```
#[proc_macro_attribute]
pub fn umbra_callback_accounts(attr: TokenStream, item: TokenStream) -> TokenStream {
    let network = match syn::parse::<CallbackAccountsAttr>(attr) {
        Ok(a) => a.network,
        Err(e) => return e.to_compile_error().into(),
    };
    let mut input = parse_macro_input!(item as ItemStruct);

    let injected = build_injected_callback_fields(network);

    let user_fields = match &mut input.fields {
        syn::Fields::Named(named) => &mut named.named,
        syn::Fields::Unit => {
            input.fields = syn::Fields::Named(syn::FieldsNamed {
                brace_token: Default::default(),
                named: Punctuated::new(),
            });
            if let syn::Fields::Named(named) = &mut input.fields {
                &mut named.named
            } else {
                unreachable!()
            }
        }
        _ => {
            return syn::Error::new_spanned(
                &input,
                "#[umbra_callback_accounts] requires a struct with named fields (or a unit struct)",
            )
            .to_compile_error()
            .into();
        }
    };

    let mut new_fields: Punctuated<syn::Field, Comma> = injected;
    for f in user_fields.iter().cloned() {
        new_fields.push(f);
    }
    *user_fields = new_fields;

    let expanded = quote! { #input };
    expanded.into()
}

/// Injects the six `ObserverOutputPayload` fields into a callback handler
/// signature, AND prepends an `initiator`-PDA equality check at the top of
/// the function body.
///
/// Injected args (in order):
///
/// - `comp_def_offset: u32`
/// - `observer_pubkey: [u8; 32]`
/// - `observer_nonce: u128`
/// - `initiator: Pubkey`
/// - `public_data: Vec<u8>`
/// - `ciphertext: Vec<u8>`
///
/// Injected statement (prepended to the function body):
///
/// ```ignore
/// ::anchor_lang::prelude::require_keys_eq!(
///     initiator,
///     ::anchor_lang::prelude::Pubkey::find_program_address(
///         &[::umbra_constants::umbra_callback::UMBRA_INITIATOR_SEED],
///         &crate::ID,
///     ).0,
/// );
/// ```
///
/// This enforces that the queue-side initiator was your program's
/// `UmbraInitiator` PDA (derived under `crate::ID`). Without the check, a
/// callback initiated by a *different* Umbra-integrating program would be
/// indistinguishable from your own.
///
/// ### Example
///
/// ```ignore
/// #[umbra_callback_handler]
/// pub fn on_deposit_complete(
///     ctx: Context<OnDepositComplete>,
///     // injected: comp_def_offset, observer_pubkey, observer_nonce,
///     //           initiator, public_data, ciphertext
/// ) -> Result<()> {
///     // initiator PDA already verified before this point.
///     Ok(())
/// }
/// ```
#[proc_macro_attribute]
pub fn umbra_callback_handler(_attr: TokenStream, item: TokenStream) -> TokenStream {
    let mut input = parse_macro_input!(item as ItemFn);

    let injected = build_injected_callback_args();
    inject_umbra_args_after_context(&mut input.sig.inputs, injected);
    prepend_initiator_check(&mut input.block.stmts);

    let expanded = quote! { #input };
    expanded.into()
}

/// Build the two observer-CPI receiver accounts as `syn::Field`s.
///
/// `umbra_callback_signer: Signer<'info>` pinned via `#[account(address = ...)]`
///   to `UMBRA_CALLBACK_SIGNER_PDA_<NETWORK>` so any non-Umbra signer is
///   refused by anchor's address constraint.
/// `cpi_account_1: UncheckedAccount<'info>` with `#[account(mut)]`.
fn build_injected_callback_fields(network: CallbackNetwork) -> Punctuated<syn::Field, Comma> {
    let mut fields: Punctuated<syn::Field, Comma> = Punctuated::new();

    // umbra_callback_signer: Signer<'info> with address pinned to the
    // network-specific UMBRA_CALLBACK_SIGNER_PDA. anchor's `address = ...`
    // constraint enforces equality on its end, so without the right PDA the
    // ix is rejected before our handler runs.
    let signer_pda_path: syn::Expr = match network {
        CallbackNetwork::Mainnet => parse_quote!(
            ::umbra_constants::umbra_callback::UMBRA_CALLBACK_SIGNER_PDA_MAINNET
        ),
        CallbackNetwork::Devnet => parse_quote!(
            ::umbra_constants::umbra_callback::UMBRA_CALLBACK_SIGNER_PDA_DEVNET
        ),
    };
    fields.push(syn::Field {
        attrs: vec![
            parse_quote!(
                #[doc = " Umbra-side PDA that signs the observer-CPI. Address pinned by"]
            ),
            parse_quote!(
                #[doc = " `#[umbra_callback_accounts(network = ...)]` — anchor refuses any other signer."]
            ),
            parse_quote!(#[account(address = #signer_pda_path)]),
        ],
        vis: parse_quote!(pub),
        mutability: syn::FieldMutability::None,
        ident: Some(format_ident!("umbra_callback_signer")),
        colon_token: Some(Default::default()),
        ty: parse_quote!(Signer<'info>),
    });

    // cpi_account_1: UncheckedAccount<'info> with #[account(mut)]
    fields.push(syn::Field {
        attrs: vec![
            parse_quote!(
                #[doc = " CHECK: writable callback slot. The third-party validates contents; Umbra carries this pubkey from the queue ix's `cpi_account_1` arg through to the callback unchanged."]
            ),
            parse_quote!(#[account(mut)]),
        ],
        vis: parse_quote!(pub),
        mutability: syn::FieldMutability::None,
        ident: Some(format_ident!("cpi_account_1")),
        colon_token: Some(Default::default()),
        ty: parse_quote!(UncheckedAccount<'info>),
    });

    fields
}

/// Build the six `ObserverOutputPayload` fields as `FnArg`s.
///
/// Layout MUST match the borsh serialization of `ObserverOutputPayload` —
/// Anchor's auto-generated dispatcher deserializes the inbound ix data
/// (after the 8-byte discriminator) into the handler args in declaration
/// order. Any drift between this list and `ObserverOutputPayload` breaks
/// the wire format for every receiver.
fn build_injected_callback_args() -> Vec<FnArg> {
    vec![
        parse_quote!(comp_def_offset: u32),
        parse_quote!(observer_pubkey: [u8; 32]),
        parse_quote!(observer_nonce: u128),
        parse_quote!(initiator: Pubkey),
        parse_quote!(public_data: Vec<u8>),
        parse_quote!(ciphertext: Vec<u8>),
    ]
}

/// Pre-processor for `#[program]` / `#[arcium_program]` mods.
///
/// Place this attribute **above** the program-shape attribute (anchor's
/// `#[program]`, arcium's `#[arcium_program]`, etc.). It walks the mod body,
/// finds every `pub fn` annotated with `#[umbra_queue_handler(<ix>)]`,
/// injects the Umbra arg list into that fn's signature, and strips the
/// `#[umbra_queue_handler]` attribute — so the program-shape macro that
/// expands NEXT sees the fully-expanded handler signature and generates a
/// dispatcher matching the runtime arity.
///
/// ### Why this exists
///
/// Outer attribute macros expand top-down. When you write
///
/// ```ignore
/// #[program]
/// pub mod my_program {
///     #[umbra_queue_handler(deposit_from_public_balance_into_new_network_balance_v17)]
///     pub fn queue_deposit(ctx: Context<…>, my_label: [u8; 8]) -> Result<()> { … }
/// }
/// ```
///
/// `#[program]` runs first and reads the un-expanded 2-arg signature, so its
/// generated dispatcher passes only 2 args at runtime. `#[umbra_queue_handler]`
/// then expands and rewrites the fn to take ~13 args — the dispatcher and
/// the real fn now disagree and the program fails to compile.
///
/// `#[umbra_program]` fixes this by running BEFORE the program-shape macro.
/// It re-emits the mod with every `#[umbra_queue_handler]` already expanded,
/// so the dispatcher macro sees the final arity.
///
/// ### Usage
///
/// ```ignore
/// #[umbra_program]                                   // runs first
/// #[anchor_lang::prelude::program]                   // runs second
/// pub mod my_program { … }
/// ```
///
/// Composes the same way with `#[arcium_program]` (or any other
/// program-shape outer macro):
///
/// ```ignore
/// #[umbra_program]
/// #[arcium_program]
/// pub mod my_program { … }
/// ```
///
/// Inner functions without `#[umbra_queue_handler]` are passed through
/// untouched.
#[proc_macro_attribute]
pub fn umbra_program(_attr: TokenStream, item: TokenStream) -> TokenStream {
    let mut input = parse_macro_input!(item as ItemMod);

    let Some((_, items)) = &mut input.content else {
        // External mods (`mod foo;`) have no body to walk. Pass through —
        // the user almost certainly didn't intend this and the program-shape
        // macro below will give a more helpful error.
        return quote! { #input }.into();
    };

    for item in items.iter_mut() {
        if let Item::Fn(item_fn) = item {
            if let Err(err) = expand_umbra_queue_handler_attr(item_fn) {
                return err.to_compile_error().into();
            }
            expand_umbra_callback_handler_attr(item_fn);
        }
    }

    quote! { #input }.into()
}

/// If `item_fn` carries `#[umbra_callback_handler]`, injects the
/// ObserverOutputPayload args and strips the attribute. No-op otherwise.
///
/// Mirrors `expand_umbra_queue_handler_attr` but for the receiver side.
/// The callback args are universal (not schema-driven), so there's no
/// fallible lookup — this function never returns an error.
fn expand_umbra_callback_handler_attr(item_fn: &mut ItemFn) {
    let Some(idx) = item_fn
        .attrs
        .iter()
        .position(|a| a.path().is_ident("umbra_callback_handler"))
    else {
        return;
    };
    item_fn.attrs.remove(idx);
    let injected = build_injected_callback_args();
    inject_umbra_args_after_context(&mut item_fn.sig.inputs, injected);
    prepend_initiator_check(&mut item_fn.block.stmts);
}

/// Prepend the `initiator`-PDA equality check statement to a function body.
///
/// The injected statement uses anchor's `require_keys_eq!` macro, which on
/// mismatch returns `anchor_lang::error::ErrorCode::RequireKeysEqViolated`.
/// The expected PDA is `find_program_address([UMBRA_INITIATOR_SEED],
/// &crate::ID).0` — i.e., derived under the *destination's* program ID, not
/// Umbra's, so each destination's check resolves to a different pubkey.
fn prepend_initiator_check(stmts: &mut Vec<syn::Stmt>) {
    let check: syn::Stmt = parse_quote!(
        ::anchor_lang::prelude::require_keys_eq!(
            initiator,
            ::anchor_lang::prelude::Pubkey::find_program_address(
                &[::umbra_constants::umbra_callback::UMBRA_INITIATOR_SEED],
                &crate::ID,
            ).0,
        );
    );
    stmts.insert(0, check);
}

// =============================================================================
// CALLBACK ATTRIBUTE PARSING — `network = mainnet | devnet`
// =============================================================================

/// Network selector for `umbra_callback_accounts`. Picks which
/// `UMBRA_CALLBACK_SIGNER_PDA_*` constant gets baked into the
/// `#[account(address = ...)]` constraint on `umbra_callback_signer`.
#[derive(Copy, Clone, PartialEq, Eq)]
enum CallbackNetwork {
    Mainnet,
    Devnet,
}

struct CallbackAccountsAttr {
    network: CallbackNetwork,
}

impl Parse for CallbackAccountsAttr {
    fn parse(input: ParseStream) -> syn::Result<Self> {
        if input.is_empty() {
            return Err(syn::Error::new(
                Span::call_site(),
                "#[umbra_callback_accounts] requires `network = mainnet` or `network = devnet`. \
                 Without it, the macro cannot pin `umbra_callback_signer` to the right \
                 UMBRA_CALLBACK_SIGNER_PDA — and an unpinned signer is unsafe.",
            ));
        }
        let key: Ident = input.parse()?;
        if key != "network" {
            return Err(syn::Error::new(
                key.span(),
                format!(
                    "expected `network = mainnet | devnet`, found `{}`",
                    key,
                ),
            ));
        }
        let _: Token![=] = input.parse()?;
        let value: Ident = input.parse()?;
        let network = match value.to_string().as_str() {
            "mainnet" => CallbackNetwork::Mainnet,
            "devnet" => CallbackNetwork::Devnet,
            other => {
                return Err(syn::Error::new(
                    value.span(),
                    format!(
                        "unknown network `{}`. Expected `mainnet` or `devnet`.",
                        other,
                    ),
                ));
            }
        };
        // Allow a trailing comma but reject any further tokens.
        if input.peek(Token![,]) {
            let _: Token![,] = input.parse()?;
        }
        if !input.is_empty() {
            return Err(input.error(
                "unexpected tokens after `network = ...`; this attribute accepts only `network`",
            ));
        }
        Ok(CallbackAccountsAttr { network })
    }
}

/// If `item_fn` carries `#[umbra_queue_handler(<ix>)]`, injects the Umbra
/// arg list into its signature and strips the attribute. No-op otherwise.
fn expand_umbra_queue_handler_attr(item_fn: &mut ItemFn) -> Result<(), syn::Error> {
    let attr_idx = item_fn
        .attrs
        .iter()
        .position(|a| a.path().is_ident("umbra_queue_handler"));
    let Some(idx) = attr_idx else { return Ok(()) };

    let ix: Ident = item_fn.attrs[idx].parse_args()?;

    let schema = schemas::lookup_schema(&ix.to_string()).ok_or_else(|| {
        let supported = format_supported_list();
        syn::Error::new(
            ix.span(),
            format!(
                "unknown umbra queue instruction `{}`.\nsupported instructions:\n{}",
                ix, supported,
            ),
        )
    })?;

    let injected = build_injected_args(schema.args)?;

    // Strip the attribute first so re-emission doesn't recurse.
    item_fn.attrs.remove(idx);
    inject_umbra_args_after_context(&mut item_fn.sig.inputs, injected);

    Ok(())
}

/// Splice `injected` into `inputs` immediately after `ctx: Context<…>` (or
/// at the head if no Context is present). Receivers (`self`) stay at the
/// front. Subsequent user args follow the injected block.
fn inject_umbra_args_after_context(
    inputs: &mut Punctuated<FnArg, Comma>,
    injected: Vec<FnArg>,
) {
    let mut new_inputs: Punctuated<FnArg, Comma> = Punctuated::new();
    let mut injected_done = false;
    let mut saw_context = false;

    for arg in inputs.iter().cloned() {
        match &arg {
            FnArg::Receiver(_) => new_inputs.push(arg),
            FnArg::Typed(pat_ty) => {
                let is_context = type_is_anchor_context(&pat_ty.ty);
                if !injected_done && (is_context || saw_context || new_inputs.is_empty()) {
                    if is_context {
                        new_inputs.push(arg);
                        saw_context = true;
                        continue;
                    }
                }
                if !injected_done {
                    for inj in &injected {
                        new_inputs.push(inj.clone());
                    }
                    injected_done = true;
                }
                new_inputs.push(arg);
            }
        }
    }
    if !injected_done {
        for inj in injected {
            new_inputs.push(inj);
        }
    }
    *inputs = new_inputs;
}

// =============================================================================
// HELPERS
// =============================================================================

/// Per-slot signing mode for `#[umbra_queue_accounts(...)]`.
///
/// - `Keypair`: emit `Signer<'info>` — the slot must be signed in the outer
///   transaction by a real keypair.
/// - `Pda`: emit `UncheckedAccount<'info>` — the slot is a PDA owned by the
///   caller's program. The caller verifies its address (typically via a
///   `seeds = [...]` constraint or runtime `find_program_address`) and signs
///   across the Umbra CPI via `invoke_signed`.
#[derive(Copy, Clone, PartialEq, Eq)]
pub(crate) enum SignerMode {
    Keypair,
    Pda,
}

/// Parsed form of `#[umbra_queue_accounts(<ix>, <slot> = <mode>, ...)]`.
///
/// Every `signer: true` slot in the schema must appear exactly once in the
/// flags. Each value is either `pda` or `keypair`. The macro errors on
/// unknown slot names (with a list of valid ones) and on missing slots
/// (with a list of required ones). This is intentionally explicit: there
/// are at most three signer slots per ix and the call-site reads the same
/// shape across all families.
struct QueueAccountsAttr {
    ix: Ident,
    /// Mode per signer slot, keyed by the slot's name in the schema.
    /// Validated against the schema in `umbra_queue_accounts` so the
    /// error span can point back at the user's tokens.
    signer_modes: Vec<(Ident, SignerMode)>,
}

impl Parse for QueueAccountsAttr {
    fn parse(input: ParseStream) -> syn::Result<Self> {
        let ix: Ident = input.parse()?;
        let mut signer_modes: Vec<(Ident, SignerMode)> = Vec::new();

        while !input.is_empty() {
            let _: Token![,] = input.parse()?;
            // Trailing comma after the last flag is fine.
            if input.is_empty() {
                break;
            }
            let key: Ident = input.parse()?;
            let _: Token![=] = input.parse()?;
            let value: Ident = input.parse()?;

            let mode = match value.to_string().as_str() {
                "keypair" => SignerMode::Keypair,
                "pda" => SignerMode::Pda,
                other => {
                    return Err(syn::Error::new(
                        value.span(),
                        format!(
                            "expected `keypair` or `pda` for `{}`, got `{}`",
                            key, other,
                        ),
                    ));
                }
            };
            signer_modes.push((key, mode));
        }

        Ok(QueueAccountsAttr { ix, signer_modes })
    }
}

/// Resolve the user's flag list against the schema's signer slots.
///
/// Validates that:
/// 1. Every flag key names a slot that exists in the schema and is a signer.
/// 2. Every signer slot in the schema is named exactly once by a flag.
///
/// Returns a map from slot name → `SignerMode`. The span on each `Ident` is
/// the user's call-site token, so error messages point at the right place.
fn resolve_signer_modes(
    schema_accounts: &[AccountSpec],
    flags: &[(Ident, SignerMode)],
) -> Result<std::collections::HashMap<String, SignerMode>, syn::Error> {
    use std::collections::HashMap;

    let signer_slot_names: Vec<&'static str> = schema_accounts
        .iter()
        .filter(|spec| spec.signer)
        .map(|spec| spec.name)
        .collect();

    // 1. Catch unknown / duplicate keys with good spans.
    let mut seen: HashMap<String, &Ident> = HashMap::new();
    for (key, _) in flags {
        let key_str = key.to_string();
        if !signer_slot_names.contains(&key_str.as_str()) {
            let valid = signer_slot_names
                .iter()
                .map(|n| format!("  - {}", n))
                .collect::<Vec<_>>()
                .join("\n");
            return Err(syn::Error::new(
                key.span(),
                format!(
                    "`{}` is not a signer slot for this ix.\nvalid signer slots:\n{}",
                    key_str, valid,
                ),
            ));
        }
        if seen.contains_key(&key_str) {
            return Err(syn::Error::new(
                key.span(),
                format!("signer slot `{}` set more than once", key_str),
            ));
        }
        seen.insert(key_str, key);
    }

    // 2. Catch missing keys. The error spans the ix ident since there's no
    // user token to point at for an omitted flag.
    let missing: Vec<&&str> = signer_slot_names
        .iter()
        .filter(|name| !seen.contains_key(&name.to_string()))
        .collect();
    if !missing.is_empty() {
        let missing_lines = missing
            .iter()
            .map(|n| format!("  - {} = pda  // or = keypair", n))
            .collect::<Vec<_>>()
            .join("\n");
        return Err(syn::Error::new(
            Span::call_site(),
            format!(
                "`#[umbra_queue_accounts]` requires an explicit mode for every signer slot.\nadd:\n{}",
                missing_lines,
            ),
        ));
    }

    let mut out = HashMap::new();
    for (key, mode) in flags {
        out.insert(key.to_string(), *mode);
    }
    Ok(out)
}

fn unknown_ix_error(ix: &Ident) -> TokenStream2 {
    let supported = format_supported_list();
    syn::Error::new(
        ix.span(),
        format!(
            "unknown umbra queue instruction `{}`.\nsupported instructions:\n{}",
            ix, supported,
        ),
    )
    .to_compile_error()
}

/// Render the supported ix list, one indented line per name (sorted).
fn format_supported_list() -> String {
    let mut names: Vec<&'static str> = schemas::supported_ix_names().collect();
    names.sort_unstable();
    names
        .into_iter()
        .map(|n| format!("  - {}", n))
        .collect::<Vec<_>>()
        .join("\n")
}

/// Build the injected `syn::Field`s from an account schema. Each field gets
/// the appropriate type (`Signer<'info>` for keypair signers,
/// `UncheckedAccount<'info>` otherwise), the `#[account(mut)]` attribute
/// when writable, and a `/// CHECK:` doc on UncheckedAccount fields.
///
/// `signer_modes` maps each signer slot's name to its caller-chosen mode.
/// The caller (`umbra_queue_accounts`) ensures every signer slot in the
/// schema is present in the map before we get here, so lookup-by-name is
/// infallible for signer slots.
fn build_injected_fields(
    accounts: &[AccountSpec],
    signer_modes: &std::collections::HashMap<String, SignerMode>,
) -> Result<Punctuated<syn::Field, Comma>, syn::Error> {
    let mut fields = Punctuated::new();
    for spec in accounts {
        let ident = format_ident!("{}", spec.name);
        // PDA mode for a signer slot means: emit `UncheckedAccount<'info>`
        // instead of `Signer<'info>` so the caller can carry the PDA
        // without anchor failing the outer-tx `is_signer` check, and sign
        // it across the CPI via `invoke_signed`. The caller chooses the
        // mode per-slot via `#[umbra_queue_accounts(<ix>, <slot> = pda)]`;
        // `resolve_signer_modes` already verified every signer slot has a
        // mode, so the lookup is infallible here.
        let emit_unchecked = spec.signer
            && matches!(signer_modes.get(spec.name), Some(SignerMode::Pda));

        // Anchor's `#[derive(Accounts)]` parser rejects segmented paths on
        // field types, so emit the short names. Callers must keep
        // `use anchor_lang::prelude::*;` in scope at the struct definition
        // (the standard anchor program layout).
        let ty: Type = if spec.signer && !emit_unchecked {
            parse_quote!(Signer<'info>)
        } else {
            parse_quote!(UncheckedAccount<'info>)
        };

        let mut attrs: Vec<Attribute> = Vec::new();
        let is_unchecked = !spec.signer || emit_unchecked;
        if is_unchecked {
            // Anchor requires `/// CHECK:` on UncheckedAccount fields.
            attrs.push(parse_quote!(
                #[doc = " CHECK: umbra-validated. external callers pass the right pubkey; the umbra program re-derives and checks the PDA on its end."]
            ));
        }
        if spec.writable {
            attrs.push(parse_quote!(#[account(mut)]));
        }

        fields.push(syn::Field {
            attrs,
            vis: parse_quote!(pub),
            mutability: syn::FieldMutability::None,
            ident: Some(ident),
            colon_token: Some(Default::default()),
            ty,
        });
    }

    // Append the CPI target program. Codama's `Cpi::new(&program, ...)` reads
    // the program ID from this AccountInfo's pubkey, so the caller MUST pass
    // the real Umbra program account at the call site. We don't validate
    // here because the right program ID (mainnet vs devnet vs localnet)
    // varies per deployment; the runtime will fail loudly if the wrong one
    // is passed since the codama-emitted instruction discriminator won't
    // match any non-Umbra program. Injecting this here saves callers from
    // adding a manual field on every `#[derive(Accounts)]` struct.
    fields.push(syn::Field {
        attrs: vec![parse_quote!(
            #[doc = " CHECK: CPI target. The codama Cpi builder uses this AccountInfo's pubkey as the invoked program; pass the correct Umbra program ID at the call site."]
        )],
        vis: parse_quote!(pub),
        mutability: syn::FieldMutability::None,
        ident: Some(format_ident!("umbra_program")),
        colon_token: Some(Default::default()),
        ty: parse_quote!(UncheckedAccount<'info>),
    });

    Ok(fields)
}

/// Build the injected `FnArg`s for the handler function from an args schema.
fn build_injected_args(args: &[ArgSpec]) -> Result<Vec<FnArg>, syn::Error> {
    let mut out = Vec::with_capacity(args.len());
    for spec in args {
        let ident = format_ident!("{}", spec.name);
        let ty: Type = parse_str(spec.ty).map_err(|e| {
            syn::Error::new(
                Span::call_site(),
                format!("invalid arg type `{}` in schema: {}", spec.ty, e),
            )
        })?;
        out.push(parse_quote!(#ident: #ty));
    }
    Ok(out)
}

/// Returns true iff `ty` ends in an `anchor_lang::context::Context<…>` path
/// segment. Best-effort: matches just on the final segment ident so any
/// alias / re-export of `Context` resolves.
fn type_is_anchor_context(ty: &Type) -> bool {
    if let Type::Path(tp) = ty {
        if let Some(seg) = tp.path.segments.last() {
            return seg.ident == "Context";
        }
    }
    false
}

/// Locate an existing `#[instruction(...)]` attribute on the struct. If
/// present, strip the user's args, prepend the Umbra args, and re-emit. If
/// absent, emit a fresh `#[instruction(...)]` with just the Umbra args.
fn merge_instruction_attr(
    attrs: &mut Vec<Attribute>,
    umbra_args: &[ArgSpec],
) -> Result<(), syn::Error> {
    let umbra_tokens = umbra_args_tokens(umbra_args)?;

    let existing_idx = attrs
        .iter()
        .position(|a| a.path().is_ident("instruction"));

    let merged_attr: Attribute = match existing_idx {
        Some(idx) => {
            // Pull the user's arg tokens out of the existing attr.
            let user_tokens = match &attrs[idx].meta {
                Meta::List(list) => list.tokens.clone(),
                Meta::Path(_) => TokenStream2::new(),
                Meta::NameValue(_) => {
                    return Err(syn::Error::new_spanned(
                        &attrs[idx],
                        "expected `#[instruction(...)]`, found `#[instruction = ...]`",
                    ));
                }
            };
            attrs.remove(idx);
            if user_tokens.is_empty() {
                parse_quote!(#[instruction(#umbra_tokens)])
            } else {
                parse_quote!(#[instruction(#umbra_tokens, #user_tokens)])
            }
        }
        None => parse_quote!(#[instruction(#umbra_tokens)]),
    };

    attrs.push(merged_attr);
    Ok(())
}

/// Emit `name1: Type1, name2: Type2, ...` for an args schema (no surrounding
/// parens — caller wraps in `#[instruction(...)]`).
fn umbra_args_tokens(args: &[ArgSpec]) -> Result<TokenStream2, syn::Error> {
    let mut out = TokenStream2::new();
    for (i, spec) in args.iter().enumerate() {
        if i > 0 {
            out.extend(quote!(,));
        }
        let ident = format_ident!("{}", spec.name);
        let ty: Type = parse_str(spec.ty).map_err(|e| {
            syn::Error::new(
                Span::call_site(),
                format!("invalid arg type `{}` in schema: {}", spec.ty, e),
            )
        })?;
        out.extend(quote!(#ident: #ty));
    }
    Ok(out)
}

// =============================================================================
// SMOKE TESTS
// =============================================================================
//
// These exercise the macro's internal field/arg builders without needing
// `anchor_lang` or `umbra_codama` available as a dev-dep. They validate that
// the schema data round-trips through the syn machinery into well-formed
// Rust tokens.

#[cfg(test)]
mod smoke_tests {
    use super::*;
    use quote::ToTokens;

    /// `build_injected_fields` produces one Field per AccountSpec, in order,
    /// with the right ident and type.
    #[test]
    fn injected_fields_round_trip() {
        let schema = schemas::lookup_schema(
            "deposit_from_public_balance_into_new_network_balance_v17",
        )
        .expect("known ix");
        // Construct a map setting every signer slot in this schema to
        // keypair mode (the umbra_queue_accounts caller does this from
        // user input; we synthesise it here so the field builder can run).
        let signer_modes: std::collections::HashMap<String, SignerMode> = schema
            .accounts
            .iter()
            .filter(|spec| spec.signer)
            .map(|spec| (spec.name.to_string(), SignerMode::Keypair))
            .collect();
        let fields = build_injected_fields(schema.accounts, &signer_modes).expect("build ok");
        // `+ 1` for the macro-appended `umbra_program` CPI-target slot.
        assert_eq!(
            fields.len(),
            schema.accounts.len() + 1,
            "field count must equal schema slot count + 1 (umbra_program)",
        );
        assert_eq!(
            fields.last().unwrap().ident.as_ref().map(|i| i.to_string()).as_deref(),
            Some("umbra_program"),
            "last injected field must be `umbra_program`",
        );

        // Field 0 is `depositor_address: Signer<'info>` (mut).
        let f0 = &fields[0];
        assert_eq!(
            f0.ident.as_ref().map(|i| i.to_string()).as_deref(),
            Some("depositor_address"),
        );
        let ty_str = f0.ty.to_token_stream().to_string();
        assert!(
            ty_str.contains("Signer"),
            "signer slot type should mention Signer, got `{}`",
            ty_str,
        );
        let attr_str = f0
            .attrs
            .iter()
            .map(|a| a.to_token_stream().to_string())
            .collect::<Vec<_>>()
            .join(" ");
        assert!(
            attr_str.contains("mut"),
            "writable signer must carry `#[account(mut)]`, got attrs `{}`",
            attr_str,
        );

        // A known non-signer, non-writable slot — sign_pda_account is at
        // index 2.
        let f2 = &fields[2];
        assert_eq!(
            f2.ident.as_ref().map(|i| i.to_string()).as_deref(),
            Some("sign_pda_account"),
        );
        let ty_str = f2.ty.to_token_stream().to_string();
        assert!(
            ty_str.contains("UncheckedAccount"),
            "non-signer slot type should be UncheckedAccount, got `{}`",
            ty_str,
        );
    }

    /// `build_injected_args` produces one FnArg per ArgSpec with the right
    /// ident and a parseable type. Uses the full IDL arg list.
    #[test]
    fn injected_args_round_trip() {
        let schema = schemas::lookup_schema(
            "deposit_from_public_balance_into_new_network_balance_v17",
        )
        .expect("known ix");
        let args = build_injected_args(schema.args).expect("build ok");
        // 11 args per the IDL: 3 offsets + transfer/deposit amounts +
        // priority/optional + random_generation_seed + discriminator +
        // 2 pubkey args (cpi_account_2 dropped in claim-path slim-down).
        assert_eq!(args.len(), 11, "new-network deposit has 11 args");

        // First arg is `computation_offset: u64` (primitive — see
        // `__arg_spec!` in `schemas/mod.rs`; codama wrapper types switched
        // to primitives to avoid borsh-version mismatch with anchor 0.32).
        let a0 = &args[0];
        let s0 = a0.to_token_stream().to_string();
        assert!(s0.contains("computation_offset"), "arg 0 ident: `{}`", s0);
        assert!(
            s0.contains("u64"),
            "arg 0 should use u64 (primitive form of ComputationOffset), got `{}`",
            s0,
        );

        // Last 2 args are `pubkey` (IDL pubkey → ::anchor_lang::prelude::Pubkey).
        for spec in &args[args.len() - 2..] {
            let s = spec.to_token_stream().to_string();
            assert!(
                s.contains("Pubkey"),
                "trailing pubkey arg should resolve to `Pubkey`, got `{}`",
                s,
            );
        }
    }

    /// Sweep every registered ix: build both field list and arg list,
    /// confirm no schema is mis-shaped. Synthesises a keypair-mode signer
    /// map per ix so the field builder accepts every signer slot.
    #[test]
    fn every_registered_ix_builds() {
        let mut count = 0;
        for name in schemas::supported_ix_names() {
            let schema = schemas::lookup_schema(name)
                .unwrap_or_else(|| panic!("registry lists `{}` but lookup misses", name));

            let signer_modes: std::collections::HashMap<String, SignerMode> = schema
                .accounts
                .iter()
                .filter(|spec| spec.signer)
                .map(|spec| (spec.name.to_string(), SignerMode::Keypair))
                .collect();

            let fields = build_injected_fields(schema.accounts, &signer_modes)
                .unwrap_or_else(|e| panic!("ix `{}` field build failed: {}", name, e));
            assert_eq!(
                fields.len(),
                schema.accounts.len() + 1,
                "ix `{}`: expected {} fields (incl. umbra_program), got {}",
                name,
                schema.accounts.len() + 1,
                fields.len(),
            );

            build_injected_args(schema.args)
                .unwrap_or_else(|e| panic!("ix `{}` arg build failed: {}", name, e));
            count += 1;
        }
        assert_eq!(count, 44, "expected 44 registered ixs, found {}", count);
    }

    /// `build_injected_args` resolves IDL `pubkey` typed args to
    /// `::anchor_lang::prelude::Pubkey`.
    #[test]
    fn pubkey_arg_resolves() {
        let schema = schemas::lookup_schema(
            "withdraw_from_network_balance_into_public_balance_v17",
        )
        .expect("known ix");
        // withdraw ends with pubkey args (cpi_account_1 is the last observer pubkey arg now).
        let args = build_injected_args(schema.args).expect("build ok");
        let last = &args[args.len() - 1];
        let s = last.to_token_stream().to_string();
        assert!(s.contains("cpi_account_1"), "ident: `{}`", s);
        assert!(s.contains("Pubkey"), "type: `{}`", s);
    }

    /// `merge_instruction_attr` with no existing attr produces a fresh
    /// `#[instruction(...)]` carrying just the Umbra args.
    #[test]
    fn merge_attr_no_existing() {
        let schema = schemas::lookup_schema(
            "convert_network_balance_to_shared_balance_v17",
        )
        .expect("known ix");
        let mut attrs: Vec<Attribute> = Vec::new();
        merge_instruction_attr(&mut attrs, schema.args).expect("merge ok");
        assert_eq!(attrs.len(), 1);
        let s = attrs[0].to_token_stream().to_string();
        assert!(s.contains("instruction"));
        assert!(s.contains("computation_offset"));
        assert!(s.contains("mpc_callback_data_offset"));
    }

    /// `merge_instruction_attr` with an existing `#[instruction(...)]`
    /// preserves the user's args after the Umbra args.
    #[test]
    fn merge_attr_with_existing() {
        let schema = schemas::lookup_schema(
            "convert_network_balance_to_shared_balance_v17",
        )
        .expect("known ix");
        let user_attr: Attribute =
            syn::parse_quote!(#[instruction(my_label: u64, other_arg: bool)]);
        let mut attrs = vec![user_attr];
        merge_instruction_attr(&mut attrs, schema.args).expect("merge ok");
        assert_eq!(attrs.len(), 1);
        let s = attrs[0].to_token_stream().to_string();
        assert!(s.contains("computation_offset"), "missing umbra arg in `{}`", s);
        assert!(s.contains("my_label"), "missing user arg in `{}`", s);
        // umbra args must come before user args; check by index in the string.
        let comp_idx = s.find("computation_offset").unwrap();
        let user_idx = s.find("my_label").unwrap();
        assert!(comp_idx < user_idx, "umbra arg should precede user arg");
    }

    /// `type_is_anchor_context` matches the final path segment regardless of
    /// prefix.
    #[test]
    fn context_detection() {
        let ty: Type = syn::parse_quote!(Context<'info, Foo>);
        assert!(type_is_anchor_context(&ty));
        let ty: Type = syn::parse_quote!(::anchor_lang::context::Context<'a, Bar>);
        assert!(type_is_anchor_context(&ty));
        let ty: Type = syn::parse_quote!(SomethingElse);
        assert!(!type_is_anchor_context(&ty));
        let ty: Type = syn::parse_quote!(u64);
        assert!(!type_is_anchor_context(&ty));
    }
}
