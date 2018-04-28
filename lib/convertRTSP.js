/**
 * Import external libraries
 */
const serviceHelper = require('./helper.js');
const ffmpeg = require('fluent-ffmpeg');
const path = require('path');
const fs = require('fs');

let cam1StreamRetry = 0;
let cam2StreamRetry = 0;

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

// Lottie cam
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

// Harriet cam
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

// Start rtsp to hls converter
convertRTSPtoHLSCam1(); // Start Lottie cam RTSP to HLS stream
// convertRTSPtoHLSCam2(); // Start Harriet cam RTSP to HLS stream
