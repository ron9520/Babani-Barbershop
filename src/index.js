require('dotenv').config();
const { createServer } = require('./server');
const { init: initFirebase } = require('./services/firebaseService');
const { scheduleReminders } = require('./jobs/reminderJob');
const { validateEnv } = require('./utils/validateEnv');
const logger = require('./utils/logger');

const PORT = process.env.PORT || 3000;

async function main() {
  logger.info('Starting Babani Barber Shop WhatsApp Bot...');
  validateEnv();

  // Initialize Firebase
  initFirebase();

  // Start Express server
  const app = createServer();
  app.listen(PORT, () => {
    logger.info(`Server listening on port ${PORT}`);
    logger.info(`Webhook URL: http://localhost:${PORT}/webhook`);
    logger.info(`Health: http://localhost:${PORT}/health`);
  });

  // Schedule daily reminders
  scheduleReminders();

  logger.info('Bot is ready! ✂️');
}

main().catch(err => {
  logger.error('Fatal startup error', { error: err.message, stack: err.stack });
  process.exit(1);
});
