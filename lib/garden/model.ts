export const GROWTH_STAGES = ['等待播种', '播种', '发芽', '长藤', '开花', '结瓜', '长大', '成熟'] as const;
const DAY = 86_400_000;
const OFFSET = 8 * 3_600_000;
export function gardenDate(time: number): string {
  return new Date(time + OFFSET).toISOString().slice(0, 10);
}
export type CheckIn = { day: string; created_at: number };
export type GardenState = {
  today: string; serverNow: number; nextResetAt: number; checkedIn: boolean;
  totalDays: number; streak: number; stage: number; harvestCount: number;
  harvests: { number: number; day: string; createdAt: number }[];
  page: number; totalPages: number;
};
// Rows are ordered by day ascending. Only the server determines the business day.
export function gardenState(rows: CheckIn[], time: number, requestedPage = 1): GardenState {
  const today = gardenDate(time), yesterday = gardenDate(time - DAY);
  const last = rows.at(-1)?.day;
  let streak = 0;
  if (last === today || last === yesterday) {
    let expected = last;
    for (let i = rows.length - 1; i >= 0 && rows[i].day === expected; i--) {
      streak++;
      expected = new Date(Date.parse(expected + 'T00:00:00Z') - DAY).toISOString().slice(0, 10);
    }
  }
  const totalDays = rows.length, harvestCount = Math.floor(totalDays / 7);
  const totalPages = Math.max(1, Math.ceil(harvestCount / 20));
  const page = Math.min(requestedPage, totalPages);
  const harvests = rows.flatMap((r, i) => (i + 1) % 7 === 0 ? [{ number: (i + 1) / 7, day: r.day, createdAt: r.created_at }] : []).reverse().slice((page - 1) * 20, page * 20);
  return { today, serverNow: time, nextResetAt: (Math.floor((time + OFFSET) / DAY) + 1) * DAY - OFFSET,
    checkedIn: last === today, totalDays, streak, stage: totalDays ? (totalDays - 1) % 7 + 1 : 0,
    harvestCount, harvests, page, totalPages };
}
