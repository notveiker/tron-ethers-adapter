/**
 * Tests for TronContract
 *
 * Covers: dynamic method proxying, read vs write dispatch,
 * contract deployment, connect/attach pattern, overrides handling,
 * result normalization, and error cases.
 */

const mockMethodCall = jest.fn();
const mockMethodSend = jest.fn();

const mockContractInstance = {
  methods: {
    name: jest.fn().mockReturnValue({ call: mockMethodCall }),
    symbol: jest.fn().mockReturnValue({ call: mockMethodCall }),
    balanceOf: jest.fn().mockReturnValue({ call: mockMethodCall }),
    transfer: jest.fn().mockReturnValue({ send: mockMethodSend }),
    approve: jest.fn().mockReturnValue({ send: mockMethodSend }),
  },
};

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
  contract: jest.fn().mockResolvedValue(mockContractInstance),
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
import { TronContract } from '../src/contract';
import { TronAdapterError } from '../src/utils/errors';

const ERC20_ABI = [
  { type: 'function', name: 'name', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'string' }] },
  { type: 'function', name: 'symbol', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'string' }] },
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'transfer', stateMutability: 'nonpayable', inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] },
  { type: 'function', name: 'approve', stateMutability: 'nonpayable', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] },
  { type: 'event', name: 'Transfer', inputs: [{ name: 'from', type: 'address', indexed: true }] },
];

const PRIV_KEY = 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';
const TOKEN_ADDR = 'TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW';

