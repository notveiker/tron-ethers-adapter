/**
 * Tests for src/utils/address.ts
 *
 * Tests cover:
 * - Address format detection (ETH hex, TRON hex, TRON base58)
 * - Hex conversion (ETH ↔ TRON 41-prefix)
 * - Validation
 * - Normalization with mocked TronWeb
 * - Cross-format equality checks
 */

import {
  detectAddressFormat,
  isValidAddress,
  ethHexToTronHex,
  tronHexToEthHex,
  toTronAddress,
  toEthAddress,
  addressesEqual,
} from '../src/utils/address';
import { TronAdapterError } from '../src/utils/errors';

// ─── Test Data ──────────────────────────────────────────────────────

const VALID_ETH_HEX = '0x742d35Cc6634C0532925a3b844Bc9e7595f2bD28';
const VALID_TRON_HEX = '41742d35Cc6634C0532925a3b844Bc9e7595f2bD28';
const VALID_TRON_BASE58 = 'TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW';

// Mock TronWeb address conversion methods
const mockTronWeb = {
  address: {
    fromHex: jest.fn((hex: string) => {
      // Simplified mock: just return a base58-looking string
      if (hex.startsWith('41')) return 'T' + hex.slice(2, 35).replace(/[^1-9A-HJ-NP-Za-km-z]/g, 'a');
      return 'T' + hex.slice(0, 33).replace(/[^1-9A-HJ-NP-Za-km-z]/g, 'a');
    }),
    toHex: jest.fn((_base58: string) => {
      return VALID_TRON_HEX;
    }),
  },
};

// ─── detectAddressFormat ────────────────────────────────────────────

describe('detectAddressFormat', () => {
  test('detects valid Ethereum hex addresses', () => {
    expect(detectAddressFormat(VALID_ETH_HEX)).toBe('eth_hex');
    expect(detectAddressFormat('0x0000000000000000000000000000000000000000')).toBe('eth_hex');
    expect(detectAddressFormat('0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFF')).toBe('eth_hex');
  });

  test('detects valid TRON hex addresses (41 prefix)', () => {
    expect(detectAddressFormat(VALID_TRON_HEX)).toBe('tron_hex');
    expect(detectAddressFormat('410000000000000000000000000000000000000000')).toBe('tron_hex');
  });

  test('detects valid TRON base58 addresses', () => {
    expect(detectAddressFormat(VALID_TRON_BASE58)).toBe('tron_base58');
    expect(detectAddressFormat('TVYbkhF1S8agaBBpNtbK5mf3Rq1u3zrxvB')).toBe('tron_base58');
  });

  test('returns unknown for invalid addresses', () => {
    expect(detectAddressFormat('')).toBe('unknown');
    expect(detectAddressFormat('not_an_address')).toBe('unknown');
    expect(detectAddressFormat('0x')).toBe('unknown');
    expect(detectAddressFormat('0x123')).toBe('unknown'); // too short
    expect(detectAddressFormat('T')).toBe('unknown'); // too short
    expect(detectAddressFormat('B' + '1'.repeat(33))).toBe('unknown'); // wrong prefix
  });

  test('handles edge cases', () => {
    // Mixed case ETH hex
    expect(detectAddressFormat('0xAbCdEf0123456789AbCdEf0123456789AbCdEf01')).toBe('eth_hex');
  });
});

// ─── isValidAddress ─────────────────────────────────────────────────

describe('isValidAddress', () => {
  test('returns true for valid addresses in any format', () => {
    expect(isValidAddress(VALID_ETH_HEX)).toBe(true);
    expect(isValidAddress(VALID_TRON_HEX)).toBe(true);
    expect(isValidAddress(VALID_TRON_BASE58)).toBe(true);
  });

  test('returns false for invalid addresses', () => {
    expect(isValidAddress('')).toBe(false);
    expect(isValidAddress('hello')).toBe(false);
    expect(isValidAddress('0x123')).toBe(false);
  });
});

// ─── ethHexToTronHex ────────────────────────────────────────────────

describe('ethHexToTronHex', () => {
  test('converts 0x prefix to 41 prefix', () => {
    const result = ethHexToTronHex(VALID_ETH_HEX);
    expect(result).toBe(VALID_TRON_HEX);
    expect(result.startsWith('41')).toBe(true);
    expect(result.length).toBe(42); // 41 prefix + 40 hex chars
  });

  test('throws for invalid ETH hex addresses', () => {
    expect(() => ethHexToTronHex('not_an_address')).toThrow(TronAdapterError);
    expect(() => ethHexToTronHex('0x123')).toThrow(TronAdapterError);
    expect(() => ethHexToTronHex('')).toThrow(TronAdapterError);
  });
});

