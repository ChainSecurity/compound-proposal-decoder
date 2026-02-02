/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  transpilePackages: ["@compound-security/decoder", "@compound-security/simulator"],
  serverExternalPackages: [
    "pino",
    "pino-pretty",
    "pino-abstract-transport",
    "sonic-boom",
    "thread-stream",
  ],
  webpack: (config, { isServer }) => {
    if (isServer) {
      // Force pino and related packages to be external even when transpiling
      config.externals = config.externals || [];
      config.externals.push({
        pino: "commonjs pino",
        "pino-pretty": "commonjs pino-pretty",
        "pino-abstract-transport": "commonjs pino-abstract-transport",
        "sonic-boom": "commonjs sonic-boom",
        "thread-stream": "commonjs thread-stream",
      });
    }
    return config;
  },
};

export default nextConfig;
