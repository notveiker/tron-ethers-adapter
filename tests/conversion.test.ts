/**
 * Tests for src/utils/conversion.ts
 *
 * All conversion functions are pure — no mocks needed.
 */

import {
  parseTRX,
  formatTRX,
  parseUnits,
  formatUnits,
  gasToFeeLimit,
  toBigInt,
  sunToNumber,
  SUN_PER_TRX,
  DEFAULT_FEE_LIMIT,
} from '../src/utils/conversion';
import { TronAdapterError } from '../src/utils/errors';

// ─── parseTRX ───────────────────────────────────────────────────────

describe('parseTRX', () => {
  test('parses whole TRX values', () => {
    expect(parseTRX('1')).toBe(1_000_000n);
    expect(parseTRX('100')).toBe(100_000_000n);
    expect(parseTRX('0')).toBe(0n);
  });

  test('parses fractional TRX values', () => {
    expect(parseTRX('1.5')).toBe(1_500_000n);
    expect(parseTRX('0.000001')).toBe(1n); // 1 SUN
    expect(parseTRX('1.123456')).toBe(1_123_456n);
  });

  test('truncates beyond 6 decimal places', () => {
    // 1.1234567 should truncate to 1.123456
    expect(parseTRX('1.1234567')).toBe(1_123_456n);
    expect(parseTRX('1.1234569999')).toBe(1_123_456n);
  });

  test('handles values with leading/trailing whitespace', () => {
    expect(parseTRX('  1.5  ')).toBe(1_500_000n);
  });

  test('handles large values', () => {
    expect(parseTRX('1000000')).toBe(1_000_000_000_000n);
  });

  test('throws for invalid inputs', () => {
    expect(() => parseTRX('')).toThrow(TronAdapterError);
    expect(() => parseTRX('1.2.3')).toThrow(TronAdapterError);
    expect(() => parseTRX('   ')).toThrow(TronAdapterError);
  });

  test('throws for non-string inputs', () => {
    expect(() => parseTRX(123 as any)).toThrow(TronAdapterError);
    expect(() => parseTRX(null as any)).toThrow(TronAdapterError);
  });

  test('parses negative values', () => {
    expect(parseTRX('-1')).toBe(-1_000_000n);
    expect(parseTRX('-1.5')).toBe(-1_500_000n);
    expect(parseTRX('-0.000001')).toBe(-1n);
  });
});

// ─── formatTRX ──────────────────────────────────────────────────────

describe('formatTRX', () => {
  test('formats whole TRX values', () => {
    expect(formatTRX(1_000_000n)).toBe('1');
    expect(formatTRX(100_000_000n)).toBe('100');
    expect(formatTRX(0n)).toBe('0');
  });

  test('formats fractional values', () => {
    expect(formatTRX(1_500_000n)).toBe('1.5');
    expect(formatTRX(1n)).toBe('0.000001');
    expect(formatTRX(1_123_456n)).toBe('1.123456');
  });

  test('strips trailing zeros', () => {
    expect(formatTRX(1_100_000n)).toBe('1.1');
    expect(formatTRX(1_000_100n)).toBe('1.0001');
  });

  test('handles negative values', () => {
    expect(formatTRX(-1_000_000n)).toBe('-1');
    expect(formatTRX(-1_500_000n)).toBe('-1.5');
  });
});

// ─── parseTRX ↔ formatTRX Roundtrip ─────────────────────────────────

describe('parseTRX ↔ formatTRX roundtrip', () => {
  const cases = ['0', '1', '1.5', '100', '0.000001', '1.123456', '999999.999999'];

  test.each(cases)('roundtrips "%s" correctly', (value) => {
    const parsed = parseTRX(value);
    const formatted = formatTRX(parsed);
    expect(formatted).toBe(value);
  });

  test('roundtrips negative values', () => {
    expect(formatTRX(parseTRX('-1.5'))).toBe('-1.5');
    expect(formatTRX(parseTRX('-0.000001'))).toBe('-0.000001');
  });
});

