const firebaseService = require('../services/firebaseService');
const logger = require('../utils/logger');

/**
 * Session states for the booking flow.
 */
const STATE = {
  IDLE: 'IDLE',
  CHOOSE_ACTION: 'CHOOSE_ACTION',
  CHOOSE_SERVICE: 'CHOOSE_SERVICE',
  CHOOSE_DATE: 'CHOOSE_DATE',
  CHOOSE_TIME: 'CHOOSE_TIME',
  ENTER_NAME: 'ENTER_NAME',
  CONFIRM: 'CONFIRM',
  CANCEL_CONFIRM: 'CANCEL_CONFIRM'
};

async function getSession(phone) {
  try {
    return await firebaseService.getSession(phone);
  } catch (err) {
    logger.error('Error getting session', { phone, error: err.message });
    return null;
  }
}

async function setSession(phone, data) {
  try {
    await firebaseService.setSession(phone, data);
  } catch (err) {
    logger.error('Error setting session', { phone, error: err.message });
  }
}

async function clearSession(phone) {
  try {
    await firebaseService.deleteSession(phone);
  } catch (err) {
    logger.error('Error clearing session', { phone, error: err.message });
  }
}

async function updateSession(phone, updates) {
  const current = (await getSession(phone)) || {};
  await setSession(phone, { ...current, ...updates });
}

module.exports = { getSession, setSession, clearSession, updateSession, STATE };
