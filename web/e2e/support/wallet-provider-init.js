(function installWalletProvider() {
  const listeners = new Map();

  function emit(eventName, payload) {
    const handlers = listeners.get(eventName) ?? [];
    handlers.forEach((handler) => handler(payload));
  }

  const provider = {
    isMetaMask: true,
    providers: [],
    selectedAddress: null,
    async request(args) {
      const result = await window.__walletRequest__(args);

      if ((args.method === "eth_requestAccounts" || args.method === "eth_accounts") && Array.isArray(result)) {
        provider.selectedAddress = result[0] ?? null;
      }

      if (args.method === "wallet_switchEthereumChain") {
        emit("chainChanged", args.params?.[0]?.chainId ?? "0x7a69");
      }

      return result;
    },
    async enable() {
      return provider.request({ method: "eth_requestAccounts" });
    },
    on(eventName, handler) {
      const handlers = listeners.get(eventName) ?? [];
      handlers.push(handler);
      listeners.set(eventName, handlers);
    },
    removeListener(eventName, handler) {
      const handlers = listeners.get(eventName) ?? [];
      listeners.set(
        eventName,
        handlers.filter((candidate) => candidate !== handler),
      );
    },
  };

  provider.providers = [provider];
  window.ethereum = provider;
})();
