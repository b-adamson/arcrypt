// "use client";

// import React, { useCallback, useEffect, useMemo, useState } from "react";
// import { install } from "@solana/webcrypto-ed25519-polyfill";
// import {
//   createSignerFromPrivateKeyBytes,
//   getEncryptedBalanceToPublicBalanceDirectWithdrawerFunction,
//   getEncryptedBalanceQuerierFunction,
//   getPublicBalanceToEncryptedBalanceDirectDepositorFunction,
//   getUmbraClient,
//   getUserAccountQuerierFunction,
//   getUserRegistrationFunction,
//   type IUmbraSigner,
// } from "@umbra-privacy/sdk";
// import {
//   isEncryptedDepositError,
//   isEncryptedWithdrawalError,
//   isQueryError,
//   isRegistrationError,
// } from "@umbra-privacy/sdk/errors";

// import keyFile from "../umbra-devnet.json";

// install();

// const rpcUrl =
//   process.env.NEXT_PUBLIC_RPC_URL ??
//   "https://devnet.helius-rpc.com/?api-key=2264d5db-8075-444b-ac27-a0e614a053d3";

// const rpcSubscriptionsUrl =
//   process.env.NEXT_PUBLIC_RPC_WS_URL ??
//   rpcUrl.replace(/^https:/, "wss:").replace(/^http:/, "ws:");

// const DEFAULT_MINT = "EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v";

// type AccountState =
//   | { kind: "idle" }
//   | { kind: "non_existent" }
//   | {
//       kind: "exists";
//       isInitialised: boolean;
//       isUserAccountX25519KeyRegistered: boolean;
//       isUserCommitmentRegistered: boolean;
//       isActiveForAnonymousUsage: boolean;
//       x25519PublicKey?: string;
//       generationIndex?: string;
//     };

// type MintBalanceState =
//   | { kind: "idle" }
//   | { kind: "non_existent"; mint: string }
//   | { kind: "uninitialized"; mint: string }
//   | { kind: "mxe"; mint: string }
//   | { kind: "shared"; mint: string; balance: string };

// type Props = {
//   zkProver?: {
//     prepareAnonymousRegistration?: () => Promise<void>;
//   };
// };

// function formatBytes(bytes?: Uint8Array) {
//   if (!bytes) return "";
//   return Array.from(bytes)
//     .map((b) => b.toString(16).padStart(2, "0"))
//     .join("");
// }

// export default function UmbraPanel({ zkProver }: Props) {
//   const [mounted, setMounted] = useState(false);
//   const [status, setStatus] = useState("Loading...");
//   const [registering, setRegistering] = useState(false);
//   const [querying, setQuerying] = useState(false);
//   const [depositing, setDepositing] = useState(false);
//   const [withdrawing, setWithdrawing] = useState(false);
//   const [refreshing, setRefreshing] = useState(false);
// const [registrationLog, setRegistrationLog] = useState<string[]>([]);
//   const [signer, setSigner] = useState<IUmbraSigner | null>(null);
//   const [client, setClient] = useState<Awaited<ReturnType<typeof getUmbraClient>> | null>(null);

//   const [accountState, setAccountState] = useState<AccountState>({ kind: "idle" });
//   const [selectedMint, setSelectedMint] = useState(DEFAULT_MINT);
//   const [balanceState, setBalanceState] = useState<MintBalanceState>({ kind: "idle" });
//   const [depositAmount, setDepositAmount] = useState("1000000");
//   const [withdrawAmount, setWithdrawAmount] = useState("1000000");
//   const [registerConfidential, setRegisterConfidential] = useState(true);
//   const [registerAnonymous, setRegisterAnonymous] = useState(true);
//   const [queryAddress, setQueryAddress] = useState("");

//   const activeMint = useMemo(() => selectedMint.trim(), [selectedMint]);

//   const pushLog = useCallback((message: string) => {
//   setRegistrationLog((prev) => [...prev, `${new Date().toISOString()}  ${message}`]);
// }, []);

//   useEffect(() => {
//     setMounted(true);
//   }, []);

//   useEffect(() => {
//     let cancelled = false;

//     async function initSigner() {
//       try {
//         const nextSigner = await createSignerFromPrivateKeyBytes(
//           new Uint8Array(keyFile as number[])
//         );

//         if (!cancelled) setSigner(nextSigner);
//       } catch (error: any) {
//         if (!cancelled) {
//           console.error(error);
//           setStatus(`Failed to create signer: ${error?.message ?? "unknown error"}`);
//         }
//       }
//     }

