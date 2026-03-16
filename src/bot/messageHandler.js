const { handleMessage } = require('./flowController');
const { sendMessage } = require('../services/whatsappService');
const responses = require('./responses');
const logger = require('../utils/logger');

/**
 * GET /webhook — Meta webhook verification
 */
function webhookVerify(req, res) {
  const mode      = req.query['hub.mode'];
  const token     = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];

  if (mode === 'subscribe' && token === process.env.WHATSAPP_VERIFY_TOKEN) {
    logger.info('Meta webhook verified');
    return res.status(200).send(challenge);
  }
  res.sendStatus(403);
}

/**
 * POST /webhook — incoming WhatsApp messages from Meta
 */
async function webhookHandler(req, res) {
  // Acknowledge immediately
  res.sendStatus(200);

  try {
    const entry = req.body?.entry?.[0];
    const change = entry?.changes?.[0]?.value;
    const message = change?.messages?.[0];

    if (!message || message.type !== 'text') return;

    const from = message.from; // e.g. "972523385554"
    const body = message.text?.body;

    if (!from || !body) return;

    logger.info('Incoming message', { from, body: body.substring(0, 80) });

    const reply = await handleMessage(from, body);
    if (reply) {
      await sendMessage(from, reply);
    }
  } catch (err) {
    logger.error('Error handling message', { error: err.message, stack: err.stack });
  }
}

module.exports = { webhookHandler, webhookVerify };
