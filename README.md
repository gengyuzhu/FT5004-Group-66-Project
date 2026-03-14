# MilestoneVault

MilestoneVault is a milestone-based crowdfunding DApp that locks campaign funds in a Solidity contract, releases capital only after milestone voting passes, and opens rule-based refunds when fundraising fails or milestone execution breaks down.

## What is included

- `contracts/`: Hardhat 2 workspace with the `MilestoneVault` escrow contract, deployment scripts, ABI export, and unit tests.
- `web/`: Next.js App Router frontend with wallet connection, campaign creation, contribution, proof upload, voting, milestone execution, withdraw, and refund flows.
- `docs/`: Architecture notes, demo script, and limitations for grading/demo use.

## Core MVP behaviors

- Native ETH contributions only.
- Campaign creation writes goal, fundraising deadline, milestone tranche amounts, milestone due dates, and metadata CID on-chain.
- Milestone evidence is pinned to IPFS through Pinata; only the resulting CID is stored on-chain.
- Backers vote with contribution-weighted voting power.
- Quorum and voting duration are deployment-level defaults.
- Creator withdrawals use the withdraw pattern.
- If fundraising misses the goal, if a milestone vote fails, or if the creator misses a milestone deadline, backers can claim proportional refunds from unreleased escrow.

## Prerequisites

- Node.js 20.x
- npm 10.x
- MetaMask or another injected wallet
- A Pinata JWT for real IPFS uploads
- For Sepolia deployment: a Sepolia RPC URL and a funded deployer private key

## Local setup

1. Install dependencies:
   - `cd contracts && npm install`
   - `cd ../web && npm install`
2. Copy the env templates:
   - `contracts/.env.example` to `contracts/.env`
   - `web/.env.example` to `web/.env.local`
3. Start a local chain:
   - `cd contracts`
   - `npm run node`
4. Deploy and export the ABI/address for the frontend:
   - In a second terminal: `cd contracts`
   - `npm run deploy:localhost`
5. Run tests:
   - `cd contracts`
   - `npm test`
6. Start the frontend:
   - `cd web`
   - `npm run dev`
7. Open `http://localhost:3000`

## Sepolia deployment

1. Set `SEPOLIA_RPC_URL` and `SEPOLIA_PRIVATE_KEY` in `contracts/.env`.
2. Set `NEXT_PUBLIC_SEPOLIA_RPC_URL` in `web/.env.local`.
3. Deploy:
   - `cd contracts`
   - `npm run deploy:sepolia`
4. Restart the frontend so it picks up the exported deployment address.

## Verification commands

- Contract compile: `cd contracts && npm run compile`
- Contract tests: `cd contracts && npm test`
- Frontend lint: `cd web && npm run lint`
- Frontend build: `cd web && npm run build`

## Contract surface

- `createCampaign(goal, fundraisingDeadline, milestoneAmounts, milestoneDueDates, metadataCID)`
- `contribute(campaignId)` payable
- `finalizeCampaign(campaignId)`
- `submitMilestoneProof(campaignId, milestoneId, proofCID)`
- `voteOnMilestone(campaignId, milestoneId, support)`
- `executeMilestone(campaignId, milestoneId)`
- `withdrawCreatorFunds(campaignId)`
- `claimRefund(campaignId)`
- `failCampaignForMissedDeadline(campaignId)`

## Important defaults

- Quorum: `20%` (`2000` basis points)
- Voting duration: `3 days`
- Milestones execute strictly in order
- Refunds only cover unreleased escrow
- Contract is intentionally non-upgradeable for MVP simplicity

## Documentation

- [Architecture](./docs/architecture.md)
- [Demo Script](./docs/demo-script.md)
- [Limitations](./docs/limitations.md)

## Git delivery

If the repo is not linked yet:

```bash
git remote add origin https://github.com/gengyuzhu/FT5004-Group-66-Project.git
git branch -M main
git push -u origin main
```
