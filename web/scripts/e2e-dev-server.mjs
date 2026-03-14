import { once } from "node:events";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const webDir = path.resolve(__dirname, "..");
const contractsDir = path.resolve(webDir, "..", "contracts");
const npmExecutable = process.platform === "win32" ? "npm.cmd" : "npm";
const rpcUrl = "http://127.0.0.1:8545";
const webUrl = "http://127.0.0.1:3000";

function spawnCommand(cwd, args, extraEnv = {}) {
  const child = spawn(npmExecutable, args, {
    cwd,
    stdio: "inherit",
    shell: process.platform === "win32",
    env: {
      ...process.env,
      ...extraEnv,
    },
  });

  return child;
}

async function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForRpc(timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(rpcUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: 1,
          method: "eth_chainId",
          params: [],
        }),
      });

      if (response.ok) {
        return;
      }
    } catch {
      // Retry until timeout.
    }

    await sleep(1000);
  }

  throw new Error("Timed out waiting for the Hardhat RPC server.");
}

async function isRpcReady() {
  try {
    await waitForRpc(2_000);
    return true;
  } catch {
    return false;
  }
}

async function waitForHttp(targetUrl, timeoutMs = 60_000) {
  const deadline = Date.now() + timeoutMs;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(targetUrl);
      if (response.ok) {
        return;
      }
    } catch {
      // Retry until timeout.
    }

    await sleep(1000);
  }

  throw new Error(`Timed out waiting for ${targetUrl}.`);
}

let hardhatNode;
let nextDev;

function shutdown(code = 0) {
  hardhatNode?.kill("SIGTERM");
  nextDev?.kill("SIGTERM");
  process.exit(code);
}

process.on("SIGINT", () => shutdown(0));
process.on("SIGTERM", () => shutdown(0));

try {
  if (await isRpcReady()) {
    console.log("Reusing existing Hardhat RPC server.");
  } else {
    hardhatNode = spawnCommand(contractsDir, ["run", "node"]);
    await waitForRpc();
  }

  const deploy = spawnCommand(contractsDir, ["run", "deploy:localhost"]);
  const [deployCode] = await once(deploy, "exit");
  if (deployCode !== 0) {
    throw new Error("Local deployment failed during E2E setup.");
  }

  nextDev = spawnCommand(
    webDir,
    ["run", "dev", "--", "--hostname", "127.0.0.1", "--port", "3000"],
    {
      PINATA_E2E_MODE: "mock",
      NEXT_PUBLIC_DEFAULT_CHAIN_ID: "31337",
      NEXT_PUBLIC_LOCAL_RPC_URL: rpcUrl,
    },
  );

  await waitForHttp(webUrl, 120_000);
  await once(nextDev, "exit");
} catch (error) {
  console.error(error);
  shutdown(1);
}
