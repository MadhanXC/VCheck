/** @type {import('next').NextConfig} */
const nextConfig = {
  // ✅ Skip TypeScript errors during build
  typescript: {
    ignoreBuildErrors: true,
  },

  // ✅ Skip ESLint during build
  eslint: {
    ignoreDuringBuilds: true,
  },

  // ✅ Required for Netlify
  images: {
    unoptimized: true,
    domains: ["images.unsplash.com"],
  },

  // ✅ Safe webpack fallback only (no chunk overrides)
  webpack: (config) => {
    config.resolve.fallback = {
      ...config.resolve.fallback,
      fs: false,
      net: false,
      tls: false,
      crypto: false,
      encoding: false,
    };
    return config;
  },
};

module.exports = nextConfig;
