require('dotenv').config();
const { createServer } = require('./server');
const { init: initFirebase, migrateServicesIfNeeded } = require('./services/firebaseService');
const { scheduleReminders, scheduleKeepAlive } = require('./jobs/reminderJob');
const config = require('../config/config.json');
const { validateEnv } = require('./utils/validateEnv');
const logger = require('./utils/logger');

const PORT = process.env.PORT || 3000;

async function main() {
  logger.info('Starting Babani Barber Shop WhatsApp Bot...');
  validateEnv();

  // Initialize Firebase
  initFirebase();

  // Migrate services from config.json to Firestore (one-time, if empty)
  await migrateServicesIfNeeded(config.services);

  // Start Express server
  const app = createServer();
  app.listen(PORT, () => {
    logger.info(`Server listening on port ${PORT}`);
    logger.info(`Webhook URL: http://localhost:${PORT}/webhook`);
    logger.info(`Health: http://localhost:${PORT}/health`);
  });

  // Schedule daily reminders
  scheduleReminders();

  // Keep-alive ping for Render free tier
  scheduleKeepAlive(process.env.RENDER_EXTERNAL_URL);

  logger.info('Bot is ready! ✂️');
}

main().catch(err => {
  logger.error('Fatal startup error', { error: err.message, stack: err.stack });
  process.exit(1);
});
