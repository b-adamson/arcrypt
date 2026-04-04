'use client';

import DocsSidebar from '../../components/DocsSidebar';
import Link from 'next/link';
import CodeBlock from "@/components/CodeBlock";

export default function DocsPage() {
  return (
<main className="bg-neutral-950 text-white min-h-screen">
  <div className="mx-auto max-w-7xl px-6 py-12 lg:py-20 lg:pl-72">
    <DocsSidebar />


        <div>
          {/* Page header */}
          <header className="mb-8">
            <h1 className="text-4xl font-extrabold gradient-heading">ARCIBID Docs</h1>
            <p className="mt-3 text-gray-400 max-w-2xl">
              Everything there is to know
            </p>
          </header>

          {/* Sections — make sure the ids match the sidebar NAV */}
          <section id="intro" className="mb-16">
            <h2 className="text-2xl font-bold mb-4 gradient-heading">Intro to ARCIBID</h2>

            <h3 id="what-is-arcibid" className="text-xl font-semibold mb-3">What is ARCIBID</h3>
            <p className="text-gray-300">
              ARCIBID is a private auction platform on Solana designed to maximize value without exposing bids.

List tokens, NFTs, or DAO treasury assets in fully sealed auctions where no participant can see competing bids. By eliminating front-running and MEV, ARCIBID ensures fair competition. The highest bidder is incentivised to pay what your asset is truly worth.

ARCIBID leverages state of the art cryptography and MPC technology to keep your money entirely hidden from the chain. <br /> <br />Selling assets is harder than it looks. OTC deals rely on negotiation and often do not result in the best price. Public auctions expose bids in real time, inviting bots, MEV, and front-running that distort true price discovery.
ARCIBID solves this with sealed, private auctions - removing information leakage and ensuring bidders compete based on true value, not strategy or manipulation. While it can integrate directly with DAOs to auction treasury assets through proposals, you don’t need to be a DAO to use it. Anyone can auction tokens, NFTs, or other on-chain assets they own, and optionally list them on the ARCIBID marketplace to reach a wider pool of serious bidders without sacrificing privacy.
            </p>

            <h3 id="mission" className="text-xl font-semibold mb-3 mt-6">The Mission</h3>
            <p className="text-gray-300">We firmly believe privacy is a central human right. Nobody needs to know what you do with your data, and that includes your money. </p>
          </section>

          <section id="arcium" className="mb-16">
            <h2 className="text-2xl font-bold mb-4 gradient-heading">What is Arcium</h2>
<p className="text-gray-300">
  <a
    href="https://docs.arcium.com/"
    target="_blank"
    rel="noopener noreferrer"
    className="text-pink-300 hover:underline"
  >
    Arcium
  </a>{" "}
  is a next-generation privacy layer on Solana, built using Multi-Party Computation (MPC). This means bid amounts are never exposed in plaintext—not even to the network. Bids are encrypted client-side and processed collectively by Arcium nodes, which compute the highest bid without revealing any individual inputs.
  <br /><br />

  At its core, Arcium enables totally decentralized confidential computation—allowing data to remain private while still being used in verifiable on-chain logic. This is critical for sealed auctions, where information leakage would otherwise undermine fairness.
  <br /><br />

  ARCIBID leverages the Arcium Confidential Token Standard to securely escrow bidder funds. This introduces program-controlled private balances for the first time, enabling fully private, trustless auctions without compromising on-chain settlement or transparency of outcomes.
</p>
          </section>


<section id="ensuring-privacy" className="mb-16">
  <h2 className="text-2xl font-bold mb-4 gradient-heading">Ensuring privacy</h2>

  <div className="text-gray-300 max-w-5xl space-y-4">
    <p>
      ARCIBID automatically generates an{" "}
      <a
        href="https://sdk.umbraprivacy.com/introduction"
        target="_blank"
        rel="noopener noreferrer"
        className="text-pink-300 hover:underline"
      >
        UMBRA
      </a>{" "}
      encrypted token account (
      <a
        href="https://sdk.umbraprivacy.com/concepts/encrypted-balances"
        target="_blank"
        rel="noopener noreferrer"
        className="text-pink-300 hover:underline"
      >
        ETA
      </a>
      ) associated with your wallet address. This ETA is the link between the private world and the public chain. Funds can be moved in and out of your ARCIBID account in the Profile page.
    </p>

    <p>
      This enables you to move SPL tokens in and out of a private balance arbitrarily, thus obscuring your activity. All bids are made with USDC. Placing a bid will transfer funds from your ETA to an escrow account (transferring any missing funds from your public wallet, then to the ETA, then to the escrow) which is controlled by the ARCIBID program. The escrow funds exist within the{" "}
      <a
        href="https://sdk.umbraprivacy.com/sdk/mixer/overview"
        target="_blank"
        rel="noopener noreferrer"
        className="text-pink-300 hover:underline"
      >
        shielded pool
      </a>
      .
    </p>

    <p>
      The UMBRA program performs a rescue cipher of the bid amount against the ARCIBID mixed execution environment, controlled by the{" "}
      <a
        href="https://docs.arcium.com/developers"
        target="_blank"
        rel="noopener noreferrer"
        className="text-pink-300 hover:underline"
      >
        Arcium MPC network
      </a>
      . ARCIBID validates the ciphertext and sends it to the MXE where we compare it against the current highest bid(s). The exact computation depends on the type of auction (see below).
    </p>

    <p>
      Your bid or bidder identity is never revealed during this process, as the bid comparison computation is performed across hundreds of nodes in the Arcium network, such that no individual node can ever determine any information about the computation or its result.
    </p>

    <p>
      We will eventually migrate to the confidential token standard to simplify the flow and directly read escrow accounts within the MXE, rather than sending the encrypted amount as ciphertext to the MXE.
    </p>
  </div>
</section>


          <section id="rules" className="mb-16">
  <h2 className="text-2xl font-bold mb-4 gradient-heading">How it works</h2>

  <h3 id="seller-flow" className="font-semibold text-lg text-gray-200 mb-2">Seller flow</h3>
  <ul className="list-disc ml-5 text-gray-300 mb-4">
    <li>Connect your wallet and select the on-chain address / asset you want to auction (tokens, NFTs).</li>
    <li>If applicable, you can connect with Realms, MetaDAO or any DAO that accepts arbitrary instructions to propose the auction of a specific number of treasury tokens.</li>
    <li>Set a floor price and choose an auction type (first-price, Vickrey, or uniform).</li>
    <li>Specify a custom duration (up to 30 days) and attach optional metadata (descriptions, provenance, external links).</li>
    <li>Publish the auction — bids remain encrypted until the reveal step, preserving bidder privacy throughout the process.</li>
  </ul>

  <h3 id="auction-types" className="font-semibold text-lg text-gray-200 mb-2">Auction types</h3>
  <ul className="list-disc ml-5 text-gray-300 mb-4">
    <li>
      <strong>First-price (normal) auction:</strong> the highest bidder pays the amount they submitted.
    </li>
    <li>
      <strong>Vickrey (second-price) auction:</strong> the highest bidder wins, but pays the second-highest bid. Incentivizes bidders to submit true valuations.
    </li>
    <li>
      <strong>Uniform-price auction:</strong> used for multiple identical items — winning bidders all pay the same clearing price (e.g., the highest losing bid or the lowest winning bid depending on rules).
    </li>
  </ul>

  <h3 id="bidding-escrow" className="font-semibold text-lg text-gray-200 mb-2">Bidding & escrow</h3>
  <p className="text-gray-300 mb-4">
    When a bidder places funds, ARCIBID automatically wraps them into Arcium’s confidential token standard and escrows them securely.
  </p>

  <h3 id="settlement" className="font-semibold text-lg text-gray-200 mb-2">Settlement</h3>
  <ul className="list-disc ml-5 text-gray-300">
    <li>At auction close, bids are revealed and the winner is determined according to the chosen auction type.</li>
    <li>On-chain settlement transfers the asset to the winner and the proceeds to the seller; all escrowed bidders who didn’t win are automatically refunded.</li>
    <li>Every transfer is verifiable while preserving bid privacy—so outcomes are auditable without leaking individual bid amounts.</li>
  </ul>
</section>

          <section id="dao-proposal" className="mb-16">
            <h2 className="text-2xl font-bold mb-4 gradient-heading">Create a DAO proposal</h2>
            <p className="text-gray-300">Connect directly with Realms, MetaDAO or any DAO that accepts arbitrary instructions to call the ARCIBID program and propose to auction treasury tokens. Just specify the amount and duration and auction rules as normal.</p>
          </section>

          <section id="arcibid-dao" className="mb-16">
            <h2 className="text-2xl font-bold mb-4 gradient-heading">Create an ARCIBID DAO</h2>
            <p className="text-gray-300">We are rapidly developing a new DAO Launchpad that tokenizes part of the initial token sale that are bought via sealed bids. This is excellent for new startups looking for maximal price discovery. We will also build Realms integration to enable you to start a Realms DAO with a section of the initial treasury available via sealed-auction.</p>
          </section>

<section id="developers" className="mb-8 scroll-mt-32">
  <h2 className="text-2xl font-bold mb-4 gradient-heading">Developers</h2>

  <p className="text-gray-300 max-w-3xl">
    Install the SDK with:
  </p>

  <CodeBlock
    language="bash"
    code={`npm install @arcibid/sdk`}
  />

  <p className="text-gray-400 text-sm mt-2">
  Note: the package is not deployed yet — use the SDK directly from the{" "}
  <a
    href="https://github.com/b-adamson/ARCIBID"
    target="_blank"
    rel="noopener noreferrer"
    className="underline text-white"
  >
    repository
  </a>{" "}
  for now.
</p>

  <div className="mt-10 space-y-10">
    <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
      <h3 className="text-lg font-semibold mb-4">Core Functions</h3>

      <div className="mb-6">
        <div className="font-medium text-white mb-2">createAuction</div>
        <CodeBlock
          language="ts"
          code={`type CreateAuctionParams = {
  programClient: any;
  programId: PublicKey;
  publicKey: PublicKey;

  authorityBase58: string;
  sourceTokenAccountBase58?: string;

  minBidSol: string;           // e.g. "1.5"
  durationSecs: number;        // auction length in seconds

  auctionType: "FirstPrice" | "Vickrey" | "Uniform" | "ProRata";
  assetKind: "Fungible" | "Nft" | "MetadataOnly";

  metadataUri: string;

  tokenMint?: string;          // required for tokens/NFTs
  saleAmountToken?: string;    // e.g. "100.0"
};`}
        />
        <p className="text-gray-400 text-sm mt-2">
          Creates an auction instruction and returns a transaction bundle ready to send.
        </p>
      </div>

      <div className="mb-6">
        <div className="font-medium text-white mb-2">createPlaceBid</div>
        <CodeBlock
          language="ts"
          code={`type CreatePlaceBidParams = {
  programClient: any;
  programId: PublicKey;
  publicKey: PublicKey;

  auctionPk: PublicKey;
  bidAmountSol: string;  // e.g. "2.0"
  nonceHex?: string;     // optional custom nonce
};`}
        />
        <p className="text-gray-400 text-sm mt-2">
          Encrypts and submits a bid using Arcium MPC. Funds are escrowed privately.
        </p>
      </div>

      <div className="mb-6">
        <div className="font-medium text-white mb-2">createDetermineWinner</div>
        <CodeBlock
          language="ts"
          code={`type CreateDetermineWinnerParams = {
  programClient: any;
  programId: PublicKey;
  publicKey: PublicKey;

  auctionPk: PublicKey;
  which: "first" | "vickrey" | "uniform" | "proRata";
};`}
        />
        <p className="text-gray-400 text-sm mt-2">
          Triggers encrypted winner computation via Arcium.
        </p>
      </div>

      <div>
        <div className="font-medium text-white mb-2">createSettlement</div>
        <CodeBlock
          language="ts"
          code={`type CreateSettlementParams = {
  programClient: any;
  programId: PublicKey;
  publicKey: PublicKey;

  auctionPk: PublicKey;
  auctionData: any;

  escrowExists?: boolean;
  action?: "auto" | "reclaimUnsold" | "claimRefund" | "settleWinner";
};`}
        />
        <p className="text-gray-400 text-sm mt-2">
          Automatically determines whether to reclaim, refund, or settle the auction.
        </p>
      </div>
    </div>

    <div className="mt-8">
  <div className="font-medium text-white mb-2">
    Low-level settlement builders
  </div>

  <p className="text-gray-400 text-sm mb-3">
    For advanced usage, ARCIBID also exposes lower-level transaction builders used internally by{" "}
    <span className="text-white">createSettlement</span>. These allow you to explicitly control
    settlement behavior.
  </p>

  <CodeBlock
    language="ts"
    code={`buildReclaimUnsoldTransaction()
buildClaimRefundTransaction()
buildSettleWinnerTransaction()`}
  />

  <p className="text-gray-400 text-xs mt-2">
    These functions return transaction bundles and require the same core inputs
    (programClient, programId, publicKey, auctionPk, auctionData).
  </p>
</div>

    <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
      <h3 className="text-lg font-semibold mb-4">Minimal Example</h3>

      <CodeBlock
        language="ts"
        code={`import { PublicKey } from "@solana/web3.js";
import { createAuction, createPlaceBid } from "@arcibid/sdk";

async function main() {
  const programClient = /* your Anchor client */;
  const programId = new PublicKey("PROGRAM_ID");
  const wallet = new PublicKey("WALLET_PUBKEY");

  // 1. Create auction
  const auction = await createAuction({
    programClient,
    programId,
    publicKey: wallet,

    authorityBase58: wallet.toBase58(),
    minBidSol: "1.0",
    durationSecs: 3600,

    auctionType: "FirstPrice",
    assetKind: "Fungible",

    metadataUri: "https://example.com/meta.json",
    tokenMint: "TOKEN_MINT",
    saleAmountToken: "100",
  });

  // 2. Place bid
  const bid = await createPlaceBid({
    programClient,
    programId,
    publicKey: wallet,

    auctionPk: auction.auctionPda,
    bidAmountSol: "2.5",
  });

  console.log("Auction TX:", auction.transaction);
  console.log("Bid TX:", bid.transaction);
}

main().catch(console.error);`}
      />
    </div>

    <div className="rounded-2xl border border-white/10 bg-white/5 p-6">
      <h3 className="text-lg font-semibold mb-2">Rust SDK</h3>
      <p className="text-gray-300">Coming soon.</p>
    </div>
  </div>
</section>

          <section id="faq">
            <h2 className="text-2xl font-bold mb-4 gradient-heading">FAQ</h2>
            <div className="space-y-4 text-gray-300">
              <div>
                <div className="font-medium">Are bids really private?</div>
                <div className="text-sm">Yes. Bids are encrypted using Arcium confidential compute.</div>
              </div>
              {/* more FAQ items */}
            </div>
          </section>

          <div className="mt-20">
            <Link href="/" className="text-sm text-gray-400 hover:text-white">← Back to home</Link>
          </div>
        </div>
      </div>
    </main>
  );
}