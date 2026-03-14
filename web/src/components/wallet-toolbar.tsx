"use client";

import { useAccount, useChainId, useConnect, useDisconnect, useSwitchChain } from "wagmi";

import { chainLabels, defaultChainId } from "@/lib/config";
import { shortAddress } from "@/lib/utils";

export function WalletToolbar() {
  const { address, isConnected } = useAccount();
  const activeChainId = useChainId();
  const chainId = activeChainId || defaultChainId;
  const { connect, connectors, isPending, error: connectError } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, isPending: isSwitchPending } = useSwitchChain();

  return (
    <div className="wallet-toolbar">
      <div className="wallet-toolbar-meta">
        <span className="toolbar-label">Network</span>
        <strong>{chainLabels[chainId] ?? `Chain ${chainId}`}</strong>
      </div>

      <div className="wallet-toolbar-switcher">
        <button
          className={`toolbar-chip ${chainId === 31337 ? "toolbar-chip-active" : ""}`}
          disabled={chainId === 31337 || isSwitchPending}
          onClick={() => switchChain({ chainId: 31337 })}
          type="button"
        >
          Local
        </button>
        <button
          className={`toolbar-chip ${chainId === 11155111 ? "toolbar-chip-active" : ""}`}
          disabled={chainId === 11155111 || isSwitchPending}
          onClick={() => switchChain({ chainId: 11155111 })}
          type="button"
        >
          Sepolia
        </button>
      </div>

      {isConnected ? (
        <button className="wallet-cta wallet-cta-connected" onClick={() => disconnect()} type="button">
          {shortAddress(address)}
        </button>
      ) : (
        connectors.slice(0, 1).map((connector) => (
          <button
            key={connector.uid}
            className="wallet-cta"
            disabled={isPending}
            onClick={() => connect({ connector })}
            type="button"
          >
            {isPending ? "Connecting..." : "Connect wallet"}
          </button>
        ))
      )}

      {connectError ? <span className="toolbar-error">{connectError.message}</span> : null}
    </div>
  );
}
