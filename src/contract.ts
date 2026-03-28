/** TronContract — ethers.Contract equivalent with ABI-driven method dispatch. */

import { TronProvider } from './provider';
import { TronSigner } from './signer';
import { AnyAddress, TransactionResponse, ContractDeployParams } from './types';
import {
  toTronAddress,
  normalizeTronError,
  TronAdapterError,
  gasToFeeLimit,
  DEFAULT_FEE_LIMIT,
} from './utils';
import { TronAdapterErrorCode } from './types';

/** ABI entry type (simplified for our needs) */
interface ABIEntry {
  name?: string;
  type: string;
  stateMutability?: string;
  inputs?: Array<{ name: string; type: string; indexed?: boolean }>;
  outputs?: Array<{ name: string; type: string }>;
  constant?: boolean;
}

export class TronContract {
  public readonly address: string;
  public readonly abi: ABIEntry[];
  public readonly provider: TronProvider;
  public readonly signer: TronSigner | null;

  /** Underlying TronWeb contract instance */
  private _tronContract: any = null;
  private _initialized = false;

  /** Dynamic method accessors keyed by function name */
  [key: string]: any;

  constructor(
    address: AnyAddress,
    abi: ABIEntry[],
    signerOrProvider: TronSigner | TronProvider
  ) {
    this.abi = abi;

    if (signerOrProvider instanceof TronSigner) {
      this.signer = signerOrProvider;
      this.provider = signerOrProvider.provider;
      this.address = toTronAddress(address, signerOrProvider.tronWeb);
    } else {
      this.signer = null;
      this.provider = signerOrProvider;
      this.address = toTronAddress(address, signerOrProvider.tronWeb);
    }

    // Build dynamic method proxies from ABI
    this._buildMethodProxies();
  }

  // ─── Contract Factory Pattern ───────────────────────────────────

  /**
   * Deploy a new contract.
   * Analogous to ethers ContractFactory.deploy().
   */
  static async deploy(
    params: ContractDeployParams,
    signer: TronSigner
  ): Promise<TronContract> {
    try {
      const {
        abi,
        bytecode,
        constructorArgs = [],
        feeLimit = DEFAULT_FEE_LIMIT,
        callValue = 0,
        consumeUserResourcePercent = 100,
      } = params;

      const ownerAddress = signer.tronWeb.defaultAddress.base58;

      // Build the create contract transaction
      const tx = await signer.tronWeb.transactionBuilder.createSmartContract(
        {
          abi,
          bytecode: bytecode.startsWith('0x') ? bytecode.slice(2) : bytecode,
          feeLimit,
          callValue,
          userFeePercentage: consumeUserResourcePercent,
          parameters: constructorArgs,
        },
        ownerAddress
      );

      // Sign and broadcast
      const signedTx = await signer.tronWeb.trx.sign(tx);
      const result = await signer.tronWeb.trx.sendRawTransaction(signedTx);

      if (!result.result) {
        throw new TronAdapterError(
          `Contract deployment failed: ${JSON.stringify(result)}`,
          TronAdapterErrorCode.TRANSACTION_FAILED,
          result
        );
      }

      // Extract the contract address from the transaction
      const contractAddress = signer.tronWeb.address.fromHex(
        tx.contract_address || result.transaction?.contract_address
      );

      if (!contractAddress) {
        throw new TronAdapterError(
          'Could not determine deployed contract address',
          TronAdapterErrorCode.TRANSACTION_FAILED
        );
      }

      // Return a new TronContract instance connected to the deployed address
      return new TronContract(contractAddress, abi as ABIEntry[], signer);
    } catch (error) {
      if (error instanceof TronAdapterError) throw error;
      throw normalizeTronError(error);
    }
  }

  /**
   * Attach to an existing contract (create TronContract from address).
   * Analogous to ethers Contract.attach().
   */
  attach(address: AnyAddress): TronContract {
    return new TronContract(address, this.abi, this.signer || this.provider);
  }

  /**
   * Connect a signer to this contract (for write operations).
   * Analogous to ethers Contract.connect().
   */
  connect(signer: TronSigner): TronContract {
    return new TronContract(this.address, this.abi, signer);
  }

  // ─── Internal: Dynamic Method Proxy Builder ─────────────────────

