export const SUPABASE_PAGE_SIZE = 1000

type PageResult<T> = { data: T[] | null; error: { message: string } | null }

type PageFetcher<T> = (from: number, to: number) => PromiseLike<PageResult<T>>

export async function fetchAllRows<T>(
  fetchPage: PageFetcher<T>,
  pageSize = SUPABASE_PAGE_SIZE,
): Promise<T[]> {
  const out: T[] = []
  let offset = 0
  for (;;) {
    const { data, error } = await fetchPage(offset, offset + pageSize - 1)
    if (error) throw new Error(error.message)
    const page = data ?? []
    out.push(...page)
    if (page.length < pageSize) break
    offset += pageSize
  }
  return out
}
