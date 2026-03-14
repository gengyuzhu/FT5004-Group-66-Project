# MilestoneVault

MilestoneVault is a milestone-based crowdfunding DApp that shifts project funding from "trust the platform" to "trust the code". Funds are escrowed in a Solidity contract, milestone proof is stored off-chain on IPFS, and creator payouts are only unlocked after contribution-weighted backer voting passes.

## GitHub Pages Demo

- Repository: [FT5004-Group-66-Project](https://github.com/gengyuzhu/FT5004-Group-66-Project)
- Interactive repository demo: [MilestoneVault GitHub Pages](https://gengyuzhu.github.io/FT5004-Group-66-Project/)
- Real DApp code: [`web/`](./web)
- Static showcase for GitHub Pages: [`docs/`](./docs)

The `web/` app is the real Next.js DApp with wallet actions and contract calls. The `docs/` folder contains a static, interactive GitHub Pages showcase so the repository itself can present a web-style product experience on GitHub.

## Core MVP Scope

- Native ETH crowdfunding only
- Multi-campaign escrow contract
- Creator milestone proof submission with IPFS CID storage
- Contribution-weighted backer voting
- Milestone-based phased creator payouts
- Rule-based refunds for underfunded campaigns, failed votes, and missed milestone deadlines
- Localhost and Sepolia deployment support
- Responsive Next.js DApp plus GitHub Pages demo

## Architecture

```text
+--------------------------------------------------------------+
|                      Frontend (DApp)                         |
|   Next.js / React + wagmi / viem + MetaMask connection      |
|   Dashboard, campaign detail, create, vote, refund flows    |
+---------------------------+----------------------------------+
                            | Read / Write via JSON-RPC
+---------------------------v----------------------------------+
|               MilestoneVault Smart Contract                  |
|        Solidity 0.8.24 + OpenZeppelin ReentrancyGuard       |
|                                                              |
|   On-chain state:                                            |
|   - Campaign registry (creator, goal, deadline, status)      |
|   - Milestones (amounts, due dates, proof CIDs, votes)       |
|   - Contribution ledger (backer -> amount per campaign)      |
|   - Withdrawable creator balances and refundable escrow       |
+---------------------------+----------------------------------+
                            |
+---------------------------v----------------------------------+
|                 Off-chain Storage (IPFS)                     |
|   Campaign metadata, evidence files, proof JSON bundles      |
|   Only CIDs are written on-chain for verification            |
+--------------------------------------------------------------+
```

## Smart Contract State Machine

```text
                    +-------------+
        create      | Fundraising |
       -----------> |    (0)      |
                    +------+------+
                           | finalizeCampaign() after deadline
                    +------v------+
               NO   | goal met?   |  YES
              +-----|             |-----+
              |     +-------------+     |
       +------v------+          +-------v------+
       |   Failed    |          |    Active    |
       |    (1)      |          |     (2)      |
       +------+------+          +-------+------+
              |                         | submitProof -> vote -> execute
              |                  +------v------+
              |             NO   | vote passed? |  YES
              |            +-----|              |--------+
              |            |     +--------------+        |
              |     +------v------+             +--------v--------+
              |     |   Failed    |      ALL    | Next milestone  |
              |     |    (1)      |   +-------> | or Completed(3) |
              |     +-------------+   |         +-----------------+
              |                       |
              v                       v
         claimRefund()          withdrawCreatorFunds()
```

## Tech Stack

| Layer | Technology |
| --- | --- |
| Smart Contract | Solidity 0.8.24 + OpenZeppelin Contracts |
| Development | Hardhat 2.x |
| Frontend | Next.js 15 + React 19 + TypeScript |
| Web3 Client | wagmi 3.x + viem 2.x |
| Wallet | MetaMask / injected wallet |
| Storage | IPFS via Pinata, on-chain CID references |
| Testing | Hardhat test runner + Chai |
| GitHub Demo | Static HTML/CSS/JS in `docs/` + GitHub Pages workflow |

## Project Structure

```text
milestone-vault/
|-- .github/
|   |-- workflows/
|       |-- deploy-pages.yml
|-- contracts/
|   |-- contracts/
|   |   |-- MilestoneVault.sol
|   |   |-- test/
|   |       |-- ReentrantRefundAttacker.sol
|   |-- deployments/
|   |   |-- milestone-vault-addresses.json
|   |-- scripts/
|   |   |-- deploy.js
|   |   |-- export-frontend.js
|   |-- test/
|   |   |-- MilestoneVault.test.js
|   |-- hardhat.config.js
|   |-- package.json
|-- docs/
|   |-- index.html
|   |-- site.css
|   |-- site.js
|   |-- architecture.md
|   |-- demo-script.md
|   |-- limitations.md
|   |-- uml.md
|-- web/
|   |-- src/
|   |   |-- app/
|   |   |-- components/
|   |   |-- lib/
|   |-- package.json
|-- .gitignore
|-- LICENSE
|-- README.md
```

## Public Contract Interface

- `createCampaign(goal, fundraisingDeadline, milestoneAmounts, milestoneDueDates, metadataCID)`
- `contribute(campaignId)` payable
- `finalizeCampaign(campaignId)`
- `submitMilestoneProof(campaignId, milestoneId, proofCID)`
- `voteOnMilestone(campaignId, milestoneId, support)`
- `executeMilestone(campaignId, milestoneId)`
- `withdrawCreatorFunds(campaignId)`
- `claimRefund(campaignId)`
- `failCampaignForMissedDeadline(campaignId)`

## Test Coverage

| Test Suite | Tests | Status |
| --- | ---: | --- |
| `createCampaign` | 6 | [OK] All passing |
| `contribute` | 4 | [OK] All passing |
| `finalizeCampaign` | 3 | [OK] All passing |
| `submitMilestoneProof` | 3 | [OK] All passing |
| `voteOnMilestone` | 5 | [OK] All passing |
| `executeMilestone` | 5 | [OK] All passing |
| `withdrawCreatorFunds` | 2 | [OK] All passing |
| `claimRefund` | 4 | [OK] All passing |
| `View functions` | 2 | [OK] All passing |
| **Total** | **34** | **[OK] All passing** |

Verified locally with:

```bash
cd contracts && npm test
cd web && npm run lint
cd web && npm run build
```

## What The Frontend Covers

- Wallet connect and network switch
- Campaign creation with milestone drafting
- Campaign discovery dashboard with search
- Campaign detail page with contribution, proof, vote, execute, withdraw, and refund actions
- IPFS upload routes for campaign metadata and milestone proof bundles
- Responsive layouts for desktop and mobile widths
- Static GitHub Pages interaction demo for repository showcase

## Local Setup

1. Install dependencies:
   - `cd contracts && npm install`
   - `cd ../web && npm install`
2. Copy environment templates:
   - `contracts/.env.example` -> `contracts/.env`
   - `web/.env.example` -> `web/.env.local`
3. Start Hardhat local node:
   - `cd contracts`
   - `npm run node`
4. Deploy locally and export ABI/address to the frontend:
   - `cd contracts`
   - `npm run deploy:localhost`
5. Start the DApp:
   - `cd web`
   - `npm run dev`
6. Open `http://localhost:3000`

## Sepolia Deployment

1. Set `SEPOLIA_RPC_URL` and `SEPOLIA_PRIVATE_KEY` in `contracts/.env`
2. Set `NEXT_PUBLIC_SEPOLIA_RPC_URL` in `web/.env.local`
3. Deploy:
   - `cd contracts`
   - `npm run deploy:sepolia`
4. Restart the frontend

## Important Contract Defaults

- Quorum: `20%` (`2000` basis points)
- Voting duration: `3 days`
- Milestones execute strictly in order
- Creator cannot vote on own campaign
- Refunds only cover unreleased escrow
- Contract is intentionally non-upgradeable for MVP simplicity

## UML And Supporting Docs

- [Architecture Notes](./docs/architecture.md)
- [Demo Script](./docs/demo-script.md)
- [Known Limitations](./docs/limitations.md)
- [UML Diagrams](./docs/uml.md)

The UML document includes:

- Domain class diagram
- Funding and activation sequence diagram
- Milestone approval sequence diagram
- State diagram
- Component diagram

## Git Delivery

This repository is configured for `main` and GitHub Pages deployment through GitHub Actions.

```bash
git remote add origin https://github.com/gengyuzhu/FT5004-Group-66-Project.git
git branch -M main
git push -u origin main
```
