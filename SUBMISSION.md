# Submission: tron-ethers-adapter

ethers.js v6 compatibility layer for TronWeb. Wraps TronWeb in the Provider/Signer/Contract interface that Ethereum developers already use, so porting a dApp to TRON is a small diff instead of a rewrite.

## Direction

> "Improve a TRON SDK or build an integration layer that makes TRON easier to use from a common stack."

> "Compatibility improvements that reduce friction for Ethereum-style developers."

## Problem

Ethereum developers trying TRON hit three walls:

1. **API mismatch** — TronWeb has no Provider/Signer pattern. Method names, return shapes, and calling conventions are all different. You can't reuse your ethers.js code.
2. **Address confusion** — Ethereum uses `0x` hex. TRON uses base58 `T...` addresses and an internal `41...` hex format. Every cross-chain developer has lost time debugging format errors.
3. **Resource model** — TRON's energy/bandwidth system has no mapping in ethers.js. You need to learn TRON-specific concepts before sending a single transaction.

There's no existing adapter. The closest thing is TRON's EVM-compatible JSON-RPC endpoint, but it breaks on anything TRON-specific (energy, bandwidth, TRC-20 via native APIs, staking, fee limits).

## Solution

Three drop-in classes:

| ethers.js v6 | This adapter |
|---|---|
| `ethers.JsonRpcProvider` | `TronProvider` |
| `ethers.Wallet` | `TronSigner` |
| `ethers.Contract` | `TronContract` |

Plus `parseTRX`/`formatTRX` (like `parseEther`/`formatEther`), universal address conversion, and structured error normalization.

```diff
- const provider = new ethers.JsonRpcProvider('https://mainnet.infura.io/v3/...');
+ const provider = new TronProvider('mainnet');

- const wallet = new ethers.Wallet(privateKey, provider);
+ const signer = new TronSigner(privateKey, provider);

- const tx = await wallet.sendTransaction({ to, value: ethers.parseEther('1') });
+ const tx = await signer.sendTransaction({ to, value: parseTRX('1') });
```

## Implementation

The adapter wraps TronWeb (peer dependency) rather than reimplementing RPC calls. Key decisions:

- **Universal addresses**: every method accepts `0x`, `T...`, or `41...` format and normalizes internally.
- **ABI-driven dispatch**: `TronContract` reads the ABI at construction and generates method proxies. View/pure → `.call()`, mutating → `.send()`. You call `contract.transfer(to, amount)` and it does the right thing.
- **Error normalization**: TronWeb errors come as strings, objects, or nested data. The adapter pattern-matches against known messages and maps them to typed codes (`INSUFFICIENT_FUNDS`, `CONTRACT_REVERT`, `TIMEOUT`, etc.).
- **Safe defaults**: `gasLimit` maps to `fee_limit` with a default of 1000 TRX and a hard cap of 10,000 TRX.
- **Retry + health**: exponential backoff for transient failures, connection diagnostics via `provider.getHealth()`.
- **Live-verified**: two real bugs were caught only because integration tests hit the actual Nile node (TronWeb needs a default address for view calls; block error patterns were too narrow).

## Test results

**Unit tests (mocked):**
```
Test Suites: 7 passed
Tests:       177 passed
Coverage:    92%+ lines
```

**Integration tests (live Nile testnet):**
```
Test Suites: 1 passed
Tests:       17 passed
```

Reads real blocks, real balances, real USDT contract data (`name()`, `symbol()`, `decimals()`), real account resources, real bytecode.

## Deliverables

| What | Where |
|---|---|
| Code | This repo |
| Demo video | [record per DELIVERABLES.md] |
| Test output | `npm test` (194 total), or CI green badge |
| Reviewer notes | `REVIEWER_NOTES.md` |
| Docs | `README.md`, `MIGRATION_GUIDE.md` |

## Verify

```bash
git clone [repo-url]
cd tron-ethers-adapter
npm install
npm test                  # 177 unit tests
npm run test:integration  # 17 live Nile tests
npm run demo              # CLI demo with real data
npm run demo:web          # browser playground at localhost:3456
```

## Repository

[Link to GitHub repo]
