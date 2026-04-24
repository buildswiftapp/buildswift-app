type RateWindow = {
  count: number
  resetAt: number
}

const store = new Map<string, RateWindow>()

export function enforceRateLimit(params: {
  key: string
  limit: number
  windowMs: number
  now?: number
}) {
  const now = params.now ?? Date.now()
  const current = store.get(params.key)

  if (!current || current.resetAt <= now) {
    store.set(params.key, { count: 1, resetAt: now + params.windowMs })
    return { allowed: true, remaining: params.limit - 1, resetAt: now + params.windowMs }
  }

  if (current.count >= params.limit) {
    return { allowed: false, remaining: 0, resetAt: current.resetAt }
  }

  current.count += 1
  store.set(params.key, current)
  return { allowed: true, remaining: params.limit - current.count, resetAt: current.resetAt }
}