// ─── tronHexToEthHex ────────────────────────────────────────────────

describe('tronHexToEthHex', () => {
  test('converts 41 prefix to 0x prefix', () => {
    const result = tronHexToEthHex(VALID_TRON_HEX);
    expect(result).toBe(VALID_ETH_HEX);
    expect(result.startsWith('0x')).toBe(true);
    expect(result.length).toBe(42); // 0x prefix + 40 hex chars
  });

  test('throws for invalid TRON hex addresses', () => {
    expect(() => tronHexToEthHex('not_an_address')).toThrow(TronAdapterError);
    expect(() => tronHexToEthHex(VALID_ETH_HEX)).toThrow(TronAdapterError); // 0x is not 41
    expect(() => tronHexToEthHex('')).toThrow(TronAdapterError);
  });
});

// ─── Roundtrip Conversion ───────────────────────────────────────────

describe('hex conversion roundtrip', () => {
  test('ETH → TRON → ETH produces original address', () => {
    const tronHex = ethHexToTronHex(VALID_ETH_HEX);
    const ethHex = tronHexToEthHex(tronHex);
    expect(ethHex).toBe(VALID_ETH_HEX);
  });

  test('roundtrip preserves address bytes for random addresses', () => {
    const addresses = [
      '0x0000000000000000000000000000000000000001',
      '0xdead000000000000000000000000000000000000',
      '0xAbCdEf0123456789AbCdEf0123456789AbCdEf01',
    ];

    for (const addr of addresses) {
      const tronHex = ethHexToTronHex(addr);
      const roundtripped = tronHexToEthHex(tronHex);
      expect(roundtripped.toLowerCase()).toBe(addr.toLowerCase());
    }
  });
});

// ─── toTronAddress (requires TronWeb mock) ──────────────────────────

describe('toTronAddress', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns base58 unchanged', () => {
    const result = toTronAddress(VALID_TRON_BASE58, mockTronWeb);
    expect(result).toBe(VALID_TRON_BASE58);
    expect(mockTronWeb.address.fromHex).not.toHaveBeenCalled();
  });

  test('converts ETH hex via TronWeb', () => {
    toTronAddress(VALID_ETH_HEX, mockTronWeb);
    expect(mockTronWeb.address.fromHex).toHaveBeenCalledWith(VALID_TRON_HEX);
  });

  test('converts TRON hex via TronWeb', () => {
    toTronAddress(VALID_TRON_HEX, mockTronWeb);
    expect(mockTronWeb.address.fromHex).toHaveBeenCalledWith(VALID_TRON_HEX);
  });

  test('throws for invalid addresses', () => {
    expect(() => toTronAddress('invalid', mockTronWeb)).toThrow(TronAdapterError);
  });
});

// ─── toEthAddress (requires TronWeb mock) ───────────────────────────

describe('toEthAddress', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns ETH hex lowercased', () => {
    const result = toEthAddress(VALID_ETH_HEX, mockTronWeb);
    expect(result).toBe(VALID_ETH_HEX.toLowerCase());
  });

  test('converts TRON hex to ETH hex', () => {
    const result = toEthAddress(VALID_TRON_HEX, mockTronWeb);
    expect(result.startsWith('0x')).toBe(true);
    expect(result).toBe(VALID_ETH_HEX.toLowerCase());
  });

  test('converts TRON base58 via TronWeb', () => {
    toEthAddress(VALID_TRON_BASE58, mockTronWeb);
    expect(mockTronWeb.address.toHex).toHaveBeenCalledWith(VALID_TRON_BASE58);
  });

  test('throws for invalid addresses', () => {
    expect(() => toEthAddress('invalid', mockTronWeb)).toThrow(TronAdapterError);
  });
});

// ─── addressesEqual ─────────────────────────────────────────────────

describe('addressesEqual', () => {
  test('matching addresses in same format are equal', () => {
    expect(addressesEqual(VALID_TRON_HEX, VALID_TRON_HEX, mockTronWeb)).toBe(true);
    expect(addressesEqual(VALID_ETH_HEX, VALID_ETH_HEX, mockTronWeb)).toBe(true);
  });

  test('matching addresses across formats are equal', () => {
    expect(addressesEqual(VALID_ETH_HEX, VALID_TRON_HEX, mockTronWeb)).toBe(true);
  });

  test('returns false for different addresses', () => {
    const other = '0x0000000000000000000000000000000000000001';
    expect(addressesEqual(VALID_ETH_HEX, other, mockTronWeb)).toBe(false);
  });

  test('returns false for invalid addresses without throwing', () => {
    expect(addressesEqual('invalid', VALID_ETH_HEX, mockTronWeb)).toBe(false);
  });
});
