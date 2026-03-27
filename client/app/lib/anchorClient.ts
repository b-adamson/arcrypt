// src/lib/anchorClient.ts
import * as anchor from "@coral-xyz/anchor";
import { PublicKey, Connection } from "@solana/web3.js";

export async function loadIdlFromPublic(): Promise<anchor.Idl> {
  // Browser runtime -> use relative fetch
  if (typeof window !== "undefined") {
    const resp = await fetch("/idl/sealed_bid_auction.json", { cache: "no-store" });
    if (!resp.ok) throw new Error("Could not load IDL from /idl/sealed_bid_auction.json (browser)");
    return resp.json();
  }

  // Server runtime -> read from filesystem (public/idl/sealed_bid_auction.json)
  // Use process.cwd() so it works in dev and most deploys
  try {
    const idlPath = path.join(process.cwd(), "public", "idl", "sealed_bid_auction.json");
    const raw = await fs.promises.readFile(idlPath, { encoding: "utf8" });
    return JSON.parse(raw);
  } catch (err: any) {
    // As a last resort, try requiring a bundled IDL (if you placed it under src/idl)
    try {
      // adjust path if you have it somewhere else
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const idl = require("../../public/idl/sealed_bid_auction.json");
      return idl;
    } catch (err2) {
      console.error("Failed to load IDL from fs and fallback require:", err, err2);
      throw new Error("Could not load IDL on server. Ensure public/idl/sealed_bid_auction.json exists and is readable.");
    }
  }
}

/**
 * Create an Anchor-compatible wallet object from a wallet-adapter instance.
 * This is intentionally tiny and tolerant: Anchor only requires
 * { publicKey, signTransaction, signAllTransactions }.
 *
 * Note: We do NOT replace your WalletProvider or adapters — this function
 * only adapts the existing adapter instance (from useWallet()) to Anchor's API.
 */

function makeAnchorWalletFromAdapter(walletAdapter: any) {
  if (!walletAdapter) return null;

  // Some wrappers place the real adapter under `.adapter`
  const rawAdapter = walletAdapter.adapter ?? walletAdapter;

  // Prefer walletAdapter.publicKey (useful for useWallet hook), fallback to adapter.publicKey
  const maybePk = walletAdapter.publicKey ?? rawAdapter.publicKey ?? null;

  // Normalize into a real PublicKey or null
  let publicKey = null;
  if (maybePk) {
    try {
      if (maybePk instanceof PublicKey) {
        publicKey = maybePk;
      } else if (typeof maybePk.toBase58 === "function") {
        publicKey = new PublicKey(maybePk.toBase58());
      } else if (typeof maybePk === "string") {
        publicKey = new PublicKey(maybePk);
      }
    } catch (e) {
      console.debug("Could not normalize adapter public key:", e);
      publicKey = null;
    }
  }

  const signTransaction =
    typeof walletAdapter.signTransaction === "function"
      ? walletAdapter.signTransaction.bind(walletAdapter)
      : typeof rawAdapter.signTransaction === "function"
      ? rawAdapter.signTransaction.bind(rawAdapter)
      : async (tx: any) => tx;

  const signAllTransactions =
    typeof walletAdapter.signAllTransactions === "function"
      ? walletAdapter.signAllTransactions.bind(walletAdapter)
      : typeof rawAdapter.signAllTransactions === "function"
      ? rawAdapter.signAllTransactions.bind(rawAdapter)
      : async (txs: any[]) => txs;

  return {
    publicKey,
    signTransaction,
    signAllTransactions,
  };
}


/**
 * Create a wallet-backed Anchor Program (provider) using the user's wallet adapter.
 * - walletAdapter: the `wallet` returned by useWallet()
 * - programIdStr (optional): explicit program id (string). If omitted, we'll rely on the IDL metadata address.
 * - rpcUrl (optional): cluster RPC URL
 */
