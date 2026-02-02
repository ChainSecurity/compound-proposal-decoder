# Decoder Test Fixtures

This directory contains expected JSON output for proposal decoding tests.

## Generating Fixtures

To generate or update fixtures, run:

```bash
pnpm --filter @compound-security/decoder generate-fixtures
```

Or manually:

```bash
cd packages/decoder
pnpm decode 518 --json > test/fixtures/proposal-518.expected.json
pnpm decode 519 --json > test/fixtures/proposal-519.expected.json
pnpm decode 524 --json > test/fixtures/proposal-524.expected.json
pnpm decode 528 --json > test/fixtures/proposal-528.expected.json
```

## Test Proposals

| Proposal | Scenario | Purpose |
|----------|----------|---------|
| 518 | High gas consumption | Test gas reporting and potential warnings |
| 519 | High message value | Test value detection (should flag high ETH) |
| 524 | CCIP/Ronin bridge | Test bridge detection and patch scenarios |
| 528 | Normal baseline | Baseline validation for typical proposals |

## Fixture Structure

Each fixture is a serialized `DecodedProposal` with:

- `governor`: Governor contract address
- `proposalId`: Proposal ID as string (serialized BigInt)
- `descriptionHash`: Hash of proposal description
- `calls`: Array of serialized CallNodes

BigInt values are serialized as strings for JSON compatibility.
