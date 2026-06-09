import { readFileSync, existsSync, rmSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const devDir = resolve(root, '.next/dev')
const routesFile = resolve(devDir, 'types/routes.d.ts')
const validatorFile = resolve(devDir, 'types/validator.ts')

function isCorruptedRoutes(content) {
  if (/\}\n\s*["']\/api\//m.test(content)) return true
  if ((content.match(/export type ParamsOf/g) || []).length > 1) return true
  if ((content.match(/declare global/g) || []).length > 1) return true
  return false
}

function isCorruptedValidator(content) {
  if (/^\{ AppRoutes/m.test(content.trim())) return true
  return false
}

let remove = false

if (existsSync(routesFile)) {
  try {
    if (isCorruptedRoutes(readFileSync(routesFile, 'utf8'))) remove = true
  } catch {
    remove = true
  }
}

if (!remove && existsSync(validatorFile)) {
  try {
    if (isCorruptedValidator(readFileSync(validatorFile, 'utf8'))) remove = true
  } catch {
    remove = true
  }
}

if (remove) {
  console.log(
    '[ensure-dev-cache] removing corrupted .next/dev (usually from Ctrl+C during compile)',
  )
  rmSync(devDir, { recursive: true, force: true })
}
