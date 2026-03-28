# tron-ethers-adapter

ethers.js v6 compatibility layer for TronWeb. Use the Provider/Signer/Contract pattern you already know from Ethereum — but targeting TRON underneath.

## Why

If you've built on Ethereum with ethers.js v6, switching to TRON means learning TronWeb from scratch. Different method names, different patterns, three address formats, energy instead of gas, and error messages that come in every shape imaginable.

This adapter wraps TronWeb in the same interface you're used to, so porting an Ethereum dApp to TRON is a small diff instead of a rewrite.

```diff
- import { ethers } from 'ethers';
+ import { TronProvider, TronSigner, TronContract, parseTRX } from 'tron-ethers-adapter';

- const provider = new ethers.JsonRpcProvider('https://mainnet.infura.io/v3/...');
+ const provider = new TronProvider('mainnet');

- const wallet = new ethers.Wallet(privateKey, provider);
+ const signer = new TronSigner(privateKey, provider);

- const tx = await wallet.sendTransaction({ to, value: ethers.parseEther('1') });
+ const tx = await signer.sendTransaction({ to, value: parseTRX('1') });
```

Everything else — `provider.getBalance()`, `contract.transfer()`, `tx.wait()`, error handling — works the same.

## Tested against live Nile testnet

The integration test suite hits real Nile infrastructure. Not mocked.

```
$ npm run test:integration

  ✓ connects to Nile and reports healthy
  ✓ reads current block number
  ✓ reads a specific block by number
  ✓ reads balance of a known address as bigint
  ✓ reads token name [Nile USDT: "Tether USD"]
  ✓ reads token symbol
  ✓ reads token decimals
  ✓ reads account resources
  ✓ returns bytecode for USDT contract
  17 passed
```

## Install

```bash
npm install tron-ethers-adapter tronweb
```

TronWeb is a peer dependency — bring your own version (>=5.0.0).

## Usage

### Connect

```typescript
import { TronProvider } from 'tron-ethers-adapter';

// Named networks: 'mainnet', 'shasta', 'nile'
const provider = new TronProvider('nile');

// Or custom node
const provider = new TronProvider({
  network: { name: 'custom', fullHost: 'https://my-node.example.com' },
  apiKey: 'your-trongrid-api-key',
});
```

### Read chain data

```typescript
const blockNumber = await provider.getBlockNumber();
const block = await provider.getBlock(blockNumber);
const balance = await provider.getBalance('TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW');
const code = await provider.getCode(contractAddress);
const resources = await provider.getAccountResources(address);
```

### Send transactions

```typescript
import { TronSigner, parseTRX } from 'tron-ethers-adapter';

const signer = new TronSigner(privateKey, provider);

const tx = await signer.sendTransaction({
  to: 'TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW',
  value: parseTRX('10'),
});

const receipt = await tx.wait();
console.log(receipt.status === 1 ? 'confirmed' : 'failed');
```

### Smart contracts

```typescript
import { TronContract } from 'tron-ethers-adapter';

// Read-only (provider)
const token = new TronContract(tokenAddress, ERC20_ABI, provider);
const name = await token.name();
const balance = await token.balanceOf(myAddress);

// Write operations (signer)
const writable = token.connect(signer);
const tx = await writable.transfer(toAddress, amount);
await tx.wait();
```

TRC-20 ABIs are identical to ERC-20 ABIs. Reuse them directly.

### Addresses

Pass any format anywhere — the adapter figures it out:

```typescript
await provider.getBalance('TJCnKsPa7y...');    // TRON base58
await provider.getBalance('0x742d35Cc...');     // Ethereum hex
await provider.getBalance('41742d35Cc...');     // TRON internal hex
```

Conversion helpers if you need them:

```typescript
import { toTronAddress, toEthAddress, addressesEqual } from 'tron-ethers-adapter';
```

### Values

```typescript
import { parseTRX, formatTRX } from 'tron-ethers-adapter';

parseTRX('1.5');          // 1500000n (SUN)
formatTRX(1_500_000n);    // "1.5"
```

