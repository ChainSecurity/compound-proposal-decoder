FROM node:20-slim AS base
RUN corepack enable

FROM base AS pruner
WORKDIR /app
COPY . .
RUN npx turbo prune @compound-security/simulator --docker

FROM base AS builder
WORKDIR /app
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
# Copy files not included in turbo prune output
COPY --from=pruner /app/tsconfig.base.json ./tsconfig.base.json
RUN pnpm turbo build --filter=@compound-security/simulator

# Install Foundry (Anvil) - separate stage for caching
FROM debian:bookworm-slim AS foundry
RUN apt-get update && apt-get install -y curl git && rm -rf /var/lib/apt/lists/*
# Install foundryup and run it to install foundry binaries
ENV FOUNDRY_DIR=/opt/foundry
RUN curl -L https://foundry.paradigm.xyz | bash && \
    /root/.foundry/bin/foundryup
# Copy binaries to a known location
RUN cp /root/.foundry/bin/anvil /usr/local/bin/anvil && \
    cp /root/.foundry/bin/cast /usr/local/bin/cast

FROM base AS runner
WORKDIR /app

# Install runtime dependencies for Anvil
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

# Create a non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nonroot

# Copy Foundry binaries from foundry stage
COPY --from=foundry /usr/local/bin/anvil /usr/local/bin/anvil
COPY --from=foundry /usr/local/bin/cast /usr/local/bin/cast

COPY --from=builder /app/packages/simulator ./packages/simulator
COPY --from=builder /app/node_modules ./node_modules
COPY --from=pruner /app/compound-config.json ./compound-config.json

USER nonroot

ENTRYPOINT ["node", "packages/simulator/dist/main.js"]
CMD ["--help"]
