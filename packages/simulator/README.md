# Compound Proposal Simulator

A CLI tool for simulating Compound governance proposals on Tenderly virtual testnets. Supports mainnet and L2 chains (Arbitrum, Scroll, Optimism, Base, Mantle).

## Requirements

- Node.js 20+
- pnpm 9+
- Tenderly Virtual TestNet subscription

## Setup

1. Install dependencies from the monorepo root:
   ```bash
   pnpm install
   ```

2. Configure `proposal.config.json` with your Tenderly RPC URLs and contract addresses.

## Usage

From the monorepo root:
```bash
pnpm simulate <command> [options]
```

Or from this package directory:
```bash
pnpm simulate <command> [options]
```

### Commands

| Command | Description |
|---------|-------------|
| `simulate <id\|0xcalldata>` | Simulate a proposal (default) |
| `revert` | Revert to snapshot (mainnet by default) |
| `snapshot` | Create snapshots for all chains |
| `list` | List available snapshots |

### Examples

```bash
# Simulate proposal 524 (full governance flow)
pnpm simulate 524

# Simulate from raw calldata
pnpm simulate 0x7d5e81e2...

# Direct execution (skip governance, execute from timelock)
pnpm simulate 524 --direct

# Direct execution with state persistence
pnpm simulate 524 --direct --persist

# List available snapshots
pnpm simulate list

# Revert mainnet to latest snapshot
pnpm simulate revert

# Revert all chains
pnpm simulate revert --all

# Revert to second-to-last snapshot
pnpm simulate revert --snapshot -2

# Revert specific chain
pnpm simulate revert --chain arbitrum

# Create new snapshots for all chains
pnpm simulate snapshot
```

### Options

| Option | Description |
|--------|-------------|
| `--direct` | Execute directly from timelock (skip governance flow) |
| `--persist` | Persist state changes (only with `--direct`) |
| `--all` | Apply to all chains (for `revert` command) |
| `--snapshot <ref>` | Snapshot reference: `latest`, `-1`, `-2`, or full hash |
| `--chain <name>` | Target specific chain (mainnet, arbitrum, scroll, etc.) |

### Simulation Modes

**Full Simulation (default)**
1. Delegates COMP to robinhood address
2. Advances blocks to make proposal active
3. Casts vote
4. Advances blocks to end voting
5. Queues proposal via timelock
6. Advances time past grace period
7. Executes proposal
8. Simulates L2 bridging if applicable

**Direct Mode (`--direct`)**
- Skips governance flow, executes directly from timelock
- Useful for debugging individual transactions
- Without `--persist`: Uses `tenderly_simulateBundle` (read-only)
- With `--persist`: Creates snapshot and executes real transactions

### Workflow

1. **Create clean snapshots:** `pnpm simulate snapshot`
2. **Simulate a proposal:** `pnpm simulate 524 --direct --persist`
3. **Revert to clean state:** `pnpm simulate revert --all`
4. **Repeat as needed**

## Docker

```bash
# Build (from monorepo root)
docker build -f packages/simulator/Dockerfile . -t proposal-simulator

# Run
docker run -it proposal-simulator 524
docker run -it proposal-simulator --help
```

## Notes

- State Sync is a Tenderly Virtual TestNet configuration setting (enabled in dashboard)
- Snapshots are stored in `.snapshots/<chain>.json` files (keyed by RPC URL)
- The `--snapshot` option supports negative indices: `-1` = latest, `-2` = second-to-last
