/** TronProvider — ethers.JsonRpcProvider equivalent, backed by TronWeb. */

import {
  Block,
  TransactionResponse,
  TransactionReceipt,
  TronProviderOptions,
  TronNetwork,
  NETWORKS,
  AnyAddress,
  AccountResources,
  NetworkHealth,
  Log,
} from './types';
import {
  toTronAddress,
  toEthAddress,
  normalizeTronError,
  TronAdapterError,
  formatTRX,
} from './utils';
import { TronAdapterErrorCode } from './types';

export class TronProvider {
  /** Underlying TronWeb instance — exposed for advanced use */
  public readonly tronWeb: any;
  public readonly network: TronNetwork;

  private _tronWebModule: any;
  private readonly _maxRetries: number;
  private readonly _retryDelay: number;

  constructor(options: TronProviderOptions | string) {
    const opts: TronProviderOptions =
      typeof options === 'string'
        ? { network: options }
        : options;

    this._maxRetries = opts.maxRetries ?? 3;
    this._retryDelay = opts.retryDelay ?? 1000;

    // Resolve network config
    if (typeof opts.network === 'string') {
      const net = NETWORKS[opts.network.toLowerCase()];
      if (!net) {
        throw new TronAdapterError(
          `Unknown network "${opts.network}". Use "mainnet", "shasta", "nile", or provide a TronNetwork object.`,
          TronAdapterErrorCode.INVALID_ARGUMENT
        );
      }
      this.network = net;
    } else {
      this.network = opts.network;
    }

    // Lazy-require TronWeb to keep it as a peer dependency
    try {
      this._tronWebModule = require('tronweb');
    } catch {
      throw new TronAdapterError(
        'TronWeb is required as a peer dependency. Install it: npm install tronweb',
        TronAdapterErrorCode.INVALID_ARGUMENT
      );
    }

    const TronWeb = this._tronWebModule.default || this._tronWebModule;

    const tronWebConfig: Record<string, unknown> = {
      fullHost: this.network.fullHost,
      // TronWeb needs a default address even for read-only .call() operations
      privateKey: '0000000000000000000000000000000000000000000000000000000000000001',
    };

    if (opts.apiKey) {
      tronWebConfig.headers = { 'TRON-PRO-API-KEY': opts.apiKey };
    }

    this.tronWeb = new TronWeb(tronWebConfig);
  }

  // ─── Core Read Methods (ethers.js API surface) ──────────────────

  /**
   * Get the TRX balance of an address in SUN (as bigint).
   * Analogous to ethers provider.getBalance().
   *
   * Accepts any address format (0x hex, 41 hex, or T base58).
   */
  async getBalance(address: AnyAddress): Promise<bigint> {
    try {
      const tronAddr = toTronAddress(address, this.tronWeb);
      const balance = await this.tronWeb.trx.getBalance(tronAddr);
      return BigInt(balance);
    } catch (error) {
      throw normalizeTronError(error);
    }
  }

  /**
   * Get a block by number or hash.
   * Analogous to ethers provider.getBlock().
   *
   * @param blockHashOrNumber - Block number or block hash string
   */
  async getBlock(blockHashOrNumber: number | string): Promise<Block | null> {
    try {
      let raw: any;

      if (typeof blockHashOrNumber === 'number') {
        raw = await this.tronWeb.trx.getBlock(blockHashOrNumber);
      } else {
        raw = await this.tronWeb.trx.getBlockByHash(blockHashOrNumber);
      }

      if (!raw || !raw.block_header) return null;

      return this._normalizeBlock(raw);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      const lower = msg.toLowerCase();
      if (lower.includes('block') || lower.includes('not found') || lower.includes('does not exist')) {
        return null;
      }
      throw normalizeTronError(error);
    }
  }

  /**
   * Get the current block number.
   * Analogous to ethers provider.getBlockNumber().
   */
  async getBlockNumber(): Promise<number> {
    try {
      const block = await this.tronWeb.trx.getCurrentBlock();
      return block?.block_header?.raw_data?.number ?? 0;
    } catch (error) {
      throw normalizeTronError(error);
    }
  }

