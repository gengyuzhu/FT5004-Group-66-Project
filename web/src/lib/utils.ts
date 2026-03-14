import { formatEther } from "viem";

import { CampaignStatus, FailureReason } from "@/lib/types";

export function formatEth(value: bigint, maximumFractionDigits = 4) {
  return `${Number(formatEther(value)).toLocaleString(undefined, {
    maximumFractionDigits,
  })} ETH`;
}

export function formatTimestamp(value?: bigint | number | string) {
  if (value === undefined || value === null || value === "") {
    return "Not set";
  }

  const numericValue = typeof value === "bigint" ? Number(value) : Number(value);
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(numericValue * 1000));
}

export function shortAddress(address?: string | null) {
  if (!address) {
    return "Not connected";
  }

  return `${address.slice(0, 6)}...${address.slice(-4)}`;
}

export function formatShortEth(value: bigint, maximumFractionDigits = 2) {
  return Number(formatEther(value)).toLocaleString(undefined, {
    maximumFractionDigits,
  });
}

export function getCampaignStatusLabel(status: bigint | number) {
  switch (Number(status)) {
    case CampaignStatus.Fundraising:
      return "Fundraising";
    case CampaignStatus.Failed:
      return "Failed";
    case CampaignStatus.Active:
      return "Active";
    case CampaignStatus.Completed:
      return "Completed";
    default:
      return "Unknown";
  }
}

export function getCampaignStatusAccent(status: bigint | number) {
  switch (Number(status)) {
    case CampaignStatus.Fundraising:
      return "status-fundraising";
    case CampaignStatus.Failed:
      return "status-failed";
    case CampaignStatus.Active:
      return "status-active";
    case CampaignStatus.Completed:
      return "status-completed";
    default:
      return "status-default";
  }
}

export function getFailureReasonLabel(reason: bigint | number) {
  switch (Number(reason)) {
    case FailureReason.Underfunded:
      return "Funding target missed";
    case FailureReason.VoteRejected:
      return "Milestone vote rejected";
    case FailureReason.MissedMilestoneDeadline:
      return "Milestone deadline missed";
    default:
      return "No failure";
  }
}

export function getProgressPercentage(totalRaised: bigint, goal: bigint) {
  if (goal === 0n) {
    return 0;
  }

  const value = Number((totalRaised * 10_000n) / goal) / 100;
  return Math.min(value, 100);
}

export function formatTimeRemaining(value?: bigint | number | string) {
  if (value === undefined || value === null || value === "") {
    return "Not set";
  }

  const targetSeconds = typeof value === "bigint" ? Number(value) : Number(value);
  const remainingSeconds = targetSeconds - Math.floor(Date.now() / 1000);

  if (remainingSeconds <= 0) {
    return "Ended";
  }

  const days = Math.floor(remainingSeconds / 86_400);
  const hours = Math.floor((remainingSeconds % 86_400) / 3_600);

  if (days > 0) {
    return `${days}d ${hours}h left`;
  }

  const minutes = Math.floor((remainingSeconds % 3_600) / 60);
  if (hours > 0) {
    return `${hours}h ${minutes}m left`;
  }

  return `${Math.max(minutes, 1)}m left`;
}

export function parseDateTimeInput(value: string) {
  const parsed = Date.parse(value);

  if (Number.isNaN(parsed)) {
    throw new Error("Please provide a valid date and time.");
  }

  return BigInt(Math.floor(parsed / 1000));
}

export function parseLinks(input: string) {
  return input
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

export function compareAddresses(left?: string | null, right?: string | null) {
  return left?.toLowerCase() === right?.toLowerCase();
}
