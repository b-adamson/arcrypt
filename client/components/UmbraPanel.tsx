"use client";

import React, { useEffect, useMemo, useState } from "react";
import { type Wallet, type WalletAccount } from "@wallet-standard/core";
import { useWallets } from "@wallet-standard/react";
import {
  createSignerFromWalletAccount,
  getUmbraClient,
  getUserAccountQuerierFunction,
  getUserRegistrationFunction,
} from "@umbra-privacy/sdk";
import { isRegistrationError } from "@umbra-privacy/sdk/errors";
import { getUserRegistrationProver } from "@umbra-privacy/web-zk-prover";

const registrationProver = getUserRegistrationProver();

function deriveWsUrl(rpcUrl: string, explicitWsUrl?: string) {
  if (explicitWsUrl) return explicitWsUrl;
  if (rpcUrl.startsWith("https://")) return rpcUrl.replace("https://", "wss://");
  if (rpcUrl.startsWith("http://")) return rpcUrl.replace("http://", "ws://");
  return rpcUrl;
}

type RegistrationState =
  | { state: "non_existent" }
  | {
      state: "exists";
      data: {
        isInitialised: boolean;
        isUserAccountX25519KeyRegistered: boolean;
        isUserCommitmentRegistered: boolean;
        isActiveForAnonymousUsage: boolean;
      };
    }
  | null;

type UmbraClient = Awaited<ReturnType<typeof getUmbraClient>>;

