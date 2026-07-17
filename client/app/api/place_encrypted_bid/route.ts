import { NextResponse } from "next/server";
import { BN, AnchorProvider } from "@anchor-lang/core";
import crypto from "crypto";
import { PublicKey, Transaction } from "@solana/web3.js";
import {
  getMXEPublicKey,
  x25519,
  RescueCipher,
  deserializeLE,
  getMXEAccAddress,
  getClusterAccAddress,
  getMempoolAccAddress,
  getExecutingPoolAccAddress,
  getFeePoolAccAddress,
  getClockAccAddress,
  getCompDefAccOffset,
  getCompDefAccAddress,
  getComputationAccAddress,
  getArciumEnv,
} from "@arcium-hq/client";
import { createReadOnlyProgram } from "../../../lib/anchorClient";

const PAYMENT_MINT = new PublicKey("4oG4sjmopf5MzvTHLE8rpVJ2uyczxfsw2K84SUTpNDx7");
const PAYMENT_DECIMALS = 6;
const UMBRA_PROGRAM_ID = new PublicKey("DSuKkyqGVGgo4QtPABfxKJKygUDACbUhirnuv63mEpAJ");
const PERMISSIONLESS_ADDRESS = new PublicKey("UmbraPr1vacy1111111111111111111111111111111");
const ARCIUM_PROGRAM_ID = new PublicKey("Arcj82pX7HxYKLR92qvgZUAd7vGS1k4hQvAFcPATFdEQ");
const ZERO_U128 = Buffer.alloc(16, 0);

// Umbra V14 PDA seed prefixes — extracted from ts-umbra-codama
const ETA_SEED = Buffer.from([88, 246, 238, 102, 30, 119, 174, 223, 76, 239, 136, 176, 202, 120, 177, 11, 48, 67, 190, 35, 5, 219, 76, 155, 193, 2, 61, 126, 253, 142, 11, 153]);
const RECEIVER_USER_ACCOUNT_SEED = Buffer.from([238, 187, 82, 14, 65, 210, 89, 81, 200, 33, 148, 214, 254, 44, 85, 185, 87, 34, 232, 49, 142, 202, 28, 145, 26, 69, 88, 138, 177, 236, 249, 175]);
const TOKEN_POOL_SEED_BYTES = Buffer.from([61, 21, 254, 10, 117, 50, 210, 47, 122, 79, 232, 171, 118, 26, 22, 118, 205, 174, 242, 211, 17, 197, 198, 61, 164, 43, 231, 196, 167, 221, 63, 210]);
const PROTOCOL_CONFIG_SEED_BYTES = Buffer.from([159, 100, 53, 16, 217, 113, 43, 203, 167, 5, 163, 74, 88, 105, 189, 194, 208, 152, 173, 184, 208, 3, 163, 55, 229, 49, 254, 115, 201, 134, 96, 90]);

// V14 instruction seed: computeInstructionSeed("transfer_from_shared_balance_to_new_network_balance_v14")
const V14_IX_SEED = Buffer.from([245, 245, 9, 149, 51, 185, 168, 223, 63, 96, 141, 60, 235, 108, 167, 116]);
const COMPUTATION_DATA_SEED1 = Buffer.from([77, 63, 178, 140, 223, 81, 12, 114, 95, 67, 78, 49, 71, 158, 28, 226, 210, 113, 238, 212, 103, 27, 191, 226, 31, 39, 55, 168, 6, 119, 154, 73]);
const FEE_VAULT_SEED_BYTES = Buffer.from([179, 37, 45, 22, 96, 77, 187, 83, 214, 27, 136, 248, 186, 191, 16, 30, 30, 8, 127, 147, 114, 194, 122, 73, 33, 5, 236, 62, 239, 130, 207, 221]);
const DOMAIN_PROTOCOL_FEES = Buffer.from([3, 90, 193, 96, 232, 76, 253, 129, 5, 160, 193, 17, 1, 189, 78, 77, 218, 76, 91, 45, 152, 246, 251, 5, 111, 22, 232, 53, 164, 66, 26, 145]);
const FEE_SCHEDULE_SEED_BYTES = Buffer.from([219, 103, 184, 147, 198, 147, 112, 38, 55, 38, 235, 215, 80, 203, 76, 46, 100, 134, 54, 137, 90, 55, 236, 128, 221, 55, 222, 172, 164, 85, 109, 139]);
const FEE_SCHEDULE_DOMAIN = Buffer.from([58, 90, 149, 33, 133, 26, 242, 63, 222, 159, 200, 82, 75, 254, 83, 17, 44, 52, 196, 151, 11, 74, 48, 231, 75, 206, 10, 233, 130, 155, 98, 96]);

