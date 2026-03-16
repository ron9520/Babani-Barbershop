const { handleMessage } = require('./flowController');
const { sendMessage } = require('../services/twilioService');
const responses = require('./responses');
const logger = require('../utils/logger');

/**
 * Express route handler for Twilio WhatsApp webhook.
 */
async function webhookHandler(req, res) {
  // Respond to Twilio immediately (must be < 5s)
  res.status(200).send('<Response></Response>');

  const from = req.body.From;
  const body = req.body.Body;

  if (!from || !body) {
    logger.warn('Webhook received without From or Body', req.body);
    return;
  }

  logger.info('Incoming message', { from, body: body.substring(0, 80) });

  try {
    const reply = await handleMessage(from, body);
    if (reply) {
      await sendMessage(from, reply);
    }
  } catch (err) {
    logger.error('Error handling message', { from, error: err.message, stack: err.stack });
    try {
      await sendMessage(from, responses.error());
    } catch (sendErr) {
      logger.error('Failed to send error message to user', { from, error: sendErr.message });
    }
  }
}

module.exports = { webhookHandler };
