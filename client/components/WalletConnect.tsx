// "use client";

// import React from "react";
// import { useWallet } from "@solana/wallet-adapter-react";
// import { useWalletModal } from "@solana/wallet-adapter-react-ui";

// function shorten(address: string) {
//   return `${address.slice(0, 4)}…${address.slice(-4)}`;
// }

// export default function WalletConnect() {
//   const { publicKey, connected, disconnect } = useWallet();
//   const { setVisible } = useWalletModal();

//   const address = publicKey?.toBase58();

//   return (
//     <div className="flex items-center gap-3 border border-white/10 bg-white/5 px-4 py-3 backdrop-blur-md edge-glow-strong">
//       <button
//         type="button"
//         onClick={() => {
//           if (connected) void disconnect();
//           else setVisible(true);
//         }}
//         className="h-10 rounded-none border border-white/15 bg-black/30 px-4 text-sm font-semibold text-white transition-all hover:border-white/25 hover:bg-white/5"
//       >
//         {connected ? "Disconnect Wallet" : "Connect Wallet"}
//       </button>

//       <div className="flex items-center gap-2 border border-white/10 bg-black/20 px-3 py-1.5 text-sm text-white/70">
//         <span
//           className={`h-2 w-2 ${
//             connected
//               ? "bg-emerald-400 shadow-[0_0_10px_rgba(74,222,128,0.8)]"
//               : "bg-white/30"
//           }`}
//         />
//         {connected && address ? (
//           <span className="font-medium text-white">{shorten(address)}</span>
//         ) : (
//           <span>Not connected</span>
//         )}
//       </div>
//     </div>
//   );
// }