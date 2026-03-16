const { google } = require('googleapis');
const { DateTime } = require('luxon');
const logger = require('../utils/logger');
const { TZ } = require('../utils/timeUtils');
const config = require('../../config/config.json');

let calendar;

function getCalendar() {
  if (calendar) return calendar;

  const auth = new google.auth.JWT(
    process.env.GOOGLE_CLIENT_EMAIL,
    null,
    process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/g, '\n'),
    ['https://www.googleapis.com/auth/calendar']
  );

  calendar = google.calendar({ version: 'v3', auth });
  return calendar;
}

const CALENDAR_ID = process.env.GOOGLE_CALENDAR_ID || 'primary';

/**
 * Get all events for a specific time slot (to check availability).
 * Returns array of events that overlap with [startISO, endISO).
 */
async function getEventsInSlot(startISO, endISO) {
  const res = await getCalendar().events.list({
    calendarId: CALENDAR_ID,
    timeMin: startISO,
    timeMax: endISO,
    singleEvents: true,
    orderBy: 'startTime'
  });
  return res.data.items || [];
}

/**
 * Check if a slot is free. Includes double-check for race conditions.
 * Returns true if slot is available.
 */
async function isSlotAvailable(startISO, endISO) {
  const events = await getEventsInSlot(startISO, endISO);
  const isFree = events.length === 0;
  if (!isFree) {
    logger.warn('Slot conflict detected', { startISO, endISO, conflicts: events.length });
  }
  return isFree;
}

/**
 * Create a calendar event for an appointment.
 * Returns the created event ID, or null if slot was taken (race condition).
 */
async function createAppointment({ startISO, endISO, customerName, serviceName, phone }) {
  // Double-check availability right before creating
  const available = await isSlotAvailable(startISO, endISO);
  if (!available) {
    logger.warn('Race condition: slot taken just before booking', { startISO, phone });
    return null;
  }

  const event = {
    summary: `✂️ ${customerName} - ${serviceName}`,
    description: `שירות: ${serviceName}\nטלפון: ${phone}`,
    start: { dateTime: startISO, timeZone: TZ },
    end: { dateTime: endISO, timeZone: TZ },
    colorId: '7' // peacock blue
  };

  const res = await getCalendar().events.insert({
    calendarId: CALENDAR_ID,
    resource: event
  });

  logger.info('Calendar event created', { eventId: res.data.id, customerName, startISO });
  return res.data.id;
}

/**
 * Delete a calendar event by ID.
 */
async function deleteAppointment(eventId) {
  await getCalendar().events.delete({
    calendarId: CALENDAR_ID,
    eventId
  });
  logger.info('Calendar event deleted', { eventId });
}

/**
 * Get all busy slots for a given date (Israel DateTime).
 * Returns array of ISO start strings that are booked.
 */
async function getBusySlotsForDate(dt) {
  const startOfDay = dt.startOf('day').toISO();
  const endOfDay = dt.endOf('day').toISO();

  const events = await getEventsInSlot(startOfDay, endOfDay);
  return events
    .filter(e => e.start && e.start.dateTime)
    .map(e => DateTime.fromISO(e.start.dateTime, { zone: TZ }).toFormat('HH:mm'));
}

/**
 * Get appointments for tomorrow (for reminder job).
 */
async function getTomorrowAppointments() {
  const { nowInIsrael } = require('../utils/timeUtils');
  const tomorrow = nowInIsrael().plus({ days: 1 }).startOf('day');
  const start = tomorrow.toISO();
  const end = tomorrow.endOf('day').toISO();

  const events = await getEventsInSlot(start, end);
  return events;
}

module.exports = {
  isSlotAvailable,
  createAppointment,
  deleteAppointment,
  getBusySlotsForDate,
  getTomorrowAppointments
};
