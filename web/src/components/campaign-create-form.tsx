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

      setTitle("");
      setSummary("");
      setDescription("");
      setGoal("");
      setFundraisingDeadline("");
      setExternalLinks("");
      setMilestones(initialMilestones);
      setCoverImage(null);
      setFeedback("Campaign created and indexed from the contract.");
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
      <div className="section-heading">
        <div>
          <p className="eyebrow">Create Campaign</p>
          <h2>Bundle metadata off-chain, enforce the rules on-chain.</h2>
        </div>
      </div>

      <form className="campaign-form" onSubmit={handleSubmit}>
        <label>
          <span className="field-label">Title</span>
          <input required value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>

        <label>
          <span className="field-label">Summary</span>
          <textarea
            required
            rows={3}
            value={summary}
            onChange={(event) => setSummary(event.target.value)}
          />
        </label>

        <label>
          <span className="field-label">Description</span>
          <textarea
            required
            rows={5}
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

        <label>
          <span className="field-label">External links</span>
          <textarea
            rows={3}
            placeholder="One link per line"
            value={externalLinks}
            onChange={(event) => setExternalLinks(event.target.value)}
          />
        </label>

        <label>
          <span className="field-label">Cover image</span>
          <input
            type="file"
            accept="image/*"
            onChange={(event) => setCoverImage(event.target.files?.[0] ?? null)}
          />
        </label>

        <div className="subsection-header">
          <div>
            <span className="field-label">Milestones</span>
            <p className="muted-text">Amounts must add up to the campaign goal and due dates must increase.</p>
          </div>
          <button className="button button-secondary" onClick={addMilestone} type="button">
            Add milestone
          </button>
        </div>

        <div className="milestone-editor-list">
          {milestones.map((milestone, index) => (
            <article className="milestone-editor" key={`${index}-${milestone.title}`}>
              <div className="milestone-editor-header">
                <strong>Milestone {index + 1}</strong>
                <button
                  className="inline-link"
                  onClick={() => removeMilestone(index)}
                  type="button"
                >
                  Remove
                </button>
              </div>

              <label>
                <span className="field-label">Title</span>
                <input
                  required
                  value={milestone.title}
                  onChange={(event) => updateMilestone(index, "title", event.target.value)}
                />
              </label>

              <label>
                <span className="field-label">Description</span>
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

        <button className="button" disabled={isSubmitting || isRefreshing} type="submit">
          {isSubmitting ? "Creating..." : "Create campaign"}
        </button>
      </form>

      {feedback ? <p className="feedback">{feedback}</p> : null}
      {error ? <p className="feedback feedback-error">{error}</p> : null}
    </section>
  );
}
