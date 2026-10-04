import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  transpilePackages: ['@the-pit/bindings', '@the-pit/cop'],
  agentRules: false,
};

export default nextConfig;