//     void initSigner();

//     return () => {
//       cancelled = true;
//     };
//   }, []);

//   useEffect(() => {
//     let cancelled = false;

//     async function initClient() {
//       if (!signer) return;

//       try {
//         setStatus("Creating Umbra client...");

//         const nextClient = await getUmbraClient(
//           {
//             signer,
//             network: "devnet",
//             rpcUrl,
//             rpcSubscriptionsUrl,
//             indexerApiEndpoint: "https://utxo-indexer.api-devnet.umbraprivacy.com",
//             // deferMasterSeedSignature: true,

//           },

//         );

//         if (!cancelled) {
//           setClient(nextClient);
//           setQueryAddress(nextClient.signer.address);
//           setStatus(`Umbra client ready for ${nextClient.signer.address}`);
//         }
//       } catch (error: any) {
//         if (!cancelled) {
//           console.error(error);
//           setStatus(`Failed to create client: ${error?.message ?? "unknown error"}`);
//         }
//       }
//     }

//     void initClient();

//     return () => {
//       cancelled = true;
//     };
//   }, [signer]);

//   const userAccountQuery = useMemo(() => {
//     if (!client) return null;
//     return getUserAccountQuerierFunction({ client });
//   }, [client]);

//   const encryptedBalanceQuery = useMemo(() => {
//     if (!client) return null;
//     return getEncryptedBalanceQuerierFunction({ client });
//   }, [client]);

//   const depositFn = useMemo(() => {
//     if (!client) return null;
//     return getPublicBalanceToEncryptedBalanceDirectDepositorFunction({ client });
//   }, [client]);

//   const withdrawFn = useMemo(() => {
//     if (!client) return null;
//     return getEncryptedBalanceToPublicBalanceDirectWithdrawerFunction({ client });
//   }, [client]);
// const refreshAccount = useCallback(async () => {
//   if (!client || !userAccountQuery) return;

//   setRefreshing(true);
//   try {
//     const address = queryAddress.trim() || client.signer.address;
//     console.log(address)

//     await new Promise((r) => setTimeout(r, 2000));
//    const result = await userAccountQuery(address, { commitment: "finalized" });

// console.log("isUserAccountX25519KeyRegistered:", result.data.isUserAccountX25519KeyRegistered);
// console.log("raw x25519PublicKey:", result.data.x25519PublicKey);
// console.log("hex:", formatBytes(result.data.x25519PublicKey));

//     console.log("raw x25519PublicKey:", result.state === "exists" ? result.data.x25519PublicKey : null);

//     if (result.state === "non_existent") {
//       setAccountState({ kind: "non_existent" });
//       setStatus(`No Umbra account found for ${address}`);
//       return;
//     }

//     setAccountState({
//       kind: "exists",
//       isInitialised: result.data.isInitialised,
//       isUserAccountX25519KeyRegistered: result.data.isUserAccountX25519KeyRegistered,
//       isUserCommitmentRegistered: result.data.isUserCommitmentRegistered,
//       isActiveForAnonymousUsage: result.data.isActiveForAnonymousUsage,
//       x25519PublicKey: formatBytes(result.data.x25519PublicKey),
//       generationIndex: result.data.generationIndex.toString(),
//     });

//     setStatus(`Loaded account state for ${address}`);
//   } finally {
//     setRefreshing(false);
//   }
// }, [client, queryAddress, userAccountQuery]);

//   const refreshBalance = useCallback(async () => {
//     if (!client || !encryptedBalanceQuery) return;
//     if (!activeMint) {
//       setStatus("Paste a mint first.");
//       return;
//     }

//     setQuerying(true);
//     try {
//       const results = await encryptedBalanceQuery([activeMint]);
//       const result = results.get(activeMint);

//       if (!result) {
//         setBalanceState({ kind: "non_existent", mint: activeMint });
//         setStatus(`No balance response for ${activeMint}`);
//         return;
//       }

