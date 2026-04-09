import { NextResponse } from "next/server";
import { Connection, PublicKey } from "@solana/web3.js";
import { TOKEN_PROGRAM_ID } from "@solana/spl-token";

type TokenAccountRow = {
  pubkey: string;
  mint: string;
  owner: string;
  amount: string;
  decimals: number;
  uiAmountString: string;
};

type TreasuryGroup = {
  governance: string;
  nativeTreasury: string;
  tokenAccounts: TokenAccountRow[];
};

function getRpcUrl() {
  return (
    process.env.RPC_URL ||
    process.env.MAINNET_RPC_URL ||
    process.env.NEXT_PUBLIC_RPC_URL
  );
}


function deriveNativeTreasuryAddress(
  governanceProgramId: PublicKey,
  governancePk: PublicKey
) {
  return PublicKey.findProgramAddressSync(
    [Buffer.from("native-treasury"), governancePk.toBuffer()],
    governanceProgramId
  )[0];
}

async function fetchTokenAccountsByOwner(
  connection: Connection,
  ownerPk: PublicKey
): Promise<TokenAccountRow[]> {
  const res = await connection.getParsedTokenAccountsByOwner(ownerPk, {
    programId: TOKEN_PROGRAM_ID,
  });

  return res.value
    .map((entry) => {
      const parsed = (entry.account.data as any).parsed.info;
      return {
        pubkey: entry.pubkey.toBase58(),
        mint: parsed.mint,
        owner: parsed.owner,
        amount: parsed.tokenAmount.amount,
        decimals: parsed.tokenAmount.decimals,
        uiAmountString: parsed.tokenAmount.uiAmountString ?? "0",
      };
    })
    .filter((row) => BigInt(row.amount) > 0n);
}

async function listGovernancesForRealm(
  connection: Connection,
  governanceProgramId: PublicKey,
  realmPk: PublicKey
): Promise<PublicKey[]> {
  const accounts = await connection.getProgramAccounts(governanceProgramId, {
    filters: [
      {
        memcmp: {
          offset: 1, // ⚠️ realm field offset in Governance account
          bytes: realmPk.toBase58(),
        },
      },
    ],
  });

  return accounts.map((a) => a.pubkey);
}
async function fetchRealmCommunityMint(
  connection: Connection,
  programId: PublicKey,
  realmPk: PublicKey
): Promise<string> {
  const accountInfo = await connection.getAccountInfo(realmPk);
  if (!accountInfo) {
    throw new Error("Realm account not found");
  }

  // Realm layout:
  // byte 0 = account type
  // next 32 bytes = community mint
  const data = accountInfo.data;
  const communityMint = new PublicKey(data.slice(1, 33));
  console.log(communityMint.toString())

  return communityMint.toBase58();
}
function cleanPubkey(value: string | null | undefined): string {
  if (!value) return "";
  return value.trim().replace(/[)\]\}>,;]+$/g, "");
}
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const realm = cleanPubkey(url.searchParams.get("realm"));
    const programId = cleanPubkey(url.searchParams.get("programId"));

    if (!realm) {
      return NextResponse.json({ error: "realm is required" }, { status: 400 });
    }
    if (!programId) {
      return NextResponse.json({ error: "programId is required" }, { status: 400 });
    }

    const rpcUrl = getRpcUrl();
    if (!rpcUrl) {
      return NextResponse.json(
        { error: "Missing RPC_URL / MAINNET_RPC_URL / NEXT_PUBLIC_RPC_URL" },
        { status: 500 }
      );
    }

    const connection = new Connection(rpcUrl, "confirmed");

    const governanceProgramId = new PublicKey(programId);
    const realmPk = new PublicKey(realm);

    // TODO: fetch realm account here and read its community mint
    const communityMint = await fetchRealmCommunityMint(connection, governanceProgramId, realmPk);

    const governancePks = await listGovernancesForRealm(
      connection,
      governanceProgramId,
      realmPk
    );

    const treasuries: TreasuryGroup[] = [];

    for (const governancePk of governancePks) {
      const nativeTreasury = deriveNativeTreasuryAddress(governanceProgramId, governancePk);
      const tokenAccounts = await fetchTokenAccountsByOwner(connection, nativeTreasury);

      treasuries.push({
        governance: governancePk.toBase58(),
        nativeTreasury: nativeTreasury.toBase58(),
        tokenAccounts,
      });
    }

    return NextResponse.json({
      realm: realmPk.toBase58(),
      governanceProgramId: governanceProgramId.toBase58(),
      communityMint,
      treasuries,
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err?.message ?? String(err) },
      { status: 500 }
    );
  }
}