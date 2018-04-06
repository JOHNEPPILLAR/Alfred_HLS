/**
 * Setup server
 */
require('dotenv').config();

const https = require('https'); // tmp untill solve TLS issue in IOS
const fs = require('fs');
const logger = require('winston');
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const memwatch = require('memwatch-next');
const heapdump = require('heapdump');
const dateFormat = require('dateformat');
const alfredHelper = require('./helper.js');
const HLSServer = require('./HLSServer.js');

let cam1StreamRetry = 0;
let cam2StreamRetry = 0;

alfredHelper.setLogger(logger); // Configure the logger

const options = {
  key: fs.readFileSync('./certs/server.key'),
  cert: fs.readFileSync('./certs/server.crt'),
};

const server = https.createServer(options);

/**
 * Stream coverter events
 */
function startProcessingCam1() {
  logger.info(`Started converting Lottie rtsp stream to hls - Attempt: ${cam1StreamRetry}`);
}

function finishedProcessingCam1() {
  logger.info('Lottie converter ended, re-trying');
  setTimeout(() => {
    convertRTSPtoHLSCam1(); // Try re-encoding again
  }, 9000);
}

function encodingErrorCam1(err) {
  logger.error(`Lottie converter error: ${err}`);
  setTimeout(() => {
    convertRTSPtoHLSCam1(); // Try re-encoding again
  }, 9000);
}

function startProcessingCam2() {
  logger.info(`Started converting Harriet rtsp stream to hls - Attempt: ${cam1StreamRetry}`);
}

function finishedProcessingCam2() {
  logger.info('Harriet converter ended, re-trying');
  setTimeout(() => {
    convertRTSPtoHLSCam2(); // Try re-encoding again
  }, 9000);
}

function encodingErrorCam2(err) {
  logger.error(`Harriet converter error: ${err}`);
  setTimeout(() => {
    convertRTSPtoHLSCam2(); // Try re-encoding again
  }, 9000);
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
 * Start server and listen to requests
 */
server.listen(process.env.PORT);
server.on('listening', () => {
  logger.info(`Server listening on port: ${process.env.PORT}`);
});

/**
 * Stop https server if process close event is issued
 */
process.on('SIGINT', () => {
  server.close(() => {
    process.exit(0);
  });
});

/**
 * Memory leak detection
 */
heapdump.writeSnapshot(`${process.env.afred_config}mem/alfred_hls/0_start_${dateFormat(Date.now(), 'HH_MM_TT')}.heapsnapshot`);

memwatch.on('leak', (info) => {
  logger.error('Memory leak detected');
  logger.error(`${info.growth} - ${info.reason}`);
  heapdump.writeSnapshot(`${process.env.afred_config}mem/alfred_hls/1_run_${dateFormat(Date.now(), 'HH_MM_TT')}.heapsnapshot`);
});
