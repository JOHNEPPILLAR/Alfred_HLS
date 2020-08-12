/**
 * Import external libraries
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const CONTENT_TYPE = {
  MANIFEST: 'application/vnd.apple.mpegurl',
  SEGMENT: 'video/MP2T',
  HTML: 'text/html',
};

/**
 * Play stream helper functions
 */
async function getManifestStream(req, res, next, filePath) {
  try {
    const stream = await fs.createReadStream(filePath, {
      bufferSize: 64 * 1024,
    });
    res.setHeader('Content-Type', CONTENT_TYPE.MANIFEST);
    res.statusCode = 200;
    if (req.acceptsCompression) {
      res.setHeader('content-encoding', 'gzip');
      res.statusCode = 200;
      const gzip = zlib.createGzip();
      stream.pipe(gzip).pipe(res);
    } else {
      stream.pipe(res, 'utf-8');
    }
  } catch (err) {
    res.statusCode = 500;
    res.end();
    next();
  }
}

async function getSegmentStream(req, res, next, filePath) {
  try {
    const stream = await fs.createReadStream(filePath);
    res.setHeader('Content-Type', CONTENT_TYPE.SEGMENT);
    res.statusCode = 200;
    stream.pipe(res);
  } catch (err) {
    res.statusCode = 500;
    res.end();
    next();
  }
}

/**
 * @type get
 * @path /stream/*
 */
async function playStream(req, res, next) {
  this.logger.debug(
    `${this._traceStack()} - Play stream API called for url: ${req.url}`,
  );

  // Map path to files
  const fileName = path.basename(req.url);
  const fileExt = path.extname(req.url);
  const streamFolder = req.url.split('/')[3];
  const filePath = `media/${streamFolder}/${fileName}`;

  // Gzip support
  const ae = req.headers['accept-encoding'] || '';
  req.acceptsCompression = ae.match(/\bgzip\b/);

  // Stream file
  if (fileExt === '.ts') {
    getSegmentStream(req, res, next, filePath);
  } else {
    getManifestStream(req, res, next, filePath);
  }
}

module.exports = {
  playStream,
};
