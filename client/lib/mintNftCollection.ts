import {
  createNft,
  verifyCollectionV1,
  findMetadataPda,
} from "@metaplex-foundation/mpl-token-metadata";
import {
  generateSigner,
  percentAmount,
  publicKey as umiPublicKey,
  some,
} from "@metaplex-foundation/umi";

export async function createMetaplexCollection(
  umi: any,
  metadataUri: string,
  name: string
): Promise<string> {
  const collectionMint = generateSigner(umi);

  await createNft(umi, {
    mint: collectionMint,
    name,
    uri: metadataUri,
    sellerFeeBasisPoints: percentAmount(0),
    isCollection: true,
  }).sendAndConfirm(umi);

  return collectionMint.publicKey.toString();
}

export async function mintCollectionNft(
  umi: any,
  owner: string,
  metadataUri: string,
  name: string,
  collectionMintAddress: string
): Promise<string> {
  const mint = generateSigner(umi);
  const collectionMintPk = umiPublicKey(collectionMintAddress);

  await createNft(umi, {
    mint,
    name,
    uri: metadataUri,
    sellerFeeBasisPoints: percentAmount(5),
    tokenOwner: umiPublicKey(owner),
    collection: some({ key: collectionMintPk, verified: false }),
  }).sendAndConfirm(umi);

  const nftMetadataPda = findMetadataPda(umi, { mint: mint.publicKey });

  await verifyCollectionV1(umi, {
    metadata: nftMetadataPda,
    collectionMint: collectionMintPk,
    authority: umi.identity,
  }).sendAndConfirm(umi);

  return mint.publicKey.toString();
}
