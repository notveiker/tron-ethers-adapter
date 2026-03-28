/**
 * Tests for TronSigner.signTypedData — EIP-712 / TIP-712 support.
 */

// ─── Mock TronWeb ────────────────────────────────────────────────────

const mockTrx = {
  signMessageV2:  jest.fn(),
  signTypedData:  jest.fn(),
};

const mockTronWebInstance = {
  trx: mockTrx,
  defaultAddress: {
    base58: 'TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW',
    hex: '41742d35Cc6634C0532925a3b844Bc9e7595f2bD28',
  },
  address: {
    fromHex: jest.fn((hex: string) => 'T' + hex.slice(2, 35)),
    toHex:   jest.fn(() => '41742d35Cc6634C0532925a3b844Bc9e7595f2bD28'),
  },
};

jest.mock('tronweb', () => jest.fn().mockImplementation(() => mockTronWebInstance));

import { TronProvider } from '../src/provider';
import { TronSigner } from '../src/signer';
import { TronAdapterError } from '../src/utils/errors';
import { CHAIN_IDS } from '../src/types';

const TEST_PRIVATE_KEY = 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef1234567890';

const TEST_DOMAIN = {
  name: 'MyToken',
  version: '1',
  chainId: CHAIN_IDS['nile'],
  verifyingContract: 'TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW',
};

const TEST_TYPES = {
  Permit: [
    { name: 'owner',    type: 'address' },
    { name: 'spender',  type: 'address' },
    { name: 'value',    type: 'uint256' },
    { name: 'nonce',    type: 'uint256' },
    { name: 'deadline', type: 'uint256' },
  ],
};

const TEST_VALUE = {
  owner:    'TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW',
  spender:  'TRFLnGjSxGdNNq6LNqgBvfJMQhiHEPqHib',
  value:    1000000n,
  nonce:    0n,
  deadline: 9999999999n,
};

describe('TronSigner.signTypedData', () => {
  let provider: TronProvider;
  let signer: TronSigner;

  beforeEach(() => {
    jest.clearAllMocks();
    provider = new TronProvider('nile');
    signer = new TronSigner(TEST_PRIVATE_KEY, provider);
  });

  test('calls tronWeb.trx.signTypedData with structured payload', async () => {
    mockTrx.signTypedData.mockResolvedValue('0xsignature_hex_value');

    const sig = await signer.signTypedData(TEST_DOMAIN, TEST_TYPES, TEST_VALUE);

    expect(sig).toBe('0xsignature_hex_value');
    expect(mockTrx.signTypedData).toHaveBeenCalledTimes(1);

    const [typedData] = mockTrx.signTypedData.mock.calls[0];
    expect(typedData.domain).toEqual(TEST_DOMAIN);
    expect(typedData.types).toEqual(TEST_TYPES);
    expect(typedData.message).toEqual(TEST_VALUE);
    expect(typedData.primaryType).toBe('Permit');
  });

  test('sets primaryType to first non-EIP712Domain key', async () => {
    mockTrx.signTypedData.mockResolvedValue('0xsig');

    const types = {
      EIP712Domain: [{ name: 'name', type: 'string' }],
      Transfer: [
        { name: 'from',  type: 'address' },
        { name: 'to',    type: 'address' },
        { name: 'value', type: 'uint256' },
      ],
    };

    await signer.signTypedData(TEST_DOMAIN, types, { from: 'T...', to: 'T...', value: 1n });

    const [typedData] = mockTrx.signTypedData.mock.calls[0];
    expect(typedData.primaryType).toBe('Transfer');
  });

  test('throws INVALID_ARGUMENT if tronWeb.trx.signTypedData is not available', async () => {
    // Simulate TronWeb < 5.3 which lacks signTypedData
    const tronWebWithoutTypedData = {
      ...mockTronWebInstance,
      trx: { signMessageV2: jest.fn() }, // no signTypedData
    };
    const TronWeb = require('tronweb');
    TronWeb.mockImplementationOnce(() => tronWebWithoutTypedData);

    const oldSigner = new TronSigner(TEST_PRIVATE_KEY, provider);

    await expect(
      oldSigner.signTypedData(TEST_DOMAIN, TEST_TYPES, TEST_VALUE)
    ).rejects.toMatchObject({ code: 'INVALID_ARGUMENT' });
  });

  test('wraps TronWeb errors as TronAdapterError', async () => {
    mockTrx.signTypedData.mockRejectedValue(new Error('invalid private key'));

    await expect(
      signer.signTypedData(TEST_DOMAIN, TEST_TYPES, TEST_VALUE)
    ).rejects.toThrow(TronAdapterError);
  });

  test('CHAIN_IDS values are usable in typed data domain', () => {
    expect(TEST_DOMAIN.chainId).toBe(3448148188);
    const mainnetDomain = { ...TEST_DOMAIN, chainId: CHAIN_IDS['mainnet'] };
    expect(mainnetDomain.chainId).toBe(728126428);
  });
});