export async function createAnchorProgramInBrowser(
  walletAdapter: any,
  programIdStr?: string,
  rpcUrl?: string
): Promise<{ program: anchor.Program; provider: anchor.AnchorProvider }> {
  if (!walletAdapter) throw new Error("wallet adapter required (from useWallet())");

  const idl = await loadIdlFromPublic();
  const rpc = rpcUrl ?? process.env.NEXT_PUBLIC_RPC_URL ?? "https://api.devnet.solana.com";
  const connection = new Connection(rpc, "confirmed");

  console.debug("[anchorClient] walletAdapter (raw):", walletAdapter);
  const anchorWallet = makeAnchorWalletFromAdapter(walletAdapter);
  console.debug("[anchorClient] anchorWallet (adapted):", anchorWallet);

  if (!anchorWallet) throw new Error("Could not adapt wallet for Anchor");

  const defaultOpts = (anchor as any).AnchorProvider?.defaultOptions
    ? (anchor as any).AnchorProvider.defaultOptions()
    : undefined;

  const provider = defaultOpts
    ? new (anchor as any).AnchorProvider(connection, anchorWallet as any, defaultOpts)
    : new (anchor as any).AnchorProvider(connection, anchorWallet as any);

  // shim convenience fields for older Anchor internals
  (provider as any).publicKey = anchorWallet.publicKey ?? null;
  (provider as any).wallet = anchorWallet;

  // expose to window for quick interactive debugging in devtools
  try {
    (window as any).__ANCHOR_PROVIDER__ = provider;
    (window as any).__ANCHOR_WALLET__ = anchorWallet;
    (window as any).__ANCHOR_IDL__ = idl;
  } catch {}

  console.debug("[anchorClient] provider created:", {
    providerPublicKey: (provider as any).publicKey,
    hasSignTx: typeof anchorWallet?.signTransaction === "function",
    hasSignAll: typeof anchorWallet?.signAllTransactions === "function",
    providerOpts: (provider as any).opts ?? null,
  });

  // try provider-only constructor first (preferred)
  try {
    const program = new (anchor as any).Program(idl, provider);
    console.debug("[anchorClient] Program(idl, provider) succeeded, programId:", program.programId?.toString?.());
    // Also attach program for debugging
    try { (window as any).__ANCHOR_PROGRAM__ = program; } catch {}
    return { program, provider };
  } catch (err: any) {
    console.error("[anchorClient] Program(idl, provider) failed:", err);
  }

  // fallback 3-arg: log and throw meaningful message if fails
  try {
    const effectiveProgramIdStr =
      programIdStr ?? (idl as any)?.metadata?.address ?? process.env.NEXT_PUBLIC_PROGRAM_ID;
    if (!effectiveProgramIdStr) throw new Error("No program id available for fallback constructor");
    const programId = new PublicKey(effectiveProgramIdStr);
    const program = new (anchor as any).Program(idl, programId, provider);
    console.debug("[anchorClient] Program(idl, programId, provider) succeeded, programId:", program.programId?.toString?.());
    try { (window as any).__ANCHOR_PROGRAM__ = program; } catch {}
    return { program, provider };
  } catch (err2: any) {
    console.error("[anchorClient] Program(idl, programId, provider) fallback failed:", err2);
    const msg = `Failed to construct Anchor Program.\n` +
      `Provider shape: ${JSON.stringify({
        providerPublicKey: (provider as any).publicKey?.toString?.() ?? (provider as any).publicKey,
        anchorWalletPublicKey: anchorWallet?.publicKey?.toString?.() ?? anchorWallet?.publicKey,
        hasSignTx: typeof anchorWallet?.signTransaction === "function",
        hasSignAll: typeof anchorWallet?.signAllTransactions === "function",
      })}\n` +
      `Error: ${err2?.message ?? err2}`;
    throw new Error(msg);
  }
}


/**
 * Create a read-only program instance (no wallet required).
 * Useful for listing accounts when the user hasn't connected a wallet.
 * - rpcUrl optional, programIdStr optional
 */
export async function createReadOnlyProgram(rpcUrl?: string, programIdStr?: string): Promise<anchor.Program> {
  const idl = await loadIdlFromPublic();
  const rpc = rpcUrl ?? process.env.NEXT_PUBLIC_RPC_URL ?? "https://api.devnet.solana.com";
  const connection = new Connection(rpc, "confirmed");

  const dummyWallet: any = {
    publicKey: null,
    signTransaction: async (tx: any) => tx,
    signAllTransactions: async (txs: any[]) => txs,
  };

  const defaultOpts = (anchor as any).AnchorProvider?.defaultOptions
    ? (anchor as any).AnchorProvider.defaultOptions()
    : undefined;

  const provider = defaultOpts
    ? new (anchor as any).AnchorProvider(connection, dummyWallet, defaultOpts)
    : new (anchor as any).AnchorProvider(connection, dummyWallet);

  // attach shim too (publicKey null is fine)
  (provider as any).publicKey = null;
  (provider as any).wallet = dummyWallet;

  try { anchor.setProvider(provider); } catch (e) { console.debug("anchor.setProvider read-only non-fatal:", e); }

  try {
    const program = new (anchor as any).Program(idl, provider);
    return program;
  } catch (err: any) {
    console.debug("Read-only Program(idl, provider) failed:", err);
  }

  const effectiveProgramIdStr = programIdStr ?? (idl as any)?.metadata?.address ?? process.env.NEXT_PUBLIC_PROGRAM_ID;
  if (!effectiveProgramIdStr) throw new Error("Program ID not available for read-only fallback");
  const programId = new PublicKey(effectiveProgramIdStr);
  const program = new (anchor as any).Program(idl, programId, provider);
  return program;
}

export function assertProviderReady(program: any) {
  if (!program) {
    throw new Error("Anchor Program client is undefined — make sure it was created successfully.");
  }

  const provider = program.provider ?? (program as any)._provider;
  if (!provider) {
    throw new Error(
      "Program has no provider — make sure you created it with createAnchorProgramInBrowser()."
    );
  }

  const pk =
    provider.publicKey ??
    provider.wallet?.publicKey ??
    (provider.wallet && provider.wallet.publicKey === null ? null : undefined);

  if (!pk) {
    console.error("Provider object:", provider);
    throw new Error(
      "Provider.publicKey missing — your wallet adapter may not be connected or not correctly passed to Anchor. " +
        "Ensure you connected your wallet and created the program via createAnchorProgramInBrowser(wallet)."
    );
  }
}