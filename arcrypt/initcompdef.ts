// initcompdef.ts
// Minimal, explicit init script for 4 compdefs (no LUT).
// Usage:
//   export OWNER_KEYPAIR_PATH="/home/beada/.config/solana/id.json"
//   export ARCIUM_CLUSTER_OFFSET=456
//   export SOLANA_RPC_URL="https://devnet.helius-rpc.com/?api-key=..."
//   ts-node initcompdef.ts

import fs from "fs";
import path from "path";
import os from "os";
import * as anchor from "@coral-xyz/anchor";
import { PublicKey, SystemProgram } from "@solana/web3.js";
import dotenv from "dotenv";
import { Buffer } from "buffer";

import {
  getClusterAccAddress,
  getMXEAccAddress,
  getCompDefAccAddress,
  getCompDefAccOffset,
  getArciumProgram,
  getLookupTableAddress,
} from "@arcium-hq/client";

dotenv.config({ path: path.resolve(process.cwd(), ".env") });

const OWNER_KEYPAIR_PATH =
  (process.env.OWNER_KEYPAIR_PATH ?? path.join(os.homedir(), ".config", "solana", "id.json")).replace(/^['"]|['"]$/g, "");
const CLUSTER_OFFSET = process.env.ARCIUM_CLUSTER_OFFSET !== undefined ? Number(process.env.ARCIUM_CLUSTER_OFFSET) : null;
const SOLANA_RPC_URL = (process.env.SOLANA_RPC_URL ?? "http://127.0.0.1:8899").replace(/^['"]|['"]$/g, "");

async function loadKeypair(): Promise<anchor.web3.Keypair> {
  const keyPath = OWNER_KEYPAIR_PATH.startsWith("~")
    ? path.join(os.homedir(), OWNER_KEYPAIR_PATH.slice(1))
    : OWNER_KEYPAIR_PATH;
  if (!fs.existsSync(keyPath)) throw new Error(`Owner keypair not found: ${keyPath}`);
  const raw = JSON.parse(fs.readFileSync(keyPath, "utf8")) as number[];
  if (!Array.isArray(raw) || raw.length < 32) throw new Error("Bad keypair JSON");
  return anchor.web3.Keypair.fromSecretKey(Uint8Array.from(raw));
}

async function printTxLogs(sig: string, conn: anchor.web3.Connection) {
  for (let i = 0; i < 30; i++) {
    const tx = await conn.getTransaction(sig, { commitment: "confirmed" });
    if (tx) {
      console.log("\n=== Transaction fetched ===");
      console.log("slot:", tx.slot);
      console.log("status err:", tx.meta?.err ?? null);
      console.log("\n=== logMessages ===");
      (tx.meta?.logMessages ?? []).forEach((l) => console.log(l));
      return;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  console.warn("Could not fetch transaction details for", sig);
}

async function deriveCompDefPda(programId: PublicKey, compName: string) {
  const offBuf = getCompDefAccOffset(compName);
  const offNum = Buffer.from(offBuf).readUInt32LE(0);
  const compDefRaw = await getCompDefAccAddress(programId, offNum);
  return new PublicKey(compDefRaw);
}

async function callInitMethod(
  localProgram: anchor.Program,
  methodName: string,
  accounts: Record<string, any>,
  owner: anchor.web3.Keypair,
  conn: anchor.web3.Connection
) {
  const methods: any = (localProgram as any).methods ?? {};
  const fn = methods[methodName];
  if (!fn) {
    throw new Error(`Method "${methodName}" not found in IDL. Available: ${Object.keys(methods).join(", ")}`);
  }
  console.log(`Calling ${methodName} -> comp_def: ${accounts.compDefAccount.toBase58()}`);
  try {
    const sig: string = await fn().accounts(accounts).signers([owner]).rpc({ commitment: "confirmed" });
    console.log(`${methodName} txSig:`, sig);
    await printTxLogs(sig, conn);
  } catch (e: any) {
    const logs: string[] = e?.transactionLogs ?? e?.logs ?? [];
    const joined = logs.join("\n");
    if (joined.includes("Allocate: account") && joined.includes("already in use")) {
      console.log(`${methodName}: comp_def account already allocated — skipping init.`);
      return;
    }
    console.error(`${methodName} failed:`, e?.message ?? e);
    if (logs.length) {
      console.log("\n--- error.logs ---");
      logs.forEach((l) => console.log(l));
    }
    throw e;
  }
}

async function main() {
  console.log("\n=== initcompdef.ts ===\n");
  const owner = await loadKeypair();
  console.log("Owner:", owner.publicKey.toBase58());
  console.log("RPC:", SOLANA_RPC_URL);
  console.log("ARCIUM_CLUSTER_OFFSET:", CLUSTER_OFFSET);

  const conn = new anchor.web3.Connection(SOLANA_RPC_URL, { commitment: "confirmed" });
  const provider = new anchor.AnchorProvider(conn, new anchor.Wallet(owner), { commitment: "confirmed" });
  anchor.setProvider(provider);

  // Load local IDL (must exist)
  const idlPath = path.resolve(process.cwd(), "target", "idl", "sealed_bid_auction.json");
  if (!fs.existsSync(idlPath)) throw new Error(`IDL not found at ${idlPath}`);
  const localIdl = JSON.parse(fs.readFileSync(idlPath, "utf8"));

  // Construct local program the same way your environment expects (idl + provider)
  const localProgram = new anchor.Program(localIdl as anchor.Idl, provider);
  console.log("Bound local program:", localProgram.programId.toBase58());

  // If IDL.address differs from bound programId, warn (but continue)
  try {
    const idlAddr = (localIdl as any).address ?? (localIdl as any)?.metadata?.address;
    if (idlAddr && new PublicKey(idlAddr).toBase58() !== localProgram.programId.toBase58()) {
      console.warn(`Warning: IDL.address (${idlAddr}) does not match bound programId (${localProgram.programId.toBase58()}).`);
    }
  } catch {
    /* ignore */
  }

  // arcium runtime program
  const arciumProgram = await getArciumProgram(provider as anchor.AnchorProvider);
  console.log("Arcium runtime program id:", arciumProgram.programId.toBase58());

  // derived addresses
  const clusterRaw = await getClusterAccAddress(CLUSTER_OFFSET);
  const cluster = new PublicKey(clusterRaw);

  // Determine mxeProgramId to use for PDAs: prefer IDL.address if present, else use localProgram.programId
  const mxeProgramId = ((localIdl as any).address ? new PublicKey((localIdl as any).address) : localProgram.programId) as PublicKey;
  console.log("Using mxeProgramId for PDAs:", mxeProgramId.toBase58());

  const mxeRaw = await getMXEAccAddress(mxeProgramId);
  const mxe = new PublicKey(mxeRaw);

  // ensure caller is MXE authority
  const mxeAcc = await arciumProgram.account.mxeAccount.fetch(mxeRaw);
  const lutAddress = getLookupTableAddress(mxeProgramId, mxeAcc.lutOffsetSlot)
  const mxeAuthority = new PublicKey(mxeAcc.authority);
  if (!mxeAuthority.equals(owner.publicKey)) {
    throw new Error(
      `MXE authority mismatch: MXE.authority=${mxeAuthority.toBase58()} but current signer is ${owner.publicKey.toBase58()}. ` +
        `Use the MXE deploy key as OWNER_KEYPAIR_PATH or redeploy MXE with your key.`
    );
  }
  console.log("Signer matches MXE authority.");

  console.log("\n--- derived addresses ---");
  console.log("cluster_account:", cluster.toBase58());
  console.log("mxe_account:", mxe.toBase58());

  // 1) init_auction_state
  const compDefInitAuction = await deriveCompDefPda(mxeProgramId, "init_auction_state");
  await callInitMethod(
    localProgram,
    "initAuctionStateCompDef",
    {
      payer: owner.publicKey,
      mxeAccount: mxe,
      compDefAccount: compDefInitAuction,
      arciumProgram: arciumProgram.programId,
      systemProgram: SystemProgram.programId,
      addressLookupTable: lutAddress,
    },
    owner,
    conn
  );

  // 2) place_bid
  const compDefPlaceBid = await deriveCompDefPda(mxeProgramId, "place_bid");
  await callInitMethod(
    localProgram,
    "initPlaceBidCompDef",
    {
      payer: owner.publicKey,
      mxeAccount: mxe,
      compDefAccount: compDefPlaceBid,
      arciumProgram: arciumProgram.programId,
      systemProgram: SystemProgram.programId,
      addressLookupTable: lutAddress,
    },
    owner,
    conn
  );

  // 3) determine_winner_first_price
  const compDefDetermineFirst = await deriveCompDefPda(mxeProgramId, "determine_winner_first_price");
  await callInitMethod(
    localProgram,
    "initDetermineWinnerFirstPriceCompDef",
    {
      payer: owner.publicKey,
      mxeAccount: mxe,
      compDefAccount: compDefDetermineFirst,
      arciumProgram: arciumProgram.programId,
      systemProgram: SystemProgram.programId,
      addressLookupTable: lutAddress,
    },
    owner,
    conn
  );

  // 4) determine_winner_vickrey
  const compDefDetermineVickrey = await deriveCompDefPda(mxeProgramId, "determine_winner_vickrey");
  await callInitMethod(
    localProgram,
    "initDetermineWinnerVickreyCompDef",
    {
      payer: owner.publicKey,
      mxeAccount: mxe,
      compDefAccount: compDefDetermineVickrey,
      arciumProgram: arciumProgram.programId,
      systemProgram: SystemProgram.programId,
      addressLookupTable: lutAddress,
    },
    owner,
    conn
  );

    // 5) determine_winner_uniform
  const compDefDetermineUniform = await deriveCompDefPda(mxeProgramId, "determine_winner_uniform");
  await callInitMethod(
    localProgram,
    "initDetermineWinnerUniformCompDef",
    {
      payer: owner.publicKey,
      mxeAccount: mxe,
      compDefAccount: compDefDetermineUniform,
      arciumProgram: arciumProgram.programId,
      systemProgram: SystemProgram.programId,
      addressLookupTable: lutAddress,
    },
    owner,
    conn
  );

  // 6) determine_winner_pro_rata
  const compDefDetermineProRata = await deriveCompDefPda(mxeProgramId, "determine_winner_pro_rata");
  await callInitMethod(
    localProgram,
    "initDetermineWinnerProRataCompDef",
    {
      payer: owner.publicKey,
      mxeAccount: mxe,
      compDefAccount: compDefDetermineProRata,
      arciumProgram: arciumProgram.programId,
      systemProgram: SystemProgram.programId,
      addressLookupTable: lutAddress,
    },
    owner,
    conn
  );

  console.log("\nAll explicit init calls completed.");
  
}

main().catch((err) => {
  console.error("Unhandled error:", err?.message ?? err);
  process.exit(1);
});
