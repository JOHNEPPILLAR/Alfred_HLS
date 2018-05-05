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
function convertRTSPtoHLSCam1() {
  cam1StreamRetry += 1; // Incrument stream re-try counter

  try {
    // Clean up old stream files
    const directory = 'streams/0';
    fs.readdir(directory, (err, files) => {
      if (err) throw err;
      files.forEach((file) => {
        fs.unlink(path.join(directory, file), (fileErr) => {
          if (fileErr) throw fileErr;
        });
      });

      // Start converting
      ffmpeg(process.env.cam1_url, { timeout: 432000 }).addOptions([
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
        .output('streams/0/cam.m3u8')
        .on('start', startProcessingCam2)
        .on('end', finishedProcessingCam2)
        .on('error', encodingErrorCam2)
        .run();
    });
  } catch (err) {
    serviceHelper.log('error', 'convertRTSPtoHLSCam1', err);
    encodingErrorCam1(err);
  }
}

function convertRTSPtoHLSCam2() {
  cam2StreamRetry += 1; // Incrument stream re-try counter

  try {
    // Clean up old stream files
    const directory = 'streams/1';
    fs.readdir(directory, (err, files) => {
      if (err) throw err;
      files.forEach((file) => {
        fs.unlink(path.join(directory, file), (fileErr) => {
          if (fileErr) throw fileErr;
        });
      });

      // Start converting
      ffmpeg(process.env.cam2_url, { timeout: 432000 }).addOptions([
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
        .output('streams/1/cam.m3u8')
        .on('start', startProcessingCam2)
        .on('end', finishedProcessingCam2)
        .on('error', encodingErrorCam2)
        .run();
    });
  } catch (err) {
    serviceHelper.log('error', 'convertRTSPtoHLSCam2', err);
    encodingErrorCam2(err);
  }
}

convertRTSPtoHLSCam1(); // Start cam 1 stream
convertRTSPtoHLSCam2(); // Start cam 2 stream
