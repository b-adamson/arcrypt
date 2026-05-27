// lib/useUmbraClient.ts
"use client";

import { useEffect, useMemo, useState } from "react";
import { useWallet } from "@solana/wallet-adapter-react";
import { Connection, Transaction, VersionedTransaction } from "@solana/web3.js";
import { install } from "@solana/webcrypto-ed25519-polyfill";
import * as nobleEd25519 from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha2.js";
import { getUmbraClient } from "@umbra-privacy/sdk";
import {
  getATAIntoETADirectDepositorFunction,
} from "@umbra-privacy/sdk/deposit";
import {
  getETAIntoATAWithdrawerFunction,
} from "@umbra-privacy/sdk/withdrawal";
import { address as toAddress, getTransactionDecoder, getTransactionEncoder } from "@solana/kit";

install();
nobleEd25519.hashes.sha512 = sha512;

const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL ?? "https://api.devnet.solana.com";
const rpcSubscriptionsUrl =
  process.env.NEXT_PUBLIC_RPC_WS_URL ??
  rpcUrl.replace(/^https:/, "wss:").replace(/^http:/, "ws:");

const txEncoder = getTransactionEncoder();
const txDecoder = getTransactionDecoder();

function createSkipPreflightForwarder(rpcEndpoint: string) {
  const conn = new Connection(rpcEndpoint, "confirmed");

  return {
    forwardSequentially: async (txs: readonly any[]) => {
      for (const tx of txs) {
        const wire = new Uint8Array(txEncoder.encode(tx));
        const sig = await conn.sendRawTransaction(wire, {
          skipPreflight: true,
          maxRetries: 0,
        });
        await conn.confirmTransaction(sig, "confirmed");
      }
      return txs.map(() => ({ signedTransaction: new Uint8Array() }));
    },
  } as any;
}

function createWalletAdapterSigner(wallet: any) {
  const toWalletTx = (tx: any) => {
    const wire = new Uint8Array(txEncoder.encode(tx));
    try {
      return VersionedTransaction.deserialize(wire);
    } catch {
      return Transaction.from(wire);
    }
  };

  return {
    address: toAddress(wallet.publicKey.toBase58()),

    signMessage: async (msg: Uint8Array) => {
      const sig = await wallet.signMessage!(msg);
      return {
        address: toAddress(wallet.publicKey.toBase58()),
        message: msg,
        signature: sig,
      };
    },

    signTransaction: async (tx: any) => {
      const signed = await wallet.signTransaction!(toWalletTx(tx));
      const decoded = txDecoder.decode(signed.serialize());
      return {
        ...decoded,
        signatures: {
          ...(decoded.signatures ?? {}),
          [wallet.publicKey.toBase58()]: signed.signatures[0],
        },
      } as any;
    },

    signTransactions: async (txs: readonly any[]) => {
      const out: any[] = [];
      for (const tx of txs) {
        out.push(await (await createWalletAdapterSigner(wallet)).signTransaction(tx));
      }
      return out;
    },
  } as any;
}

export function useUmbraClient() {
  const wallet = useWallet();
  const [client, setClient] = useState<any | null>(null);

  const signer = useMemo(() => {
    if (!wallet.connected || !wallet.publicKey) return null;
    return createWalletAdapterSigner(wallet);
  }, [wallet.connected, wallet.publicKey]);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      try {
        if (!signer) {
          setClient(null);
          return;
        }

const nextClient = await getUmbraClient(
  {
    signer,
    network: "devnet",
    rpcUrl,
    rpcSubscriptionsUrl,
    deferMasterSeedSignature: true,
  },
  {
    transactionForwarder: createSkipPreflightForwarder(rpcUrl),
    masterSeedStorage: {
      load: (async () => {
        try {
          const pubkey = wallet.publicKey?.toBase58();
          if (!pubkey) return { exists: false };

          const stored = localStorage.getItem(`umbra:seed:${pubkey}`);
          if (!stored) return { exists: false };

          return {
            exists: true,
            seed: new Uint8Array(JSON.parse(stored)),
          };
        } catch {
          return { exists: false };
        }
      }) as any,
      store: (async (seed: Uint8Array) => {
        try {
          const pubkey = wallet.publicKey?.toBase58();
          if (!pubkey) return { ok: false };

          localStorage.setItem(
            `umbra:seed:${pubkey}`,
            JSON.stringify(Array.from(seed)),
          );

          return { ok: true };
        } catch {
          return { ok: false };
        }
      }) as any,
    } as any,
  } as any,
);

        if (!cancelled) setClient(nextClient);
      } catch (e) {
        console.error("Umbra init failed:", e);
        if (!cancelled) setClient(null);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [signer, wallet.publicKey]);

  const depositFn = useMemo(() => {
    if (!client) return null;
    return getATAIntoETADirectDepositorFunction ({ client });
  }, [client]);

  const withdrawFn = useMemo(() => {
    if (!client) return null;
    return getETAIntoATAWithdrawerFunction ({ client });
  }, [client]);

  return { client, depositFn, withdrawFn };
}