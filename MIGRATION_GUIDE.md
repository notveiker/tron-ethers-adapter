# Migration Guide: ethers.js → tron-ethers-adapter

This guide shows Ethereum developers how to port existing ethers.js v6 code to TRON
with minimal changes. Each section shows the ethers.js original and the adapter equivalent
side by side.

## 1. Installation

```diff
- npm install ethers
+ npm install tron-ethers-adapter tronweb
```

## 2. Imports

```diff
- import { ethers } from 'ethers';
+ import {
+   TronProvider,
+   TronSigner,
+   TronContract,
+   parseTRX,
+   formatTRX,
+   parseUnits,
+   formatUnits,
+ } from 'tron-ethers-adapter';
```

## 3. Provider Setup

**Ethereum (ethers.js)**
```typescript
const provider = new ethers.JsonRpcProvider('https://mainnet.infura.io/v3/YOUR_KEY');
```

**TRON (adapter)**
```typescript
// By network name
const provider = new TronProvider('mainnet');

// Or with API key
const provider = new TronProvider({
  network: 'mainnet',
  apiKey: 'YOUR_TRONGRID_KEY',
});

// Or custom node
const provider = new TronProvider({
  network: { name: 'private', fullHost: 'http://localhost:9090' },
});
```

**Available networks:** `mainnet`, `shasta` (testnet), `nile` (testnet)

## 4. Reading Chain Data

These calls are **identical** in shape — just swap the class name:

```typescript
// Block number
const blockNumber = await provider.getBlockNumber();

// Block details
const block = await provider.getBlock(blockNumber);

// Balance (returns bigint in both cases)
const balance = await provider.getBalance(address);

// Transaction
const tx = await provider.getTransaction(txHash);

// Receipt
const receipt = await provider.getTransactionReceipt(txHash);

// Contract bytecode
const code = await provider.getCode(contractAddress);
```

**TRON bonus:** The adapter accepts any address format. You can pass `0x...` (Ethereum hex),
`T...` (TRON base58), or `41...` (TRON hex) to any method.

## 5. Wallet / Signer

**Ethereum (ethers.js)**
```typescript
const wallet = new ethers.Wallet(privateKey, provider);
const address = await wallet.getAddress(); // 0x...
const balance = await provider.getBalance(address);
```

**TRON (adapter)**
```typescript
const signer = new TronSigner(privateKey, provider);
const address = await signer.getAddress();       // 0x... (Ethereum format)
const tronAddr = await signer.getTronAddress();   // T... (TRON format)
const balance = await signer.getBalance();        // convenience method
```

## 6. Sending Transactions

**Ethereum (ethers.js)**
```typescript
const tx = await wallet.sendTransaction({
  to: '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD28',
  value: ethers.parseEther('1.0'),
});
const receipt = await tx.wait();
```

**TRON (adapter)**
```typescript
const tx = await signer.sendTransaction({
  to: 'TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW',  // or 0x... format
  value: parseTRX('1.0'),
});
const receipt = await tx.wait();
```

**Key difference:** `parseTRX` uses 6 decimals (1 TRX = 1,000,000 SUN), while
`parseEther` uses 18 decimals (1 ETH = 10^18 wei).

## 7. Smart Contract Interaction

**Ethereum (ethers.js)**
```typescript
const token = new ethers.Contract(tokenAddress, ERC20_ABI, provider);

// Read
const name = await token.name();
const balance = await token.balanceOf(myAddress);

// Write (need signer)
const tokenWithSigner = token.connect(wallet);
const tx = await tokenWithSigner.transfer(toAddress, amount);
await tx.wait();
```

**TRON (adapter) — identical pattern:**
```typescript
const token = new TronContract(tokenAddress, TRC20_ABI, provider);

// Read
const name = await token.name();
const balance = await token.balanceOf(myAddress);

// Write (need signer)
const tokenWithSigner = token.connect(signer);
const tx = await tokenWithSigner.transfer(toAddress, amount);
await tx.wait();
```

**Note:** TRC-20 ABIs are identical to ERC-20 ABIs. You can reuse the same ABI files.

## 8. Contract Deployment

**Ethereum (ethers.js)**
```typescript
const factory = new ethers.ContractFactory(abi, bytecode, wallet);
const contract = await factory.deploy('MyToken', 'MTK');
await contract.waitForDeployment();
```

**TRON (adapter)**
```typescript
const contract = await TronContract.deploy({
  abi,
  bytecode,
  constructorArgs: ['MyToken', 'MTK'],
  feeLimit: 1_000_000_000,  // 1000 TRX (TRON-specific)
}, signer);
```

## 9. Value Formatting

| ethers.js | tron-ethers-adapter | Notes |
|---|---|---|
| `ethers.parseEther('1.0')` | `parseTRX('1.0')` | 18 decimals → 6 decimals |
| `ethers.formatEther(n)` | `formatTRX(n)` | |
| `ethers.parseUnits('1.0', 6)` | `parseUnits('1.0', 6)` | Same API |
| `ethers.formatUnits(n, 6)` | `formatUnits(n, 6)` | Same API |

## 10. Error Handling

**Ethereum (ethers.js)**
```typescript
try {
  await wallet.sendTransaction(tx);
} catch (error) {
  if (error.code === 'INSUFFICIENT_FUNDS') { ... }
}
```

**TRON (adapter) — same pattern:**
```typescript
import { TronAdapterError, TronAdapterErrorCode } from 'tron-ethers-adapter';

try {
  await signer.sendTransaction(tx);
} catch (error) {
  if (error instanceof TronAdapterError) {
    if (error.code === TronAdapterErrorCode.INSUFFICIENT_FUNDS) { ... }
    if (error.code === TronAdapterErrorCode.CONTRACT_REVERT) { ... }
  }
}
```

