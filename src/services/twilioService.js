const twilio = require('twilio');
const logger = require('../utils/logger');

let client;

function getClient() {
  if (!client) {
    client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
  }
  return client;
}

/**
 * Send a WhatsApp message.
 * @param {string} to   - e.g. "whatsapp:+972501234567"
 * @param {string} body - message text
 */
async function sendMessage(to, body) {
  try {
    const msg = await getClient().messages.create({
      from: process.env.TWILIO_WHATSAPP_FROM,
      to,
      body
    });
    logger.info('WhatsApp message sent', { to, sid: msg.sid });
    return msg;
  } catch (err) {
    logger.error('Failed to send WhatsApp message', { to, error: err.message });
    throw err;
  }
}

/**
 * Notify the barber about a new appointment.
 * @param {object} appointment
 * @param {boolean} [fromWeb=false] - true if booked via web page
 */
async function notifyBarber(appointment, fromWeb = false) {
  const source = fromWeb ? ' 🌐' : '';
  const msg =
    `✂️ *תור חדש במספרת בבאני*${source}\n\n` +
    `👤 שם: ${appointment.customerName}\n` +
    `📅 תאריך: ${appointment.dateDisplay}\n` +
    `🕐 שעה: ${appointment.timeDisplay}\n` +
    `💈 שירות: ${appointment.serviceName}\n` +
    `💰 מחיר: ₪${appointment.servicePrice}\n` +
    `📱 טלפון: ${appointment.phone.replace('whatsapp:', '')}`;

  await sendMessage(process.env.BARBER_WHATSAPP, msg);
}

/**
 * Notify the barber that an appointment was cancelled.
 */
async function notifyBarberCancellation(appointment) {
  const msg =
    `🗑️ *תור בוטל*\n\n` +
    `👤 שם: ${appointment.customerName}\n` +
    `💈 שירות: ${appointment.serviceName}\n` +
    `📅 תאריך: ${appointment.dateDisplay} | 🕐 ${appointment.timeDisplay}\n` +
    `📱 טלפון: ${appointment.phone.replace('whatsapp:', '')}`;

  await sendMessage(process.env.BARBER_WHATSAPP, msg);
}

/**
 * Normalize a phone number to Twilio WhatsApp format.
 * Input can be "whatsapp:+972..." or just "+972..." or "0501234567"
 */
function normalizePhone(raw) {
  if (!raw) return null;
  if (raw.startsWith('whatsapp:')) return raw;
  if (raw.startsWith('+')) return `whatsapp:${raw}`;
  if (raw.startsWith('05')) return `whatsapp:+972${raw.slice(1)}`;
  return `whatsapp:${raw}`;
}

module.exports = { sendMessage, notifyBarber, notifyBarberCancellation, normalizePhone };
