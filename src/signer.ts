/** TronSigner — ethers.Wallet equivalent, backed by TronWeb. */

import { TronProvider } from './provider';
import {
  TransactionRequest,
  TransactionResponse,
  AnyAddress,
  TypedDataDomain,
  TypedDataField,
} from './types';
import {
  toTronAddress,
  toEthAddress,
  normalizeTronError,
  TronAdapterError,
  sunToNumber,
  toBigInt,
  gasToFeeLimit,
} from './utils';
import { TronAdapterErrorCode } from './types';

export class TronSigner {
  public readonly provider: TronProvider;

  /** TronWeb instance configured with this signer's private key */
  public readonly tronWeb: any;

  private readonly _privateKey: string;

  constructor(privateKey: string, provider: TronProvider) {
    if (!privateKey || typeof privateKey !== 'string') {
      throw new TronAdapterError(
        'Private key must be a non-empty string',
        TronAdapterErrorCode.INVALID_ARGUMENT
      );
    }

    // Strip 0x prefix if present (TronWeb expects raw hex)
    this._privateKey = privateKey.startsWith('0x')
      ? privateKey.slice(2)
      : privateKey;

    this.provider = provider;

    // Create a new TronWeb instance with the private key set
    try {
      const TronWeb =
        require('tronweb').default || require('tronweb');

      this.tronWeb = new TronWeb({
        fullHost: provider.network.fullHost,
        privateKey: this._privateKey,
      });
    } catch {
      throw new TronAdapterError(
        'TronWeb is required as a peer dependency. Install it: npm install tronweb',
        TronAdapterErrorCode.INVALID_ARGUMENT
      );
    }
  }

  // ─── Core Signer Methods (ethers.js API surface) ────────────────

  /**
   * Get this signer's address in Ethereum hex format (0x...).
   * Analogous to ethers Wallet.getAddress().
   */
  async getAddress(): Promise<string> {
    const tronAddr = this.tronWeb.defaultAddress.base58;
    return toEthAddress(tronAddr, this.tronWeb);
  }

  /**
   * Get this signer's TRON base58 address (T...).
   */
  async getTronAddress(): Promise<string> {
    return this.tronWeb.defaultAddress.base58;
  }

  /**
   * Get the TRX balance of this signer's address.
   * Convenience method.
   */
  async getBalance(): Promise<bigint> {
    const address = await this.getTronAddress();
    return this.provider.getBalance(address);
  }

  /**
   * Sign a message. Returns the signature as a hex string.
   * Analogous to ethers Wallet.signMessage().
   */
  async signMessage(message: string): Promise<string> {
    try {
      const hexMessage = this.tronWeb.toHex(message);
      const signature = await this.tronWeb.trx.signMessageV2(hexMessage);
      return signature;
    } catch (error) {
      throw normalizeTronError(error);
    }
  }

  /**
   * Send a transaction.
   * Analogous to ethers Wallet.sendTransaction().
   *
   * Supports two flows:
   * 1. Simple TRX transfer: { to, value }
   * 2. Contract interaction: { to, data } (trigger smart contract)
   *
   * @param tx - Transaction request with ethers.js-compatible fields
   */
  async sendTransaction(tx: TransactionRequest): Promise<TransactionResponse> {
    try {
      if (tx.data && tx.to) {
        return this._sendContractTransaction(tx);
      }

      return this._sendTRXTransfer(tx);
    } catch (error) {
      throw normalizeTronError(error);
    }
  }

  /**
   * Send TRX to an address.
   * Convenience method with a simpler signature.
   *
   * @param to - Recipient address (any format)
   * @param amountInSun - Amount in SUN (bigint)
   */
  async sendTRX(to: AnyAddress, amountInSun: bigint): Promise<TransactionResponse> {
    return this.sendTransaction({
      to,
      value: amountInSun,
    });
  }

