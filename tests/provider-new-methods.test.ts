/**
 * Tests for new TronProvider methods:
 *   getNetwork, call, estimateGas, getFeeData, getLogs, waitForTransaction
 */

// ─── Mock TronWeb ────────────────────────────────────────────────────

const mockTrx = {
  getChainParameters: jest.fn(),
  getCurrentBlock:    jest.fn(),
  getTransactionInfo: jest.fn(),
};

const mockTransactionBuilder = {
  triggerConstantContract: jest.fn(),
};

const mockTronWebInstance = {
  trx: mockTrx,
  transactionBuilder: mockTransactionBuilder,
  defaultAddress: {
    base58: 'TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW',
    hex: '41742d35Cc6634C0532925a3b844Bc9e7595f2bD28',
  },
  address: {
    fromHex: jest.fn((hex: string) => 'T' + hex.slice(2, 35)),
    toHex: jest.fn(() => '41742d35Cc6634C0532925a3b844Bc9e7595f2bD28'),
  },
  getEventResult: jest.fn(),
};

jest.mock('tronweb', () => jest.fn().mockImplementation(() => mockTronWebInstance));

import { TronProvider } from '../src/provider';
import { TronAdapterError } from '../src/utils/errors';
import { CHAIN_IDS } from '../src/types';

// ─── getNetwork ──────────────────────────────────────────────────────

describe('TronProvider.getNetwork', () => {
  let provider: TronProvider;

  beforeEach(() => {
    jest.clearAllMocks();
    provider = new TronProvider('nile');
  });

  test('returns nile network info with correct chainId', async () => {
    const network = await provider.getNetwork();
    expect(network.name).toBe('nile');
    expect(network.chainId).toBe(BigInt(CHAIN_IDS['nile']));
    expect(network.chainId).toBe(3448148188n);
  });

  test('returns mainnet chainId', async () => {
    const p = new TronProvider('mainnet');
    const network = await p.getNetwork();
    expect(network.chainId).toBe(728126428n);
  });

  test('returns shasta chainId', async () => {
    const p = new TronProvider('shasta');
    const network = await p.getNetwork();
    expect(network.chainId).toBe(2494104990n);
  });

  test('returns 0n chainId for unknown custom network', async () => {
    const p = new TronProvider({ network: { name: 'private', fullHost: 'http://localhost:9090' } });
    const network = await p.getNetwork();
    expect(network.chainId).toBe(0n);
  });
});

// ─── call ─────────────────────────────────────────────────────────────

describe('TronProvider.call', () => {
  let provider: TronProvider;

  beforeEach(() => {
    jest.clearAllMocks();
    provider = new TronProvider('nile');
  });

  test('returns hex result from triggerConstantContract', async () => {
    mockTransactionBuilder.triggerConstantContract.mockResolvedValue({
      constant_result: ['000000000000000000000000000000000000000000000000000000000000002a'],
      energy_used: 500,
    });

    const result = await provider.call({
      to: 'TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW',
      data: '0x70a08231000000000000000000000000742d35cc6634c0532925a3b844bc9e7595f2bd28',
    });

    expect(result).toBe('0x000000000000000000000000000000000000000000000000000000000000002a');
    expect(mockTransactionBuilder.triggerConstantContract).toHaveBeenCalledTimes(1);
  });

  test('strips 0x prefix from data before sending', async () => {
    mockTransactionBuilder.triggerConstantContract.mockResolvedValue({
      constant_result: ['deadbeef'],
    });

    await provider.call({
      to: 'TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW',
      data: '0xdeadbeef',
    });

    const callArgs = mockTransactionBuilder.triggerConstantContract.mock.calls[0];
    expect(callArgs[2].rawParameter).toBe('deadbeef');
  });

  test('returns 0x when constant_result is empty', async () => {
    mockTransactionBuilder.triggerConstantContract.mockResolvedValue({
      constant_result: [],
    });

    const result = await provider.call({ to: 'TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW' });
    expect(result).toBe('0x');
  });

  test('throws INVALID_ARGUMENT when to is missing', async () => {
    await expect(provider.call({})).rejects.toThrow(TronAdapterError);
    await expect(provider.call({})).rejects.toMatchObject({
      code: 'INVALID_ARGUMENT',
    });
  });

  test('passes callValue when value is provided', async () => {
    mockTransactionBuilder.triggerConstantContract.mockResolvedValue({ constant_result: [] });
    await provider.call({ to: 'TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW', value: 1_000_000n });
    const callArgs = mockTransactionBuilder.triggerConstantContract.mock.calls[0];
    expect(callArgs[2].callValue).toBe(1000000);
  });
});

