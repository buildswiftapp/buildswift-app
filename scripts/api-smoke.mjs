/* eslint-disable no-console */
const baseUrl = process.env.API_BASE_URL || 'http://localhost:3000'

async function call(path, init) {
  const res = await fetch(baseUrl + path, init)
  const text = await res.text()
  return { status: res.status, body: text }
}

async function run() {
  const checks = []

  checks.push({
    name: 'Projects route requires auth',
    run: () => call('/api/projects', { method: 'GET' }),
    expect: (r) => r.status === 401,
  })

  checks.push({
    name: 'AI endpoint validates payload',
    run: () =>
      call('/api/ai/generate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      }),
    expect: (r) => r.status === 400 || r.status === 401,
  })

  checks.push({
    name: 'Missing scope AI validates payload',
    run: () =>
      call('/api/ai/missing-scope', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({}),
      }),
    expect: (r) => r.status === 400 || r.status === 401,
  })

  let failed = 0
  for (const check of checks) {
    try {
      const result = await check.run()
      const ok = check.expect(result)
      if (!ok) {
        failed += 1
        console.error(`FAIL: ${check.name} -> ${result.status}`)
      } else {
        console.log(`PASS: ${check.name} -> ${result.status}`)
      }
    } catch (error) {
      failed += 1
      console.error(`FAIL: ${check.name} -> ${error instanceof Error ? error.message : String(error)}`)
    }
  }

  if (failed > 0) {
    process.exitCode = 1
  }
}

run()