  /**
   * Transfer a TRC-20 token.
   * Convenience method — on ethers.js you'd use a Contract instance.
   *
   * @param tokenAddress - TRC-20 contract address
   * @param to - Recipient address
   * @param amount - Token amount (in smallest unit, like wei for ERC-20)
   */
  async sendTRC20(
    tokenAddress: AnyAddress,
    to: AnyAddress,
    amount: bigint
  ): Promise<TransactionResponse> {
    try {
      const tokenAddr = toTronAddress(tokenAddress, this.tronWeb);
      const toAddr = toTronAddress(to, this.tronWeb);

      const contract = await this.tronWeb.contract().at(tokenAddr);
      const txResult = await contract.methods
        .transfer(toAddr, amount.toString())
        .send({ feeLimit: gasToFeeLimit() });

      // txResult is the txID string for TronWeb contract calls
      const txHash = typeof txResult === 'string' ? txResult : txResult.txID || txResult;

      // Fetch and return normalized transaction
      const response = await this.provider.getTransaction(txHash);
      if (response) return response;

      // If we can't fetch it immediately, return a minimal response
      return this._buildMinimalResponse(txHash);
    } catch (error) {
      throw normalizeTronError(error);
    }
  }

  /**
   * Sign EIP-712 / TIP-712 typed structured data.
   * Analogous to ethers Wallet.signTypedData().
   *
   * TRON's TIP-712 is a direct port of Ethereum's EIP-712. Use CHAIN_IDS
   * from this library to populate the domain.chainId correctly:
   *
   * @example
   *   import { TronSigner, CHAIN_IDS } from 'tron-ethers-adapter';
   *
   *   const domain = {
   *     name: 'MyPermit',
   *     version: '1',
   *     chainId: CHAIN_IDS['nile'],
   *     verifyingContract: tokenAddress,
   *   };
   *   const types = {
   *     Permit: [
   *       { name: 'owner',   type: 'address' },
   *       { name: 'spender', type: 'address' },
   *       { name: 'value',   type: 'uint256' },
   *       { name: 'nonce',   type: 'uint256' },
   *       { name: 'deadline',type: 'uint256' },
   *     ],
   *   };
   *   const sig = await signer.signTypedData(domain, types, permitValue);
   *
   * Requires TronWeb >= 5.3.0 which ships with TIP-712 support.
   * Falls back gracefully with a descriptive error on older versions.
   */
  async signTypedData(
    domain: TypedDataDomain,
    types: Record<string, TypedDataField[]>,
    value: Record<string, unknown>
  ): Promise<string> {
    try {
      const typedData = {
        domain,
        types,
        primaryType: Object.keys(types).filter((t) => t !== 'EIP712Domain')[0] ?? '',
        message: value,
      };

      // TronWeb 5.3+ exposes signTypedData for TIP-712 (EIP-712 equivalent)
      if (typeof this.tronWeb.trx.signTypedData === 'function') {
        return await this.tronWeb.trx.signTypedData(typedData);
      }

      // TronWeb < 5.3 — surface a clear, actionable error
      throw new TronAdapterError(
        'signTypedData requires TronWeb >= 5.3.0 which ships with TIP-712 support. ' +
        'Upgrade: npm install tronweb@latest',
        TronAdapterErrorCode.INVALID_ARGUMENT
      );
    } catch (error) {
      if (error instanceof TronAdapterError) throw error;
      throw normalizeTronError(error);
    }
  }

  // ─── Connect Pattern (ethers.js compatibility) ──────────────────

  /**
   * Returns a new TronSigner connected to a different provider.
   * Analogous to ethers Wallet.connect().
   */
  connect(provider: TronProvider): TronSigner {
    return new TronSigner(this._privateKey, provider);
  }

  // ─── Internal Transaction Builders ──────────────────────────────

