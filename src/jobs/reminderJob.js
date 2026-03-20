const cron = require('node-cron');
const { getAppointmentsInRange, getAppointmentsInRangeAll, getStatsData, updateAppointmentStatus } = require('../services/firebaseService');
const { nowInIsrael } = require('../utils/timeUtils');
const logger = require('../utils/logger');
const config = require('../../config/config.json');

// NOTE: WhatsApp (Green-API / Twilio) removed 20/03/2026.
// All notification functions below are placeholders — replace sendMessage calls with FCM push when ready.

// ─── Daily Reminders ─────────────────────────────────────────────────────────

async function sendReminders() {
  logger.info('Running daily reminder job');
  try {
    const tomorrow = nowInIsrael().plus({ days: 1 });
    const startISO = tomorrow.startOf('day').toISO();
    const endISO   = tomorrow.endOf('day').toISO();

    const appointments = await getAppointmentsInRange(startISO, endISO);
    if (appointments.length === 0) {
      logger.info('No appointments tomorrow, no reminders to send');
      return;
    }

    logger.info(`Found ${appointments.length} appointments for tomorrow — TODO: send FCM push reminders`);
    for (const apt of appointments) {
      // TODO: replace with FCM push notification
      logger.info('Reminder pending FCM implementation', { phone: apt.phone, customerName: apt.customerName });
    }
  } catch (err) {
    logger.error('Reminder job failed', { error: err.message, stack: err.stack });
  }
}

// ─── Morning Summary for Barber ───────────────────────────────────────────────

async function sendDailySummary() {
  try {
    const today    = nowInIsrael();
    const startISO = today.startOf('day').toISO();
    const endISO   = today.endOf('day').toISO();

    const appointments = await getAppointmentsInRange(startISO, endISO);
    const totalRevenue = appointments.reduce((sum, a) => sum + (a.servicePrice || 0), 0);

    // TODO: replace with FCM push to barber device
    logger.info('Daily summary', { count: appointments.length, revenue: totalRevenue });
  } catch (err) {
    logger.error('Daily summary failed', { error: err.message });
  }
}

// ─── Weekly Report ────────────────────────────────────────────────────────────

async function sendWeeklyReport() {
  try {
    const now           = nowInIsrael();
    const lastWeekEnd   = now.startOf('week').minus({ days: 1 }).endOf('day');
    const lastWeekStart = lastWeekEnd.startOf('week');

    const stats = await getStatsData(lastWeekStart.toISO(), lastWeekEnd.toISO());

    if (stats.total === 0) {
      logger.info('Weekly report: no appointments last week, skipping');
      return;
    }

    // TODO: replace with FCM push to barber device
    logger.info('Weekly report', {
      total: stats.total,
      completed: stats.completed,
      revenue: stats.totalRevenue
    });
  } catch (err) {
    logger.error('Weekly report failed', { error: err.message });
  }
}

// ─── Post-Appointment Follow-up (Review Request) ─────────────────────────────

async function sendReviewRequests() {
  try {
    const now      = nowInIsrael();
    const oneHrAgo = now.minus({ hours: 1 });
    const twoHrAgo = now.minus({ hours: 2 });

    const appointments = await getAppointmentsInRangeAll(twoHrAgo.toISO(), oneHrAgo.toISO());
    const completed = appointments.filter(a => a.status === 'completed' && !a.reviewRequestSent);

    for (const apt of completed) {
      try {
        // TODO: replace with FCM push review request
        logger.info('Review request pending FCM implementation', { phone: apt.phone });

        await updateAppointmentStatus(apt.id, apt.status, { reviewRequestSent: true });
      } catch (err) {
        logger.error('Review request failed', { phone: apt.phone, error: err.message });
      }
    }
  } catch (err) {
    logger.error('Review request job failed', { error: err.message });
  }
}

// ─── Re-booking Nudge (3 weeks after last appointment) ───────────────────────

async function sendRebookingNudges() {
  try {
    const now         = nowInIsrael();
    const targetStart = now.minus({ days: 22 }).startOf('day');
    const targetEnd   = now.minus({ days: 21 }).endOf('day');

    const appointments  = await getAppointmentsInRange(targetStart.toISO(), targetEnd.toISO());
    const completedApts = appointments.filter(a => a.status === 'completed');

    const seen = new Set();
    for (const apt of completedApts) {
      if (seen.has(apt.phone)) continue;
      seen.add(apt.phone);

      // TODO: replace with FCM push rebooking nudge
      logger.info('Rebooking nudge pending FCM implementation', { phone: apt.phone });
    }
  } catch (err) {
    logger.error('Rebooking nudge job failed', { error: err.message });
  }
}

// ─── Schedulers ───────────────────────────────────────────────────────────────

function scheduleReminders() {
  const [hour, minute] = config.reminderCronTime.split(':').map(Number);
  cron.schedule(`${minute} ${hour} * * *`, sendReminders, { timezone: config.shop.timezone });
  logger.info(`Reminder job scheduled at ${config.reminderCronTime} (${config.shop.timezone})`);
}

function scheduleDailySummary() {
  cron.schedule('30 7 * * *', sendDailySummary, { timezone: config.shop.timezone });
  logger.info('Daily summary job scheduled at 07:30');
}

function scheduleWeeklyReport() {
  cron.schedule('0 7 * * 0', sendWeeklyReport, { timezone: config.shop.timezone });
  logger.info('Weekly report job scheduled (Sunday 07:00)');
}

function scheduleReviewRequests() {
  cron.schedule('0 * * * *', sendReviewRequests, { timezone: config.shop.timezone });
  logger.info('Review request job scheduled (hourly)');
}

function scheduleRebookingNudges() {
  cron.schedule('0 11 * * *', sendRebookingNudges, { timezone: config.shop.timezone });
  logger.info('Rebooking nudge job scheduled (daily 11:00)');
}

function scheduleKeepAlive(serverUrl) {
  if (process.env.NODE_ENV !== 'production' || !serverUrl) return;
  cron.schedule('*/14 * * * *', async () => {
    try {
      const https  = require('https');
      const http   = require('http');
      const client = serverUrl.startsWith('https') ? https : http;
      client.get(`${serverUrl}/health`, () => {}).on('error', () => {});
    } catch (_) {}
  });
  logger.info('Keep-alive job scheduled (every 14 min)');
}

function scheduleAll(serverUrl) {
  scheduleReminders();
  scheduleDailySummary();
  scheduleWeeklyReport();
  scheduleReviewRequests();
  scheduleRebookingNudges();
  scheduleKeepAlive(serverUrl);
}

module.exports = {
  scheduleReminders,
  scheduleDailySummary,
  scheduleWeeklyReport,
  scheduleReviewRequests,
  scheduleRebookingNudges,
  scheduleKeepAlive,
  scheduleAll,
  sendReminders,
  sendWeeklyReport,
  sendDailySummary
};
