/**
 * Import external libraries
 */
require('dotenv').config();

const restify = require('restify');
const fs = require('fs');
const UUID = require('pure-uuid');
const path = require('path');

/**
 * Import helper libraries
 */
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
  serviceHelper.log('trace', 'server', req.url);
  next();
});
server.use((req, res, next) => {
  // Check for a trace id
  if (typeof req.headers['trace-id'] === 'undefined') { global.callTraceID = new UUID(4); } // Generate new trace id

  // Check for valid auth key
  const fileExt = path.extname(req.url).toLowerCase();
  if (req.query.clientaccesskey !== process.env.ClientAccessKey && fileExt !== '.ts') {
    serviceHelper.log('warn', 'server', `Invaid client access key: ${req.headers.ClientAccessKey}`);
    serviceHelper.sendResponse(res, 401, 'There was a problem authenticating you.');
    return;
  }
  next();
});

server.on('NotFound', (req, res, err) => {
  serviceHelper.log('error', 'server', `${err.message}`);
  serviceHelper.sendResponse(res, 404, err);
});
server.on('uncaughtException', (req, res, route, err) => {
  serviceHelper.log('error', 'server', `${route}: ${err.message}`);
  serviceHelper.sendResponse(res, null, err);
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
  serviceHelper.log('warn', 'cleanExit', 'Closing rest server');
  server.close(() => { // Ensure rest server is stopped
    process.exit(); // Exit app
  });
}
process.on('SIGINT', () => { cleanExit(); });
process.on('SIGTERM', () => { cleanExit(); });
process.on('SIGUSR2', () => { cleanExit(); });
process.on('uncaughtException', (err) => {
  if (err) serviceHelper.log('error', 'server', err.message); // log the error
  cleanExit();
});

setTimeout(() => streams.start(), 1000);

// Start service and listen to requests
server.listen(process.env.Port, () => {
  serviceHelper.log('info', 'server', `${process.env.ServiceName} has started and is listening on port ${process.env.Port}`);
});
