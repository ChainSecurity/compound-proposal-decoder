# Compound Security Portal

## Project Overview

A Next.js web application that provides a UI for the decoder and simulator packages. Allows users to decode and simulate Compound governance proposals through a web interface.

## Key Directories

```
apps/portal/
├── src/
│   ├── app/                    # Next.js App Router pages
│   │   ├── api/                # API routes
│   │   │   ├── decode/         # Proposal decoding
│   │   │   ├── simulate/       # Proposal simulation
│   │   │   └── revert/         # Revert chains to snapshots
│   │   ├── decode/             # Decoder page
│   │   └── simulate/           # Simulator page
│   ├── components/
│   │   ├── ui/                 # shadcn/ui components
│   │   ├── decoder/            # Decoder-specific components
│   │   └── simulator/          # Simulator-specific components
│   ├── lib/                    # Utilities
│   └── types/                  # TypeScript types
└── public/
```

## API Routes

### POST /api/decode
Decodes a governance proposal by ID or calldata.

### POST /api/simulate
Simulates a governance proposal. Supports modes: `governance`, `direct`, `direct-persist`.

### POST /api/revert
Reverts chains to previous snapshots (shown in simulation results for persisted simulations).
```typescript
// Request body
{ type: "single", chain: "mainnet", snapshot?: "0x..." }
{ type: "multiple", chains: ["mainnet", "arbitrum"], snapshot?: "0x..." }
{ type: "all", snapshot?: "0x..." }
```

## Key Components

### RevertButton (`src/components/simulator/revert-button.tsx`)
- Shown in simulation results for persisted chains
- Per-chain revert button in `ChainResultCard`
- "Revert All" button in `SimulationResults` when multiple chains are persisted

### SimulatorForm (`src/components/simulator/simulator-form.tsx`)
- Form for submitting simulation requests
- Supports: proposal ID, raw calldata, or explicit details
- Mode selector: Governance, Direct, Direct + Persist

## Lessons Learned

### Environment Loading in API Routes

API routes that import from simulator need to load `.env` before the import:
```typescript
import dotenv from "dotenv";
import { dirname, join } from "path";
import { fileURLToPath } from "url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const MONOREPO_ROOT = join(__dirname, "..", "..", "..", "..", "..", "..");
dotenv.config({ path: join(MONOREPO_ROOT, ".env") });

// Now safe to import simulator
import { simulateProposal } from "@compound-security/simulator";
```

### Next.js Webpack Cache Corruption

**Problem**: After modifying multiple React components, the dev server may throw errors like `Cannot find module './45.js'` referring to webpack chunks in `.next/server/`.
**Solution**: Clear the `.next` directory and rebuild: `rm -rf .next && pnpm build`
**Key insight**: This is a stale cache issue, not a code problem. When you see webpack chunk errors (`./XX.js` where XX is a number), always try clearing `.next` first.

### Tailwind Dynamic Class Names

**Problem**: Dynamic Tailwind class names like `bg-${color}-50` don't work because Tailwind statically analyzes classes at build time.
**Solution**: Use conditional logic with full class names:
```typescript
// Bad - won't work
<div className={`bg-${color}-50`}>

// Good - works
<div className={color === "emerald" ? "bg-emerald-50" : "bg-orange-50"}>
```
**Key insight**: Always use complete, literal Tailwind class names. For dynamic colors, create a mapping object or use conditionals.

## Development

Always run `pnpm dev` from the monorepo root to ensure hot reload works for both the portal and the packages it depends on.

## UI Styling Patterns

The portal follows consistent styling patterns across pages:

### Page Structure
- Background: `min-h-screen bg-slate-50`
- Input view: Centered with `flex items-center justify-center`
- Results view: Full-width with back button header

### Card Styling
- Cards: `bg-white rounded-2xl border border-slate-200 shadow-sm`
- Collapsible cards: Add `overflow-hidden` and clickable header with `hover:bg-slate-50 transition-colors`
- Inner sections: `border-t border-slate-100 p-6`

### Stat Cards (decoder/simulator headers)
```tsx
<div className="bg-white rounded-2xl border border-slate-200 p-6">
  <div className="flex items-center gap-3 mb-4">
    <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center">
      <Icon className="w-5 h-5 text-emerald-600" />
    </div>
    <span className="text-sm font-medium text-slate-500">Label</span>
  </div>
  <div className="text-2xl font-bold text-slate-900">Value</div>
</div>
```

### Color Scheme
- Success: `emerald-50`/`emerald-600`
- Failed/Warning: `orange-50`/`orange-600`
- Info/Mode: `purple-50`/`purple-600`
- Time: `amber-50`/`amber-600`
- Network/Chains: `blue-50`/`blue-600`
- Neutral: `slate-50`/`slate-600`

## Simulator Backend Toggle

The simulator supports both Tenderly and Anvil backends, selectable via a toggle in the UI:

**Components involved**:
- `SimulatorForm` - Has `backend` and `onBackendChange` props, renders toggle with `data-testid="backend-tenderly"` and `data-testid="backend-anvil"`
- `SimulationProgress` - Accepts `backend` prop to show "Running on Tenderly virtual testnets" or "Running on local Anvil fork"
- `page.tsx` - Manages `backend` state, passes to form and progress components
- `/api/simulate` - Extracts `backend` from request body, passes to simulator functions

**Request type** (`types/simulator.ts`):
- All request types include optional `backend?: "anvil" | "tenderly"` field
- Defaults to `"tenderly"` in API route

### Path Resolution in API Routes

**Problem**: Using `import.meta.url` to resolve file paths doesn't work reliably in Next.js API routes because they're bundled differently.

**Solution**: Use `process.cwd()` instead, which points to `apps/portal` when running Next.js:
```typescript
// process.cwd() is apps/portal, go up 2 levels to monorepo root
const MONOREPO_ROOT = join(process.cwd(), "..", "..");
const CONFIG_PATH = join(MONOREPO_ROOT, "compound-config.json");
```

**Key insight**: `import.meta.url` works for standalone Node.js scripts but not reliably in bundled Next.js API routes. `process.cwd()` is more predictable.
