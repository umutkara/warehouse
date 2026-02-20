export function resolvePeriodRange(period: string, now = new Date()) {
  if (period === "today") {
    return {
      startDate: new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 0, 0, 0),
      ),
      endDate: new Date(
        Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 23, 59, 59),
      ),
    };
  }

  if (period === "yesterday") {
    const yesterdayUTC = new Date(now);
    yesterdayUTC.setUTCDate(yesterdayUTC.getUTCDate() - 1);
    return {
      startDate: new Date(
        Date.UTC(
          yesterdayUTC.getUTCFullYear(),
          yesterdayUTC.getUTCMonth(),
          yesterdayUTC.getUTCDate(),
          0,
          0,
          0,
        ),
      ),
      endDate: new Date(
        Date.UTC(
          yesterdayUTC.getUTCFullYear(),
          yesterdayUTC.getUTCMonth(),
          yesterdayUTC.getUTCDate(),
          23,
          59,
          59,
        ),
      ),
    };
  }

  const startDate = new Date(now);
  startDate.setDate(startDate.getDate() - 30);
  return {
    startDate,
    endDate: now,
  };
}
