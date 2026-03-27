// // app/api/determineWinner/route.ts
// import { NextResponse } from "next/server";
// import { PublicKey } from "@solana/web3.js";
// import BN from "bn.js";
// import crypto from "crypto";

// import {
//   getMXEAccAddress,
//   getClusterAccAddress,
//   getMempoolAccAddress,
//   getExecutingPoolAccAddress,
//   getFeePoolAccAddress,
//   getClockAccAddress,
//   getCompDefAccOffset,
//   getCompDefAccAddress,
//   getComputationAccAddress,
//   getArciumProgram,
// } from "@arcium-hq/client";

// import { createReadOnlyProgram } from "../../lib/anchorClient";

// const clusterOffset = Number(process.env.CLUSTER_OFFSET || 0);

// /**
//  * POST body:
//  * {
//  *   auctionPk: "<base58>",
//  *   which: "first" | "vickrey",
//  *   authority?: "<base58>"    // optional, only used for verifying/derive; not required
//  * }
//  *
//  * Response JSON (successful):
//  * {
//  *   compDefOffsetNum: number,
//  *   compDefPk: string,
//  *   computationOffset: string, // decimal string
//  *   computationPk: string,
//  *   mxePk: string,
//  *   clusterPk, mempoolPk, executingPoolPk, poolPk, clockPk,
//  *   signPda: string
//  * }
//  */
// export async function POST(req: Request) {
//   try {
//     const body = await req.json();
//     const { auctionPk, which } = body ?? {};

// const validWhich = ["first", "vickrey", "uniform", "proRata"] as const;

// if (!auctionPk || !validWhich.includes(which)) {
//   return NextResponse.json(
//     { error: "auctionPk and which ('first'|'vickrey'|'uniform'|'proRata') are required" },
//     { status: 400 }
//   );
// }

//     const programIdStr = process.env.NEXT_PUBLIC_PROGRAM_ID;
//     const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL;
//     if (!programIdStr || !rpcUrl) {
//       return NextResponse.json({ error: "Missing NEXT_PUBLIC_PROGRAM_ID or NEXT_PUBLIC_RPC_URL" }, { status: 500 });
//     }
//     const arcProgId = new PublicKey(programIdStr);

//     // createReadOnlyProgram ensures RPC/IDL are valid
//     const program = await createReadOnlyProgram(rpcUrl, programIdStr);
//     const provider = (program as any).provider;

//     // Resolve Arcium program (used to derive sign PDA)
//     const arciumProgram = await getArciumProgram(provider);
//     if (!arciumProgram) {
//       return NextResponse.json({ error: "Could not resolve Arcium program from provider" }, { status: 500 });
//     }
//     const arciumProgramId = arciumProgram.programId;

//     // MXE & Arcium PDAs (using the sealed-auction program id as the "mxeProgramId")
//     const mxePk = getMXEAccAddress(arcProgId);

//     const clusterPk = new PublicKey(getClusterAccAddress(clusterOffset));
//     const mempoolPk = new PublicKey(getMempoolAccAddress(clusterOffset));
//     const execpoolPk = new PublicKey(getExecutingPoolAccAddress(clusterOffset));
//     const poolPk = new PublicKey(getFeePoolAccAddress());
//     const clockPk = new PublicKey(getClockAccAddress());

//     // choose comp def name based on which param
//     const compDefName =
//   which === "first"
//     ? "determine_winner_first_price"
//     : which === "vickrey"
//     ? "determine_winner_vickrey"
//     : which === "uniform"
//     ? "determine_winner_uniform"
//     : "determine_winner_pro_rata";
//     const compDefOffsetBuf = Buffer.from(getCompDefAccOffset(compDefName));
//     const compDefOffsetNum = compDefOffsetBuf.readUInt32LE(0);
//     const compDefPk = getCompDefAccAddress(arcProgId, compDefOffsetNum);

//     // computation offset (random 8 bytes, little-endian)
//     const rand = crypto.randomBytes(8);
//     const computationOffset = new BN(rand.toString("hex"), 16, "le");
//     const computationPk = getComputationAccAddress(clusterOffset, computationOffset);

//     // sign PDA must be derived under Arcium program id
//     const signPda = PublicKey.findProgramAddressSync([Buffer.from("ArciumSignerAccount")], arciumProgramId)[0];

//     return NextResponse.json({
//       compDefOffsetNum,
//       compDefPk: compDefPk.toBase58(),
//       computationOffset: computationOffset.toString(),
//       computationPk: computationPk?.toBase58() ?? null,
//       mxePk: mxePk.toBase58(),
//       clusterPk: clusterPk.toBase58(),
//       mempoolPk: mempoolPk.toBase58(),
//       executingPoolPk: execpoolPk.toBase58(),
//       poolPk: poolPk.toBase58(),
//       clockPk: clockPk.toBase58(),
//       signPda: signPda.toBase58(),
//     });
//   } catch (err: any) {
//     console.error("determineWinner route error:", err);
//     return NextResponse.json({ error: err?.message ?? String(err) }, { status: 500 });
//   }
// }