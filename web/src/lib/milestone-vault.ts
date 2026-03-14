import type { AbiEvent, Address, PublicClient } from "viem";
import { formatEther } from "viem";

import { fetchIpfsJson } from "@/lib/ipfs";
import { milestoneVaultAbi, milestoneVaultAddresses } from "@/lib/contracts/milestoneVault";
import type {
  ActivityItem,
  BackerState,
  CampaignContractRecord,
  CampaignMetadata,
  CampaignViewModel,
  MilestoneContractRecord,
  ProofMetadata,
  VoteReceipt,
} from "@/lib/types";

function tupleValue<T>(value: unknown, key: string, index: number) {
  const record = value as Record<string, unknown>;
  const array = value as unknown[];

  return (record?.[key] ?? array?.[index]) as T;
}

function getEvent(name: string) {
  return milestoneVaultAbi.find(
    (item) => item.type === "event" && item.name === name,
  ) as AbiEvent | undefined;
}

export function getMilestoneVaultAddress(chainId: number) {
  const address = milestoneVaultAddresses[chainId as keyof typeof milestoneVaultAddresses];
  return (address as Address | undefined) ?? null;
}

export function hasMilestoneVaultDeployment(chainId: number) {
  return Boolean(getMilestoneVaultAddress(chainId));
}

export function normalizeCampaign(raw: unknown) {
  return {
    creator: tupleValue(raw, "creator", 0) as `0x${string}`,
    goal: BigInt(tupleValue(raw, "goal", 1) as bigint),
    fundraisingDeadline: BigInt(tupleValue(raw, "fundraisingDeadline", 2) as bigint),
    createdAt: BigInt(tupleValue(raw, "createdAt", 3) as bigint),
    totalRaised: BigInt(tupleValue(raw, "totalRaised", 4) as bigint),
    status: BigInt(tupleValue(raw, "status", 5) as bigint),
    milestoneCount: BigInt(tupleValue(raw, "milestoneCount", 6) as bigint),
    currentMilestone: BigInt(tupleValue(raw, "currentMilestone", 7) as bigint),
    approvedPayoutTotal: BigInt(tupleValue(raw, "approvedPayoutTotal", 8) as bigint),
    creatorWithdrawn: BigInt(tupleValue(raw, "creatorWithdrawn", 9) as bigint),
    metadataCID: tupleValue(raw, "metadataCID", 10) as string,
    failureReason: BigInt(tupleValue(raw, "failureReason", 11) as bigint),
  } satisfies CampaignContractRecord;
}

export function normalizeMilestone(raw: unknown) {
  return {
    amount: BigInt(tupleValue(raw, "amount", 0) as bigint),
    dueDate: BigInt(tupleValue(raw, "dueDate", 1) as bigint),
    proofCID: tupleValue(raw, "proofCID", 2) as string,
    voteStart: BigInt(tupleValue(raw, "voteStart", 3) as bigint),
    voteEnd: BigInt(tupleValue(raw, "voteEnd", 4) as bigint),
    yesWeight: BigInt(tupleValue(raw, "yesWeight", 5) as bigint),
    noWeight: BigInt(tupleValue(raw, "noWeight", 6) as bigint),
    executed: Boolean(tupleValue(raw, "executed", 7)),
  } satisfies MilestoneContractRecord;
}

export function normalizeBackerState(raw: unknown) {
  return {
    contributionAmount: BigInt(tupleValue(raw, "contributionAmount", 0) as bigint),
    refundClaimed: Boolean(tupleValue(raw, "refundClaimed", 1)),
    refundAmount: BigInt(tupleValue(raw, "refundAmount", 2) as bigint),
  } satisfies BackerState;
}

export function normalizeVoteReceipt(raw: unknown) {
  return {
    hasVoted: Boolean(tupleValue(raw, "hasVoted", 0)),
    support: Boolean(tupleValue(raw, "support", 1)),
  } satisfies VoteReceipt;
}

export async function fetchCampaign(
  publicClient: PublicClient,
  chainId: number,
  campaignId: bigint,
) {
  const contractAddress = getMilestoneVaultAddress(chainId);
  if (!contractAddress) {
    return null;
  }

  const [campaignRaw, withdrawable, refundPool] = await Promise.all([
    publicClient.readContract({
      address: contractAddress,
      abi: milestoneVaultAbi,
      functionName: "getCampaign",
      args: [campaignId],
    }),
    publicClient.readContract({
      address: contractAddress,
      abi: milestoneVaultAbi,
      functionName: "getCreatorWithdrawable",
      args: [campaignId],
    }),
    publicClient.readContract({
      address: contractAddress,
      abi: milestoneVaultAbi,
      functionName: "getRefundPool",
      args: [campaignId],
    }),
  ]);

  const campaign = normalizeCampaign(campaignRaw);
  const metadata = await fetchIpfsJson<CampaignMetadata>(campaign.metadataCID);
  const milestoneIds = Array.from({ length: Number(campaign.milestoneCount) }, (_, index) => BigInt(index));

  const milestoneContracts = milestoneIds.length
    ? publicClient.chain?.contracts?.multicall3
      ? await publicClient.multicall({
          contracts: milestoneIds.map((milestoneId) => ({
            address: contractAddress,
            abi: milestoneVaultAbi,
            functionName: "getMilestone",
            args: [campaignId, milestoneId],
          })),
          allowFailure: false,
        })
      : await Promise.all(
          milestoneIds.map((milestoneId) =>
            publicClient.readContract({
              address: contractAddress,
              abi: milestoneVaultAbi,
              functionName: "getMilestone",
              args: [campaignId, milestoneId],
            }),
          ),
        )
    : [];

  const milestones = await Promise.all(
    milestoneContracts.map(async (rawMilestone, index) => {
      const contract = normalizeMilestone(rawMilestone);
      const proof = contract.proofCID
        ? await fetchIpfsJson<ProofMetadata>(contract.proofCID)
        : null;

      return {
        id: index,
        contract,
        metadata: metadata?.milestones?.[index] ?? null,
        proof,
      };
    }),
  );

  return {
    id: campaignId,
    chainId,
    contractAddress,
    contract: campaign,
    metadata,
    milestones,
    withdrawable: BigInt(withdrawable as bigint),
    refundPool: BigInt(refundPool as bigint),
  } satisfies CampaignViewModel;
}

