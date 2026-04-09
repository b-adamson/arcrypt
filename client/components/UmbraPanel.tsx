// "use client";

// import React, { useEffect, useMemo, useState } from "react";
// import { Keypair, VersionedTransaction } from "@solana/web3.js";
// import {
//   getUmbraClient,
//   getUserAccountQuerierFunction,
//   getUserRegistrationFunction,
// } from "@umbra-privacy/sdk";
// import { isRegistrationError } from "@umbra-privacy/sdk/errors";
// import { getUserRegistrationProver } from "@umbra-privacy/web-zk-prover";

// const registrationProver = getUserRegistrationProver();
// const STORAGE_KEY = "umbra:test:secret-key";

// type RegistrationState =
//   | { state: "non_existent" }
//   | {
//       state: "exists";
//       data: {
//         isInitialised: boolean;
//         isUserAccountX25519KeyRegistered: boolean;
//         isUserCommitmentRegistered: boolean;
//         isActiveForAnonymousUsage: boolean;
//       };
//     }
//   | null;

// type UmbraClient = Awaited<ReturnType<typeof getUmbraClient>>;

// type SignedMessage = {
//   message: Uint8Array;
//   signature: Uint8Array;
//   address: string;
// };

// type LocalUmbraSigner = {
//   readonly address: string;
//   signTransaction(tx: any): Promise<any>;
//   signTransactions(txs: readonly any[]): Promise<any[]>;
//   signMessage(message: Uint8Array): Promise<SignedMessage>;
// };

// type LocalSignerMeta = {
//   address: string;
//   secretKeyJson: string;
// };

// function deriveWsUrl(rpcUrl: string, explicitWsUrl?: string) {
//   if (explicitWsUrl) return explicitWsUrl;
//   if (rpcUrl.startsWith("https://")) return rpcUrl.replace("https://", "wss://");
//   if (rpcUrl.startsWith("http://")) return rpcUrl.replace("http://", "ws://");
//   return rpcUrl;
// }

// function bytesToJsonArray(bytes: Uint8Array): string {
//   return JSON.stringify(Array.from(bytes));
// }

// function jsonArrayToBytes(value: string): Uint8Array {
//   const parsed = JSON.parse(value);
//   if (!Array.isArray(parsed)) {
//     throw new Error("Key material must be a JSON array of numbers");
//   }

//   const bytes = new Uint8Array(parsed.length);
//   for (let i = 0; i < parsed.length; i += 1) {
//     const n = parsed[i];
//     if (typeof n !== "number" || !Number.isInteger(n) || n < 0 || n > 255) {
//       throw new Error("Key material must contain only integers from 0 to 255");
//     }
//     bytes[i] = n;
//   }

//   if (bytes.length !== 32 && bytes.length !== 64) {
//     throw new Error("Expected a 32-byte seed or 64-byte secret-key array");
//   }

//   return bytes;
// }

// function normalizeSeed(bytes: Uint8Array): Uint8Array {
//   if (bytes.length === 32) return bytes;
//   if (bytes.length === 64) return bytes.slice(0, 32);
//   throw new Error("Expected a 32-byte seed or 64-byte secret-key array");
// }

// function randomSeed32(): Uint8Array {
//   const seed = new Uint8Array(32);
//   crypto.getRandomValues(seed);
//   return seed;
// }

// async function loadTweetNacl() {
//   const mod = await import("tweetnacl");
//   return (mod as any).default ?? mod;
// }

// function createLocalUmbraSigner(seedOrSecretKey: Uint8Array): LocalUmbraSigner {
//   const seed = normalizeSeed(seedOrSecretKey);
//   const keypair = Keypair.fromSeed(seed);
//   const address = keypair.publicKey.toBase58();

//   async function signOneTransaction(tx: any) {
//     // Prefer a native sign() method when present, otherwise try to round-trip through
//     // wire bytes. Umbra passes a versioned transaction object here.
//     if (tx && typeof tx.sign === "function") {
//       tx.sign([keypair]);
//       return tx;
//     }

//     const wireBytes: Uint8Array | null =
//       tx instanceof Uint8Array
//         ? tx
//         : typeof tx?.serialize === "function"
//         ? tx.serialize()
//         : null;

//     if (!wireBytes) {
//       throw new Error("Unsupported transaction object from Umbra SDK");
//     }

//     const signed = VersionedTransaction.deserialize(wireBytes);
//     signed.sign([keypair]);
//     return signed;
//   }

//   return {
//     address,
//     async signTransaction(tx: any) {
//       return signOneTransaction(tx);
//     },
//     async signTransactions(txs: readonly any[]) {
//       return Promise.all(txs.map((tx) => signOneTransaction(tx)));
//     },
//     async signMessage(message: Uint8Array): Promise<SignedMessage> {
//       const nacl = await loadTweetNacl();
//       const signature = nacl.sign.detached(message, keypair.secretKey);
//       return {
//         message,
//         signature: new Uint8Array(signature),
//         address,
//       };
//     },
//   };
// }

