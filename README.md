# Compound Security Tools

A monorepo containing CLI tools for Compound governance proposal analysis and simulation. Developed by ChainSecurity as part of the Security Service Provider engagement with Compound.

## Packages

| Package | Description |
|---------|-------------|
| [`apps/portal`](./apps/portal/) | Web interface for decoding proposals |
| [`packages/decoder`](./packages/decoder/) | Decode governance proposals into human-readable format |
| [`packages/simulator`](./packages/simulator/) | Simulate proposals on Tenderly virtual testnets |

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm 9+
- Docker (optional)

### Installation

```bash
git clone https://github.com/chainsecurity/compound-security.git
cd compound-security
git submodule update --init --recursive
pnpm install
```

### Environment Setup

```bash
cp compound-config.json.example compound-config.json
# Edit .compound-config.json with your API keys and RPC URLs
```

### Local usage (development mode)

```bash
# Decode a proposal (CLI)
pnpm decode 527

# Simulate a proposal (CLI)
pnpm simulate 527

# Run the web portal
pnpm --filter @compound-security/portal dev
```

### Docker (production build)

```bash
# Build (from monorepo root)
docker build -f apps/portal/Dockerfile . -t compound-portal

# Run
docker run -p 3000:3000 compound-portal
``` 

See the individual READMEs for detailed usage:
- [Portal README](./apps/portal/README.md)
- [Decoder README](./packages/decoder/README.md)
- [Simulator README](./packages/simulator/README.md)

## Development

```bash
pnpm build      # Build all packages
pnpm typecheck  # Type check all packages
pnpm format     # Format code
```
