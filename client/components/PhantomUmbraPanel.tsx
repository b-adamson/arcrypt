// "use client";

// import { useEffect, useState } from "react";
// import { getWallets } from "@wallet-standard/core";
// import { getTransactionEncoder, getTransactionDecoder } from "@solana/kit";
// import {
//   getUmbraClientFromSigner,
//   getUserRegistrationFunction,
// } from "@umbra-privacy/sdk";
// import { getUserRegistrationProver } from "@umbra-privacy/web-zk-prover";

// type AnyWallet = any;
// type AnyAccount = any;

// const INDEXER_API_ENDPOINT =
//   "https://acqzie0a1h.execute-api.eu-central-1.amazonaws.com";

// function useLivePhantomWallet() {
//   const [wallet, setWallet] = useState<AnyWallet | null>(null);

//   useEffect(() => {
//     const walletsApi = getWallets();

//     const sync = () => {
//       const phantom = walletsApi
//         .get()
//         .find((w: AnyWallet) => /phantom/i.test(w?.name ?? ""));
//       setWallet(phantom ?? null);
//     };

//     sync();

//     walletsApi.on("register", sync);
//     walletsApi.on("unregister", sync);

//     return () => {
//       walletsApi.off?.("register", sync);
//       walletsApi.off?.("unregister", sync);
//     };
//   }, []);

//   return wallet;
// }

// function makeUmbraSigner(wallet: AnyWallet, account: AnyAccount) {
//   const signTransactionFeature = wallet.features?.["solana:signTransaction"];
//   const signMessageFeature = wallet.features?.["solana:signMessage"];

//   if (!signTransactionFeature || !signMessageFeature) {
//     throw new Error(
//       'Phantom does not expose both "solana:signTransaction" and "solana:signMessage".'
//     );
//   }

//   const encoder = getTransactionEncoder();
//   const decoder = getTransactionDecoder();

//   const signOne = async (tx: any) => {
//     const wireBytes = encoder.encode(tx);

//     const [output] = await signTransactionFeature.signTransaction({
//       account,
//       chain: account.chains?.[0],
//       transaction: wireBytes,
//     });

//     const decoded = decoder.decode(output.signedTransaction);

//     return {
//       ...tx,
//       signatures: {
//         ...(tx.signatures ?? {}),
//         ...(decoded.signatures ?? {}),
//       },
//     };
//   };

//   return {
//     address: account.address,
//     signTransaction: signOne,
//     signTransactions: async (txs: readonly any[]) => Promise.all(txs.map(signOne)),
//     signMessage: async (message: Uint8Array) => {
//       const [output] = await signMessageFeature.signMessage({
//         account,
//         message,
//       });

//       return {
//         message,
//         signature: output.signature,
//         signer: account.address,
//       };
//     },
//   };
// }

// export default function UmbraPanel({
//   rpcUrl,
//   rpcSubscriptionsUrl,
// }: {
//   rpcUrl: string;
//   rpcSubscriptionsUrl: string;
// }) {
//   const wallet = useLivePhantomWallet();
//   const [account, setAccount] = useState<AnyAccount | null>(null);
//   const [client, setClient] = useState<any>(null);
//   const [status, setStatus] = useState("Not set up");
//   const [loading, setLoading] = useState(false);

//   useEffect(() => {
//     setAccount(null);
//     setClient(null);
//     setStatus("Not set up");
//   }, [wallet]);

//   useEffect(() => {
//     let cancelled = false;

//     async function initClient() {
//       if (!wallet || !account) {
//         setClient(null);
//         return;
//       }

//       try {
//         const signer = makeUmbraSigner(wallet, account);

//         const nextClient = await getUmbraClientFromSigner({
//           signer,
//           network: "devnet",
//           rpcUrl,
//           rpcSubscriptionsUrl,
//           indexerApiEndpoint: INDEXER_API_ENDPOINT,
//           deferMasterSeedSignature: true,
//         });

//         if (!cancelled) setClient(nextClient);
//       } catch (error) {
//         console.error("Failed to create Umbra client:", error);
//         if (!cancelled) setClient(null);
//       }
//     }

//     initClient();

//     return () => {
//       cancelled = true;
//     };
//   }, [wallet, account, rpcUrl, rpcSubscriptionsUrl]);

//   const handleConnect = async () => {
//     if (!wallet) return;

//     try {
//       const connectFeature = wallet.features?.["standard:connect"];
//       if (!connectFeature) {
//         throw new Error('Phantom does not expose "standard:connect".');
//       }

//       const result = await connectFeature.connect();
//       setAccount(result.accounts?.[0] ?? null);
//     } catch (error) {
//       console.error("Connect failed:", error);
//       setStatus(error instanceof Error ? error.message : "Connect failed");
//     }
//   };

//   const handleDisconnect = async () => {
//     try {
//       const disconnectFeature = wallet?.features?.["standard:disconnect"];
//       if (disconnectFeature) {
//         await disconnectFeature.disconnect();
//       }
//     } catch (error) {
//       console.error("Disconnect failed:", error);
//     } finally {
//       setAccount(null);
//       setClient(null);
//       setStatus("Not set up");
//     }
//   };

//   const handleSetup = async () => {
//     if (!client) return;

//     setLoading(true);
//     setStatus("Setting up...");

//     try {
//       const register = getUserRegistrationFunction(
//         { client },
//         { zkProver: getUserRegistrationProver() }
//       );

//       const signatures = await register({
//         confidential: true,
//         anonymous: true,
//       });

//       setStatus(`Done (${signatures.length} txs)`);
//     } catch (error) {
//       console.error("ETA setup failed:", error);
//       setStatus(error instanceof Error ? error.message : "Error");
//     } finally {
//       setLoading(false);
//     }
//   };

//   return (
//     <div style={{ padding: 16, border: "1px solid #ddd", borderRadius: 12 }}>
//       <div>
//         <b>Wallet:</b> {wallet?.name ?? "None"}
//       </div>
//       <div>
//         <b>Address:</b> {account?.address ?? "Not connected"}
//       </div>

//       <div style={{ marginTop: 12, display: "flex", gap: 8 }}>
//         {!account ? (
//           <button onClick={handleConnect}>Connect Phantom</button>
//         ) : (
//           <button onClick={handleDisconnect}>Disconnect</button>
//         )}

//         <button onClick={handleSetup} disabled={!client || !account || loading}>
//           {loading ? "Setting up..." : "Set up ETA"}
//         </button>
//       </div>

//       <div style={{ marginTop: 12 }}>
//         <b>ETA:</b> {status}
//       </div>
//     </div>
//   );
// }