const hre = require("hardhat");
const { syncFrontendArtifacts, updateDeploymentsFile } = require("./export-frontend");

const DEFAULT_QUORUM_BPS = 2_000;
const DEFAULT_VOTING_DURATION = 3 * 24 * 60 * 60;

async function main() {
  const quorumBps = Number(process.env.MILESTONE_QUORUM_BPS || DEFAULT_QUORUM_BPS);
  const votingDuration = Number(
    process.env.MILESTONE_VOTING_DURATION || DEFAULT_VOTING_DURATION,
  );

  const milestoneVault = await hre.ethers.deployContract("MilestoneVault", [
    quorumBps,
    votingDuration,
  ]);

  await milestoneVault.waitForDeployment();

  const network = await hre.ethers.provider.getNetwork();
  const address = await milestoneVault.getAddress();

  updateDeploymentsFile({
    chainId: Number(network.chainId),
    name: hre.network.name,
    address,
  });
  syncFrontendArtifacts();

  console.log(`MilestoneVault deployed to ${address} on ${hre.network.name}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
