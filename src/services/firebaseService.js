const admin = require('firebase-admin');
const logger = require('../utils/logger');
const config = require('../../config/config.json');

let db;

function init() {
  if (admin.apps.length) return;

  admin.initializeApp({
    credential: admin.credential.cert({
      projectId: process.env.FIREBASE_PROJECT_ID,
      clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
      privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, '\n')
    })
  });

  db = admin.firestore();
  logger.info('Firebase initialized');
}

function getDb() {
  if (!db) init();
  return db;
}

// ─── Sessions ────────────────────────────────────────────────────────────────

async function getSession(phone) {
  const doc = await getDb().collection('sessions').doc(phone).get();
  if (!doc.exists) return null;

  const data = doc.data();
  // Auto-expire sessions
  const timeoutMs = config.sessionTimeoutMinutes * 60 * 1000;
  if (Date.now() - data.updatedAt > timeoutMs) {
    await deleteSession(phone);
    return null;
  }
  return data;
}

async function setSession(phone, sessionData) {
  await getDb().collection('sessions').doc(phone).set({
    ...sessionData,
    updatedAt: Date.now()
  });
}

async function deleteSession(phone) {
  await getDb().collection('sessions').doc(phone).delete();
}

// ─── Appointments ─────────────────────────────────────────────────────────────

async function saveAppointment(appointment) {
  const ref = await getDb().collection('appointments').add({
    ...appointment,
    createdAt: admin.firestore.FieldValue.serverTimestamp()
  });
  logger.info('Appointment saved to Firestore', { id: ref.id, phone: appointment.phone });
  return ref.id;
}

async function getAppointmentByPhone(phone) {
  const snap = await getDb()
    .collection('appointments')
    .where('phone', '==', phone)
    .where('status', '==', 'confirmed')
    .orderBy('startISO', 'asc')
    .limit(1)
    .get();

  if (snap.empty) return null;
  const doc = snap.docs[0];
  return { id: doc.id, ...doc.data() };
}

async function getAppointmentById(appointmentId) {
  const doc = await getDb().collection('appointments').doc(appointmentId).get();
  if (!doc.exists) return null;
  return { id: doc.id, ...doc.data() };
}

async function cancelAppointment(appointmentId) {
  await getDb().collection('appointments').doc(appointmentId).update({ status: 'cancelled' });
  logger.info('Appointment cancelled in Firestore', { id: appointmentId });
}

/**
 * Get all confirmed appointments for a given date range (ISO strings).
 */
async function getAppointmentsInRange(startISO, endISO) {
  const snap = await getDb()
    .collection('appointments')
    .where('status', '==', 'confirmed')
    .where('startISO', '>=', startISO)
    .where('startISO', '<', endISO)
    .get();

  return snap.docs.map(d => ({ id: d.id, ...d.data() }));
}

module.exports = {
  init,
  getSession,
  setSession,
  deleteSession,
  saveAppointment,
  getAppointmentById,
  getAppointmentByPhone,
  cancelAppointment,
  getAppointmentsInRange
};
