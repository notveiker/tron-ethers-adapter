/** Error normalization — maps TronWeb's varied error shapes to typed error codes. */

import { TronAdapterErrorCode } from '../types';

export class TronAdapterError extends Error {
  public readonly code: TronAdapterErrorCode;
  public readonly reason: string;
  /** Original TRON error preserved for debugging */
  public readonly tronError?: unknown;

  constructor(message: string, code: TronAdapterErrorCode, tronError?: unknown) {
    super(message);
    this.name = 'TronAdapterError';
    this.code = code;
    this.reason = message;
    this.tronError = tronError;

    // Maintain proper prototype chain for instanceof checks
    Object.setPrototypeOf(this, TronAdapterError.prototype);
  }

  toJSON(): Record<string, unknown> {
    return {
      name: this.name,
      code: this.code,
      reason: this.reason,
      message: this.message,
      tronError: this.tronError,
    };
  }
}

// ─── Common TRON Error Patterns ─────────────────────────────────────

interface TronErrorPattern {
  pattern: RegExp;
  code: TronAdapterErrorCode;
  message: (match: RegExpMatchArray, original: string) => string;
}

const ERROR_PATTERNS: TronErrorPattern[] = [
  {
    pattern: /balance is not sufficient/i,
    code: TronAdapterErrorCode.INSUFFICIENT_FUNDS,
    message: () => 'Insufficient TRX balance for this transaction',
  },
  {
    pattern: /account.*not (found|exist)/i,
    code: TronAdapterErrorCode.INVALID_ADDRESS,
    message: (_, orig) => `Account not found on chain: ${orig}`,
  },
  {
    pattern: /contract validate error/i,
    code: TronAdapterErrorCode.CONTRACT_REVERT,
    message: (_, orig) => `Contract execution reverted: ${orig}`,
  },
  {
    pattern: /REVERT opcode executed/i,
    code: TronAdapterErrorCode.CONTRACT_REVERT,
    message: (_, orig) => `Contract call reverted: ${orig}`,
  },
  {
    pattern: /timeout|ETIMEDOUT|ECONNREFUSED/i,
    code: TronAdapterErrorCode.TIMEOUT,
    message: () => 'Network request timed out — check your connection or try another node',
  },
  {
    pattern: /bandwidth.*not sufficient|not enough bandwidth/i,
    code: TronAdapterErrorCode.INSUFFICIENT_FUNDS,
    message: () =>
      'Insufficient bandwidth — stake TRX for bandwidth or ensure the account holds enough TRX to cover bandwidth fees',
  },
  {
    pattern: /energy.*not sufficient|not enough energy/i,
    code: TronAdapterErrorCode.INSUFFICIENT_FUNDS,
    message: () =>
      'Insufficient energy — stake TRX for energy or increase the fee_limit to burn TRX for energy',
  },
];

/**
 * Normalize any TRON error into a structured TronAdapterError.
 *
 * Accepts strings, Error objects, or arbitrary objects from TronWeb.
 */
export function normalizeTronError(error: unknown): TronAdapterError {
  const message = extractMessage(error);

  // Try to match against known patterns
  for (const { pattern, code, message: buildMessage } of ERROR_PATTERNS) {
    const match = message.match(pattern);
    if (match) {
      return new TronAdapterError(buildMessage(match, message), code, error);
    }
  }

  // Fallback: generic transaction failure
  if (message.toLowerCase().includes('transaction')) {
    return new TronAdapterError(
      `Transaction failed: ${message}`,
      TronAdapterErrorCode.TRANSACTION_FAILED,
      error
    );
  }

  // Last resort: unknown error
  return new TronAdapterError(
    message || 'An unknown TRON error occurred',
    TronAdapterErrorCode.UNKNOWN,
    error
  );
}

/**
 * Extract a human-readable message from various error shapes.
 */
function extractMessage(error: unknown): string {
  if (typeof error === 'string') return error;

  if (error instanceof Error) return error.message;

  if (typeof error === 'object' && error !== null) {
    const obj = error as Record<string, unknown>;

    // TronWeb sometimes returns { message: string }
    if (typeof obj.message === 'string') return obj.message;

    // Or { error: string }
    if (typeof obj.error === 'string') return obj.error;

    // Or nested { data: { message: string } }
    if (
      typeof obj.data === 'object' &&
      obj.data !== null &&
      typeof (obj.data as Record<string, unknown>).message === 'string'
    ) {
      return (obj.data as Record<string, unknown>).message as string;
    }

    // Try JSON.stringify as last resort
    try {
      return JSON.stringify(error);
    } catch {
      return 'Unknown error object';
    }
  }

  return String(error);
}
