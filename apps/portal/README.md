# Compound Security Portal

A Next.js web application providing a user-friendly interface for decoding Compound governance proposals.

## Features

- Interactive web UI for decoding proposals
- Supports multiple input formats (proposal ID, calldata, raw details)
- Collapsible call tree visualization
- Chain badges for cross-chain operations
- REST API endpoint for programmatic access

## Requirements

- Node.js 20+
- pnpm 9+
- Environment variables configured (see monorepo root `.compound-config.json.example`)

## Setup

1. Install dependencies from the monorepo root:
   ```bash
   pnpm install
   ```

2. Create a `.compound-config.json` file in the monorepo root with required API keys and RPC URLs.

## Development

From the monorepo root:
```bash
pnpm --filter @compound-security/portal dev
```

Or from this directory:
```bash
pnpm dev
```

The app will be available at http://localhost:3000.

## API

### `POST /api/decode`

Decode a governance proposal programmatically.

#### Request Types

**By Proposal ID:**
```json
{
  "type": "id",
  "proposalId": 527
}
```

**By Calldata:**
```json
{
  "type": "calldata",
  "calldata": "0x..."
}
```

**By Details:**
```json
{
  "type": "details",
  "details": {
    "targets": ["0x..."],
    "values": ["0"],
    "calldatas": ["0x..."],
    "descriptionHash": "0x..."
  },
  "metadata": {
    "governor": "0x...",
    "proposalId": "123",
    "chainId": 1
  }
}
```

#### Response

```json
{
  "success": true,
  "data": {
    "proposalId": "527",
    "governor": "0x...",
    "chainId": 1,
    "calls": [...]
  }
}
```

## Docker

```bash
# Build (from monorepo root)
docker build -f apps/portal/Dockerfile . -t compound-portal

# Run
docker run -p 3000:3000 compound-portal
```