function findEtaPda(owner: PublicKey, mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([ETA_SEED, owner.toBuffer(), mint.toBuffer()], UMBRA_PROGRAM_ID)[0];
}
function findReceiverUserAccountPda(receiver: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([RECEIVER_USER_ACCOUNT_SEED, receiver.toBuffer()], UMBRA_PROGRAM_ID)[0];
}
function findTokenPoolPda(mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync([TOKEN_POOL_SEED_BYTES, mint.toBuffer()], UMBRA_PROGRAM_ID)[0];
}
function findProtocolConfigPda(): PublicKey {
  return PublicKey.findProgramAddressSync([PROTOCOL_CONFIG_SEED_BYTES], UMBRA_PROGRAM_ID)[0];
}
function findComputationDataPda(feePayer: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [COMPUTATION_DATA_SEED1, V14_IX_SEED, feePayer.toBuffer(), ZERO_U128],
    UMBRA_PROGRAM_ID
  )[0];
}
function findFeeVaultPda(mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [FEE_VAULT_SEED_BYTES, DOMAIN_PROTOCOL_FEES, V14_IX_SEED, mint.toBuffer(), ZERO_U128],
    UMBRA_PROGRAM_ID
  )[0];
}
function findFeeSchedulePda(mint: PublicKey): PublicKey {
  return PublicKey.findProgramAddressSync(
    [FEE_SCHEDULE_SEED_BYTES, FEE_SCHEDULE_DOMAIN, V14_IX_SEED, mint.toBuffer(), PERMISSIONLESS_ADDRESS.toBuffer()],
    UMBRA_PROGRAM_ID
  )[0];
}

