import { PublicKey, Transaction, TransactionInstruction } from "@solana/web3.js";
export type AuctionType = "FirstPrice" | "Vickrey" | "Uniform";
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
    minBidUsdc: string;
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
/**
 * Builds and returns the governance proposal flow for creating an auction.
 *
 * Params:
 * - programClient: Anchor program client.
 * - programId: Auction program ID.
 * - publicKey: Wallet public key.
 * - authorityBase58: Auction authority wallet.
 * - sourceTokenAccountBase58: Optional source token account.
 * - makeAuctionResult: Optional precomputed server context.
 * - minBidUsdc: Minimum bid amount in USDC.
 * - durationSecs: Auction duration in seconds.
 * - auctionType: Auction pricing model.
 * - assetKind: Auctioned asset type.
 * - metadataUri: Metadata URI.
 * - tokenMint: Token mint for SPL/NFT auctions.
 * - saleAmountToken: Amount to sell for fungible auctions.
 * - realmAddress: Realm address.
 * - governanceProgramId: Governance program ID.
 * - governanceAddress: Governance account.
 * - communityMint: Realm community mint.
 * - proposalName: Proposal title.
 * - proposalDescription: Proposal description.
 *
 * Returns: Proposal, insert, sign-off, and combined transactions.
 */
export declare function createSPLGovernanceProposal(params: CreateSPLGovernanceProposalParams): Promise<GovernanceAuctionBundle>;
export type DetermineWinnerKind = "first" | "vickrey" | "uniform";
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
/**
 * Resolves the encrypted bid context for submission.
 *
 * Params:
 * - auctionPk: Auction public key.
 * - bidderPubkey: Bidder wallet public key.
 * - bidAmountUsdc: Bid amount in USDC.
 * - nonceHex: Optional custom nonce.
 * - endpoint: Optional API endpoint.
 *
 * Returns: Encryption context for bid submission.
 */
export type ResolvePlaceBidContextParams = {
    auctionPk: string;
    bidderPubkey: string;
    bidAmountUsdc: string;
    nonceHex?: string | null;
    endpoint?: string;
};
/**
 * Builds a bid transaction for the selected auction.
 *
 * Params:
 * - programClient: Anchor program client.
 * - programId: Auction program ID.
 * - publicKey: Bidder wallet public key.
 * - auctionPk: Auction public key.
 * - bidAmountUsdc: Bid amount in USDC.
 * - nonceHex: Optional custom nonce.
 * - bidPriceUsdc: Optional explicit price for the encrypted payload.
 *
 * Returns: Bid transaction bundle and escrow PDA.
 */
export type BuildPlaceBidTransactionParams = {
    programClient: any;
    programId: PublicKey;
    publicKey: PublicKey;
    auctionPk: PublicKey;
    bidAmountUsdc: string;
    nonceHex?: string | null;
    bidPriceUsdc: string;
};
export type ResolveDetermineWinnerContextParams = {
    provider: any;
    programId: PublicKey;
    which: DetermineWinnerKind;
};
/**
 * Builds a winner-determination transaction.
 *
 * Params:
 * - programClient: Anchor program client.
 * - programId: Auction program ID.
 * - publicKey: Settler wallet public key.
 * - auctionPk: Auction public key.
 * - which: Winner-determination mode.
 * - srv: Server context with Arcium addresses and offsets.
 *
 * Returns: Winner-determination transaction bundle.
 */
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
/**
 * Chooses and builds the correct settlement action for the current wallet.
 *
 * Params:
 * - programClient: Anchor program client.
 * - programId: Auction program ID.
 * - publicKey: Current wallet public key.
 * - auctionPk: Auction public key.
 * - auctionData: Cached auction account data.
 * - escrowExists: Optional hint about bidder escrow state.
 * - action: Optional forced settlement action.
 * - targetWinnerBase58: Optional explicit winner target.
 *
 * Returns: The selected settlement bundle and action name.
 */
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
/**
 * Builds and returns a bid transaction.
 *
 * Params:
 * - params: Bid build inputs.
 *
 * Returns: Bid bundle with encrypted payload and escrow PDA.
 */
export declare function buildPlaceBidTransaction(params: BuildPlaceBidTransactionParams): Promise<PlaceBidBundle>;
/**
 * Builds and returns a winner-determination transaction.
 *
 * Params:
 * - params: Winner-determination inputs.
 *
 * Returns: Winner-determination bundle.
 */
export declare function buildDetermineWinnerTransaction(params: BuildDetermineWinnerTransactionParams): Promise<DetermineWinnerBundle>;
/**
 * Builds the reclaim-unsold transaction for the auction creator.
 *
 * Params:
 * - params: Reclaim inputs.
 *
 * Returns: Single-transaction action bundle.
 */
export declare function buildReclaimUnsoldTransaction(params: BuildReclaimUnsoldTransactionParams): Promise<AuctionActionBundle>;
/**
 * Builds the refund-claim transaction for a bidder.
 *
 * Params:
 * - params: Refund inputs.
 *
 * Returns: Single-transaction action bundle.
 */
export declare function buildClaimRefundTransaction(params: BuildClaimRefundTransactionParams): Promise<AuctionActionBundle>;
/**
 * Builds the settlement transaction for the winning bidder or creator. You will need to loop through these for uniform for each winner
 *
 * Params:
 * - params: Settlement inputs.
 *
 * Returns: Single-transaction action bundle.
 */
export declare function buildSettleWinnerTransaction(params: BuildSettleWinnerTransactionParams): Promise<AuctionActionBundle>;
/**
 * Backwards-compatible auction creation wrapper.
 *
 * Params:
 * - params: Auction creation inputs.
 *
 * Returns: Auction bundle with one transaction.
 */
export declare function createAuction(params: CreateAuctionParams): Promise<AuctionBundle>;
/**
 * Backwards-compatible bid creation wrapper.
 *
 * Params:
 * - params: Bid build inputs.
 *
 * Returns: Bid bundle with encrypted payload and escrow PDA.
 */
export declare function createPlaceBid(params: BuildPlaceBidTransactionParams): Promise<PlaceBidBundle>;
/**
 * Backwards-compatible winner-determination wrapper.
 *
 * Params:
 * - params: Winner-determination inputs.
 *
 * Returns: Winner-determination bundle.
 */
export declare function createDetermineWinner(params: {
    programClient: any;
    programId: PublicKey;
    publicKey: PublicKey;
    auctionPk: PublicKey;
    which: DetermineWinnerKind;
}): Promise<DetermineWinnerBundle>;
/**
 * Builds the best settlement transaction for the current wallet.
 *
 * Params:
 * - params: Auction settlement inputs.
 *
 * Returns: Selected settlement bundle and chosen action.
 */
export declare function createSettlement(params: CreateSettlementFlowParams): Promise<AuctionActionBundle & {
    action: Exclude<SettlementAction, "auto">;
}>;
