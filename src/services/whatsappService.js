const logger = require('../utils/logger');

const GREEN_API_URL = 'https://api.green-api.com';

/**
 * Normalize a phone number to digits-only format (no +, no @c.us).
 * e.g. "0523385554" → "972523385554"
 *      "+972523385554" → "972523385554"
 *      "972523385554@c.us" → "972523385554"
 */
function normalizePhone(raw) {
  if (!raw) return null;
  let num = raw.replace('whatsapp:', '').replace('@c.us', '').replace(/\s|-/g, '');
  if (num.startsWith('+')) num = num.slice(1);
  if (num.startsWith('05')) num = '972' + num.slice(1);
  return num;
}

/**
 * Send a WhatsApp text message via Green-API.
 * @param {string} to   - phone number (any format)
 * @param {string} body - message text
 */
async function sendMessage(to, body) {
  const phone = normalizePhone(to);
  const instanceId = process.env.GREEN_API_INSTANCE_ID;
  const token = process.env.GREEN_API_TOKEN;

  const res = await fetch(`${GREEN_API_URL}/waInstance${instanceId}/sendMessage/${token}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chatId: `${phone}@c.us`,
      message: body
    })
  });

  const data = await res.json();

  if (!res.ok) {
    logger.error('Green-API error', { to: phone, error: data });
    throw new Error(data.message || 'Green-API error');
  }

  logger.info('WhatsApp message sent', { to: phone, messageId: data.idMessage });
  return data;
}

/**
 * Notify the barber about a new appointment.
 * @param {object} appointment
 * @param {boolean} [fromWeb=false]
 */
async function notifyBarber(appointment, fromWeb = false) {
  const source = fromWeb ? ' 🌐' : '';
  const phone = appointment.phone;
  const msg =
    `✂️ *תור חדש במספרת בבאני*${source}\n\n` +
    `👤 שם: ${appointment.customerName}\n` +
    `📅 תאריך: ${appointment.dateDisplay}\n` +
    `🕐 שעה: ${appointment.timeDisplay}\n` +
    `💈 שירות: ${appointment.serviceName}\n` +
    `💰 מחיר: ₪${appointment.servicePrice}\n` +
    `📱 טלפון: ${normalizePhone(phone)}`;

  await sendMessage(process.env.BARBER_PHONE, msg);
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
    `📱 טלפון: ${normalizePhone(appointment.phone)}`;

  await sendMessage(process.env.BARBER_PHONE, msg);
}

module.exports = { sendMessage, notifyBarber, notifyBarberCancellation, normalizePhone };
