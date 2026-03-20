const cron = require('node-cron');
const { getAppointmentsInRange, getStatsData } = require('../services/firebaseService');
const { sendMessage } = require('../services/whatsappService');
const responses = require('../bot/responses');
const { nowInIsrael } = require('../utils/timeUtils');
const logger = require('../utils/logger');
const config = require('../../config/config.json');

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

    logger.info(`Sending ${appointments.length} reminders`);
    for (const apt of appointments) {
      try {
        const msg = responses.reminder({
          customerName: apt.customerName,
          serviceName:  apt.serviceName,
          dateDisplay:  apt.dateDisplay,
          timeDisplay:  apt.timeDisplay
        });
        await sendMessage(apt.phone, msg);
        logger.info('Reminder sent', { phone: apt.phone, customerName: apt.customerName });
        await new Promise(r => setTimeout(r, 500));
      } catch (err) {
        logger.error('Failed to send reminder', { phone: apt.phone, error: err.message });
      }
    }
  } catch (err) {
    logger.error('Reminder job failed', { error: err.message, stack: err.stack });
  }
}

// ─── Morning Summary for Barber ───────────────────────────────────────────────

async function sendDailySummary() {
  const barberPhone = process.env.BARBER_PHONE;
  if (!barberPhone) return;

  try {
    const today    = nowInIsrael();
    const startISO = today.startOf('day').toISO();
    const endISO   = today.endOf('day').toISO();

    const appointments = await getAppointmentsInRange(startISO, endISO);
    if (appointments.length === 0) {
      await sendMessage(barberPhone, `☀️ *בוקר טוב חיים!*\n\nאין תורים קבועים להיום. יום נינוח! 😎`);
      return;
    }

    const firstApt = appointments[0];
    const totalRevenue = appointments.reduce((sum, a) => sum + (a.servicePrice || 0), 0);

    const aptLines = appointments
      .map((a, i) => `${i + 1}. ${a.timeDisplay} — ${a.customerName} (${a.serviceName})`)
      .join('\n');

    const msg =
      `☀️ *בוקר טוב חיים!*\n\n` +
      `📅 היום יש לך *${appointments.length} תורים*\n` +
      `💰 הכנסה צפויה: *₪${totalRevenue}*\n` +
      `🕐 תור ראשון: ${firstApt.timeDisplay}\n\n` +
      `📋 *רשימת התורים:*\n${aptLines}\n\n` +
      `_תורים מנוהלים דרך הפאנל_`;

    await sendMessage(barberPhone, msg);
    logger.info('Daily summary sent', { count: appointments.length });
  } catch (err) {
    logger.error('Daily summary failed', { error: err.message });
  }
}

// ─── Weekly Report ────────────────────────────────────────────────────────────

async function sendWeeklyReport() {
  const barberPhone = process.env.BARBER_PHONE;
  if (!barberPhone) return;

  try {
    const now      = nowInIsrael();
    // Report for the previous week (Sunday → Saturday)
    const lastWeekEnd   = now.startOf('week').minus({ days: 1 }).endOf('day');
    const lastWeekStart = lastWeekEnd.startOf('week');

    const stats = await getStatsData(lastWeekStart.toISO(), lastWeekEnd.toISO());

    if (stats.total === 0) {
      logger.info('Weekly report: no appointments last week, skipping');
      return;
    }

    const topService = stats.popularServices[0]?.name || '—';
    const peakHour   = stats.peakHours[0]?.hour || '—';

    const msg =
      `📊 *דוח שבועי — ${lastWeekStart.toFormat('dd/MM')} עד ${lastWeekEnd.toFormat('dd/MM')}*\n\n` +
      `✂️ סה"כ תורים: *${stats.total}*\n` +
      `✅ הושלמו: ${stats.completed}\n` +
      `❌ בוטלו: ${stats.cancelled}\n` +
      `👻 לא הגיעו: ${stats.noShow}\n\n` +
      `💰 הכנסות בפועל: *₪${stats.totalRevenue}*\n` +
      `💰 צפי שהושלם: ₪${stats.expectedRevenue}\n\n` +
      `💈 שירות פופולרי: ${topService}\n` +
      `🕐 שעת שיא: ${peakHour}\n\n` +
      `_שבוע טוב ומוצלח! 💪_`;

    await sendMessage(barberPhone, msg);
    logger.info('Weekly report sent');
  } catch (err) {
    logger.error('Weekly report failed', { error: err.message });
  }
}

// ─── Post-Appointment Follow-up (Review Request) ─────────────────────────────

/**
 * Runs hourly. Finds appointments that completed ~1 hour ago
 * and haven't received a review request yet, then sends one.
 */
