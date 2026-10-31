import { gardenDate } from "./model.ts";

export const COOP_GOAL = 35;
export const COOP_CAPACITY = 10;
export const COOP_MEMBERSHIPS = 3;
export const COOP_PAGE_SIZE = 20;
export function coopStage(growth: number) {
  return growth >= COOP_GOAL
    ? 7
    : growth <= 0
      ? 0
      : Math.ceil((growth * 6) / COOP_GOAL);
}
export function coopClock(time: number) {
  return {
    serverNow: time,
    today: gardenDate(time),
    nextResetAt:
      (Math.floor((time + 28_800_000) / 86_400_000) + 1) * 86_400_000 -
      28_800_000,
  };
}
export type CoopCard = {
  id: string;
  name: string;
  intro: string;
  ownerId: string | null;
  ownerNickname: string | null;
  round: number;
  growth: number;
  stage: number;
  mature: boolean;
  maturedDay: string | null;
  memberCount: number;
  harvestCount: number;
  createdAt: number;
  lastWateredAt: number;
};
export type CoopMember = {
  userId: string;
  nickname: string;
  joinedAt: number;
  canParticipate: boolean;
  roundContribution: number;
  totalContribution: number;
  wateredToday: boolean;
};
export type CoopMemory = {
  coopId: string;
  name: string;
  round: number;
  day: string;
  awardedAt: number;
  contribution: number;
};
export type CoopMe = ReturnType<typeof coopClock> & {
  gardens: CoopCard[];
  todayWater: { coopId: string; name: string } | null;
  memories: CoopMemory[];
  total: number;
  page: number;
  totalPages: number;
};
export type CoopDetail = ReturnType<typeof coopClock> & {
  garden: CoopCard;
  members: CoopMember[];
  activity: {
    id: string;
    nickname: string;
    userId: string;
    round: number;
    createdAt: number;
  }[];
  harvests: {
    round: number;
    day: string;
    createdAt: number;
    contributors: number;
  }[];
  page: number;
  total: number;
  totalPages: number;
};
export type CoopList = ReturnType<typeof coopClock> & {
  items: CoopCard[];
  page: number;
  total: number;
  totalPages: number;
  q: string;
};
