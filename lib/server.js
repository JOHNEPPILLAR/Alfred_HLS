/**
 * Import external libraries
 */
require('dotenv').config();

const serviceHelper = require('./helper.js');
const https = require('https'); // tmp untill solve TLS issue in IOS
const fs = require('fs');
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const memwatch = require('memwatch-next');
const HLSServer = require('./HLSServer.js');
const UUID = require('pure-uuid');

global.instanceTraceID = new UUID(4);
global.callTraceID = null;

let cam1StreamRetry = 0;
let cam2StreamRetry = 0;

const options = {
  key: fs.readFileSync('./certs/server.key'),
  cert: fs.readFileSync('./certs/server.crt'),
};

const server = https.createServer(options);

/**
 * Stream coverter events
 */
function startProcessingCam1() {
  serviceHelper.log('trace', 'startProcessingCam1', `Started converting rtsp stream to hls - Attempt: ${cam1StreamRetry}`);
}

function finishedProcessingCam1() {
  serviceHelper.log('info', 'finishedProcessingCam1', 'Converter ended, re-trying');
  setTimeout(() => { convertRTSPtoHLSCam1(); }, 9000);
}

function encodingErrorCam1(err) {
  serviceHelper.log('error', 'encodingErrorCam1', err);
  setTimeout(() => { convertRTSPtoHLSCam1(); }, 9000);
}

function startProcessingCam2() {
  serviceHelper.log('trace', 'startProcessingCam2', `Started converting rtsp stream to hls - Attempt: ${cam2StreamRetry}`);
}

function finishedProcessingCam2() {
  serviceHelper.log('info', 'finishedProcessingCam2', 'Converter ended, re-trying');
  setTimeout(() => { convertRTSPtoHLSCam2(); }, 9000);
}

function encodingErrorCam2(err) {
  serviceHelper.log('error', 'encodingErrorCam2', err);
  setTimeout(() => { convertRTSPtoHLSCam2(); }, 9000);
}

/**
 * RTSP to HLS Converters
 */

/**
 * Lottie cam
 */
function convertRTSPtoHLSCam1() {
  cam1StreamRetry += 1; // Incrument stream re-try counter

  try {
    // Clean up old stream files
    const directory = 'streams/l';
    fs.readdir(directory, (err, files) => {
      if (err) throw err;
      files.forEach((file) => {
        fs.unlink(path.join(directory, file), (fileErr) => {
          if (fileErr) throw fileErr;
        });
      });
    });

    // Start converting
    ffmpeg(process.env.cam1_url, { timeout: 432000 }).addOptions([
      '-c:v libx264',
      '-c:a aac',
      '-profile:v baseline',
      '-hls_flags delete_segments',
      '-hls_time 5',
      '-hls_list_size 5',
    ])
      .output('streams/l/cam.m3u8')
      .on('start', startProcessingCam1)
      .on('end', finishedProcessingCam1)
      .on('error', encodingErrorCam1)
      .run();
  } catch (err) {
    encodingErrorCam1(err);
  }
}

/**
 * Harriet cam
 */
function convertRTSPtoHLSCam2() {
  cam2StreamRetry += 1; // Incrument stream re-try counter

  try {
    // Clean up old stream files
    const directory = 'streams/h';
    fs.readdir(directory, (err, files) => {
      if (err) throw err;
      files.forEach((file) => {
        fs.unlink(path.join(directory, file), (fileErr) => {
          if (fileErr) throw fileErr;
        });
      });
    });

    // Start converting
    ffmpeg(process.env.cam2_url, { timeout: 432000 }).addOptions([
      '-c:v libx264',
      '-c:a aac',
      '-profile:v baseline',
      '-hls_flags delete_segments',
      '-hls_time 5',
      '-hls_list_size 5',
    ])
      .output('streams/h/cam.m3u8')
      .on('start', startProcessingCam2)
      .on('end', finishedProcessingCam2)
      .on('error', encodingErrorCam2)
      .run();
  } catch (err) {
    encodingErrorCam2(err);
  }
}

/**
 * Start rtsp to hls converter
 */
convertRTSPtoHLSCam1(); // Start Lottie cam RTSP to HLS stream
convertRTSPtoHLSCam2(); // Start Harriet cam RTSP to HLS stream

/**
 * Attach the hls streamer to server
 */
const hls = new HLSServer(server, {
  path: '/streams', // Base URI to output HLS streams
  dir: 'streams', // Directory where input stream is stored
});

/**
 * Memory leak detection
 */
memwatch.on('leak', (info) => { serviceHelper.log('leak', null, `${info.growth}: ${info.reason}`); });

/**
 * Start server and listen to requests
 */
server.listen(process.env.Port);
server.on('listening', () => {
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
