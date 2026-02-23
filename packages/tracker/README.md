# Cross-Chain Proposal Execution Tracker

A CLI tool and library for tracking the execution status of cross-chain Compound governance proposals. Given a proposal ID, it detects bridge calls, queries each target L2 chain, and reports whether the bridged proposal has been received and executed.

## Features

- Detects all supported bridge types: Arbitrum, Optimism, Base, Mantle, Unichain, Scroll, Linea, Polygon, and CCIP (Ronin)
- Queries L2 receiver contracts for proposal status via `ProposalCreated` events
- Groups multiple actions per chain for efficient RPC queries
- Parallel L2 status checking across chains
- Colorized terminal output with status icons
- JSON output mode for programmatic use
- Fast: typically completes in ~1-2 seconds

## Statuses

| Status | Icon | Meaning |
|--------|------|---------|
| **Executed** | `●` (green) | L2 proposal has been executed |
| **Pending** | `◐` (blue) | L2 receiver has the proposal queued in timelock |
| **Not Transmitted** | `○` (yellow) | Mainnet not executed yet, or bridge relay still in progress |
| **Expired** | `✗` (red) | L2 proposal passed its grace period without execution |

## Requirements

- Node.js 20+
- pnpm 9+
- RPC URLs for mainnet and target L2 chains (configured in `compound-config.json`)

## Setup

1. Install dependencies from the monorepo root:
   ```bash
   pnpm install
   ```

2. Ensure `compound-config.json` exists at the monorepo root with RPC URLs for mainnet and L2 chains:
   ```bash
   cp compound-config.json.example compound-config.json
   # Edit with your RPC URLs
   ```

## Usage

From the monorepo root:
```bash
pnpm track <proposals..> [--json]
```

Accepts single IDs, ranges, or a mix:
```bash
pnpm track 528                # Single proposal
pnpm track 519 528 540        # Multiple proposals
pnpm track 525-530            # Range
pnpm track 519 525-530 540    # Mixed
```

### Examples

```bash
# Track a cross-chain proposal (pretty output)
pnpm track 528

# Track multiple proposals
pnpm track 519 528

# Track a range of proposals
pnpm track 525-530

# Track with JSON output
pnpm track 525-530 --json

# Track a proposal that hasn't executed yet
pnpm track 540
```

### Sample Output

```
Proposal 528  —  Governor: Executed

  base (chain 8453)
    ● executed  action[0] — L2 proposal #56 — ETA 2026-02-03T21:01:17.000Z

  1 executed
  Completed in 1209ms
```

### Options

| Option | Description |
|--------|-------------|
| `--json` | Output raw JSON instead of formatted text |

## Library Usage

```typescript
import { trackProposal, trackProposals } from "@compound-security/tracker";

// Single proposal
const result = await trackProposal(528);

console.log(result.governorState);       // 7 (Executed)
console.log(result.hasCrossChainActions); // true

for (const action of result.actions) {
  console.log(action.action.chainName);  // "base"
  console.log(action.status);            // "executed"
  console.log(action.l2ProposalId);      // 56
}

// Batch: multiple proposals (sequential, shared provider)
const batch = await trackProposals([519, 528, 540]);

console.log(batch.results.length);       // 3
console.log(batch.totalDurationMs);      // total time for all proposals
```

### Types

```typescript
interface TrackingResult {
  proposalId: number;
  governorState: GovernorState;  // 0-7 (Pending through Expired)
  hasCrossChainActions: boolean;
  actions: CrossChainActionResult[];
  durationMs: number;
}

interface BatchTrackingResult {
  results: TrackingResult[];
  totalDurationMs: number;
}

interface CrossChainActionResult {
  action: CrossChainAction;
  status: CrossChainStatus;      // "not-transmitted" | "pending" | "executed" | "expired"
  l2ProposalId?: number;
  eta?: number;                  // Unix timestamp of timelock ETA
  error?: string;
}

interface CrossChainAction {
  actionIndex: number;           // Index in the mainnet proposal
  bridgeType: string;            // "arbitrum" | "op-cdm" | "scroll" | "linea" | "polygon" | "ccip"
  chainName: string;             // Config chain name (e.g., "base", "ronin")
  chainId: number;
  receiverAddress: string;
  innerTargets: string[];        // Decoded target addresses from bridge payload
}
```

## How It Works

1. **Fetch proposal state**: Calls `governor.state()` and `governor.proposalDetails()` on mainnet
2. **Detect bridge calls**: Matches each action target against a registry of known L1 bridge contract addresses
3. **Decode bridge payloads**: Extracts inner proposal data (`targets`, `values`, `signatures`, `calldatas`) from bridge calldata
4. **Query L2 receivers**: If the mainnet proposal is executed, queries `ProposalCreated` events on each target L2 chain
5. **Match proposals**: Compares decoded inner targets against L2 event targets to find the matching L2 proposal
6. **Check status**: Calls `receiver.state()` on the matched L2 proposal to get its current status

## Testing

```bash
# Run all tests
pnpm --filter @compound-security/tracker test

# Unit tests only (no RPC calls)
pnpm --filter @compound-security/tracker test -- test/unit

# E2E tests (requires RPC access)
pnpm --filter @compound-security/tracker test -- test/e2e
```
