const cron = require('node-cron');
const { getTomorrowAppointments } = require('../services/calendarService');
const { getAppointmentsInRange } = require('../services/firebaseService');
const { sendMessage } = require('../services/twilioService');
const responses = require('../bot/responses');
const { nowInIsrael, fromISO } = require('../utils/timeUtils');
const logger = require('../utils/logger');
const config = require('../../config/config.json');
const { DateTime } = require('luxon');

/**
 * Sends reminder messages to all customers with appointments tomorrow.
 */
async function sendReminders() {
  logger.info('Running daily reminder job');

  try {
    const tomorrow = nowInIsrael().plus({ days: 1 });
    const startISO = tomorrow.startOf('day').toISO();
    const endISO = tomorrow.endOf('day').toISO();

    // Get appointments from Firestore (includes phone numbers)
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
          serviceName: apt.serviceName,
          dateDisplay: apt.dateDisplay,
          timeDisplay: apt.timeDisplay
        });

        await sendMessage(apt.phone, msg);
        logger.info('Reminder sent', { phone: apt.phone, customerName: apt.customerName });

        // Small delay to avoid Twilio rate limiting
        await new Promise(resolve => setTimeout(resolve, 500));
      } catch (err) {
        logger.error('Failed to send reminder', { phone: apt.phone, error: err.message });
      }
    }
  } catch (err) {
    logger.error('Reminder job failed', { error: err.message, stack: err.stack });
  }
}

/**
 * Schedule the reminder job.
 * Runs daily at the time specified in config (default 08:00).
 */
function scheduleReminders() {
  const [hour, minute] = config.reminderCronTime.split(':').map(Number);
  const cronExpr = `${minute} ${hour} * * *`;

  cron.schedule(cronExpr, sendReminders, {
    timezone: config.shop.timezone
  });

  logger.info(`Reminder job scheduled at ${config.reminderCronTime} (${config.shop.timezone})`);
}

module.exports = { scheduleReminders, sendReminders };
