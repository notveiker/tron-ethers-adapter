/** Type definitions — mirrors ethers.js v6 interfaces with TRON-specific fields. */

// ─── Address Formats ────────────────────────────────────────────────

/** TRON base58check address (starts with 'T') */
export type TronAddress = string;

/** Hex address with 0x prefix (Ethereum-style) */
export type HexAddress = string;

/** Hex address with 41 prefix (TRON's internal hex format) */
export type Tron41Address = string;

/** Accepts any address format — the adapter normalizes automatically */
export type AnyAddress = TronAddress | HexAddress | Tron41Address;

// ─── Network ────────────────────────────────────────────────────────

export interface TronNetwork {
  name: string;
  fullHost: string;
  solidityHost?: string;
  eventHost?: string;
}

export const NETWORKS: Record<string, TronNetwork> = {
  mainnet: {
    name: 'mainnet',
    fullHost: 'https://api.trongrid.io',
  },
  shasta: {
    name: 'shasta',
    fullHost: 'https://api.shasta.trongrid.io',
  },
  nile: {
    name: 'nile',
    fullHost: 'https://nile.trongrid.io',
  },
};

/**
 * TRON network chain IDs — used in EIP-712 / TIP-712 typed data domains.
 * Reference: https://developers.tron.network/docs/tron-network-information
 */
export const CHAIN_IDS: Record<string, number> = {
  mainnet: 728126428,
  shasta:  2494104990,
  nile:    3448148188,
};

// ─── Block ──────────────────────────────────────────────────────────

/** ethers.js-compatible Block interface */
export interface Block {
  hash: string;
  parentHash: string;
  number: number;
  timestamp: number;
  nonce: string;
  transactions: string[];
  /** TRON witness address (equivalent to Ethereum miner) */
  miner: string;
}

// ─── Transaction ────────────────────────────────────────────────────

/** ethers.js-compatible TransactionRequest */
export interface TransactionRequest {
  to?: AnyAddress;
  from?: AnyAddress;
  value?: bigint | string | number;
  data?: string;
  /** Maps to TRON's fee_limit (in SUN). Adapter converts from gas-style values. */
  gasLimit?: bigint | string | number;
  /** Not used on TRON — silently ignored for ethers compat */
  gasPrice?: bigint | string | number;
  /** Not used on TRON — silently ignored for ethers compat */
  nonce?: number;
}

/** ethers.js-compatible TransactionResponse */
export interface TransactionResponse {
  hash: string;
  from: string;
  to: string;
  value: bigint;
  blockNumber: number | null;
  blockHash: string | null;
  timestamp: number | null;
  confirmations: number;
  /** Raw TRON transaction data preserved for advanced use */
  raw: Record<string, unknown>;
  wait(confirmations?: number): Promise<TransactionReceipt>;
}

/** ethers.js-compatible TransactionReceipt */
export interface TransactionReceipt {
  hash: string;
  blockNumber: number;
  blockHash: string;
  from: string;
  to: string;
  status: number; // 1 = success, 0 = revert
  /** Energy used (mapped from gasUsed concept) */
  gasUsed: bigint;
  /** Logs/events emitted */
  logs: Log[];
  /** Raw TRON receipt for advanced use */
  raw: Record<string, unknown>;
}

// ─── Logs & Events ──────────────────────────────────────────────────

export interface Log {
  address: string;
  topics: string[];
  data: string;
  blockNumber: number;
  transactionHash: string;
  logIndex: number;
}

/** A decoded contract event log — extends Log with parsed args and event name. */
export interface LogEvent extends Log {
  /** Decoded event arguments keyed by parameter name. */
  args: Record<string, unknown>;
  /** Event name from the ABI (e.g. "Transfer"). */
  event: string;
}

export interface EventFilter {
  address?: AnyAddress;
  topics?: (string | string[] | null)[];
}

/** Extended filter with block range — used by provider.getLogs(). */
export interface LogFilter {
  address?: AnyAddress;
  topics?: (string | string[] | null)[];
  /** Inclusive start block number. */
  fromBlock?: number;
  /** Inclusive end block number. Defaults to latest. */
  toBlock?: number;
}

