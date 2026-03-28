/** Bidirectional address conversion: 0x hex ↔ T... base58 ↔ 41... TRON hex. */

import { TronAdapterError } from './errors';
import { TronAdapterErrorCode, AnyAddress, TronAddress, HexAddress } from '../types';

// ─── Constants ──────────────────────────────────────────────────────

const TRON_ADDRESS_PREFIX = '41';
const ETH_ADDRESS_REGEX = /^0x[0-9a-fA-F]{40}$/;
const TRON_HEX_REGEX = /^41[0-9a-fA-F]{40}$/;
const TRON_BASE58_REGEX = /^T[1-9A-HJ-NP-Za-km-z]{33}$/;

// ─── Address Detection ─────────────────────────────────────────────

export type AddressFormat = 'eth_hex' | 'tron_hex' | 'tron_base58' | 'unknown';

/**
 * Detects the format of a given address string.
 */
export function detectAddressFormat(address: string): AddressFormat {
  if (ETH_ADDRESS_REGEX.test(address)) return 'eth_hex';
  if (TRON_HEX_REGEX.test(address)) return 'tron_hex';
  if (TRON_BASE58_REGEX.test(address)) return 'tron_base58';
  return 'unknown';
}

/**
 * Returns true if the string is a valid address in any supported format.
 */
export function isValidAddress(address: string): boolean {
  return detectAddressFormat(address) !== 'unknown';
}

// ─── Conversion: Ethereum hex ↔ TRON hex ────────────────────────────

/**
 * Convert an Ethereum-style 0x address to TRON's internal 41-prefixed hex.
 *
 * Example: 0x742d35Cc... → 41742d35Cc...
 */
export function ethHexToTronHex(ethAddress: string): string {
  if (!ETH_ADDRESS_REGEX.test(ethAddress)) {
    throw new TronAdapterError(
      `Invalid Ethereum hex address: ${ethAddress}`,
      TronAdapterErrorCode.INVALID_ADDRESS
    );
  }
  return TRON_ADDRESS_PREFIX + ethAddress.slice(2);
}

/**
 * Convert TRON's 41-prefixed hex to Ethereum-style 0x address.
 *
 * Example: 41742d35Cc... → 0x742d35Cc...
 */
export function tronHexToEthHex(tronHex: string): string {
  if (!TRON_HEX_REGEX.test(tronHex)) {
    throw new TronAdapterError(
      `Invalid TRON hex address: ${tronHex}`,
      TronAdapterErrorCode.INVALID_ADDRESS
    );
  }
  return '0x' + tronHex.slice(2);
}

// ─── Normalization ──────────────────────────────────────────────────

/**
 * Normalize any address format to TRON base58 (T...).
 * Requires a TronWeb instance for base58check encoding.
 */
export function toTronAddress(address: AnyAddress, tronWeb: any): TronAddress {
  const format = detectAddressFormat(address);

  switch (format) {
    case 'tron_base58':
      return address;
    case 'eth_hex':
      return tronWeb.address.fromHex(ethHexToTronHex(address));
    case 'tron_hex':
      return tronWeb.address.fromHex(address);
    default:
      throw new TronAdapterError(
        `Cannot convert address to TRON format: ${address}`,
        TronAdapterErrorCode.INVALID_ADDRESS
      );
  }
}

/**
 * Normalize any address format to Ethereum hex (0x...).
 * Requires a TronWeb instance for base58check decoding.
 */
export function toEthAddress(address: AnyAddress, tronWeb: any): HexAddress {
  const format = detectAddressFormat(address);

  switch (format) {
    case 'eth_hex':
      return address.toLowerCase();
    case 'tron_hex':
      return tronHexToEthHex(address).toLowerCase();
    case 'tron_base58': {
      const hex = tronWeb.address.toHex(address);
      return tronHexToEthHex(hex).toLowerCase();
    }
    default:
      throw new TronAdapterError(
        `Cannot convert address to Ethereum format: ${address}`,
        TronAdapterErrorCode.INVALID_ADDRESS
      );
  }
}

/**
 * Normalize any address format to TRON's internal hex (41...).
 */
export function toTronHex(address: AnyAddress, tronWeb: any): string {
  const format = detectAddressFormat(address);

  switch (format) {
    case 'tron_hex':
      return address;
    case 'eth_hex':
      return ethHexToTronHex(address);
    case 'tron_base58':
      return tronWeb.address.toHex(address);
    default:
      throw new TronAdapterError(
        `Cannot convert address to TRON hex: ${address}`,
        TronAdapterErrorCode.INVALID_ADDRESS
      );
  }
}

/**
 * Compare two addresses for equality regardless of format.
 */
export function addressesEqual(a: AnyAddress, b: AnyAddress, tronWeb: any): boolean {
  try {
    const hexA = toTronHex(a, tronWeb).toLowerCase();
    const hexB = toTronHex(b, tronWeb).toLowerCase();
    return hexA === hexB;
  } catch {
    return false;
  }
}