  /**
   * Scan the ABI and create callable methods on this instance.
   *
   * For each function in the ABI:
   * - If view/pure: contract.foo() calls the function and returns the result
   * - If nonpayable/payable: contract.foo() sends a transaction
   *
   * This mirrors ethers.js behavior where contract.foo() just works.
   */
  private _buildMethodProxies(): void {
    const functions = this.abi.filter(
      (entry) => entry.type === 'function' && entry.name
    );

    for (const fn of functions) {
      const name = fn.name!;
      const isReadOnly =
        fn.stateMutability === 'view' ||
        fn.stateMutability === 'pure' ||
        fn.constant === true;

      // Don't override existing methods
      if (name in this && typeof this[name] === 'function') continue;

      if (isReadOnly) {
        this[name] = this._createReadMethod(name);
      } else {
        this[name] = this._createWriteMethod(name);
      }
    }
  }

  /**
   * Create a read-only (call) proxy for a contract function.
   */
  private _createReadMethod(methodName: string) {
    return async (...args: unknown[]) => {
      const contract = await this._getOrInitContract();

      try {
        const result = await contract.methods[methodName](...args).call();
        return this._normalizeResult(result);
      } catch (error) {
        throw normalizeTronError(error);
      }
    };
  }

  /**
   * Create a write (send) proxy for a contract function.
   */
  private _createWriteMethod(methodName: string) {
    return async (...args: unknown[]) => {
      if (!this.signer) {
        throw new TronAdapterError(
          `Cannot call ${methodName}() — contract is read-only. Use contract.connect(signer) first.`,
          TronAdapterErrorCode.INVALID_ARGUMENT
        );
      }

      const contract = await this._getOrInitContract();

      // Check if last argument is an overrides object (ethers.js pattern)
      let overrides: Record<string, unknown> = {};
      const lastArg = args[args.length - 1];
      if (
        lastArg &&
        typeof lastArg === 'object' &&
        !Array.isArray(lastArg) &&
        !(lastArg instanceof Uint8Array)
      ) {
        overrides = lastArg as Record<string, unknown>;
        args = args.slice(0, -1);
      }

      const feeLimit = overrides.gasLimit
        ? gasToFeeLimit(overrides.gasLimit as bigint | string | number)
        : DEFAULT_FEE_LIMIT;

      const callValue = overrides.value
        ? Number(overrides.value)
        : 0;

      try {
        const txId = await contract.methods[methodName](...args).send({
          feeLimit,
          callValue,
        });

        const txHash = typeof txId === 'string' ? txId : txId?.txID || String(txId);

        const response: TransactionResponse = {
          hash: txHash,
          from: this.signer.tronWeb.defaultAddress.base58,
          to: this.address,
          value: BigInt(callValue),
          blockNumber: null,
          blockHash: null,
          timestamp: Date.now(),
          confirmations: 0,
          raw: { txID: txHash, method: methodName, args },
          wait: async () => {
            return this.provider['_waitForTransaction'](txHash);
          },
        };

        return response;
      } catch (error) {
        throw normalizeTronError(error);
      }
    };
  }

  /**
   * Lazily initialize the underlying TronWeb contract instance.
   */
  private async _getOrInitContract(): Promise<any> {
    if (this._initialized && this._tronContract) {
      return this._tronContract;
    }

    const tronWeb = this.signer?.tronWeb || this.provider.tronWeb;

    try {
      this._tronContract = await tronWeb.contract(this.abi, this.address);
      this._initialized = true;
      return this._tronContract;
    } catch (error) {
      throw normalizeTronError(error);
    }
  }

  /**
   * Normalize contract call results.
   *
   * TronWeb returns results in various shapes — sometimes as objects
   * with numeric keys, sometimes as raw values. This normalizes them
   * to match ethers.js behavior (single-return → value, multi-return → tuple).
   */
  private _normalizeResult(result: unknown): unknown {
    if (result === null || result === undefined) return result;

    // TronWeb BigNumber → native bigint
    if (typeof result === 'object' && result !== null) {
      const obj = result as any;
      if (obj._isBigNumber || obj.toNumber) {
        try {
          return BigInt(obj.toString());
        } catch {
          return obj.toString();
        }
      }
    }

    return result;
  }
}
