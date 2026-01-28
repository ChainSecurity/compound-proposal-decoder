---
name: review-proposal
description: Review a Compound governance proposal using the verification checklist
disable-model-invocation: true
argument-hint: "<proposal-id>"
---

Review Compound governance proposal **$ARGUMENTS** following this verification guide.

# Compound Governance Proposal Review Guide

This guide outlines the verification steps to assess the security and correctness of a Compound governance proposal.

---

## Important Instructions

### Output Requirements

**You MUST write the review to a markdown file:** `reviews/proposal-$ARGUMENTS.md`

The review file should follow the output template in Section 14.

### Decoder Modifications

**You are allowed and encouraged to modify the proposal decoder** (`packages/decoder/src/`) during the review if needed to:
- Fix bugs in decoding logic
- Add support for new function signatures
- Improve output formatting or clarity
- Add new chain or contract support

If you modify the decoder, note the changes in your review under a "Decoder Updates" section.

---

## Finding Severity Definitions

Use these severity levels when documenting findings:

| Severity | Criteria | Examples |
|----------|----------|----------|
| **CRITICAL** | Proposal will fail, funds at risk, or enables governance attack | Wrong recipient address, insufficient balance, bridge paused |
| **HIGH** | Incorrect parameters with significant financial impact | Wrong supply cap (off by 10x), incorrect interest rate |
| **MEDIUM** | Minor parameter mismatches or suboptimal values | Small discrepancy from forum, non-standard gas limit |
| **LOW** | Cosmetic issues, non-standard patterns | Unusual ordering of actions, redundant approvals |
| **INFO** | Observations, no action required | First use of a new bridge route, large but correct transfer |

---

## 1. Decode the Proposal

First, decode the proposal calldata to understand what actions it performs:

```bash
pnpm decode $ARGUMENTS
```

Identify:
- Number of actions
- Target contracts
- Function calls and parameters
- Values being transferred

---

## 2. Forum Discussion Comparison (Ground Truth)

**CRITICAL STEP:** Before detailed verification, fetch the forum discussion link from Tally and compare decoded values against the forum's "ground truth" values.

### Finding the Forum Link

1. Visit the Tally proposal page: `https://www.tally.xyz/gov/compound/proposal/$ARGUMENTS`
2. Look for the forum discussion link (usually on comp.xyz)
3. The forum post contains the intended values from the proposal author (e.g., Gauntlet, OpenZeppelin)

### Comparison Checklist

For each parameter change in the proposal, verify against forum values:

| Parameter Type | What to Check |
|----------------|---------------|
| Supply Caps | Old → New values match forum exactly |
| Collateral Factors | Percentage changes match forum |
| Liquidation Factors | Percentage changes match forum |
| Interest Rate Curves | Base, Slope Low, Kink, Slope High match forum |
| Price Feeds | New addresses match forum (if specified) |
| Token Amounts | Transfer amounts match forum budget |

### Documenting Mismatches

Create a comparison table in your review:

```markdown
| Parameter | Forum Value | Decoded Value | Status |
|-----------|-------------|---------------|--------|
| USDC Supply Cap | 500,000 → 0 | 500.00K → 0 | ✓ MATCH |
| Borrow Kink | 90% → 85% | 85% (unchanged) | ⚠️ NOTE |
| Transfer Amount | 10,000 COMP | 9,500 COMP | **CRITICAL MISMATCH** |
```

**CRITICAL:** If decoded values don't match forum values:
1. Mark the mismatch prominently in the review
2. Investigate whether the discrepancy is:
   - A previous proposal already applied the change (decoder shows "unchanged")
   - An error in the proposal encoding
   - An intentional deviation from the forum post
3. Request clarification from the proposal author if unresolved

---

## 3. Address Verification

**Do not trust Etherscan labels alone** - they are user-submitted and not authoritative proof.

### Authoritative Sources

