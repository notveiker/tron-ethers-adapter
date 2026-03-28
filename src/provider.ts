/** TronProvider — ethers.JsonRpcProvider equivalent, backed by TronWeb. */

import {
  Block,
  TransactionResponse,
  TransactionRequest,
  TransactionReceipt,
  TronProviderOptions,
  TronNetwork,
  NETWORKS,
  CHAIN_IDS,
  AnyAddress,
  AccountResources,
  NetworkHealth,
  NetworkInfo,
  FeeData,
  Log,
  LogFilter,
} from './types';
import {
  toTronAddress,
  toEthAddress,
  normalizeTronError,
  TronAdapterError,
  formatTRX,
  toBigInt,
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

  // ─── ethers.js v6 parity methods ─────────────────────────────────

  /**
   * Returns network name and chain ID.
   * Analogous to ethers provider.getNetwork().
   *
   * TRON chain IDs: mainnet=728126428, shasta=2494104990, nile=3448148188.
   * These match what you'd put in an EIP-712 / TIP-712 domain separator.
   */
  async getNetwork(): Promise<NetworkInfo> {
    const chainId = CHAIN_IDS[this.network.name] ?? 0;
    return { name: this.network.name, chainId: BigInt(chainId) };
  }

  /**
   * Execute a read-only call and return the raw hex result.
   * Analogous to ethers provider.call() / eth_call.
   *
   * Uses TronWeb's triggerConstantContract, which does not broadcast or
   * consume energy. Works for any ABI-encoded calldata.
   *
   * @example
   *   const data = iface.encodeFunctionData('balanceOf', [address]);
   *   const result = await provider.call({ to: tokenAddr, data });
   *   const balance = iface.decodeFunctionResult('balanceOf', result)[0];
   */
  async call(tx: TransactionRequest): Promise<string> {
    try {
      if (!tx.to) {
        throw new TronAdapterError(
          'call() requires a "to" address',
          TronAdapterErrorCode.INVALID_ARGUMENT
        );
      }
      const toAddr = toTronAddress(tx.to, this.tronWeb);
      const from = tx.from
        ? toTronAddress(tx.from, this.tronWeb)
        : this.tronWeb.defaultAddress.base58;
      const dataHex = tx.data
        ? tx.data.startsWith('0x') ? tx.data.slice(2) : tx.data
        : '';
      const callValue = tx.value ? Number(toBigInt(tx.value)) : 0;

      const result = await this.tronWeb.transactionBuilder.triggerConstantContract(
        toAddr, '', { callValue, rawParameter: dataHex }, [], from
      );

      if (result?.constant_result?.[0]) {
        return '0x' + result.constant_result[0];
      }
      return '0x';
    } catch (error) {
      if (error instanceof TronAdapterError) throw error;
      throw normalizeTronError(error);
    }
  }

  /**
   * Estimate the energy cost of executing a transaction.
   * Analogous to ethers provider.estimateGas().
   *
   * Returns energy units (not SUN). To convert to fee_limit in SUN:
   *   const { energyPrice } = await provider.getFeeData();
   *   const feeLimit = energyEstimate * energyPrice;
   *
   * Returns 0n for plain TRX transfers (no energy required).
   */
  async estimateGas(tx: TransactionRequest): Promise<bigint> {
    try {
      if (!tx.to) {
        throw new TronAdapterError(
          'estimateGas() requires a "to" address',
          TronAdapterErrorCode.INVALID_ARGUMENT
        );
      }
      const toAddr = toTronAddress(tx.to, this.tronWeb);
      const from = tx.from
        ? toTronAddress(tx.from, this.tronWeb)
        : this.tronWeb.defaultAddress.base58;
      const dataHex = tx.data
        ? tx.data.startsWith('0x') ? tx.data.slice(2) : tx.data
        : '';
      const callValue = tx.value ? Number(toBigInt(tx.value)) : 0;

      const result = await this.tronWeb.transactionBuilder.triggerConstantContract(
        toAddr, '', { callValue, rawParameter: dataHex }, [], from
      );

      if (result?.energy_used !== undefined) {
        return BigInt(result.energy_used);
      }
      // Plain TRX transfers use bandwidth only, zero energy
      return 0n;
    } catch (error) {
      if (error instanceof TronAdapterError) throw error;
      throw normalizeTronError(error);
    }
  }

  /**
   * Get current fee parameters for the TRON network.
   * Analogous to ethers provider.getFeeData().
   *
   * Key differences from Ethereum:
   * - energyPrice: SUN per energy unit (TRON's equivalent of gasPrice)
   * - bandwidthPrice: SUN per bandwidth byte (for non-energy transaction cost)
   * - maxFeePerGas / maxPriorityFeePerGas: always null (EIP-1559 doesn't apply)
   *
   * Typical mainnet values: energyPrice ~420 SUN, bandwidthPrice ~1000 SUN/byte.
   */
  async getFeeData(): Promise<FeeData> {
    try {
      const params = await this.tronWeb.trx.getChainParameters();
      const paramsMap: Record<string, number> = {};
      if (Array.isArray(params)) {
        for (const p of params) {
          if (p.key && p.value !== undefined) {
            paramsMap[p.key] = p.value;
          }
        }
      }

      // getEnergyFee = energy price in SUN per unit (default ~420 SUN)
      // getTransactionFee = bandwidth price in SUN per byte (default ~1000 SUN)
      const energyPrice = BigInt(paramsMap['getEnergyFee'] ?? 420);
      const bandwidthPrice = BigInt(paramsMap['getTransactionFee'] ?? 1000);

      return {
        energyPrice,
        bandwidthPrice,
        gasPrice: energyPrice,    // alias: ethers callsites that read .gasPrice still work
        maxFeePerGas: null,
        maxPriorityFeePerGas: null,
      };
    } catch (error) {
      throw normalizeTronError(error);
    }
  }

  /**
   * Query event logs emitted by a contract.
   * Analogous to ethers provider.getLogs() / eth_getLogs.
   *
   * TRON difference: an address filter is required. Full-chain log scanning
   * (without address) is not supported by the TRON node API.
   *
   * Uses the TronGrid event API. Requires the node's fullHost to be a
   * TronGrid endpoint (default for mainnet/shasta/nile).
   *
   * @example
   *   const logs = await provider.getLogs({
   *     address: usdtAddress,
   *     fromBlock: latestBlock - 100,
   *   });
   */
  async getLogs(filter: LogFilter): Promise<Log[]> {
    try {
      if (!filter.address) {
        throw new TronAdapterError(
          'getLogs() requires an address filter on TRON — full-chain log scanning is not supported',
          TronAdapterErrorCode.INVALID_ARGUMENT
        );
      }

      const tronAddr = toTronAddress(filter.address, this.tronWeb);
      const options: Record<string, unknown> = { size: 200 };

      if (filter.fromBlock !== undefined) options.minBlockNumber = filter.fromBlock;
      if (filter.toBlock !== undefined)   options.maxBlockNumber = filter.toBlock;

      // TronWeb's getEventResult hits the event server on TronGrid
      const events = await this.tronWeb.getEventResult(tronAddr, options);
      if (!Array.isArray(events)) return [];

      return events.map((event: any, index: number) => ({
        address: event.contract
          ? toEthAddress(event.contract, this.tronWeb)
          : toEthAddress(tronAddr, this.tronWeb),
        topics: event.raw?.topics || [],
        data: event.raw?.data ? '0x' + event.raw.data : '0x',
        blockNumber: event.block || 0,
        transactionHash: event.transaction || '',
        logIndex: index,
      }));
    } catch (error) {
      if (error instanceof TronAdapterError) throw error;
      throw normalizeTronError(error);
    }
  }

  /**
   * Wait for a transaction to be confirmed and return its receipt.
   * Analogous to ethers provider.waitForTransaction().
   *
   * Polls every intervalMs ms, up to maxAttempts times.
   * Default: 20 attempts × 3 s = 60 s total.
   *
   * @throws TronAdapterError with code TIMEOUT if not confirmed in time.
   */
  async waitForTransaction(
    txHash: string,
    maxAttempts = 20,
    intervalMs = 3000
  ): Promise<TransactionReceipt> {
    return this._waitForTransaction(txHash, maxAttempts, intervalMs);
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
