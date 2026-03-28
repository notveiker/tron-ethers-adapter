/** SUN ↔ TRX conversion, parseUnits/formatUnits, and gas → fee_limit mapping. */

import { TronAdapterError } from './errors';
import { TronAdapterErrorCode } from '../types';

// ─── Constants ──────────────────────────────────────────────────────

/** 1 TRX = 1,000,000 SUN */
export const SUN_PER_TRX = 1_000_000n;

/** Default fee_limit for smart contract calls (1000 TRX in SUN) */
export const DEFAULT_FEE_LIMIT = 1_000_000_000;

/** Decimals for TRX (like ETH has 18, TRX has 6) */
export const TRX_DECIMALS = 6;

// ─── TRX ↔ SUN ─────────────────────────────────────────────────────

/**
 * Parse a TRX string into SUN (bigint).
 * Analogous to ethers.parseEther().
 *
 * @example parseTRX("1.5") → 1500000n
 * @example parseTRX("100") → 100000000n
 */
export function parseTRX(trx: string): bigint {
  if (typeof trx !== 'string' || trx.trim() === '') {
    throw new TronAdapterError(
      'parseTRX requires a non-empty string argument',
      TronAdapterErrorCode.INVALID_ARGUMENT
    );
  }

  let trimmed = trx.trim();

  const isNegative = trimmed.startsWith('-');
  if (isNegative) trimmed = trimmed.slice(1);

  const parts = trimmed.split('.');

  if (parts.length > 2) {
    throw new TronAdapterError(
      `Invalid TRX value: "${trx}"`,
      TronAdapterErrorCode.INVALID_ARGUMENT
    );
  }

  const wholePart = parts[0] || '0';
  let fracPart = parts[1] || '';

  if (fracPart.length > TRX_DECIMALS) {
    fracPart = fracPart.slice(0, TRX_DECIMALS);
  }

  fracPart = fracPart.padEnd(TRX_DECIMALS, '0');

  const sunValue = BigInt(wholePart) * SUN_PER_TRX + BigInt(fracPart);
  return isNegative ? -sunValue : sunValue;
}

/**
 * Format SUN (bigint) as a TRX string.
 * Analogous to ethers.formatEther().
 *
 * @example formatTRX(1500000n) → "1.5"
 * @example formatTRX(100n) → "0.0001"
 */
export function formatTRX(sun: bigint): string {
  const isNegative = sun < 0n;
  const absSun = isNegative ? -sun : sun;

  const whole = absSun / SUN_PER_TRX;
  const frac = absSun % SUN_PER_TRX;

  const fracStr = frac.toString().padStart(TRX_DECIMALS, '0').replace(/0+$/, '');
  const sign = isNegative ? '-' : '';

  if (fracStr === '') {
    return `${sign}${whole.toString()}`;
  }

  return `${sign}${whole.toString()}.${fracStr}`;
}

// ─── Generic Unit Parsing (ethers.parseUnits / formatUnits compat) ──

/**
 * Parse a decimal string with the given number of decimals into bigint.
 * Analogous to ethers.parseUnits().
 *
 * @example parseUnits("1.5", 6) → 1500000n   (TRX)
 * @example parseUnits("1.5", 18) → 1500000000000000000n  (ETH-like)
 */
export function parseUnits(value: string, decimals: number): bigint {
  const trimmed = value.trim();
  const parts = trimmed.split('.');

  if (parts.length > 2) {
    throw new TronAdapterError(
      `Invalid decimal value: "${value}"`,
      TronAdapterErrorCode.INVALID_ARGUMENT
    );
  }

  const wholePart = parts[0] || '0';
  let fracPart = parts[1] || '';

  if (fracPart.length > decimals) {
    fracPart = fracPart.slice(0, decimals);
  }
  fracPart = fracPart.padEnd(decimals, '0');

  const multiplier = 10n ** BigInt(decimals);
  return BigInt(wholePart) * multiplier + BigInt(fracPart);
}

/**
 * Format a bigint value with the given number of decimals into a string.
 * Analogous to ethers.formatUnits().
 *
 * @example formatUnits(1500000n, 6) → "1.5"
 */
export function formatUnits(value: bigint, decimals: number): string {
  const isNegative = value < 0n;
  const absValue = isNegative ? -value : value;
  const multiplier = 10n ** BigInt(decimals);

  const whole = absValue / multiplier;
  const frac = absValue % multiplier;
  const fracStr = frac.toString().padStart(decimals, '0').replace(/0+$/, '');
  const sign = isNegative ? '-' : '';

  if (fracStr === '') return `${sign}${whole.toString()}`;
  return `${sign}${whole.toString()}.${fracStr}`;
}

// ─── Gas → Fee Limit Mapping ────────────────────────────────────────

/**
 * Convert an ethers-style gas value to TRON fee_limit (in SUN).
 *
 * On Ethereum, users pay gas × gasPrice. On TRON, fee_limit is the
 * maximum TRX (in SUN) the user is willing to burn for energy. This
 * function provides a reasonable mapping:
 *
 *   fee_limit = gasLimit (treated as SUN directly)
 *
 * If no gasLimit is specified, returns the default fee limit (1000 TRX).
 * Developers who need precise control should use feeLimit directly
 * in TRON-native calls.
 */
export function gasToFeeLimit(
  gasLimit?: bigint | string | number
): number {
  if (gasLimit === undefined || gasLimit === null) {
    return DEFAULT_FEE_LIMIT;
  }

  const value = typeof gasLimit === 'string' ? BigInt(gasLimit) : BigInt(gasLimit);

  // Cap at a reasonable max (10,000 TRX) to prevent accidental drain
  const maxFeeLimit = 10_000n * SUN_PER_TRX;
  if (value > maxFeeLimit) {
    return Number(maxFeeLimit);
  }

  return Number(value);
}

// ─── Value Normalization ────────────────────────────────────────────

/**
 * Normalize a value that could be bigint, string, or number to bigint.
 * Handles hex strings, decimal strings, and numeric values.
 */
export function toBigInt(value: bigint | string | number): bigint {
  if (typeof value === 'bigint') return value;

  if (typeof value === 'string') {
    if (value.startsWith('0x')) return BigInt(value);
    return BigInt(value);
  }

  return BigInt(Math.floor(value));
}

/**
 * Convert SUN to number (for TRON APIs that expect number, not bigint).
 * Throws if the value is too large for a safe JavaScript integer.
 */
export function sunToNumber(sun: bigint): number {
  if (sun > BigInt(Number.MAX_SAFE_INTEGER)) {
    throw new TronAdapterError(
      `SUN value ${sun} exceeds MAX_SAFE_INTEGER — use bigint directly`,
      TronAdapterErrorCode.INVALID_ARGUMENT
    );
  }
  return Number(sun);
}
