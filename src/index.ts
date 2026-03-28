/**
 * tron-ethers-adapter — ethers.js v6 compatibility layer for TronWeb.
 *
 * @example
 *   import { TronProvider, TronSigner, parseTRX } from 'tron-ethers-adapter';
 *   const provider = new TronProvider('nile');
 *   const signer = new TronSigner(privateKey, provider);
 *   await signer.sendTransaction({ to: 'T...', value: parseTRX('10') });
 */

// ─── Core Classes ───────────────────────────────────────────────────
export { TronProvider } from './provider';
export { TronSigner } from './signer';
export { TronContract } from './contract';

// ─── Utilities ──────────────────────────────────────────────────────
export {
  // Address utilities
  detectAddressFormat,
  isValidAddress,
  ethHexToTronHex,
  tronHexToEthHex,
  toTronAddress,
  toEthAddress,
  toTronHex,
  addressesEqual,

  // Value/unit conversion
  parseTRX,
  formatTRX,
  parseUnits,
  formatUnits,
  gasToFeeLimit,
  toBigInt,
  sunToNumber,
  SUN_PER_TRX,
  DEFAULT_FEE_LIMIT,
  TRX_DECIMALS,

  // Error handling
  TronAdapterError,
  normalizeTronError,
} from './utils';

// ─── Types ──────────────────────────────────────────────────────────
export type {
  TronAddress,
  HexAddress,
  Tron41Address,
  AnyAddress,
  TronNetwork,
  Block,
  TransactionRequest,
  TransactionResponse,
  TransactionReceipt,
  Log,
  EventFilter,
  ContractDeployParams,
  AccountResources,
  TronProviderOptions,
  NetworkHealth,
} from './types';

export { NETWORKS, TronAdapterErrorCode } from './types';
