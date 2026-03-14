import Link from "next/link";

import type { CampaignViewModel } from "@/lib/types";
import {
  formatEth,
  formatTimeRemaining,
  formatTimestamp,
  getCampaignStatusAccent,
  getCampaignStatusLabel,
  getFailureReasonLabel,
  getProgressPercentage,
  shortAddress,
} from "@/lib/utils";

type CampaignListProps = {
  campaigns: CampaignViewModel[];
  currentPage: number;
  isLoading: boolean;
  error: string | null;
  totalItems: number;
  totalPages: number;
  onPageChange: (value: number) => void;
  searchTerm: string;
  statusFilter: string;
  onSearchChange: (value: string) => void;
  onStatusFilterChange: (value: string) => void;
};

const filters = ["all", "fundraising", "active", "completed", "failed"];

function getFilterLabel(filter: string) {
  return filter.charAt(0).toUpperCase() + filter.slice(1);
}

export function CampaignList({
  campaigns,
  currentPage,
  isLoading,
  error,
  totalItems,
  totalPages,
  onPageChange,
  searchTerm,
  statusFilter,
  onSearchChange,
  onStatusFilterChange,
}: CampaignListProps) {
  return (
    <section className="campaign-list">
      <div className="surface-header">
        <div>
          <p className="eyebrow">Campaign Directory</p>
          <h2>Browse live milestone crowdfunding campaigns.</h2>
        </div>

        <label className="search-field">
          <span className="field-label">Search</span>
          <input
            placeholder="Search title, creator, campaign id, or status"
            value={searchTerm}
            onChange={(event) => onSearchChange(event.target.value)}
          />
        </label>
      </div>

      <div className="filter-row">
        {filters.map((filter) => (
          <button
            key={filter}
            className={`filter-chip ${statusFilter === filter ? "filter-chip-active" : ""}`}
            onClick={() => onStatusFilterChange(filter)}
            type="button"
          >
            {getFilterLabel(filter)}
          </button>
        ))}
      </div>

      {isLoading ? <p className="feedback">Loading campaign state from the selected chain...</p> : null}
      {error ? <p className="feedback feedback-error">{error}</p> : null}
      {!isLoading && !campaigns.length && !error ? (
        <p className="feedback">No campaigns matched the current filters.</p>
      ) : null}

      <div className="campaign-grid">
        {campaigns.map((campaign, index) => {
          const progress = getProgressPercentage(campaign.contract.totalRaised, campaign.contract.goal);
          const statusLabel = getCampaignStatusLabel(campaign.contract.status);

          return (
            <article
              className="campaign-card campaign-card-dark"
              key={campaign.id.toString()}
              style={{ animationDelay: `${index * 60}ms` }}
            >
              <div className="campaign-card-topline">
                <span className={`status-pill ${getCampaignStatusAccent(campaign.contract.status)}`}>
                  {statusLabel}
                </span>
                <span className="mono-note">#{campaign.id.toString()}</span>
              </div>

              <h3>{campaign.metadata?.title ?? "Untitled campaign"}</h3>
              <p className="muted-text">
                {campaign.metadata?.summary ??
                  "Metadata could not be resolved from IPFS, but the on-chain campaign remains accessible."}
              </p>

              <div className="campaign-progress-copy">
                <strong>{formatEth(campaign.contract.totalRaised, 2)}</strong>
                <span>of {formatEth(campaign.contract.goal, 2)}</span>
              </div>

              <div className="progress-track progress-track-dark" aria-hidden="true">
                <span style={{ width: `${progress}%` }} />
              </div>

              <div className="campaign-meta-grid">
                <div>
                  <span className="field-label">Creator</span>
                  <strong>{shortAddress(campaign.contract.creator)}</strong>
                </div>
                <div>
                  <span className="field-label">Current step</span>
                  <strong>
                    {Number(campaign.contract.currentMilestone) + 1} /{" "}
                    {Number(campaign.contract.milestoneCount)}
                  </strong>
                </div>
                <div>
                  <span className="field-label">Funding window</span>
                  <strong>{formatTimeRemaining(campaign.contract.fundraisingDeadline)}</strong>
                </div>
                <div>
                  <span className="field-label">Failure rule</span>
                  <strong>{getFailureReasonLabel(campaign.contract.failureReason)}</strong>
                </div>
              </div>

              <div className="campaign-card-footer">
                <span className="mono-note">{formatTimestamp(campaign.contract.fundraisingDeadline)}</span>
                <Link className="inline-link" href={`/campaigns/${campaign.id.toString()}`}>
                  Open campaign
                </Link>
              </div>
            </article>
          );
        })}
      </div>

      {totalItems > 0 ? (
        <div className="pagination-row">
          <div className="pagination-copy">
            <span className="field-label">Results</span>
            <strong>
              Page {currentPage} of {totalPages} | {totalItems} campaigns
            </strong>
          </div>

          <div className="pagination-actions">
            <button
              className="button button-ghost button-small"
              disabled={currentPage <= 1}
              onClick={() => onPageChange(currentPage - 1)}
              type="button"
            >
              Previous
            </button>
            <button
              className="button button-ghost button-small"
              disabled={currentPage >= totalPages}
              onClick={() => onPageChange(currentPage + 1)}
              type="button"
            >
              Next
            </button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
