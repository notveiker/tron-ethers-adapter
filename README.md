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

Everything else — `provider.getBalance()`, `provider.call()`, `estimateGas()`, `getFeeData()`, `getLogs()`, `contract.transfer()`, `contract.queryFilter()`, `contract.on()`, `signer.signTypedData()`, `tx.wait()`, error handling — works the same.

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
const block       = await provider.getBlock(blockNumber);
const balance     = await provider.getBalance('TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW');
const code        = await provider.getCode(contractAddress);
const resources   = await provider.getAccountResources(address);
const network     = await provider.getNetwork();
// → { name: 'nile', chainId: 3448148188n }
```

### Raw call (eth_call equivalent)

```typescript
// Execute any ABI-encoded calldata — no transaction, no energy cost
const data   = iface.encodeFunctionData('balanceOf', [userAddress]);
const result = await provider.call({ to: tokenAddress, data });
const [bal]  = iface.decodeFunctionResult('balanceOf', result);
```

### Estimate energy

```typescript
// Returns energy units (not SUN) — multiply by energyPrice to get fee_limit
const energy = await provider.estimateGas({
  to:   contractAddress,
  data: iface.encodeFunctionData('transfer', [to, amount]),
});

const { energyPrice } = await provider.getFeeData();
const feeLimit = energy * energyPrice;
// → feeLimit in SUN; pass as gasLimit to sendTransaction / contract writes
```

### Fee data

```typescript
const { energyPrice, bandwidthPrice, gasPrice } = await provider.getFeeData();
// energyPrice    ~420n SUN per energy unit
// bandwidthPrice ~1000n SUN per bandwidth byte
// gasPrice       alias for energyPrice
// maxFeePerGas / maxPriorityFeePerGas: always null (no EIP-1559 on TRON)
```

### Query event logs

```typescript
// Requires an address filter — full-chain log scanning not supported on TRON
const logs = await provider.getLogs({
  address:   usdtAddress,
  fromBlock: latestBlock - 100,
});
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

### Query historical events

```typescript
// Get all Transfer events from a block range (uses TronGrid event API)
const transfers = await token.queryFilter('Transfer', fromBlock, toBlock);
for (const e of transfers) {
  console.log(e.event, e.args.from, e.args.to, e.args.value);
  console.log(e.transactionHash, e.blockNumber);
}
```

### Subscribe to live events (polling)

```typescript
// Polls every 3 s for new blocks and new events — no WebSocket required
token.on('Transfer', (args, event) => {
  console.log(`${args.from} → ${args.to}: ${args.value}`);
});

// Fire once then auto-unsubscribe
token.once('Approval', (args) => {
  console.log('Approved:', args.value);
});

// Unsubscribe
token.off('Transfer');          // remove all Transfer listeners
token.removeAllListeners();     // remove everything
```

### Sign typed data (EIP-712 / TIP-712)

```typescript
import { TronSigner, CHAIN_IDS } from 'tron-ethers-adapter';

const domain = {
  name:              'MyToken',
  version:           '1',
  chainId:           CHAIN_IDS['nile'],   // 3448148188
  verifyingContract: tokenAddress,
};

const types = {
  Permit: [
    { name: 'owner',    type: 'address' },
    { name: 'spender',  type: 'address' },
    { name: 'value',    type: 'uint256' },
    { name: 'nonce',    type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
};

const signature = await signer.signTypedData(domain, types, {
  owner:    ownerAddress,
  spender:  spenderAddress,
  value:    1_000_000n,
  nonce:    0n,
  deadline: 9999999999n,
});
// Requires TronWeb >= 5.3.0 (ships with TIP-712 support)
```

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
| `getTransactionCount(address)` | `provider.getTransactionCount()` |
| `getCode(address)` | `provider.getCode()` |
| `getNetwork()` | `provider.getNetwork()` |
| `call(tx)` | `provider.call()` |
| `estimateGas(tx)` | `provider.estimateGas()` |
| `getFeeData()` | `provider.getFeeData()` |
| `getLogs(filter)` | `provider.getLogs()` |
| `waitForTransaction(hash)` | `provider.waitForTransaction()` |
| `getHealth()` | — |
| `getAccountResources(address)` | — |
| `getTRC20Balance(token, owner)` | — |
| `withRetry(fn)` | — |

### TronSigner

| Method | ethers.js equivalent |
|---|---|
| `getAddress()` | `wallet.getAddress()` |
| `getTronAddress()` | — |
| `getBalance()` | `wallet.provider.getBalance(wallet.address)` |
| `sendTransaction(tx)` | `wallet.sendTransaction()` |
| `signMessage(msg)` | `wallet.signMessage()` |
| `signTypedData(domain, types, value)` | `wallet.signTypedData()` |
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
| `contract.queryFilter(event, from?, to?)` | `contract.queryFilter()` |
| `contract.on(event, listener)` | `contract.on()` |
| `contract.once(event, listener)` | `contract.once()` |
| `contract.off(event, listener?)` | `contract.off()` |
| `contract.removeAllListeners()` | `contract.removeAllListeners()` |

## Gas vs energy

TRON doesn't have gas. The adapter maps `gasLimit` to `fee_limit` (max TRX to burn for energy). Default: 1000 TRX, hard cap: 10,000 TRX. `gasPrice` and `nonce` are silently ignored since TRON doesn't use them.

## Development

```bash
npm install
npm test                  # unit tests with coverage
npm run test:integration  # live tests against Nile
npm run lint              # ESLint
npm run typecheck         # TypeScript strict
npm run check             # all of the above + build
npm run build             # compile to dist/
```

## Project layout

```
src/
  index.ts          — exports
  provider.ts       — TronProvider (getBalance, call, estimateGas, getFeeData, getLogs, …)
  signer.ts         — TronSigner (sendTransaction, signMessage, signTypedData, …)
  contract.ts       — TronContract (ABI dispatch, queryFilter, on/off/once, deploy, …)
  types.ts          — TypeScript interfaces + CHAIN_IDS constant
  utils/
    address.ts      — address format detection and conversion
    conversion.ts   — SUN/TRX, gas/energy, parseUnits/formatUnits
    errors.ts       — error normalization
tests/
  *.test.ts         — unit tests (mocked TronWeb)
  provider-new-methods.test.ts  — call, estimateGas, getFeeData, getLogs, getNetwork
  signer-typed-data.test.ts     — signTypedData / TIP-712
  contract-events.test.ts       — queryFilter, on, off, once
  integration/
    nile.test.ts    — live Nile testnet tests
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
