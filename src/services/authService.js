const jwt = require('jsonwebtoken');
const admin = require('firebase-admin');
const logger = require('../utils/logger');

const ADMIN_TOKEN_EXPIRY   = '24h';
const CUSTOMER_TOKEN_EXPIRY = '30d';
const OTP_TTL_MS   = 5 * 60 * 1000;      // 5 minutes
const LOCK_TTL_MS  = 10 * 60 * 1000;     // 10 minutes
const MAX_ATTEMPTS = 3;

function getSecret() {
  const s = process.env.JWT_SECRET;
  if (!s) throw new Error('JWT_SECRET env var is not set');
  return s;
}

// ─── Admin ────────────────────────────────────────────────────────────────────

function verifyAdminPin(pin) {
  return pin === process.env.ADMIN_PIN;
}

function signAdminToken() {
  return jwt.sign({ role: 'admin' }, getSecret(), { expiresIn: ADMIN_TOKEN_EXPIRY });
}

// ─── Customer ─────────────────────────────────────────────────────────────────

function signCustomerToken(phone) {
  return jwt.sign({ role: 'customer', phone }, getSecret(), { expiresIn: CUSTOMER_TOKEN_EXPIRY });
}

// ─── Generic verify ───────────────────────────────────────────────────────────

/**
 * Verify any JWT token.
 * Returns decoded payload or throws.
 */
function verifyToken(token) {
  return jwt.verify(token, getSecret());
}

// ─── OTP ──────────────────────────────────────────────────────────────────────

function generateOTP() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

function db() {
  return admin.firestore();
}

/**
 * Create and persist a new OTP for the given phone.
 * Returns the OTP string.
 * Throws if the phone is currently locked.
 */
async function createOTP(phone) {
  const ref  = db().collection('otp_codes').doc(phone);
  const snap = await ref.get();

  if (snap.exists) {
    const data = snap.data();
    if (data.lockedUntil && data.lockedUntil.toMillis() > Date.now()) {
      const remaining = Math.ceil((data.lockedUntil.toMillis() - Date.now()) / 60000);
      throw new Error(`LOCKED:${remaining}`);
    }
  }

  const otp = generateOTP();
  await ref.set({
    otp,
    createdAt: admin.firestore.FieldValue.serverTimestamp(),
    attempts: 0,
    lockedUntil: null,
    expiresAt: new Date(Date.now() + OTP_TTL_MS)
  });

  logger.info('OTP created', { phone });
  return otp;
}

/**
 * Verify an OTP.
 * Returns true on success, false on wrong code.
 * Throws if expired, locked, or not found.
 */
async function verifyOTP(phone, code) {
  const ref  = db().collection('otp_codes').doc(phone);
  const snap = await ref.get();

  if (!snap.exists) throw new Error('NOT_FOUND');

  const data = snap.data();

  // Locked?
  if (data.lockedUntil && data.lockedUntil.toMillis() > Date.now()) {
    const remaining = Math.ceil((data.lockedUntil.toMillis() - Date.now()) / 60000);
    throw new Error(`LOCKED:${remaining}`);
  }

  // Expired?
  if (data.expiresAt.toMillis() < Date.now()) {
    await ref.delete();
    throw new Error('EXPIRED');
  }

  // Wrong code?
  if (data.otp !== code) {
    const attempts = (data.attempts || 0) + 1;
    if (attempts >= MAX_ATTEMPTS) {
      await ref.update({
        attempts,
        lockedUntil: new Date(Date.now() + LOCK_TTL_MS)
      });
      throw new Error('LOCKED:10');
    }
    await ref.update({ attempts });
    return false;
  }

  // Correct — clean up
  await ref.delete();
  logger.info('OTP verified', { phone });
  return true;
}

module.exports = {
  verifyAdminPin,
  signAdminToken,
  signCustomerToken,
  verifyToken,
  generateOTP,
  createOTP,
  verifyOTP
};
