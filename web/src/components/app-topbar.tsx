import Link from "next/link";

import { WalletToolbar } from "@/components/wallet-toolbar";

type AppTopbarProps = {
  activeView?: "browse" | "create";
  backHref?: string;
  backLabel?: string;
  onViewChange?: (view: "browse" | "create") => void;
};

export function AppTopbar({ activeView, backHref, backLabel, onViewChange }: AppTopbarProps) {
  return (
    <header className="app-topbar">
      <div className="app-topbar-brand">
        <Link className="brand-mark" href="/">
          M
        </Link>
        <div className="brand-copy">
          <div className="brand-title-row">
            <Link className="brand-title" href="/">
              MilestoneVault
            </Link>
            <span className="brand-chip">Live DApp</span>
          </div>
          <span>Milestone-based crowdfunding with contract-enforced releases.</span>
        </div>
      </div>

      {onViewChange ? (
        <div className="topbar-center">
          <div className="topbar-segmented" role="tablist" aria-label="App surface">
            <button
              className={`segment-button ${activeView === "browse" ? "segment-button-active" : ""}`}
              onClick={() => onViewChange("browse")}
              type="button"
            >
              Explore
            </button>
            <button
              className={`segment-button ${activeView === "create" ? "segment-button-active" : ""}`}
              onClick={() => onViewChange("create")}
              type="button"
            >
              Create
            </button>
          </div>
          <p className="topbar-caption">
            {activeView === "browse"
              ? "Filter and inspect campaigns with direct on-chain state."
              : "Draft metadata and milestone schedules before publishing."}
          </p>
        </div>
      ) : backHref ? (
        <Link className="topbar-back" href={backHref}>
          {backLabel ?? "Back"}
        </Link>
      ) : (
        <div />
      )}

      <WalletToolbar />
    </header>
  );
}
