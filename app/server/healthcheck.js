/**
 * Import external libraries
 */
const serviceHelper = require('alfred-helper');
const rp = require('request-promise');

const options = {
  method: 'GET',
  timeout: 5000,
  json: true,
  agentOptions: { rejectUnauthorized: false },
};

async function pingApp() {
  try {
    const ClientAccessKey = await serviceHelper.vaultSecret(process.env.ENVIRONMENT, 'ClientAccessKey');
    options.uri = `https://localhost:${process.env.PORT}/ping?clientaccesskey=${ClientAccessKey}`;
    await rp(options);
    process.exit(0);
  } catch (err) {
    serviceHelper.log('error', `Docker healthcheck - ${err.message}`);
    process.exit(1);
  }
}

pingApp();
