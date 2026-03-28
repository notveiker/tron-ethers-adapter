# Reviewer Notes

## What this is

`tron-ethers-adapter` wraps TronWeb in an ethers.js v6-shaped interface. Three classes — `TronProvider`, `TronSigner`, `TronContract` — plus address conversion, value parsing, and error normalization.

If you know ethers.js, you can read the entire API without documentation.

## Where to start reviewing

1. **`src/utils/address.ts`** — Address conversion is the foundation. Regex detection, three-way conversion (0x ↔ T... ↔ 41...), roundtrip safety.
2. **`src/utils/conversion.ts`** — Pure functions. `parseTRX`/`formatTRX`, `parseUnits`/`formatUnits`, the gas→fee_limit mapping with its 10K TRX safety cap.
3. **`src/provider.ts`** — The `_normalize*` methods are where TRON's raw data gets reshaped into ethers-compatible interfaces. Most subtle bugs would live here.
4. **`src/contract.ts`** — `_buildMethodProxies` and `_createWriteMethod` handle ABI-driven dispatch. Watch how overrides are extracted from the last argument.

## Design decisions

**Why ethers v6, not v5 or web3.js?**
v6 is the current standard for new Ethereum projects. It uses native `bigint`, which maps directly to TRON amounts without wrapper classes. v5 is legacy. web3.js has lower adoption among active devs.

**Why a wrapper, not a fork?**
A wrapper stays thin. It delegates chain operations to TronWeb (the canonical SDK), updates when TronWeb updates, and can be adopted incrementally — use it for one contract call without rewriting your whole app.

**Address normalization**
Every method accepts any of the three formats and normalizes internally. This was deliberate over requiring a specific format. Ethereum developers pass `0x` addresses, TRON docs use `T...` addresses, TronWeb internally uses `41...`. Forcing manual conversion is the #1 source of bugs.

**Gas → fee_limit mapping**
TRON doesn't have gas. The adapter maps `gasLimit` to `fee_limit` (max TRX to burn for energy). The mapping is imperfect by design — the goal is to let existing code work without modification, while making `feeLimit` available directly for anyone who wants precision. Capped at 10,000 TRX to prevent accidental drain.

**Error normalization**
TronWeb errors come as plain strings, Error objects, `{ message }`, `{ error }`, `{ data: { message } }`, and more. The adapter pattern-matches against known TRON error strings and maps to typed codes. The original error is always preserved in `error.tronError`.

**Contract method proxying**
`TronContract` scans the ABI at construction and generates callable methods. View/pure → `.call()`, mutating → `.send()`. The last argument is checked for an overrides object (the ethers.js pattern: `contract.transfer(to, amount, { gasLimit: 500n })`).

**Provider default address**
TronWeb requires a default address set even for read-only `.call()` operations. The provider uses a dummy key (`0x01`) to satisfy this requirement. This was caught by live integration tests — the unit tests (mocked) didn't surface it.

**Raw calldata passthrough**
`TronSigner.sendTransaction({ to, data })` passes ABI-encoded calldata directly via TronWeb's `rawParameter` option. Most developers should use `TronContract` instead, but the low-level escape hatch exists for advanced use.

## Known limitations

1. **Event subscriptions** — Not implemented. TronWeb's event system is fundamentally different from ethers.js's `contract.on("Transfer", ...)`. Natural follow-up.
2. **Name resolution** — TRON doesn't have ENS. Not supported.
3. **Transaction nonce** — TRON doesn't use sequential nonces. `getTransactionCount` returns a heuristic (0 for inactive, 1 for active accounts).
4. **Multicall** — Not implemented. Would need a TRON-deployed Multicall contract.
5. **Historical state** — TRON full nodes don't support `eth_call` at arbitrary block heights. Reads are always against current state.

## Integration path

This is packaged as a standard npm module. It could be:
- Published to npm and used as a dependency in any TRON dApp
- Included in TronWeb's documentation as an official adapter
- Extended with React hooks (wagmi-style) for frontend integration
- Used as the basis for a Hardhat plugin for TRON

## Files at a glance

| File | ~Lines | What it does |
|---|---|---|
| `src/provider.ts` | 435 | Chain reads, health check, retry |
| `src/signer.ts` | 330 | Key management, tx signing, broadcast |
| `src/contract.ts` | 320 | ABI dispatch, deploy, connect/attach |
| `src/types.ts` | 190 | TypeScript interfaces and enums |
| `src/utils/address.ts` | 157 | Three-way address conversion |
| `src/utils/conversion.ts` | 213 | SUN/TRX, gas/energy mapping |
| `src/utils/errors.ts` | 158 | Pattern-matched error normalization |
| `tests/*.test.ts` | ~1800 | 177 unit tests |
| `tests/integration/nile.test.ts` | 207 | 17 live Nile tests |
