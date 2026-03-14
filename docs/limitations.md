# Known Limitations

- Native ETH only. ERC20 stablecoins are not part of the MVP.
- Weighted voting uses contribution size, so larger backers have more influence.
- The contract does not automatically verify real-world milestone completion.
- Refund math can leave tiny rounding dust in the contract because refunds are proportional integer division.
- No dispute arbitration, identity layer, or delegation features are included.
- The frontend relies on direct RPC reads and event queries rather than a dedicated indexing layer.
- The contract is deliberately non-upgradeable to keep the course-project surface smaller and easier to test.
- The GitHub Pages showcase is a static interaction demo; the live wallet and contract flows still run in `web/`.
- The Playwright E2E suite uses deterministic local wallet injection and mock IPFS transport by default; live Pinata can still be used manually outside automated runs.
