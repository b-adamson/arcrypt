# ARCRYPT

Join us at [arcrypt.bid](https://arcrypt.bid)

ARCRYPT is a sealed-bid auction platform on Solana. It lets sellers auction tokens, NFTs, or metadata-only assets without exposing competing bids on-chain, helping prevent front-running, MEV, and other forms of bid leakage. Bid amounts are processed privately through Arcium MPC, while settlement still happens transparently on Solana. For the first time ever we leverage UMBRA to conceal committed bid escrows on chain, as well as hiding the same bid amount transmitted to Arcium MXE. 

Note: we are changing name from arcibid --> arcrypt. It may take some time for changes to fully apply as we migrate branding. 

## What ARCRYPT does

ARCRYPT is built for private price discovery.

Traditional public auctions reveal bids as they arrive, which can distort outcomes and invite manipulation. ARCIBID instead keeps bids encrypted, computes winners privately, and settles only the final result on-chain.

It supports:

* Sealed-bid auctions on Solana
* Total encryption of escrowed bid balances using UMBRA
* First-price auctions
* Vickrey (second-price) auctions
* Uniform-price auctions for multi-winner sales (up to 3 winners)
* Pro-rata auctions for multi-winner sales (up to 3 winners)
* Token, NFT, and metadata-only auctions
* DAO treasury auctions through proposal instructions

## How it works

ARCRYPT combines three pieces:

* **Solana program**: stores auction state and handles settlement
* **Arcium confidential compute**: evaluates encrypted bids without exposing them
* **Client app + SDK**: creates auctions, places bids, securely escrows funds, and settles winners

The flow is:

1. A seller creates an auction.
2. Bidders place encrypted bids.
3. Funds are escrowed securely.
4. Arcium computes the winner privately.
5. The program settles the auction on-chain.

## Repository structure

* `client/` — the website and user interface
* `sdk/` — the TypeScript library (`@arcrypt/sdk`) for auction commands
* `arcrypt/` — the on-chain program and Arcium computation setup

## Prerequisites

Before running the project, install the tools required by Solana and Arcium.

You will need:

* Git
* Node.js
* npm or pnpm
* Rust and Cargo
* Solana CLI
* Anchor
* Arcium tooling

Follow the Arcium Solana installation guide first:

[https://docs.arcium.com/developers/installation](https://docs.arcium.com/developers/installation)

## Getting started

### 1) Clone the repository

```bash
git clone https://github.com/b-adamson/ARCIBID
cd arcibid
```

### 2) Start a local Arcium Solana environment

Open a new terminal and run:

```bash
cd arcrypt
arcium localnet
```

This builds the program and starts the local environment used by the program and confidential computation runtime.

### 3) Initialize the computation definitions (localnet only)

This step is required when running ARCRYPT on a **local Arcium + Solana environment**. It registers all confidential computation definitions (auction init, bidding, winner selection) with the Arcium runtime.

First, create a `.env` file inside `arcrypt`:

```bash
OWNER_KEYPAIR_PATH=~/.config/solana/id.json
ARCIUM_CLUSTER_OFFSET=0
SOLANA_RPC_URL="http://localhost:8899"
```

- `OWNER_KEYPAIR_PATH` → path to your local Solana wallet  
- `ARCIUM_CLUSTER_OFFSET` → cluster index (use `0` for localnet)  
- `SOLANA_RPC_URL` → local validator RPC endpoint  

Then run:

```bash
cd arcrypt
ts-node initcompdef.ts
```

### 4) Airdrop SOL to your wallet

To fund your local wallet on the local validator, run:

```bash
solana airdrop 1000 <YOUR_WALLET_PUBKEY> --url http://localhost:8899
```

Or, if your Solana CLI is already pointed at the local validator, the URL flag may not be necessary.


### 5) Run the website

The website lives in `client/`.

From a new terminal:

```bash
cd client
npm install
npm run dev
```

Open the local URL shown in the terminal to use the app.

## SDK

The `sdk/` folder contains the TypeScript library for auction actions.

It exposes the commands used by the app and by integrators, including:

* `createAuction`
* `createPlaceBid`
* `createDetermineWinner`
* `createSettlement`
* low-level settlement builders

Install it with:

```bash
npm install @arcrypt/sdk
```

Note: the package may not be published yet, so for development you may need to import it directly from the repository. In the client, this is done automatically (see client/package.json)

## Auction types

ARCIBID supports multiple auction styles:

* **First-price**: highest bidder wins and pays their bid
* **Vickrey**: highest bidder wins and pays the second-highest bid
* **Uniform-price**: all winning bidders pay the same clearing price
* **Pro-rata**: winners receive a proportional share of the asset based on bid size

## Asset types

ARCIBID supports:

* **Fungible**: token sales
* **NFT**: single-item sales
* **MetadataOnly**: auctions without token transfer, useful for rights, access, or off-chain deliverables

## Developer workflow overview

The on-chain program is built around a few core steps:

1. **Create auction**
2. **Place bid**
3. **Close auction**
4. **Determine winner privately**
5. **Finalize settlement and refunds**

The Rust program uses Arcium compute definitions and callbacks to keep bid values encrypted while still resolving the auction correctly.

## Example SDK usage

```ts
import { PublicKey } from "@solana/web3.js";
import { createAuction, createPlaceBid } from "@arcrypt/sdk";

async function main() {
  const programClient = /* your Anchor client */;
  const programId = new PublicKey("PROGRAM_ID");
  const wallet = new PublicKey("WALLET_PUBKEY");

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

main().catch(console.error);
```

## Program ID

On devnet we are deployed at
* `HPV5kXxCZ7gBGWgMJwyqc9wZhTryjZcwSJUMdeyQ7en4`

## Troubleshooting

* Make sure the Arcium localnet is running before initializing computation definitions.
* Make sure your Solana CLI points to the local validator when testing locally.
* If bid settlement fails, confirm that the auction has ended and the correct settlement instruction is being used.
* Make sure, if testing in localnet, you have ARCIUM_CLUSTER_OFFSET=0 specified as a client environment variable. The SDK will default to 0 (localnet). The devnet program is deployed at 456

## Roadmap

Planned and in-progress areas include:

* Rust SDK support
* DAO Launchpad
* Mainnet Launch
* Complete UMBRA integration
* UX Changes

## License

Business Source License 1.1 (BSL)