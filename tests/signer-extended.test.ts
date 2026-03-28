/**
 * Extended Signer Tests
 *
 * Covers: contract transactions (data field), sendTRX convenience method,
 * sendTRC20, signMessage errors, and edge cases.
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

const mockTransfer = jest.fn();
const mockContractInstance = {
  methods: {
    transfer: jest.fn().mockReturnValue({
      send: mockTransfer,
    }),
  },
};
const mockContractAt = jest.fn().mockResolvedValue(mockContractInstance);

const mockTransactionBuilder = {
  sendTrx: jest.fn(),
  triggerSmartContract: jest.fn(),
  createSmartContract: jest.fn(),
};

const mockTronWebInstance = {
  trx: mockTrx,
  transactionBuilder: mockTransactionBuilder,
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
import { TronSigner } from '../src/signer';
import { TronAdapterError } from '../src/utils/errors';

const PRIV_KEY = 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';

describe('TronSigner — extended coverage', () => {
  let provider: TronProvider;
  let signer: TronSigner;

  beforeEach(() => {
    jest.clearAllMocks();
    provider = new TronProvider('nile');
    signer = new TronSigner(PRIV_KEY, provider);
  });

  // ─── getBalance ─────────────────────────────────────────────────

  describe('getBalance', () => {
    test('returns signer balance as bigint', async () => {
      mockTrx.getBalance.mockResolvedValue(5_000_000);
      const balance = await signer.getBalance();
      expect(balance).toBe(5_000_000n);
    });
  });

  // ─── sendTRX convenience ────────────────────────────────────────

  describe('sendTRX', () => {
    test('sends TRX via convenience method', async () => {
      mockTransactionBuilder.sendTrx.mockResolvedValue({ txID: 'trx_tx' });
      mockTrx.sign.mockResolvedValue({ txID: 'trx_tx' });
      mockTrx.sendRawTransaction.mockResolvedValue({ result: true, txid: 'trx_tx' });

      const tx = await signer.sendTRX('TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW', 2_000_000n);
      expect(tx.hash).toBe('trx_tx');
      expect(tx.value).toBe(2_000_000n);
    });
  });

  // ─── sendTransaction with data (contract call) ─────────────────

  describe('sendTransaction with data', () => {
    test('sends contract transaction when data field present', async () => {
      mockTransactionBuilder.triggerSmartContract.mockResolvedValue({
        transaction: { txID: 'contract_tx' },
      });
      mockTrx.sign.mockResolvedValue({ txID: 'contract_tx' });
      mockTrx.sendRawTransaction.mockResolvedValue({ result: true, txid: 'contract_tx' });

      const tx = await signer.sendTransaction({
        to: 'TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW',
        data: '0xa9059cbb000000000000000000000000',
        gasLimit: 500_000_000n,
      });

      expect(tx.hash).toBe('contract_tx');
      expect(mockTransactionBuilder.triggerSmartContract).toHaveBeenCalledWith(
        expect.any(String),
        '',
        expect.objectContaining({ rawParameter: 'a9059cbb000000000000000000000000' }),
        [],
        expect.any(String)
      );
    });

    test('throws when triggerSmartContract returns no transaction', async () => {
      mockTransactionBuilder.triggerSmartContract.mockResolvedValue({});

      await expect(
        signer.sendTransaction({
          to: 'TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW',
          data: '0xa9059cbb',
        })
      ).rejects.toThrow(TronAdapterError);
    });

    test('throws when contract broadcast fails', async () => {
      mockTransactionBuilder.triggerSmartContract.mockResolvedValue({
        transaction: { txID: 'fail_tx' },
      });
      mockTrx.sign.mockResolvedValue({ txID: 'fail_tx' });
      mockTrx.sendRawTransaction.mockResolvedValue({ result: false });

      await expect(
        signer.sendTransaction({
          to: 'TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW',
          data: '0xa9059cbb',
        })
      ).rejects.toThrow(TronAdapterError);
    });

    test('throws when no "to" for contract transaction', async () => {
      await expect(
        signer.sendTransaction({ data: '0xa9059cbb' })
      ).rejects.toThrow(TronAdapterError);
    });

    test('sends contract tx with value (callValue)', async () => {
      mockTransactionBuilder.triggerSmartContract.mockResolvedValue({
        transaction: { txID: 'payable_tx' },
      });
      mockTrx.sign.mockResolvedValue({ txID: 'payable_tx' });
      mockTrx.sendRawTransaction.mockResolvedValue({ result: true, txid: 'payable_tx' });

      const tx = await signer.sendTransaction({
        to: 'TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW',
        data: '0xdeadbeef',
        value: 1_000_000n,
      });

      expect(tx.hash).toBe('payable_tx');
    });
  });

  // ─── sendTRC20 ─────────────────────────────────────────────────

  describe('sendTRC20', () => {
    test('sends TRC20 transfer and returns tx response', async () => {
      mockTransfer.mockResolvedValue('trc20_txhash');
      mockTrx.getTransaction.mockResolvedValue({
        txID: 'trc20_txhash',
        raw_data: {
          contract: [{ parameter: { value: { owner_address: '41742d35Cc6634C0532925a3b844Bc9e7595f2bD28', to_address: '41000000000000000000000000000000000000000b' } } }],
          timestamp: 1700000000000,
        },
      });

      const tx = await signer.sendTRC20(
        'TVYbkhF1S8agaBBpNtbK5mf3Rq1u3zrxvB',
        'TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW',
        1000000n
      );

      expect(tx.hash).toBe('trc20_txhash');
    });

    test('returns minimal response when tx not yet fetchable', async () => {
      mockTransfer.mockResolvedValue('trc20_pending');
      mockTrx.getTransaction.mockResolvedValue(null);

      const tx = await signer.sendTRC20(
        'TVYbkhF1S8agaBBpNtbK5mf3Rq1u3zrxvB',
        'TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW',
        500000n
      );

      expect(tx.hash).toBe('trc20_pending');
      expect(typeof tx.wait).toBe('function');
    });

    test('handles object txResult from TronWeb', async () => {
      mockTransfer.mockResolvedValue({ txID: 'obj_tx' });
      mockTrx.getTransaction.mockResolvedValue({
        txID: 'obj_tx',
        raw_data: {
          contract: [{ parameter: { value: { owner_address: '41742d35Cc6634C0532925a3b844Bc9e7595f2bD28' } } }],
          timestamp: 1700000000000,
        },
      });

      const tx = await signer.sendTRC20(
        'TVYbkhF1S8agaBBpNtbK5mf3Rq1u3zrxvB',
        'TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW',
        100n
      );
      expect(tx.hash).toBe('obj_tx');
    });

    test('throws on transfer failure', async () => {
      mockTransfer.mockRejectedValue(new Error('REVERT opcode executed'));

      await expect(
        signer.sendTRC20(
          'TVYbkhF1S8agaBBpNtbK5mf3Rq1u3zrxvB',
          'TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW',
          100n
        )
      ).rejects.toThrow(TronAdapterError);
    });
  });

  // ─── signMessage errors ─────────────────────────────────────────

  describe('signMessage error handling', () => {
    test('throws normalized error on sign failure', async () => {
      mockTrx.signMessageV2.mockRejectedValue(new Error('signing failed'));

      await expect(signer.signMessage('hello')).rejects.toThrow(TronAdapterError);
    });
  });

  // ─── sendTransaction value=0 ───────────────────────────────────

  describe('sendTransaction — zero value', () => {
    test('sends 0 TRX when no value specified', async () => {
      mockTransactionBuilder.sendTrx.mockResolvedValue({ txID: 'zero_tx' });
      mockTrx.sign.mockResolvedValue({ txID: 'zero_tx' });
      mockTrx.sendRawTransaction.mockResolvedValue({ result: true, txid: 'zero_tx' });

      const tx = await signer.sendTransaction({
        to: 'TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW',
      });

      expect(tx.hash).toBe('zero_tx');
      expect(mockTransactionBuilder.sendTrx).toHaveBeenCalledWith(
        expect.any(String),
        0
      );
    });
  });
});
