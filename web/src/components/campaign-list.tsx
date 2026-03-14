import Image from "next/image";
import Link from "next/link";

import { getIpfsUrl } from "@/lib/ipfs";
import type { CampaignViewModel } from "@/lib/types";
import {
  formatEth,
  formatShortEth,
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
  sortBy: "latest" | "progress" | "goal" | "ending";
  statusCounts: Record<string, number>;
  statusFilter: string;
  onSearchChange: (value: string) => void;
  onSortChange: (value: "latest" | "progress" | "goal" | "ending") => void;
  onStatusFilterChange: (value: string) => void;
};

const filters = ["all", "fundraising", "active", "completed", "failed"];
const sortOptions = [
  { value: "latest", label: "Newest first" },
  { value: "progress", label: "Funding progress" },
  { value: "goal", label: "Largest goal" },
  { value: "ending", label: "Urgent next step" },
] as const;

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
  sortBy,
  statusCounts,
  statusFilter,
  onSearchChange,
  onSortChange,
  onStatusFilterChange,
}: CampaignListProps) {
  return (
    <section className="campaign-list">
      <div className="surface-header">
        <div>
          <p className="eyebrow">Campaign Directory</p>
          <h2>Browse live milestone crowdfunding campaigns with faster scanning controls.</h2>
        </div>

        <div className="search-toolbar">
          <label className="search-field">
            <span className="field-label">Search</span>
            <input
              placeholder="Search title, creator, campaign id, or status"
              value={searchTerm}
              onChange={(event) => onSearchChange(event.target.value)}
            />
          </label>

          <label className="search-field search-field-sort">
            <span className="field-label">Sort</span>
            <select
              aria-label="Sort campaigns"
              value={sortBy}
              onChange={(event) =>
                onSortChange(event.target.value as "latest" | "progress" | "goal" | "ending")
              }
            >
              {sortOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
        </div>
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
            <span className="filter-chip-count">{statusCounts[filter] ?? 0}</span>
          </button>
        ))}
      </div>

      <div className="results-toolbar">
        <div className="results-copy">
          <span className="field-label">Results</span>
          <strong>{totalItems} matching campaigns</strong>
        </div>
        {searchTerm ? (
          <button className="button button-ghost button-small" onClick={() => onSearchChange("")} type="button">
            Clear search
          </button>
        ) : null}
      </div>

      {isLoading ? <p className="feedback">Loading campaign state from the selected chain...</p> : null}
      {error ? <p className="feedback feedback-error">{error}</p> : null}
      {!isLoading && !campaigns.length && !error ? (
        <p className="feedback">No campaigns matched the current filters.</p>
      ) : null}

      <div className="campaign-grid">
        {isLoading
          ? Array.from({ length: 6 }, (_, index) => (
              <article className="campaign-card campaign-card-skeleton" key={`skeleton-${index}`}>
                <div className="campaign-card-cover campaign-card-cover-skeleton" />
                <div className="skeleton-line skeleton-line-title" />
                <div className="skeleton-line" />
                <div className="skeleton-line skeleton-line-short" />
                <div className="skeleton-grid">
                  <div className="skeleton-chip" />
                  <div className="skeleton-chip" />
                  <div className="skeleton-chip" />
                  <div className="skeleton-chip" />
                </div>
              </article>
            ))
          : null}
        {!isLoading
          ? campaigns.map((campaign, index) => {
          const progress = getProgressPercentage(campaign.contract.totalRaised, campaign.contract.goal);
          const statusLabel = getCampaignStatusLabel(campaign.contract.status);
          const currentMilestone = campaign.milestones[Number(campaign.contract.currentMilestone)]?.contract;
          const nextCheckpoint =
            Number(campaign.contract.status) === 0
              ? campaign.contract.fundraisingDeadline
              : currentMilestone?.dueDate ?? campaign.contract.fundraisingDeadline;
          const coverImageUrl = campaign.metadata?.coverImageCid
            ? getIpfsUrl(campaign.metadata.coverImageCid)
            : null;

          return (
            <article
              className="campaign-card campaign-card-dark"
              key={campaign.id.toString()}
              style={{ animationDelay: `${index * 60}ms` }}
            >
              <div className="campaign-card-cover">
                {coverImageUrl ? (
                  <Image
                    alt={campaign.metadata?.title ?? `Campaign ${campaign.id.toString()}`}
                    fill
                    sizes="(max-width: 780px) 100vw, (max-width: 1240px) 50vw, 33vw"
                    src={coverImageUrl}
                  />
                ) : (
                  <div className="campaign-card-cover-fallback">
                    <span className="eyebrow">MilestoneVault</span>
                    <strong>{campaign.metadata?.title ?? `Campaign #${campaign.id.toString()}`}</strong>
                  </div>
                )}

                <div className="campaign-card-topline">
                  <span className={`status-pill ${getCampaignStatusAccent(campaign.contract.status)}`}>
                    {statusLabel}
                  </span>
                  <span className="mono-note">#{campaign.id.toString()}</span>
                </div>
              </div>

              <div className="campaign-card-copy">
                <h3>{campaign.metadata?.title ?? "Untitled campaign"}</h3>
                <p className="muted-text">
                  {campaign.metadata?.summary ??
                    "Metadata could not be resolved from IPFS, but the on-chain campaign remains accessible."}
                </p>
              </div>

              <div className="campaign-highlight-row">
                <article className="campaign-highlight-chip">
                  <span className="field-label">Escrowed</span>
                  <strong>{formatShortEth(campaign.contract.totalRaised, 2)} ETH</strong>
                </article>
                <article className="campaign-highlight-chip">
                  <span className="field-label">Next checkpoint</span>
                  <strong>{formatTimeRemaining(nextCheckpoint)}</strong>
                </article>
              </div>

              <p className="muted-text">
                {Number(campaign.contract.status) === 1
                  ? getFailureReasonLabel(campaign.contract.failureReason)
                  : Number(campaign.contract.status) === 2
                    ? "Milestone approval is now governing payout release."
                    : "Fundraising stays open until the deadline or target is reached."}
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
                  <strong>{formatTimeRemaining(nextCheckpoint)}</strong>
                </div>
                <div>
                  <span className="field-label">Settlement</span>
                  <strong>{Number(campaign.contract.status) === 3 ? "Finished" : "In progress"}</strong>
                </div>
              </div>

              <div className="campaign-card-footer">
                <span className="mono-note">{formatTimestamp(campaign.contract.fundraisingDeadline)}</span>
                <Link className="button button-ghost button-small button-link" href={`/campaigns/${campaign.id.toString()}`}>
                  Open campaign
                </Link>
              </div>
            </article>
          );
            })
          : null}
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
