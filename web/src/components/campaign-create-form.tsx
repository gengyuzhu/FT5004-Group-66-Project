"use client";

import { useState } from "react";
import { parseEther } from "viem";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";

import { milestoneVaultAbi } from "@/lib/contracts/milestoneVault";
import { getMilestoneVaultAddress } from "@/lib/milestone-vault";
import { parseDateTimeInput, parseLinks } from "@/lib/utils";

type CampaignCreateFormProps = {
  chainId: number;
  onCreated: () => void;
  onCancel: () => void;
  isRefreshing: boolean;
};

type MilestoneInput = {
  title: string;
  description: string;
  amount: string;
  dueDate: string;
};

const initialMilestones = [
  { title: "Milestone 1", description: "", amount: "", dueDate: "" },
  { title: "Milestone 2", description: "", amount: "", dueDate: "" },
] satisfies MilestoneInput[];

export function CampaignCreateForm({
  chainId,
  onCreated,
  onCancel,
  isRefreshing,
}: CampaignCreateFormProps) {
  const contractAddress = getMilestoneVaultAddress(chainId);
  const publicClient = usePublicClient({ chainId });
  const { address, isConnected } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState("");
  const [description, setDescription] = useState("");
  const [goal, setGoal] = useState("");
  const [fundraisingDeadline, setFundraisingDeadline] = useState("");
  const [externalLinks, setExternalLinks] = useState("");
  const [milestones, setMilestones] = useState<MilestoneInput[]>(initialMilestones);
  const [coverImage, setCoverImage] = useState<File | null>(null);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const numericGoal = Number.parseFloat(goal || "0");
  const milestoneDraftTotal = milestones.reduce(
    (sum, milestone) => sum + (Number.parseFloat(milestone.amount || "0") || 0),
    0,
  );
  const remainingAllocation = numericGoal - milestoneDraftTotal;
  const allocationMatchesGoal = goal.trim() !== "" && Math.abs(remainingAllocation) < 0.000001;

  const parsedFundraisingDeadline = fundraisingDeadline ? Date.parse(fundraisingDeadline) : Number.NaN;
  const hasAscendingSchedule = milestones.every((milestone, index) => {
    if (!milestone.dueDate) {
      return true;
    }

    const currentDue = Date.parse(milestone.dueDate);
    const previousDue =
      index === 0
        ? parsedFundraisingDeadline
        : Date.parse(milestones[index - 1]?.dueDate ?? milestones[index].dueDate);

    return !Number.isNaN(currentDue) && !Number.isNaN(previousDue) && currentDue > previousDue;
  });

  function updateMilestone(index: number, field: keyof MilestoneInput, value: string) {
    setMilestones((currentMilestones) =>
      currentMilestones.map((milestone, milestoneIndex) =>
        milestoneIndex === index ? { ...milestone, [field]: value } : milestone,
      ),
    );
  }

  function addMilestone() {
    setMilestones((currentMilestones) => [
      ...currentMilestones,
      {
        title: `Milestone ${currentMilestones.length + 1}`,
        description: "",
        amount: "",
        dueDate: "",
      },
    ]);
  }

  function removeMilestone(index: number) {
    setMilestones((currentMilestones) =>
      currentMilestones.length === 1
        ? currentMilestones
        : currentMilestones.filter((_, milestoneIndex) => milestoneIndex !== index),
    );
  }

  function resetForm() {
    setTitle("");
    setSummary("");
    setDescription("");
    setGoal("");
    setFundraisingDeadline("");
    setExternalLinks("");
    setMilestones(initialMilestones);
    setCoverImage(null);
  }

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!isConnected || !address) {
      setError("Connect a wallet before creating a campaign.");
      return;
    }

    if (!contractAddress || !publicClient) {
      setError("No contract deployment is configured for this network yet.");
      return;
    }

    if (!allocationMatchesGoal) {
      setError("Milestone amounts must sum exactly to the campaign goal.");
      return;
    }

    if (!hasAscendingSchedule) {
      setError("Milestone due dates must be strictly later than the fundraising deadline and each prior milestone.");
      return;
    }

    setIsSubmitting(true);
    setError(null);
    setFeedback("Uploading campaign metadata to IPFS...");

    try {
      const goalWei = parseEther(goal);
      const fundraisingDeadlineTs = parseDateTimeInput(fundraisingDeadline);
      const milestoneAmounts = milestones.map((milestone) => parseEther(milestone.amount));
      const milestoneDueDates = milestones.map((milestone) => parseDateTimeInput(milestone.dueDate));
      const milestoneTotal = milestoneAmounts.reduce((sum, amount) => sum + amount, 0n);

      if (milestoneTotal !== goalWei) {
        throw new Error("The milestone amounts must sum exactly to the campaign goal.");
      }

      const formData = new FormData();
      formData.append("title", title);
      formData.append("summary", summary);
      formData.append("description", description);
      formData.append("goal", goal);
      formData.append("fundraisingDeadline", fundraisingDeadline);
      formData.append("externalLinks", JSON.stringify(parseLinks(externalLinks)));
      formData.append(
        "milestones",
        JSON.stringify(
          milestones.map((milestone, index) => ({
            ...milestone,
            amount: milestone.amount,
            dueDate: milestone.dueDate,
            index,
          })),
        ),
      );

      if (coverImage) {
        formData.append("coverImage", coverImage);
      }

      const metadataResponse = await fetch("/api/ipfs/campaign", {
        method: "POST",
        body: formData,
      });

      const metadataPayload = (await metadataResponse.json()) as {
        cid?: string;
        error?: string;
      };

      if (!metadataResponse.ok || !metadataPayload.cid) {
        throw new Error(metadataPayload.error ?? "Unable to pin campaign metadata.");
      }

      setFeedback("Submitting createCampaign transaction...");
      const hash = await writeContractAsync({
        address: contractAddress,
        abi: milestoneVaultAbi,
        functionName: "createCampaign",
        args: [
          goalWei,
          fundraisingDeadlineTs,
          milestoneAmounts,
          milestoneDueDates,
          metadataPayload.cid,
        ],
        chainId,
      });

      setFeedback("Waiting for confirmation...");
      await publicClient.waitForTransactionReceipt({ hash });

      resetForm();
      setFeedback("Campaign created and now visible in the directory.");
      onCreated();
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Unable to create campaign.");
      setFeedback(null);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <section className="form-panel">
      <div className="form-header">
        <div>
          <p className="eyebrow">Creator Studio</p>
          <h2>Draft the campaign once, then let the contract enforce the release schedule.</h2>
          <p className="muted-text">
            Metadata and cover art stay off-chain in IPFS. Only the campaign goal, milestone due
            dates, and the metadata CID are written to the contract.
          </p>
        </div>

        <div className="form-header-actions">
          <button className="button button-ghost" onClick={onCancel} type="button">
            Cancel
          </button>
          <button className="button" disabled={isSubmitting || isRefreshing} form="campaign-form" type="submit">
            {isSubmitting ? "Creating..." : "Deploy campaign"}
          </button>
        </div>
      </div>

      <div className="draft-summary">
        <article className={`summary-chip ${goal.trim() ? "summary-chip-ok" : ""}`}>
          <span className="field-label">Target</span>
          <strong>{goal.trim() ? `${goal} ETH` : "Pending"}</strong>
        </article>
        <article className={`summary-chip ${allocationMatchesGoal ? "summary-chip-ok" : "summary-chip-warn"}`}>
          <span className="field-label">Milestone total</span>
          <strong>{milestoneDraftTotal ? `${milestoneDraftTotal.toFixed(4)} ETH` : "0 ETH"}</strong>
        </article>
        <article className={`summary-chip ${hasAscendingSchedule ? "summary-chip-ok" : "summary-chip-warn"}`}>
          <span className="field-label">Schedule health</span>
          <strong>{hasAscendingSchedule ? "Ordered" : "Needs fixing"}</strong>
        </article>
        <article className={`summary-chip ${allocationMatchesGoal ? "summary-chip-ok" : "summary-chip-warn"}`}>
          <span className="field-label">Remaining</span>
          <strong>{goal.trim() ? `${remainingAllocation.toFixed(4)} ETH` : "Set goal first"}</strong>
        </article>
      </div>

      <form className="campaign-form" id="campaign-form" onSubmit={handleSubmit}>
        <div className="form-layout">
          <div className="form-main-column">
            <label>
              <span className="field-label">Project title</span>
              <input
                maxLength={90}
                required
                value={title}
                onChange={(event) => setTitle(event.target.value)}
              />
            </label>

            <label>
              <span className="field-label">One-line summary</span>
              <textarea
                maxLength={220}
                required
                rows={3}
                value={summary}
                onChange={(event) => setSummary(event.target.value)}
              />
            </label>

            <label>
              <span className="field-label">Project story</span>
              <textarea
                required
                rows={7}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
              />
            </label>

            <div className="form-two-up">
              <label>
                <span className="field-label">Goal (ETH)</span>
                <input
                  required
                  inputMode="decimal"
                  placeholder="10"
                  value={goal}
                  onChange={(event) => setGoal(event.target.value)}
                />
              </label>

              <label>
                <span className="field-label">Fundraising deadline</span>
                <input
                  required
                  type="datetime-local"
                  value={fundraisingDeadline}
                  onChange={(event) => setFundraisingDeadline(event.target.value)}
                />
              </label>
            </div>
          </div>

          <aside className="form-side-column">
            <label>
              <span className="field-label">Cover image</span>
              <input
                accept="image/*"
                type="file"
                onChange={(event) => setCoverImage(event.target.files?.[0] ?? null)}
              />
            </label>

            <div className="side-note-card side-note-card-compact">
              <p className="field-label">Pinned asset</p>
              <strong>{coverImage?.name ?? "No file selected yet"}</strong>
              <p className="muted-text">
                The file uploads to IPFS first. The returned CID becomes part of the metadata JSON.
              </p>
            </div>

            <label>
              <span className="field-label">External links</span>
              <textarea
                placeholder="One link per line"
                rows={5}
                value={externalLinks}
                onChange={(event) => setExternalLinks(event.target.value)}
              />
            </label>
          </aside>
        </div>

        <div className="subsection-header">
          <div>
            <span className="field-label">Milestone breakdown</span>
            <p className="muted-text">
              Each milestone must have a unique due date and the full set must equal the campaign goal.
            </p>
          </div>
          <button className="button button-secondary" onClick={addMilestone} type="button">
            Add milestone
          </button>
        </div>

        <div className="milestone-editor-list">
          {milestones.map((milestone, index) => (
            <article className="milestone-editor" key={`${index}-${milestone.title}`}>
              <div className="milestone-editor-header">
                <div className="milestone-chip">
                  <span className="milestone-index">{index + 1}</span>
                  <strong>{milestone.title || `Milestone ${index + 1}`}</strong>
                </div>

                <button
                  className="button button-ghost button-small"
                  disabled={milestones.length === 1}
                  onClick={() => removeMilestone(index)}
                  type="button"
                >
                  Remove
                </button>
              </div>

              <label>
                <span className="field-label">Milestone title</span>
                <input
                  required
                  value={milestone.title}
                  onChange={(event) => updateMilestone(index, "title", event.target.value)}
                />
              </label>

              <label>
                <span className="field-label">Proof expectation</span>
                <textarea
                  required
                  rows={3}
                  value={milestone.description}
                  onChange={(event) => updateMilestone(index, "description", event.target.value)}
                />
              </label>

              <div className="form-two-up">
                <label>
                  <span className="field-label">Amount (ETH)</span>
                  <input
                    required
                    inputMode="decimal"
                    value={milestone.amount}
                    onChange={(event) => updateMilestone(index, "amount", event.target.value)}
                  />
                </label>

                <label>
                  <span className="field-label">Due date</span>
                  <input
                    required
                    type="datetime-local"
                    value={milestone.dueDate}
                    onChange={(event) => updateMilestone(index, "dueDate", event.target.value)}
                  />
                </label>
              </div>
            </article>
          ))}
        </div>
      </form>

      {feedback ? <p className="feedback">{feedback}</p> : null}
      {error ? <p className="feedback feedback-error">{error}</p> : null}
    </section>
  );
}
