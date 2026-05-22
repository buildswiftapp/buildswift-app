/** @type {import('next').NextConfig} */
const nextConfig = {
  // pdfjs-dist is ESM-only — must be bundled, not externalized (require() would fail).
  serverExternalPackages: ['@napi-rs/canvas'],
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
}

export default nextConfig
