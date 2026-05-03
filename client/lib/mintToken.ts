import {
  Connection,
  Keypair,
  PublicKey,
  Transaction,
  SystemProgram,
} from "@solana/web3.js";

import {
  TOKEN_PROGRAM_ID,
  createInitializeMintInstruction,
  getAssociatedTokenAddress,
  createAssociatedTokenAccountInstruction,
  createMintToInstruction,
  createSetAuthorityInstruction,
  AuthorityType,
} from "@solana/spl-token";

export async function mintToken(
  connection: Connection,
  wallet: any,
  owner: PublicKey,
  totalSupplyUi: number,
  decimals = 6
) {
  const mint = Keypair.generate();

  const ata = await getAssociatedTokenAddress(
    mint.publicKey,
    owner
  );

  const lamports =
    await connection.getMinimumBalanceForRentExemption(82);

  const amount = BigInt(
    Math.floor(totalSupplyUi * 10 ** decimals)
  );

  const tx = new Transaction();

  // 1. Create mint account
  tx.add(
    SystemProgram.createAccount({
      fromPubkey: owner,
      newAccountPubkey: mint.publicKey,
      space: 82,
      lamports,
      programId: TOKEN_PROGRAM_ID,
    })
  );

  // 2. Initialize mint
  tx.add(
    createInitializeMintInstruction(
      mint.publicKey,
      decimals,
      owner,
      owner
    )
  );

  // 3. Create ATA
  tx.add(
    createAssociatedTokenAccountInstruction(
      owner,
      ata,
      owner,
      mint.publicKey
    )
  );

  // 4. Mint tokens
  tx.add(
    createMintToInstruction(
      mint.publicKey,
      ata,
      owner,
      amount
    )
  );

  // 5. Revoke mint authority
  tx.add(
    createSetAuthorityInstruction(
      mint.publicKey,
      owner,
      AuthorityType.MintTokens,
      null
    )
  );

  tx.feePayer = owner;

  const { blockhash } =
    await connection.getLatestBlockhash();

  tx.recentBlockhash = blockhash;

  tx.partialSign(mint);

  if (!wallet?.signTransaction) {
  throw new Error("Wallet adapter does not support signTransaction");
}

const signed = await wallet.signTransaction(tx);
try {
  const sig = await connection.sendRawTransaction(signed.serialize());
  await connection.confirmTransaction(sig);

  return {
    mint: mint.publicKey,
    ownerAta: ata,
  };

} catch (e: any) {
  const msg = String(e?.message || "");

  if (msg.includes("already been processed")) {
    console.warn("Mint tx already processed");

    return {
      mint: mint.publicKey,
      ownerAta: ata,
    };
  }

  throw e;
}
}