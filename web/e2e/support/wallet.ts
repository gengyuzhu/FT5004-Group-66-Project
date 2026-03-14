import path from "node:path";
import type { Page } from "@playwright/test";
import {
  createPublicClient,
  createWalletClient,
  encodeFunctionData,
  http,
  parseEther,
} from "viem";
import { mnemonicToAccount } from "viem/accounts";
import { hardhat } from "viem/chains";

import { milestoneVaultAbi, milestoneVaultAddresses } from "../../src/lib/contracts/milestoneVault";

const rpcUrl = process.env.NEXT_PUBLIC_LOCAL_RPC_URL ?? "http://127.0.0.1:8545";
const mnemonic = "test test test test test test test test test test test junk";
export const walletScriptPath = path.resolve(process.cwd(), "e2e", "support", "wallet-provider-init.js");
export const vaultAddress = milestoneVaultAddresses[31337];

export function getTestAccount(index: number) {
  return mnemonicToAccount(mnemonic, { addressIndex: index });
}

export function createLocalPublicClient() {
  return createPublicClient({
    chain: hardhat,
    transport: http(rpcUrl),
  });
}

export function createLocalWalletClient(index: number) {
  return createWalletClient({
    account: getTestAccount(index),
    chain: hardhat,
    transport: http(rpcUrl),
  });
}

async function rpcRequest(method: string, params: unknown[] = []) {
  const response = await fetch(rpcUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: Date.now(),
      method,
      params,
    }),
  });

  const payload = (await response.json()) as {
    result?: unknown;
    error?: { message?: string };
  };

  if (payload.error) {
    throw new Error(payload.error.message ?? `RPC request failed for ${method}`);
  }

  return payload.result;
}

export async function installInjectedWallet(page: Page, walletIndex: number) {
  const account = getTestAccount(walletIndex);
  const walletClient = createLocalWalletClient(walletIndex);

  await page.exposeBinding("__walletRequest__", async (_source, request) => {
    const { method, params = [] } = request as { method: string; params?: unknown[] };

    switch (method) {
      case "eth_requestAccounts":
      case "eth_accounts":
        return [account.address];
      case "eth_chainId":
        return `0x${hardhat.id.toString(16)}`;
      case "net_version":
        return String(hardhat.id);
      case "wallet_switchEthereumChain":
      case "wallet_addEthereumChain": {
        const chainId = Number.parseInt(String((params[0] as { chainId?: string })?.chainId ?? "0x7a69"), 16);
        if (chainId !== hardhat.id) {
          throw new Error(`Unsupported test chain: ${chainId}`);
        }

        return null;
      }
      case "eth_sendTransaction": {
        const tx = params[0] as {
          to?: `0x${string}`;
          data?: `0x${string}`;
          value?: string;
        };

        return walletClient.sendTransaction({
          account,
          to: tx.to,
          data: tx.data,
          value: tx.value ? BigInt(tx.value) : undefined,
        });
      }
      default:
        return rpcRequest(method, params);
    }
  });

  await page.addInitScript({
    path: walletScriptPath,
  });
}

export async function seedActiveCampaign() {
  const publicClient = createLocalPublicClient();
  const creator = createLocalWalletClient(0);
  const backerA = createLocalWalletClient(1);
  const backerB = createLocalWalletClient(2);
  const currentCount = (await publicClient.readContract({
    address: vaultAddress,
    abi: milestoneVaultAbi,
    functionName: "campaignCount",
  })) as bigint;
  const campaignId = currentCount;
  const nowSeconds = BigInt(Math.floor(Date.now() / 1000));
  const fundraisingDeadline = Number(nowSeconds) + 4 * 60;
  const milestoneDueDate = fundraisingDeadline + 8 * 60;

  const createHash = await creator.sendTransaction({
    account: getTestAccount(0),
    to: vaultAddress,
    data: encodeFunctionData({
      abi: milestoneVaultAbi,
      functionName: "createCampaign",
      args: [
        parseEther("3"),
        BigInt(fundraisingDeadline),
        [parseEther("3")],
        [BigInt(milestoneDueDate)],
        "https://example.com/e2e-campaign.json",
      ],
    }),
  });
  await publicClient.waitForTransactionReceipt({ hash: createHash });

  const contributeHashA = await backerA.sendTransaction({
    account: getTestAccount(1),
    to: vaultAddress,
    value: parseEther("1"),
    data: encodeFunctionData({
      abi: milestoneVaultAbi,
      functionName: "contribute",
      args: [campaignId],
    }),
  });
  await publicClient.waitForTransactionReceipt({ hash: contributeHashA });

  const contributeHashB = await backerB.sendTransaction({
    account: getTestAccount(2),
    to: vaultAddress,
    value: parseEther("2"),
    data: encodeFunctionData({
      abi: milestoneVaultAbi,
      functionName: "contribute",
      args: [campaignId],
    }),
  });
  await publicClient.waitForTransactionReceipt({ hash: contributeHashB });

  await rpcRequest("evm_setNextBlockTimestamp", [fundraisingDeadline]);
  await rpcRequest("evm_mine", []);

  const finalizeHash = await creator.sendTransaction({
    account: getTestAccount(0),
    to: vaultAddress,
    data: encodeFunctionData({
      abi: milestoneVaultAbi,
      functionName: "finalizeCampaign",
      args: [campaignId],
    }),
  });
  await publicClient.waitForTransactionReceipt({ hash: finalizeHash });

  return {
    campaignId,
  };
}