// ─── estimateGas ─────────────────────────────────────────────────────

describe('TronProvider.estimateGas', () => {
  let provider: TronProvider;

  beforeEach(() => {
    jest.clearAllMocks();
    provider = new TronProvider('nile');
  });

  test('returns energy_used as bigint', async () => {
    mockTransactionBuilder.triggerConstantContract.mockResolvedValue({
      constant_result: [''],
      energy_used: 12345,
    });

    const gas = await provider.estimateGas({
      to: 'TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW',
      data: '0xa9059cbb',
    });

    expect(gas).toBe(12345n);
  });

  test('returns 0n when energy_used is absent (plain TRX transfer)', async () => {
    mockTransactionBuilder.triggerConstantContract.mockResolvedValue({
      constant_result: [''],
      // energy_used missing — plain transfer
    });

    const gas = await provider.estimateGas({ to: 'TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW' });
    expect(gas).toBe(0n);
  });

  test('throws INVALID_ARGUMENT when to is missing', async () => {
    await expect(provider.estimateGas({})).rejects.toMatchObject({
      code: 'INVALID_ARGUMENT',
    });
  });

  test('throws normalized error on network failure', async () => {
    mockTransactionBuilder.triggerConstantContract.mockRejectedValue(
      new Error('balance is not sufficient')
    );

    await expect(
      provider.estimateGas({ to: 'TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW' })
    ).rejects.toThrow(TronAdapterError);
  });
});

// ─── getFeeData ───────────────────────────────────────────────────────

describe('TronProvider.getFeeData', () => {
  let provider: TronProvider;

  beforeEach(() => {
    jest.clearAllMocks();
    provider = new TronProvider('nile');
  });

  test('returns energyPrice and bandwidthPrice from chain params', async () => {
    mockTrx.getChainParameters.mockResolvedValue([
      { key: 'getEnergyFee', value: 420 },
      { key: 'getTransactionFee', value: 1000 },
    ]);

    const feeData = await provider.getFeeData();
    expect(feeData.energyPrice).toBe(420n);
    expect(feeData.bandwidthPrice).toBe(1000n);
    expect(feeData.gasPrice).toBe(420n);  // alias
    expect(feeData.maxFeePerGas).toBeNull();
    expect(feeData.maxPriorityFeePerGas).toBeNull();
  });

  test('uses sensible defaults when params are missing', async () => {
    mockTrx.getChainParameters.mockResolvedValue([]);

    const feeData = await provider.getFeeData();
    expect(feeData.energyPrice).toBe(420n);    // default
    expect(feeData.bandwidthPrice).toBe(1000n); // default
  });

  test('handles non-array response gracefully', async () => {
    mockTrx.getChainParameters.mockResolvedValue(null);
    const feeData = await provider.getFeeData();
    expect(feeData.energyPrice).toBe(420n);
  });

  test('throws normalized error on RPC failure', async () => {
    mockTrx.getChainParameters.mockRejectedValue(new Error('timeout'));
    await expect(provider.getFeeData()).rejects.toThrow(TronAdapterError);
  });
});

// ─── getLogs ─────────────────────────────────────────────────────────

