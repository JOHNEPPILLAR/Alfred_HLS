/**
 * Import external libraries
 */
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');
const UUID = require('pure-uuid');

/**
 * Import helper libraries
 */
const serviceHelper = require('../lib/helper.js');

global.instanceTraceID = new UUID(4); // Set new UUID

const camNumber = process.argv[2];

let camURL;
let camTitle;

if (typeof camNumber === 'undefined') process.exit(); // No cam param so exit

switch (camNumber) {
  case '1':
  default:
    camURL = process.env.cam1_url;
    camTitle = 'Kids Room';
    break;
  case '2':
    camURL = process.env.cam2_url;
    camTitle = 'Living Room';
    break;
}

/**
 * Stream coverter events
 */
function startProcessing() {
  serviceHelper.log('trace', `${camTitle} - Started converting rtsp stream to hls`);
}

function finishedProcessing() {
  serviceHelper.log('warn', `${camTitle} - Finished converting and about to exit`);
  serviceHelper.log('trace', `${camTitle} - Exit program`);
  process.exit();
}

function encodingError(err) {
  serviceHelper.log('error', err.message);
  serviceHelper.log('trace', `${camTitle} - Encoding error, about to exit`);
  process.exit();
}

/**
 * RTSP to HLS Converters
 */
function convertRTSPtoHLS() {
  try {
    // Clean up old stream files
    const directory = `streams/${camNumber}`;
    fs.stat(directory, (err) => {
      if (err) {
        serviceHelper.log('trace', `${camTitle} - Stream storeage folder does not exist, so creating folder`);
        fs.mkdir('streams', (dirErr) => {
          serviceHelper.log('trace', `${camTitle} - Creating streams folder`);
          if (dirErr) serviceHelper.log('warn', `convertRTSPtoHLS - ${camTitle}`, dirErr.message);
          process.exit();
        });
        fs.mkdir(directory, (dirErr) => {
          serviceHelper.log('trace', `${camTitle} - Creating main streams folder`);
          if (dirErr) serviceHelper.log('warn', `${camTitle} - ${dirErr.message}`);
          process.exit();
        });
      }
      fs.readdir(directory, (dirErr, files) => {
        serviceHelper.log('trace', `${camTitle} - Deleting old files`);
        if (dirErr) throw dirErr;
        files.forEach((file) => {
          fs.unlink(path.join(directory, file), (fileErr) => {
            if (fileErr) throw fileErr;
          });
        });

        // Start converting
        serviceHelper.log('trace', `${camTitle} - Start converting RTSP to HLS`);
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
    serviceHelper.log('error', err.message);
    process.exit();
  }
}

convertRTSPtoHLS();