//       switch (result.state) {
//         case "non_existent":
//           setBalanceState({ kind: "non_existent", mint: activeMint });
//           setStatus(`No encrypted balance exists yet for ${activeMint}`);
//           break;
//         case "uninitialized":
//           setBalanceState({ kind: "uninitialized", mint: activeMint });
//           setStatus(`Encrypted account exists but is not initialized for ${activeMint}`);
//           break;
//         case "mxe":
//           setBalanceState({ kind: "mxe", mint: activeMint });
//           setStatus(`Balance is MXE-only for ${activeMint}`);
//           break;
//         case "shared":
//           setBalanceState({ kind: "shared", mint: activeMint, balance: result.balance.toString() });
//           setStatus(`Shared-mode balance loaded for ${activeMint}`);
//           break;
//       }
//     } catch (error: any) {
//       console.error(error);
//       if (isQueryError(error)) {
//         setStatus(`Balance query failed at ${error.stage}: ${error.message}`);
//       } else {
//         setStatus(`Balance query failed: ${error?.message ?? "unknown error"}`);
//       }
//     } finally {
//       setQuerying(false);
//     }
//   }, [activeMint, client, encryptedBalanceQuery]);

//  const handleRegister = useCallback(async () => {
//   if (!client || registering) return;

//   setRegistering(true);
//   setStatus("Registering...");
//   setRegistrationLog([]);

//   try {
//     pushLog("Starting registration flow");

//     // Force master seed derivation up front so lazy mode cannot hide issues.
//     pushLog("Deriving master seed...");
//     await client.masterSeed.getMasterSeed();
//     pushLog("Master seed is available");

//     if (registerAnonymous && zkProver?.prepareAnonymousRegistration) {
//       pushLog("Preparing anonymous-mode prover...");
//       setStatus("Preparing anonymous-mode prover...");
//       await zkProver.prepareAnonymousRegistration();
//       pushLog("Anonymous-mode prover ready");
//     }

//     const register = getUserRegistrationFunction({ client });

//     const signatures = await register({
//       confidential: registerConfidential,
//       anonymous: registerAnonymous,
//       accountInfoCommitment: "confirmed",
//       epochInfoCommitment: "confirmed",
//       callbacks: {
//         userAccountInitialisation: {
//           pre: async (tx) => {
//             pushLog("Step 1 pre: creating EncryptedUserAccount");
//             console.log("userAccountInitialisation pre tx:", tx);
//           },
//           post: async (_tx, sig) => {
//             pushLog(`Step 1 post: EncryptedUserAccount confirmed (${sig})`);
//           },
//         },
//         registerX25519PublicKey: {
//           pre: async (tx) => {
//             pushLog("Step 2 pre: registering X25519 public key");
//             console.log("registerX25519PublicKey pre tx:", tx);
//           },
//           post: async (_tx, sig) => {
//             pushLog(`Step 2 post: X25519 public key confirmed (${sig})`);
//           },
//         },
//         registerUserForAnonymousUsage: {
//           pre: async (tx) => {
//             pushLog("Step 3 pre: registering anonymous commitment");
//             console.log("registerUserForAnonymousUsage pre tx:", tx);
//           },
//           post: async (_tx, sig) => {
//             pushLog(`Step 3 post: anonymous commitment confirmed (${sig})`);
//           },
//         },
//       },
//     });

//     pushLog(`Registration returned ${signatures.length} signature(s)`);

//     setStatus(
//       signatures.length === 0
//         ? "Already registered"
//         : `Registered (${signatures.length} tx${signatures.length === 1 ? "" : "s"})`
//     );

//     await refreshAccount();
//   } catch (error: any) {
//     console.error(error);
//     pushLog(`Registration failed: ${error?.message ?? "unknown error"}`);

//     if (isRegistrationError(error)) {
//       setStatus(`Registration failed at ${error.stage}: ${error.message}`);
//       pushLog(`Registration stage: ${error.stage}`);
//     } else {
//       setStatus(`Registration failed: ${error?.message ?? "unknown error"}`);
//     }
//   } finally {
//     setRegistering(false);
//   }
// }, [
//   client,
//   pushLog,
//   refreshAccount,
//   registerAnonymous,
//   registerConfidential,
//   registering,
//   zkProver,
// ]);

//   const handleDeposit = useCallback(async () => {
//     if (!client || !depositFn || depositing) return;
//     if (!activeMint) {
//       setStatus("Paste a mint first.");
//       return;
//     }

//     setDepositing(true);
//     setStatus("Depositing...");

//     try {
//       const amount = BigInt(depositAmount);
//       const destination = queryAddress.trim() || client.signer.address;
//       const result = await depositFn(destination, activeMint, amount);

//       setStatus(
//         `Deposit submitted for ${activeMint}. Queue=${result.queueSignature}${
//           result.callbackSignature ? `, callback=${result.callbackSignature}` : ""
//         }`
//       );

