/**
 * Tests for src/utils/errors.ts
 */

import { TronAdapterError, normalizeTronError } from '../src/utils/errors';
import { TronAdapterErrorCode } from '../src/types';

// ─── TronAdapterError ───────────────────────────────────────────────

describe('TronAdapterError', () => {
  test('creates error with correct properties', () => {
    const err = new TronAdapterError(
      'Something went wrong',
      TronAdapterErrorCode.NETWORK_ERROR
    );

    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(TronAdapterError);
    expect(err.message).toBe('Something went wrong');
    expect(err.code).toBe(TronAdapterErrorCode.NETWORK_ERROR);
    expect(err.reason).toBe('Something went wrong');
    expect(err.name).toBe('TronAdapterError');
  });

  test('preserves original TRON error', () => {
    const original = { code: 500, data: 'raw error' };
    const err = new TronAdapterError(
      'Wrapped error',
      TronAdapterErrorCode.UNKNOWN,
      original
    );

    expect(err.tronError).toBe(original);
  });

  test('serializes to JSON correctly', () => {
    const err = new TronAdapterError(
      'Test error',
      TronAdapterErrorCode.INVALID_ADDRESS
    );

    const json = err.toJSON();
    expect(json.name).toBe('TronAdapterError');
    expect(json.code).toBe('INVALID_ADDRESS');
    expect(json.reason).toBe('Test error');
    expect(json.message).toBe('Test error');
  });

  test('supports instanceof checks', () => {
    const err = new TronAdapterError('test', TronAdapterErrorCode.UNKNOWN);
    expect(err instanceof TronAdapterError).toBe(true);
    expect(err instanceof Error).toBe(true);
  });
});

// ─── normalizeTronError ─────────────────────────────────────────────

describe('normalizeTronError', () => {
  test('normalizes string errors', () => {
    const err = normalizeTronError('balance is not sufficient');
    expect(err.code).toBe(TronAdapterErrorCode.INSUFFICIENT_FUNDS);
    expect(err.message).toContain('Insufficient TRX');
  });

  test('normalizes Error objects', () => {
    const err = normalizeTronError(new Error('balance is not sufficient'));
    expect(err.code).toBe(TronAdapterErrorCode.INSUFFICIENT_FUNDS);
  });

  test('normalizes account not found errors', () => {
    const err = normalizeTronError('account is not found');
    expect(err.code).toBe(TronAdapterErrorCode.INVALID_ADDRESS);
  });

  test('normalizes contract revert errors', () => {
    const err = normalizeTronError('REVERT opcode executed');
    expect(err.code).toBe(TronAdapterErrorCode.CONTRACT_REVERT);
  });

  test('normalizes contract validate errors', () => {
    const err = normalizeTronError('contract validate error: some detail');
    expect(err.code).toBe(TronAdapterErrorCode.CONTRACT_REVERT);
  });

  test('normalizes timeout errors', () => {
    const err = normalizeTronError('ETIMEDOUT');
    expect(err.code).toBe(TronAdapterErrorCode.TIMEOUT);
  });

  test('normalizes bandwidth errors', () => {
    const err = normalizeTronError('bandwidth is not sufficient');
    expect(err.code).toBe(TronAdapterErrorCode.INSUFFICIENT_FUNDS);
  });

  test('normalizes energy errors', () => {
    const err = normalizeTronError('energy is not sufficient');
    expect(err.code).toBe(TronAdapterErrorCode.INSUFFICIENT_FUNDS);
  });

  test('normalizes generic transaction errors', () => {
    const err = normalizeTronError('transaction processing failed');
    expect(err.code).toBe(TronAdapterErrorCode.TRANSACTION_FAILED);
  });

  test('handles object errors with message property', () => {
    const err = normalizeTronError({ message: 'balance is not sufficient' });
    expect(err.code).toBe(TronAdapterErrorCode.INSUFFICIENT_FUNDS);
  });

  test('handles object errors with error property', () => {
    const err = normalizeTronError({ error: 'timeout occurred' });
    expect(err.code).toBe(TronAdapterErrorCode.TIMEOUT);
  });

  test('handles nested data.message errors', () => {
    const err = normalizeTronError({ data: { message: 'account not exist' } });
    expect(err.code).toBe(TronAdapterErrorCode.INVALID_ADDRESS);
  });

  test('falls back to UNKNOWN for unrecognized errors', () => {
    const err = normalizeTronError('something completely unexpected');
    expect(err.code).toBe(TronAdapterErrorCode.UNKNOWN);
  });

  test('preserves original error', () => {
    const original = new Error('balance is not sufficient');
    const err = normalizeTronError(original);
    expect(err.tronError).toBe(original);
  });
});
