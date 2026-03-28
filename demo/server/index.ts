/**
 * tron-ethers-adapter — Interactive Demo Server
 *
 * A lightweight API server that exposes the adapter's functionality
 * over HTTP so the web playground can query live TRON Nile data.
 *
 * Run: npm run demo:web
 */

import express from 'express';
import cors from 'cors';
import path from 'path';
import {
  TronProvider,
  TronContract,
  formatTRX,
  formatUnits,
  isValidAddress,
  toEthAddress,
  toTronAddress,
  detectAddressFormat,
} from '../../src';

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public')));

const provider = new TronProvider('nile');

const TRC20_ABI = [
  { type: 'function', name: 'name', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'string' }] },
  { type: 'function', name: 'symbol', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'string' }] },
  { type: 'function', name: 'decimals', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint8' }] },
  { type: 'function', name: 'totalSupply', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
];

app.get('/api/health', async (_req, res) => {
  const health = await provider.getHealth();
  res.json(health);
});

app.get('/api/block/latest', async (_req, res) => {
  try {
    const num = await provider.getBlockNumber();
    const block = await provider.getBlock(num);
    res.json({ blockNumber: num, block });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/address/:addr', async (req, res) => {
  const { addr } = req.params;
  if (!isValidAddress(addr)) {
    return res.status(400).json({ error: 'Invalid address' });
  }
  try {
    const balance = await provider.getBalance(addr);
    const resources = await provider.getAccountResources(addr);
    const code = await provider.getCode(addr);
    const format = detectAddressFormat(addr);
    const tronAddr = format === 'tron_base58' ? addr : toTronAddress(addr, provider.tronWeb);
    const ethAddr = toEthAddress(addr, provider.tronWeb);

    res.json({
      tronAddress: tronAddr,
      ethAddress: ethAddr,
      format,
      balance: balance.toString(),
      balanceFormatted: formatTRX(balance) + ' TRX',
      isContract: code.length > 2,
      resources: {
        bandwidth: resources.bandwidth,
        energy: resources.energy,
        stakedForEnergy: resources.stakedForEnergy.toString(),
        stakedForBandwidth: resources.stakedForBandwidth.toString(),
      },
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/token/:addr', async (req, res) => {
  const { addr } = req.params;
  try {
    const token = new TronContract(addr, TRC20_ABI, provider);
    const [name, symbol, decimals, totalSupply] = await Promise.all([
      token.name(),
      token.symbol(),
      token.decimals(),
      token.totalSupply(),
    ]);
    const dec = typeof decimals === 'bigint' ? Number(decimals) : Number(decimals);
    const supplyBig = typeof totalSupply === 'bigint' ? totalSupply : BigInt(totalSupply.toString());

    res.json({
      address: addr,
      name,
      symbol,
      decimals: dec,
      totalSupply: supplyBig.toString(),
      totalSupplyFormatted: formatUnits(supplyBig, dec),
    });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

app.get('/api/token/:tokenAddr/balance/:ownerAddr', async (req, res) => {
  try {
    const balance = await provider.getTRC20Balance(req.params.tokenAddr, req.params.ownerAddr);
    res.json({ balance: balance.toString() });
  } catch (e: any) {
    res.status(500).json({ error: e.message });
  }
});

const PORT = process.env.PORT || 3456;
app.listen(PORT, () => {
  console.log(`\n  tron-ethers-adapter playground`);
  console.log(`  ==============================`);
  console.log(`  Open: http://localhost:${PORT}`);
  console.log(`  API:  http://localhost:${PORT}/api/health`);
  console.log(`  Network: Nile Testnet\n`);
});
