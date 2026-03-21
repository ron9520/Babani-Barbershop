const cron = require('node-cron');
const { getAppointmentsInRange, getAppointmentsInRangeAll, getStatsData, updateAppointmentStatus } = require('../services/firebaseService');
const notificationService = require('../services/notificationService');
const { nowInIsrael } = require('../utils/timeUtils');
const logger = require('../utils/logger');
const config = require('../../config/config.json');

// ─── Daily Reminders (sent day before appointment) ────────────────────────────

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

    logger.info(`Sending FCM reminders for ${appointments.length} appointments`);
    for (const apt of appointments) {
      try {
        await notificationService.notifyCustomerReminder(apt.phone, {
          dateDisplay: apt.dateDisplay,
          timeDisplay: apt.timeDisplay,
          serviceName: apt.serviceName
        });
      } catch (err) {
        logger.warn('Reminder failed for appointment', { id: apt.id, error: err.message });
      }
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

    const count = appointments.length;
    if (count === 0) {
      await notificationService.sendToAdmin('☀️ בוקר טוב! יום ריק', 'אין תורים להיום.');
    } else {
      await notificationService.sendToAdmin(
        `☀️ יש לך ${count} תורים היום`,
        `הכנסות צפויות: ₪${totalRevenue}`
      );
    }
    logger.info('Daily summary sent', { count, revenue: totalRevenue });
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

    await notificationService.sendToAdmin(
      `📊 דוח שבועי — ${stats.completed} תורים`,
      `הכנסות: ₪${stats.totalRevenue} | ביטולים: ${stats.cancelled}`
    );

    logger.info('Weekly report sent', {
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
    const completed = appointments.filter(a => a.status === 'completed' && !a.reviewRequestSent && !a.rating);

    for (const apt of completed) {
      try {
        await notificationService.sendToCustomer(
          apt.phone,
          'איך היה? ⭐',
          `תודה שביקרת ב${config.shop?.name || 'מספרת בבאני'}! כנס לאפליקציה ותן דירוג.`
        );
        await updateAppointmentStatus(apt.id, apt.status, { reviewRequestSent: true });
        logger.info('Review request sent', { phone: apt.phone });
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

      try {
        await notificationService.sendToCustomer(
          apt.phone,
          'הגיע הזמן לתספורת! ✂️',
          'עברו 3 שבועות מהביקור האחרון שלך. קבע תור עכשיו!'
        );
        logger.info('Rebooking nudge sent', { phone: apt.phone });
      } catch (err) {
        logger.warn('Rebooking nudge failed', { phone: apt.phone, error: err.message });
      }
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