TRX uses 6 decimals (vs ETH's 18). `parseUnits` and `formatUnits` are also exported for arbitrary token decimals.

### Errors

```typescript
import { TronAdapterError, TronAdapterErrorCode } from 'tron-ethers-adapter';

try {
  await signer.sendTransaction({ to: addr, value: parseTRX('1000000') });
} catch (error) {
  if (error instanceof TronAdapterError) {
    switch (error.code) {
      case TronAdapterErrorCode.INSUFFICIENT_FUNDS: break;
      case TronAdapterErrorCode.CONTRACT_REVERT: break;
      case TronAdapterErrorCode.TIMEOUT: break;
    }
    // original TronWeb error preserved
    console.log(error.tronError);
  }
}
```

TRON errors come as strings, objects, nested data — the adapter normalizes them into typed error codes.

### Retry and health checks

```typescript
const provider = new TronProvider({
  network: 'nile',
  maxRetries: 3,
  retryDelay: 1000,
});

const balance = await provider.withRetry(() => provider.getBalance(addr));

const health = await provider.getHealth();
// { connected: true, blockNumber: 66067679, latencyMs: 439, network: 'nile' }
```

## Demos

```bash
# CLI — shows real Nile data, no wallet needed
npm run demo

# Web playground — browser UI at localhost:3456
npm run demo:web
```

## API

### TronProvider

| Method | ethers.js equivalent |
|---|---|
| `getBalance(address)` | `provider.getBalance()` |
| `getBlock(numberOrHash)` | `provider.getBlock()` |
| `getBlockNumber()` | `provider.getBlockNumber()` |
| `getTransaction(hash)` | `provider.getTransaction()` |
| `getTransactionReceipt(hash)` | `provider.getTransactionReceipt()` |
| `getCode(address)` | `provider.getCode()` |
| `getHealth()` | — |
| `getAccountResources(address)` | — |
| `getTRC20Balance(token, owner)` | — |
| `withRetry(fn)` | — |

### TronSigner

| Method | ethers.js equivalent |
|---|---|
| `getAddress()` | `wallet.getAddress()` |
| `getTronAddress()` | — |
| `sendTransaction(tx)` | `wallet.sendTransaction()` |
| `signMessage(msg)` | `wallet.signMessage()` |
| `sendTRX(to, amount)` | — |
| `sendTRC20(token, to, amount)` | — |
| `connect(provider)` | `wallet.connect()` |

### TronContract

| Method | ethers.js equivalent |
|---|---|
| `contract.method(args)` | `contract.method(args)` |
| `TronContract.deploy(params, signer)` | `ContractFactory.deploy()` |
| `contract.connect(signer)` | `contract.connect()` |
| `contract.attach(address)` | `contract.attach()` |

## Gas vs energy

TRON doesn't have gas. The adapter maps `gasLimit` to `fee_limit` (max TRX to burn for energy). Default: 1000 TRX, hard cap: 10,000 TRX. `gasPrice` and `nonce` are silently ignored since TRON doesn't use them.

## Development

```bash
npm install
npm test                  # 177 unit tests with coverage
npm run test:integration  # 17 live tests against Nile
npm run lint              # ESLint
npm run typecheck         # TypeScript strict
npm run check             # all of the above + build
npm run build             # compile to dist/
```

## Project layout

```
src/
  index.ts          — exports
  provider.ts       — TronProvider
  signer.ts         — TronSigner
  contract.ts       — TronContract
  types.ts          — TypeScript interfaces
  utils/
    address.ts      — address format detection and conversion
    conversion.ts   — SUN/TRX, gas/energy, parseUnits/formatUnits
    errors.ts       — error normalization
tests/
  *.test.ts         — 177 unit tests (mocked TronWeb)
  integration/
    nile.test.ts    — 17 live Nile testnet tests
scripts/
  live-demo.ts      — CLI demo
demo/
  server/           — Express API for web playground
  public/           — browser UI
examples/
  basic-usage.ts
  contract-interaction.ts
```

## License

MIT
