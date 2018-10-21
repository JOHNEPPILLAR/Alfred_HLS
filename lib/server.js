/**
 * Import external libraries
 */
require('dotenv').config();

const restify = require('restify');
const fs = require('fs');
const UUID = require('pure-uuid');
const path = require('path');

const serviceHelper = require('./helper.js');
const streams = require('../converter/controller.js');

global.instanceTraceID = new UUID(4);
global.callTraceID = null;

// Restify server Init
const server = restify.createServer({
  name: process.env.ServiceName,
  version: process.env.Version,
  key: fs.readFileSync('./certs/server.key'),
  certificate: fs.readFileSync('./certs/server.crt'),
});

/**
 * Setup API middleware
 */
server.use(restify.plugins.jsonBodyParser({ mapParams: true }));
server.use(restify.plugins.acceptParser(server.acceptable));
server.use(restify.plugins.queryParser({ mapParams: true }));
server.use(restify.plugins.fullResponse());
server.use((req, res, next) => {
  if (process.env.Debug === 'true') serviceHelper.log('trace', null, req.url);
  res.header('Cache-Control', 'private, no-cache, no-store, must-revalidate');
  res.header('Expires', '-1');
  res.header('Pragma', 'no-cache');
  next();
});
server.use((req, res, next) => {
  // Check for a trace id
  if (typeof req.headers['trace-id'] === 'undefined') { global.callTraceID = new UUID(4); } // Generate new trace id

  // Check for valid auth key
  const fileExt = path.extname(req.url).toLowerCase();
  if (req.query.clientaccesskey !== process.env.ClientAccessKey && fileExt !== '.ts') {
    serviceHelper.log('warn', null, `Invaid client access key: ${req.headers.ClientAccessKey}`);
    serviceHelper.sendResponse(res, 401, 'There was a problem authenticating you.');
    return;
  }
  next();
});

server.on('NotFound', (req, res, err) => {
  serviceHelper.log('error', null, `${err}`);
  serviceHelper.sendResponse(res, 404, err.message);
});
server.on('uncaughtException', (req, res, route, err) => {
  serviceHelper.log('error', null, `${route}: ${err}`);
  serviceHelper.sendResponse(res, null, err.message);
});

/**
 * Configure API end points
 */
require('../api/root/root.js').applyRoutes(server);
require('../api/stream/stream.js').applyRoutes(server);

/**
 * Stop server if process close event is issued
 */
function cleanExit() {
  serviceHelper.log('warn', null, 'Service stopping'); // Inform log that service is stopping
  server.close(() => { // Ensure rest server is stopped
    process.exit(); // Exit app
  });
}
process.on('exit', () => { cleanExit(); });
process.on('SIGINT', () => { cleanExit(); });
process.on('SIGTERM', () => { cleanExit(); });
process.on('uncaughtException', (err) => {
  if (err) serviceHelper.log('error', null, err); // log the error
});

/**
 * Check service dependancies and wait until they are ready
 */
async function dependencyHealthCheck() {
  const apiURL = `${process.env.AlfredLogService}/ping`;
  serviceHelper.log('trace', 'dependencyHealthCheck', `Calling: ${apiURL}`);
  try {
    const healthCheckData = await serviceHelper.callAlfredServiceGet(apiURL, true);
    if (healthCheckData instanceof Error) {
      serviceHelper.log('error', 'dependencyHealthCheck', 'Log Service not responding');
      setTimeout(() => { dependencyHealthCheck(); }, 30000);
      return false;
    }

    // Register service
    const registerService = serviceHelper.registerService();
    if (registerService instanceof Error) {
      serviceHelper.log('error', 'dependencyHealthCheck', 'Unable to register service');
      cleanExit();
      return false;
    }
    const theInterval = 5 * 60 * 1000; // 5 minutes
    setInterval(() => {
      serviceHelper.registerService();
    }, theInterval);

    setTimeout(() => streams.start(), 1000);

    // Start service and listen to requests
    server.listen(process.env.Port, () => {
      serviceHelper.log('info', null, `${process.env.ServiceName} has started and is listening on port ${process.env.Port}`);
    });
  } catch (err) {
    serviceHelper.log('error', 'dependencyHealthCheck', err);
  }
  return true;
}

dependencyHealthCheck();
