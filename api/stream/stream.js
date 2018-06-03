/**
 * Import external libraries
 */
const Skills = require('restify-router').Router;
const serviceHelper = require('../../lib/helper.js');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const CONTENT_TYPE = {
  MANIFEST: 'application/vnd.apple.mpegurl',
  SEGMENT: 'video/MP2T',
  HTML: 'text/html',
};

const skill = new Skills();

/**
 * @api {get} /stream
 * @apiName stream
 * @apiGroup Stream
 *
 * @apiSuccessExample {json} Success-Response:
 *   HTTPS/1.1 200 OK
 *   {
 *     sucess: 'true'
 *     data: HLS media stream
 *   }
 *
 * @apiErrorExample {json} Error-Response:
 *   HTTPS/1.1 400 Bad Request
 *   {
 *     data: Error message
 *   }
 *
 */
async function getManifestStream(req, res, next, filePath) {
  try {
    const stream = await fs.createReadStream(filePath, { bufferSize: 64 * 1024 });
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

async function createStream(req, res, next) {
  serviceHelper.log('trace', 'createStream', `Create stream API called for url: ${req.url}`);

  // Map path to files
  const urlPath = req.url.split('/');
  const fileName = path.basename(req.url);
  const fileExt = path.extname(req.url);
  let filePath = `streams/${urlPath[2]}/${fileName}`;

  // Override filepath if in Mock mode
  if (process.env.Mock === 'true') filePath = `mock/${fileName}`;

  // Check if stream is ready
  fs.exists(filePath, async (exists) => {
    if (!exists) {
      serviceHelper.log('error', 'createStream', 'Stream not ready');
      serviceHelper.sendResponse(res, 404, 'Stream not ready');
      next();
      return false;
    }

    // Gzip support
    const ae = req.headers['accept-encoding'] || '';
    req.acceptsCompression = ae.match(/\bgzip\b/);

    // Stream file
    switch (fileExt) {
      case '.ts':
        getSegmentStream(req, res, next, filePath);
        break;
      default:
        getManifestStream(req, res, next, filePath);
        break;
    }
    return true;
  });
  return true;
}
skill.get('/stream/*', createStream);

module.exports = skill;
