import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Painel em tempo quase real: nada de cache de página. Cada pedido lê o banco.
  cacheComponents: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
  serverExternalPackages: ["@node-rs/argon2", "pg"],
};

export default nextConfig;
