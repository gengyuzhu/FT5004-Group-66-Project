"use client";

import { useAccount, useChainId } from "wagmi";

import { chainLabels, defaultChainId } from "@/lib/config";
import { shortAddress } from "@/lib/utils";

type WalletPanelProps = {
  campaignCount: number;
  actionLabel: string;
  actionHelper: string;
  onActionClick: () => void;
};

export function WalletPanel({
  campaignCount,
  actionLabel,
  actionHelper,
  onActionClick,
}: WalletPanelProps) {
  const { address, isConnected } = useAccount();
  const activeChainId = useChainId();
  const chainId = activeChainId || defaultChainId;

  return (
    <section className="wallet-panel">
      <div className="wallet-panel-header">
        <div>
          <p className="eyebrow">Operator Console</p>
          <h2>Keep the wallet state visible while the contract stays in control.</h2>
        </div>
        <span className={`status-pill ${isConnected ? "status-active" : "status-default"}`}>
          {isConnected ? "Wallet connected" : "Wallet offline"}
        </span>
      </div>

      <div className="wallet-panel-grid">
        <article className="wallet-mini-card">
          <span className="field-label">Address</span>
          <strong>{shortAddress(address)}</strong>
        </article>
        <article className="wallet-mini-card">
          <span className="field-label">Network</span>
          <strong>{chainLabels[chainId] ?? `Chain ${chainId}`}</strong>
        </article>
        <article className="wallet-mini-card">
          <span className="field-label">Campaigns loaded</span>
          <strong>{campaignCount}</strong>
        </article>
        <article className="wallet-mini-card">
          <span className="field-label">Settlement mode</span>
          <strong>Escrow + vote</strong>
        </article>
      </div>

      <div className="wallet-panel-story">
        <p className="muted-text">
          Create flows pin content to IPFS first, then write only the CID and milestone rules to
          the chain. Backers interact with the same contract state you see here.
        </p>
      </div>

      <button className="button wallet-panel-action" onClick={onActionClick} type="button">
        {actionLabel}
      </button>
      <p className="wallet-panel-helper">{actionHelper}</p>
    </section>
  );
}