async function sendReviewRequests() {
  try {
    const now      = nowInIsrael();
    const oneHrAgo = now.minus({ hours: 1 });
    const twoHrAgo = now.minus({ hours: 2 });

    // Get completed appointments in the 1-2 hour window
    const { getAppointmentsInRangeAll } = require('../services/firebaseService');
    const appointments = await getAppointmentsInRangeAll(twoHrAgo.toISO(), oneHrAgo.toISO());
    const completed = appointments.filter(a => a.status === 'completed' && !a.reviewRequestSent);

    for (const apt of completed) {
      try {
        const reviewUrl = process.env.GOOGLE_REVIEW_URL || '';
        const msg =
          `💈 *תודה שביקרת במספרת בבאני!*\n\n` +
          `שלום ${apt.customerName} 😊\n\n` +
          `מקווים שנהנית! תשאיר לנו ביקורת קצרה?\n` +
          (reviewUrl ? `⭐ ${reviewUrl}\n\n` : '') +
          `_זה עוזר לנו מאוד!_`;

        await sendMessage(apt.phone, msg);

        // Mark as sent
        const { updateAppointmentStatus } = require('../services/firebaseService');
        await updateAppointmentStatus(apt.id, apt.status, { reviewRequestSent: true });

        logger.info('Review request sent', { phone: apt.phone });
        await new Promise(r => setTimeout(r, 400));
      } catch (err) {
        logger.error('Review request failed', { phone: apt.phone, error: err.message });
      }
    }
  } catch (err) {
    logger.error('Review request job failed', { error: err.message });
  }
}

// ─── Re-booking Nudge (3 weeks after last appointment) ───────────────────────

/**
 * Runs daily. Finds customers whose last completed appointment was exactly 21 days ago
 * and sends them a friendly nudge to rebook.
 */
async function sendRebookingNudges() {
  try {
    const now          = nowInIsrael();
    const targetStart  = now.minus({ days: 22 }).startOf('day');
    const targetEnd    = now.minus({ days: 21 }).endOf('day');

    const appointments = await getAppointmentsInRange(targetStart.toISO(), targetEnd.toISO());
    const completedApts = appointments.filter(a => a.status === 'completed');

    // Deduplicate by phone — only one nudge per customer
    const seen = new Set();
    for (const apt of completedApts) {
      if (seen.has(apt.phone)) continue;
      seen.add(apt.phone);

      try {
        const bookUrl = process.env.SERVER_URL || '';
        const msg =
          `💈 *הגיע הזמן לתספורת הבאה!*\n\n` +
          `שלום ${apt.customerName} 👋\n\n` +
          `עברו כבר 3 שבועות מהביקור האחרון שלך.\n` +
          `קבע תור עכשיו לפני שהמקומות יתמלאו!\n\n` +
          (bookUrl ? `📅 ${bookUrl}\n\n` : '') +
          `_מספרת בבאני — Look Sharp. Feel Sharp._ ✂️`;

        await sendMessage(apt.phone, msg);
        logger.info('Rebooking nudge sent', { phone: apt.phone });
        await new Promise(r => setTimeout(r, 400));
      } catch (err) {
        logger.error('Rebooking nudge failed', { phone: apt.phone, error: err.message });
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
  // Every day at 07:30 — morning briefing for the barber
  cron.schedule('30 7 * * *', sendDailySummary, { timezone: config.shop.timezone });
  logger.info('Daily summary job scheduled at 07:30');
}

function scheduleWeeklyReport() {
  // Every Sunday at 07:00
  cron.schedule('0 7 * * 0', sendWeeklyReport, { timezone: config.shop.timezone });
  logger.info('Weekly report job scheduled (Sunday 07:00)');
}

function scheduleReviewRequests() {
  // Every hour
  cron.schedule('0 * * * *', sendReviewRequests, { timezone: config.shop.timezone });
  logger.info('Review request job scheduled (hourly)');
}

function scheduleRebookingNudges() {
  // Every day at 11:00
  cron.schedule('0 11 * * *', sendRebookingNudges, { timezone: config.shop.timezone });
  logger.info('Rebooking nudge job scheduled (daily 11:00)');
}

/**
 * Keep Render free tier awake.
 */
function scheduleKeepAlive(serverUrl) {
  if (process.env.NODE_ENV !== 'production' || !serverUrl) return;
  cron.schedule('*/14 * * * *', async () => {
    try {
      const https = require('https');
      const http  = require('http');
      const client = serverUrl.startsWith('https') ? https : http;
      client.get(`${serverUrl}/health`, () => {}).on('error', () => {});
    } catch (_) {}
  });
  logger.info('Keep-alive job scheduled (every 14 min)');
}

/**
 * Register all jobs.
 */
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