// export default function UmbraPanel() {
//   const [mounted, setMounted] = useState(false);
//   const [signer, setSigner] = useState<LocalUmbraSigner | null>(null);
//   const [signerMeta, setSignerMeta] = useState<LocalSignerMeta | null>(null);
//   const [secretKeyInput, setSecretKeyInput] = useState("");

//   const [client, setClient] = useState<UmbraClient | null>(null);
//   const [registration, setRegistration] = useState<RegistrationState>(null);
//   const [status, setStatus] = useState("Generate or import a local test key");
//   const [registering, setRegistering] = useState(false);

//   const rpcUrl =
//     process.env.NEXT_PUBLIC_RPC_URL ??
//     "https://devnet.helius-rpc.com/?api-key=2264d5db-8075-444b-ac27-a0e614a053d3";
//   const rpcWsUrl = process.env.NEXT_PUBLIC_RPC_WS_URL;

//   const rpcSubscriptionsUrl = useMemo(
//     () => deriveWsUrl(rpcUrl, rpcWsUrl),
//     [rpcUrl, rpcWsUrl]
//   );

//   useEffect(() => {
//     setMounted(true);
//   }, []);

//   async function hydrateSignerFromBytes(bytes: Uint8Array) {
//     const nextSigner = createLocalUmbraSigner(bytes);
//     const seedOrSecretKey = normalizeSeed(bytes).length === 32 && bytes.length === 64
//       ? bytes
//       : bytes;

//     const nextMeta = {
//       address: String(nextSigner.address),
//       secretKeyJson: bytesToJsonArray(seedOrSecretKey),
//     } satisfies LocalSignerMeta;

//     setSigner(nextSigner);
//     setSignerMeta(nextMeta);
//     setSecretKeyInput(nextMeta.secretKeyJson);
//     localStorage.setItem(STORAGE_KEY, nextMeta.secretKeyJson);
//     setStatus(`Local test key loaded: ${nextMeta.address}`);
//   }

//   async function generateNewSigner() {
//     const seed = randomSeed32();
//     const nextSigner = createLocalUmbraSigner(seed);
//     const secretKey = Keypair.fromSeed(seed).secretKey;
//     const nextMeta = {
//       address: String(nextSigner.address),
//       secretKeyJson: bytesToJsonArray(secretKey),
//     } satisfies LocalSignerMeta;

//     setSigner(nextSigner);
//     setSignerMeta(nextMeta);
//     setSecretKeyInput(nextMeta.secretKeyJson);
//     localStorage.setItem(STORAGE_KEY, nextMeta.secretKeyJson);
//     setStatus(`Generated local test key: ${nextMeta.address}`);
//   }

//   async function importSigner() {
//     try {
//       const bytes = jsonArrayToBytes(secretKeyInput);
//       await hydrateSignerFromBytes(bytes);
//     } catch (e: any) {
//       setStatus(`Import failed: ${e?.message ?? "invalid key"}`);
//     }
//   }

//   function clearSigner() {
//     localStorage.removeItem(STORAGE_KEY);
//     setSigner(null);
//     setSignerMeta(null);
//     setSecretKeyInput("");
//     setClient(null);
//     setRegistration(null);
//     setStatus("Local key cleared");
//   }

//   useEffect(() => {
//     if (!mounted) return;

//     const stored = localStorage.getItem(STORAGE_KEY);
//     if (stored) {
//       try {
//         const bytes = jsonArrayToBytes(stored);
//         void hydrateSignerFromBytes(bytes);
//         return;
//       } catch {
//         localStorage.removeItem(STORAGE_KEY);
//       }
//     }

//     void generateNewSigner();
//   }, [mounted]);

//   useEffect(() => {
//     let cancelled = false;

//     async function init() {
//       setClient(null);
//       setRegistration(null);

//       if (!signer) {
//         setStatus("Generate or import a local test key");
//         return;
//       }

//       try {
//         setStatus("Creating Umbra client...");

//         const c = await getUmbraClient({
//           signer,
//           network: "devnet",
//           rpcUrl,
//           rpcSubscriptionsUrl,
//           indexerApiEndpoint: "https://utxo-indexer.api-devnet.umbraprivacy.com",
//           deferMasterSeedSignature: true,
//         });

//         if (cancelled) return;

//         setClient(c);
//         setStatus("Umbra client ready");
//       } catch (e: any) {
//         if (!cancelled) {
//           setStatus(`Failed to create client: ${e?.message ?? "unknown error"}`);
//         }
//       }
//     }

//     void init();

//     return () => {
//       cancelled = true;
//     };
//   }, [signer, rpcUrl, rpcSubscriptionsUrl]);

//   useEffect(() => {
//     let cancelled = false;

//     async function load() {
//       if (!client) return;

//       try {
//         setStatus("Checking registration...");

//         const query = getUserAccountQuerierFunction({ client });
//         const result = await query(client.signer.address);

