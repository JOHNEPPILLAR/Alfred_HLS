/**
 * Import external libraries
 */
const fs = require('fs');
const zlib = require('zlib');
const path = require('path');
const debug = require('debug')('HLS:CameraStream');

const CONTENT_TYPE = {
  MANIFEST: 'application/vnd.apple.mpegurl',
  SEGMENT: 'video/MP2T',
  HTML: 'text/html',
};

/**
 * Play stream helper functions
 */
async function getManifestStream(req, res, next, filePath) {
  let stream;
  try {
    // Check if file exists
    if (!fs.existsSync(filePath)) throw new Error('No file to process');

    stream = fs.createReadStream(filePath, { highWaterMark: 64 * 1024 });
    stream.on('error', (err) => {
      this.logger.error(`${this._traceStack()} - ${err.message}`);
      this._sendResponse(res, next, 500, err);
    });
  } catch (err) {
    this.logger.error(`${this._traceStack()} - ${err.message}`);
    this._sendResponse(res, next, 500, err);
    return;
  }

  res.setHeader('Content-Type', CONTENT_TYPE.MANIFEST);
  res.statusCode = 200;
  if (req.acceptsCompression) {
    res.setHeader('content-encoding', 'gzip');
    const gzip = zlib.createGzip();
    stream.pipe(gzip).pipe(res);
  } else {
    stream.pipe(res, 'utf-8');
  }
}

async function getSegmentStream(req, res, next, filePath) {
  try {
    // Check if file exists
    if (!fs.existsSync(filePath)) throw new Error('No file to process');

    res.writeHead(200, { 'Content-Type': CONTENT_TYPE.SEGMENT });
    const stream = fs.createReadStream(filePath, { highWaterMark: 64 * 1024 });
    stream.on('error', (err) => {
      this.logger.error(`${this._traceStack()} - ${err.message}`);
    });
    stream.pipe(res);
  } catch (err) {
    this.logger.error(`${this._traceStack()} - ${err.message}`);
    this._sendResponse(res, next, 500, err);
  }
}

/**
 * @type get
 * @path /stream/*
 */
async function playStream(req, res, next) {
  debug(`Play stream API called for url: ${req.url}`);

  // Map path to files
  const cleanURL = req.url.split('?').shift();
  const fileExt = path.extname(cleanURL);
  const filePath = cleanURL.replace('/stream', 'tmp');

  // Gzip support
  const ae = req.headers['accept-encoding'] || '';
  req.acceptsCompression = ae.match(/\bgzip\b/);

  // Stream file
  if (fileExt === '.ts') {
    getSegmentStream.call(this, req, res, next, filePath);
  } else {
    getManifestStream.call(this, req, res, next, filePath);
  }
}

module.exports = {
  playStream,
};