function decimalToBaseUnitsBN(amount: string, decimals: number): BN {
  const s = amount.trim();
  if (!s) throw new Error("Enter an amount.");
  const [whole, frac = ""] = s.split(".");
  const fracPadded = (frac + "0".repeat(decimals)).slice(0, decimals);
  const wholeFactor = 10n ** BigInt(decimals);
  const baseUnits = BigInt(whole || "0") * wholeFactor + BigInt(fracPadded || "0");
  if (baseUnits <= 0n) throw new Error("Amount must be greater than 0.");
  return new BN(baseUnits.toString());
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { auctionPk, bidderPubkey, etaAddress, bidAmountUsdc, bidPriceUsdc, nonceHex } = body ?? {};

    if (!auctionPk || !bidderPubkey || !etaAddress || !bidAmountUsdc) {
      return NextResponse.json(
        { error: "auctionPk, bidderPubkey, etaAddress, and bidAmountUsdc are required" },
        { status: 400 }
      );
    }

    const programIdStr = process.env.PROGRAM_ID;
    const rpcUrl = process.env.RPC_URL;
    if (!programIdStr || !rpcUrl) {
      return NextResponse.json({ error: "Missing PROGRAM_ID or RPC_URL" }, { status: 500 });
    }

    const program = await createReadOnlyProgram(rpcUrl, programIdStr);
    const programId = new PublicKey(programIdStr);
    const bidderPk = new PublicKey(bidderPubkey);
    const auctionPkObj = new PublicKey(auctionPk);
    const etaPk = new PublicKey(etaAddress);

    // Arcium accounts — identical pattern to placeBid
    const arciumEnv = getArciumEnv();
    const mxePk = getMXEAccAddress(programId);
    const clusterPk = new PublicKey(getClusterAccAddress(arciumEnv.arciumClusterOffset));
    const mempoolPk = new PublicKey(getMempoolAccAddress(arciumEnv.arciumClusterOffset));
    const executingPoolPk = new PublicKey(getExecutingPoolAccAddress(arciumEnv.arciumClusterOffset));
    const poolPk = new PublicKey(getFeePoolAccAddress());
    const clockPk = new PublicKey(getClockAccAddress());

    const compDefOffset = Buffer.from(getCompDefAccOffset("deposit_encrypted_bid")).readUInt32LE(0);
    const compDefPk = getCompDefAccAddress(programId, compDefOffset);
    const computationOffset = new BN(crypto.randomBytes(8), "hex");
    const computationPk = getComputationAccAddress(arciumEnv.arciumClusterOffset, computationOffset);

    // Rescue cipher encryption — identical to SDK's createPlaceBid
    const mxePublicKey = await getMXEPublicKey(program.provider as AnchorProvider, programId);
    if (!mxePublicKey) throw new Error("MXE x25519 public key not set on-chain");

    const privateKey = x25519.utils.randomSecretKey();
    const bidderX25519Pub = x25519.getPublicKey(privateKey);
    const sharedSecret = x25519.getSharedSecret(privateKey, mxePublicKey);
    const cipher = new RescueCipher(sharedSecret);

    const bidderBytes = bidderPk.toBytes();
    const bidderLo = BigInt(new BN(Buffer.from(bidderBytes.slice(0, 16)), "le").toString());
    const bidderHi = BigInt(new BN(Buffer.from(bidderBytes.slice(16, 32)), "le").toString());
    const amount = BigInt(decimalToBaseUnitsBN(bidAmountUsdc, PAYMENT_DECIMALS).toString());

    const nonce =
      typeof nonceHex === "string" && nonceHex.length > 0
        ? Buffer.from(nonceHex.replace(/^0x/, ""), "hex")
        : crypto.randomBytes(16);

    const price = bidPriceUsdc
      ? BigInt(decimalToBaseUnitsBN(bidPriceUsdc, PAYMENT_DECIMALS).toString())
      : amount;

    const ciphertext = cipher.encrypt([bidderLo, bidderHi, amount, price], nonce);
    const nonceBN = new BN(deserializeLE(nonce).toString());

    // Arcrypt PDAs
    const signPda = PublicKey.findProgramAddressSync(
      [Buffer.from("ArciumSignerAccount")],
      programId
    )[0];
    const sharedVaultPda = PublicKey.findProgramAddressSync(
      [Buffer.from("shared-vault"), auctionPkObj.toBuffer()],
      programId
    )[0];
    const tempBidPda = PublicKey.findProgramAddressSync(
      [Buffer.from("pending-encrypted-bid"), auctionPkObj.toBuffer(), bidderPk.toBuffer()],
      programId
    )[0];

    // Umbra PDAs — sharedVault is the receiver
    const receiverTokenAccount = findEtaPda(sharedVaultPda, PAYMENT_MINT);
    const receiverUserAccount = findReceiverUserAccountPda(sharedVaultPda);
    const tokenPool = findTokenPoolPda(PAYMENT_MINT);
    const protocolConfig = findProtocolConfigPda();
    const computationData = findComputationDataPda(bidderPk);
    const feeVault = findFeeVaultPda(PAYMENT_MINT);
    const feeSchedule = findFeeSchedulePda(PAYMENT_MINT);

    const ix = await (program.methods as any)
      .depositEncryptedBid(
        computationOffset,
        Array.from(ciphertext[2]),  // encrypted_amount
        Array.from(ciphertext[3])   // encrypted_price
      )
      .accounts({
        bidder: bidderPk,
        auction: auctionPkObj,
        sharedVault: sharedVaultPda,
        tempBid: tempBidPda,
        signPdaAccount: signPda,
        mxeAccount: new PublicKey(mxePk),
        mempoolAccount: mempoolPk,
        executingPool: executingPoolPk,
        computationAccount: computationPk,
        compDefAccount: compDefPk,
        clusterAccount: clusterPk,
        poolAccount: poolPk,
        clockAccount: clockPk,
        systemProgram: new PublicKey("11111111111111111111111111111111"),
        arciumProgram: ARCIUM_PROGRAM_ID,
        umbraProgram: UMBRA_PROGRAM_ID,
        senderTokenAccount: etaPk,
        umbraContextAccount: etaPk,
        umbraPersistenceAccount: computationData,
        receiverAddress: sharedVaultPda,
        receiverTokenAccount,
        receiverUserAccount,
        feeSchedule,
        feeVault,
        tokenPool,
        mint: PAYMENT_MINT,
        protocolConfig,
        computationData,
      })
      .instruction();

    const tx = new Transaction().add(ix);
    tx.feePayer = bidderPk;
    tx.recentBlockhash = (await program.provider.connection.getLatestBlockhash()).blockhash;

    return NextResponse.json({
      txBase64: Buffer.from(tx.serialize({ requireAllSignatures: false })).toString("base64"),
      tempBidPda: tempBidPda.toBase58(),
      debug: {
        sharedVaultPda: sharedVaultPda.toBase58(),
        receiverTokenAccount: receiverTokenAccount.toBase58(),
        receiverUserAccount: receiverUserAccount.toBase58(),
        tokenPool: tokenPool.toBase58(),
        protocolConfig: protocolConfig.toBase58(),
        feeVault: feeVault.toBase58(),
        feeSchedule: feeSchedule.toBase58(),
        computationData: computationData.toBase58(),
        enc_amt: Array.from(ciphertext[2]),
        enc_price: Array.from(ciphertext[3]),
        bidderX25519Pub: Array.from(bidderX25519Pub),
        nonceBN: nonceBN.toString(10),
      },
    });
  } catch (err: any) {
    console.error("place_encrypted_bid error:", err);
    return NextResponse.json({ error: err?.message ?? String(err) }, { status: 500 });
  }
}
