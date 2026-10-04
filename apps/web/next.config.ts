import type { NextConfig } from 'next';

// A preview deployed with the production database would let testers alter the live market.
if (process.env.VERCEL_ENV === 'preview' &&
    process.env.VERCEL_GIT_COMMIT_REF === 'ui/terminal-layout-preview' &&
    process.env.NEXT_PUBLIC_SPACETIME_DB !== 'the-pit-ui-terminal-preview') {
  throw new Error('UI terminal preview requires NEXT_PUBLIC_SPACETIME_DB=the-pit-ui-terminal-preview');
}

const nextConfig: NextConfig = {
  transpilePackages: ['@the-pit/bindings', '@the-pit/cop'],
  agentRules: false,
};

export default nextConfig;