export async function fetchCampaigns(publicClient: PublicClient, chainId: number) {
  const contractAddress = getMilestoneVaultAddress(chainId);
  if (!contractAddress) {
    return [];
  }

  const campaignCount = (await publicClient.readContract({
    address: contractAddress,
    abi: milestoneVaultAbi,
    functionName: "campaignCount",
  })) as bigint;

  const campaigns = await Promise.all(
    Array.from({ length: Number(campaignCount) }, (_, index) =>
      fetchCampaign(publicClient, chainId, BigInt(index)),
    ),
  );

  return campaigns
    .filter((campaign): campaign is CampaignViewModel => campaign !== null)
    .sort((left, right) => Number(right.id - left.id));
}

const activityDescriptors = [
  {
    name: "CampaignCreated",
    label: "Campaign created",
    detail: (args: Record<string, unknown>) =>
      `Goal ${formatEther(args.goal as bigint)} ETH, metadata ${String(args.metadataCID)}`,
  },
  {
    name: "ContributionReceived",
    label: "Contribution",
    detail: (args: Record<string, unknown>) =>
      `${String(args.backer).slice(0, 6)} pledged ${formatEther(args.amount as bigint)} ETH`,
  },
  {
    name: "CampaignFinalized",
    label: "Fundraising finalized",
    detail: (args: Record<string, unknown>) => `Status code ${String(args.status)}`,
  },
  {
    name: "CampaignFailed",
    label: "Campaign failed",
    detail: (args: Record<string, unknown>) =>
      `Reason ${String(args.reason)}, refund pool ${formatEther(args.refundPool as bigint)} ETH`,
  },
  {
    name: "MilestoneProofSubmitted",
    label: "Proof submitted",
    detail: (args: Record<string, unknown>) =>
      `Milestone ${String(args.milestoneId)} opened voting with ${String(args.proofCID)}`,
  },
  {
    name: "VoteCast",
    label: "Vote cast",
    detail: (args: Record<string, unknown>) =>
      `${String(args.voter).slice(0, 6)} voted ${Boolean(args.support) ? "YES" : "NO"}`,
  },
  {
    name: "MilestoneExecuted",
    label: "Milestone executed",
    detail: (args: Record<string, unknown>) =>
      `Milestone ${String(args.milestoneId)} ${Boolean(args.approved) ? "passed" : "failed"}`,
  },
  {
    name: "CreatorWithdrawal",
    label: "Creator withdrawal",
    detail: (args: Record<string, unknown>) =>
      `${formatEther(args.amount as bigint)} ETH withdrawn`,
  },
  {
    name: "RefundClaimed",
    label: "Refund claimed",
    detail: (args: Record<string, unknown>) =>
      `${String(args.backer).slice(0, 6)} claimed ${formatEther(args.amount as bigint)} ETH`,
  },
] as const;

export async function fetchCampaignActivity(
  publicClient: PublicClient,
  chainId: number,
  campaignId: bigint,
) {
  const contractAddress = getMilestoneVaultAddress(chainId);
  if (!contractAddress) {
    return [];
  }

  const logGroups = await Promise.all(
    activityDescriptors.map(async (descriptor) => {
      const event = getEvent(descriptor.name);
      if (!event) {
        return [];
      }

      return publicClient.getLogs({
        address: contractAddress,
        event,
        args: { campaignId },
        fromBlock: 0n,
        toBlock: "latest",
      });
    }),
  );

  const logs = logGroups.flat();
  const uniqueBlocks = [...new Set(logs.map((log) => log.blockNumber))];
  const blocks = await Promise.all(uniqueBlocks.map((blockNumber) => publicClient.getBlock({ blockNumber })));
  const blockMap = new Map(blocks.map((block) => [block.number, block.timestamp]));

  const items = logs.map((log) => {
    const descriptor = activityDescriptors.find((item) => item.name === log.eventName);
    const args = (log.args ?? {}) as Record<string, unknown>;

    return {
      key: `${log.transactionHash}-${log.logIndex}`,
      label: descriptor?.label ?? log.eventName,
      detail: descriptor?.detail(args) ?? "On-chain activity",
      timestamp: blockMap.get(log.blockNumber),
      blockNumber: log.blockNumber,
      txHash: log.transactionHash,
    } satisfies ActivityItem;
  });

  return items.sort((left, right) => Number(right.blockNumber - left.blockNumber));
}
