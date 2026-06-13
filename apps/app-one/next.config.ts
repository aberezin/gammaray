import type { NextConfig } from 'next'

const config: NextConfig = {
  transpilePackages: ['@gammaray/core', '@gammaray/auth', '@gammaray/ui'],
}

export default config
