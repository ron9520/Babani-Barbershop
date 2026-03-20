const { DateTime } = require('luxon');
const firebaseService = require('./firebaseService');
const { TZ } = require('../utils/timeUtils');

/**
 * Returns { start, end } ISO strings for the requested period.
 */
function getPeriodRange(period) {
  const now = DateTime.now().setZone(TZ);

  switch (period) {
    case 'today':
      return {
        start: now.startOf('day').toISO(),
        end:   now.endOf('day').toISO()
      };
    case 'week':
      return {
        start: now.startOf('week').toISO(),
        end:   now.endOf('week').toISO()
      };
    case 'month':
      return {
        start: now.startOf('month').toISO(),
        end:   now.endOf('month').toISO()
      };
    default:
      throw new Error(`Invalid period: ${period}`);
  }
}

/**
 * Compute stats for the given period.
 * @param {'today'|'week'|'month'} period
 */
async function getStats(period) {
  const { start, end } = getPeriodRange(period);
  const appointments   = await firebaseService.getAppointmentsInRangeAll(start, end);

  // ── Counts ────────────────────────────────────────────────────────────────
  const total      = appointments.length;
  const confirmed  = appointments.filter(a => a.status === 'confirmed').length;
  const completed  = appointments.filter(a => a.status === 'completed').length;
  const cancelled  = appointments.filter(a => a.status === 'cancelled').length;
  const noShows    = appointments.filter(a => a.status === 'no_show').length;

  // ── Revenue ───────────────────────────────────────────────────────────────
  const active          = appointments.filter(a => !['cancelled', 'no_show'].includes(a.status));
  const expectedRevenue = active.reduce((s, a) => s + (a.servicePrice || 0), 0);
  const actualRevenue   = appointments
    .filter(a => a.status === 'completed')
    .reduce((s, a) => s + (a.servicePrice || 0), 0);

  // ── Popular services ──────────────────────────────────────────────────────
  const serviceCounts = {};
  for (const a of active) {
    const key = a.serviceName || 'אחר';
    serviceCounts[key] = (serviceCounts[key] || 0) + 1;
  }
  const popularServices = Object.entries(serviceCounts)
    .sort((a, b) => b[1] - a[1])
    .map(([name, count]) => ({
      name,
      count,
      percentage: total > 0 ? Math.round((count / active.length) * 100) : 0
    }));

  // ── Peak hours ────────────────────────────────────────────────────────────
  const hourCounts = {};
  for (const a of active) {
    if (!a.startISO) continue;
    const hour = DateTime.fromISO(a.startISO, { zone: TZ }).hour;
    const label = `${String(hour).padStart(2, '0')}:00`;
    hourCounts[label] = (hourCounts[label] || 0) + 1;
  }
  const peakHours = Object.entries(hourCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([hour, count]) => ({ hour, count }));

  // ── Daily breakdown (for charts) ─────────────────────────────────────────
  const dailyMap = {};
  for (const a of active) {
    if (!a.startISO) continue;
    const day = DateTime.fromISO(a.startISO, { zone: TZ }).toFormat('dd/MM');
    if (!dailyMap[day]) dailyMap[day] = { count: 0, revenue: 0 };
    dailyMap[day].count++;
    dailyMap[day].revenue += a.servicePrice || 0;
  }
  const dailyBreakdown = Object.entries(dailyMap)
    .map(([date, data]) => ({ date, ...data }));

  return {
    period,
    range: { start, end },
    totalAppointments:    total,
    confirmedAppointments: confirmed,
    completedAppointments: completed,
    cancelledAppointments: cancelled,
    noShows,
    expectedRevenue,
    actualRevenue,
    popularServices,
    peakHours,
    dailyBreakdown
  };
}

module.exports = { getStats };
