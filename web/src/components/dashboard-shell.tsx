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
import { formatEth, getCampaignStatusLabel } from "@/lib/utils";

const browseHighlights = [
  "Campaign funds stay escrowed inside the contract until milestone execution passes.",
  "Creators submit proof to IPFS while the contract stores only the content identifier.",
  "Backers approve or reject each active milestone with contribution-weighted voting power.",
];

export function DashboardShell() {
  const activeChainId = useChainId();
  const chainId = activeChainId || defaultChainId;
  const publicClient = usePublicClient({ chainId });
  const [campaigns, setCampaigns] = useState<CampaignViewModel[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
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

  const totalRaised = campaigns.reduce((sum, campaign) => sum + campaign.contract.totalRaised, 0n);
  const activeCampaigns = campaigns.filter((campaign) => Number(campaign.contract.status) === 2).length;
  const fundraisingCampaigns = campaigns.filter((campaign) => Number(campaign.contract.status) === 0).length;

  return (
    <main className="dashboard-shell">
      <AppTopbar activeView={surface} onViewChange={setSurface} />

      <section className="dashboard-hero-card">
        <div className="dashboard-hero-copy">
          <p className="eyebrow">Crowdfunding execution surface</p>
          <h1>Ship campaigns with escrow, milestone voting, and refund logic in one flow.</h1>
          <p className="hero-text">
            This interface keeps the contract state legible for creators and backers without hiding
            the actual trust boundary. Browse live campaigns, inspect their current milestone, or
            launch a new one from the same surface.
          </p>

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
          </div>
        </div>

        <aside className="hero-right-rail">
          <div className="rail-card">
            <span className="field-label">Current network</span>
            <strong>Chain {chainId}</strong>
            <p className="muted-text">
              The dashboard reads contract state directly from the selected chain and refreshes
              after each confirmed write.
            </p>
          </div>

          <div className="rail-card">
            <span className="field-label">How settlement works</span>
            <ul className="compact-list">
              {browseHighlights.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </div>
        </aside>
      </section>

      {surface === "browse" ? (
        <div className="dashboard-grid dashboard-grid-browse">
          <section className="main-stage">
            <CampaignList
              campaigns={filteredCampaigns}
              error={error}
              isLoading={isLoading}
              searchTerm={searchTerm}
              onSearchChange={setSearchTerm}
              statusFilter={statusFilter}
              onStatusFilterChange={setStatusFilter}
            />
          </section>

          <aside className="sidebar-stack">
            <WalletPanel
              actionHelper="Switch into the creator flow without leaving the dashboard."
              actionLabel="Start a new campaign"
              campaignCount={campaigns.length}
              onActionClick={() => setSurface("create")}
            />
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
