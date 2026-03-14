"use client";

import { useDeferredValue, useEffect, useState, useTransition } from "react";
import { useChainId, usePublicClient } from "wagmi";

import { AppTopbar } from "@/components/app-topbar";
import { CampaignCreateForm } from "@/components/campaign-create-form";
import { CampaignList } from "@/components/campaign-list";
import { WalletPanel } from "@/components/wallet-panel";
import { defaultChainId } from "@/lib/config";
import { fetchCampaigns, hasMilestoneVaultDeployment } from "@/lib/milestone-vault";
import type { CampaignViewModel } from "@/lib/types";
import { formatEth, formatTimeRemaining, getCampaignStatusLabel } from "@/lib/utils";

const browseHighlights = [
  "Campaign funds stay escrowed inside the contract until milestone execution passes.",
  "Creators submit proof to IPFS while the contract stores only the content identifier.",
  "Backers approve or reject each active milestone with contribution-weighted voting power.",
];
const pageSize = 6;
type SortOption = "latest" | "progress" | "goal" | "ending";

export function DashboardShell() {
  const activeChainId = useChainId();
  const chainId = activeChainId || defaultChainId;
  const publicClient = usePublicClient({ chainId });
  const [campaigns, setCampaigns] = useState<CampaignViewModel[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [sortBy, setSortBy] = useState<SortOption>("latest");
  const [page, setPage] = useState(1);
  const [surface, setSurface] = useState<"browse" | "create">("browse");
  const deferredSearch = useDeferredValue(searchTerm);
  const [refreshToken, setRefreshToken] = useState(0);
  const [isRefreshing, startTransition] = useTransition();

  useEffect(() => {
    let ignore = false;

    async function loadCampaigns() {
      if (!publicClient) {
        return;
      }

      setIsLoading(true);
      setError(null);

      try {
        if (!hasMilestoneVaultDeployment(chainId)) {
          setCampaigns([]);
          setError(
            "No MilestoneVault deployment is configured for this chain yet. Deploy the contract and refresh the page.",
          );
          return;
        }

        const nextCampaigns = await fetchCampaigns(publicClient, chainId);
        if (!ignore) {
          setCampaigns(nextCampaigns);
        }
      } catch (loadError) {
        if (!ignore) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load campaign data.");
        }
      } finally {
        if (!ignore) {
          setIsLoading(false);
        }
      }
    }

    void loadCampaigns();

    return () => {
      ignore = true;
    };
  }, [chainId, publicClient, refreshToken]);

  function refreshCampaigns() {
    startTransition(() => {
      setRefreshToken((value) => value + 1);
    });
  }

  const normalizedSearch = deferredSearch.trim().toLowerCase();
  const filteredCampaigns = campaigns.filter((campaign) => {
    const matchesSearch =
      normalizedSearch.length === 0 ||
      [
        campaign.metadata?.title,
        campaign.metadata?.summary,
        campaign.contract.creator,
        String(campaign.id),
        getCampaignStatusLabel(campaign.contract.status),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(normalizedSearch);

    const matchesStatus =
      statusFilter === "all" ||
      getCampaignStatusLabel(campaign.contract.status).toLowerCase() === statusFilter;

    return matchesSearch && matchesStatus;
  });
  const sortedCampaigns = [...filteredCampaigns].sort((left, right) => {
    switch (sortBy) {
      case "progress": {
        const leftProgress =
          left.contract.goal > 0n ? (left.contract.totalRaised * 10_000n) / left.contract.goal : 0n;
        const rightProgress =
          right.contract.goal > 0n ? (right.contract.totalRaised * 10_000n) / right.contract.goal : 0n;
        return Number(rightProgress - leftProgress);
      }
      case "goal":
        return Number(right.contract.goal - left.contract.goal);
      case "ending": {
        const leftCurrentMilestone = left.milestones[Number(left.contract.currentMilestone)]?.contract;
        const rightCurrentMilestone = right.milestones[Number(right.contract.currentMilestone)]?.contract;
        const leftTarget =
          Number(left.contract.status) === 0
            ? left.contract.fundraisingDeadline
            : leftCurrentMilestone?.dueDate ?? left.contract.fundraisingDeadline;
        const rightTarget =
          Number(right.contract.status) === 0
            ? right.contract.fundraisingDeadline
            : rightCurrentMilestone?.dueDate ?? right.contract.fundraisingDeadline;
        return Number(leftTarget - rightTarget);
      }
      case "latest":
      default:
        return Number(right.contract.createdAt - left.contract.createdAt);
    }
  });
  const totalPages = Math.max(1, Math.ceil(sortedCampaigns.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginatedCampaigns = sortedCampaigns.slice(
    (currentPage - 1) * pageSize,
    currentPage * pageSize,
  );

  const totalRaised = campaigns.reduce((sum, campaign) => sum + campaign.contract.totalRaised, 0n);
  const activeCampaigns = campaigns.filter((campaign) => Number(campaign.contract.status) === 2).length;
  const fundraisingCampaigns = campaigns.filter((campaign) => Number(campaign.contract.status) === 0).length;
  const completedCampaigns = campaigns.filter((campaign) => Number(campaign.contract.status) === 3).length;
  const statusCounts = {
    all: campaigns.length,
    fundraising: fundraisingCampaigns,
    active: activeCampaigns,
    completed: completedCampaigns,
    failed: campaigns.filter((campaign) => Number(campaign.contract.status) === 1).length,
  };
  const completionRate = campaigns.length ? Math.round((completedCampaigns / campaigns.length) * 100) : 0;
  const spotlightCampaign =
    [...campaigns].sort((left, right) => Number(right.contract.totalRaised - left.contract.totalRaised))[0] ?? null;
  const deadlineCampaign =
    [...campaigns]
      .filter((campaign) => Number(campaign.contract.status) === 0 || Number(campaign.contract.status) === 2)
      .sort((left, right) => {
        const leftMilestone = left.milestones[Number(left.contract.currentMilestone)]?.contract;
        const rightMilestone = right.milestones[Number(right.contract.currentMilestone)]?.contract;
        const leftTarget =
          Number(left.contract.status) === 0
            ? left.contract.fundraisingDeadline
            : leftMilestone?.dueDate ?? left.contract.fundraisingDeadline;
        const rightTarget =
          Number(right.contract.status) === 0
            ? right.contract.fundraisingDeadline
            : rightMilestone?.dueDate ?? right.contract.fundraisingDeadline;
        return Number(leftTarget - rightTarget);
      })[0] ?? null;
  const featuredCampaigns = sortedCampaigns.slice(0, 3);

  useEffect(() => {
    setPage(1);
  }, [searchTerm, sortBy, statusFilter]);

  useEffect(() => {
    if (page > totalPages) {
      setPage(totalPages);
    }
  }, [page, totalPages]);

  return (
    <main className="dashboard-shell">
      <AppTopbar activeView={surface} onViewChange={setSurface} />

      <section className="dashboard-hero-card">
        <div className="dashboard-hero-copy">
          <p className="eyebrow">On-chain campaign studio</p>
          <h1>Launch, monitor, and settle milestone campaigns with a cleaner operator flow.</h1>
          <p className="hero-text">
            The layout keeps the contract state readable for creators and backers without burying
            the trust boundary. Browse live campaigns, sort by urgency or progress, and move into
            the creation flow without leaving the same surface.
          </p>

          <div className="hero-pill-row">
            <span className="hero-pill">Escrow enforced on-chain</span>
            <span className="hero-pill">IPFS-backed evidence bundles</span>
            <span className="hero-pill">Weighted quorum voting</span>
          </div>

          <div className="hero-inline-stats">
            <article className="hero-stat-card">
              <span className="field-label">Campaigns</span>
              <strong>{campaigns.length}</strong>
            </article>
            <article className="hero-stat-card">
              <span className="field-label">Active</span>
              <strong>{activeCampaigns}</strong>
            </article>
            <article className="hero-stat-card">
              <span className="field-label">Fundraising</span>
              <strong>{fundraisingCampaigns}</strong>
            </article>
            <article className="hero-stat-card">
              <span className="field-label">Escrowed</span>
              <strong>{formatEth(totalRaised, 2)}</strong>
            </article>
            <article className="hero-stat-card">
              <span className="field-label">Completed</span>
              <strong>{completionRate}%</strong>
            </article>
          </div>
        </div>

        <aside className="hero-right-rail">
          <div className="hero-signal-card">
            <span className="field-label">Current network</span>
            <strong>{surface === "browse" ? "Campaign directory" : "Creator studio"}</strong>
            <div className="hero-signal-grid">
              <article className="mini-card">
                <span className="field-label">Chain</span>
                <strong>{chainId}</strong>
              </article>
              <article className="mini-card">
                <span className="field-label">Refresh mode</span>
                <strong>{isRefreshing ? "Syncing" : "Live"}</strong>
              </article>
            </div>

            {deadlineCampaign ? (
              <div className="hero-inline-note">
                <span className="field-label">Next contract checkpoint</span>
                <strong>{deadlineCampaign.metadata?.title ?? `Campaign #${deadlineCampaign.id.toString()}`}</strong>
                <p className="muted-text">
                  {formatTimeRemaining(
                    Number(deadlineCampaign.contract.status) === 0
                      ? deadlineCampaign.contract.fundraisingDeadline
                      : deadlineCampaign.milestones[Number(deadlineCampaign.contract.currentMilestone)]?.contract
                          ?.dueDate,
                  )}
                </p>
              </div>
            ) : null}
          </div>

          <div className="hero-signal-card">
            <div className="surface-header surface-header-compact">
              <div>
                <span className="field-label">Product snapshot</span>
                <strong>{spotlightCampaign?.metadata?.title ?? "No campaigns yet"}</strong>
              </div>
              <span className="status-pill status-active">Live data</span>
            </div>

            {spotlightCampaign ? (
              <div className="hero-feature-list">
                <article className="mini-card">
                  <span className="field-label">Most funded</span>
                  <strong>{formatEth(spotlightCampaign.contract.totalRaised, 2)}</strong>
                  <p className="muted-text">
                    {spotlightCampaign.metadata?.summary ??
                      "Top campaign by escrowed value from the current network."}
                  </p>
                </article>
                {featuredCampaigns.map((item) => (
                  <article className="hero-feature-item" key={item.id.toString()}>
                    <div>
                      <span className="field-label">{getCampaignStatusLabel(item.contract.status)}</span>
                      <strong>{item.metadata?.title ?? `Campaign #${item.id.toString()}`}</strong>
                    </div>
                    <span className="mono-note">{formatEth(item.contract.totalRaised, 2)}</span>
                  </article>
                ))}
              </div>
            ) : (
              <ul className="compact-list">
                {browseHighlights.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            )}
          </div>
        </aside>
      </section>

      {surface === "browse" ? (
        <div className="dashboard-grid dashboard-grid-browse">
          <section className="main-stage">
            <CampaignList
              campaigns={paginatedCampaigns}
              currentPage={currentPage}
              error={error}
              isLoading={isLoading}
              onPageChange={setPage}
              searchTerm={searchTerm}
              onSearchChange={setSearchTerm}
              sortBy={sortBy}
              onSortChange={setSortBy}
              statusCounts={statusCounts}
              statusFilter={statusFilter}
              onStatusFilterChange={setStatusFilter}
              totalItems={sortedCampaigns.length}
              totalPages={totalPages}
            />
          </section>

          <aside className="sidebar-stack">
            <WalletPanel
              actionHelper="Switch into the creator flow without leaving the dashboard."
              actionLabel="Start a new campaign"
              campaignCount={campaigns.length}
              highlightTitle={
                deadlineCampaign?.metadata?.title ?? "Publish a new campaign with a cleaner draft flow."
              }
              highlightValue={
                deadlineCampaign
                  ? formatTimeRemaining(
                      Number(deadlineCampaign.contract.status) === 0
                        ? deadlineCampaign.contract.fundraisingDeadline
                        : deadlineCampaign.milestones[Number(deadlineCampaign.contract.currentMilestone)]?.contract
                            ?.dueDate,
                    )
                  : "Ready"
              }
              onActionClick={() => setSurface("create")}
            />

            <section className="side-note-card">
              <p className="eyebrow">Browse heuristics</p>
              <h2>Use filters, sorting, and direct campaign cards to reduce scanning time.</h2>
              <ul className="compact-list">
                <li>Sort by urgency to see campaigns that need the next operator step soonest.</li>
                <li>Switch to progress view to compare how close fundraising campaigns are to activation.</li>
                <li>Open a card to vote, execute milestones, withdraw, or claim refunds from one detail rail.</li>
              </ul>
            </section>
          </aside>
        </div>
      ) : (
        <div className="dashboard-grid dashboard-grid-create">
          <section className="main-stage">
            <CampaignCreateForm
              chainId={chainId}
              isRefreshing={isRefreshing}
              onCancel={() => setSurface("browse")}
              onCreated={() => {
                refreshCampaigns();
                setSurface("browse");
              }}
            />
          </section>

          <aside className="sidebar-stack">
            <WalletPanel
              actionHelper="Return to the campaign directory after reviewing your draft."
              actionLabel="Back to campaign list"
              campaignCount={campaigns.length}
              highlightTitle="Draft flow"
              highlightValue="Live preview"
              onActionClick={() => setSurface("browse")}
            />

            <section className="side-note-card">
              <p className="eyebrow">Creation checklist</p>
              <h2>Before you deploy</h2>
              <ul className="compact-list">
                <li>Make milestone amounts add up to the exact campaign goal.</li>
                <li>Keep due dates strictly increasing and later than the fundraising deadline.</li>
                <li>Prepare cover art, project copy, and milestone evidence paths before publishing.</li>
                <li>Use localhost first, then Sepolia for public demo verification.</li>
              </ul>
            </section>
          </aside>
        </div>
      )}
    </main>
  );
}