  /**
   * Get a transaction by hash.
   * Analogous to ethers provider.getTransaction().
   */
  async getTransaction(hash: string): Promise<TransactionResponse | null> {
    try {
      const raw = await this.tronWeb.trx.getTransaction(hash);
      if (!raw || !raw.txID) return null;

      return this._normalizeTransaction(raw);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('not found')) return null;
      throw normalizeTronError(error);
    }
  }

  /**
   * Get a transaction receipt.
   * Analogous to ethers provider.getTransactionReceipt().
   */
  async getTransactionReceipt(hash: string): Promise<TransactionReceipt | null> {
    try {
      const info = await this.tronWeb.trx.getTransactionInfo(hash);
      if (!info || !info.id) return null;

      const tx = await this.tronWeb.trx.getTransaction(hash);

      return this._normalizeReceipt(info, tx);
    } catch (error) {
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('not found')) return null;
      throw normalizeTronError(error);
    }
  }

  /**
   * Get the transaction count (number of transactions sent) for an address.
   * Analogous to ethers provider.getTransactionCount().
   *
   * TRON does not have a sequential nonce like Ethereum. This returns
   * an approximation based on the account's on-chain activity counters.
   * For new/unfunded accounts, returns 0.
   */
  async getTransactionCount(address: AnyAddress): Promise<number> {
    try {
      const tronAddr = toTronAddress(address, this.tronWeb);
      const account = await this.tronWeb.trx.getAccount(tronAddr);

      if (!account || Object.keys(account).length === 0) return 0;

      // net_window_size tracks the account's recent transaction activity.
      // Fallback heuristic: if the account exists and has been active, report
      // at least 1 so callers that gate on "has this address transacted?" work.
      const hasActivity =
        account.net_window_size > 0 ||
        account.account_resource?.latest_consume_time_for_energy > 0 ||
        (account.balance !== undefined && account.balance > 0);

      return hasActivity ? 1 : 0;
    } catch {
      return 0;
    }
  }

  /**
   * Get smart contract bytecode at an address.
   * Analogous to ethers provider.getCode().
   */
  async getCode(address: AnyAddress): Promise<string> {
    try {
      const tronAddr = toTronAddress(address, this.tronWeb);
      const contract = await this.tronWeb.trx.getContract(tronAddr);
      if (!contract || !contract.bytecode) return '0x';
      return '0x' + contract.bytecode;
    } catch {
      return '0x';
    }
  }

  // ─── TRON-Specific Methods (not in ethers, but useful) ──────────

  /**
   * Get detailed account resource information (energy, bandwidth, staking).
   * TRON-specific — no ethers equivalent.
   */
  async getAccountResources(address: AnyAddress): Promise<AccountResources> {
    try {
      const tronAddr = toTronAddress(address, this.tronWeb);
      const [resources, account] = await Promise.all([
        this.tronWeb.trx.getAccountResources(tronAddr),
        this.tronWeb.trx.getAccount(tronAddr),
      ]);

      return {
        bandwidth: resources.freeNetLimit ?? 0,
        energy: resources.EnergyLimit ?? 0,
        balance: BigInt(account.balance ?? 0),
        stakedForEnergy: BigInt(account.account_resource?.frozen_balance_for_energy?.frozen_balance ?? 0),
        stakedForBandwidth: BigInt(account.frozen?.[0]?.frozen_balance ?? 0),
      };
    } catch (error) {
      throw normalizeTronError(error);
    }
  }

  /**
   * Get the balance of a TRC-20 token for an address.
   * Convenience method — on ethers.js you'd use a Contract instance.
   */
  async getTRC20Balance(
    tokenAddress: AnyAddress,
    ownerAddress: AnyAddress
  ): Promise<bigint> {
    try {
      const tokenAddr = toTronAddress(tokenAddress, this.tronWeb);
      const ownerAddr = toTronAddress(ownerAddress, this.tronWeb);

      const contract = await this.tronWeb.contract().at(tokenAddr);
      const balance = await contract.methods.balanceOf(ownerAddr).call();

      return BigInt(balance.toString());
    } catch (error) {
      throw normalizeTronError(error);
    }
  }

  /**
   * Get the formatted TRX balance as a human-readable string.
   * Convenience method.
   */
  async getFormattedBalance(address: AnyAddress): Promise<string> {
    const sun = await this.getBalance(address);
    return formatTRX(sun) + ' TRX';
  }

  // ─── Connection Diagnostics ────────────────────────────────────────

  /**
   * Check if the provider can reach the TRON node and report diagnostics.
   * Useful for connection validation, monitoring, and demo scripts.
   */
  async getHealth(): Promise<NetworkHealth> {
    const start = Date.now();
    try {
      const blockNumber = await this.getBlockNumber();
      return {
        connected: true,
        blockNumber,
        latencyMs: Date.now() - start,
        network: this.network.name,
        fullHost: this.network.fullHost,
      };
    } catch {
      return {
        connected: false,
        blockNumber: 0,
        latencyMs: Date.now() - start,
        network: this.network.name,
        fullHost: this.network.fullHost,
      };
    }
  }

  /**
   * Retry wrapper for transient network failures.
   * Uses exponential backoff with the provider's configured limits.
   */
  async withRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: unknown;
    for (let attempt = 0; attempt <= this._maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        const msg = error instanceof Error ? error.message : String(error);
        const isTransient =
          /timeout|ETIMEDOUT|ECONNREFUSED|ECONNRESET|ENOTFOUND|socket hang up/i.test(msg);

        if (!isTransient || attempt === this._maxRetries) throw error;
        await new Promise((r) => setTimeout(r, this._retryDelay * 2 ** attempt));
      }
    }
    throw lastError;
  }

  // ─── Internal Normalization ───────────────────────────────────────

  private _normalizeBlock(raw: any): Block {
    const header = raw.block_header?.raw_data || {};
    const txs = raw.transactions || [];

    return {
      hash: raw.blockID || '',
      parentHash: header.parentHash || '',
      number: header.number || 0,
      timestamp: header.timestamp || 0,
      nonce: '0x0', // TRON uses DPoS, no mining nonce
      transactions: txs.map((tx: any) => tx.txID || ''),
      miner: header.witness_address || '',
    };
  }

  private _normalizeTransaction(raw: any): TransactionResponse {
    const contract = raw.raw_data?.contract?.[0] || {};
    const value = contract.parameter?.value || {};

    const response: TransactionResponse = {
      hash: raw.txID,
      from: value.owner_address
        ? toEthAddress(value.owner_address, this.tronWeb)
        : '',
      to: value.to_address
        ? toEthAddress(value.to_address, this.tronWeb)
        : (value.contract_address
          ? toEthAddress(value.contract_address, this.tronWeb)
          : ''),
      value: BigInt(value.amount || 0),
      blockNumber: null,
      blockHash: null,
      timestamp: raw.raw_data?.timestamp || null,
      confirmations: 0,
      raw: raw,
      wait: async (_confirmations?: number): Promise<TransactionReceipt> => {
        return this._waitForTransaction(raw.txID);
      },
    };

    return response;
  }

  private _normalizeReceipt(info: any, tx: any): TransactionReceipt {
    const contract = tx?.raw_data?.contract?.[0] || {};
    const value = contract.parameter?.value || {};

    const logs: Log[] = (info.log || []).map((log: any, index: number) => ({
      address: log.address ? toEthAddress('41' + log.address, this.tronWeb) : '',
      topics: log.topics || [],
      data: log.data ? '0x' + log.data : '0x',
      blockNumber: info.blockNumber || 0,
      transactionHash: info.id || '',
      logIndex: index,
    }));

    return {
      hash: info.id || '',
      blockNumber: info.blockNumber || 0,
      blockHash: '',
      from: value.owner_address
        ? toEthAddress(value.owner_address, this.tronWeb)
        : '',
      to: value.to_address
        ? toEthAddress(value.to_address, this.tronWeb)
        : '',
      status: info.receipt?.result === 'SUCCESS' ? 1 : 0,
      gasUsed: BigInt(info.receipt?.energy_usage_total || info.receipt?.energy_usage || 0),
      logs,
      raw: info,
    };
  }

  private async _waitForTransaction(
    txHash: string,
    maxAttempts = 20,
    intervalMs = 3000
  ): Promise<TransactionReceipt> {
    for (let i = 0; i < maxAttempts; i++) {
      const receipt = await this.getTransactionReceipt(txHash);
      if (receipt) return receipt;
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }

    throw new TronAdapterError(
      `Transaction ${txHash} was not confirmed after ${maxAttempts} attempts`,
      TronAdapterErrorCode.TIMEOUT
    );
  }
}