| Contract Type | Where to Verify |
|---------------|-----------------|
| Compound V2 contracts (Comptroller, Timelock, COMP) | [compound-protocol/networks/mainnet.json](https://github.com/compound-finance/compound-protocol/blob/master/networks/mainnet.json) |
| Compound III contracts (Comet, CometRewards, Configurator) | [comet/deployments/{chain}/{market}/roots.json](https://github.com/compound-finance/comet/tree/main/deployments) |
| OP Stack bridges (Base, Optimism) | [Base Docs](https://docs.base.org/base-chain/network-information/base-contracts) or [Optimism Docs](https://docs.optimism.io/chain/addresses) |
| Bridged tokens | On-chain: query `REMOTE_TOKEN()` or `l1Token()` to verify L1 counterpart |

### On-Chain Verification

Always verify relationships on-chain:

```bash
# Verify Timelock is admin of Comptroller
cast call <COMPTROLLER> "admin()(address)"

# Verify COMP token address from Comptroller
cast call <COMPTROLLER> "getCompAddress()(address)"

# Verify bridged token links to correct L1 token
cast call <L2_TOKEN> "REMOTE_TOKEN()(address)" --rpc-url <L2_RPC>

# Verify CometRewards is configured with correct reward token
cast call <COMET_REWARDS> "rewardConfig(address)" <COMET_ADDRESS> --rpc-url <L2_RPC>

# Verify Governor points to correct Timelock
cast call <GOVERNOR> "timelock()(address)"
```

---

## 4. Execution Feasibility Checks

Verify the proposal will not revert during execution.

### Token Balances & Allowances

```bash
# Check source has sufficient balance
cast call <TOKEN> "balanceOf(address)(uint256)" <SOURCE_ADDRESS>

# Check current allowances (should be 0 or sufficient)
cast call <TOKEN> "allowance(address,address)(uint256)" <OWNER> <SPENDER>
```

### Contract State

```bash
# Check if bridges are paused
cast call <L1_STANDARD_BRIDGE> "paused()(bool)"
cast call <OPTIMISM_PORTAL> "paused()(bool)"

# Check if bridge route has been used before (proves it works)
cast call <L1_STANDARD_BRIDGE> "deposits(address,address)(uint256)" <L1_TOKEN> <L2_TOKEN>
```

### Function-Specific Checks

For `_grantComp`:
- Comptroller must have sufficient COMP balance
- Caller must be admin (Timelock via governance)

For `approve`:
- Generally cannot fail unless token has special restrictions

For `depositERC20To` (bridge):
- Bridge and portal must not be paused
- Token pair must be registered (check `deposits` mapping or previous transactions)
- `_minGasLimit` should be adequate (200,000 is standard for ERC20 deposits)

---

## 5. Parameter Validation

### Amount Consistency

Verify amounts are consistent across related actions:
- Grant amount = Approve amount = Bridge amount (for bridge proposals)

### Bridge Parameters

| Parameter | Expected Value | Notes |
|-----------|----------------|-------|
| `_minGasLimit` | 200,000 | [Optimism recommended](https://docs.optimism.io/app-developers/tutorials/bridging/cross-dom-bridge-erc20) |
| `_extraData` | `0x` | Usually empty |

### Addresses

- `_l1Token` must match the token being approved
- `_l2Token` must be the correct bridged representation (verify with `REMOTE_TOKEN()`)
- `_to` must be the intended recipient (e.g., CometRewards contract)

---

## 6. Governor & Voting Verification

### Governor Legitimacy

```bash
# Verify Governor is active and legitimate
cast call <GOVERNOR> "proposalCount()(uint256)"

# Verify Governor's Timelock matches protocol Timelock
cast call <GOVERNOR> "timelock()(address)"
```

### Quorum & Voting Feasibility

```bash
# Check quorum requirement
cast call 0x309a862bbC1A00e45506cB8A802D1ff10004c8C0 "quorumVotes()(uint256)" --rpc-url https://ethereum-rpc.publicnode.com

# Check proposal state and votes
cast call 0x309a862bbC1A00e45506cB8A802D1ff10004c8C0 "proposals(uint256)((uint256,address,uint256,uint256,uint256,uint256,uint256,uint256,bool,bool))" $ARGUMENTS --rpc-url https://ethereum-rpc.publicnode.com
```

---

## 7. Proxy Upgrade Verification

For proposals that upgrade contract implementations (`_setImplementation`, `upgradeTo`, `upgradeAndCall`):

### Pre-Upgrade Checks

```bash
# Get current implementation
cast call <PROXY> "implementation()(address)" --rpc-url https://ethereum-rpc.publicnode.com

# Verify new implementation is verified on Etherscan
# Check: https://etherscan.io/address/<NEW_IMPL>#code
```

### Verification Checklist

| Check | Status |
|-------|--------|
| New implementation is verified on Etherscan | |
| Storage layout is compatible (no slot collisions) | |
| Initializer cannot be called again (or is intentionally callable) | |
| New implementation has been audited | |
| Upgrade path has been tested | |

### Storage Layout Comparison

If the proposal upgrades a proxy, compare storage layouts between old and new implementations to ensure no collisions.

---

## 8. Current State Analysis

Check the current state to understand the proposal's impact:

```bash
# For rewards top-ups: check current rewards balance
cast call <REWARD_TOKEN> "balanceOf(address)(uint256)" <REWARDS_CONTRACT> --rpc-url <L2_RPC>
```

---

## 9. Potential Failure Conditions Checklist

| Condition | How to Check | Risk |
|-----------|--------------|------|
| Insufficient token balance | `balanceOf()` on source | Transaction reverts |
| Unauthorized caller | Verify execution path through governance | Transaction reverts |
| Bridge paused | `paused()` on bridge contracts | Transaction reverts |
| Token not bridgeable | Check `deposits()` mapping or history | Transaction reverts |
| Insufficient gas limit | Compare to recommended values | L2 finalization fails, funds stuck |
| Wrong token addresses | Verify with `REMOTE_TOKEN()` | Funds sent to wrong destination |

---

## 10. DoS / Execution Prevention Analysis

Analyze vectors that could prevent proposal execution between now and when it executes.

**Important:** Every finding must include its verification source (cast command, URL, or derivation).

### Competing Proposals

Check if other pending proposals could drain the same tokens:

```bash
# Check states of recent proposals (0=Pending, 1=Active, 2=Canceled, 7=Executed)
for i in {518..525}; do
  echo "Proposal $i: $(cast call 0x309a862bbC1A00e45506cB8A802D1ff10004c8C0 'state(uint256)(uint8)' $i --rpc-url https://ethereum-rpc.publicnode.com)"
done

# Decode pending proposals to check what tokens they use
pnpm decode <PROPOSAL_ID>
```

**Document findings as:**

| Proposal | State | Asset | Source |
|----------|-------|-------|--------|
| 522 | Pending | USDC | `cast call 0x309a... 'state(uint256)(uint8)' 522` |
| 523 | Pending | COMP | `pnpm decode 523` |

### Balance Buffer Analysis

Calculate the margin between available balance and required amount:

```bash
# Check current balance
cast call <TOKEN> "balanceOf(address)(uint256)" <TIMELOCK> --rpc-url https://ethereum-rpc.publicnode.com
```

**Document findings as:**

| Metric | Value | Source |
|--------|-------|--------|
| Available | 133,376 USDC | `cast call 0xA0b8... "balanceOf(address)(uint256)" 0x6d90...` |
| Required | 57,500 USDC | Decoded from proposal Action #0 |
| Buffer | 75,876 USDC (132%) | Calculated: Available - Required |

### Governance Attack Timing

Calculate minimum time for a malicious proposal to execute:

```bash
# Get governance parameters
cast call <GOVERNOR> "votingDelay()(uint256)"   # blocks until voting starts
cast call <GOVERNOR> "votingPeriod()(uint256)"  # blocks for voting
cast call <TIMELOCK> "delay()(uint256)"         # seconds in timelock queue
```

**Document findings as:**

| Phase | Value | Human Readable | Source |
|-------|-------|----------------|--------|
| Voting Delay | 13140 blocks | 1.82 days | `cast call 0x309a... "votingDelay()(uint256)"` |
| Voting Period | 19710 blocks | 2.73 days | `cast call 0x309a... "votingPeriod()(uint256)"` |
| Timelock Delay | 172800 seconds | 2.00 days | `cast call 0x6d90... "delay()(uint256)"` |
| **Total** | - | **~6.5 days** | Calculated: (13140+19710)*12s/86400 + 172800/86400 |

### Existing Allowances

Check if Timelock has token allowances that could be exploited:

```bash
# Check allowances to known spenders (bridges, etc.)
cast call <TOKEN> "allowance(address,address)(uint256)" <TIMELOCK> <SPENDER> --rpc-url https://ethereum-rpc.publicnode.com
```

**Document findings as:**

| Spender | Allowance | Source |
|---------|-----------|--------|
| Base L1StandardBridge | 0 | `cast call 0xA0b8... "allowance(address,address)(uint256)" 0x6d90... 0x3154...` |

### Target Contract Front-Running

For proposals calling `initialize()` or similar one-time functions, verify access control:

```bash
# Check who can call the function (read source code on Etherscan)
# Example: Streamer.initialize() has onlyStreamCreator modifier

# Verify the authorized caller
cast call <CONTRACT> "streamCreator()(address)" --rpc-url https://ethereum-rpc.publicnode.com

# Check current state
cast call <CONTRACT> "startTimestamp()(uint256)" --rpc-url https://ethereum-rpc.publicnode.com
```

**Document findings as:**

| Check | Value | Source |
|-------|-------|--------|
| Access Control | `onlyStreamCreator` modifier | [Etherscan source](https://etherscan.io/address/<ADDRESS>#code) |
| Authorized Caller | Timelock (0x6d90...) | `cast call <CONTRACT> "streamCreator()(address)"` |
| Current State | Not initialized (startTimestamp=0) | `cast call <CONTRACT> "startTimestamp()(uint256)"` |

### External Token Risks

For proposals involving centralized stablecoins (USDC, USDT):

```bash
# Check if token is paused
cast call <TOKEN> "paused()(bool)" --rpc-url https://ethereum-rpc.publicnode.com

# Check if addresses are blacklisted
cast call <TOKEN> "isBlacklisted(address)(bool)" <ADDRESS> --rpc-url https://ethereum-rpc.publicnode.com
```

**Document findings as:**

| Check | Status | Source |
|-------|--------|--------|
| USDC Paused | false | `cast call 0xA0b8... "paused()(bool)"` |
| Timelock Blacklisted | false | `cast call 0xA0b8... "isBlacklisted(address)(bool)" 0x6d90...` |

### DoS Risk Summary Template

| Vector | Risk Level | Mitigation | Verification |
|--------|------------|------------|--------------|
| Competing proposals | Low/Medium/High | Description | `pnpm decode` + `cast call state()` |
| Governance attack | Low | X-day detection window | Governance parameter queries |
| Allowance exploitation | None/Low | Current allowances | `cast call allowance()` |
| Front-running | None/Low | Access control details | Etherscan source + `cast call` |
| Token pause/blacklist | External | Current status | `cast call paused()` / `isBlacklisted()` |
| Balance race | Low/Medium | X% buffer | `cast call balanceOf()` |

---

## 11. Proposal Simulation

Simulate the proposal execution on a Tenderly virtual testnet to verify it executes successfully end-to-end.

### Setup

1. Create a Tenderly virtual testnet (fork of mainnet)
2. Configure `packages/simulator/proposal.config.json` with your Tenderly RPC URL:

```json
{
    "chains": {
        "mainnet": {
            "rpcUrl": "https://virtual.mainnet.eu.rpc.tenderly.co/<YOUR-TESTNET-ID>",
            "chainId": "1",
            "timelockAddress": "0x6d903f6003cca6255D85CcA4D3B5E5146dC33925",
            "governorAddress": "0x309a862bbC1A00e45506cB8A802D1ff10004c8C0"
        }
    }
}
```

### Running the Simulation

```bash
# From the monorepo root, simulate a proposal
pnpm simulate $ARGUMENTS

# Simulate with persistence (creates snapshot)
pnpm simulate $ARGUMENTS --persist

# Simulate each action separately (useful for debugging)
pnpm simulate $ARGUMENTS --separately
```

### What the Simulator Does

1. Syncs state with Tenderly virtual testnet
2. Delegates COMP to a whale address for voting power
3. Advances blocks to make proposal active
4. Casts vote in favor of the proposal
5. Advances blocks to end voting period
6. Queues proposal to timelock
7. Advances time past the timelock delay
8. Executes the proposal
9. For L2 bridging proposals, simulates message relay on the target chain

### Expected Output

```
Delegating 300000000000000000000000 COMP to 0x73AF3bcf944a6559933396c1577B257e2054D935...
Delegate transaction sent: 0x...
Syncing state...
Proposal created with ID: 522
Current block number: 24282349
Advancing to 24284235 block to make proposal active...
Casting vote for proposal...
Queueing proposal...
Advancing time by 1209600 seconds...
Executing proposal...
Execution result: 0x...
```

### Interpreting Results

| Output | Meaning |
|--------|---------|
| `Execution result: 0x...` | Proposal executed successfully |
| `Skipping target: 0x...` | Target is not a bridge (mainnet-only action) |
| Error/revert message | Proposal would fail - investigate the cause |

### Simulation Limitations

- Does not simulate actual token bridging (only Compound governance messages)
- L2 simulations require separate Tenderly virtual testnets for each chain
- Time/block manipulation may not perfectly match mainnet conditions

**Document findings as:**

| Check | Result | Source |
|-------|--------|--------|
| Simulation Status | Success | `pnpm simulate $ARGUMENTS` |
| Execution TX | `0xdc77...` | Tenderly virtual testnet |
| L2 Bridging | N/A (mainnet-only) | Skipped targets in output |

---

## 12. Test Report Review

If the proposal includes a test report, verify:
- All tests pass (especially chain-specific tests)
- Pre and post conditions are checked
- Both fast-execute and standard submission paths tested

---

## 13. Common Pitfalls

Watch out for these known issues:

| Pitfall | Description | How to Detect |
|---------|-------------|---------------|
| **Unichain mislabeling** | Bridge at `0x81014F44...` shows as "Optimism" in some decoders | Verify via [Etherscan](https://etherscan.io/address/0x81014F44b0a345033bB2b3B21C7a1A308B35fEeA) |
| **"Unchanged" values** | Decoder shows "unchanged" when a prior proposal already applied the change | Check recent executed proposals |
| **Decimal confusion** | USDC/USDT have 6 decimals, COMP/WETH have 18 | Verify token decimals on-chain |
| **Stale forum posts** | Forum post may have been updated after initial posting | Check forum post edit history |
| **Multiple recipients** | Bridge proposals may split funds across multiple L2 contracts | Verify all recipients are correct |
| **Gas limit too low** | Non-standard `_minGasLimit` for complex L2 operations | Compare to similar past proposals |

---

## 14. Review Output Template

Write your review to `reviews/proposal-$ARGUMENTS.md` using this template:

```markdown
# Proposal $ARGUMENTS Review

**Date:** YYYY-MM-DD
**Reviewer:** [Name]
**Status:** PENDING REVIEW | APPROVED | APPROVED WITH NOTES | REJECTED

## Summary

- **Proposal Type:** [Parameter Change / Token Transfer / Bridge / Upgrade / Mixed]
- **Risk Level:** [Low / Medium / High / Critical]
- **Actions:** [Number] actions across [Number] chains

[1-2 sentence description of what this proposal does]

## Findings

| # | Severity | Description | Status |
|---|----------|-------------|--------|
| 1 | INFO | Example finding | Verified |

## Forum Comparison

| Parameter | Forum Value | Decoded Value | Status |
|-----------|-------------|---------------|--------|
| ... | ... | ... | ✓ MATCH |

## Address Verification

| Address | Expected | Verified | Source |
|---------|----------|----------|--------|
| ... | ... | ✓ | [Source] |

## Execution Feasibility

| Check | Result | Source |
|-------|--------|--------|
| Token Balance | Sufficient | `cast call ...` |
| Bridge Status | Not Paused | `cast call ...` |

## DoS Risk Analysis

| Vector | Risk Level | Notes |
|--------|------------|-------|
| Competing proposals | Low | No conflicting proposals |

## Simulation Results

| Check | Result |
|-------|--------|
| Mainnet Simulation | Success/Failed |
| L2 Relay | N/A or Success/Failed |

## Decoder Updates

[If you modified the decoder during this review, document changes here]

- None

## Recommendation

**[APPROVE / APPROVE WITH NOTES / REJECT]**

[Explanation of recommendation]
```

---

## Quick Reference: Common RPC Endpoints

```bash
# Ethereum
--rpc-url https://ethereum-rpc.publicnode.com

# Base
--rpc-url https://base-rpc.publicnode.com

# Optimism
--rpc-url https://optimism-rpc.publicnode.com

# Arbitrum
--rpc-url https://arbitrum-one-rpc.publicnode.com

# Polygon
--rpc-url https://polygon-bor-rpc.publicnode.com

# Ronin
--rpc-url https://api.roninchain.com/rpc

# Unichain
--rpc-url https://mainnet.unichain.org
```

---

## Quick Reference: Common Contract Addresses

### Compound V2 (Ethereum)
- Comptroller: `0x3d9819210A31b4961b30EF54bE2aeD79B9c9Cd3B`
- Timelock: `0x6d903f6003cca6255D85CcA4D3B5E5146dC33925`
- COMP Token: `0xc00e94Cb662C3520282E6f5717214004A7f26888`
- New Governor: `0x309a862bbC1A00e45506cB8A802D1ff10004c8C0`

### Base L1 Contracts (on Ethereum)
- L1StandardBridge: `0x3154Cf16ccdb4C6d922629664174b904d80F2C35`
- OptimismPortal: `0x49048044D57e1C92A77f79988d21Fa8fAF74E97e`

### Optimism L1 Contracts (on Ethereum)
- L1StandardBridge: `0x99C9fc46f92E8a1c0deC1b1747d010903E884bE1`
- OptimismPortal: `0xbEb5Fc579115071764c7423A4f12eDde41f106Ed`

### Unichain L1 Contracts (on Ethereum)
- L1StandardBridge: `0x81014F44b0a345033bB2b3B21C7a1A308B35fEeA`

**WARNING:** The Unichain bridge address (`0x81014F44...`) is often mislabeled by decoders as "Optimism". Always verify the bridge network via [Etherscan labels](https://etherscan.io/address/0x81014F44b0a345033bB2b3B21C7a1A308B35fEeA).
