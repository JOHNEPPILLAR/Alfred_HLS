/**
 * Import external libraries
 */
const Skills = require('restify-router').Router;
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const UUID = require('pure-uuid');
const childProcess = require('child_process');
const rimraf = require('rimraf');

/**
 * Import helper libraries
 */
const serviceHelper = require('../../lib/helper.js');

const skill = new Skills();
const CONTENT_TYPE = {
  MANIFEST: 'application/vnd.apple.mpegurl',
  SEGMENT: 'video/MP2T',
  HTML: 'text/html',
};

function checkFileExists(filePath) {
  const timeout = 10000; // 10 Seconds
  return new Promise(((resolve, reject) => {
    const timer = setTimeout(() => {
      watcher.close();
      reject(new Error('File did not exists and was not created during the timeout.'));
    }, timeout);

    fs.access(filePath, fs.constants.R_OK, (err) => {
      if (!err) {
        clearTimeout(timer);
        watcher.close();
        resolve();
      }
    });
    const dir = path.dirname(filePath);
    const basename = path.basename(filePath);

    const watcher = fs.watch(dir, (eventType, filename) => {
      if (filename === basename) {
        clearTimeout(timer);
        watcher.close();
        resolve();
      }
    });
  }));
}

function removeTempFolder(removeUUID) {
  try {
    serviceHelper.log('trace', `Removing temp folder: ${removeUUID}`);
    rimraf.sync(`streams/${removeUUID}`);
  } catch (err) {
    serviceHelper.log('error', err.message);
  }
}

/**
 * @api {get} /stopStream
 * @apiName stopStream
 * @apiGroup Stream
 *
 * @apiSuccessExample {json} Success-Response:
 *   HTTPS/1.1 200 OK
 *   {
 *     data: true
 *   }
 *
 * @apiErrorExample {json} Error-Response:
 *   HTTPS/1.1 400 Bad Request
 *   {
 *     data: Error message
 *   }
 *
 */
function removeStream(streamUUID) {
  let foundStream = false;
  global.streamsStore.forEach((item, index, object) => {
    if (item[0].format() === streamUUID) {
      item[1].kill();
      removeTempFolder(streamUUID);
      object.splice(index, 1);
      foundStream = true;
    }
  });
  return foundStream;
}

async function stopStream(req, res, next) {
  const { streamUUID } = req.query;
  if (removeStream(streamUUID)) {
    serviceHelper.log('trace', `Stopped stream: ${streamUUID}`);
    serviceHelper.sendResponse(res, true, `Stopped stream: ${streamUUID}`);
  } else {
    serviceHelper.log('trace', `Unable to stop stream: ${streamUUID}`);
    serviceHelper.sendResponse(res, true, `Unable to stop stream: ${streamUUID}`);
  }
  serviceHelper.log('info', `${global.streamsStore.length} active stream(s)`);
  next();
}
skill.get('/stop', stopStream);

/**
 * @api {get} /startStream
 * @apiName startStream
 * @apiGroup Stream
 *
 * @apiSuccessExample {json} Success-Response:
 *   HTTPS/1.1 200 OK
 *   {
 *     "data": "58d7b01e-2e3c-4d3a-9e09-75cbea5d44ee"
 *   }
 *
 * @apiErrorExample {json} Error-Response:
 *   HTTPS/1.1 400 Bad Request
 *   {
 *     data: Error message
 *   }
 *
 */
async function startStream(req, res, next) {
  let writeStream;
  let streamUUID;

  try {
    serviceHelper.log('trace', 'Create base streams folder if missing');
    fs.mkdirSync('streams');
  // eslint-disable-next-line no-empty
  } catch (err) {}

  try {
    streamUUID = new UUID(4);
    const folderPath = `streams/${streamUUID}`;
    const fullFilePath = `${folderPath}/cam.m3u8`;

    // removeTempFolder(streamUUID.format());

    serviceHelper.log('trace', 'Create temp storage path');
    fs.mkdirSync(folderPath);

    let { camURL } = process.env;
    if (process.env.Mock === 'true') {
      serviceHelper.log('info', 'Mock mode enabled, using test file as stream');
      camURL = process.env.mockCamURL;
    }
    const args = ['-i', camURL, '-hls_time', 3, '-hls_wrap', 10, fullFilePath];

    serviceHelper.log('trace', 'Start converting');
    writeStream = childProcess.spawn('ffmpeg',
      args,
      { detached: false, stdio: 'ignore' });

    // writeStream.unref();

    await checkFileExists(fullFilePath);

    global.streamsStore.push([streamUUID, writeStream]);
    serviceHelper.log('info', `${global.streamsStore.length} active stream(s)`);

    // Timeout stream
    setTimeout(() => {
      serviceHelper.log('trace', `Timeout reached for stream: ${streamUUID.format()}`);
      if (removeStream(streamUUID.format())) {
        serviceHelper.log('info', `Timmed out stream: ${streamUUID.format()}`);
        serviceHelper.log('info', `${global.streamsStore.length} active stream(s)`);
      } else {
        serviceHelper.log('trace', `Stream not active: ${streamUUID.format()}`);
      }
    }, 600000); // 10 minutes

    serviceHelper.sendResponse(res, true, streamUUID.format());
    next();
  } catch (err) {
    serviceHelper.log('error', err.message);
    writeStream.kill();
    removeTempFolder(streamUUID.format());
    serviceHelper.sendResponse(res, false, err.message);
    next();
  }
}
skill.get('/start', startStream);


/**
 * @api {get} /play
 * @apiName play
 * @apiGroup Stream
 *
 * @apiSuccessExample {json} Success-Response:
 *   HTTPS/1.1 200 OK
 *   {
 *     success: 'true'
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

async function playStream(req, res, next) {
  serviceHelper.log('trace', `Create stream API called for url: ${req.url}`);

  // Map path to files
  const fileName = path.basename(req.url).split('?')[0];
  const fileExt = path.extname(req.url);
  const streamFolder = req.url.split('/')[3];
  const filePath = `streams/${streamFolder}/${fileName}`;

  // Check if stream is ready
  fs.exists(filePath, async (exists) => {
    if (!exists) {
      serviceHelper.log('error', `Stream does not exists: ${streamFolder}`);
      serviceHelper.sendResponse(res, 404, `Stream does not exists: ${streamFolder}`);
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
skill.get('/play/*', playStream);

module.exports = skill;
