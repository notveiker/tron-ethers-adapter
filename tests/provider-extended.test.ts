/**
 * Extended Provider Tests
 *
 * Covers methods not in the main provider-signer test file:
 * getTransactionReceipt, getTransactionCount, getAccountResources,
 * getTRC20Balance, getFormattedBalance, and block-by-hash.
 */

const mockTrx = {
  getBalance: jest.fn(),
  getBlock: jest.fn(),
  getBlockByHash: jest.fn(),
  getCurrentBlock: jest.fn(),
  getTransaction: jest.fn(),
  getTransactionInfo: jest.fn(),
  getAccount: jest.fn(),
  getAccountResources: jest.fn(),
  getContract: jest.fn(),
  sign: jest.fn(),
  signMessageV2: jest.fn(),
  sendRawTransaction: jest.fn(),
};

const mockBalanceOf = jest.fn();
const mockContractAt = jest.fn().mockResolvedValue({
  methods: {
    balanceOf: jest.fn().mockReturnValue({
      call: mockBalanceOf,
    }),
  },
});

const mockTronWebInstance = {
  trx: mockTrx,
  transactionBuilder: {},
  contract: jest.fn().mockReturnValue({ at: mockContractAt }),
  toHex: jest.fn((str: string) => '0x' + Buffer.from(str).toString('hex')),
  defaultAddress: {
    base58: 'TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW',
    hex: '41742d35Cc6634C0532925a3b844Bc9e7595f2bD28',
  },
  address: {
    fromHex: jest.fn((hex: string) => 'T' + hex.slice(2, 35).replace(/[^1-9A-HJ-NP-Za-km-z]/g, 'a')),
    toHex: jest.fn(() => '41742d35Cc6634C0532925a3b844Bc9e7595f2bD28'),
  },
};

jest.mock('tronweb', () => jest.fn().mockImplementation(() => mockTronWebInstance));

import { TronProvider } from '../src/provider';
import { TronAdapterError } from '../src/utils/errors';

