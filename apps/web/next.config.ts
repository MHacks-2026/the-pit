import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@the-pit/bindings'],
  agentRules: false,
};

export default nextConfig;
