/**
 * Tests for TronProvider and TronSigner
 *
 * These tests mock TronWeb to verify that the adapter correctly
 * translates between ethers.js API calls and TronWeb operations.
 */

// ─── Mock TronWeb before imports ────────────────────────────────────

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

const mockTransactionBuilder = {
  sendTrx: jest.fn(),
  triggerSmartContract: jest.fn(),
  createSmartContract: jest.fn(),
};

const mockTronWebInstance = {
  trx: mockTrx,
  transactionBuilder: mockTransactionBuilder,
  contract: jest.fn().mockReturnValue({ at: jest.fn() }),
  toHex: jest.fn((str: string) => '0x' + Buffer.from(str).toString('hex')),
  defaultAddress: {
    base58: 'TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW',
    hex: '41742d35Cc6634C0532925a3b844Bc9e7595f2bD28',
  },
  address: {
    fromHex: jest.fn((hex: string) => 'T' + hex.slice(2, 35).replace(/[^1-9A-HJ-NP-Za-km-z]/g, 'a')),
    toHex: jest.fn((_base58: string) => '41742d35Cc6634C0532925a3b844Bc9e7595f2bD28'),
  },
};

jest.mock('tronweb', () => {
  return jest.fn().mockImplementation(() => mockTronWebInstance);
});

import { TronProvider } from '../src/provider';
import { TronSigner } from '../src/signer';
import { TronAdapterError } from '../src/utils/errors';

// ─── TronProvider ───────────────────────────────────────────────────

describe('TronProvider', () => {
  let provider: TronProvider;

  beforeEach(() => {
    jest.clearAllMocks();
    provider = new TronProvider('nile');
  });

  describe('constructor', () => {
    test('creates provider with network name string', () => {
      const p = new TronProvider('mainnet');
      expect(p.network.name).toBe('mainnet');
      expect(p.network.fullHost).toBe('https://api.trongrid.io');
    });

    test('creates provider with nile testnet', () => {
      const p = new TronProvider('nile');
      expect(p.network.name).toBe('nile');
    });

    test('creates provider with shasta testnet', () => {
      const p = new TronProvider('shasta');
      expect(p.network.name).toBe('shasta');
    });

    test('creates provider with custom network object', () => {
      const p = new TronProvider({
        network: { name: 'custom', fullHost: 'https://my-node.example.com' },
      });
      expect(p.network.name).toBe('custom');
    });

    test('throws for unknown network name', () => {
      expect(() => new TronProvider('unknown_network')).toThrow(TronAdapterError);
    });

    test('is case-insensitive for network names', () => {
      const p = new TronProvider('Mainnet');
      expect(p.network.name).toBe('mainnet');
    });
  });

  describe('getBalance', () => {
    test('returns balance as bigint', async () => {
      mockTrx.getBalance.mockResolvedValue(1_000_000);

      const balance = await provider.getBalance('TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW');
      expect(balance).toBe(1_000_000n);
    });

    test('handles zero balance', async () => {
      mockTrx.getBalance.mockResolvedValue(0);

      const balance = await provider.getBalance('TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW');
      expect(balance).toBe(0n);
    });

    test('throws normalized error on failure', async () => {
      mockTrx.getBalance.mockRejectedValue(new Error('account is not found'));

      await expect(provider.getBalance('TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW'))
        .rejects.toThrow(TronAdapterError);
    });
  });

  describe('getBlockNumber', () => {
    test('returns current block number', async () => {
      mockTrx.getCurrentBlock.mockResolvedValue({
        block_header: { raw_data: { number: 12345 } },
      });

      const blockNum = await provider.getBlockNumber();
      expect(blockNum).toBe(12345);
    });

    test('returns 0 for empty response', async () => {
      mockTrx.getCurrentBlock.mockResolvedValue({});

      const blockNum = await provider.getBlockNumber();
      expect(blockNum).toBe(0);
    });
  });

  describe('getBlock', () => {
    test('returns normalized block by number', async () => {
      mockTrx.getBlock.mockResolvedValue({
        blockID: 'abc123',
        block_header: {
          raw_data: {
            number: 100,
            timestamp: 1700000000000,
            parentHash: 'parent123',
            witness_address: '41witness',
          },
        },
        transactions: [{ txID: 'tx1' }, { txID: 'tx2' }],
      });

      const block = await provider.getBlock(100);

      expect(block).not.toBeNull();
      expect(block!.hash).toBe('abc123');
      expect(block!.number).toBe(100);
      expect(block!.parentHash).toBe('parent123');
      expect(block!.transactions).toEqual(['tx1', 'tx2']);
      expect(block!.miner).toBe('41witness');
    });

    test('returns null for nonexistent block', async () => {
      mockTrx.getBlock.mockRejectedValue(new Error('block does not exist'));

      const block = await provider.getBlock(999999999);
      expect(block).toBeNull();
    });
  });

  describe('getTransaction', () => {
    test('returns normalized transaction', async () => {
      mockTrx.getTransaction.mockResolvedValue({
        txID: 'hash123',
        raw_data: {
          contract: [{
            parameter: {
              value: {
                owner_address: '41742d35Cc6634C0532925a3b844Bc9e7595f2bD28',
                to_address: '410000000000000000000000000000000000000001',
                amount: 1000000,
              },
            },
          }],
          timestamp: 1700000000000,
        },
      });

      const tx = await provider.getTransaction('hash123');

      expect(tx).not.toBeNull();
      expect(tx!.hash).toBe('hash123');
      expect(tx!.value).toBe(1000000n);
      expect(typeof tx!.wait).toBe('function');
    });

    test('returns null for nonexistent transaction', async () => {
      mockTrx.getTransaction.mockResolvedValue({});

      const tx = await provider.getTransaction('nonexistent');
      expect(tx).toBeNull();
    });
  });

  describe('getCode', () => {
    test('returns bytecode with 0x prefix', async () => {
      mockTrx.getContract.mockResolvedValue({ bytecode: 'deadbeef' });

      const code = await provider.getCode('TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW');
      expect(code).toBe('0xdeadbeef');
    });

    test('returns 0x for non-contract addresses', async () => {
      mockTrx.getContract.mockResolvedValue({});

      const code = await provider.getCode('TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW');
      expect(code).toBe('0x');
    });

    test('returns 0x on error', async () => {
      mockTrx.getContract.mockRejectedValue(new Error('not found'));

      const code = await provider.getCode('TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW');
      expect(code).toBe('0x');
    });
  });
});