//       await refreshBalance();
//     } catch (error: any) {
//       console.error(error);
//       if (isEncryptedDepositError(error)) {
//         setStatus(`Deposit failed at ${error.stage}: ${error.message}`);
//       } else {
//         setStatus(`Deposit failed: ${error?.message ?? "unknown error"}`);
//       }
//     } finally {
//       setDepositing(false);
//     }
//   }, [activeMint, client, depositAmount, depositFn, depositing, queryAddress, refreshBalance]);

//   const handleWithdraw = useCallback(async () => {
//     if (!client || !withdrawFn || withdrawing) return;
//     if (!activeMint) {
//       setStatus("Paste a mint first.");
//       return;
//     }

//     setWithdrawing(true);
//     setStatus("Withdrawing...");

//     try {
//       const amount = BigInt(withdrawAmount);
//       const destination = queryAddress.trim() || client.signer.address;
//       const result = await withdrawFn(destination, activeMint, amount);

//       setStatus(
//         `Withdraw submitted for ${activeMint}. Queue=${result.queueSignature}${
//           result.callbackSignature ? `, callback=${result.callbackSignature}` : ""
//         }`
//       );

//       await refreshBalance();
//     } catch (error: any) {
//       console.error(error);
//       if (isEncryptedWithdrawalError(error)) {
//         setStatus(`Withdrawal failed at ${error.stage}: ${error.message}`);
//       } else {
//         setStatus(`Withdrawal failed: ${error?.message ?? "unknown error"}`);
//       }
//     } finally {
//       setWithdrawing(false);
//     }
//   }, [activeMint, client, refreshBalance, queryAddress, withdrawAmount, withdrawFn, withdrawing]);

//   useEffect(() => {
//     if (!client) return;
//     void refreshAccount();
//     void refreshBalance();
//   }, [client, refreshAccount, refreshBalance]);

//   if (!mounted) {
//     return <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">Loading...</div>;
//   }

//   return (
//     <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 shadow-sm">
//       <div className="grid gap-4 md:grid-cols-2">
//         <section className="rounded-2xl border border-white/10 bg-black/10 p-4">
//           <h2 className="text-lg font-semibold">Identity</h2>
//           <div className="mt-3 space-y-2 text-sm">
//             <div>
//               <strong>Signer:</strong> {signer?.address ?? "Not ready"}
//             </div>
//             <div>
//               <strong>Client:</strong> {client ? "Ready" : "Not ready"}
//             </div>
//             <div>
//               <strong>Status:</strong> {status}
//             </div>
//           </div>
//         </section>

//         <section className="rounded-2xl border border-white/10 bg-black/10 p-4">
//           <h2 className="text-lg font-semibold">Registration</h2>
//           <div className="mt-3 grid gap-3 text-sm">
//             <label className="flex items-center gap-2">
//               <input
//                 type="checkbox"
//                 checked={registerConfidential}
//                 onChange={(e) => setRegisterConfidential(e.target.checked)}
//               />
//               Confidential / shared balance registration
//             </label>
//             <label className="flex items-center gap-2">
//               <input
//                 type="checkbox"
//                 checked={registerAnonymous}
//                 onChange={(e) => setRegisterAnonymous(e.target.checked)}
//               />
//               Anonymous / mixer registration
//             </label>
//           </div>
//           <button
//             onClick={handleRegister}
//             disabled={!client || registering}
//             className="mt-4 rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
//           >
//             {registering ? "Registering..." : "Register Umbra"}
//           </button>
//         </section>
//       </div>

//       <section className="mt-4 rounded-2xl border border-white/10 bg-black/10 p-4">
//         <h2 className="text-lg font-semibold">Query account state</h2>
//         <div className="mt-3 flex flex-col gap-3 md:flex-row">
//           <input
//             value={queryAddress}
//             onChange={(e) => setQueryAddress(e.target.value)}
//             placeholder="Wallet address to inspect"
//             className="w-full rounded-xl border border-white/15 bg-black/20 px-3 py-2 text-sm outline-none"
//           />
//           <button
//             onClick={refreshAccount}
//             disabled={!client || refreshing}
//             className="rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
//           >
//             {refreshing ? "Loading..." : "Load account"}
//           </button>
//         </div>

