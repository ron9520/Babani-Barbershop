const { handleMessage } = require('./flowController');
const { sendMessage } = require('../services/whatsappService');
const logger = require('../utils/logger');

/**
 * POST /webhook — incoming WhatsApp messages from Green-API
 *
 * Green-API sends webhooks for many event types.
 * We only handle typeWebhook === 'incomingMessageReceived' with textMessage.
 */
async function webhookHandler(req, res) {
  // Acknowledge immediately
  res.sendStatus(200);

  try {
    const body = req.body;

    if (body.typeWebhook !== 'incomingMessageReceived') return;
    if (body.messageData?.typeMessage !== 'textMessage') return;

    const from = body.senderData?.chatId?.replace('@c.us', '');
    const text = body.messageData?.textMessageData?.textMessage;

    if (!from || !text) return;

    logger.info('Incoming message', { from, body: text.substring(0, 80) });

    const reply = await handleMessage(from, text);
    if (reply) {
      await sendMessage(from, reply);
    }
  } catch (err) {
    logger.error('Error handling message', { error: err.message, stack: err.stack });
  }
}

module.exports = { webhookHandler };
