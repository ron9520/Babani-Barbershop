const logger = require('./logger');

const REQUIRED = [
  'GREEN_API_INSTANCE_ID',
  'GREEN_API_TOKEN',
  'BARBER_PHONE',
  'FIREBASE_PROJECT_ID',
  'FIREBASE_CLIENT_EMAIL',
  'FIREBASE_PRIVATE_KEY',
  'GOOGLE_CALENDAR_ID',
  'GOOGLE_CLIENT_EMAIL',
  'GOOGLE_PRIVATE_KEY'
];

function validateEnv() {
  const missing = REQUIRED.filter(k => !process.env[k]);
  if (missing.length > 0) {
    logger.error('Missing required environment variables', { missing });
    console.error('\n❌ חסרים env vars ב-.env:\n  ' + missing.join('\n  ') + '\n');
    process.exit(1);
  }
  logger.info('Environment variables validated OK');
}

module.exports = { validateEnv };
