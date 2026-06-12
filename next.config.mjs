import { execSync } from 'node:child_process'

/** @type {import('next').NextConfig} */
function hostFromAppUrl(url) {
  if (!url) return null
  try {
    return new URL(url).hostname
  } catch {
    return null
  }
}

function detectExternalIp() {
  for (const cmd of [
    'curl -s --max-time 3 ifconfig.me',
    'curl -s --max-time 3 icanhazip.com',
  ]) {
    try {
      const ip = execSync(cmd, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim()
      if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) return ip
    } catch {
      // try next provider
    }
  }
  return null
}

const allowedDevOrigins = [
  'localhost',
  '127.0.0.1',
  ...(process.env.ALLOWED_DEV_ORIGINS?.split(',')
    .map((value) => value.trim())
    .filter(Boolean) ?? []),
]

for (const host of [
  hostFromAppUrl(process.env.NEXT_PUBLIC_APP_URL),
  detectExternalIp(),
]) {
  if (host && !allowedDevOrigins.includes(host)) {
    allowedDevOrigins.push(host)
  }
}

const nextConfig = {
  output: 'standalone',
  serverExternalPackages: ['@napi-rs/canvas'],
  typescript: {
    ignoreBuildErrors: true,
  },
  images: {
    unoptimized: true,
  },
  experimental: {
    proxyClientMaxBodySize: '1gb',
  },
  ...(allowedDevOrigins.length > 0 ? { allowedDevOrigins } : {}),
}

export default nextConfig
