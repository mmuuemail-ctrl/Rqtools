export type AntiAbuseDecision = {
  shouldCount: boolean;
  blockedReason: string | null;
};

export type ExistingScan = {
  viewed_at: string;
  was_counted: boolean;
};

export function evaluateAntiAbuse(existingScans: ExistingScan[]) {
  const countedScans = existingScans
    .filter((item) => item.was_counted)
    .map((item) => new Date(item.viewed_at))
    .filter((date) => !Number.isNaN(date.getTime()))
    .sort((a, b) => a.getTime() - b.getTime());

  if (countedScans.length === 0) {
    return {
      shouldCount: true,
      blockedReason: null
    } satisfies AntiAbuseDecision;
  }

  const now = Date.now();
  const lastCounted = countedScans[countedScans.length - 1].getTime();
  const minutesSinceLast = (now - lastCounted) / 1000 / 60;

  if (minutesSinceLast >= 60) {
    return {
      shouldCount: true,
      blockedReason: null
    } satisfies AntiAbuseDecision;
  }

  const twoMinutesAgo = now - 2 * 60 * 1000;
  const countedInLastTwoMinutes = countedScans.filter(
    (date) => date.getTime() >= twoMinutesAgo
  ).length;

  if (countedInLastTwoMinutes < 4) {
    return {
      shouldCount: true,
      blockedReason: null
    } satisfies AntiAbuseDecision;
  }

  const oneMinuteAgo = now - 60 * 1000;
  const countedInLastMinute = countedScans.filter(
    (date) => date.getTime() >= oneMinuteAgo
  ).length;

  if (countedInLastMinute >= 1) {
    return {
      shouldCount: false,
      blockedReason: "anti_abuse_minute_limit"
    } satisfies AntiAbuseDecision;
  }

  return {
    shouldCount: true,
    blockedReason: null
  } satisfies AntiAbuseDecision;
}