describe('TronProvider — extended coverage', () => {
  let provider: TronProvider;

  beforeEach(() => {
    jest.clearAllMocks();
    provider = new TronProvider('nile');
  });

  // ─── getBlock by hash ───────────────────────────────────────────

  describe('getBlock by hash', () => {
    test('fetches block by hash string', async () => {
      mockTrx.getBlockByHash.mockResolvedValue({
        blockID: 'blockhash123',
        block_header: {
          raw_data: { number: 50, timestamp: 1700000000000, parentHash: 'p123', witness_address: '41w' },
        },
        transactions: [],
      });

      const block = await provider.getBlock('blockhash123');
      expect(block).not.toBeNull();
      expect(block!.hash).toBe('blockhash123');
      expect(block!.number).toBe(50);
      expect(mockTrx.getBlockByHash).toHaveBeenCalledWith('blockhash123');
    });

    test('returns null when block_header missing', async () => {
      mockTrx.getBlock.mockResolvedValue({});
      const block = await provider.getBlock(99999);
      expect(block).toBeNull();
    });

    test('returns null when raw is null', async () => {
      mockTrx.getBlock.mockResolvedValue(null);
      const block = await provider.getBlock(99999);
      expect(block).toBeNull();
    });
  });

  // ─── getTransactionReceipt ──────────────────────────────────────

  describe('getTransactionReceipt', () => {
    test('returns normalized receipt with SUCCESS status', async () => {
      mockTrx.getTransactionInfo.mockResolvedValue({
        id: 'txhash1',
        blockNumber: 100,
        receipt: { result: 'SUCCESS', energy_usage_total: 50000 },
        log: [
          { address: '742d35Cc6634C0532925a3b844Bc9e7595f2bD28', topics: ['topic1'], data: 'deadbeef' },
        ],
      });
      mockTrx.getTransaction.mockResolvedValue({
        txID: 'txhash1',
        raw_data: {
          contract: [{ parameter: { value: { owner_address: '41742d35Cc6634C0532925a3b844Bc9e7595f2bD28', to_address: '41000000000000000000000000000000000000000b' } } }],
        },
      });

      const receipt = await provider.getTransactionReceipt('txhash1');
      expect(receipt).not.toBeNull();
      expect(receipt!.hash).toBe('txhash1');
      expect(receipt!.status).toBe(1);
      expect(receipt!.gasUsed).toBe(50000n);
      expect(receipt!.logs).toHaveLength(1);
      expect(receipt!.logs[0].data).toBe('0xdeadbeef');
      expect(receipt!.logs[0].logIndex).toBe(0);
    });

    test('returns status 0 for failed transactions', async () => {
      mockTrx.getTransactionInfo.mockResolvedValue({
        id: 'txhash2',
        blockNumber: 101,
        receipt: { result: 'FAILED', energy_usage: 30000 },
        log: [],
      });
      mockTrx.getTransaction.mockResolvedValue({
        txID: 'txhash2',
        raw_data: { contract: [{ parameter: { value: {} } }] },
      });

      const receipt = await provider.getTransactionReceipt('txhash2');
      expect(receipt!.status).toBe(0);
      expect(receipt!.gasUsed).toBe(30000n);
    });

    test('returns null for nonexistent tx info', async () => {
      mockTrx.getTransactionInfo.mockResolvedValue({});
      const receipt = await provider.getTransactionReceipt('nonexistent');
      expect(receipt).toBeNull();
    });

    test('returns null when info is null', async () => {
      mockTrx.getTransactionInfo.mockResolvedValue(null);
      const receipt = await provider.getTransactionReceipt('null_tx');
      expect(receipt).toBeNull();
    });

    test('returns null on not found error', async () => {
      mockTrx.getTransactionInfo.mockRejectedValue(new Error('transaction not found'));
      const receipt = await provider.getTransactionReceipt('missing');
      expect(receipt).toBeNull();
    });

    test('throws normalized error on other failures', async () => {
      mockTrx.getTransactionInfo.mockRejectedValue(new Error('network failure'));
      await expect(provider.getTransactionReceipt('err')).rejects.toThrow(TronAdapterError);
    });
  });

  // ─── getTransactionCount ────────────────────────────────────────

  describe('getTransactionCount', () => {
    test('returns 1 for active accounts with energy usage', async () => {
      mockTrx.getAccount.mockResolvedValue({
        account_resource: { latest_consume_time_for_energy: 1700000000 },
      });
      const count = await provider.getTransactionCount('TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW');
      expect(count).toBe(1);
    });

    test('returns 1 for accounts with balance', async () => {
      mockTrx.getAccount.mockResolvedValue({ balance: 5000000 });
      const count = await provider.getTransactionCount('TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW');
      expect(count).toBe(1);
    });

    test('returns 1 for accounts with net_window_size', async () => {
      mockTrx.getAccount.mockResolvedValue({ net_window_size: 1 });
      const count = await provider.getTransactionCount('TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW');
      expect(count).toBe(1);
    });

    test('returns 0 for empty account object', async () => {
      mockTrx.getAccount.mockResolvedValue({});
      const count = await provider.getTransactionCount('TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW');
      expect(count).toBe(0);
    });

    test('returns 0 for null account', async () => {
      mockTrx.getAccount.mockResolvedValue(null);
      const count = await provider.getTransactionCount('TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW');
      expect(count).toBe(0);
    });

    test('returns 0 on error', async () => {
      mockTrx.getAccount.mockRejectedValue(new Error('account not found'));
      const count = await provider.getTransactionCount('TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW');
      expect(count).toBe(0);
    });
  });

  // ─── getAccountResources ────────────────────────────────────────

  describe('getAccountResources', () => {
    test('returns normalized resource info', async () => {
      mockTrx.getAccountResources.mockResolvedValue({
        freeNetLimit: 5000,
        EnergyLimit: 100000,
      });
      mockTrx.getAccount.mockResolvedValue({
        balance: 10000000,
        account_resource: { frozen_balance_for_energy: { frozen_balance: 5000000 } },
        frozen: [{ frozen_balance: 3000000 }],
      });

      const resources = await provider.getAccountResources('TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW');
      expect(resources.bandwidth).toBe(5000);
      expect(resources.energy).toBe(100000);
      expect(resources.balance).toBe(10000000n);
      expect(resources.stakedForEnergy).toBe(5000000n);
      expect(resources.stakedForBandwidth).toBe(3000000n);
    });

    test('handles accounts with no staking', async () => {
      mockTrx.getAccountResources.mockResolvedValue({});
      mockTrx.getAccount.mockResolvedValue({});

      const resources = await provider.getAccountResources('TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW');
      expect(resources.bandwidth).toBe(0);
      expect(resources.energy).toBe(0);
      expect(resources.balance).toBe(0n);
      expect(resources.stakedForEnergy).toBe(0n);
      expect(resources.stakedForBandwidth).toBe(0n);
    });

    test('throws on failure', async () => {
      mockTrx.getAccountResources.mockRejectedValue(new Error('account not exist'));
      await expect(provider.getAccountResources('TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW'))
        .rejects.toThrow(TronAdapterError);
    });
  });

  // ─── getTRC20Balance ────────────────────────────────────────────

  describe('getTRC20Balance', () => {
    test('returns token balance as bigint', async () => {
      mockBalanceOf.mockResolvedValue({ toString: () => '1000000' });

      const balance = await provider.getTRC20Balance(
        'TVYbkhF1S8agaBBpNtbK5mf3Rq1u3zrxvB',
        'TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW'
      );
      expect(balance).toBe(1000000n);
    });

    test('throws on contract call failure', async () => {
      mockBalanceOf.mockRejectedValue(new Error('contract not found'));

      await expect(
        provider.getTRC20Balance('TVYbkhF1S8agaBBpNtbK5mf3Rq1u3zrxvB', 'TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW')
      ).rejects.toThrow(TronAdapterError);
    });
  });

  // ─── getFormattedBalance ────────────────────────────────────────

  describe('getFormattedBalance', () => {
    test('returns human-readable TRX balance', async () => {
      mockTrx.getBalance.mockResolvedValue(1_500_000);

      const formatted = await provider.getFormattedBalance('TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW');
      expect(formatted).toBe('1.5 TRX');
    });

    test('returns 0 TRX for empty account', async () => {
      mockTrx.getBalance.mockResolvedValue(0);

      const formatted = await provider.getFormattedBalance('TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW');
      expect(formatted).toBe('0 TRX');
    });
  });

  // ─── getTransaction edge cases ──────────────────────────────────

  describe('getTransaction — edge cases', () => {
    test('returns null on not found error', async () => {
      mockTrx.getTransaction.mockRejectedValue(new Error('transaction not found'));
      const tx = await provider.getTransaction('missing');
      expect(tx).toBeNull();
    });

    test('throws on other errors', async () => {
      mockTrx.getTransaction.mockRejectedValue(new Error('network error'));
      await expect(provider.getTransaction('err')).rejects.toThrow(TronAdapterError);
    });

    test('handles tx with contract_address instead of to_address', async () => {
      mockTrx.getTransaction.mockResolvedValue({
        txID: 'deploy_tx',
        raw_data: {
          contract: [{
            parameter: {
              value: {
                owner_address: '41742d35Cc6634C0532925a3b844Bc9e7595f2bD28',
                contract_address: '410000000000000000000000000000000000000002',
              },
            },
          }],
          timestamp: 1700000000000,
        },
      });

      const tx = await provider.getTransaction('deploy_tx');
      expect(tx).not.toBeNull();
      expect(tx!.to).not.toBe('');
    });
  });

  // ─── getBlock edge cases ────────────────────────────────────────

  describe('getBlock — non-block errors', () => {
    test('throws on network errors (not block-not-found)', async () => {
      mockTrx.getBlock.mockRejectedValue(new Error('connection refused'));
      await expect(provider.getBlock(1)).rejects.toThrow(TronAdapterError);
    });
  });

  // ─── Constructor with API key ───────────────────────────────────

  describe('constructor with apiKey', () => {
    test('creates provider with apiKey option', () => {
      const p = new TronProvider({ network: 'nile', apiKey: 'my-api-key' });
      expect(p.network.name).toBe('nile');
    });
  });
});
