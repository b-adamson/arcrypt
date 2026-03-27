import { NextResponse } from "next/server";
import BN from "bn.js";
import { awaitComputationFinalization } from "@arcium-hq/client";
import { createReadOnlyProgram } from "../../lib/anchorClient";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { computationOffset } = body ?? {};

    if (typeof computationOffset === "undefined") {
      return NextResponse.json(
        { error: "computationOffset required" },
        { status: 400 }
      );
    }

    const programIdStr = process.env.NEXT_PUBLIC_PROGRAM_ID;
    const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL;

    if (!programIdStr || !rpcUrl) {
      return NextResponse.json(
        { error: "Missing NEXT_PUBLIC_PROGRAM_ID or NEXT_PUBLIC_RPC_URL" },
        { status: 500 }
      );
    }

    const program = await createReadOnlyProgram(rpcUrl, programIdStr);

    const offsetBn =
      BN.isBN(computationOffset)
        ? computationOffset
        : new BN(String(computationOffset));

    const finalizeSig = await awaitComputationFinalization(
      program.provider as any,
      offsetBn,
      program.programId,
      "confirmed"
    );

    return NextResponse.json({
      ok: true,
      finalizeSig,
      computationOffset: offsetBn.toString(),
    });
  } catch (err: any) {
    console.error("finalize route error:", err);
    return NextResponse.json(
      { error: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}