// ─── Contract ───────────────────────────────────────────────────────

export interface ContractDeployParams {
  abi: unknown[];
  bytecode: string;
  constructorArgs?: unknown[];
  /** TRON-specific: fee limit in SUN (default 1000 TRX) */
  feeLimit?: number;
  /** TRON-specific: TRX to send with deployment (in SUN) */
  callValue?: number;
  /** TRON-specific: energy consumed to call ratio */
  consumeUserResourcePercent?: number;
}

// ─── Resource Model (TRON-specific, exposed for transparency) ──────

export interface AccountResources {
  /** Available bandwidth points */
  bandwidth: number;
  /** Available energy */
  energy: number;
  /** TRX balance in SUN (1 TRX = 1,000,000 SUN) */
  balance: bigint;
  /** Staked TRX for energy */
  stakedForEnergy: bigint;
  /** Staked TRX for bandwidth */
  stakedForBandwidth: bigint;
}

// ─── Provider Options ───────────────────────────────────────────────

export interface TronProviderOptions {
  /** Full node URL or network name ('mainnet' | 'shasta' | 'nile') */
  network: string | TronNetwork;
  /** Optional API key for TronGrid */
  apiKey?: string;
  /** Request timeout in ms (default: 30000) */
  timeout?: number;
  /** Max retry attempts for transient failures (default: 3) */
  maxRetries?: number;
  /** Initial retry delay in ms, doubles each attempt (default: 1000) */
  retryDelay?: number;
}

export interface NetworkHealth {
  connected: boolean;
  blockNumber: number;
  latencyMs: number;
  network: string;
  fullHost: string;
}

/** Network info returned by provider.getNetwork() — mirrors ethers.js Network. */
export interface NetworkInfo {
  /** Human-readable network name: "mainnet", "shasta", "nile", or custom. */
  name: string;
  /** TRON chain ID as bigint — matches EIP-712 domain chainId field. */
  chainId: bigint;
}

/**
 * Fee data returned by provider.getFeeData() — maps ETH gas concepts to TRON resources.
 * On TRON, transaction cost = (energy_used × energyPrice) + (bandwidth_bytes × bandwidthPrice).
 */
export interface FeeData {
  /** Energy price in SUN per energy unit. Comes from chain parameter getEnergyFee (~420 SUN). */
  energyPrice: bigint;
  /** Bandwidth price in SUN per byte. Comes from chain parameter getTransactionFee (~1000 SUN). */
  bandwidthPrice: bigint;
  /** Alias for energyPrice — keeps ethers.js callsites working without changes. */
  gasPrice: bigint;
  /** Always null on TRON — EIP-1559 base fee does not apply. */
  maxFeePerGas: null;
  /** Always null on TRON — EIP-1559 priority fee does not apply. */
  maxPriorityFeePerGas: null;
}

/** EIP-712 / TIP-712 typed data domain separator fields. */
export interface TypedDataDomain {
  name?: string;
  version?: string;
  /** Chain ID — use CHAIN_IDS["mainnet"] etc. for TRON networks. */
  chainId?: number | bigint;
  /** Contract address in any supported TRON/Ethereum format. */
  verifyingContract?: string;
  salt?: string;
}

/** A single field in an EIP-712 / TIP-712 struct type definition. */
export interface TypedDataField {
  name: string;
  type: string;
}

// ─── Error Types ────────────────────────────────────────────────────

export enum TronAdapterErrorCode {
  INVALID_ADDRESS = 'INVALID_ADDRESS',
  INSUFFICIENT_FUNDS = 'INSUFFICIENT_FUNDS',
  TRANSACTION_FAILED = 'TRANSACTION_FAILED',
  NETWORK_ERROR = 'NETWORK_ERROR',
  INVALID_ARGUMENT = 'INVALID_ARGUMENT',
  CONTRACT_REVERT = 'CONTRACT_REVERT',
  TIMEOUT = 'TIMEOUT',
  UNKNOWN = 'UNKNOWN',
}
