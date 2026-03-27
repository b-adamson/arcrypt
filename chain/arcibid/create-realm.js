// create-realm.js
const BN = require("bn.js");
const { Keypair, PublicKey, Connection, Transaction, sendAndConfirmTransaction } = require("@solana/web3.js");
const { withCreateRealm, MintMaxVoteWeightSource } = require("@realms-today/spl-governance");

(async () => {
  const connection = new Connection("https://devnet.helius-rpc.com/?api-key=2264d5db-8075-444b-ac27-a0e614a053d3", "confirmed");
  const payer = Keypair.fromSecretKey(
    Uint8Array.from(JSON.parse(require("fs").readFileSync(process.env.HOME + "/.config/solana/id.json", "utf8")))
  );

  const programId = new PublicKey("GovMaiHfpVPw8BAM1mbdzgmSZYDw2tdP32J2fapoQoYs"); 
  const communityMint = new PublicKey("9kgsc8LC4SwNwZUfL16TPPCnepDmgH5va3qHcgcYVp5T");
  const councilMint = process.env.COUNCIL_MINT ? new PublicKey(process.env.COUNCIL_MINT) : undefined;

  const instructions = [];
  const realmAddress = await withCreateRealm(
    instructions,
    programId,
    3,
    process.env.REALM_NAME || "My DAO",
    payer.publicKey,
    communityMint,
    payer.publicKey,
    councilMint,
    MintMaxVoteWeightSource.FULL_SUPPLY_FRACTION,
    new BN(1)
  );

  const tx = new Transaction().add(...instructions);
  await sendAndConfirmTransaction(connection, tx, [payer]);

  console.log("Realm created:", realmAddress.toBase58());
})().catch((err) => {
  console.error(err);
  process.exit(1);
});