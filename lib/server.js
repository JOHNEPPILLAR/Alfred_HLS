/**
 * Setup server
 */
const https = require('https')
const fs = require('fs');
const url = require('url');
const dotenv = require('dotenv');
const logger = require('winston');
const ffmpeg = require('fluent-ffmpeg')
const alfredHelper = require('./helper.js');
const HLSServer = require('./HLSServer.js')

dotenv.load(); // Load env vars
alfredHelper.setLogger(logger); // Configure the logger

const options = {
  key: fs.readFileSync('./certs/server.key'),
  cert: fs.readFileSync('./certs/server.cert')
};
const server = https.createServer(options);

/** 
 * Stream coverter events
*/
function startProcessing() {
  logger.info('Started converting rtsp to hls');
}

function finishedProcessing() {
  logger.info('Converter ended, re-trying');
  convertRTSPtoHLS(); // Try re-encoding again  
}

function encodingError(err) {
  logger.error('convertRTSPtoHLS: ' + err);
  convertRTSPtoHLS(); // Try re-encoding again
}

/**
 * RTSP to HLS Converter
 */
function convertRTSPtoHLS() {

  // TO DO 
  // If attempts 0 the encode, else if 3 exit

  try {
    // Clean up tmp files
    fs.readdir('./streams', (err, files) => {
      if (err) throw err;
  
      files.filter(name => /script\.\d+\.js$/.test(name)).forEach(fs.unlink);
    });


    // Start converting
    ffmpeg(process.env.cam1_url, { timeout: 432000 }).addOptions([
      '-c:v libx264',
      '-c:a aac',
      '-ac 1',
      '-strict -2',
      '-crf 18',
      '-profile:v baseline',
    //    '-maxrate 400k',
    //    '-bufsize 1835k',
    //    '-pix_fmt yuv420p',
    //    '-hls_time 10',
    //    '-hls_list_size 6',
      '-hls_wrap 10',
      '-start_number 1'
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
  dir: 'streams'  // Directory where input stream is stored
})

/**
 * Start server and listen to requests
 */
server.listen(process.env.PORT);
server.on('listening', function() {
  logger.info('Server listening on port: ' + process.env.PORT);
});
