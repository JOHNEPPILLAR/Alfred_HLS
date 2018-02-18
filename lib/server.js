/**
 * Setup server
 */
const https = require('https');
const fs = require('fs');
const dotenv = require('dotenv');
const logger = require('winston');
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const alfredHelper = require('./helper.js');
const HLSServer = require('./HLSServer.js');

let streamRetry = 0;

dotenv.load(); // Load env vars
alfredHelper.setLogger(logger); // Configure the logger

const options = {
  key: fs.readFileSync('./certs/privkey.pem'),
  cert: fs.readFileSync('./certs/fullchain.pem'),
};
const server = https.createServer(options);

/**
 * Stream coverter events
 */
function startProcessing() {
  logger.info(`Started converting rtsp to hls - Retry: ${streamRetry}`);
}

function finishedProcessing() {
  logger.info('Converter ended, re-trying');
  setTimeout(() => {
    convertRTSPtoHLS(); // Try re-encoding again
  }, 9000);
}

function encodingError(err) {
  logger.error(`convertRTSPtoHLS: ${err}`);
  setTimeout(() => {
    convertRTSPtoHLS(); // Try re-encoding again
  }, 9000);
}

/**
 * RTSP to HLS Converter
 */
function convertRTSPtoHLS() {
  streamRetry += 1; // Incrument stream re-try counter
  if (streamRetry === 5) {
    setTimeout(() => {
      logger.info('Shuting down server due to source streaming errors');
      process.exit(); // Kill the app and let PM2 restart it
    }, 9000);
  }

  try {
    // Clean up old stream files
    const directory = 'streams';
    fs.readdir(directory, (err, files) => {
      if (err) throw err;
      for (const file of files) {
        fs.unlink(path.join(directory, file), (err) => {
          if (err) throw err;
        });
      }
    });

    // Start converting
    ffmpeg(process.env.cam1_url, { timeout: 432000 }).addOptions([
      '-c:v libx264',
      '-c:a aac',
      '-ac 1',
      '-strict -2',
      '-crf 18',
      '-profile:v baseline',
      '-hls_flags delete_segments',
      '-hls_time 10',
      '-hls_wrap 10',
      '-start_number 1',
    //    '-hls_list_size 6',
    //    '-maxrate 400k',
    //    '-bufsize 1835k',
    //    '-pix_fmt yuv420p',
    ])
      .output('streams/cam1.m3u8')
      .on('start', startProcessing)
      .on('end', finishedProcessing)
      .on('error', encodingError)
      .run();
  } catch (err) {
    encodingError(err);
  }
}

/**
 * Start rtsp to hls converter
 */
convertRTSPtoHLS(); // Start the RTSP to HLS stream

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
