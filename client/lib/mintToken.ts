import { PublicKey } from "@solana/web3.js";

import { createUmi } from "@metaplex-foundation/umi-bundle-defaults";
import {
  generateSigner,
  publicKey as umiPublicKey,
  percentAmount,
  some,
} from "@metaplex-foundation/umi";
import { walletAdapterIdentity } from "@metaplex-foundation/umi-signer-wallet-adapters";

import {
  createFungible,
  mplTokenMetadata,
} from "@metaplex-foundation/mpl-token-metadata";

import {
  createTokenIfMissing,
  findAssociatedTokenPda,
  mintTokensTo,
} from "@metaplex-foundation/mpl-toolbox";

type MintTokenMetadata = {
  name: string;
  symbol: string;
  uri: string;
};

const RPC_URL =
  process.env.NEXT_PUBLIC_RPC_URL ?? "https://api.devnet.solana.com";

function toAtomicAmount(uiAmount: number, decimals: number): bigint {
  if (!Number.isFinite(uiAmount) || uiAmount <= 0) {
    throw new Error("totalSupplyUi must be a positive number");
  }
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > 12) {
    throw new Error("decimals must be an integer between 0 and 12");
  }

  return BigInt(Math.floor(uiAmount * 10 ** decimals));
}

export async function mintToken(
  _connection: any,
  wallet: any,
  owner: PublicKey,
  totalSupplyUi: number,
  decimals = 6,
  metadata?: MintTokenMetadata
) {
  if (!wallet?.publicKey) {
    throw new Error("Wallet is not connected");
  }

  if (!wallet.publicKey.equals(owner)) {
    throw new Error("owner must match wallet.publicKey when wallet is the signer");
  }

  if (!metadata) {
    throw new Error("Metadata is required for fungible token creation.");
  }

  const name = metadata.name.trim();
  const symbol = metadata.symbol.trim().toUpperCase();
  const uri = metadata.uri.trim();

  if (!name) throw new Error("Token name is required for metadata.");
  if (!symbol) throw new Error("Token symbol is required for metadata.");
  if (!uri) throw new Error("Token metadata URI is required.");

  const amount = toAtomicAmount(totalSupplyUi, decimals);

  const umi = createUmi(RPC_URL)
    .use(walletAdapterIdentity(wallet))
    .use(mplTokenMetadata());

  const mint = generateSigner(umi);
  const ownerPk = umiPublicKey(owner.toBase58());
  const ata = findAssociatedTokenPda(umi, {
    mint: mint.publicKey,
    owner: ownerPk,
  });

  let builder = createFungible(umi, {
    mint,
    name,
    symbol,
    uri,
    sellerFeeBasisPoints: percentAmount(0),
    decimals: some(decimals),
  });

  builder = builder.add(
    createTokenIfMissing(umi, {
      mint: mint.publicKey,
      owner: ownerPk,
    })
  );

  builder = builder.add(
    mintTokensTo(umi, {
      mint: mint.publicKey,
      token: ata,
      amount,
    })
  );

  const result = await builder.sendAndConfirm(umi);

  return {
    mint: new PublicKey(mint.publicKey.toString()),
    ownerAta: new PublicKey(ata[0].toString()),
    signature: result.signature,
  };
}