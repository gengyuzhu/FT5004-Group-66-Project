"use client";

import Link from "next/link";
import { useDeferredValue, useEffect, useState, useTransition } from "react";
import { useChainId, usePublicClient } from "wagmi";

import { CampaignCreateForm } from "@/components/campaign-create-form";
import { CampaignList } from "@/components/campaign-list";
import { WalletPanel } from "@/components/wallet-panel";
import { defaultChainId } from "@/lib/config";
import { fetchCampaigns, hasMilestoneVaultDeployment } from "@/lib/milestone-vault";
import type { CampaignViewModel } from "@/lib/types";
import { formatEth } from "@/lib/utils";

const productPillars = [
  {
    title: "Escrow first",
    copy: "Funds remain contract-controlled until a rule-driven transition approves payout or opens refunds.",
  },
  {
    title: "Evidence anchored",
    copy: "Metadata and proof packages live on IPFS, while the chain stores only the CID needed for verification.",
  },
  {
    title: "Backer adjudication",
    copy: "Milestone settlement depends on contribution-weighted voting instead of platform-side payout discretion.",
  },
];

const executionSteps = [
  {
    title: "Create",
    copy: "Draft campaign metadata, goal, milestone amounts, and due dates before calling createCampaign().",
  },
  {
    title: "Fund",
    copy: "Backers contribute until the fundraising deadline, then anyone can finalize the fundraising result.",
  },
  {
    title: "Prove + vote",
    copy: "The creator submits proof, backers vote on the active milestone, and the contract locks the result.",
  },
  {
    title: "Settle",
    copy: "Approved tranches become withdrawable; failed paths unlock refunds from unreleased escrow only.",
  },
];

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
      <section className="app-chrome">
        <div className="brand-lockup">
          <p className="eyebrow">FT5004 DApp MVP</p>
          <strong>MilestoneVault</strong>
          <span>Decentralized milestone crowdfunding and phased ETH payouts.</span>
        </div>

        <div className="chrome-actions">
          <a
            className="inline-link"
            href="https://gengyuzhu.github.io/FT5004-Group-66-Project/"
            rel="noreferrer"
            target="_blank"
          >
            Open GitHub Pages demo
          </a>
          <a
            className="inline-link"
            href="https://github.com/gengyuzhu/FT5004-Group-66-Project/blob/main/docs/uml.md"
            rel="noreferrer"
            target="_blank"
          >
            UML diagrams
          </a>
          <Link className="inline-link" href="/">
            Refresh dashboard
          </Link>
        </div>
      </section>

      <section className="hero">
        <div className="hero-copy">
          <p className="eyebrow">MilestoneVault</p>
          <h1>From crowdfunding trust gap to milestone-enforced capital flow.</h1>
          <p className="hero-text">
            Create campaigns, lock funds in escrow, publish milestone evidence to IPFS, and let
            backers decide when capital moves. The platform can guide the flow, but the contract
            settles it.
          </p>

          <div className="hero-actions">
            <a
              className="button"
              href="https://gengyuzhu.github.io/FT5004-Group-66-Project/"
              rel="noreferrer"
              target="_blank"
            >
              View GitHub demo
            </a>
            <a
              className="button button-secondary"
              href="https://github.com/gengyuzhu/FT5004-Group-66-Project"
              rel="noreferrer"
              target="_blank"
            >
              View repository
            </a>
          </div>
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

      <section className="overview-grid">
        <article className="overview-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Trust Boundary</p>
              <h2>Only trust-minimized state and funds stay on-chain.</h2>
            </div>
          </div>

          <div className="insight-grid">
            {productPillars.map((pillar) => (
              <article className="insight-card" key={pillar.title}>
                <strong>{pillar.title}</strong>
                <p className="muted-text">{pillar.copy}</p>
              </article>
            ))}
          </div>
        </article>

        <article className="overview-panel">
          <div className="section-heading">
            <div>
              <p className="eyebrow">Execution Flow</p>
              <h2>One loop from launch to settlement.</h2>
            </div>
          </div>

          <div className="flow-list">
            {executionSteps.map((step, index) => (
              <article className="flow-step" key={step.title}>
                <span className="step-index">0{index + 1}</span>
                <div className="step-body">
                  <strong>{step.title}</strong>
                  <p className="muted-text">{step.copy}</p>
                </div>
              </article>
            ))}
          </div>
        </article>
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
