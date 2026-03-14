"use client";

import Image from "next/image";
import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { parseEther } from "viem";
import { useAccount, useChainId, usePublicClient, useWriteContract } from "wagmi";

import { AppTopbar } from "@/components/app-topbar";
import { milestoneVaultAbi } from "@/lib/contracts/milestoneVault";
import { defaultChainId } from "@/lib/config";
import { getIpfsUrl } from "@/lib/ipfs";
import {
  fetchCampaign,
  fetchCampaignActivity,
  getMilestoneVaultAddress,
  normalizeBackerState,
  normalizeVoteReceipt,
} from "@/lib/milestone-vault";
import {
  CampaignStatus,
  type ActivityItem,
  type BackerState,
  type CampaignViewModel,
  type VoteReceipt,
} from "@/lib/types";
import {
  compareAddresses,
  formatEth,
  formatShortEth,
  formatTimeRemaining,
  formatTimestamp,
  getCampaignStatusAccent,
  getCampaignStatusLabel,
  getFailureReasonLabel,
  getProgressPercentage,
  parseLinks,
  shortAddress,
} from "@/lib/utils";

type CampaignDetailClientProps = {
  campaignId: string;
};

type DetailTab = "overview" | "milestones" | "activity";

const detailTabs: DetailTab[] = ["overview", "milestones", "activity"];

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
  const [activeTab, setActiveTab] = useState<DetailTab>("overview");
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
            setVoteReceipt(voteReceiptRaw ? normalizeVoteReceipt(voteReceiptRaw) : null);
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
    if (!campaignIdValue || !contractAddress || !contributionAmount) {
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
    if (!campaign || !campaignIdValue || !contractAddress || !proofSummary.trim()) {
      setError("Add a short proof summary before opening voting.");
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

  function renderShellMessage(message: string, errorState = false) {
    return (
      <main className="detail-shell">
        <AppTopbar backHref="/" backLabel="Back to dashboard" />
        <section className="detail-shell-message">
          <div className={`detail-section-card ${errorState ? "detail-section-card-error" : ""}`}>
            <p className={`feedback ${errorState ? "feedback-error" : ""}`}>{message}</p>
          </div>
        </section>
      </main>
    );
  }

  if (!campaignIdValue) {
    return renderShellMessage("The campaign id must be a valid integer.", true);
  }

  if (!contractAddress) {
    return renderShellMessage("No MilestoneVault deployment is configured for the current chain.", true);
  }

  if (isLoading) {
    return renderShellMessage("Loading campaign detail from the chain...");
  }

  if (!campaign) {
    return renderShellMessage(error ?? "Campaign not found.", true);
  }

  const currentMilestoneIndex = Number(campaign.contract.currentMilestone);
  const currentMilestone = campaign.milestones[currentMilestoneIndex] ?? null;
  const isCreator = compareAddresses(address, campaign.contract.creator);
  const now = BigInt(Math.floor(Date.now() / 1000));
  const fundingProgress = getProgressPercentage(campaign.contract.totalRaised, campaign.contract.goal);
  const currentParticipation = currentMilestone
    ? currentMilestone.contract.yesWeight + currentMilestone.contract.noWeight
    : 0n;
  const quorumTarget = campaign.contract.totalRaised / 5n;
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
  const currentRole = isCreator
    ? "Creator"
    : (backerState?.contributionAmount ?? 0n) > 0n
      ? "Backer"
      : "Observer";
  const statusLabel = getCampaignStatusLabel(campaign.contract.status);
  const statusAccent = getCampaignStatusAccent(campaign.contract.status);

  return (
    <main className="detail-shell">
      <AppTopbar backHref="/" backLabel="Back to dashboard" />

      <section className="detail-hero-card">
        <div className="detail-hero-copy">
          <div className="detail-hero-head">
            <span className={`status-pill ${statusAccent}`}>{statusLabel}</span>
            <span className="mono-note">Campaign #{campaign.id.toString()}</span>
          </div>

          <h1>{campaign.metadata?.title ?? "Untitled campaign"}</h1>
          <p className="hero-text">
            {campaign.metadata?.summary ??
              "Campaign metadata could not be resolved from IPFS, but the on-chain state remains readable."}
          </p>

          <div className="detail-progress-panel">
            <div className="campaign-progress-copy">
              <strong>{formatEth(campaign.contract.totalRaised, 2)}</strong>
              <span>of {formatEth(campaign.contract.goal, 2)}</span>
            </div>
            <div className="progress-track progress-track-dark" aria-hidden="true">
              <span style={{ width: `${fundingProgress}%` }} />
            </div>
          </div>

          <div className="detail-kpis">
            <article className="detail-kpi">
              <span className="field-label">Creator</span>
              <strong>{shortAddress(campaign.contract.creator)}</strong>
            </article>
            <article className="detail-kpi">
              <span className="field-label">Role</span>
              <strong>{currentRole}</strong>
            </article>
            <article className="detail-kpi">
              <span className="field-label">Milestones</span>
              <strong>
                {Math.min(currentMilestoneIndex + 1, Number(campaign.contract.milestoneCount))} /{" "}
                {Number(campaign.contract.milestoneCount)}
              </strong>
            </article>
            <article className="detail-kpi">
              <span className="field-label">Failure reason</span>
              <strong>{getFailureReasonLabel(campaign.contract.failureReason)}</strong>
            </article>
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
        ) : (
          <div className="detail-cover detail-cover-fallback">
            <div className="cover-fallback-copy">
              <p className="eyebrow">On-chain brief</p>
              <h2>Escrowed capital, milestone proof, weighted voting.</h2>
              <p className="muted-text">
                This campaign uses sequential milestone releases, creator pull-payments, and
                refunds from unreleased escrow only.
              </p>
            </div>
          </div>
        )}
      </section>

      <section className="detail-strip">
        <article className="mini-card">
          <span className="field-label">Approved payout</span>
          <strong>{formatEth(campaign.contract.approvedPayoutTotal)}</strong>
        </article>
        <article className="mini-card">
          <span className="field-label">Creator withdrawn</span>
          <strong>{formatEth(campaign.contract.creatorWithdrawn)}</strong>
        </article>
        <article className="mini-card">
          <span className="field-label">Refund pool</span>
          <strong>{formatEth(campaign.refundPool)}</strong>
        </article>
        <article className="mini-card">
          <span className="field-label">Current milestone due</span>
          <strong>{currentMilestone ? formatTimeRemaining(currentMilestone.contract.dueDate) : "Completed"}</strong>
        </article>
      </section>

      <section className="detail-tabs">
        {detailTabs.map((tab) => (
          <button
            key={tab}
            className={`detail-tab ${activeTab === tab ? "detail-tab-active" : ""}`}
            onClick={() => setActiveTab(tab)}
            type="button"
          >
            {tab}
          </button>
        ))}
      </section>

      <div className="detail-content-grid">
        <section className="detail-primary">
          {activeTab === "overview" ? (
            <>
              <article className="detail-section-card">
                <div className="detail-section-header">
                  <div>
                    <p className="eyebrow">Project overview</p>
                    <h2>What backers are funding and how settlement stays constrained.</h2>
                  </div>
                </div>

                <div className="overview-grid">
                  <div className="overview-panel">
                    <span className="field-label">Description</span>
                    <p className="muted-text">
                      {campaign.metadata?.description ??
                        "The off-chain campaign description is unavailable, but the campaign rules and balances remain visible on-chain."}
                    </p>
                  </div>

                  <div className="overview-panel">
                    <span className="field-label">Rule snapshot</span>
                    <ul className="compact-list">
                      <li>Voting weight follows each backer&apos;s contribution size.</li>
                      <li>Milestones execute strictly in order.</li>
                      <li>Refunds cover only unreleased escrow, never approved payouts.</li>
                      <li>Missed deadlines can be failed publicly if no proof was submitted.</li>
                    </ul>
                  </div>
                </div>

                {campaign.metadata?.externalLinks?.length ? (
                  <div className="link-cluster">
                    {campaign.metadata.externalLinks.map((externalLink) => (
                      <a
                        className="inline-link"
                        href={externalLink}
                        key={externalLink}
                        rel="noreferrer"
                        target="_blank"
                      >
                        {externalLink}
                      </a>
                    ))}
                  </div>
                ) : null}
              </article>

              <article className="detail-section-card">
                <div className="detail-section-header">
                  <div>
                    <p className="eyebrow">Current contract state</p>
                    <h2>The page is reading direct state, not a platform database mirror.</h2>
                  </div>
                </div>

                <div className="info-grid">
                  <article className="info-card">
                    <span className="field-label">Fundraising deadline</span>
                    <strong>{formatTimestamp(campaign.contract.fundraisingDeadline)}</strong>
                  </article>
                  <article className="info-card">
                    <span className="field-label">Campaign created</span>
                    <strong>{formatTimestamp(campaign.contract.createdAt)}</strong>
                  </article>
                  <article className="info-card">
                    <span className="field-label">Backer contribution</span>
                    <strong>{formatEth(backerState?.contributionAmount ?? 0n)}</strong>
                  </article>
                  <article className="info-card">
                    <span className="field-label">Backer refundable</span>
                    <strong>{formatEth(backerState?.refundAmount ?? 0n)}</strong>
                  </article>
                </div>

                {currentMilestone ? (
                  <div className="current-milestone-banner">
                    <div>
                      <span className="field-label">Current milestone</span>
                      <strong>
                        {currentMilestone.metadata?.title ?? `Milestone ${currentMilestone.id + 1}`}
                      </strong>
                    </div>
                    <p className="muted-text">
                      Due {formatTimestamp(currentMilestone.contract.dueDate)}. Voting progress is{" "}
                      {formatShortEth(currentParticipation)} / {formatShortEth(quorumTarget)} ETH toward quorum.
                    </p>
                  </div>
                ) : null}
              </article>
            </>
          ) : null}

          {activeTab === "milestones" ? (
            <article className="detail-section-card">
              <div className="detail-section-header">
                <div>
                  <p className="eyebrow">Milestone ledger</p>
                  <h2>Each tranche, vote window, and proof bundle is exposed as a separate step.</h2>
                </div>
              </div>

              <div className="milestone-list">
                {campaign.milestones.map((milestone) => {
                  const voteTotal = milestone.contract.yesWeight + milestone.contract.noWeight;
                  const voteProgress =
                    campaign.contract.totalRaised > 0n
                      ? getProgressPercentage(voteTotal, campaign.contract.totalRaised)
                      : 0;
                  const yesShare =
                    voteTotal > 0n ? getProgressPercentage(milestone.contract.yesWeight, voteTotal) : 0;
                  const noShare = voteTotal > 0n ? Math.max(100 - yesShare, 0) : 0;

                  return (
                    <article
                      className={`milestone-card ${
                        milestone.id === currentMilestoneIndex ? "milestone-card-active" : ""
                      }`}
                      key={milestone.id}
                    >
                      <div className="milestone-card-top">
                        <div>
                          <p className="eyebrow">Milestone {milestone.id + 1}</p>
                          <h3>{milestone.metadata?.title ?? `Milestone ${milestone.id + 1}`}</h3>
                        </div>
                        <span
                          className={`status-pill ${
                            milestone.contract.executed
                              ? "status-completed"
                              : milestone.contract.proofCID
                                ? "status-active"
                                : milestone.id === currentMilestoneIndex
                                  ? "status-fundraising"
                                  : "status-default"
                          }`}
                        >
                          {milestone.contract.executed
                            ? "Approved"
                            : milestone.contract.proofCID
                              ? "Voting open"
                              : milestone.id === currentMilestoneIndex
                                ? "Current"
                                : "Queued"}
                        </span>
                      </div>

                      <p className="muted-text">
                        {milestone.metadata?.description ?? "No milestone description available in metadata."}
                      </p>

                      <div className="info-grid">
                        <article className="info-card">
                          <span className="field-label">Amount</span>
                          <strong>{formatEth(milestone.contract.amount)}</strong>
                        </article>
                        <article className="info-card">
                          <span className="field-label">Due date</span>
                          <strong>{formatTimestamp(milestone.contract.dueDate)}</strong>
                        </article>
                        <article className="info-card">
                          <span className="field-label">Yes weight</span>
                          <strong>{formatEth(milestone.contract.yesWeight)}</strong>
                        </article>
                        <article className="info-card">
                          <span className="field-label">No weight</span>
                          <strong>{formatEth(milestone.contract.noWeight)}</strong>
                        </article>
                      </div>

                      <div className="vote-meter">
                        <div className="vote-meter-head">
                          <span className="field-label">Participation</span>
                          <span className="mono-note">{voteProgress.toFixed(0)}% of total escrow</span>
                        </div>
                        <div className="progress-track progress-track-dark">
                          <span style={{ width: `${voteProgress}%` }} />
                        </div>
                        <div className="vote-breakdown">
                          <span>YES {yesShare.toFixed(0)}%</span>
                          <span>NO {noShare.toFixed(0)}%</span>
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

                          {milestone.proof?.demoLinks.length ? (
                            <div className="proof-files">
                              {milestone.proof.demoLinks.map((demoLink) => (
                                <a
                                  className="inline-link"
                                  href={demoLink}
                                  key={demoLink}
                                  rel="noreferrer"
                                  target="_blank"
                                >
                                  Demo link
                                </a>
                              ))}
                            </div>
                          ) : null}

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
                  );
                })}
              </div>
            </article>
          ) : null}

          {activeTab === "activity" ? (
            <>
              <article className="detail-section-card">
                <div className="detail-section-header">
                  <div>
                    <p className="eyebrow">Activity feed</p>
                    <h2>Recent on-chain actions for this campaign.</h2>
                  </div>
                </div>

                <div className="activity-list">
                  {activity.length ? (
                    activity.map((item) => (
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
                    ))
                  ) : (
                    <p className="muted-text">No campaign events were found on this network yet.</p>
                  )}
                </div>
              </article>

              <article className="detail-section-card">
                <div className="detail-section-header">
                  <div>
                    <p className="eyebrow">Operator notes</p>
                    <h2>What still requires human coordination outside the chain.</h2>
                  </div>
                </div>

                <ul className="compact-list">
                  <li>Proof integrity is verifiable through IPFS CIDs, but truthfulness still needs voters.</li>
                  <li>Low participation can still cause governance friction even with quorum.</li>
                  <li>Weighted voting simplifies anti-sybil handling but favors larger backers.</li>
                  <li>Refund math stays proportional to unreleased escrow, not the creator&apos;s withdrawn balance.</li>
                </ul>
              </article>
            </>
          ) : null}
        </section>

        <aside className="detail-sidebar">
          <article className="detail-section-card sticky-panel">
            <div className="detail-section-header">
              <div>
                <p className="eyebrow">Live actions</p>
                <h2>Contract writes stay grouped by the current campaign state.</h2>
              </div>
            </div>

            <div className="action-grid">
              <div className="action-card">
                <span className="field-label">Fundraising</span>
                <strong>{formatTimestamp(campaign.contract.fundraisingDeadline)}</strong>
                <p className="muted-text">
                  Backers can contribute until the deadline. Anyone can finalize the campaign after the window closes.
                </p>

                <label>
                  <span className="field-label">Contribute (ETH)</span>
                  <input
                    inputMode="decimal"
                    placeholder="0.25"
                    value={contributionAmount}
                    onChange={(event) => setContributionAmount(event.target.value)}
                  />
                </label>

                <div className="button-row">
                  <button
                    className="button"
                    disabled={
                      !isConnected ||
                      isWorking ||
                      Number(campaign.contract.status) !== CampaignStatus.Fundraising
                    }
                    onClick={() => void handleContribute()}
                    type="button"
                  >
                    Contribute
                  </button>
                  <button
                    className="button button-secondary"
                    disabled={!isConnected || isWorking || !canFinalize}
                    onClick={() => void handleFinalize()}
                    type="button"
                  >
                    Finalize
                  </button>
                </div>
              </div>

              <div className="action-card">
                <span className="field-label">Payout + refund</span>
                <strong>{formatEth(campaign.withdrawable)} withdrawable</strong>
                <p className="muted-text">
                  Approved milestone tranches unlock creator withdrawals. Failed campaigns unlock proportional refunds.
                </p>
                <div className="button-row">
                  <button
                    className="button"
                    disabled={!isConnected || isWorking || !canWithdraw}
                    onClick={() => void handleWithdraw()}
                    type="button"
                  >
                    Withdraw
                  </button>
                  <button
                    className="button button-secondary"
                    disabled={!isConnected || isWorking || !canRefund}
                    onClick={() => void handleRefund()}
                    type="button"
                  >
                    Claim refund
                  </button>
                </div>
              </div>

              {currentMilestone ? (
                <div className="action-card">
                  <span className="field-label">Current milestone</span>
                  <strong>{currentMilestone.metadata?.title ?? `Milestone ${currentMilestone.id + 1}`}</strong>
                  <p className="muted-text">
                    Due {formatTimestamp(currentMilestone.contract.dueDate)}. Voting window{" "}
                    {currentMilestone.contract.voteEnd
                      ? `ends ${formatTimestamp(currentMilestone.contract.voteEnd)}`
                      : "opens after proof submission"}.
                  </p>

                  <label>
                    <span className="field-label">Proof summary</span>
                    <textarea
                      placeholder="Summarize what changed in this milestone and what the evidence bundle contains."
                      rows={4}
                      value={proofSummary}
                      onChange={(event) => setProofSummary(event.target.value)}
                    />
                  </label>

                  <label>
                    <span className="field-label">Demo links</span>
                    <textarea
                      placeholder="One link per line"
                      rows={3}
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
                    type="button"
                  >
                    Submit proof
                  </button>

                  <div className="button-row">
                    <button
                      className="button button-secondary"
                      disabled={!canVote || isWorking}
                      onClick={() => void handleVote(true)}
                      type="button"
                    >
                      Vote YES
                    </button>
                    <button
                      className="button button-secondary"
                      disabled={!canVote || isWorking}
                      onClick={() => void handleVote(false)}
                      type="button"
                    >
                      Vote NO
                    </button>
                  </div>

                  {voteReceipt?.hasVoted ? (
                    <p className="feedback">
                      You already voted {voteReceipt.support ? "YES" : "NO"} on the current milestone.
                    </p>
                  ) : null}

                  <div className="button-row">
                    <button
                      className="button button-ghost"
                      disabled={!isConnected || isWorking || !canExecute}
                      onClick={() => void handleExecute()}
                      type="button"
                    >
                      Execute
                    </button>
                    <button
                      className="button button-ghost"
                      disabled={!isConnected || isWorking || !canFailForMissedDeadline}
                      onClick={() => void handleMissedDeadlineFailure()}
                      type="button"
                    >
                      Fail deadline
                    </button>
                  </div>
                </div>
              ) : null}
            </div>

            {feedback ? <p className="feedback">{feedback}</p> : null}
            {error ? <p className="feedback feedback-error">{error}</p> : null}
            {isRefreshing ? <p className="feedback">Refreshing contract state...</p> : null}

            <div className="sidebar-footer-note">
              <p className="field-label">Status snapshot</p>
              <p className="muted-text">
                This page is connected to chain {chainId}. If wallet and network state change, the
                campaign view rehydrates from the contract and emitted events.
              </p>
              <Link className="inline-link" href="/">
                Return to campaign directory
              </Link>
            </div>
          </article>
        </aside>
      </div>
    </main>
  );
}
