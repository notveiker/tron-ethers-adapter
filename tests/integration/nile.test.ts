/**
 * Live Integration Tests — Nile Testnet
 *
 * These tests connect to the real TRON Nile testnet and verify that
 * the adapter correctly reads live blockchain data. No mocks.
 *
 * Run:  npm run test:integration
 * Skip: These are excluded from the default `npm test` (unit-only).
 *
 * Prerequisites:
 *   - Internet connection
 *   - Nile testnet must be reachable (https://nile.trongrid.io)
 *
 * These tests are READ-ONLY — no private key or funded wallet required.
 */

import { TronProvider } from '../../src/provider';
import { TronContract } from '../../src/contract';
import {
  formatTRX,
  parseTRX,
  isValidAddress,
  toEthAddress,
  toTronAddress,
  detectAddressFormat,
} from '../../src/utils';

// Known Nile testnet addresses (real, verifiable on nile.tronscan.org)
const NILE_USDT_CONTRACT = 'TXYZopYRdj2D9XRtbG411XZZ3kM5VkAeBf';
const NILE_GENESIS_ADDRESS = 'TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW';

const TRC20_ABI = [
  { type: 'function', name: 'name', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'string' }] },
  { type: 'function', name: 'symbol', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'string' }] },
  { type: 'function', name: 'decimals', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint8' }] },
  { type: 'function', name: 'totalSupply', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
];

describe('Live Nile Testnet Integration', () => {
  let provider: TronProvider;

  beforeAll(() => {
    provider = new TronProvider('nile');
  });

  // ─── Provider Health ──────────────────────────────────────────────

  describe('connection health', () => {
    it('connects to Nile and reports healthy', async () => {
      const health = await provider.getHealth();
      expect(health.connected).toBe(true);
      expect(health.blockNumber).toBeGreaterThan(0);
      expect(health.latencyMs).toBeGreaterThan(0);
      expect(health.network).toBe('nile');
    }, 15000);
  });

  // ─── Block Reads ──────────────────────────────────────────────────

  describe('block data', () => {
    it('reads current block number', async () => {
      const blockNumber = await provider.getBlockNumber();
      expect(typeof blockNumber).toBe('number');
      expect(blockNumber).toBeGreaterThan(1_000_000);
    }, 10000);

    it('reads a specific block by number', async () => {
      const blockNumber = await provider.getBlockNumber();
      const block = await provider.getBlock(blockNumber - 5);
      expect(block).not.toBeNull();
      expect(block!.number).toBe(blockNumber - 5);
      expect(block!.hash).toBeTruthy();
      expect(typeof block!.timestamp).toBe('number');
    }, 10000);

    it('returns null for a future block', async () => {
      const block = await provider.getBlock(999_999_999);
      expect(block).toBeNull();
    }, 10000);
  });

  // ─── Balance Reads ────────────────────────────────────────────────

  describe('balance queries', () => {
    it('reads balance of a known address as bigint', async () => {
      const balance = await provider.getBalance(NILE_GENESIS_ADDRESS);
      expect(typeof balance).toBe('bigint');
      expect(balance).toBeGreaterThanOrEqual(0n);
    }, 10000);

    it('reads formatted balance', async () => {
      const formatted = await provider.getFormattedBalance(NILE_GENESIS_ADDRESS);
      expect(formatted).toContain('TRX');
    }, 10000);

    it('accepts 0x hex address for balance', async () => {
      const ethAddr = toEthAddress(NILE_GENESIS_ADDRESS, provider.tronWeb);
      const balance = await provider.getBalance(ethAddr);
      expect(typeof balance).toBe('bigint');
    }, 10000);
  });

  // ─── Address Conversion (live TronWeb) ────────────────────────────

  describe('address conversion with live TronWeb', () => {
    it('roundtrips T... → 0x → T...', () => {
      const ethAddr = toEthAddress(NILE_GENESIS_ADDRESS, provider.tronWeb);
      expect(ethAddr.startsWith('0x')).toBe(true);
      const back = toTronAddress(ethAddr, provider.tronWeb);
      expect(back).toBe(NILE_GENESIS_ADDRESS);
    });

    it('validates Nile USDT contract address', () => {
      expect(isValidAddress(NILE_USDT_CONTRACT)).toBe(true);
      expect(detectAddressFormat(NILE_USDT_CONTRACT)).toBe('tron_base58');
    });
  });

  // ─── Contract Reads (live TRC-20) ─────────────────────────────────

  describe('TRC-20 contract reads (Nile USDT)', () => {
    let token: TronContract;

    beforeAll(() => {
      token = new TronContract(NILE_USDT_CONTRACT, TRC20_ABI, provider);
    });

    it('reads token name', async () => {
      const name = await token.name();
      expect(typeof name).toBe('string');
      expect(name.length).toBeGreaterThan(0);
    }, 15000);

    it('reads token symbol', async () => {
      const symbol = await token.symbol();
      expect(typeof symbol).toBe('string');
    }, 15000);

    it('reads token decimals', async () => {
      const decimals = await token.decimals();
      const num = typeof decimals === 'bigint' ? Number(decimals) : Number(decimals);
      expect(num).toBeGreaterThanOrEqual(0);
      expect(num).toBeLessThanOrEqual(18);
    }, 15000);
  });

  // ─── Account Resources (live) ─────────────────────────────────────

  describe('account resources', () => {
    it('reads resources for a known address', async () => {
      const resources = await provider.getAccountResources(NILE_GENESIS_ADDRESS);
      expect(typeof resources.bandwidth).toBe('number');
      expect(typeof resources.energy).toBe('number');
      expect(typeof resources.balance).toBe('bigint');
    }, 10000);
  });

  // ─── Contract Code ────────────────────────────────────────────────

  describe('contract code', () => {
    it('returns bytecode for USDT contract', async () => {
      const code = await provider.getCode(NILE_USDT_CONTRACT);
      expect(code.startsWith('0x')).toBe(true);
      expect(code.length).toBeGreaterThan(4);
    }, 10000);

    it('returns 0x for a non-contract address', async () => {
      const code = await provider.getCode(NILE_GENESIS_ADDRESS);
      expect(code).toBe('0x');
    }, 10000);
  });

  // ─── Utility Roundtrips (live verification) ───────────────────────

  describe('value conversions', () => {
    it('parseTRX and formatTRX roundtrip', () => {
      expect(formatTRX(parseTRX('1.5'))).toBe('1.5');
      expect(formatTRX(parseTRX('0'))).toBe('0');
      expect(formatTRX(parseTRX('999999.999999'))).toBe('999999.999999');
    });
  });

  // ─── Retry Logic ──────────────────────────────────────────────────

  describe('retry logic', () => {
    it('withRetry succeeds on first attempt for healthy calls', async () => {
      const blockNum = await provider.withRetry(() => provider.getBlockNumber());
      expect(blockNum).toBeGreaterThan(0);
    }, 10000);
  });
});
