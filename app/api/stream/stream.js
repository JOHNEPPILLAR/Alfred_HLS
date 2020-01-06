/**
 * Import external libraries
 */
const Skills = require('restify-router').Router;
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const serviceHelper = require('alfred-helper');

/**
 * Import helper libraries
 */
const RTSPRecorder = require('../../../app/server/RTSPRecorder.js');
const Arlo = require('../../../app/server/arlo.js');

const skill = new Skills();
const CONTENT_TYPE = {
  MANIFEST: 'application/vnd.apple.mpegurl',
  SEGMENT: 'video/MP2T',
  HTML: 'text/html',
};

/**
 * @api {get} /startStream
 * @apiName startStream
 * @apiGroup Stream
 *
 * @apiSuccessExample {json} Success-Response:
 *   HTTPS/1.1 200 OK
 *   {
 *     "data": "recordings/cd1a0e08-9b08-4565-a2b6-a2756cf85e8b/cam.m3u8"
 *    }
 *
 * @apiErrorExample {json} Error-Response:
 *   HTTPS/1.1 500 Internal error
 *   {
 *     data: Error message
 *   }
 *
 */
async function startStream(req, res, next) {
  serviceHelper.log('trace', `Start stream API called for url: ${req.url}`);
  const { CamRoom } = req.params;

  let HLSCamURL;
  let HLSCams;
  let camName;

  try {
    switch (CamRoom) {
      case 'Garden':
      case 'Living':
        // eslint-disable-next-line no-case-declarations
        const arlo = new Arlo();
        // eslint-disable-next-line no-case-declarations
        const HLSCamData = await arlo.getCamInfo(CamRoom);
        if (HLSCamData instanceof Error) throw new Error(HLSCamData.message);
        HLSCamURL = HLSCamData.camURL;
        camName = HLSCamData.camName;
        break;
      case 'Kids':
        camName = `${CamRoom} Room`;
        HLSCams = await serviceHelper.vaultSecret(process.env.ENVIRONMENT, 'HLSCam');
        if (HLSCamURL instanceof Error) throw new Error('Not able to get secret (CAM Info) from vault');
        // eslint-disable-next-line no-case-declarations
        let HLSCam = JSON.parse(HLSCams);
        HLSCam = HLSCam.filter((cam) => cam.Room === CamRoom);
        HLSCamURL = HLSCam[0].CamURL;
        break;
      default:
        serviceHelper.log('error', `Not able to match device: ${CamRoom}`);
        throw new Error(`Not able to match device: ${CamRoom}`);
    }

    const rec = new RTSPRecorder({
      name: camName,
      url: HLSCamURL,
      type: 'stream',
      disableStreaming: true,
      timeLimit: 600, // 10 minutes for each segmented video file
    });
    const streamUUID = await rec.startRecording(); // Start Recording
    serviceHelper.sendResponse(res, 200, streamUUID);
    next();
  } catch (err) {
    serviceHelper.log('error', err.message);
    serviceHelper.sendResponse(res, 500, err);
    next();
  }
}
skill.get('/start/:CamRoom', startStream);

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
 *   HTTPS/1.1 500 Internal error
 *   {
 *     data: Error message
 *   }
 *
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
      stream.pipe(
        res,
        'utf-8',
      );
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
  serviceHelper.log('trace', `Play stream API called for url: ${req.url}`);

  // Map path to files
  const fileName = path.basename(req.url).split('?')[0];
  const fileExt = path.extname(req.url);
  const streamFolder = req.url.split('/')[3];
  const filePath = `media/stream/${streamFolder}/${fileName}`;

  // Check if stream is ready
  fs.exists(filePath, async (exists) => {
    if (!exists) {
      serviceHelper.log(
        'error',
        `Stream does not exists: ${streamFolder}/${fileName}`,
      );
      serviceHelper.sendResponse(
        res,
        404,
        `Stream does not exists: ${streamFolder}/${fileName}`,
      );
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
