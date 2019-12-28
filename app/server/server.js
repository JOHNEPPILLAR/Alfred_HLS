/**
 * Import external libraries
 */
require('dotenv').config();

const serviceHelper = require('alfred-helper');
const restify = require('restify');
const UUID = require('pure-uuid');
const { version } = require('../../package.json');

/**
 * Import helper libraries
 */
const RTSPRecorder = require('./RTSPRecorder.js');
const APIroot = require('../api/root/root.js');
const APIstream = require('../api/stream/stream.js');

global.APITraceID = '';
global.streamsStore = [];
let rec1;
let rec2;
let ClientAccessKey;

async function setupAndRun() {
  // Restify server Init
  serviceHelper.log('trace', 'Getting certs');
  const key = await serviceHelper.vaultSecret(process.env.ENVIRONMENT, `${process.env.VIRTUAL_HOST}_key`);
  const certificate = await serviceHelper.vaultSecret(process.env.ENVIRONMENT, `${process.env.VIRTUAL_HOST}_cert`);

  if (key instanceof Error || certificate instanceof Error) {
    serviceHelper.log('error', 'Not able to get secret (CERTS) from vault');
    serviceHelper.log('warn', 'Exit the app');
    process.exit(1); // Exit app
  }
  const server = restify.createServer({
    name: process.env.VIRTUAL_HOST,
    version,
    key,
    certificate,
  });

  // Setup API middleware
  server.on('NotFound', (req, res, err) => {
    serviceHelper.log('error', `${err.message}`);
    serviceHelper.sendResponse(res, 404, err.message);
  });
  server.use(restify.plugins.jsonBodyParser({ mapParams: true }));
  server.use(restify.plugins.acceptParser(server.acceptable));
  server.use(restify.plugins.queryParser({ mapParams: true }));
  server.use(restify.plugins.fullResponse());
  server.use((req, res, next) => {
    serviceHelper.log('trace', req.url);
    res.setHeader(
      'Content-Security-Policy',
      `default-src 'self' ${process.env.VIRTUAL_HOST}`,
    );
    res.setHeader(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains',
    );
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Referrer-Policy', 'no-referrer');
    next();
  });
  server.use(async (req, res, next) => {
    // Check for a trace id
    if (typeof req.headers['api-trace-id'] === 'undefined') {
      global.APITraceID = new UUID(4);
    } else {
      global.APITraceID = req.headers['api-trace-id'];
    }

    // Check for valid auth key
    ClientAccessKey = await serviceHelper.vaultSecret(process.env.ENVIRONMENT, 'ClientAccessKey');
    if (ClientAccessKey instanceof Error) {
      serviceHelper.log('error', 'Not able to get secret (ClientAccessKey) from vault');
      serviceHelper.sendResponse(
        res,
        500,
        new Error('There was a problem with the auth service'),
      );
      return;
    }
    if (req.query.clientaccesskey !== ClientAccessKey) {
      serviceHelper.log(
        'warn',
        `Invaid client access key: ${req.headers.ClientAccessKey}`,
      );
      serviceHelper.sendResponse(
        res,
        401,
        'There was a problem authenticating you',
      );
      return;
    }
    next();
  });

  // Configure API end points
  APIroot.applyRoutes(server);
  APIstream.applyRoutes(server, '/stream');

  // Stop server if process close event is issued
  function cleanExit() {
    serviceHelper.log('warn', 'Service stopping');
    serviceHelper.log('trace', 'Close rest server');
    server.close(() => {
      serviceHelper.log('info', 'Exit the app');
      process.exit(1); // Exit app
    });
  }
  process.on('SIGINT', () => {
    cleanExit();
  });
  process.on('SIGTERM', () => {
    cleanExit();
  });
  process.on('SIGUSR2', () => {
    cleanExit();
  });
  process.on('uncaughtException', (err) => {
    serviceHelper.log('error', err.message); // log the error
  });
  process.on('unhandledRejection', (reason, p) => {
    serviceHelper.log('error', `Unhandled Rejection at Promise: ${p} - ${reason}`); // log the error
  });

  async function recordCam() {
    // Kids room
    const HLSKidsRoomCam = await serviceHelper.vaultSecret(process.env.ENVIRONMENT, 'HLSKidsRoomCam');
    const HLSKidsRoomRecord = await serviceHelper.vaultSecret(process.env.ENVIRONMENT, 'HLSKidsRoomRecord');
    if (HLSKidsRoomCam instanceof Error || HLSKidsRoomRecord instanceof Error) {
      serviceHelper.log('error', 'Not able to get secret (Kids room cam info) from vault');
      return;
    }
    if (typeof rec1 === 'undefined' && HLSKidsRoomRecord === 'true') {
      serviceHelper.log('info', 'Start recording kids room');
      rec1 = new RTSPRecorder({
        name: 'Kidsroom',
        url: HLSKidsRoomCam,
        type: 'record',
        disableStreaming: false,
        timeLimit: 600, // 10 minutes for each segmented video file
      });
      rec1.startRecording(); // Start Recording
    }
    if (typeof rec1 !== 'undefined' && HLSKidsRoomRecord === 'false') {
      serviceHelper.log('info', 'Settings changed, stopping recording');
      rec1.stopRecording(); // Stop Recording
      rec1 = undefined; // Clear var
    }

    // Living room
    const HLSLivingRoomCam = await serviceHelper.vaultSecret(process.env.ENVIRONMENT, 'HLSLivingRoomCam');
    const HLSLivingRoomRecord = await serviceHelper.vaultSecret(process.env.ENVIRONMENT, 'HLSLivingRoomRecord');
    if (HLSLivingRoomCam instanceof Error || HLSLivingRoomRecord instanceof Error) {
      serviceHelper.log('error', 'Not able to get secret (Living room cam info) from vault');
      return;
    }
    if (typeof rec2 === 'undefined' && HLSLivingRoomRecord === 'true') {
      serviceHelper.log('info', 'Start recording living room');
      rec2 = new RTSPRecorder({
        name: 'Livingroom',
        url: HLSLivingRoomCam,
        type: 'record',
        disableStreaming: false,
        timeLimit: 600, // 10 minutes for each segmented video file
      });
      rec2.startRecording(); // Start Recording
    }
    if (typeof rec2 !== 'undefined' && HLSLivingRoomRecord === 'false') {
      serviceHelper.log('info', 'Settings changed, stopping recording');
      rec2.stopRecording(); // Stop Recording
      rec2 = undefined; // Clear var
    }

    // Check again in 5 minutes if settings are the same
    const timerInterval = 5 * 60 * 1000; // 5 minutes
    setTimeout(() => {
      recordCam();
    }, timerInterval);
  }

  // Start service and listen to requests
  server.listen(process.env.PORT, async () => {
    serviceHelper.log('info', `${process.env.VIRTUAL_HOST} has started`);
    recordCam();
  });
}

setupAndRun();
