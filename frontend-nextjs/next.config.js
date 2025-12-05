/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  output: 'export',
  basePath: '/TodoHeap/next',
  assetPrefix: '/TodoHeap/next/',
  images: {
    unoptimized: true,
  },
}

module.exports = nextConfig
