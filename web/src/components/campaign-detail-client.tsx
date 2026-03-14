"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { parseEther } from "viem";
import { useAccount, useChainId, usePublicClient, useWriteContract } from "wagmi";

import { defaultChainId } from "@/lib/config";
import { getIpfsUrl } from "@/lib/ipfs";
import { milestoneVaultAbi } from "@/lib/contracts/milestoneVault";
import {
  fetchCampaign,
  fetchCampaignActivity,
  getMilestoneVaultAddress,
  normalizeBackerState,
  normalizeVoteReceipt,
} from "@/lib/milestone-vault";
import { CampaignStatus, type ActivityItem, type BackerState, type CampaignViewModel, type VoteReceipt } from "@/lib/types";
import {
  compareAddresses,
  formatEth,
  formatTimestamp,
  getCampaignStatusLabel,
  getFailureReasonLabel,
  parseLinks,
  shortAddress,
} from "@/lib/utils";

type CampaignDetailClientProps = {
  campaignId: string;
};

export function CampaignDetailClient({ campaignId }: CampaignDetailClientProps) {
  const { address, isConnected } = useAccount();
  const activeChainId = useChainId();
  const chainId = activeChainId || defaultChainId;
  const publicClient = usePublicClient({ chainId });
  const contractAddress = getMilestoneVaultAddress(chainId);
  const { writeContractAsync } = useWriteContract();
  const [campaign, setCampaign] = useState<CampaignViewModel | null>(null);
  const [activity, setActivity] = useState<ActivityItem[]>([]);
  const [backerState, setBackerState] = useState<BackerState | null>(null);
  const [voteReceipt, setVoteReceipt] = useState<VoteReceipt | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [isWorking, setIsWorking] = useState(false);
  const [refreshToken, setRefreshToken] = useState(0);
  const [isRefreshing, startTransition] = useTransition();
  const [contributionAmount, setContributionAmount] = useState("");
  const [proofSummary, setProofSummary] = useState("");
  const [proofLinks, setProofLinks] = useState("");
  const [proofFiles, setProofFiles] = useState<File[]>([]);

  let campaignIdValue: bigint | null = null;
  try {
    campaignIdValue = BigInt(campaignId);
  } catch {
    campaignIdValue = null;
  }

  useEffect(() => {
    let ignore = false;

    async function loadCampaignDetail() {
      if (!campaignIdValue || !publicClient || !contractAddress) {
        setIsLoading(false);
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        const [nextCampaign, nextActivity] = await Promise.all([
          fetchCampaign(publicClient, chainId, campaignIdValue),
          fetchCampaignActivity(publicClient, chainId, campaignIdValue),
        ]);

        if (!nextCampaign) {
          throw new Error("Campaign not found on this network.");
        }

        if (!ignore) {
          setCampaign(nextCampaign);
          setActivity(nextActivity);
        }

        if (address) {
          const currentMilestoneIndex = Number(nextCampaign.contract.currentMilestone);
          const shouldReadVoteReceipt = currentMilestoneIndex < nextCampaign.milestones.length;

          const backerStateRaw = await publicClient.readContract({
            address: contractAddress,
            abi: milestoneVaultAbi,
            functionName: "getBackerState",
            args: [campaignIdValue, address],
          });

          const voteReceiptRaw = shouldReadVoteReceipt
            ? await publicClient.readContract({
                address: contractAddress,
                abi: milestoneVaultAbi,
                functionName: "getVoteReceipt",
                args: [campaignIdValue, BigInt(currentMilestoneIndex), address],
              })
            : null;

          if (!ignore) {
            setBackerState(normalizeBackerState(backerStateRaw));
            setVoteReceipt(
              voteReceiptRaw ? normalizeVoteReceipt(voteReceiptRaw) : null,
            );
          }
        } else if (!ignore) {
          setBackerState(null);
          setVoteReceipt(null);
        }
      } catch (loadError) {
        if (!ignore) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load campaign detail.");
        }
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    }

    void loadCampaignDetail();

    return () => {
      ignore = true;
    };
  }, [address, campaignIdValue, chainId, contractAddress, publicClient, refreshToken]);

  function refresh() {
    startTransition(() => {
      setRefreshToken((value) => value + 1);
    });
  }

  async function runContractAction(
    action: () => Promise<`0x${string}`>,
    pendingMessage: string,
    successMessage: string,
  ) {
    if (!publicClient) {
      setError("Public client is not ready for this network.");
      return;
    }

    setIsWorking(true);
    setError(null);
    setFeedback(pendingMessage);

    try {
      const hash = await action();
      setFeedback("Waiting for confirmation...");
      await publicClient.waitForTransactionReceipt({ hash });
      setFeedback(successMessage);
      refresh();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "Transaction failed.");
      setFeedback(null);
    } finally {
      setIsWorking(false);
    }
  }

  async function handleContribute() {
    if (!campaign || !campaignIdValue || !contractAddress) {
      return;
    }

    await runContractAction(
      () =>
        writeContractAsync({
          address: contractAddress,
          abi: milestoneVaultAbi,
          functionName: "contribute",
          args: [campaignIdValue],
          chainId,
          value: parseEther(contributionAmount),
        }),
      "Submitting contribution transaction...",
      "Contribution confirmed.",
    );

    setContributionAmount("");
  }

  async function handleFinalize() {
    if (!campaignIdValue || !contractAddress) {
      return;
    }

    await runContractAction(
      () =>
        writeContractAsync({
          address: contractAddress,
          abi: milestoneVaultAbi,
          functionName: "finalizeCampaign",
          args: [campaignIdValue],
          chainId,
        }),
      "Submitting finalize transaction...",
      "Campaign finalized.",
    );
  }

  async function handleVote(support: boolean) {
    if (!campaign || !campaignIdValue || !contractAddress) {
      return;
    }

    const currentMilestoneIndex = Number(campaign.contract.currentMilestone);
    await runContractAction(
      () =>
        writeContractAsync({
          address: contractAddress,
          abi: milestoneVaultAbi,
          functionName: "voteOnMilestone",
          args: [campaignIdValue, BigInt(currentMilestoneIndex), support],
          chainId,
        }),
      "Submitting vote transaction...",
      "Vote confirmed.",
    );
  }

  async function handleExecute() {
    if (!campaign || !campaignIdValue || !contractAddress) {
      return;
    }

    const currentMilestoneIndex = Number(campaign.contract.currentMilestone);
    await runContractAction(
      () =>
        writeContractAsync({
          address: contractAddress,
          abi: milestoneVaultAbi,
          functionName: "executeMilestone",
          args: [campaignIdValue, BigInt(currentMilestoneIndex)],
          chainId,
        }),
      "Executing milestone result...",
      "Milestone execution confirmed.",
    );
  }

  async function handleWithdraw() {
    if (!campaignIdValue || !contractAddress) {
      return;
    }

    await runContractAction(
      () =>
        writeContractAsync({
          address: contractAddress,
          abi: milestoneVaultAbi,
          functionName: "withdrawCreatorFunds",
          args: [campaignIdValue],
          chainId,
        }),
      "Submitting withdraw transaction...",
      "Withdrawal confirmed.",
    );
  }

  async function handleRefund() {
    if (!campaignIdValue || !contractAddress) {
      return;
    }

    await runContractAction(
      () =>
        writeContractAsync({
          address: contractAddress,
          abi: milestoneVaultAbi,
          functionName: "claimRefund",
          args: [campaignIdValue],
          chainId,
        }),
      "Submitting refund transaction...",
      "Refund claimed.",
    );
  }

  async function handleMissedDeadlineFailure() {
    if (!campaignIdValue || !contractAddress) {
      return;
    }

    await runContractAction(
      () =>
        writeContractAsync({
          address: contractAddress,
          abi: milestoneVaultAbi,
          functionName: "failCampaignForMissedDeadline",
          args: [campaignIdValue],
          chainId,
        }),
      "Submitting missed-deadline failure transaction...",
      "Campaign failed due to missed milestone deadline.",
    );
  }

  async function handleProofSubmission() {
    if (!campaign || !campaignIdValue || !contractAddress) {
      return;
    }

    setIsWorking(true);
    setError(null);
    setFeedback("Uploading milestone proof to IPFS...");

    try {
      const currentMilestoneIndex = Number(campaign.contract.currentMilestone);
      const formData = new FormData();
      formData.append("campaignId", campaignId);
      formData.append("milestoneId", String(currentMilestoneIndex));
      formData.append("summary", proofSummary);
      formData.append("demoLinks", JSON.stringify(parseLinks(proofLinks)));

      for (const file of proofFiles) {
        formData.append("files", file);
      }

      const response = await fetch("/api/ipfs/proof", {
        method: "POST",
        body: formData,
      });

      const payload = (await response.json()) as {
        cid?: string;
        error?: string;
      };

      if (!response.ok || !payload.cid) {
        throw new Error(payload.error ?? "Unable to pin milestone proof.");
      }

      const hash = await writeContractAsync({
        address: contractAddress,
        abi: milestoneVaultAbi,
        functionName: "submitMilestoneProof",
        args: [campaignIdValue, BigInt(currentMilestoneIndex), payload.cid],
        chainId,
      });

      setFeedback("Waiting for confirmation...");
      await publicClient?.waitForTransactionReceipt({ hash });
      setProofSummary("");
      setProofLinks("");
      setProofFiles([]);
      setFeedback("Milestone proof submitted.");
      refresh();
    } catch (proofError) {
      setError(proofError instanceof Error ? proofError.message : "Unable to submit proof.");
      setFeedback(null);
    } finally {
      setIsWorking(false);
    }
  }

  if (!campaignIdValue) {
    return (
      <main className="detail-shell">
        <p className="feedback feedback-error">The campaign id must be a valid integer.</p>
      </main>
    );
  }

  if (!contractAddress) {
    return (
      <main className="detail-shell">
        <p className="feedback feedback-error">
          No MilestoneVault deployment is configured for the current chain.
        </p>
      </main>
    );
  }

  if (isLoading) {
    return (
      <main className="detail-shell">
        <p className="feedback">Loading campaign detail from the chain...</p>
      </main>
    );
  }

  if (!campaign) {
    return (
      <main className="detail-shell">
        <p className="feedback feedback-error">{error ?? "Campaign not found."}</p>
      </main>
    );
  }

  const currentMilestone = campaign.milestones[Number(campaign.contract.currentMilestone)] ?? null;
  const isCreator = compareAddresses(address, campaign.contract.creator);
  const now = BigInt(Math.floor(Date.now() / 1000));
  const canFinalize =
    Number(campaign.contract.status) === CampaignStatus.Fundraising &&
    now >= campaign.contract.fundraisingDeadline;
  const canSubmitProof =
    isCreator &&
    Number(campaign.contract.status) === CampaignStatus.Active &&
    currentMilestone &&
    !currentMilestone.contract.proofCID &&
    now <= currentMilestone.contract.dueDate;
  const canVote =
    isConnected &&
    !isCreator &&
    Number(campaign.contract.status) === CampaignStatus.Active &&
    currentMilestone &&
    Boolean(currentMilestone.contract.proofCID) &&
    now >= currentMilestone.contract.voteStart &&
    now < currentMilestone.contract.voteEnd &&
    (backerState?.contributionAmount ?? 0n) > 0n &&
    !voteReceipt?.hasVoted;
  const canExecute =
    Number(campaign.contract.status) === CampaignStatus.Active &&
    currentMilestone &&
    Boolean(currentMilestone.contract.proofCID) &&
    now >= currentMilestone.contract.voteEnd;
  const canFailForMissedDeadline =
    Number(campaign.contract.status) === CampaignStatus.Active &&
    currentMilestone &&
    !currentMilestone.contract.proofCID &&
    now > currentMilestone.contract.dueDate;
  const canWithdraw = isCreator && campaign.withdrawable > 0n;
  const canRefund =
    Number(campaign.contract.status) === CampaignStatus.Failed &&
    (backerState?.refundAmount ?? 0n) > 0n &&
    !backerState?.refundClaimed;

  return (
    <main className="detail-shell">
      <Link className="inline-link" href="/">
        Back to dashboard
      </Link>

      <section className="detail-hero">
        <div className="detail-copy">
          <p className="eyebrow">
            Campaign #{campaign.id.toString()} · {getCampaignStatusLabel(campaign.contract.status)}
          </p>
          <h1>{campaign.metadata?.title ?? "Untitled campaign"}</h1>
          <p className="hero-text">
            {campaign.metadata?.description ??
              "Campaign metadata could not be resolved from IPFS, but the on-chain state is still available."}
          </p>

          <div className="detail-stats">
            <div>
              <span className="field-label">Creator</span>
              <strong>{shortAddress(campaign.contract.creator)}</strong>
            </div>
            <div>
              <span className="field-label">Raised</span>
              <strong>{formatEth(campaign.contract.totalRaised)}</strong>
            </div>
            <div>
              <span className="field-label">Goal</span>
              <strong>{formatEth(campaign.contract.goal)}</strong>
            </div>
            <div>
              <span className="field-label">Failure reason</span>
              <strong>{getFailureReasonLabel(campaign.contract.failureReason)}</strong>
            </div>
          </div>
        </div>

        {campaign.metadata?.coverImageCid ? (
          <div className="detail-cover">
            <Image
              alt={campaign.metadata.title}
              fill
              priority
              sizes="(max-width: 1080px) 100vw, 33vw"
              src={getIpfsUrl(campaign.metadata.coverImageCid) ?? ""}
            />
          </div>
        ) : null}
      </section>

      <div className="detail-grid">
        <section className="detail-main">
          <article className="detail-card">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Milestone Ledger</p>
                <h2>Each release step is explicit, visible, and bounded by time.</h2>
              </div>
            </div>

            <div className="milestone-list">
              {campaign.milestones.map((milestone) => (
                <article className="milestone-card" key={milestone.id}>
                  <div className="milestone-card-header">
                    <div>
                      <p className="eyebrow">Milestone {milestone.id + 1}</p>
                      <h3>{milestone.metadata?.title ?? `Milestone ${milestone.id + 1}`}</h3>
                    </div>
                    <span className="pill">
                      {milestone.contract.executed
                        ? "Approved"
                        : milestone.contract.proofCID
                          ? "Voting"
                          : milestone.id === Number(campaign.contract.currentMilestone)
                            ? "Current"
                            : "Queued"}
                    </span>
                  </div>

                  <p className="muted-text">
                    {milestone.metadata?.description ?? "No milestone description available in metadata."}
                  </p>

                  <div className="milestone-facts">
                    <div>
                      <span className="field-label">Amount</span>
                      <strong>{formatEth(milestone.contract.amount)}</strong>
                    </div>
                    <div>
                      <span className="field-label">Due</span>
                      <strong>{formatTimestamp(milestone.contract.dueDate)}</strong>
                    </div>
                    <div>
                      <span className="field-label">Votes</span>
                      <strong>
                        {formatEth(milestone.contract.yesWeight)} YES / {formatEth(milestone.contract.noWeight)} NO
                      </strong>
                    </div>
                  </div>

                  {milestone.contract.proofCID ? (
                    <div className="proof-box">
                      <a
                        className="inline-link"
                        href={getIpfsUrl(milestone.contract.proofCID) ?? "#"}
                        rel="noreferrer"
                        target="_blank"
                      >
                        Open proof JSON
                      </a>
                      <p className="muted-text">
                        {milestone.proof?.summary ?? "Proof bundle metadata is available at the stored CID."}
                      </p>
                      {milestone.proof?.fileCids.length ? (
                        <div className="proof-files">
                          {milestone.proof.fileCids.map((file) => (
                            <a
                              className="inline-link"
                              href={getIpfsUrl(file.cid) ?? "#"}
                              key={`${file.cid}-${file.name}`}
                              rel="noreferrer"
                              target="_blank"
                            >
                              {file.name}
                            </a>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </article>
              ))}
            </div>
          </article>

          <article className="detail-card">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Activity Feed</p>
                <h2>Recent on-chain actions for this campaign.</h2>
              </div>
            </div>

            <div className="activity-list">
              {activity.map((item) => (
                <div className="activity-item" key={item.key}>
                  <div>
                    <strong>{item.label}</strong>
                    <p className="muted-text">{item.detail}</p>
                  </div>
                  <div className="activity-meta">
                    <span>{item.timestamp ? formatTimestamp(item.timestamp) : `Block ${item.blockNumber}`}</span>
                    <span>{shortAddress(item.txHash)}</span>
                  </div>
                </div>
              ))}
            </div>
          </article>
        </section>

        <aside className="detail-sidebar">
          <article className="detail-card action-card">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Actions</p>
                <h2>Context-aware contract calls.</h2>
              </div>
            </div>

            <div className="action-stack">
              <div className="action-box">
                <span className="field-label">Fundraising deadline</span>
                <strong>{formatTimestamp(campaign.contract.fundraisingDeadline)}</strong>
                <label>
                  <span className="field-label">Contribute (ETH)</span>
                  <input
                    inputMode="decimal"
                    placeholder="0.25"
                    value={contributionAmount}
                    onChange={(event) => setContributionAmount(event.target.value)}
                  />
                </label>
                <button
                  className="button"
                  disabled={
                    !isConnected ||
                    isWorking ||
                    Number(campaign.contract.status) !== CampaignStatus.Fundraising
                  }
                  onClick={() => void handleContribute()}
                >
                  Contribute
                </button>
                <button
                  className="button button-secondary"
                  disabled={!isConnected || isWorking || !canFinalize}
                  onClick={() => void handleFinalize()}
                >
                  Finalize fundraising
                </button>
              </div>

              <div className="action-box">
                <span className="field-label">Creator withdrawable</span>
                <strong>{formatEth(campaign.withdrawable)}</strong>
                <button
                  className="button"
                  disabled={!isConnected || isWorking || !canWithdraw}
                  onClick={() => void handleWithdraw()}
                >
                  Withdraw approved funds
                </button>
              </div>

              <div className="action-box">
                <span className="field-label">Backer refund</span>
                <strong>{formatEth(backerState?.refundAmount ?? 0n)}</strong>
                <button
                  className="button"
                  disabled={!isConnected || isWorking || !canRefund}
                  onClick={() => void handleRefund()}
                >
                  Claim refund
                </button>
              </div>

              {currentMilestone ? (
                <div className="action-box">
                  <span className="field-label">Current milestone</span>
                  <strong>{currentMilestone.metadata?.title ?? `Milestone ${currentMilestone.id + 1}`}</strong>
                  <p className="muted-text">
                    Due {formatTimestamp(currentMilestone.contract.dueDate)} · voting ends{" "}
                    {currentMilestone.contract.voteEnd
                      ? formatTimestamp(currentMilestone.contract.voteEnd)
                      : "after proof submission"}
                  </p>

                  <label>
                    <span className="field-label">Proof summary</span>
                    <textarea
                      rows={4}
                      value={proofSummary}
                      onChange={(event) => setProofSummary(event.target.value)}
                    />
                  </label>

                  <label>
                    <span className="field-label">Demo links</span>
                    <textarea
                      rows={3}
                      placeholder="One link per line"
                      value={proofLinks}
                      onChange={(event) => setProofLinks(event.target.value)}
                    />
                  </label>

                  <label>
                    <span className="field-label">Evidence files</span>
                    <input
                      multiple
                      type="file"
                      onChange={(event) => setProofFiles(Array.from(event.target.files ?? []))}
                    />
                  </label>

                  <button
                    className="button"
                    disabled={!isConnected || isWorking || !canSubmitProof}
                    onClick={() => void handleProofSubmission()}
                  >
                    Submit proof + open voting
                  </button>

                  <div className="button-row">
                    <button
                      className="button button-secondary"
                      disabled={!canVote || isWorking}
                      onClick={() => void handleVote(true)}
                    >
                      Vote YES
                    </button>
                    <button
                      className="button button-secondary"
                      disabled={!canVote || isWorking}
                      onClick={() => void handleVote(false)}
                    >
                      Vote NO
                    </button>
                  </div>

                  {voteReceipt?.hasVoted ? (
                    <p className="feedback">
                      You already voted {voteReceipt.support ? "YES" : "NO"} on the current milestone.
                    </p>
                  ) : null}

                  <button
                    className="button button-secondary"
                    disabled={!isConnected || isWorking || !canExecute}
                    onClick={() => void handleExecute()}
                  >
                    Execute current milestone
                  </button>

                  <button
                    className="button button-secondary"
                    disabled={!isConnected || isWorking || !canFailForMissedDeadline}
                    onClick={() => void handleMissedDeadlineFailure()}
                  >
                    Fail for missed deadline
                  </button>
                </div>
              ) : null}
            </div>

            {feedback ? <p className="feedback">{feedback}</p> : null}
            {error ? <p className="feedback feedback-error">{error}</p> : null}
            {isRefreshing ? <p className="feedback">Refreshing contract state...</p> : null}
          </article>
        </aside>
      </div>
    </main>
  );
}
