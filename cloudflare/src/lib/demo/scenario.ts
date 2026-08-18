export const DEMO_BUILDING_AREAS = {
  caravan: 10_840,
  mirzo: 8_760,
} as const;

export const DEMO_CARAVAN_MEETING_AGGREGATES = {
  active: {
    votedArea: 4_878,
    eligibleCount: 168,
    participatedCount: 76,
    quorumReached: 0,
    participationPercent: 45,
  },
  historical: {
    votedArea: 7_588,
    eligibleCount: 168,
    participatedCount: 118,
    quorumReached: 1,
    participationPercent: 70,
  },
} as const;