//         <div className="mt-3 text-sm">
//           {accountState.kind === "exists" ? (
//             <div className="space-y-1">
//               <div>Initialised: {String(accountState.isInitialised)}</div>
//               <div>Shared key registered: {String(accountState.isUserAccountX25519KeyRegistered)}</div>
//               <div>Anonymous commitment registered: {String(accountState.isUserCommitmentRegistered)}</div>
//               <div>Active for anonymous usage: {String(accountState.isActiveForAnonymousUsage)}</div>
//               <div>X25519 public key: {accountState.x25519PublicKey || "n/a"}</div>
//               <div>Generation index: {accountState.generationIndex || "n/a"}</div>
//             </div>
//           ) : accountState.kind === "non_existent" ? (
//             <div>No account found.</div>
//           ) : (
//             <div>Press “Load account” to inspect state.</div>
//           )}
//         </div>
//       </section>

//       <section className="mt-4 rounded-2xl border border-white/10 bg-black/10 p-4">
//         <h2 className="text-lg font-semibold">Mint</h2>
//         <div className="mt-3">
//           <input
//             value={selectedMint}
//             onChange={(e) => setSelectedMint(e.target.value)}
//             placeholder="Paste mint address"
//             className="w-full rounded-xl border border-white/15 bg-black/20 px-3 py-2 text-sm outline-none"
//           />
//         </div>
//       </section>

//       <section className="mt-4 rounded-2xl border border-white/10 bg-black/10 p-4">
//         <h2 className="text-lg font-semibold">Query encrypted balance</h2>
//         <div className="mt-3 flex flex-col gap-3 md:flex-row">
//           <button
//             onClick={refreshBalance}
//             disabled={!client || querying}
//             className="rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
//           >
//             {querying ? "Loading..." : "Load balance"}
//           </button>
//         </div>

//         <div className="mt-3 text-sm">
//           {balanceState.kind === "shared" ? (
//             <div>
//               <div>Mint: {balanceState.mint}</div>
//               <div>Balance: {balanceState.balance}</div>
//             </div>
//           ) : balanceState.kind === "mxe" ? (
//             <div>Mint {balanceState.mint} is in MXE mode, so it cannot be decrypted locally.</div>
//           ) : balanceState.kind === "uninitialized" ? (
//             <div>Mint {balanceState.mint} exists, but the encrypted balance is not initialized yet.</div>
//           ) : balanceState.kind === "non_existent" ? (
//             <div>No encrypted balance exists for mint {balanceState.mint}.</div>
//           ) : (
//             <div>Press “Load balance” to inspect the encrypted balance for the selected mint.</div>
//           )}
//         </div>
//       </section>

//       <section className="mt-4 grid gap-4 md:grid-cols-2">
//         <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
//           <h2 className="text-lg font-semibold">Deposit</h2>
//           <div className="mt-3 space-y-3">
//             <input
//               value={depositAmount}
//               onChange={(e) => setDepositAmount(e.target.value)}
//               placeholder="Amount in base units"
//               className="w-full rounded-xl border border-white/15 bg-black/20 px-3 py-2 text-sm outline-none"
//             />
//             <button
//               onClick={handleDeposit}
//               disabled={!client || depositing || !activeMint}
//               className="w-full rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
//             >
//               {depositing ? "Depositing..." : `Deposit ${activeMint || "mint"}`}
//             </button>
//           </div>
//         </div>

//         <div className="rounded-2xl border border-white/10 bg-black/10 p-4">
//           <h2 className="text-lg font-semibold">Withdraw</h2>
//           <div className="mt-3 space-y-3">
//             <input
//               value={withdrawAmount}
//               onChange={(e) => setWithdrawAmount(e.target.value)}
//               placeholder="Amount in base units"
//               className="w-full rounded-xl border border-white/15 bg-black/20 px-3 py-2 text-sm outline-none"
//             />
//             <button
//               onClick={handleWithdraw}
//               disabled={!client || withdrawing || !activeMint}
//               className="w-full rounded-xl border border-white/20 bg-white/10 px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-50"
//             >
//               {withdrawing ? "Withdrawing..." : `Withdraw ${activeMint || "mint"}`}
//             </button>
//           </div>
//         </div>
//       </section>

//       <div className="mt-4 text-xs text-white/60">
//         Deposit/withdraw amounts are in native token units. Use the mint’s decimals when entering values.
//       </div>
//       <div className="mt-4 rounded-xl border border-white/10 bg-black/20 p-3 text-xs text-white/70">
//   <div className="mb-2 font-semibold text-white/90">Registration log</div>
//   <div className="max-h-48 space-y-1 overflow-auto whitespace-pre-wrap">
//     {registrationLog.length === 0 ? (
//       <div>No registration events yet.</div>
//     ) : (
//       registrationLog.map((line, i) => <div key={i}>{line}</div>)
//     )}
//   </div>
// </div>
//     </div>
    
//   );
// }
