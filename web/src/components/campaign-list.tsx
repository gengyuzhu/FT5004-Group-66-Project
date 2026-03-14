import Link from "next/link";

import type { CampaignViewModel } from "@/lib/types";
import {
  formatEth,
  formatTimestamp,
  getCampaignStatusLabel,
  getFailureReasonLabel,
  getProgressPercentage,
} from "@/lib/utils";

type CampaignListProps = {
  campaigns: CampaignViewModel[];
  isLoading: boolean;
  error: string | null;
  searchTerm: string;
  onSearchChange: (value: string) => void;
};

export function CampaignList({
  campaigns,
  isLoading,
  error,
  searchTerm,
  onSearchChange,
}: CampaignListProps) {
  return (
    <section className="campaign-list">
      <div className="section-heading">
        <div>
          <p className="eyebrow">Campaign Ledger</p>
          <h2>Browse the live milestone queue.</h2>
        </div>
        <label className="search-field">
          <span className="field-label">Search</span>
          <input
            placeholder="Filter by title, creator, or status"
            value={searchTerm}
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </label>
      </div>

      {isLoading ? <p className="feedback">Loading campaign state from the chain...</p> : null}
      {error ? <p className="feedback feedback-error">{error}</p> : null}
      {!isLoading && !campaigns.length && !error ? (
        <p className="feedback">
          No campaigns found on this network yet. Create the first one from the form.
        </p>
      ) : null}

      <div className="campaign-grid">
        {campaigns.map((campaign) => {
          const progress = getProgressPercentage(
            campaign.contract.totalRaised,
            campaign.contract.goal,
          );

          return (
            <article className="campaign-card" key={campaign.id.toString()}>
              <div className="campaign-card-header">
                <p className="eyebrow">
                  Campaign #{campaign.id.toString()} · {getCampaignStatusLabel(campaign.contract.status)}
                </p>
                <Link href={`/campaigns/${campaign.id.toString()}`} className="inline-link">
                  Open detail
                </Link>
              </div>

              <h3>{campaign.metadata?.title ?? "Untitled campaign"}</h3>
              <p className="muted-text">
                {campaign.metadata?.summary ??
                  "Metadata could not be loaded from IPFS, but the on-chain campaign is still live."}
              </p>

              <div className="campaign-stats">
                <div>
                  <span className="field-label">Raised</span>
                  <strong>{formatEth(campaign.contract.totalRaised)}</strong>
                </div>
                <div>
                  <span className="field-label">Goal</span>
                  <strong>{formatEth(campaign.contract.goal)}</strong>
                </div>
                <div>
                  <span className="field-label">Deadline</span>
                  <strong>{formatTimestamp(campaign.contract.fundraisingDeadline)}</strong>
                </div>
              </div>

              <div className="progress-track" aria-hidden="true">
                <span style={{ width: `${progress}%` }} />
              </div>

              <div className="campaign-footer">
                <div>
                  <span className="field-label">Current milestone</span>
                  <strong>
                    {Number(campaign.contract.currentMilestone) + 1} /{" "}
                    {Number(campaign.contract.milestoneCount)}
                  </strong>
                </div>
                <div>
                  <span className="field-label">Failure rule</span>
                  <strong>{getFailureReasonLabel(campaign.contract.failureReason)}</strong>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
