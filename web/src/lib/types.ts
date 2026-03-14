export enum CampaignStatus {
  Fundraising = 0,
  Failed = 1,
  Active = 2,
  Completed = 3,
}

export enum FailureReason {
  None = 0,
  Underfunded = 1,
  VoteRejected = 2,
  MissedMilestoneDeadline = 3,
}

export type CampaignContractRecord = {
  creator: `0x${string}`;
  goal: bigint;
  fundraisingDeadline: bigint;
  createdAt: bigint;
  totalRaised: bigint;
  status: bigint;
  milestoneCount: bigint;
  currentMilestone: bigint;
  approvedPayoutTotal: bigint;
  creatorWithdrawn: bigint;
  metadataCID: string;
  failureReason: bigint;
};

export type MilestoneContractRecord = {
  amount: bigint;
  dueDate: bigint;
  proofCID: string;
  voteStart: bigint;
  voteEnd: bigint;
  yesWeight: bigint;
  noWeight: bigint;
  executed: boolean;
};

export type CampaignMetadata = {
  title: string;
  summary: string;
  description: string;
  coverImageCid?: string;
  milestones: MilestoneMetadata[];
  externalLinks?: string[];
  createdAt?: string;
  goal?: string;
  fundraisingDeadline?: string;
};

export type MilestoneMetadata = {
  title: string;
  description: string;
  amount: string;
  dueDate: string;
};

export type ProofFileReference = {
  name: string;
  cid: string;
  type: string;
  size: number;
};

export type ProofMetadata = {
  campaignId: number;
  milestoneId: number;
  summary: string;
  fileCids: ProofFileReference[];
  demoLinks: string[];
  submittedAt: string;
};

export type MilestoneViewModel = {
  id: number;
  contract: MilestoneContractRecord;
  metadata: MilestoneMetadata | null;
  proof: ProofMetadata | null;
};

export type CampaignViewModel = {
  id: bigint;
  chainId: number;
  contractAddress: `0x${string}`;
  contract: CampaignContractRecord;
  metadata: CampaignMetadata | null;
  milestones: MilestoneViewModel[];
  withdrawable: bigint;
  refundPool: bigint;
};

export type BackerState = {
  contributionAmount: bigint;
  refundClaimed: boolean;
  refundAmount: bigint;
};

export type VoteReceipt = {
  hasVoted: boolean;
  support: boolean;
};

export type ActivityItem = {
  key: string;
  label: string;
  detail: string;
  timestamp?: bigint;
  blockNumber: bigint;
  txHash: `0x${string}`;
};
