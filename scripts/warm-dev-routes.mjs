const base = process.env.WARM_BASE_URL || 'http://127.0.0.1:3000'

const routes = [
  '/api/projects',
  '/api/clash-gap/analyses',
  '/api/clash-gap/analyses/00000000-0000-0000-0000-000000000000/status',
  '/api/clash-gap/analyses/00000000-0000-0000-0000-000000000000/stages/chunk/run',
  '/clash-gap-detection/session',
]

async function warm(path) {
  const url = `${base}${path}`
  const started = Date.now()
  try {
    const res = await fetch(url, { method: 'GET', redirect: 'manual' })
    console.log(`[warm-dev-routes] ${res.status} ${path} (${Date.now() - started}ms)`)
  } catch (e) {
    console.warn(`[warm-dev-routes] failed ${path}:`, e instanceof Error ? e.message : e)
  }
}

console.log(`[warm-dev-routes] warming ${routes.length} routes at ${base}…`)
await Promise.all(routes.map((path) => warm(path)))
console.log('[warm-dev-routes] done')
