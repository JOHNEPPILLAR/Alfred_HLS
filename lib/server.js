/**
 * Import external libraries
 */
require('dotenv').config();

const serviceHelper = require('./helper.js');
const restify = require('restify');
const fs = require('fs');
const memwatch = require('memwatch-next');
const UUID = require('pure-uuid');

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
  if (process.env.Debug) serviceHelper.log('trace', null, req.url);
  res.header('Cache-Control', 'private, no-cache, no-store, must-revalidate');
  res.header('Expires', '-1');
  res.header('Pragma', 'no-cache');
  next();
});
server.use((req, res, next) => {
  // Check for a trace id
  if (typeof req.headers['trace-id'] === 'undefined') { global.callTraceID = new UUID(4); } // Generate new trace id

  // Check for valid auth key
  //if (req.headers['client-access-key'] !== process.env.ClientAccessKey) {
  //  serviceHelper.log('warn', null, `Invaid client access key: ${req.headers.ClientAccessKey}`);
  //  serviceHelper.sendResponse(res, 401, 'There was a problem authenticating you.');
  //  return;
  //}
  next();
});

server.on('NotFound', (req, res, err) => {
  serviceHelper.log('error', null, `${err.message}`);
  serviceHelper.sendResponse(res, 404, err.message);
});
server.on('uncaughtException', (req, res, route, err) => {
  serviceHelper.log('error', null, `${route}: ${err.message}`);
  serviceHelper.sendResponse(res, null, err);
});

/**
 * Configure API end points
 */
require('../api/root/root.js').applyRoutes(server);
require('../api/stream/stream.js').applyRoutes(server);

/**
 * Create streams
 */
//require('./convertRTSP.js');

/**
 * Memory leak detection
 */
memwatch.on('leak', (info) => { serviceHelper.log('leak', null, `${info.growth}: ${info.reason}`); });

/**
 * Start service and listen to requests
 */
server.listen(process.env.Port, () => {
  serviceHelper.log('trace', null, `${process.env.ServiceName} has started and is listening on port ${process.env.Port}`);
});

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
  if (err) serviceHelper.log('error', null, err.message); // log the error
});
