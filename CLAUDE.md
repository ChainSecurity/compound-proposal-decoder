# Claude's Notes

## Project Structure

This is a Turborepo monorepo with the following structure:

```
compound-security/
├── apps/
│   └── portal/                    # Next.js web app
├── packages/
│   ├── decoder/                   # Proposal decoder CLI tool
│   └── simulator/                 # Proposal simulator CLI tool (Tenderly)
├── vendor/
│   └── comet/                     # Git submodule with deployment configs
├── compound-config.json           # Shared config (RPC URLs, API keys, addresses)
├── compound-config.json.example   # Template for compound-config.json
├── package.json                   # Workspace root
├── pnpm-workspace.yaml
├── turbo.json
└── tsconfig.base.json
```

## Configuration

All configuration is consolidated in `compound-config.json` at the monorepo root. This includes:
- `etherscanApiKey`: Etherscan V2 API key (used by decoder)
- `chains`: Chain-specific configuration
  - `rpcUrl`: General RPC URL for reading chain data (used by decoder)
  - `simulatorRpcUrl`: Tenderly virtual testnet URL (used by simulator)
  - `directory`: Comet deployments directory name
  - Contract addresses (governor, timelock, bridge, receiver, etc.)
- `defaults`: Default values for simulation (gas, robinhood address, COMP address)

**Setup**: Copy `compound-config.json.example` to `compound-config.json` and fill in your API keys and RPC URLs.

**Note**: `compound-config.json` is gitignored since it contains sensitive API keys.

## Key Commands

- `pnpm decode <proposal>` - Run decoder from root
- `pnpm simulate <proposal>` - Run simulator from root
- `pnpm build` - Build all packages
- `pnpm typecheck` - Type check all packages
- `pnpm dev` - **Start all dev servers with hot reload** (recommended for development)
- `docker build -f packages/decoder/Dockerfile . -t proposal-decoder` - Build decoder Docker image (run from monorepo root)
- `docker build -f packages/simulator/Dockerfile . -t proposal-simulator` - Build simulator Docker image (run from monorepo root)
- `docker build -f apps/portal/Dockerfile . -t proposal-portal` - Build portal Docker image (run from monorepo root)
- `docker run -p 3000:3000 proposal-portal` - Run portal Docker container
- `pnpm test` - Run all tests (decoder + simulator)
- `pnpm --filter @compound-security/decoder test` - Run decoder tests
- `pnpm --filter @compound-security/simulator test` - Run simulator tests
- `pnpm --filter @compound-security/portal test:e2e` - Run portal Playwright tests

## Development Workflow

### Hot Reloading

**Always use `pnpm dev` from the monorepo root** for development with hot reload:

```bash
pnpm dev
```

This runs Turbo which starts all dev servers concurrently:
- **decoder**: `tsup --watch` - rebuilds dist on source changes
- **simulator**: `tsup --watch` - rebuilds dist on source changes
- **portal**: `next dev` - watches node_modules for changes

The workflow is:
1. You edit `packages/decoder/src/*.ts`
2. tsup detects the change and rebuilds `packages/decoder/dist/`
3. Next.js detects the dist change and hot reloads

**Common mistake**: Running only the portal dev server (`cd apps/portal && pnpm dev`) skips the decoder/simulator watch modes, so changes to packages require manual rebuilds.

### Workspace Dependencies

The portal depends on decoder and simulator via workspace links:
```json
"dependencies": {
  "@compound-security/decoder": "workspace:*",
  "@compound-security/simulator": "workspace:*"
}
```

These packages export their `dist/` files (not source), so the watch modes are essential.

## Lessons Learned

### Simulator Configuration

The simulator requires `packages/simulator/proposal.config.json` to exist (create from `.example`). Without it:
- CLI commands fail with "ENOENT: no such file or directory"
- Portal API routes that import from `@compound-security/simulator` return 500 errors

Required setup:
```bash
cp packages/simulator/proposal.config.json.example packages/simulator/proposal.config.json
# Then update with valid Tenderly virtual testnet RPC URLs
```

See `packages/simulator/CLAUDE.md` for full config structure and required fields.

### Snapshot Storage Location

Snapshots are stored in `.snapshots/` at the **monorepo root**, shared between both the CLI and portal. This follows the same pattern as `compound-config.json`.

### Turborepo + Docker

1. **turbo prune doesn't include everything**: Files like `tsconfig.base.json` and `vendor/` are not included in the prune output. Copy them explicitly from the pruner stage:
   ```dockerfile
   COPY --from=pruner /app/vendor ./vendor
   COPY --from=pruner /app/tsconfig.base.json ./tsconfig.base.json
   ```

2. **Don't install turbo globally with pnpm in Docker**: `pnpm add -g turbo` fails with "Unable to find the global bin directory". Use `npx turbo` instead.

3. **Docker build context**: Always run `docker build -f packages/decoder/Dockerfile .` from the monorepo root, not from the package directory.

4. **Portal requires config at build time**: Next.js "Collecting page data" phase imports API routes which depend on `compound-config.json`. The config file must be copied in the builder stage *before* running `pnpm turbo build`:
   ```dockerfile
   # In builder stage, before RUN pnpm turbo build
   COPY --from=pruner /app/compound-config.json* ./
   ```
   Also copy in the runner stage for runtime access. The wildcard copies both `compound-config.json` and `compound-config.json.example` if they exist.

### TypeScript Path Aliases in ESM

**Problem**: TypeScript path aliases (`@/*` → `src/*`) work at compile time but Node.js ESM doesn't resolve them at runtime.

**Failed approaches**:
- `tsc` alone: Outputs files with unresolved `@/` imports
- `tsc-alias`: Resolves aliases but doesn't add `.js` extensions required by ESM

