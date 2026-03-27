import { BN } from "@coral-xyz/anchor";
import crypto from "crypto";
import { Buffer } from "buffer";
import { getAssociatedTokenAddressSync, getMint, TOKEN_PROGRAM_ID, } from "@solana/spl-token";
import { PublicKey, Transaction, } from "@solana/web3.js";
import { AccountMetaData, InstructionData, VoteType, getTokenOwnerRecordAddress, withCreateProposal, withInsertTransaction, withSignOffProposal, } from "@realms-today/spl-governance";
import { getArciumEnv, getMXEPublicKey, x25519, RescueCipher, deserializeLE, getMXEAccAddress, getClusterAccAddress, getMempoolAccAddress, getExecutingPoolAccAddress, getFeePoolAccAddress, getClockAccAddress, getCompDefAccOffset, getCompDefAccAddress, getComputationAccAddress, getArciumProgram, } from "@arcium-hq/client";
import dotenv from "dotenv";
dotenv.config();
function solToLamportsBN(sol) {
    const s = sol.trim();
    if (!s)
        throw new Error("Enter an amount in SOL.");
    if (!/^\d+(\.\d{0,9})?$/.test(s)) {
        throw new Error("Use a valid SOL amount with up to 9 decimals.");
    }
    const [whole, frac = ""] = s.split(".");
    const fracPadded = (frac + "000000000").slice(0, 9);
    const lamports = BigInt(whole || "0") * 1000000000n + BigInt(fracPadded);
    if (lamports <= 0n)
        throw new Error("Amount must be greater than 0 SOL.");
    return new BN(lamports.toString());
}
const DEFAULT_PUBKEY = "11111111111111111111111111111111";
function enumKey(v) {
    if (v && typeof v === "object")
        return Object.keys(v)[0];
    return String(v ?? "");
}
function toBase58Maybe(v) {
    if (!v)
        return "";
    return v?.toBase58?.() ?? new PublicKey(v).toBase58();
}
function decimalToBaseUnitsBN(amount, decimals) {
    const s = amount.trim();
    if (!s)
        throw new Error("Enter an amount.");
    if (!/^\d+(\.\d{0,18})?$/.test(s)) {
        throw new Error("Use a valid decimal amount.");
    }
    const [whole, frac = ""] = s.split(".");
    const fracPadded = (frac + "0".repeat(decimals)).slice(0, decimals);
    const wholeFactor = 10n ** BigInt(decimals);
    const baseUnits = BigInt(whole || "0") * wholeFactor + BigInt(fracPadded || "0");
    if (baseUnits <= 0n)
        throw new Error("Amount must be greater than 0.");
    return new BN(baseUnits.toString());
}
function ixToRawView(label, ix) {
    return {
        label,
        dataBase64: Buffer.from(ix.data).toString("base64"),
    };
}
function txFromIxs(...ixs) {
    return new Transaction().add(...ixs);
}
function getAllowedAuctionTypes(kind) {
    if (kind === "Fungible")
        return ["FirstPrice", "Vickrey", "Uniform", "ProRata"];
    return ["FirstPrice", "Vickrey"];
}
function normalizeAuctionType(kind, current) {
    const allowed = getAllowedAuctionTypes(kind);
    return allowed.includes(current) ? current : allowed[0];
}
function auctionTypeToArg(auctionType) {
    return auctionType === "FirstPrice"
        ? { firstPrice: {} }
        : auctionType === "Vickrey"
            ? { vickrey: {} }
            : auctionType === "Uniform"
                ? { uniform: {} }
                : { proRata: {} };
}
function assetKindToArg(assetKind) {
    return assetKind === "Fungible"
        ? { fungible: {} }
        : assetKind === "Nft"
            ? { nft: {} }
            : { metadataOnly: {} };
}
async function buildAuctionCore(params) {
    const { programClient, programId, publicKey, authorityBase58, sourceTokenAccountBase58, makeAuctionResult, minBidSol, durationSecs, auctionType, assetKind, metadataUri, tokenMint, saleAmountToken, } = params;
    if (!programClient || !publicKey) {
        throw new Error("Wallet / program client not ready.");
    }
    const ctx = makeAuctionResult ??
        (() => {
            const authority = new PublicKey(authorityBase58);
            const clusterOffset = Number(process.env.ARCIUM_CLUSTER_OFFSET ?? 0);
            const mxePk = getMXEAccAddress(programId);
            const clusterPk = new PublicKey(getClusterAccAddress(clusterOffset));
            const mempoolPk = new PublicKey(getMempoolAccAddress(clusterOffset));
            const executingPoolPk = new PublicKey(getExecutingPoolAccAddress(clusterOffset));
            const poolPk = new PublicKey(getFeePoolAccAddress());
            const clockPk = new PublicKey(getClockAccAddress());
            const randSeed = crypto.randomBytes(8);
            const [auctionPda] = PublicKey.findProgramAddressSync([Buffer.from("auction"), authority.toBuffer(), randSeed], programId);
            const signPda = PublicKey.findProgramAddressSync([Buffer.from("ArciumSignerAccount")], programId)[0];
            const compDefOffsetNum = Buffer.from(getCompDefAccOffset("init_auction_state")).readUInt32LE(0);
            const compDefPk = getCompDefAccAddress(programId, compDefOffsetNum);
            const computationOffset = new BN(crypto.randomBytes(8), "hex");
            const computationPk = getComputationAccAddress(clusterOffset, computationOffset);
            return {
                auctionPda: auctionPda.toBase58(),
                auctionSeedHex: randSeed.toString("hex"),
                signPda: signPda.toBase58(),
                compDefOffsetNum,
                compDefPk: compDefPk.toBase58(),
                mxePk: mxePk.toBase58(),
                clusterPk: clusterPk.toBase58(),
                mempoolPk: mempoolPk.toBase58(),
                executingPoolPk: executingPoolPk.toBase58(),
                poolPk: poolPk.toBase58(),
                clockPk: clockPk.toBase58(),
                computationOffset: computationOffset.toString(),
                computationPk: computationPk?.toBase58() ?? null,
            };
        })();
    const computationOffset = new BN(ctx.computationOffset);
    const compDefPk = new PublicKey(ctx.compDefPk);
    const auctionPda = new PublicKey(ctx.auctionPda);
    const signPda = new PublicKey(ctx.signPda);
    const authorityPk = new PublicKey(authorityBase58);
    const minBidLamports = solToLamportsBN(minBidSol);
    const endTime = Math.floor(Date.now() / 1000) + Number(durationSecs);
    const auctionTypeArg = auctionTypeToArg(normalizeAuctionType(assetKind, auctionType));
    const assetKindArg = assetKindToArg(assetKind);
    const commonAccounts = {
        authority: authorityPk,
        auction: auctionPda,
        signPdaAccount: signPda,
        mxeAccount: new PublicKey(ctx.mxePk),
        mempoolAccount: new PublicKey(ctx.mempoolPk),
        executingPool: new PublicKey(ctx.executingPoolPk),
        computationAccount: new PublicKey(ctx.computationPk ?? "11111111111111111111111111111111"),
        compDefAccount: compDefPk,
        clusterAccount: new PublicKey(ctx.clusterPk),
    };
    let tokenDecimals;
    if (assetKind === "MetadataOnly") {
        const auctionIx = await programClient.methods
            .createMetadataAuction(computationOffset, Buffer.from(ctx.auctionSeedHex, "hex"), auctionTypeArg, new BN(minBidLamports.toString()), new BN(endTime), metadataUri)
            .accounts(commonAccounts)
            .instruction();
        return {
            srv: ctx,
            auctionIx,
            auctionPda,
            auctionSeedHex: ctx.auctionSeedHex,
            tokenDecimals,
            rawInstructions: [ixToRawView("createMetadataAuction", auctionIx)],
        };
    }
    if (!tokenMint) {
        throw new Error("Token mint is required for SPL token and NFT auctions.");
    }
    const prizeMintPk = new PublicKey(tokenMint);
    const mintInfo = await getMint(programClient.provider.connection, prizeMintPk);
    tokenDecimals = mintInfo.decimals;
    const authorityTokenAccountPk = sourceTokenAccountBase58
        ? new PublicKey(sourceTokenAccountBase58)
        : getAssociatedTokenAddressSync(prizeMintPk, authorityPk);
    const saleAmountBaseUnits = assetKind === "Nft"
        ? new BN(1)
        : decimalToBaseUnitsBN(saleAmountToken ?? "", mintInfo.decimals);
    if (assetKind === "Nft") {
        if (mintInfo.decimals !== 0) {
            throw new Error("NFT mode requires a mint with 0 decimals.");
        }
        if (saleAmountBaseUnits.toString() !== "1") {
            throw new Error("NFT sale amount must be 1.");
        }
    }
    const vaultAuthorityPk = PublicKey.findProgramAddressSync([Buffer.from("vault-authority"), auctionPda.toBuffer()], programId)[0];
    const prizeVaultPk = getAssociatedTokenAddressSync(prizeMintPk, vaultAuthorityPk, true);
    const auctionIx = await programClient.methods
        .createTokenAuction(computationOffset, Buffer.from(ctx.auctionSeedHex, "hex"), auctionTypeArg, assetKindArg, new BN(minBidLamports.toString()), new BN(endTime), new BN(saleAmountBaseUnits.toString()), metadataUri)
        .accounts({
        ...commonAccounts,
        prizeMint: prizeMintPk,
        authorityTokenAccount: authorityTokenAccountPk,
        prizeVault: prizeVaultPk,
        vaultAuthority: vaultAuthorityPk,
        tokenProgram: TOKEN_PROGRAM_ID,
    })
        .instruction();
    return {
        srv: ctx,
        auctionIx,
        auctionPda,
        auctionSeedHex: ctx.auctionSeedHex,
        tokenDecimals,
        rawInstructions: [ixToRawView("createTokenAuction", auctionIx)],
    };
}
export async function createSPLGovernanceProposal(params) {
    const { programClient, programId, publicKey, authorityBase58, sourceTokenAccountBase58, makeAuctionResult, minBidSol, durationSecs, auctionType, assetKind, metadataUri, tokenMint, saleAmountToken, realmAddress, governanceProgramId, governanceAddress, communityMint, proposalName, proposalDescription, } = params;
    if (assetKind === "MetadataOnly") {
        throw new Error("Governance proposal mode only supports token-backed auctions.");
    }
    if (!programClient || !publicKey) {
        throw new Error("Connect wallet first.");
    }
    if (!communityMint) {
        throw new Error("Realm community mint is missing.");
    }
    const realmPk = new PublicKey(realmAddress);
    const governanceProgramPk = new PublicKey(governanceProgramId);
    const governancePk = new PublicKey(governanceAddress);
    const communityMintPk = new PublicKey(communityMint);
    const tokenOwnerRecordPk = await getTokenOwnerRecordAddress(governanceProgramPk, realmPk, communityMintPk, publicKey);
    const accountInfo = await programClient.provider.connection.getAccountInfo(tokenOwnerRecordPk);
    if (!accountInfo) {
        throw new Error("No governance deposit found. Deposit community tokens into the realm first.");
    }
    const core = await buildAuctionCore({
        programClient,
        programId,
        publicKey,
        authorityBase58,
        sourceTokenAccountBase58,
        makeAuctionResult,
        minBidSol,
        durationSecs,
        auctionType,
        assetKind,
        metadataUri,
        tokenMint,
        saleAmountToken,
    });
    const proposalDescriptionWithLink = `${proposalDescription.trim()}

Check it out here: http://localhost:3000/bid?auctionPk=${core.srv.auctionPda}`;
    const proposalInstructions = [];
    const proposalAddress = await withCreateProposal(proposalInstructions, governanceProgramPk, 3, realmPk, governancePk, tokenOwnerRecordPk, proposalName, proposalDescriptionWithLink, communityMintPk, publicKey, undefined, VoteType.SINGLE_CHOICE, ["Approve"], true, publicKey);
    const instructionData = [core.auctionIx].map((ix) => new InstructionData({
        programId: ix.programId,
        accounts: ix.keys.map((k) => new AccountMetaData({
            pubkey: k.pubkey,
            isSigner: k.isSigner,
            isWritable: k.isWritable,
        })),
        data: ix.data,
    }));
    const insertInstructions = [];
    await withInsertTransaction(insertInstructions, governanceProgramPk, 3, governancePk, proposalAddress, tokenOwnerRecordPk, publicKey, 0, 0, 0, instructionData, publicKey);
    const signOffInstructions = [];
    await withSignOffProposal(signOffInstructions, governanceProgramPk, 3, realmPk, governancePk, proposalAddress, publicKey, undefined, tokenOwnerRecordPk);
    const proposalTransactions = proposalInstructions.length ? [txFromIxs(...proposalInstructions)] : [];
    const insertTransactions = insertInstructions.length ? [txFromIxs(...insertInstructions)] : [];
    const signOffTransactions = signOffInstructions.length ? [txFromIxs(...signOffInstructions)] : [];
    const transactions = [...proposalTransactions, ...insertTransactions, ...signOffTransactions];
    return {
        ...core,
        proposalAddress,
        proposalInstructions,
        proposalTransactions,
        insertInstructions,
        insertTransactions,
        signOffInstructions,
        signOffTransactions,
        transactions,
    };
}
function txFromInstruction(ix) {
    return new Transaction().add(ix);
}
function txBundleFromInstruction(ix) {
    return {
        transaction: txFromInstruction(ix),
        transactions: [txFromInstruction(ix)],
        rawInstructions: [ixToRawView("instruction", ix)],
    };
}
function deriveEscrowPda(auctionPk, bidderPk, programId) {
    return PublicKey.findProgramAddressSync([Buffer.from("escrow"), auctionPk.toBuffer(), bidderPk.toBuffer()], programId)[0];
}
function deriveWinnerEscrowPda(auctionPk, winnerPk, programId) {
    return PublicKey.findProgramAddressSync([Buffer.from("escrow"), auctionPk.toBuffer(), winnerPk.toBuffer()], programId)[0];
}
function auctionStatusKey(auction) {
    return enumKey(auction?.status ?? auction?.statusKey ?? auction?.status_key).toLowerCase();
}
function auctionTypeKey(auction) {
    return enumKey(auction?.auctionType ?? auction?.auction_type).toLowerCase();
}
function auctionAssetKindKey(auction) {
    return enumKey(auction?.assetKind ?? auction?.asset_kind).toLowerCase();
}
function auctionBidCount(auction) {
    return Number(auction?.bidCount ?? auction?.bid_count ?? 0);
}
function auctionResolvedWinnerKeys(auction) {
    const type = auctionTypeKey(auction);
    if (type === "firstprice" || type === "vickrey") {
        const winner = toBase58Maybe(auction?.winner);
        return winner && winner !== DEFAULT_PUBKEY ? [winner] : [];
    }
    const winners = auction?.winners;
    if (!Array.isArray(winners))
        return [];
    return winners
        .map((w) => {
        try {
            return toBase58Maybe(w);
        }
        catch {
            return "";
        }
    })
        .filter(Boolean)
        .filter((w) => w !== DEFAULT_PUBKEY);
}
function auctionIsWinnerClaimed(auction, walletBase58) {
    const type = auctionTypeKey(auction);
    if (type === "firstprice" || type === "vickrey") {
        return Boolean(auction?.winnerPaid ?? auction?.winner_paid);
    }
    const winners = auctionResolvedWinnerKeys(auction);
    const idx = winners.findIndex((w) => w === walletBase58);
    if (idx < 0)
        return false;
    const paidMulti = auction?.winnerPaidMulti ?? auction?.winner_paid_multi;
    return Array.isArray(paidMulti) ? Boolean(paidMulti[idx]) : false;
}
function auctionIsMetadataOnly(auction) {
    return auctionAssetKindKey(auction) === "metadataonly";
}
function auctionIsTokenAuction(auction) {
    const kind = auctionAssetKindKey(auction);
    return kind === "fungible" || kind === "nft";
}
function resolveWinnerTargetForSettlement(auction, walletBase58) {
    const type = auctionTypeKey(auction);
    const winners = auctionResolvedWinnerKeys(auction);
    if (winners.length === 0)
        return null;
    if (type === "firstprice" || type === "vickrey") {
        return winners[0] ?? null;
    }
    const paidMulti = auction?.winnerPaidMulti ?? auction?.winner_paid_multi;
    if (Array.isArray(paidMulti)) {
        const nextIdx = paidMulti.findIndex((paid) => !paid);
        if (nextIdx >= 0 && winners[nextIdx])
            return winners[nextIdx];
    }
    return winners.includes(walletBase58) ? walletBase58 : winners[0] ?? null;
}
export async function buildPlaceBidTransaction(params) {
    const { programClient, programId, publicKey, auctionPk, bidAmountSol, nonceHex } = params;
    if (!programClient || !publicKey)
        throw new Error("Wallet / program client not ready.");
    const provider = programClient.provider;
    const arciumEnv = getArciumEnv();
    const mxePk = await Promise.resolve(getMXEAccAddress(programId));
    const clusterPk = new PublicKey(getClusterAccAddress(arciumEnv.arciumClusterOffset));
    const mempoolPk = new PublicKey(getMempoolAccAddress(arciumEnv.arciumClusterOffset));
    const executingPoolPk = new PublicKey(getExecutingPoolAccAddress(arciumEnv.arciumClusterOffset));
    const poolPk = new PublicKey(getFeePoolAccAddress());
    const clockPk = new PublicKey(getClockAccAddress());
    const compDefOffset = Buffer.from(getCompDefAccOffset("place_bid")).readUInt32LE(0);
    const compDefPk = getCompDefAccAddress(programId, compDefOffset);
    const computationOffset = new BN(crypto.randomBytes(8), "hex");
    const computationPk = getComputationAccAddress(arciumEnv.arciumClusterOffset, computationOffset);
    const mxePublicKey = await getMXEPublicKey(provider, programId);
    if (!mxePublicKey) {
        throw new Error("MXE x25519 public key not set on-chain");
    }
    const privateKey = x25519.utils.randomSecretKey();
    const bidderX25519Pub = x25519.getPublicKey(privateKey);
    const sharedSecret = x25519.getSharedSecret(privateKey, mxePublicKey);
    const cipher = new RescueCipher(sharedSecret);
    const bidderPubBytes = publicKey.toBytes();
    const bidderLo = BigInt(new BN(Buffer.from(bidderPubBytes.slice(0, 16)), "le").toString());
    const bidderHi = BigInt(new BN(Buffer.from(bidderPubBytes.slice(16, 32)), "le").toString());
    const amount = BigInt(solToLamportsBN(bidAmountSol).toString());
    const nonce = typeof nonceHex === "string" && nonceHex.length > 0
        ? Buffer.from(nonceHex.replace(/^0x/, ""), "hex")
        : crypto.randomBytes(16);
    const ciphertext = cipher.encrypt([bidderLo, bidderHi, amount], nonce);
    const nonceBN = new BN(deserializeLE(nonce).toString(10), 10);
    const escrowPda = deriveEscrowPda(auctionPk, publicKey, programId);
    const signPda = PublicKey.findProgramAddressSync([Buffer.from("ArciumSignerAccount")], programId)[0];
    const ix = await programClient.methods
        .placeBid(computationOffset, new BN(amount.toString()), Array.from(ciphertext[0]), Array.from(ciphertext[1]), Array.from(ciphertext[2]), Array.from(bidderX25519Pub), nonceBN)
        .accounts({
        bidder: publicKey,
        auction: auctionPk,
        escrowAccount: escrowPda,
        signPdaAccount: signPda,
        mxeAccount: new PublicKey(mxePk),
        mempoolAccount: mempoolPk,
        executingPool: executingPoolPk,
        computationAccount: computationPk,
        compDefAccount: compDefPk,
        clusterAccount: clusterPk,
        poolAccount: poolPk,
        clockAccount: clockPk,
    })
        .instruction();
    return {
        srv: {
            enc_lo: Array.from(ciphertext[0]),
            enc_hi: Array.from(ciphertext[1]),
            enc_amt: Array.from(ciphertext[2]),
            bidderX25519Pub: Array.from(bidderX25519Pub),
            nonceBN: nonceBN.toString(10),
            compDefPk: compDefPk.toBase58(),
            mxePk: mxePk.toBase58(),
            mempoolPk: mempoolPk.toBase58(),
            executingPoolPk: executingPoolPk.toBase58(),
            clusterPk: clusterPk.toBase58(),
            poolPk: poolPk.toBase58(),
            clockPk: clockPk.toBase58(),
            computationOffset: computationOffset.toString(10),
            computationPk: computationPk.toBase58(),
        },
        transaction: txFromInstruction(ix),
        transactions: [txFromInstruction(ix)],
        rawInstructions: [ixToRawView("placeBid", ix)],
        escrowPda,
    };
}
export async function buildDetermineWinnerTransaction(params) {
    const { programClient, publicKey, auctionPk, which, srv } = params;
    if (!programClient || !publicKey)
        throw new Error("Wallet / program client not ready.");
    const arciumProgramIdStr = process.env.NEXT_PUBLIC_ARCIUM_PROGRAM_ID;
    if (!arciumProgramIdStr)
        throw new Error("Missing NEXT_PUBLIC_ARCIUM_PROGRAM_ID in env");
    const arciumProgramId = new PublicKey(arciumProgramIdStr);
    const signPda = new PublicKey(srv.signPda);
    const computationOffset = new BN(srv.computationOffset);
    const compDefPk = new PublicKey(srv.compDefPk);
    const methodName = which === "first"
        ? "determineWinnerFirstPrice"
        : which === "vickrey"
            ? "determineWinnerVickrey"
            : which === "uniform"
                ? "determineWinnerUniform"
                : "determineWinnerProRata";
    const ixCall = programClient.methods[methodName];
    if (!ixCall)
        throw new Error(`Program method ${methodName} missing in client program`);
    const ix = await ixCall(computationOffset)
        .accounts({
        settler: publicKey,
        auction: auctionPk,
        signPdaAccount: signPda,
        mxeAccount: new PublicKey(srv.mxePk),
        mempoolAccount: new PublicKey(srv.mempoolPk),
        executingPool: new PublicKey(srv.executingPoolPk),
        computationAccount: new PublicKey(srv.computationPk ?? "11111111111111111111111111111111"),
        compDefAccount: compDefPk,
        clusterAccount: new PublicKey(srv.clusterPk),
        poolAccount: new PublicKey(srv.poolPk),
        clockAccount: new PublicKey(srv.clockPk),
        arciumProgram: arciumProgramId,
    })
        .instruction();
    return {
        srv,
        transaction: txFromInstruction(ix),
        transactions: [txFromInstruction(ix)],
        rawInstructions: [ixToRawView(methodName, ix)],
    };
}
export async function buildReclaimUnsoldTransaction(params) {
    const { programClient, programId, publicKey, auctionPk, auctionData } = params;
    if (!programClient || !publicKey)
        throw new Error("Wallet / program client not ready.");
    if (!auctionData)
        throw new Error("Auction data is required.");
    const creatorPk = new PublicKey(auctionData.authority);
    if (!creatorPk.equals(publicKey))
        throw new Error("Only the creator can reclaim an unsold item.");
    const statusKey = auctionStatusKey(auctionData);
    const endTime = Number(auctionData.endTime ?? auctionData.end_time ?? 0);
    const now = Math.floor(Date.now() / 1000);
    if (now < endTime && statusKey === "open") {
        throw new Error("Auction has not ended yet.");
    }
    if (auctionIsMetadataOnly(auctionData)) {
        const ix = await programClient.methods
            .reclaimUnsoldMetadataItem()
            .accounts({
            creator: publicKey,
            auction: auctionPk,
        })
            .instruction();
        return txBundleFromInstruction(ix);
    }
    if (!auctionIsTokenAuction(auctionData)) {
        throw new Error("Unsupported asset kind for reclaim.");
    }
    const prizeMintPk = new PublicKey(auctionData.tokenMint ?? auctionData.token_mint);
    const prizeVaultPk = new PublicKey(auctionData.prizeVault ?? auctionData.prize_vault);
    const vaultAuthorityPda = PublicKey.findProgramAddressSync([Buffer.from("vault-authority"), auctionPk.toBuffer()], programId)[0];
    const creatorAta = getAssociatedTokenAddressSync(prizeMintPk, publicKey, false, TOKEN_PROGRAM_ID);
    const ix = await programClient.methods
        .reclaimUnsoldTokenItem()
        .accounts({
        creator: publicKey,
        auction: auctionPk,
        prizeMint: prizeMintPk,
        prizeVault: prizeVaultPk,
        vaultAuthority: vaultAuthorityPda,
        creatorAta,
        tokenProgram: TOKEN_PROGRAM_ID,
    })
        .instruction();
    return txBundleFromInstruction(ix);
}
export async function buildClaimRefundTransaction(params) {
    const { programClient, programId, publicKey, auctionPk, auctionData } = params;
    if (!programClient || !publicKey)
        throw new Error("Wallet / program client not ready.");
    if (!auctionData)
        throw new Error("Auction data is required.");
    const escrowPda = deriveEscrowPda(auctionPk, publicKey, programId);
    const ix = await programClient.methods
        .claimRefund()
        .accounts({
        bidder: publicKey,
        auction: auctionPk,
        escrowAccount: escrowPda,
    })
        .instruction();
    return txBundleFromInstruction(ix);
}
export async function buildSettleWinnerTransaction(params) {
    const { programClient, programId, publicKey, auctionPk, auctionData, targetWinnerBase58 } = params;
    if (!programClient || !publicKey)
        throw new Error("Wallet / program client not ready.");
    if (!auctionData)
        throw new Error("Auction data is required.");
    const creatorPk = new PublicKey(auctionData.authority);
    const walletBase58 = publicKey.toBase58();
    const metadataOnly = auctionIsMetadataOnly(auctionData);
    const isWinnerNow = auctionResolvedWinnerKeys(auctionData).includes(walletBase58);
    const targetWinner = targetWinnerBase58 ??
        (isWinnerNow ? walletBase58 : resolveWinnerTargetForSettlement(auctionData, walletBase58));
    if (!targetWinner)
        throw new Error("Could not determine settlement target.");
    const targetWinnerPk = new PublicKey(targetWinner);
    const winnerEscrowPda = deriveWinnerEscrowPda(auctionPk, targetWinnerPk, programId);
    if (metadataOnly) {
        const ix = await programClient.methods
            .finalizeMetadataWinnerPayout()
            .accounts({
            auction: auctionPk,
            creator: creatorPk,
            winnerWallet: targetWinnerPk,
            winnerEscrow: winnerEscrowPda,
        })
            .instruction();
        return txBundleFromInstruction(ix);
    }
    if (!auctionIsTokenAuction(auctionData)) {
        throw new Error("Unsupported auction asset kind.");
    }
    const prizeMintPk = new PublicKey(auctionData.tokenMint ?? auctionData.token_mint);
    const prizeVaultPk = new PublicKey(auctionData.prizeVault ?? auctionData.prize_vault);
    const vaultAuthorityPda = PublicKey.findProgramAddressSync([Buffer.from("vault-authority"), auctionPk.toBuffer()], programId)[0];
    const winnerAta = getAssociatedTokenAddressSync(prizeMintPk, targetWinnerPk, false, TOKEN_PROGRAM_ID);
    const ix = await programClient.methods
        .finalizeTokenWinnerPayout()
        .accounts({
        payer: publicKey,
        auction: auctionPk,
        creator: creatorPk,
        winnerWallet: targetWinnerPk,
        winnerEscrow: winnerEscrowPda,
        prizeMint: prizeMintPk,
        prizeVault: prizeVaultPk,
        vaultAuthority: vaultAuthorityPda,
        winnerAta,
        tokenProgram: TOKEN_PROGRAM_ID,
    })
        .instruction();
    return txBundleFromInstruction(ix);
}
export async function createAuction(params) {
    const core = await buildAuctionCore(params);
    const tx = new Transaction().add(core.auctionIx);
    return {
        ...core,
        transaction: tx,
        transactions: [tx],
    };
}
export async function createPlaceBid(params) {
    const { programClient, programId, publicKey, auctionPk, bidAmountSol, nonceHex } = params;
    const arciumEnv = getArciumEnv();
    const mxePk = getMXEAccAddress(programId);
    const clusterPk = new PublicKey(getClusterAccAddress(arciumEnv.arciumClusterOffset));
    const mempoolPk = new PublicKey(getMempoolAccAddress(arciumEnv.arciumClusterOffset));
    const executingPoolPk = new PublicKey(getExecutingPoolAccAddress(arciumEnv.arciumClusterOffset));
    const poolPk = new PublicKey(getFeePoolAccAddress());
    const clockPk = new PublicKey(getClockAccAddress());
    const compDefOffset = Buffer.from(getCompDefAccOffset("place_bid")).readUInt32LE(0);
    const compDefPk = getCompDefAccAddress(programId, compDefOffset);
    const computationOffset = new BN(crypto.randomBytes(8), "hex");
    const computationPk = getComputationAccAddress(arciumEnv.arciumClusterOffset, computationOffset);
    const mxePublicKey = await getMXEPublicKey(programClient.provider, programId);
    if (!mxePublicKey)
        throw new Error("MXE key missing");
    const privateKey = x25519.utils.randomSecretKey();
    const bidderX25519Pub = x25519.getPublicKey(privateKey);
    const sharedSecret = x25519.getSharedSecret(privateKey, mxePublicKey);
    const cipher = new RescueCipher(sharedSecret);
    const bidderBytes = publicKey.toBytes();
    const bidderLo = BigInt(new BN(Buffer.from(bidderBytes.slice(0, 16)), "le").toString());
    const bidderHi = BigInt(new BN(Buffer.from(bidderBytes.slice(16, 32)), "le").toString());
    const amount = BigInt(solToLamportsBN(bidAmountSol).toString());
    const nonce = nonceHex
        ? Buffer.from(nonceHex.replace(/^0x/, ""), "hex")
        : crypto.randomBytes(16);
    const ciphertext = cipher.encrypt([bidderLo, bidderHi, amount], nonce);
    const nonceBN = new BN(deserializeLE(nonce).toString());
    const escrowPda = PublicKey.findProgramAddressSync([Buffer.from("escrow"), auctionPk.toBuffer(), publicKey.toBuffer()], programId)[0];
    const signPda = PublicKey.findProgramAddressSync([Buffer.from("ArciumSignerAccount")], programId)[0];
    const ix = await programClient.methods
        .placeBid(computationOffset, new BN(amount.toString()), Array.from(ciphertext[0]), Array.from(ciphertext[1]), Array.from(ciphertext[2]), Array.from(bidderX25519Pub), nonceBN)
        .accounts({
        bidder: publicKey,
        auction: auctionPk,
        escrowAccount: escrowPda,
        signPdaAccount: signPda,
        mxeAccount: new PublicKey(mxePk),
        mempoolAccount: mempoolPk,
        executingPool: executingPoolPk,
        computationAccount: computationPk,
        compDefAccount: compDefPk,
        clusterAccount: clusterPk,
        poolAccount: poolPk,
        clockAccount: clockPk,
    })
        .instruction();
    const tx = new Transaction().add(ix);
    return {
        transaction: tx,
        transactions: [tx],
        rawInstructions: [ixToRawView("placeBid", ix)],
        escrowPda,
        srv: {},
    };
}
export async function createDetermineWinner(params) {
    const { programClient, programId, publicKey, auctionPk, which } = params;
    if (!programClient || !publicKey) {
        throw new Error("Wallet / program client not ready.");
    }
    const arciumProgram = await getArciumProgram(programClient.provider);
    if (!arciumProgram) {
        throw new Error("Could not resolve Arcium program from provider");
    }
    const arciumProgramId = arciumProgram.programId;
    const clusterOffset = Number(process.env.ARCIUM_CLUSTER_OFFSET ?? 0);
    const mxePk = getMXEAccAddress(programId);
    const clusterPk = new PublicKey(getClusterAccAddress(clusterOffset));
    const mempoolPk = new PublicKey(getMempoolAccAddress(clusterOffset));
    const executingPoolPk = new PublicKey(getExecutingPoolAccAddress(clusterOffset));
    const poolPk = new PublicKey(getFeePoolAccAddress());
    const clockPk = new PublicKey(getClockAccAddress());
    const compDefName = which === "first"
        ? "determine_winner_first_price"
        : which === "vickrey"
            ? "determine_winner_vickrey"
            : which === "uniform"
                ? "determine_winner_uniform"
                : "determine_winner_pro_rata";
    const compDefOffsetNum = Buffer.from(getCompDefAccOffset(compDefName)).readUInt32LE(0);
    const compDefPk = getCompDefAccAddress(programId, compDefOffsetNum);
    const computationOffset = new BN(crypto.randomBytes(8), "hex");
    const computationPk = getComputationAccAddress(clusterOffset, computationOffset);
    const signPda = PublicKey.findProgramAddressSync([Buffer.from("ArciumSignerAccount")], programId)[0];
    const methodName = which === "first"
        ? "determineWinnerFirstPrice"
        : which === "vickrey"
            ? "determineWinnerVickrey"
            : which === "uniform"
                ? "determineWinnerUniform"
                : "determineWinnerProRata";
    const ix = await programClient.methods[methodName](computationOffset)
        .accounts({
        settler: publicKey,
        auction: auctionPk,
        signPdaAccount: signPda,
        mxeAccount: new PublicKey(mxePk),
        mempoolAccount: mempoolPk,
        executingPool: executingPoolPk,
        computationAccount: computationPk,
        compDefAccount: compDefPk,
        clusterAccount: clusterPk,
        poolAccount: poolPk,
        clockAccount: clockPk,
        arciumProgram: arciumProgramId,
    })
        .instruction();
    const tx = new Transaction().add(ix);
    return {
        srv: {
            compDefOffsetNum,
            compDefPk: compDefPk.toBase58(),
            computationOffset: computationOffset.toString(),
            computationPk: computationPk?.toBase58() ?? null,
            mxePk: new PublicKey(mxePk).toBase58(),
            clusterPk: clusterPk.toBase58(),
            mempoolPk: mempoolPk.toBase58(),
            executingPoolPk: executingPoolPk.toBase58(),
            poolPk: poolPk.toBase58(),
            clockPk: clockPk.toBase58(),
            signPda: signPda.toBase58(),
        },
        transaction: tx,
        transactions: [tx],
        rawInstructions: [ixToRawView(methodName, ix)],
    };
}
export async function createSettlement(params) {
    const { programClient, programId, publicKey, auctionPk, auctionData, escrowExists } = params;
    if (!auctionData)
        throw new Error("Auction data is required.");
    const creator = new PublicKey(auctionData.authority);
    const walletBase58 = publicKey.toBase58();
    const isCreator = creator.equals(publicKey);
    const isWinner = auctionResolvedWinnerKeys(auctionData).includes(walletBase58);
    const alreadyClaimed = auctionIsWinnerClaimed(auctionData, walletBase58);
    const hasBids = Number(auctionData.bidCount ?? 0) > 0;
    const ended = (() => {
        const endTime = Number(auctionData.endTime ?? auctionData.end_time ?? 0);
        const now = Math.floor(Date.now() / 1000);
        const statusKey = auctionStatusKey(auctionData);
        return now >= endTime || statusKey === "closed" || statusKey === "resolved";
    })();
    const action = !hasBids && isCreator
        ? "reclaimUnsold"
        : isWinner && !alreadyClaimed
            ? "settleWinner"
            : isCreator && ended
                ? "settleWinner"
                : escrowExists === true
                    ? "claimRefund"
                    : "settleWinner";
    if (action === "reclaimUnsold") {
        const tx = await buildReclaimUnsoldTransaction({
            programClient,
            programId,
            publicKey,
            auctionPk,
            auctionData,
        });
        return { ...tx, action };
    }
    if (action === "claimRefund") {
        const tx = await buildClaimRefundTransaction({
            programClient,
            programId,
            publicKey,
            auctionPk,
            auctionData,
        });
        return { ...tx, action };
    }
    const tx = await buildSettleWinnerTransaction({
        programClient,
        programId,
        publicKey,
        auctionPk,
        auctionData,
        targetWinnerBase58: isWinner ? walletBase58 : undefined,
    });
    return { ...tx, action };
}
