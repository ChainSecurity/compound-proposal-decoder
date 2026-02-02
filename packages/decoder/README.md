# Compound Proposal Decoder

A CLI tool to decode Compound governance proposals into a human-readable format. Fetches proposal data from the blockchain, retrieves ABIs and contract names from Etherscan, and decodes actions including cross-chain bridge transactions.

## Features

- Fetches proposal details directly from the Compound Governor contract
- Retrieves contract ABIs and names from Etherscan
- Caches ABIs and contract names locally to speed up subsequent runs
- Decodes proposal actions, including function calls and parameters
- Specialized handlers for decoding transactions through bridges (e.g., Linea)
- Colorized terminal output for readability
- Adjustable logging levels

## Requirements

- Node.js 20+
- pnpm 9+
- Etherscan API key
- RPC URLs for supported chains

## Setup

1. Install dependencies from the monorepo root:
   ```bash
   pnpm install
   ```

2. Create a `.env` file in the monorepo root (copy from `.env.example`):
   ```
   ETHERSCAN_API_KEY=your_etherscan_api_key
   ETH_RPC_URL=your_ethereum_rpc_url
   OP_RPC_URL=your_optimism_rpc_url
   BASE_RPC_URL=your_base_rpc_url
   ARB_RPC_URL=your_arbitrum_rpc_url
   LINEA_RPC_URL=your_linea_rpc_url
   SCROLL_RPC_URL=your_scroll_rpc_url
   POLYGON_RPC_URL=your_polygon_rpc_url
   ```

## Usage

From the monorepo root:
```bash
pnpm decode <proposal> [options]
```

### Examples

```bash
# Decode proposal by ID
pnpm decode 527

# With debug logging
pnpm decode 527 --log-level debug

# Decode from JSON file
pnpm decode ./proposal-474.json

# Decode from inline JSON
pnpm decode '{ "targets": ["0x..."], "values": ["0"], "calldatas": ["0x..."], "descriptionHash": "0x..." }'

# Decode from raw calldata
pnpm decode 0x2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c...
```

### Options

| Option | Description |
|--------|-------------|
| `--log-level, -l` | Set log level: `debug`, `info`, `warn`, `error` |

### Proposal Input Formats

The decoder accepts three input formats:

1. **Proposal ID**: A numeric Compound proposal ID
   ```bash
   pnpm decode 527
   ```

2. **JSON file or inline JSON**: Proposal details as JSON with `targets`, `values`, `calldatas`, and `descriptionHash` fields (either at top level or under a `details` object). Optional metadata (`governor`, `proposalId`, `chainId`) can be supplied at top level or under a `metadata` object.
   ```bash
   pnpm decode ./proposal-474.json
   pnpm decode '{ "details": { "targets": [...], "values": [...], "calldatas": [...], "descriptionHash": "0x..." } }'
   ```

3. **Raw calldata**: A hex-encoded `propose(address[],uint256[],bytes[],string)` calldata blob
   ```bash
   pnpm decode 0x2cf24dba...
   ```

## Docker

This is the recommended way to run the decoder without local setup.

```bash
# Build (from monorepo root)
docker build -f packages/decoder/Dockerfile . -t proposal-decoder

# Run (with cache persistence for faster subsequent runs)
docker run --env-file .env -v "$(pwd)/.cache:/app/.cache" -it proposal-decoder 527

# With debug logging
docker run --env-file .env -v "$(pwd)/.cache:/app/.cache" -it proposal-decoder 527 --log-level debug
```

The `-v "$(pwd)/.cache:/app/.cache"` flag maps the container's cache to your local filesystem, speeding up subsequent runs by reusing downloaded ABIs.

The `-it` flags preserve color and formatting in the output.

## Agentic Review

If you have [Claude Code](https://github.com/anthropics/claude-code) installed, you can run `/review-proposal <proposalId>` to agentically review a proposal using a comprehensive verification checklist. The review will be written to `reviews/proposal-<id>.md`.

The review process includes:
- Forum discussion comparison (ground truth verification)
- Address verification against authoritative sources
- Execution feasibility checks
- Parameter validation
- DoS/execution prevention analysis
- Proposal simulation on Tenderly