// ─── TronSigner ─────────────────────────────────────────────────────

describe('TronSigner', () => {
  let provider: TronProvider;
  let signer: TronSigner;

  beforeEach(() => {
    jest.clearAllMocks();
    provider = new TronProvider('nile');
    signer = new TronSigner(
      'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
      provider
    );
  });

  describe('constructor', () => {
    test('strips 0x prefix from private key', () => {
      const s = new TronSigner(
        '0xabcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890',
        provider
      );
      expect(s).toBeInstanceOf(TronSigner);
    });

    test('throws for empty private key', () => {
      expect(() => new TronSigner('', provider)).toThrow(TronAdapterError);
    });

    test('throws for non-string private key', () => {
      expect(() => new TronSigner(null as any, provider)).toThrow(TronAdapterError);
    });
  });

  describe('getAddress', () => {
    test('returns Ethereum hex format address', async () => {
      const address = await signer.getAddress();
      expect(address.startsWith('0x')).toBe(true);
    });
  });

  describe('getTronAddress', () => {
    test('returns TRON base58 address', async () => {
      const address = await signer.getTronAddress();
      expect(address.startsWith('T')).toBe(true);
    });
  });

  describe('signMessage', () => {
    test('signs a message via TronWeb', async () => {
      mockTrx.signMessageV2.mockResolvedValue('0xsignature123');

      const sig = await signer.signMessage('hello');
      expect(sig).toBe('0xsignature123');
      expect(mockTrx.signMessageV2).toHaveBeenCalled();
    });
  });

  describe('sendTransaction', () => {
    test('sends TRX transfer', async () => {
      mockTransactionBuilder.sendTrx.mockResolvedValue({ txID: 'tx123' });
      mockTrx.sign.mockResolvedValue({ txID: 'tx123' });
      mockTrx.sendRawTransaction.mockResolvedValue({ result: true, txid: 'tx123' });

      const tx = await signer.sendTransaction({
        to: 'TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW',
        value: 1_000_000n,
      });

      expect(tx.hash).toBe('tx123');
      expect(typeof tx.wait).toBe('function');
    });

    test('throws for missing to address on TRX transfer', async () => {
      await expect(
        signer.sendTransaction({ value: 1_000_000n })
      ).rejects.toThrow(TronAdapterError);
    });

    test('throws on broadcast failure', async () => {
      mockTransactionBuilder.sendTrx.mockResolvedValue({ txID: 'tx123' });
      mockTrx.sign.mockResolvedValue({ txID: 'tx123' });
      mockTrx.sendRawTransaction.mockResolvedValue({ result: false, message: 'error' });

      await expect(
        signer.sendTransaction({
          to: 'TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW',
          value: 1_000_000n,
        })
      ).rejects.toThrow(TronAdapterError);
    });
  });

  describe('connect', () => {
    test('creates new signer connected to different provider', () => {
      const newProvider = new TronProvider('mainnet');
      const newSigner = signer.connect(newProvider);

      expect(newSigner).toBeInstanceOf(TronSigner);
      expect(newSigner).not.toBe(signer);
      expect(newSigner.provider.network.name).toBe('mainnet');
    });
  });
});
