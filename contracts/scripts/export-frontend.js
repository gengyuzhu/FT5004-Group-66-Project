const fs = require("fs");
const path = require("path");

const projectRoot = path.resolve(__dirname, "..");
const webContractsDir = path.resolve(projectRoot, "../web/src/lib/contracts");
const deploymentFilePath = path.resolve(projectRoot, "deployments/milestone-vault-addresses.json");
const artifactPath = path.resolve(
  projectRoot,
  "artifacts/contracts/MilestoneVault.sol/MilestoneVault.json",
);
const frontendArtifactPath = path.resolve(webContractsDir, "milestoneVault.ts");

function ensureDirectory(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readDeploymentsFile() {
  if (!fs.existsSync(deploymentFilePath)) {
    return {};
  }

  return JSON.parse(fs.readFileSync(deploymentFilePath, "utf8"));
}

function writeDeploymentsFile(deployments) {
  ensureDirectory(path.dirname(deploymentFilePath));
  fs.writeFileSync(deploymentFilePath, JSON.stringify(deployments, null, 2));
}

function updateDeploymentsFile(deployment) {
  const deployments = readDeploymentsFile();
  deployments[String(deployment.chainId)] = {
    name: deployment.name,
    address: deployment.address,
  };
  writeDeploymentsFile(deployments);
}

function syncFrontendArtifacts() {
  ensureDirectory(webContractsDir);

  const deployments = readDeploymentsFile();
  const artifact = fs.existsSync(artifactPath)
    ? JSON.parse(fs.readFileSync(artifactPath, "utf8"))
    : { abi: [] };

  const deploymentEntries = Object.entries(deployments)
    .map(([chainId, deployment]) => `  ${chainId}: "${deployment.address}",`)
    .join("\n");

  const content = `export const milestoneVaultAbi = ${JSON.stringify(
    artifact.abi,
    null,
    2,
  )} as const;\n\nexport const milestoneVaultAddresses = {\n${
    deploymentEntries || ""
  }\n} as const;\n\nexport type SupportedMilestoneVaultChainId = keyof typeof milestoneVaultAddresses;\n`;

  fs.writeFileSync(frontendArtifactPath, content);
}

if (require.main === module) {
  syncFrontendArtifacts();
}

module.exports = {
  readDeploymentsFile,
  syncFrontendArtifacts,
  updateDeploymentsFile,
};
