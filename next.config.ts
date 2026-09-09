import type { NextConfig } from "next";

// FRONTERA CERO se publica como sitio ESTÁTICO en GitHub Pages:
// https://googlesitecom.github.io/Googlecom/
// El sitio se sirve bajo el subdirectorio /Googlecom/, por lo que el
// build de Pages define NEXT_PUBLIC_BASE_PATH=/Googlecom (basePath de
// Next + prefijo de los assets de public/ en src/game/shared.ts → ASSET_BASE).
// En desarrollo no se define y todo queda en la raíz.
const basePath = process.env.NEXT_PUBLIC_BASE_PATH || undefined;

const nextConfig: NextConfig = {
  output: "export",
  basePath,
  assetPrefix: basePath,
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  allowedDevOrigins: ["*.space-z.ai", "localhost"],
};

export default nextConfig;