describe('TronProvider.getLogs', () => {
  let provider: TronProvider;

  beforeEach(() => {
    jest.clearAllMocks();
    provider = new TronProvider('nile');
  });

  test('returns normalized logs from getEventResult', async () => {
    mockTronWebInstance.getEventResult.mockResolvedValue([
      {
        contract: 'TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW',
        block: 100,
        transaction: 'txhash1',
        raw: {
          topics: ['0xddf252ad'],
          data: 'aabbcc',
        },
      },
    ]);

    const logs = await provider.getLogs({
      address: 'TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW',
    });

    expect(logs).toHaveLength(1);
    expect(logs[0].blockNumber).toBe(100);
    expect(logs[0].transactionHash).toBe('txhash1');
    expect(logs[0].data).toBe('0xaabbcc');
    expect(logs[0].topics).toEqual(['0xddf252ad']);
  });

  test('passes fromBlock and toBlock to event API', async () => {
    mockTronWebInstance.getEventResult.mockResolvedValue([]);

    await provider.getLogs({
      address: 'TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW',
      fromBlock: 500,
      toBlock: 600,
    });

    const callArgs = mockTronWebInstance.getEventResult.mock.calls[0];
    expect(callArgs[1].minBlockNumber).toBe(500);
    expect(callArgs[1].maxBlockNumber).toBe(600);
  });

  test('returns empty array when no events', async () => {
    mockTronWebInstance.getEventResult.mockResolvedValue([]);
    const logs = await provider.getLogs({ address: 'TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW' });
    expect(logs).toEqual([]);
  });

  test('returns empty array when result is not an array', async () => {
    mockTronWebInstance.getEventResult.mockResolvedValue(null);
    const logs = await provider.getLogs({ address: 'TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW' });
    expect(logs).toEqual([]);
  });

  test('throws INVALID_ARGUMENT when address is missing', async () => {
    await expect(provider.getLogs({})).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
  });
});

// ─── waitForTransaction (public) ─────────────────────────────────────

describe('TronProvider.waitForTransaction', () => {
  let provider: TronProvider;

  beforeEach(() => {
    jest.clearAllMocks();
    provider = new TronProvider('nile');
  });

  test('returns receipt when transaction confirms', async () => {
    mockTrx.getTransactionInfo.mockResolvedValue({
      id: 'txhash1',
      blockNumber: 100,
      receipt: { result: 'SUCCESS', energy_usage_total: 500 },
      log: [],
    });

    // getTransactionInfo is called inside getTransactionReceipt
    // We also need to mock getTransaction for the receipt normalization
    const mockGetTransaction = jest.fn().mockResolvedValue({
      txID: 'txhash1',
      raw_data: { contract: [] },
    });
    (provider as any).tronWeb.trx.getTransaction = mockGetTransaction;

    const receipt = await provider.waitForTransaction('txhash1', 5, 1);
    expect(receipt.hash).toBe('txhash1');
    expect(receipt.status).toBe(1);
  });

  test('is callable as a public method (no bracket access needed)', () => {
    // Verify it is a proper public method
    expect(typeof provider.waitForTransaction).toBe('function');
  });

  test('throws TIMEOUT after max attempts', async () => {
    mockTrx.getTransactionInfo.mockResolvedValue({});

    await expect(
      provider.waitForTransaction('missingtx', 2, 1)
    ).rejects.toMatchObject({ code: 'TIMEOUT' });
  });
});

// ─── CHAIN_IDS constant ───────────────────────────────────────────────

describe('CHAIN_IDS', () => {
  test('mainnet chain ID is correct', () => {
    expect(CHAIN_IDS['mainnet']).toBe(728126428);
  });

  test('shasta chain ID is correct', () => {
    expect(CHAIN_IDS['shasta']).toBe(2494104990);
  });

  test('nile chain ID is correct', () => {
    expect(CHAIN_IDS['nile']).toBe(3448148188);
  });
});
