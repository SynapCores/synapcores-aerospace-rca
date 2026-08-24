import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Emit a self-contained server bundle. Without this the runtime image has to
  // carry the whole workspace node_modules plus sources -- the single-stage
  // build produced a 1.72 GB image for a demo app.
  output: 'standalone',
  reactStrictMode: true,
  transpilePackages: ['@synapcores/app-framework'],
  typedRoutes: false,
};

export default nextConfig;
