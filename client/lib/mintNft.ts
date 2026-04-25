import {
  createNft,
} from "@metaplex-foundation/mpl-token-metadata";
import {
  generateSigner,
  percentAmount,
  publicKey as umiPublicKey,
} from "@metaplex-foundation/umi";



/**
 * Mint a 1/1 NFT to the connected wallet using UMI.
 */
export async function mintNft(
  umi: any,
  owner: string,
  metadataUri: string,
  name: string
): Promise<string> {
  const mint = generateSigner(umi);

  await createNft(umi, {
    mint,
    uri: metadataUri,
    name: name || "Auction NFT",
    sellerFeeBasisPoints: percentAmount(5),

    // IMPORTANT: ensure correct owner
    tokenOwner: umiPublicKey(owner),
  }).sendAndConfirm(umi);

  return mint.publicKey.toString();
}