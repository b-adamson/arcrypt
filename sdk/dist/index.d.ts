import { PublicKey, Transaction, TransactionInstruction } from "@solana/web3.js";
export type AuctionType = "FirstPrice" | "Vickrey" | "Uniform" | "ProRata";
export type AssetKind = "Fungible" | "Nft" | "MetadataOnly";
export type MakeAuctionServerResponse = {
    auctionPda: string;
    auctionSeedHex: string;
    signPda: string;
    compDefOffsetNum: number;
    compDefPk: string;
    mxePk: string;
    clusterPk: string;
    mempoolPk: string;
    executingPoolPk: string;
    poolPk: string;
    clockPk: string;
    computationOffset: string;
    computationPk: string | null;
};
export type RawIxView = {
    label: string;
    dataBase64: string;
};
export type CreateAuctionParams = {
    programClient: any;
    programId: PublicKey;
    publicKey: PublicKey;
    authorityBase58: string;
    sourceTokenAccountBase58?: string;
    makeAuctionResult?: MakeAuctionServerResponse;
    minBidSol: string;
    durationSecs: number;
    auctionType: AuctionType;
    assetKind: AssetKind;
    metadataUri: string;
    tokenMint?: string;
    saleAmountToken?: string;
};
export type CreateSPLGovernanceProposalParams = CreateAuctionParams & {
    realmAddress: string;
    governanceProgramId: string;
    governanceAddress: string;
    communityMint: string;
    proposalName: string;
    proposalDescription: string;
};
export type AuctionCoreResult = {
    srv: MakeAuctionServerResponse;
    auctionIx: TransactionInstruction;
    auctionPda: PublicKey;
    auctionSeedHex: string;
    tokenDecimals?: number;
    rawInstructions: RawIxView[];
};
export type AuctionBundle = AuctionCoreResult & {
    transaction: Transaction;
    transactions: Transaction[];
};
export type GovernanceAuctionBundle = AuctionCoreResult & {
    proposalAddress: PublicKey;
    proposalInstructions: TransactionInstruction[];
    proposalTransactions: Transaction[];
    insertInstructions: TransactionInstruction[];
    insertTransactions: Transaction[];
    signOffInstructions: TransactionInstruction[];
    signOffTransactions: Transaction[];
    transactions: Transaction[];
};
export declare function createSPLGovernanceProposal(params: CreateSPLGovernanceProposalParams): Promise<GovernanceAuctionBundle>;
export type DetermineWinnerKind = "first" | "vickrey" | "uniform" | "proRata";
export type SettlementAction = "auto" | "reclaimUnsold" | "claimRefund" | "settleWinner";
export type PlaceBidServerResponse = {
    enc_lo: number[];
    enc_hi: number[];
    enc_amt: number[];
    bidderX25519Pub: number[];
    nonceBN: string;
    compDefPk: string;
    mxePk: string;
    mempoolPk: string;
    executingPoolPk: string;
    clusterPk: string;
    poolPk: string;
    clockPk: string;
    computationOffset: string;
    computationPk: string;
};
export type DetermineWinnerServerResponse = {
    compDefOffsetNum: number;
    compDefPk: string;
    computationOffset: string;
    computationPk: string | null;
    mxePk: string;
    clusterPk: string;
    mempoolPk: string;
    executingPoolPk: string;
    poolPk: string;
    clockPk: string;
    signPda: string;
};
export type AuctionActionBundle = {
    transaction: Transaction;
    transactions: Transaction[];
    rawInstructions: RawIxView[];
};
export type PlaceBidBundle = AuctionActionBundle & {
    srv: PlaceBidServerResponse;
    escrowPda: PublicKey;
};
export type DetermineWinnerBundle = AuctionActionBundle & {
    srv: DetermineWinnerServerResponse;
};
export type ResolvePlaceBidContextParams = {
    auctionPk: string;
    bidderPubkey: string;
    bidAmountSol: string;
    nonceHex?: string | null;
    endpoint?: string;
};
export type BuildPlaceBidTransactionParams = {
    programClient: any;
    programId: PublicKey;
    publicKey: PublicKey;
    auctionPk: PublicKey;
    bidAmountSol: string;
    nonceHex?: string | null;
};
export type ResolveDetermineWinnerContextParams = {
    provider: any;
    programId: PublicKey;
    which: DetermineWinnerKind;
};
export type BuildDetermineWinnerTransactionParams = {
    programClient: any;
    programId: PublicKey;
    publicKey: PublicKey;
    auctionPk: PublicKey;
    which: DetermineWinnerKind;
    srv: DetermineWinnerServerResponse;
};
export type BuildReclaimUnsoldTransactionParams = {
    programClient: any;
    programId: PublicKey;
    publicKey: PublicKey;
    auctionPk: PublicKey;
    auctionData: any;
};
export type BuildClaimRefundTransactionParams = {
    programClient: any;
    programId: PublicKey;
    publicKey: PublicKey;
    auctionPk: PublicKey;
    auctionData: any;
};
export type BuildSettleWinnerTransactionParams = {
    programClient: any;
    programId: PublicKey;
    publicKey: PublicKey;
    auctionPk: PublicKey;
    auctionData: any;
    targetWinnerBase58?: string | null;
};
export type CreateSettlementFlowParams = {
    programClient: any;
    programId: PublicKey;
    publicKey: PublicKey;
    auctionPk: PublicKey;
    auctionData: any;
    escrowExists?: boolean | null;
    action?: SettlementAction;
    targetWinnerBase58?: string | null;
};
export declare function buildPlaceBidTransaction(params: BuildPlaceBidTransactionParams): Promise<PlaceBidBundle>;
export declare function buildDetermineWinnerTransaction(params: BuildDetermineWinnerTransactionParams): Promise<DetermineWinnerBundle>;
export declare function buildReclaimUnsoldTransaction(params: BuildReclaimUnsoldTransactionParams): Promise<AuctionActionBundle>;
export declare function buildClaimRefundTransaction(params: BuildClaimRefundTransactionParams): Promise<AuctionActionBundle>;
export declare function buildSettleWinnerTransaction(params: BuildSettleWinnerTransactionParams): Promise<AuctionActionBundle>;
export declare function createAuction(params: CreateAuctionParams): Promise<AuctionBundle>;
export declare function createPlaceBid(params: BuildPlaceBidTransactionParams): Promise<PlaceBidBundle>;
export declare function createDetermineWinner(params: {
    programClient: any;
    programId: PublicKey;
    publicKey: PublicKey;
    auctionPk: PublicKey;
    which: DetermineWinnerKind;
}): Promise<DetermineWinnerBundle>;
export declare function createSettlement(params: CreateSettlementFlowParams): Promise<AuctionActionBundle & {
    action: Exclude<SettlementAction, "auto">;
}>;
