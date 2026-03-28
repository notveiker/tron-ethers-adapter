/**
 * Tests for TronContract event methods:
 *   queryFilter, on, off, once, removeAllListeners
 */

// ─── Mock TronWeb ────────────────────────────────────────────────────

const mockTrx = {
  getCurrentBlock: jest.fn(),
};

const mockTronWebInstance = {
  trx: mockTrx,
  transactionBuilder: {},
  defaultAddress: {
    base58: 'TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW',
    hex: '41742d35Cc6634C0532925a3b844Bc9e7595f2bD28',
  },
  address: {
    fromHex: jest.fn((hex: string) => 'T' + hex.slice(2, 35)),
    toHex:   jest.fn(() => '41742d35Cc6634C0532925a3b844Bc9e7595f2bD28'),
  },
  contract: jest.fn().mockReturnValue({
    // Returns a mock ABI contract instance when called with (abi, address)
  }),
  getEventResult: jest.fn(),
};

jest.mock('tronweb', () => jest.fn().mockImplementation(() => mockTronWebInstance));

import { TronProvider } from '../src/provider';
import { TronContract } from '../src/contract';

const ERC20_ABI = [
  { type: 'function', name: 'transfer', stateMutability: 'nonpayable', inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] },
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'event', name: 'Transfer', inputs: [{ name: 'from', type: 'address', indexed: true }, { name: 'to', type: 'address', indexed: true }, { name: 'value', type: 'uint256', indexed: false }] },
  { type: 'event', name: 'Approval', inputs: [{ name: 'owner', type: 'address', indexed: true }, { name: 'spender', type: 'address', indexed: true }, { name: 'value', type: 'uint256', indexed: false }] },
];

const CONTRACT_ADDR = 'TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW';

// ─── queryFilter ──────────────────────────────────────────────────────

describe('TronContract.queryFilter', () => {
  let provider: TronProvider;
  let contract: TronContract;

  beforeEach(() => {
    jest.clearAllMocks();
    provider = new TronProvider('nile');
    contract = new TronContract(CONTRACT_ADDR, ERC20_ABI, provider);
  });

  test('returns decoded Transfer events', async () => {
    mockTronWebInstance.getEventResult.mockResolvedValue([
      {
        block: 1000,
        transaction: 'txhash1',
        result: { 0: 'TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW', 1: 'TRFLnGjSxGdNNq6LNqgBvfJMQhiHEPqHib', 2: '1000000' },
        raw: { topics: ['0xddf252ad'], data: '' },
      },
    ]);

    const events = await contract.queryFilter('Transfer');

    expect(events).toHaveLength(1);
    expect(events[0].event).toBe('Transfer');
    expect(events[0].blockNumber).toBe(1000);
    expect(events[0].transactionHash).toBe('txhash1');
    expect(events[0].args).toBeDefined();
  });

  test('passes event name to getEventResult options', async () => {
    mockTronWebInstance.getEventResult.mockResolvedValue([]);
    await contract.queryFilter('Approval');

    const callArgs = mockTronWebInstance.getEventResult.mock.calls[0];
    expect(callArgs[1].eventName).toBe('Approval');
  });

  test('passes block range to getEventResult', async () => {
    mockTronWebInstance.getEventResult.mockResolvedValue([]);
    await contract.queryFilter('Transfer', 500, 1000);

    const callArgs = mockTronWebInstance.getEventResult.mock.calls[0];
    expect(callArgs[1].minBlockNumber).toBe(500);
    expect(callArgs[1].maxBlockNumber).toBe(1000);
  });

  test('accepts event object as first arg', async () => {
    mockTronWebInstance.getEventResult.mockResolvedValue([]);
    await contract.queryFilter({ name: 'Transfer' });

    const callArgs = mockTronWebInstance.getEventResult.mock.calls[0];
    expect(callArgs[1].eventName).toBe('Transfer');
  });

  test('returns empty array when no events found', async () => {
    mockTronWebInstance.getEventResult.mockResolvedValue([]);
    const events = await contract.queryFilter('Transfer');
    expect(events).toEqual([]);
  });

  test('decodes named params from ABI', async () => {
    mockTronWebInstance.getEventResult.mockResolvedValue([
      {
        block: 1,
        transaction: 'tx1',
        result: { from: 'addr1', to: 'addr2', value: '500' },
        raw: { topics: [], data: '' },
      },
    ]);

    const events = await contract.queryFilter('Transfer');
    expect(events[0].args['from']).toBe('addr1');
    expect(events[0].args['to']).toBe('addr2');
    expect(events[0].args['value']).toBe('500');
  });
});

// ─── on / off / once ─────────────────────────────────────────────────

describe('TronContract event subscription', () => {
  let provider: TronProvider;
  let contract: TronContract;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    provider = new TronProvider('nile');
    contract = new TronContract(CONTRACT_ADDR, ERC20_ABI, provider);

    mockTrx.getCurrentBlock.mockResolvedValue({
      block_header: { raw_data: { number: 100 } },
    });
    mockTronWebInstance.getEventResult.mockResolvedValue([]);
  });

  afterEach(() => {
    contract.removeAllListeners();
    jest.useRealTimers();
  });

  test('on() registers listener and returns contract (chainable)', () => {
    const listener = jest.fn();
    const result = contract.on('Transfer', listener);
    expect(result).toBe(contract); // chainable
  });

  test('off() with listener removes only that listener', () => {
    const listener1 = jest.fn();
    const listener2 = jest.fn();
    contract.on('Transfer', listener1);
    contract.on('Transfer', listener2);
    contract.off('Transfer', listener1);

    // listener2 should still be registered
    expect((contract as any)._eventListeners.get('Transfer')?.size).toBe(1);
    expect((contract as any)._eventListeners.get('Transfer')?.has(listener2)).toBe(true);
  });

  test('off() without listener removes all listeners for event', () => {
    const listener1 = jest.fn();
    const listener2 = jest.fn();
    contract.on('Transfer', listener1);
    contract.on('Transfer', listener2);
    contract.off('Transfer');

    expect((contract as any)._eventListeners.has('Transfer')).toBe(false);
  });

  test('removeAllListeners() clears all events', () => {
    contract.on('Transfer', jest.fn());
    contract.on('Approval', jest.fn());
    contract.removeAllListeners();

    expect((contract as any)._eventListeners.size).toBe(0);
    expect((contract as any)._eventPollers.size).toBe(0);
  });

  test('once() fires listener exactly once', async () => {
    const listener = jest.fn();
    contract.once('Transfer', listener);

    // Simulate two polling cycles that each emit one event
    const mockEvent = {
      block: 101,
      transaction: 'tx1',
      result: { from: 'A', to: 'B', value: '100' },
      raw: { topics: [], data: '' },
    };

    // First cycle
    mockTrx.getCurrentBlock.mockResolvedValueOnce({ block_header: { raw_data: { number: 101 } } });
    mockTronWebInstance.getEventResult.mockResolvedValueOnce([mockEvent]);

    await jest.runAllTimersAsync();

    // Second cycle
    mockTrx.getCurrentBlock.mockResolvedValueOnce({ block_header: { raw_data: { number: 102 } } });
    mockTronWebInstance.getEventResult.mockResolvedValueOnce([mockEvent]);

    await jest.runAllTimersAsync();

    // Listener should have been auto-removed after first call
    expect(listener).toHaveBeenCalledTimes(1);
  });

  test('on() returns this for chaining', () => {
    const l = jest.fn();
    expect(contract.on('Transfer', l).on('Approval', l)).toBe(contract);
  });
});
