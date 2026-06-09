import { copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '..')

function parseEnv(content) {
  const map = new Map()
  for (const line of content.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    const value = trimmed.slice(eq + 1).trim()
    map.set(key, value)
  }
  return map
}

const REQUIRED_APP_KEYS = [
  'CLASH_GAP_WORKER_URL',
  'CLASH_GAP_WORKER_SECRET',
  'CLASH_GAP_BUCKET',
]

function ensureFile(from, to, label) {
  if (existsSync(to)) return false
  if (!existsSync(from)) {
    console.warn(`[ensure-dev-env] Template missing: ${from}`)
    return false
  }
  copyFileSync(from, to)
  console.log(`[ensure-dev-env] Created ${label} ← ${from.replace(`${root}/`, '')}`)
  return true
}

function mergeMissingKeys(targetPath, templatePath, keys, label) {
  if (!existsSync(targetPath) || !existsSync(templatePath)) return false

  const target = readFileSync(targetPath, 'utf8')
  const template = parseEnv(readFileSync(templatePath, 'utf8'))
  const missing = keys.filter((key) => {
    if (new RegExp(`^${key}=`, 'm').test(target)) return false
    return template.has(key) && template.get(key)
  })

  if (!missing.length) return false

  const block = [
    '',
    '# Clash/Gap worker (added by scripts/ensure-dev-env.mjs)',
    ...missing.map((key) => `${key}=${template.get(key)}`),
  ].join('\n')

  writeFileSync(targetPath, target.replace(/\s*$/, '') + block + '\n', 'utf8')
  console.log(`[ensure-dev-env] Added to ${label}: ${missing.join(', ')}`)
  return true
}

const created = []

if (ensureFile(join(root, '.env.example'), join(root, '.env.local'), '.env.local')) {
  created.push('.env.local')
}

const merged = mergeMissingKeys(
  join(root, '.env.local'),
  join(root, '.env.example'),
  REQUIRED_APP_KEYS,
  '.env.local',
)

const workerDir = join(root, 'services/clash-gap-worker')
let workerCreated = false
if (ensureFile(join(workerDir, '.env.example'), join(workerDir, '.env'), 'services/clash-gap-worker/.env')) {
  created.push('services/clash-gap-worker/.env')
  workerCreated = true
}

if (created.length || merged || workerCreated) {
  console.log('[ensure-dev-env] Restart `npm run dev` after env changes.')
  console.log('[ensure-dev-env] Start worker: npm run dev:worker')
}
