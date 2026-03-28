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

## 12. Quick Reference Cheat Sheet

```typescript
// ─── SETUP ─────────────────────────────────
import { TronProvider, TronSigner, TronContract, parseTRX, formatTRX } from 'tron-ethers-adapter';

const provider = new TronProvider('nile');                    // testnet
const signer = new TronSigner(process.env.PRIVATE_KEY, provider);

// ─── READ ──────────────────────────────────
await provider.getBlockNumber();
await provider.getBalance('T...');                            // bigint (SUN)
await provider.getBlock(12345);
await provider.getAccountResources('T...');                   // TRON-specific

// ─── WRITE ─────────────────────────────────
await signer.sendTransaction({ to: 'T...', value: parseTRX('10') });
await signer.sendTRX('T...', 10_000_000n);                   // convenience
await signer.sendTRC20(tokenAddr, 'T...', 1000000n);         // convenience

// ─── CONTRACTS ─────────────────────────────
const token = new TronContract(addr, abi, provider);          // read-only
const name = await token.name();                              // view call
const writable = token.connect(signer);                       // attach signer
const tx = await writable.transfer('T...', 100);              // send tx
await tx.wait();                                              // wait confirm

// ─── FORMAT ────────────────────────────────
parseTRX('1.5');          // → 1_500_000n (SUN)
formatTRX(1_500_000n);    // → "1.5"
```
