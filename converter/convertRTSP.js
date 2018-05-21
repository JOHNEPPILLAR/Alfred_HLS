/**
 * Import external libraries
 */
const serviceHelper = require('../lib/helper.js');
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');
const UUID = require('pure-uuid');

global.instanceTraceID = new UUID(4); // Set new UUID

const camNumber = process.argv[2];

let camURL;
let camTitle;

if (typeof camNumber === 'undefined') process.exit(); // No cam param so exit

switch (camNumber) {
  case '1':
  default:
    camURL = process.env.cam1_url;
    camTitle = 'Lottie Cam';
    break;
  case '2':
    camURL = process.env.cam2_url;
    camTitle = 'Harriet Cam';
    break;
}

/**
 * Stream coverter events
 */
function startProcessing() {
  serviceHelper.log('info', 'startProcessing', `Started converting ${camTitle} rtsp stream to hls`);
}

function finishedProcessing() {
  serviceHelper.log('info', 'finishedProcessing', `Started converting ${camTitle} rtsp stream to hls`);
  serviceHelper.log('trace', `encodingError - ${camTitle}`, 'Exit program');
  process.exit();
}

function encodingError(err) {
  serviceHelper.log('error', `encodingError - ${camTitle}`, err);
  serviceHelper.log('trace', `encodingError - ${camTitle}`, 'Exit program');
  process.exit();
}

/**
 * RTSP to HLS Converters
 */
function convertRTSPtoHLS() {
  try {
    // Clean up old stream files
    const directory = `streams/${camNumber}`;
    fs.stat(directory, (err, stats) => {
      if (err) {
        serviceHelper.log('trace', `convertRTSPtoHLS - ${camTitle}`, 'Stream storeage folder does not exist, so creating folder');
        return fs.mkdir(directory);
      }
      if (!stats.isDirectory()) {
        serviceHelper.log('error', `convertRTSPtoHLS - ${camTitle}`, 'Stream storage folder is not a folder, exit program');
        process.exit();
      }

      fs.readdir(directory, (dirErr, files) => {
        if (dirErr) throw dirErr;
        files.forEach((file) => {
          fs.unlink(path.join(directory, file), (fileErr) => {
            if (fileErr) throw fileErr;
          });
        });

        // Start converting
        ffmpeg(camURL, { timeout: 432000 }).addOptions([
          // '-c:v libx264',
          // '-c:a aac',
          '-profile:v baseline',
          '-level: 3.0',
          '-f hls',
          '-hls_time 3',
          '-hls_list_size 5',
          '-hls_wrap 5',
          '-hls_flags delete_segments',
        ])
          .output(`streams/${camNumber}/cam.m3u8`)
          .on('start', startProcessing)
          .on('end', finishedProcessing)
          .on('error', encodingError)
          .run();
      });
      return true;
    });
  } catch (err) {
    serviceHelper.log('error', `convertRTSPtoHLS - ${camTitle}`, err);
    process.exit();
  }
}

convertRTSPtoHLS();