//         if (cancelled) return;

//         setRegistration(result as RegistrationState);

//         if (result.state === "non_existent") {
//           setStatus("Not registered");
//           return;
//         }

//         const ready =
//           result.data.isUserAccountX25519KeyRegistered &&
//           result.data.isUserCommitmentRegistered;

//         setStatus(ready ? "Umbra ready" : "Partially registered");
//       } catch (e: any) {
//         if (!cancelled) setStatus(`Registration check failed: ${e?.message ?? "unknown error"}`);
//       }
//     }

//     void load();

//     return () => {
//       cancelled = true;
//     };
//   }, [client]);

//   const isFullyRegistered =
//     registration?.state === "exists" &&
//     registration.data.isUserAccountX25519KeyRegistered &&
//     registration.data.isUserCommitmentRegistered;

//   async function handleRegister() {
//     if (!client || registering) return;

//     setRegistering(true);
//     setStatus("Registering...");

//     try {
//       const register = getUserRegistrationFunction(
//         { client },
//         { zkProver: registrationProver }
//       );

//       const sigs = await register(
//         { confidential: true, anonymous: true },
//         {
//           callbacks: {
//             userAccountInitialisation: {
//               pre: async (tx) => {
//                 console.log("init pre tx:", tx);
//                 console.log("init signer:", client.signer);
//               },
//               post: async (_tx, sig) => console.log("init post sig:", sig),
//             },
//             registerX25519PublicKey: {
//               pre: async (tx) => {
//                 console.log("x25519 pre tx:", tx);
//                 console.log("x25519 signer:", client.signer);
//               },
//               post: async (_tx, sig) => console.log("x25519 post sig:", sig),
//             },
//             registerUserForAnonymousUsage: {
//               pre: async (tx) => {
//                 console.log("anon pre tx:", tx);
//                 console.log("anon signer:", client.signer);
//               },
//               post: async (_tx, sig) => console.log("anon post sig:", sig),
//             },
//           },
//         }
//       );

//       setStatus(
//         sigs.length === 0 ? "Already registered" : `Registered (${sigs.length} tx)`
//       );
//     } catch (e: any) {
//       console.error("Umbra register failed:", e);
//       console.error("cause:", e?.cause);
//       console.error("stage:", e?.stage);

//       if (isRegistrationError(e)) {
//         setStatus(`Registration failed at ${e.stage}: ${e.message}`);
//       } else {
//         setStatus(`Registration failed: ${e?.message ?? "unknown error"}`);
//       }
//     } finally {
//       setRegistering(false);
//     }
//   }

//   if (!mounted) {
//     return (
//       <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
//         <div className="text-sm text-white/60">Loading...</div>
//       </div>
//     );
//   }

//   return (
//     <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
//       <h2 className="mb-4 text-lg font-semibold">Umbra local test client</h2>

//       <div className="mb-2 text-sm">
//         <strong>Test signer:</strong> {signerMeta?.address ?? "Not loaded"}
//       </div>

//       <div className="mb-2 text-sm">
//         <strong>Client:</strong> {client ? "Ready" : "Not ready"}
//       </div>

//       <div className="mb-2 text-sm">
//         <strong>Registration:</strong>{" "}
//         {registration?.state === "exists"
//           ? isFullyRegistered
//             ? "Ready"
//             : "Partial"
//           : "Not registered"}
//       </div>

//       <div className="mt-4 grid gap-3">
//         <div>
//           <label className="mb-1 block text-xs uppercase tracking-wide text-white/60">
//             Import local key JSON
//           </label>
//           <textarea
//             value={secretKeyInput}
//             onChange={(e) => setSecretKeyInput(e.target.value)}
//             placeholder="Paste a 32-byte seed or 64-byte secret-key JSON array here"
//             className="min-h-28 w-full rounded-xl border border-white/10 bg-black/20 p-3 text-xs outline-none"
//           />
//         </div>

//         <div className="flex flex-wrap gap-2">
//           <button
//             onClick={generateNewSigner}
//             className="rounded border border-white/20 bg-white/10 px-4 py-2 text-sm"
//           >
//             Generate local key
//           </button>
//           <button
//             onClick={importSigner}
//             className="rounded border border-white/20 bg-white/10 px-4 py-2 text-sm"
//           >
//             Import key
//           </button>
//           <button
//             onClick={clearSigner}
//             className="rounded border border-white/20 bg-white/10 px-4 py-2 text-sm"
//           >
//             Clear
//           </button>
//         </div>
//       </div>

//       <button
//         onClick={handleRegister}
//         disabled={!client || registering || isFullyRegistered}
//         className="mt-4 rounded border border-white/20 bg-white/10 px-4 py-2 disabled:opacity-50"
//       >
//         {isFullyRegistered
//           ? "Registered"
//           : registering
//           ? "Registering..."
//           : "Register Umbra"}
//       </button>

//       <div className="mt-4 text-xs text-white/60">{status}</div>
//     </div>
//   );
// }
