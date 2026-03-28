#!/usr/bin/env npx ts-node
/**
 * Live Demo — tron-ethers-adapter against Nile Testnet
 *
 * Connects to the real TRON Nile testnet and demonstrates every
 * major feature of the adapter using live blockchain data.
 *
 * Run: npm run demo
 *
 * No private key required — all operations are read-only.
 */

import {
  TronProvider,
  TronContract,
  parseTRX,
  formatTRX,
  formatUnits,
  isValidAddress,
  toEthAddress,
  toTronAddress,
  detectAddressFormat,
} from '../src';

const NILE_USDT = 'TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf';
const KNOWN_ADDRESS = 'TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW';

const TRC20_ABI = [
  { type: 'function', name: 'name', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'string' }] },
  { type: 'function', name: 'symbol', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'string' }] },
  { type: 'function', name: 'decimals', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint8' }] },
  { type: 'function', name: 'totalSupply', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
];

function hr() { console.log('─'.repeat(64)); }
function section(title: string) {
  console.log();
  hr();
  console.log(`  ${title}`);
  hr();
}

async function main() {
  console.log();
  console.log('  tron-ethers-adapter — Live Nile Testnet Demo');
  console.log('  =============================================');
  console.log();

  // ─── 1. Connect ────────────────────────────────────────────────
  section('1. Connect to TRON (like ethers.JsonRpcProvider)');

  console.log('  Code:  const provider = new TronProvider("nile");');
  const provider = new TronProvider('nile');

  const health = await provider.getHealth();
  console.log();
  console.log(`  Connected:    ${health.connected ? 'YES' : 'NO'}`);
  console.log(`  Network:      ${health.network}`);
  console.log(`  Block:        #${health.blockNumber.toLocaleString()}`);
  console.log(`  Latency:      ${health.latencyMs}ms`);
  console.log(`  Node:         ${health.fullHost}`);

  // ─── 2. Read Block Data ────────────────────────────────────────
  section('2. Read blocks (like provider.getBlock())');

  const blockNum = await provider.getBlockNumber();
  const block = await provider.getBlock(blockNum - 1);
  console.log();
  console.log(`  Block #${block!.number}:`);
  console.log(`    Hash:         ${block!.hash.slice(0, 20)}...`);
  console.log(`    Parent:       ${block!.parentHash.slice(0, 20)}...`);
  console.log(`    Timestamp:    ${new Date(block!.timestamp).toISOString()}`);
  console.log(`    Transactions: ${block!.transactions.length}`);
  console.log(`    Witness:      ${block!.miner.slice(0, 20)}...`);

  // ─── 3. Read Balances ──────────────────────────────────────────
  section('3. Read balances (like provider.getBalance())');

  const balance = await provider.getBalance(KNOWN_ADDRESS);
  console.log();
  console.log(`  Address: ${KNOWN_ADDRESS}`);
  console.log(`  Balance: ${formatTRX(balance)} TRX  (${balance} SUN)`);

  // ─── 4. Address Conversion ─────────────────────────────────────
  section('4. Universal address conversion');

  const ethAddr = toEthAddress(KNOWN_ADDRESS, provider.tronWeb);
  const tronAddr = toTronAddress(ethAddr, provider.tronWeb);
  console.log();
  console.log(`  TRON base58: ${KNOWN_ADDRESS}`);
  console.log(`  ETH hex:     ${ethAddr}`);
  console.log(`  Roundtrip:   ${tronAddr}`);
  console.log(`  Match:       ${tronAddr === KNOWN_ADDRESS ? 'YES' : 'NO'}`);
  console.log();
  console.log(`  All three formats accepted everywhere — zero cognitive load.`);

  // ─── 5. Account Resources ──────────────────────────────────────
  section('5. Account resources (TRON-specific)');

  const resources = await provider.getAccountResources(KNOWN_ADDRESS);
  console.log();
  console.log(`  Bandwidth:         ${resources.bandwidth}`);
  console.log(`  Energy:            ${resources.energy}`);
  console.log(`  Balance:           ${formatTRX(resources.balance)} TRX`);
  console.log(`  Staked (Energy):   ${formatTRX(resources.stakedForEnergy)} TRX`);
  console.log(`  Staked (BW):       ${formatTRX(resources.stakedForBandwidth)} TRX`);

  // ─── 6. Smart Contract (TRC-20) ───────────────────────────────
  section('6. Smart contract reads (like ethers.Contract)');

  console.log();
  console.log('  Code:  const token = new TronContract(address, abi, provider);');
  console.log('         const name = await token.name();');
  console.log();

  const token = new TronContract(NILE_USDT, TRC20_ABI, provider);

  const tokenName = await token.name();
  const tokenSymbol = await token.symbol();
  const tokenDecimals = await token.decimals();
  const totalSupply = await token.totalSupply();

  const dec = typeof tokenDecimals === 'bigint' ? Number(tokenDecimals) : Number(tokenDecimals);
  const supplyBig = typeof totalSupply === 'bigint' ? totalSupply : BigInt(totalSupply.toString());

  console.log(`  Contract:     ${NILE_USDT}`);
  console.log(`  Name:         ${tokenName}`);
  console.log(`  Symbol:       ${tokenSymbol}`);
  console.log(`  Decimals:     ${dec}`);
  console.log(`  Total Supply: ${formatUnits(supplyBig, dec)} ${tokenSymbol}`);

  // ─── 7. Contract Bytecode ──────────────────────────────────────
  section('7. Contract bytecode (like provider.getCode())');

  const code = await provider.getCode(NILE_USDT);
  console.log();
  console.log(`  USDT contract bytecode: ${code.slice(0, 40)}...`);
  console.log(`  Length: ${code.length} hex chars`);
  console.log(`  Is contract: ${code.length > 2 ? 'YES' : 'NO'}`);

  // ─── 8. Value Conversions ──────────────────────────────────────
  section('8. Value conversions (like ethers.parseEther / formatEther)');
  console.log();
  console.log(`  parseTRX("1.5")    → ${parseTRX('1.5')} SUN`);
  console.log(`  parseTRX("100")    → ${parseTRX('100')} SUN`);
  console.log(`  formatTRX(1500000) → ${formatTRX(1_500_000n)} TRX`);
  console.log(`  formatTRX(1)       → ${formatTRX(1n)} TRX`);

  // ─── Summary ───────────────────────────────────────────────────
  section('Summary');
  console.log();
  console.log('  Everything above used the ethers.js-compatible API.');
  console.log('  Replace ethers.JsonRpcProvider → TronProvider');
  console.log('  Replace ethers.Wallet          → TronSigner');
  console.log('  Replace ethers.Contract        → TronContract');
  console.log('  Replace parseEther             → parseTRX');
  console.log();
  console.log('  Ethereum developers can build on TRON by changing ~5 lines.');
  console.log();
  hr();
  console.log();
}

main().catch((err) => {
  console.error('Demo failed:', err.message);
  process.exit(1);
});
