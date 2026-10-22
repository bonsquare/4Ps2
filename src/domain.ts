export type Province = { id: string; name: string; target: number; accomplished: number; today: number }
export type UserScope = { role: 'regional' | 'provincial'; provinceId?: string }

export function aggregateProvinces(provinces: Province[]) {
  const unique = [...new Map(provinces.map((province) => [province.id, province])).values()]
  const target = unique.reduce((sum, item) => sum + item.target, 0)
  const accomplished = unique.reduce((sum, item) => sum + item.accomplished, 0)
  return {
    target,
    accomplished,
    remaining: Math.max(target - accomplished, 0),
    percentage: target > 0 ? Math.round((accomplished / target) * 1000) / 10 : null,
    today: unique.reduce((sum, item) => sum + item.today, 0),
  }
}

export function filterDailySeries<T extends { date: string }>(rows: T[], from: string, to: string) {
  return rows.filter((row) => row.date >= from && row.date <= to)
}

export function provinceIsAllowed(user: UserScope, requestedProvinceId: string) {
  return user.role === 'regional' || user.provinceId === requestedProvinceId
}