export default function UmbraPanel() {
  const wallets = useWallets();

  const [client, setClient] = useState<UmbraClient | null>(null);
  const [status, setStatus] = useState("Connect wallet to init Umbra");
  const [registration, setRegistration] = useState<RegistrationState>(null);
  const [clientReady, setClientReady] = useState(false);
  const [registering, setRegistering] = useState(false);

  const rpcUrl = process.env.NEXT_PUBLIC_RPC_URL!;
  const rpcWsUrl = process.env.NEXT_PUBLIC_RPC_WS_URL;

  const rpcSubscriptionsUrl = useMemo(
    () => deriveWsUrl(rpcUrl, rpcWsUrl),
    [rpcUrl, rpcWsUrl]
  );

  const selection = useMemo(() => {
    const uiWallet = wallets.find((w: any) => w.name === "Phantom");
    const uiAccount = uiWallet?.accounts?.[0];
    if (!uiWallet || !uiAccount) return null;
    return { uiWallet, uiAccount };
  }, [wallets]);

  const signer = useMemo(() => {
    if (!selection) return null;

    console.log("[Umbra] WALLET STANDARD WALLET", {
      name: selection.uiWallet.name,
      features: selection.uiWallet.features,
    });

    console.log("[Umbra] WALLET STANDARD ACCOUNT", {
      address: selection.uiAccount.address,
      chains: selection.uiAccount.chains,
    });

    return createSignerFromWalletAccount(
      selection.uiWallet as unknown as Wallet,
      selection.uiAccount as unknown as WalletAccount
    );
  }, [selection]);

  useEffect(() => {
    let cancelled = false;

    async function init() {
      setClient(null);
      setClientReady(false);
      setRegistration(null);

      if (!signer) {
        setStatus("Wallet not ready");
        return;
      }

      try {
        setStatus("Creating Umbra client...");

        const c = await getUmbraClient({
          signer,
          network: "mainnet",
          rpcUrl,
          rpcSubscriptionsUrl,
          indexerApiEndpoint: "https://indexer.api.umbraprivacy.com",
          deferMasterSeedSignature: true,
        });

        if (cancelled) return;

        console.log("[Umbra] CLIENT FULL", {
          signer: c.signer?.address,
          network: c.network,
          hasSeedFn: !!c.masterSeed?.getMasterSeed,
          providers: {
            accountInfo: !!c.accountInfoProvider,
            blockhash: !!c.blockhashProvider,
            txForwarder: !!c.transactionForwarder,
          },
        });

        setClient(c);
        setClientReady(true);
        setStatus("Umbra client ready");
      } catch (e: any) {
        if (cancelled) return;
        setStatus("Failed: " + (e?.message ?? String(e)));
      }
    }

    void init();

    return () => {
      cancelled = true;
    };
  }, [signer, rpcUrl, rpcSubscriptionsUrl]);

  useEffect(() => {
    let cancelled = false;

    async function loadRegistration() {
      if (!client) {
        setRegistration(null);
        return;
      }

      try {
        setStatus("Checking Umbra registration...");
        const query = getUserAccountQuerierFunction({ client });
        const result = await query(client.signer.address);

        if (cancelled) return;

        console.log("[Umbra] RAW REGISTRATION RESULT", result);

        setRegistration(result as RegistrationState);

        if (result.state === "non_existent") {
          setStatus("Umbra client ready — account not registered yet");
          return;
        }

        console.log("[Umbra] REGISTRATION DETAILS", {
          isInitialised: result.data.isInitialised,
          hasX25519: result.data.isUserAccountX25519KeyRegistered,
          hasCommitment: result.data.isUserCommitmentRegistered,
          isAnonymousActive: result.data.isActiveForAnonymousUsage,
        });

        const fullyRegistered =
          result.data.isUserAccountX25519KeyRegistered &&
          result.data.isUserCommitmentRegistered;

        setStatus(
          fullyRegistered
            ? "Umbra account ready"
            : "Umbra account partially registered"
        );
      } catch (e: any) {
        if (cancelled) return;
        setStatus("Registration check failed: " + (e?.message ?? String(e)));
      }
    }

    void loadRegistration();

    return () => {
      cancelled = true;
    };
  }, [client]);

  const isFullyRegistered =
    registration?.state === "exists" &&
    registration.data.isUserAccountX25519KeyRegistered &&
    registration.data.isUserCommitmentRegistered;

  async function refreshRegistrationState(activeClient = client) {
    if (!activeClient) return;

    const query = getUserAccountQuerierFunction({ client: activeClient });
    const result = await query(activeClient.signer.address);
    console.log("[Umbra] refreshed registration state", result);
    setRegistration(result as RegistrationState);
    return result;
  }

  async function handleRegister() {
    if (!client || registering) {
      console.log("[Umbra] register blocked", {
        hasClient: !!client,
        registering,
      });
      return;
    }

    console.log("[Umbra] register clicked", {
      address: client.signer?.address,
      registration,
      clientReady,
    });

    setRegistering(true);
    setStatus("Registering Umbra account...");

    try {
      const register = getUserRegistrationFunction(
        { client },
        { zkProver: registrationProver }
      );

      console.log("[Umbra] register() starting", {
        confidential: true,
        anonymous: true,
      });

      const signatures = await register({
        confidential: true,
        anonymous: true,
        callbacks: {
          userAccountInitialisation: {
            pre: async (tx) => {
              console.log("[Umbra] userAccountInitialisation pre FULL TX", tx);
              console.log("[Umbra] tx debug", {
                hasSignatures: !!tx.signatures,
                signatureKeys: tx.signatures ? Object.keys(tx.signatures) : [],
                signatureLengths: tx.signatures
                  ? Object.entries(tx.signatures).map(([k, v]) => ({
                      key: k,
                      length: v?.length,
                    }))
                  : [],
                messageBytesLength: tx.messageBytes?.length,
              });
            },
            post: async (_tx, sig) => {
              console.log("[Umbra] userAccountInitialisation post", sig);
              setStatus(`User account created: ${sig}`);
            },
          },
          registerX25519PublicKey: {
            pre: async (tx) => {
              console.log("[Umbra] registerX25519PublicKey pre", tx);
              setStatus("Registering X25519 key...");
            },
            post: async (_tx, sig) => {
              console.log("[Umbra] registerX25519PublicKey post", sig);
              setStatus(`X25519 key registered: ${sig}`);
            },
          },
          registerUserForAnonymousUsage: {
            pre: async (tx) => {
              console.log("[Umbra] registerUserForAnonymousUsage pre", tx);
              setStatus("Registering anonymous usage...");
            },
            post: async (_tx, sig) => {
              console.log("[Umbra] registerUserForAnonymousUsage post", sig);
              setStatus(`Anonymous usage registered: ${sig}`);
            },
          },
        },
      });

      console.log("[Umbra] register() finished", {
        signatures,
        count: signatures.length,
      });

      const refreshed = await refreshRegistrationState(client);
      console.log("[Umbra] refreshed registration state", refreshed);

      setStatus(
        signatures.length === 0
          ? "Already registered"
          : `Umbra registration complete (${signatures.length} tx(s))`
      );
    } catch (e: any) {
      console.error("[Umbra] register failed", e);

      if (isRegistrationError(e)) {
        console.log("[Umbra] registration error stage", e.stage);
        console.log("[Umbra] registration error full", {
          stage: e.stage,
          message: e?.message,
          error: e,
        });

        switch (e.stage) {
          case "master-seed-derivation":
            setStatus("Please approve the seed-signing message in your wallet.");
            break;
          case "transaction-sign":
            setStatus("Registration cancelled in wallet.");
            break;
          case "zk-proof-generation":
            setStatus("ZK proof generation failed: " + (e?.message ?? String(e)));
            break;
          case "account-fetch":
            setStatus("Registration account fetch failed: " + (e?.message ?? String(e)));
            break;
          case "transaction-send":
            setStatus("Registration sent but confirmation timed out.");
            await refreshRegistrationState(client);
            break;
          default:
            setStatus("Registration failed: " + (e?.message ?? String(e)));
            break;
        }
      } else {
        setStatus("Registration failed: " + (e?.message ?? String(e)));
      }
    } finally {
      console.log("[Umbra] register cleanup");
      setRegistering(false);
    }
  }

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5">
      <h2 className="mb-4 text-lg font-semibold">Umbra</h2>

      <div className="mb-2 text-sm">
        <strong>Wallet:</strong> {selection?.uiAccount?.address ?? "Not connected"}
      </div>

      <div className="mb-2 text-sm">
        <strong>Client:</strong> {clientReady ? "Ready" : "Not ready"}
      </div>

      <div className="mb-2 text-sm">
        <strong>Registration:</strong>{" "}
        {registration?.state === "exists"
          ? isFullyRegistered
            ? "Ready"
            : "Partial"
          : "Not registered"}
      </div>

      <button
        onClick={handleRegister}
        disabled={!client || registering || isFullyRegistered}
        className="rounded border border-white/20 bg-white/10 px-4 py-2 disabled:opacity-50"
      >
        {isFullyRegistered
          ? "Registered"
          : registering
          ? "Registering..."
          : "Register Umbra"}
      </button>

      <div className="mt-4 text-xs text-white/60">{status}</div>
    </div>
  );
}