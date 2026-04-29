import { NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";

import {
  Raydium,
  TxVersion,
  DEVNET_PROGRAM_ID,
} from "@raydium-io/raydium-sdk-v2";

import BN from "bn.js";

const RPC_URL =
  process.env.RPC_URL || "https://api.devnet.solana.com";

export async function POST(req: Request) {
  try {
    const body = await req.json();

    const { owner, tokenMint, wsolAmount, tokenAmount } = body;

    console.log("📥 INPUT:", body);

    if (!owner || !tokenMint) {
      return NextResponse.json(
        { error: "Missing params" },
        { status: 400 }
      );
    }

    const connection = new Connection(RPC_URL, "confirmed");

    const ownerPk = new PublicKey(owner);
    const mintPk = new PublicKey(tokenMint);

    const WSOL_MINT = new PublicKey(
      "So11111111111111111111111111111111111111112"
    );

    // -----------------------------
    // LOAD RAYDIUM SDK
    // -----------------------------
    const raydium = await Raydium.load({
      connection,
      owner: ownerPk,
      cluster: "devnet",
    });

    console.log("✅ Raydium loaded");

    // -----------------------------
    // FETCH TOKEN DECIMALS
    // -----------------------------
    const mintInfo = await connection.getParsedAccountInfo(mintPk);

    const decimals =
      (mintInfo.value?.data as any)?.parsed?.info?.decimals ?? 6;

    console.log("📊 decimals:", decimals);

    // -----------------------------
    // ⚠️ CRITICAL: RAW AMOUNTS (NO FLOATS)
    // -----------------------------
    const baseAmount = new BN(tokenAmount); // already human units
    const quoteAmount = new BN(wsolAmount); // already lamports

    console.log("💰 baseAmount:", baseAmount.toString());
    console.log("💰 quoteAmount:", quoteAmount.toString());

    // -----------------------------
    // STEP 1: CREATE OPENBOOK MARKET
    // -----------------------------
    console.log("🏗 Creating OpenBook market...");

    const marketRes = await raydium.marketV2.create({
      baseInfo: {
        mint: mintPk,
        decimals,
      },
      quoteInfo: {
        mint: WSOL_MINT,
        decimals: 9,
      },
      lotSize: 1,
      tickSize: 0.0001,

      dexProgramId: DEVNET_PROGRAM_ID.OPEN_BOOK_PROGRAM,

      txVersion: TxVersion.V0,
    });

    const marketTxs = marketRes.transactions;

    console.log("📦 market tx count:", marketTxs.length);

    const marketId =
      marketRes.extInfo.address.marketId;

    console.log("🧾 marketId:", marketId.toBase58());

    // -----------------------------
    // STEP 2: CREATE AMM POOL
    // -----------------------------
    console.log("🏊 Creating AMM pool...");

    const poolRes = await raydium.liquidity.createPoolV4({
      programId: DEVNET_PROGRAM_ID.AMM_V4,

      marketInfo: {
        marketId,
        programId: DEVNET_PROGRAM_ID.OPEN_BOOK_PROGRAM,
      },

      baseMintInfo: {
        mint: mintPk,
        decimals,
      },

      quoteMintInfo: {
        mint: WSOL_MINT,
        decimals: 9,
      },

      baseAmount,
      quoteAmount,

      startTime: new BN(0),

      ownerInfo: {
        feePayer: ownerPk,
        useSOLBalance: true,
      },

      associatedOnly: false,
      txVersion: TxVersion.V0,
      feeDestinationId: DEVNET_PROGRAM_ID.FEE_DESTINATION_ID,
    });

    // -----------------------------
    // 🚨 FIX: NORMALIZE TX FORMAT
    // -----------------------------
    const poolTxs = Array.isArray(poolRes.transaction)
      ? poolRes.transaction
      : [poolRes.transaction];

    console.log("📦 pool tx count:", poolTxs.length);

    // -----------------------------
    // MERGE TXS
    // -----------------------------
    const allTxs = [...marketTxs, ...poolTxs];

    console.log("📦 total tx count:", allTxs.length);

    // -----------------------------
    // SERIALIZE
    // -----------------------------
    const serialized = allTxs.map((tx: any) =>
      Buffer.from(
        tx.serialize({ requireAllSignatures: false })
      ).toString("base64")
    );

    console.log("✅ SUCCESS");

    return NextResponse.json({
      txs: serialized,
    });
  } catch (err: any) {
    console.error("❌ createRaydiumPool error:", err);

    return NextResponse.json(
      { error: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}