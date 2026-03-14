"use client";

import { useDeferredValue, useEffect, useState, useTransition } from "react";
import { useChainId, usePublicClient } from "wagmi";

import { CampaignCreateForm } from "@/components/campaign-create-form";
import { CampaignList } from "@/components/campaign-list";
import { WalletPanel } from "@/components/wallet-panel";
import { defaultChainId } from "@/lib/config";
import { fetchCampaigns, hasMilestoneVaultDeployment } from "@/lib/milestone-vault";
import type { CampaignViewModel } from "@/lib/types";
import { formatEth } from "@/lib/utils";

export function DashboardShell() {
  const activeChainId = useChainId();
  const chainId = activeChainId || defaultChainId;
  const publicClient = usePublicClient({ chainId });
  const [campaigns, setCampaigns] = useState<CampaignViewModel[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
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
          setError(
            loadError instanceof Error ? loadError.message : "Unable to load campaign data.",
          );
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

  const normalizedSearch = deferredSearch.trim().toLowerCase();
  const filteredCampaigns = !normalizedSearch
    ? campaigns
    : campaigns.filter((campaign) => {
        const haystack = [
          campaign.metadata?.title,
          campaign.metadata?.summary,
          campaign.contract.creator,
          String(campaign.id),
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();

        return haystack.includes(normalizedSearch);
      });

  function refreshCampaigns() {
    startTransition(() => {
      setRefreshToken((value) => value + 1);
    });
  }

  const totalRaised = campaigns.reduce((sum, campaign) => sum + campaign.contract.totalRaised, 0n);
  const activeCampaigns = campaigns.filter((campaign) => Number(campaign.contract.status) === 2).length;

  return (
    <main className="dashboard-shell">
      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">MilestoneVault</p>
          <h1>From crowdfunding trust gap to milestone-enforced capital flow.</h1>
          <p className="hero-text">
            Create campaigns, lock funds in escrow, publish milestone evidence to IPFS, and let
            backers decide when capital moves. The platform can guide the flow, but the contract
            settles it.
          </p>
        </div>

        <div className="hero-metrics">
          <div className="metric-card">
            <span className="field-label">Campaigns</span>
            <strong>{campaigns.length}</strong>
          </div>
          <div className="metric-card">
            <span className="field-label">Active</span>
            <strong>{activeCampaigns}</strong>
          </div>
          <div className="metric-card">
            <span className="field-label">Escrowed</span>
            <strong>{formatEth(totalRaised, 2)}</strong>
          </div>
          <div className="metric-card">
            <span className="field-label">Chain</span>
            <strong>{chainId}</strong>
          </div>
        </div>
      </section>

      <div className="dashboard-grid">
        <div className="sidebar-stack">
          <WalletPanel />
          <CampaignCreateForm
            chainId={chainId}
            onCreated={refreshCampaigns}
            isRefreshing={isRefreshing}
          />
        </div>

        <CampaignList
          campaigns={filteredCampaigns}
          error={error}
          isLoading={isLoading}
          searchTerm={searchTerm}
          onSearchChange={setSearchTerm}
        />
      </div>
    </main>
  );
}
