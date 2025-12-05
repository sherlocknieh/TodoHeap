/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'export',
  basePath: '/next',
  assetPrefix: '/next/',
  images: {
    unoptimized: true,
  },
}

module.exports = nextConfig
