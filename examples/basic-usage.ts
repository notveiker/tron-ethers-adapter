/**
 * Example: Basic Provider & Signer Usage
 *
 * Shows side-by-side comparison of ethers.js and tron-ethers-adapter.
 * Run on Nile testnet: npx ts-node examples/basic-usage.ts
 */

import {
  TronProvider,
  TronSigner,
  parseTRX,
  formatTRX,
} from '../src';

async function main() {
  // ────────────────────────────────────────────────────────────
  // STEP 1: Connect to a network
  // ────────────────────────────────────────────────────────────
  //
  //   ethers.js:      const provider = new ethers.JsonRpcProvider("https://...");
  //   this adapter:   const provider = new TronProvider("nile");
  //
  const provider = new TronProvider('nile');
  console.log('Connected to:', provider.network.name);

  // ────────────────────────────────────────────────────────────
  // STEP 2: Read chain data
  // ────────────────────────────────────────────────────────────
  const blockNumber = await provider.getBlockNumber();
  console.log('Current block:', blockNumber);

  const block = await provider.getBlock(blockNumber);
  console.log('Block hash:', block?.hash);
  console.log('Transactions in block:', block?.transactions.length);

  // ────────────────────────────────────────────────────────────
  // STEP 3: Check balance
  // ────────────────────────────────────────────────────────────
  //
  //   ethers.js:      const balance = await provider.getBalance("0x...");
  //   this adapter:   const balance = await provider.getBalance("T...");
  //
  //   Both return bigint!
  //
  const testAddress = 'TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW';
  const balance = await provider.getBalance(testAddress);
  console.log(`Balance of ${testAddress}: ${formatTRX(balance)} TRX`);

  // The adapter also accepts Ethereum-style 0x addresses:
  // const balance2 = await provider.getBalance("0x742d35Cc...");

  // ────────────────────────────────────────────────────────────
  // STEP 4: Create a signer (wallet)
  // ────────────────────────────────────────────────────────────
  //
  //   ethers.js:      const wallet = new ethers.Wallet(privateKey, provider);
  //   this adapter:   const signer = new TronSigner(privateKey, provider);
  //
  const PRIVATE_KEY = process.env.TRON_PRIVATE_KEY;

  if (PRIVATE_KEY) {
    const signer = new TronSigner(PRIVATE_KEY, provider);
    const signerAddress = await signer.getTronAddress();
    console.log('Signer address:', signerAddress);

    const signerBalance = await signer.getBalance();
    console.log(`Signer balance: ${formatTRX(signerBalance)} TRX`);

    // ──────────────────────────────────────────────────────────
    // STEP 5: Send a transaction
    // ──────────────────────────────────────────────────────────
    //
    //   ethers.js:      await wallet.sendTransaction({ to: "0x...", value: parseEther("1") });
    //   this adapter:   await signer.sendTransaction({ to: "T...", value: parseTRX("1") });
    //

    // Uncomment to actually send TRX on Nile testnet:
    // const tx = await signer.sendTransaction({
    //   to: 'TNPeeaaFB7K9cmo4uQpcU32zGK8G1NYqeL', // any address
    //   value: parseTRX('1'),
    // });
    // console.log('Transaction hash:', tx.hash);
    // const receipt = await tx.wait();
    // console.log('Confirmed in block:', receipt.blockNumber);
  } else {
    console.log('\nSet TRON_PRIVATE_KEY env var to test signing & sending.');
    console.log('Get testnet TRX from: https://nileex.io/join/getJoinPage');
  }

  // ────────────────────────────────────────────────────────────
  // TRON-specific: Account resources
  // ────────────────────────────────────────────────────────────
  try {
    const resources = await provider.getAccountResources(testAddress);
    console.log('\nAccount Resources:');
    console.log('  Bandwidth:', resources.bandwidth);
    console.log('  Energy:', resources.energy);
    console.log('  Balance:', formatTRX(resources.balance), 'TRX');
  } catch (e: any) {
    console.log('Could not fetch resources (account may not exist on Nile)');
  }

  console.log('\nDone!');
}

main().catch(console.error);
