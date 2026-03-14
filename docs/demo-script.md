# Demo Script

## 1. Start the local environment

1. Run `npm run node` inside `contracts/`
2. Run `npm run deploy:localhost` inside `contracts/`
3. Run `npm run dev` inside `web/`
4. Connect MetaMask to `http://127.0.0.1:8545` and import a Hardhat test account

## 2. Create a campaign

1. Connect wallet on the dashboard
2. Fill in campaign title, summary, description, goal, fundraising deadline, and milestone breakdown
3. Upload an optional cover image
4. Submit the form and wait for the `createCampaign` transaction
5. Open the created campaign detail page

## 3. Fund and finalize

1. Use at least two backer wallets to contribute ETH
2. After the fundraising deadline, click `Finalize fundraising`
3. Show the campaign moving from `Fundraising` to `Active`

## 4. Submit proof and vote

1. As the creator, upload milestone proof files and links
2. Submit proof and show the stored proof CID
3. As backers, cast YES/NO votes
4. After the voting window ends, execute the milestone

## 5. Withdraw creator funds

1. As the creator, click `Withdraw approved funds`
2. Show the withdrawable balance decreasing on the detail page

## 6. Demonstrate a failure branch

Choose one:

- fail fundraising by not reaching the goal
- reject a milestone with weighted NO votes
- miss a milestone deadline without proof and trigger `Fail for missed deadline`

Then:

1. Show the campaign status changing to `Failed`
2. As a backer, click `Claim refund`
3. Show the refund amount being drawn only from unreleased escrow