  private async _sendTRXTransfer(
    tx: TransactionRequest
  ): Promise<TransactionResponse> {
    if (!tx.to) {
      throw new TronAdapterError(
        'Transaction "to" address is required for TRX transfers',
        TronAdapterErrorCode.INVALID_ARGUMENT
      );
    }

    const toAddr = toTronAddress(tx.to, this.tronWeb);
    const amount = tx.value ? sunToNumber(toBigInt(tx.value)) : 0;

    // Build → Sign → Broadcast (TronWeb 3-step flow)
    const unsignedTx = await this.tronWeb.transactionBuilder.sendTrx(
      toAddr,
      amount
    );
    const signedTx = await this.tronWeb.trx.sign(unsignedTx);
    const result = await this.tronWeb.trx.sendRawTransaction(signedTx);

    if (!result.result && !result.txid) {
      throw new TronAdapterError(
        `Transaction broadcast failed: ${JSON.stringify(result)}`,
        TronAdapterErrorCode.TRANSACTION_FAILED,
        result
      );
    }

    const txHash = result.txid || signedTx.txID;
    return this._buildTransferResponse(txHash, toAddr, amount);
  }

  private async _sendContractTransaction(
    tx: TransactionRequest
  ): Promise<TransactionResponse> {
    if (!tx.to) {
      throw new TronAdapterError(
        'Contract address "to" is required',
        TronAdapterErrorCode.INVALID_ARGUMENT
      );
    }

    const contractAddr = toTronAddress(tx.to, this.tronWeb);
    const rawData = tx.data || '';
    const callValue = tx.value ? sunToNumber(toBigInt(tx.value)) : 0;
    const feeLimit = gasToFeeLimit(tx.gasLimit);
    const ownerAddr = this.tronWeb.defaultAddress.base58;

    const dataHex = rawData.startsWith('0x') ? rawData.slice(2) : rawData;

    // Pass raw ABI-encoded calldata via rawParameter to avoid decoding back to typed params
    const unsignedTx = await this.tronWeb.transactionBuilder.triggerSmartContract(
      contractAddr,
      '',
      { feeLimit, callValue, rawParameter: dataHex },
      [],
      ownerAddr
    );

    if (!unsignedTx?.transaction) {
      throw new TronAdapterError(
        'Failed to build contract transaction',
        TronAdapterErrorCode.TRANSACTION_FAILED,
        unsignedTx
      );
    }

    const signedTx = await this.tronWeb.trx.sign(unsignedTx.transaction);
    const result = await this.tronWeb.trx.sendRawTransaction(signedTx);

    if (!result.result && !result.txid) {
      throw new TronAdapterError(
        `Contract transaction broadcast failed: ${JSON.stringify(result)}`,
        TronAdapterErrorCode.TRANSACTION_FAILED,
        result
      );
    }

    const txHash = result.txid || signedTx.txID;
    return this._buildMinimalResponse(txHash);
  }

  private _buildTransferResponse(
    txHash: string,
    to: string,
    amount: number
  ): TransactionResponse {
    const fromAddr = this.tronWeb.defaultAddress.base58;

    return {
      hash: txHash,
      from: toEthAddress(fromAddr, this.tronWeb),
      to: toEthAddress(to, this.tronWeb),
      value: BigInt(amount),
      blockNumber: null,
      blockHash: null,
      timestamp: Date.now(),
      confirmations: 0,
      raw: { txID: txHash },
      wait: async () => {
        return this.provider.getTransactionReceipt(txHash).then((receipt) => {
          if (receipt) return receipt;
          // Poll until confirmed
          return this.provider.waitForTransaction(txHash);
        });
      },
    };
  }

  private _buildMinimalResponse(txHash: string): TransactionResponse {
    const fromAddr = this.tronWeb.defaultAddress.base58;

    return {
      hash: txHash,
      from: toEthAddress(fromAddr, this.tronWeb),
      to: '',
      value: 0n,
      blockNumber: null,
      blockHash: null,
      timestamp: Date.now(),
      confirmations: 0,
      raw: { txID: txHash },
      wait: async () => {
        return this.provider.waitForTransaction(txHash);
      },
    };
  }
}
