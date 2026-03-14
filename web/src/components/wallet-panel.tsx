"use client";

import { useAccount, useChainId, useConnect, useDisconnect, useSwitchChain } from "wagmi";

import { chainLabels, defaultChainId } from "@/lib/config";
import { shortAddress } from "@/lib/utils";

export function WalletPanel() {
  const { address, isConnected } = useAccount();
  const activeChainId = useChainId();
  const chainId = activeChainId || defaultChainId;
  const { connect, connectors, error: connectError, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain, error: switchError, isPending: isSwitchPending } = useSwitchChain();

  return (
    <section className="wallet-panel">
      <div>
        <p className="eyebrow">Wallet</p>
        <h2>Operate directly against the contract.</h2>
      </div>

      <div className="wallet-summary">
        <div>
          <span className="field-label">Address</span>
          <strong>{shortAddress(address)}</strong>
        </div>
        <div>
          <span className="field-label">Network</span>
          <strong>{chainLabels[chainId] ?? `Chain ${chainId}`}</strong>
        </div>
      </div>

      <div className="wallet-actions">
        {isConnected ? (
          <button className="button button-secondary" onClick={() => disconnect()}>
            Disconnect
          </button>
        ) : (
          connectors.map((connector) => (
            <button
              key={connector.uid}
              className="button"
              disabled={isPending}
              onClick={() => connect({ connector })}
            >
              {isPending ? "Connecting..." : `Connect ${connector.name}`}
            </button>
          ))
        )}

        <button
          className="button button-secondary"
          disabled={chainId === 31337 || isSwitchPending}
          onClick={() => switchChain({ chainId: 31337 })}
        >
          Use Localhost
        </button>
        <button
          className="button button-secondary"
          disabled={chainId === 11155111 || isSwitchPending}
          onClick={() => switchChain({ chainId: 11155111 })}
        >
          Use Sepolia
        </button>
      </div>

      {connectError ? <p className="feedback feedback-error">{connectError.message}</p> : null}
      {switchError ? <p className="feedback feedback-error">{switchError.message}</p> : null}
    </section>
  );
}
