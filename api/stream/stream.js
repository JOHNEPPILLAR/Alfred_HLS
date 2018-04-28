/**
 * Import external libraries
 */
const Skills = require('restify-router').Router;
const serviceHelper = require('../../lib/helper.js');
const fs = require('fs');
// const url = require('url');
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
async function getManifestStream(req, res, filePath) {
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
}

async function getSegmentStream(req, res, filePath) {


}

async function createStream(req, res, next) {
  serviceHelper.log('trace', 'createStream', 'Create stream API called');

  const fileName = path.basename(req.url, '.m3u8');
  const fileExt = path.extname(req.url);
  let filePath;

  if (fileName === 'cam0' && fileExt === '.m3u8') filePath = 'streams/0/cam.m3u8';
  if (fileName === 'cam1' && fileExt === '.m3u8') filePath = 'streams/1/cam.m3u8';

  console.log(filePath);

  if (typeof filePath === 'undefined') { // Invalid stream request
    serviceHelper.log('info', 'createStream', 'Invalid stream request');
    serviceHelper.sendResponse(res, false, 'Invalid stream request');
    next();
    return false;
  }

  fs.exists(filePath, async (exists) => { // Check if stream is ready
    if (!exists) {
      serviceHelper.log('info', 'createStream', 'Stream not ready');
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
        getSegmentStream(req, res, filePath);
        break;
      default:
        getManifestStream(req, res, filePath);
        break;
    }
    return true;
  });
  return true;
}
skill.get('/stream/*', createStream);

module.exports = skill;