describe('TronContract', () => {
  let provider: TronProvider;
  let signer: TronSigner;

  beforeEach(() => {
    jest.clearAllMocks();
    provider = new TronProvider('nile');
    signer = new TronSigner(PRIV_KEY, provider);
  });

  // ─── Constructor ────────────────────────────────────────────────

  describe('constructor', () => {
    test('creates contract with provider (read-only)', () => {
      const contract = new TronContract(TOKEN_ADDR, ERC20_ABI, provider);
      expect(contract.address).toBeTruthy();
      expect(contract.signer).toBeNull();
    });

    test('creates contract with signer', () => {
      const contract = new TronContract(TOKEN_ADDR, ERC20_ABI, signer);
      expect(contract.signer).toBe(signer);
    });

    test('dynamically creates view method proxies', () => {
      const contract = new TronContract(TOKEN_ADDR, ERC20_ABI, provider);
      expect(typeof contract.name).toBe('function');
      expect(typeof contract.symbol).toBe('function');
      expect(typeof contract.balanceOf).toBe('function');
    });

    test('dynamically creates write method proxies', () => {
      const contract = new TronContract(TOKEN_ADDR, ERC20_ABI, signer);
      expect(typeof contract.transfer).toBe('function');
      expect(typeof contract.approve).toBe('function');
    });

    test('does not create proxies for events (only functions)', () => {
      const contract = new TronContract(TOKEN_ADDR, ERC20_ABI, provider);
      // 'Transfer' is an event, not a function — should not be proxied
      // It won't exist as a callable method
      expect(typeof contract.Transfer).toBe('undefined');
    });
  });

  // ─── View/Read Methods ─────────────────────────────────────────

  describe('view methods (read-only calls)', () => {
    test('calls view function and returns result', async () => {
      mockMethodCall.mockResolvedValue('TestToken');

      const contract = new TronContract(TOKEN_ADDR, ERC20_ABI, provider);
      const name = await contract.name();
      expect(name).toBe('TestToken');
    });

    test('calls view function with arguments', async () => {
      mockMethodCall.mockResolvedValue({ toString: () => '1000000', _isBigNumber: true });

      const contract = new TronContract(TOKEN_ADDR, ERC20_ABI, provider);
      const balance = await contract.balanceOf('TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW');

      expect(balance).toBe(1000000n);
    });

    test('normalizes BigNumber results to bigint', async () => {
      mockMethodCall.mockResolvedValue({ _isBigNumber: true, toString: () => '999' });

      const contract = new TronContract(TOKEN_ADDR, ERC20_ABI, provider);
      const result = await contract.balanceOf('TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW');
      expect(result).toBe(999n);
    });

    test('normalizes toNumber-style results', async () => {
      mockMethodCall.mockResolvedValue({ toNumber: () => 42, toString: () => '42' });

      const contract = new TronContract(TOKEN_ADDR, ERC20_ABI, provider);
      const result = await contract.balanceOf('T...');
      expect(result).toBe(42n);
    });

    test('returns null/undefined unchanged', async () => {
      mockMethodCall.mockResolvedValue(null);

      const contract = new TronContract(TOKEN_ADDR, ERC20_ABI, provider);
      const result = await contract.name();
      expect(result).toBeNull();
    });

    test('throws normalized error on call failure', async () => {
      mockMethodCall.mockRejectedValue(new Error('REVERT opcode executed'));

      const contract = new TronContract(TOKEN_ADDR, ERC20_ABI, provider);
      await expect(contract.name()).rejects.toThrow(TronAdapterError);
    });
  });

  // ─── Write Methods ─────────────────────────────────────────────

  describe('write methods (state-mutating calls)', () => {
    test('sends transaction and returns response', async () => {
      mockMethodSend.mockResolvedValue('write_txhash');

      const contract = new TronContract(TOKEN_ADDR, ERC20_ABI, signer);
      const tx = await contract.transfer('TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW', 100);

      expect(tx.hash).toBe('write_txhash');
      expect(typeof tx.wait).toBe('function');
      expect(tx.from).toBe('TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW');
    });

    test('handles object txResult', async () => {
      mockMethodSend.mockResolvedValue({ txID: 'obj_write_tx' });

      const contract = new TronContract(TOKEN_ADDR, ERC20_ABI, signer);
      const tx = await contract.transfer('T...', 50);
      expect(tx.hash).toBe('obj_write_tx');
    });

    test('throws when calling write method on read-only contract', async () => {
      const contract = new TronContract(TOKEN_ADDR, ERC20_ABI, provider);
      await expect(contract.transfer('T...', 100)).rejects.toThrow(TronAdapterError);
      await expect(contract.transfer('T...', 100)).rejects.toThrow(/read-only/);
    });

    test('accepts ethers-style overrides as last argument', async () => {
      mockMethodSend.mockResolvedValue('override_tx');

      const contract = new TronContract(TOKEN_ADDR, ERC20_ABI, signer);
      const tx = await contract.transfer('T...', 100, { gasLimit: 500_000_000n });

      expect(tx.hash).toBe('override_tx');
      expect(mockMethodSend).toHaveBeenCalledWith(
        expect.objectContaining({ feeLimit: 500_000_000 })
      );
    });

    test('passes callValue from overrides.value', async () => {
      mockMethodSend.mockResolvedValue('payable_tx');

      const contract = new TronContract(TOKEN_ADDR, ERC20_ABI, signer);
      await contract.transfer('T...', 100, { value: 1_000_000 });

      expect(mockMethodSend).toHaveBeenCalledWith(
        expect.objectContaining({ callValue: 1_000_000 })
      );
    });

    test('throws normalized error on send failure', async () => {
      mockMethodSend.mockRejectedValue(new Error('balance is not sufficient'));

      const contract = new TronContract(TOKEN_ADDR, ERC20_ABI, signer);
      await expect(contract.transfer('T...', 100)).rejects.toThrow(TronAdapterError);
    });
  });

  // ─── connect ────────────────────────────────────────────────────

  describe('connect', () => {
    test('returns new contract instance with signer', () => {
      const readOnly = new TronContract(TOKEN_ADDR, ERC20_ABI, provider);
      const writable = readOnly.connect(signer);

      expect(writable).not.toBe(readOnly);
      expect(writable.signer).toBe(signer);
      expect(typeof writable.transfer).toBe('function');
    });
  });

  // ─── attach ─────────────────────────────────────────────────────

  describe('attach', () => {
    test('returns new contract at different address', () => {
      const contract = new TronContract(TOKEN_ADDR, ERC20_ABI, provider);
      const attached = contract.attach('TVYbkhF1S8agaBBpNtbK5mf3Rq1u3zrxvB');

      expect(attached).not.toBe(contract);
      expect(attached.abi).toBe(contract.abi);
    });
  });

  // ─── deploy ─────────────────────────────────────────────────────

  describe('deploy', () => {
    test('deploys contract and returns new instance', async () => {
      mockTransactionBuilder.createSmartContract.mockResolvedValue({
        txID: 'deploy_tx',
        contract_address: '41000000000000000000000000000000000000beef',
      });
      mockTrx.sign.mockResolvedValue({ txID: 'deploy_tx' });
      mockTrx.sendRawTransaction.mockResolvedValue({ result: true });

      const contract = await TronContract.deploy(
        {
          abi: ERC20_ABI,
          bytecode: '0x608060405234801561001057600080fd5b50',
          constructorArgs: [],
        },
        signer
      );

      expect(contract).toBeInstanceOf(TronContract);
      expect(mockTransactionBuilder.createSmartContract).toHaveBeenCalled();
    });

    test('strips 0x from bytecode', async () => {
      mockTransactionBuilder.createSmartContract.mockResolvedValue({
        txID: 'deploy_tx2',
        contract_address: '41000000000000000000000000000000000000cafe',
      });
      mockTrx.sign.mockResolvedValue({ txID: 'deploy_tx2' });
      mockTrx.sendRawTransaction.mockResolvedValue({ result: true });

      await TronContract.deploy(
        { abi: ERC20_ABI, bytecode: '0xdeadbeef' },
        signer
      );

      expect(mockTransactionBuilder.createSmartContract).toHaveBeenCalledWith(
        expect.objectContaining({ bytecode: 'deadbeef' }),
        expect.any(String)
      );
    });

    test('throws on deployment broadcast failure', async () => {
      mockTransactionBuilder.createSmartContract.mockResolvedValue({
        txID: 'fail_deploy',
        contract_address: '41beef',
      });
      mockTrx.sign.mockResolvedValue({ txID: 'fail_deploy' });
      mockTrx.sendRawTransaction.mockResolvedValue({ result: false });

      await expect(
        TronContract.deploy({ abi: ERC20_ABI, bytecode: '0x60' }, signer)
      ).rejects.toThrow(TronAdapterError);
    });

    test('throws when contract address cannot be determined', async () => {
      mockTransactionBuilder.createSmartContract.mockResolvedValue({ txID: 'no_addr' });
      mockTrx.sign.mockResolvedValue({ txID: 'no_addr' });
      mockTrx.sendRawTransaction.mockResolvedValue({ result: true });
      mockTronWebInstance.address.fromHex.mockReturnValueOnce('');

      await expect(
        TronContract.deploy({ abi: ERC20_ABI, bytecode: '0x60' }, signer)
      ).rejects.toThrow(TronAdapterError);
    });
  });

  // ─── ABI with constant flag (legacy Solidity) ──────────────────

  describe('legacy ABI handling', () => {
    test('treats constant:true as view method', async () => {
      const legacyABI = [
        { type: 'function', name: 'legacyView', constant: true, inputs: [], outputs: [{ name: '', type: 'string' }] },
      ];

      mockMethodCall.mockResolvedValue('legacy_result');

      // Need contract mock to have legacyView method
      (mockContractInstance.methods as any).legacyView = jest.fn().mockReturnValue({ call: mockMethodCall });

      const contract = new TronContract(TOKEN_ADDR, legacyABI, provider);
      const result = await contract.legacyView();
      expect(result).toBe('legacy_result');
    });
  });
});