// ─── parseUnits / formatUnits ───────────────────────────────────────

describe('parseUnits', () => {
  test('parses with 6 decimals (TRX)', () => {
    expect(parseUnits('1.5', 6)).toBe(1_500_000n);
  });

  test('parses with 18 decimals (ETH-like)', () => {
    expect(parseUnits('1.0', 18)).toBe(1_000_000_000_000_000_000n);
  });

  test('parses with 0 decimals', () => {
    expect(parseUnits('100', 0)).toBe(100n);
  });

  test('truncates excess decimals', () => {
    expect(parseUnits('1.123456789', 6)).toBe(1_123_456n);
  });
});

describe('formatUnits', () => {
  test('formats with 6 decimals (TRX)', () => {
    expect(formatUnits(1_500_000n, 6)).toBe('1.5');
  });

  test('formats with 18 decimals (ETH-like)', () => {
    expect(formatUnits(1_000_000_000_000_000_000n, 18)).toBe('1');
  });

  test('formats with 0 decimals', () => {
    expect(formatUnits(100n, 0)).toBe('100');
  });
});

describe('parseUnits ↔ formatUnits roundtrip', () => {
  test('roundtrips for various decimal places', () => {
    expect(formatUnits(parseUnits('1.5', 6), 6)).toBe('1.5');
    expect(formatUnits(parseUnits('1.5', 18), 18)).toBe('1.5');
    expect(formatUnits(parseUnits('100', 0), 0)).toBe('100');
  });
});

// ─── gasToFeeLimit ──────────────────────────────────────────────────

describe('gasToFeeLimit', () => {
  test('returns default fee limit when no gas specified', () => {
    expect(gasToFeeLimit()).toBe(DEFAULT_FEE_LIMIT);
    expect(gasToFeeLimit(undefined)).toBe(DEFAULT_FEE_LIMIT);
  });

  test('converts bigint gas value', () => {
    expect(gasToFeeLimit(500_000_000n)).toBe(500_000_000);
  });

  test('converts string gas value', () => {
    expect(gasToFeeLimit('500000000')).toBe(500_000_000);
  });

  test('converts number gas value', () => {
    expect(gasToFeeLimit(500_000_000)).toBe(500_000_000);
  });

  test('caps at maximum fee limit (10,000 TRX)', () => {
    const veryLarge = 100_000_000_000n; // 100,000 TRX in SUN
    const result = gasToFeeLimit(veryLarge);
    expect(result).toBe(Number(10_000n * SUN_PER_TRX));
  });
});

// ─── toBigInt ───────────────────────────────────────────────────────

describe('toBigInt', () => {
  test('handles bigint input', () => {
    expect(toBigInt(42n)).toBe(42n);
  });

  test('handles number input', () => {
    expect(toBigInt(42)).toBe(42n);
  });

  test('handles decimal string input', () => {
    expect(toBigInt('42')).toBe(42n);
  });

  test('handles hex string input', () => {
    expect(toBigInt('0x2a')).toBe(42n);
  });

  test('handles float numbers (truncates)', () => {
    expect(toBigInt(42.9)).toBe(42n);
  });
});

// ─── sunToNumber ────────────────────────────────────────────────────

describe('sunToNumber', () => {
  test('converts small SUN values', () => {
    expect(sunToNumber(1_000_000n)).toBe(1_000_000);
  });

  test('throws for values exceeding MAX_SAFE_INTEGER', () => {
    const tooLarge = BigInt(Number.MAX_SAFE_INTEGER) + 1n;
    expect(() => sunToNumber(tooLarge)).toThrow(TronAdapterError);
  });
});

// ─── Constants ──────────────────────────────────────────────────────

describe('Constants', () => {
  test('SUN_PER_TRX is correct', () => {
    expect(SUN_PER_TRX).toBe(1_000_000n);
  });

  test('DEFAULT_FEE_LIMIT is 1000 TRX in SUN', () => {
    expect(DEFAULT_FEE_LIMIT).toBe(1_000_000_000);
  });
});
