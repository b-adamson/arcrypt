/**
 * Minimal SPL Token + Associated Token Account helpers.
 *
 * Only what the e2e test needs: derive a vault ATA, idempotently create it,
 * and transfer base units from fee_payer's ATA. Built inline to avoid
 * pulling @solana-program/token (and its ~50 transitive deps) for two ixs.
 *
 * Legacy SPL Token only — Token-2022 has different ix layouts. Confirmed
 * for our test mint (4oG4...NDx7) which is owned by TokenkegQ...
 */
import {
  AccountRole,
  type Address,
  address,
  getProgramDerivedAddress,
  type Instruction,
} from "@solana/kit";

import { addrBytes } from "./setup.js";

// Program IDs (devnet/mainnet identical for the two we use).
export const SPL_TOKEN_PROGRAM = address(
  "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA",
);
export const ATA_PROGRAM = address(
  "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL",
);
const SYSTEM_PROGRAM = address("11111111111111111111111111111111");

/** PDA: ATA address = [owner, token_program, mint] under ATA program. */
export async function deriveAta(args: {
  owner: Address;
  mint: Address;
  tokenProgram?: Address;
}): Promise<Address> {
  const tp = args.tokenProgram ?? SPL_TOKEN_PROGRAM;
  const [pda] = await getProgramDerivedAddress({
    programAddress: ATA_PROGRAM,
    seeds: [addrBytes(args.owner), addrBytes(tp), addrBytes(args.mint)],
  });
  return pda;
}

/**
 * `createIdempotent` ix — same as `create` but won't error if the ATA
 * already exists. Discriminator is `[1]`, accounts are positional:
 * [payer, ata, owner, mint, system, tokenProgram].
 */
export function buildCreateAtaIdempotent(args: {
  payer: Address;
  ata: Address;
  owner: Address;
  mint: Address;
  tokenProgram?: Address;
}): Instruction {
  const tp = args.tokenProgram ?? SPL_TOKEN_PROGRAM;
  return {
    programAddress: ATA_PROGRAM,
    accounts: [
      { address: args.payer, role: AccountRole.WRITABLE_SIGNER },
      { address: args.ata, role: AccountRole.WRITABLE },
      { address: args.owner, role: AccountRole.READONLY },
      { address: args.mint, role: AccountRole.READONLY },
      { address: SYSTEM_PROGRAM, role: AccountRole.READONLY },
      { address: tp, role: AccountRole.READONLY },
    ],
    data: new Uint8Array([1]),
  };
}

/**
 * Legacy SPL `Transfer` ix (instruction discriminator `3`, u64 LE amount).
 * Accounts: [source, destination, authority].
 *
 * Note: `TransferChecked` (disc `12`) would also work and adds decimal
 * validation, but it needs the mint account. Plain `Transfer` is fine for
 * the test fund-vault scenario since the authority signs.
 */
export function buildSplTransfer(args: {
  source: Address;
  destination: Address;
  authority: Address;
  amount: bigint;
}): Instruction {
  const data = new Uint8Array(9);
  data[0] = 3; // Transfer
  const view = new DataView(data.buffer);
  view.setBigUint64(1, args.amount, true);
  return {
    programAddress: SPL_TOKEN_PROGRAM,
    accounts: [
      { address: args.source, role: AccountRole.WRITABLE },
      { address: args.destination, role: AccountRole.WRITABLE },
      { address: args.authority, role: AccountRole.READONLY_SIGNER },
    ],
    data,
  };
}
