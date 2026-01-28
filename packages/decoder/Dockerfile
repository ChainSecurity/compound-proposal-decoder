FROM node:20-slim AS base
RUN corepack enable

FROM base AS pruner
WORKDIR /app
COPY . .
RUN npx turbo prune @compound-security/decoder --docker

FROM base AS builder
WORKDIR /app
COPY --from=pruner /app/out/json/ .
RUN pnpm install --frozen-lockfile
COPY --from=pruner /app/out/full/ .
# Copy files not included in turbo prune output
COPY --from=pruner /app/vendor ./vendor
COPY --from=pruner /app/tsconfig.base.json ./tsconfig.base.json
RUN pnpm turbo build --filter=@compound-security/decoder

FROM base AS runner
WORKDIR /app

# Create a non-root user
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nonroot

COPY --from=builder /app/packages/decoder ./packages/decoder
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/vendor ./vendor
COPY --from=pruner /app/compound-config.json ./compound-config.json

# Create cache directory with proper permissions
RUN mkdir -p /app/.cache && chown -R nonroot:nodejs /app/.cache

USER nonroot

VOLUME /app/.cache

ENTRYPOINT ["node", "packages/decoder/dist/main.js"]
CMD ["--help"]
