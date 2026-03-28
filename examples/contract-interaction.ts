/**
 * Example: Smart Contract Interaction (TRC-20 Token)
 *
 * Shows how TronContract mirrors ethers.Contract for interacting
 * with smart contracts — using the exact same patterns.
 *
 * Run on Nile testnet: npx ts-node examples/contract-interaction.ts
 */

import {
  TronProvider,
  TronSigner,
  TronContract,
  parseTRX,
  formatUnits,
} from '../src';

// Standard ERC-20/TRC-20 ABI (same interface!)
const TRC20_ABI = [
  { type: 'function', name: 'name', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'string' }] },
  { type: 'function', name: 'symbol', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'string' }] },
  { type: 'function', name: 'decimals', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint8' }] },
  { type: 'function', name: 'totalSupply', stateMutability: 'view', inputs: [], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'balanceOf', stateMutability: 'view', inputs: [{ name: 'account', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
  { type: 'function', name: 'transfer', stateMutability: 'nonpayable', inputs: [{ name: 'to', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] },
  { type: 'function', name: 'approve', stateMutability: 'nonpayable', inputs: [{ name: 'spender', type: 'address' }, { name: 'amount', type: 'uint256' }], outputs: [{ name: '', type: 'bool' }] },
  { type: 'function', name: 'allowance', stateMutability: 'view', inputs: [{ name: 'owner', type: 'address' }, { name: 'spender', type: 'address' }], outputs: [{ name: '', type: 'uint256' }] },
];

async function main() {
  const provider = new TronProvider('nile');

  // Nile testnet USDT (TRC-20)
  const USDT_ADDRESS = 'TXLAQ63Xg1NAzckPwKHvzw7CSEmLMEqcdj';

  // ────────────────────────────────────────────────────────────
  // READ-ONLY: Connect contract with just a provider
  // ────────────────────────────────────────────────────────────
  //
  //   ethers.js:      const token = new ethers.Contract(address, abi, provider);
  //   this adapter:   const token = new TronContract(address, abi, provider);
  //
  const token = new TronContract(USDT_ADDRESS, TRC20_ABI, provider);

  console.log('=== TRC-20 Token Info (Read-Only) ===\n');

  try {
    // Call view functions — identical to ethers.js!
    const name = await token.name();
    const symbol = await token.symbol();
    const decimals = await token.decimals();
    const totalSupply = await token.totalSupply();

    console.log(`Name:         ${name}`);
    console.log(`Symbol:       ${symbol}`);
    console.log(`Decimals:     ${decimals}`);
    console.log(`Total Supply: ${formatUnits(BigInt(totalSupply.toString()), Number(decimals))}`);

    // Check balance of an address
    const testAddr = 'TJCnKsPa7y5okkXvQAidZBzqx3QyQ6sxMW';
    const balance = await token.balanceOf(testAddr);
    console.log(`\nBalance of ${testAddr}:`);
    console.log(`  ${formatUnits(BigInt(balance.toString()), Number(decimals))} ${symbol}`);
  } catch (e: any) {
    console.log('Note: Token may not exist on Nile testnet. Error:', e.message);
  }

  // ────────────────────────────────────────────────────────────
  // WRITE: Connect contract with a signer to send transactions
  // ────────────────────────────────────────────────────────────
  //
  //   ethers.js:      const tokenWithSigner = token.connect(signer);
  //   this adapter:   const tokenWithSigner = token.connect(signer);
  //
  const PRIVATE_KEY = process.env.TRON_PRIVATE_KEY;

  if (PRIVATE_KEY) {
    console.log('\n=== Contract Write Operations ===\n');

    const signer = new TronSigner(PRIVATE_KEY, provider);
    const tokenWithSigner = token.connect(signer);

    // Transfer tokens — same as ethers.js!
    //
    //   ethers.js:      const tx = await token.transfer(to, amount);
    //   this adapter:   const tx = await token.transfer(to, amount);
    //

    // Uncomment to actually transfer on Nile testnet:
    // const tx = await tokenWithSigner.transfer(
    //   'TNPeeaaFB7K9cmo4uQpcU32zGK8G1NYqeL',
    //   parseUnits('10', 6)  // 10 USDT
    // );
    // console.log('Transfer tx hash:', tx.hash);
    // const receipt = await tx.wait();
    // console.log('Confirmed! Status:', receipt.status === 1 ? 'SUCCESS' : 'FAILED');

    // Approve spender — with ethers-style overrides
    // const approveTx = await tokenWithSigner.approve(
    //   'TNPeeaaFB7K9cmo4uQpcU32zGK8G1NYqeL',
    //   parseUnits('100', 6),
    //   { gasLimit: 500_000_000n }  // fee_limit in SUN
    // );

    console.log('Signer connected. Uncomment transfer/approve calls to test.');
  } else {
    console.log('\nSet TRON_PRIVATE_KEY env var to test write operations.');
  }

  // ────────────────────────────────────────────────────────────
  // DEPLOY: Deploy a new contract (ContractFactory pattern)
  // ────────────────────────────────────────────────────────────
  //
  //   ethers.js:      const factory = new ethers.ContractFactory(abi, bytecode, signer);
  //                   const contract = await factory.deploy(...args);
  //
  //   this adapter:   const contract = await TronContract.deploy({
  //                     abi, bytecode, constructorArgs: [...args]
  //                   }, signer);
  //
  console.log('\n=== Contract Deployment (Pattern) ===\n');
  console.log('Deploy pattern:');
  console.log('  const contract = await TronContract.deploy({');
  console.log('    abi: [...],');
  console.log('    bytecode: "0x...",');
  console.log('    constructorArgs: ["MyToken", "MTK"],');
  console.log('    feeLimit: 1_000_000_000, // 1000 TRX');
  console.log('  }, signer);');

  console.log('\nDone!');
}

main().catch(console.error);