## 11. Key Differences to Know

### Gas vs Energy/Bandwidth

| Ethereum | TRON | Adapter Behavior |
|---|---|---|
| `gasLimit` | `fee_limit` (max TRX to burn) | `gasLimit` maps to `fee_limit` in SUN |
| `gasPrice` | Not applicable | Silently ignored |
| `nonce` | Not applicable (no sequential nonce) | Silently ignored |

### Address Formats

| Format | Example | When You See It |
|---|---|---|
| Ethereum hex | `0x742d35Cc...` | ethers.js default |
| TRON base58 | `TJCnKsPa7y...` | TRON explorer, TronLink wallet |
| TRON hex | `41742d35Cc...` | Internal TRON format |

The adapter accepts **all three formats everywhere**. You never need to convert manually.

### Units

| | Ethereum | TRON |
|---|---|---|
| Base unit | wei (10^-18 ETH) | SUN (10^-6 TRX) |
| Decimals | 18 | 6 |
| Token standard | ERC-20 | TRC-20 (same ABI) |

## 12. New Capabilities vs ethers.js

### 12a. provider.call() — Raw call / eth_call

```diff
- const result = await provider.call({ to: addr, data: calldata });
+ const result = await provider.call({ to: addr, data: calldata });
// identical API — works on TRON too
```

### 12b. provider.estimateGas()

```diff
- const gas = await provider.estimateGas({ to: addr, data });
+ const energy = await provider.estimateGas({ to: addr, data });
// Returns energy units (not SUN). Multiply by energyPrice to get fee_limit.
// Use getFeeData() to get the current energyPrice.
```

### 12c. provider.getFeeData()

```diff
- const { gasPrice, maxFeePerGas } = await provider.getFeeData();
+ const { energyPrice, bandwidthPrice, gasPrice } = await provider.getFeeData();
// maxFeePerGas is always null on TRON
// gasPrice is an alias for energyPrice for drop-in compatibility
```

### 12d. provider.getLogs() — Event log querying

```diff
- const logs = await provider.getLogs({ address, fromBlock, toBlock, topics });
+ const logs = await provider.getLogs({ address, fromBlock, toBlock });
// TRON requires an address — full-chain log scanning is not supported
// Topic filtering is not available at the node level; filter client-side
```

### 12e. provider.getNetwork()

```diff
- const { name, chainId } = await provider.getNetwork();
+ const { name, chainId } = await provider.getNetwork();
// chainId is a bigint: mainnet=728126428n, shasta=2494104990n, nile=3448148188n
// Use CHAIN_IDS['mainnet'] etc. for EIP-712 domains
```

### 12f. signer.signTypedData() — EIP-712 / TIP-712

```diff
- const sig = await signer.signTypedData(domain, types, value);
+ const sig = await signer.signTypedData(domain, types, value);
// Identical API! Use CHAIN_IDS['mainnet'] in the domain object.
// Requires TronWeb >= 5.3.0
```

### 12g. contract.queryFilter() — Historical events

```diff
- const events = await contract.queryFilter('Transfer', fromBlock, toBlock);
+ const events = await contract.queryFilter('Transfer', fromBlock, toBlock);
// Identical API. Events include .args keyed by parameter name.
```

### 12h. contract.on() / off() / once() — Live event subscriptions

```diff
- contract.on('Transfer', (from, to, value, event) => { ... });
+ contract.on('Transfer', (args, event) => { ... });
// Arg shape differs: TRON gives args as a keyed object { from, to, value }
// Uses polling (3 s interval) instead of WebSocket push
```

## 13. Quick Reference Cheat Sheet

```typescript
// ─── SETUP ─────────────────────────────────
import {
  TronProvider, TronSigner, TronContract,
  parseTRX, formatTRX, CHAIN_IDS
} from 'tron-ethers-adapter';

const provider = new TronProvider('nile');
const signer   = new TronSigner(process.env.PRIVATE_KEY, provider);

// ─── READ ──────────────────────────────────
await provider.getBlockNumber();
await provider.getBalance('T...');                                // bigint (SUN)
await provider.getBlock(12345);
await provider.getNetwork();                                      // { name, chainId }
await provider.call({ to: contractAddr, data: '0x...' });        // eth_call
await provider.estimateGas({ to: contractAddr, data: '0x...' }); // energy units
await provider.getFeeData();                                      // { energyPrice, bandwidthPrice }
await provider.getLogs({ address: contractAddr, fromBlock });     // event logs
await provider.getAccountResources('T...');                       // TRON-specific

// ─── WRITE ─────────────────────────────────
await signer.sendTransaction({ to: 'T...', value: parseTRX('10') });
await signer.sendTRX('T...', 10_000_000n);
await signer.sendTRC20(tokenAddr, 'T...', 1000000n);
await signer.signTypedData(
  { name: 'MyDapp', version: '1', chainId: CHAIN_IDS['nile'], verifyingContract: addr },
  { MyType: [{ name: 'field', type: 'uint256' }] },
  { field: 42n }
);

// ─── CONTRACTS ─────────────────────────────
const token    = new TronContract(addr, abi, provider);
const writable = token.connect(signer);
await token.name();                                               // view call
await writable.transfer('T...', 100);                            // send tx
await token.queryFilter('Transfer', fromBlock, toBlock);         // historical events
token.on('Transfer', (args) => console.log(args.from, args.to)); // live events
token.off('Transfer');                                            // unsubscribe

// ─── FORMAT ────────────────────────────────
parseTRX('1.5');          // → 1_500_000n (SUN)
formatTRX(1_500_000n);    // → "1.5"
```
