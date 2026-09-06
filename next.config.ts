import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // Vinext inspects multipart requests before dispatching API routes.
  // Allow the app's 20 MiB audio uploads plus multipart overhead; each route
  // still enforces its own 8 MiB image / 20 MiB audio limit.
  experimental: { serverActions: { bodySizeLimit: '21mb' } },
};

export default nextConfig;
