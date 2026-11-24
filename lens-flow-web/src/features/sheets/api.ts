import { api, type Movement, type MovementSort, type SheetSummary } from '@/lib/api'

export const sheetKeys = {
  all: ['movements', 'sheets'] as const,
  list: () => ['movements', 'sheets', 'list'] as const,
  day: (date: string, sort?: MovementSort) => ['movements', 'sheets', 'day', date, sort ?? 'recent'] as const,
}

export async function fetchSheets(
  cursor?: string,
): Promise<{ sheets: SheetSummary[]; nextCursor: string | null; serverDate: string }> {
  const { data } = await api.get<{ sheets: SheetSummary[]; nextCursor: string | null; serverDate: string }>(
    '/sheets',
    { params: cursor ? { cursor } : {} },
  )
  return data
}

export interface SheetDay {
  sheet: SheetSummary
  items: Movement[]
  nextCursor: string | null
  serverDate: string
}

export async function fetchSheetDay(date: string, cursor?: string, sort?: MovementSort): Promise<SheetDay> {
  const params: Record<string, string> = {}
  if (cursor) params.cursor = cursor
  if (sort) params.sort = sort
  const { data } = await api.get<SheetDay>(`/sheets/${date}`, { params })
  return data
}
