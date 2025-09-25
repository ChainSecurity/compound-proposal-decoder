FROM node:20-slim
WORKDIR /usr/src/app
ENV NODE_ENV=production

RUN npm install -g pnpm

# Copy package files and install dependencies
COPY package.json pnpm-lock.yaml ./
RUN pnpm install

# Copy the rest of the application code
COPY . .

# Create a non-root user and set permissions
RUN addgroup --system --gid 1001 nodejs && \
    adduser --system --uid 1001 nonroot
RUN mkdir -p /usr/src/app/.cache && chown -R nonroot:nodejs /usr/src/app/.cache

USER nonroot

VOLUME /usr/src/app/.cache

ENTRYPOINT ["pnpm", "decode"]
CMD ["--help"]