**Solution**: Use `tsup` with `packages: "external"`:
```typescript
// tsup.config.ts
import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/main.ts", "src/decoder.ts"],
  format: ["esm"],
  target: "node20",
  outDir: "dist",
  clean: true,
  sourcemap: true,
  dts: true,
  splitting: false,
  bundle: true,
  packages: "external",  // Don't bundle node_modules
});
```

**Why `packages: "external"`**: Without this, tsup bundles dependencies like `dotenv` which use CommonJS `require('fs')`, causing "Dynamic require of 'fs' is not supported" errors in ESM.

### File Path Resolution in Monorepo

Source files that reference paths relative to `process.cwd()` break when the package moves. Use `import.meta.url` instead:

```typescript
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = join(__dirname, "..");
const MONOREPO_ROOT = join(PACKAGE_ROOT, "..", "..");
```

Files that needed this update:
- `packages/decoder/src/local-abi.ts`
- `packages/decoder/src/ethers.ts`
- `packages/decoder/src/handlers/address-verification-handler.ts`
- `packages/decoder/src/lib/comet-metadata.ts`
- `packages/simulator/src/main.ts`

### Lockfile Management

After modifying any `package.json`, run `pnpm install` locally before Docker build. Docker uses `--frozen-lockfile` which fails if the lockfile is outdated.

### JSON Config Files in ESM

**Problem**: JSON imports with `import config from "./config.json" with { type: "json" }` break when bundling with tsup because the JSON file path changes relative to the output.

**Solution**: Use `fs.readFileSync` with `import.meta.url` for runtime config loading:
```typescript
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const PACKAGE_ROOT = join(__dirname, "..");
const config = JSON.parse(readFileSync(join(PACKAGE_ROOT, "config.json"), "utf-8"));
```

This approach:
- Works with tsup bundling (JSON stays outside the bundle)
- Resolves paths correctly regardless of where the script is run from
- Allows the config to be modified without rebuilding

### E2E Testing Infrastructure

**Setup**: Vitest for decoder/simulator unit tests, Playwright for portal E2E tests.

**Key files**:
- `packages/decoder/vitest.config.ts` - 2min timeout for RPC calls
- `packages/simulator/vitest.config.ts` - 5min timeout for simulations
- `apps/portal/playwright.config.ts` - Webserver auto-start config

**Test proposals**: 518 (high gas), 519 (high value), 524 (CCIP/Ronin), 528 (baseline)

**Decoder test considerations**:
- Not all contracts are verified on Etherscan - test "most calls decoded" (≥50%) rather than "all calls decoded"
- Some L2 chains may not have RPC URLs configured - decoder handles this gracefully with warnings

**Simulator test considerations**:
- Tenderly virtual testnet state persists - some proposals may fail due to state changes
- Use `SKIP_TENDERLY_TESTS=true` env var to skip simulator tests when Tenderly unavailable
- Consolidate assertions into single test to avoid `undefined` result issues when simulation fails

**Portal Playwright tests**:
- Add `data-testid` attributes to components for reliable selectors
- Use long timeouts (120s+) for pages that make RPC calls
- Key test IDs: `proposal-id-input`, `decode-submit-button`, `proposal-overview`, `action-0`, `simulation-results`, `simulation-status`

### Shared Config Pattern (compound-config.json)

**Problem**: Configuration was scattered across multiple locations - `.env` files for decoder, `proposal.config.json` for simulator, hardcoded values in source files. This made it difficult to maintain and required dotenv loading in multiple places.

**Solution**: Create a single `compound-config.json` at the monorepo root that both packages read. Each package has a `src/config.ts` loader that:
1. Reads from `MONOREPO_ROOT/compound-config.json`
2. Transforms the data as needed (e.g., simulator uses `simulatorRpcUrl`, decoder uses `rpcUrl`)
3. Caches the parsed config for performance
4. Exports typed helper functions (`getRpcUrl()`, `getEtherscanApiKey()`, etc.)

**Key insight**: Separate `rpcUrl` (general read-only RPC for decoder) from `simulatorRpcUrl` (Tenderly virtual testnet for state manipulation) since they serve different purposes. Docker builds must copy `compound-config.json` from the pruner stage.

### Path Resolution in Next.js API Routes

**Problem**: Using `import.meta.url` to resolve file paths in Next.js API routes doesn't work reliably because API routes are bundled differently than standalone Node.js scripts.

**Solution**: Use `process.cwd()` instead, which points to the app directory (`apps/portal`) when running the Next.js dev server:
```typescript
import { join } from "node:path";

// process.cwd() is the portal directory (apps/portal), go up 2 levels to monorepo root
const MONOREPO_ROOT = join(process.cwd(), "..", "..");
const CONFIG_PATH = join(MONOREPO_ROOT, "compound-config.json");
```

**Key insight**: The path resolution strategy differs between contexts:
- **Standalone packages** (decoder, simulator): Use `import.meta.url` since tsup bundles them and `__dirname` points to `dist/`
- **Next.js API routes**: Use `process.cwd()` since `import.meta.url` doesn't resolve correctly in bundled API routes

### Configuration Management UI

The portal includes a `/config` page for managing `compound-config.json`:
- **API route**: `apps/portal/src/app/api/config/route.ts` - GET/POST for reading/writing config
- **Page**: `apps/portal/src/app/config/page.tsx` - Main configuration UI
- **Components**: `apps/portal/src/components/config/` - Form components with validation
- **Types**: `apps/portal/src/types/config.ts` - TypeScript interfaces

Features:
- Bootstraps from `compound-config.json.example` if no config exists
- Warning system for placeholder values, missing required fields
- Secret input masking with reveal toggle
- Add/remove chains with validation
