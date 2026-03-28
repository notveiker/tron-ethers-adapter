# Deliverables

## What this is

`tron-ethers-adapter` — an ethers.js v6 compatibility layer for TronWeb. Three classes (`TronProvider`, `TronSigner`, `TronContract`) that mirror the ethers.js API but target TRON underneath. Plus address conversion, value parsing, error normalization, retry logic, and a health check.

No existing package does this. The `@tronweb3/tronwallet-adapters` are wallet connection adapters (connect/disconnect/sign). This covers the programming model — reading blocks, querying balances, calling contracts, sending transactions. The ethers.js repo has an [open issue](https://github.com/ethers-io/ethers.js/issues/205) where developers asked for TRON support and were told it's incompatible.

## Bounty checklist

| Requirement | Done | Notes |
|---|---|---|
| Clear scope | Yes | ethers.js v6 compat layer, well-defined API surface |
| Unit tests | Yes | 177 tests, 92%+ line coverage |
| Integration tests | Yes | 17 tests against live Nile testnet |
| Documentation | Yes | README, MIGRATION_GUIDE, REVIEWER_NOTES |
| Reproducible | Yes | `npm install && npm test && npm run test:integration` |
| CI | Yes | GitHub Actions, Node 18/20/22 |
| Demo | Partially | CLI and web demos built; video recording is on you |

## What to submit

| Deliverable | Location |
|---|---|
| Code | This GitHub repo |
| Demo video | You record this (see instructions below) |
| Test output | `npm test` screenshot or green CI badge |
| Reviewer notes | `REVIEWER_NOTES.md` |
| Docs | `README.md` + `MIGRATION_GUIDE.md` |

## How to push

```bash
cd "/Users/tharunekambaram/coding-projects/Infrastructure Upgrade or Integration"
git commit -m "ethers.js v6 compatibility layer for TronWeb"
git remote add origin https://github.com/YOUR_USERNAME/tron-ethers-adapter.git
git push -u origin main
```

Then update `SUBMISSION.md` — replace `[Link to GitHub repo]` and `[repo-url]` with your actual URLs.

## How to record the demo video

Keep it under 5 minutes. Show:

1. **File tree** in your editor — briefly scroll through `src/` so judges see the structure
2. **`npm test`** — show all 194 tests passing with coverage
3. **`npm run test:integration`** — point out these are hitting real Nile, not mocks
4. **`npm run demo`** — walk through the live output (real block numbers, real balances, real USDT data)
5. **`npm run demo:web`** — open localhost:3456, look up an address, read a TRC-20 contract
6. **Cross-check on TronScan** — take a block number from the demo and verify it on https://nile.tronscan.org

Use a large terminal font and a clean desktop.

## Commands

```bash
npm install               # install
npm test                  # 177 unit + 17 integration tests with coverage
npm run test:integration  # 17 live Nile tests only
npm run lint              # ESLint
npm run typecheck         # TypeScript strict
npm run check             # typecheck + lint + test + build
npm run build             # compile to dist/
npm run demo              # CLI demo, live Nile data
npm run demo:web          # web playground at localhost:3456
```
