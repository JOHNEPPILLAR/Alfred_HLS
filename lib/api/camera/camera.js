/**
 * Import external libraries
 */
const { v4: uuidV4 } = require('uuid');
const fs = require('fs');
const { spawn } = require('child_process');
const axios = require('axios');
const debug = require('debug')('HLS:CameraAPI');
const debugStream = require('debug')('HLS:Stream');

/**
 * @type get
 * @path /camera/:camera/image
 */
async function getImage(req, res, next) {
  debug(`Display latest camera image API called`);

  const { camera } = req.params;

  let imageURL;

  try {
    switch (camera.toLowerCase()) {
      case 'garden':
        debug(`Get latest image from Garden cam`);
        imageURL = await this.arlo.getSnapshotURL(this.camGardenID);
        if (imageURL instanceof Error || typeof imageURL === 'undefined')
          throw imageURL;
        await axios
          .get(imageURL.presignedLastImageUrl, {
            responseType: 'stream',
          })
          .then((response) => {
            response.data.pipe(res);
          });
        next();
        break;
      case 'livingroom':
        debug(`Get latest image from Living room cam`);
        imageURL = await this.arlo.getSnapshotURL(this.camLivingRoomID);
        if (imageURL instanceof Error || typeof imageURL === 'undefined')
          throw imageURL;
        await axios
          .get(imageURL.presignedLastImageUrl, {
            responseType: 'stream',
          })
          .then((response) => {
            response.data.pipe(res);
          });
        next();
        break;
      case 'kids':
        // eslint-disable-next-line no-case-declarations
        let url = await this._getVaultSecret.call(this, 'HLSCam');
        url += 'onvif/profile5/media.smp';
        // eslint-disable-next-line no-case-declarations
        const uuid = uuidV4();
        // eslint-disable-next-line no-case-declarations
        const folderPath = `media/${uuid}`;
        // eslint-disable-next-line no-case-declarations
        const mediaArgs = ['-vframes', 1, '-r', 1];
        // eslint-disable-next-line no-case-declarations
        const args = ['-i', url];
        mediaArgs.map((item) => args.push(item));
        args.push(`${folderPath}/snapshot.jpg`);

        debug(`Create folder: ${folderPath}`);
        fs.mkdirSync(folderPath, { recursive: true });

        this.logger.info(`Start image capture: ${camera} - ${uuid}`);
        // eslint-disable-next-line no-case-declarations
        const camImage = spawn('ffmpeg', args);

        camImage.once('exit', async (code) => {
          debug(`Child process exit code : ${code}`);

          this.logger.info(`Image capture finished: ${camera} - ${uuid}`);
          try {
            imageURL = await fs.createReadStream(`${folderPath}/snapshot.jpg`, {
              bufferSize: 64 * 1024,
            });
            res.setHeader('Content-Type', 'image/jpeg');
            res.statusCode = 200;
            imageURL.pipe(res);
            next();

            debug(`Removing folder: ${folderPath}`);
            fs.rmdirSync(folderPath, { recursive: true });
          } catch (err) {
            throw new Error('No image aviable');
          }
        });

        break;
      default:
        throw new Error('Invalid room/cam');
    }
  } catch (err) {
    this.logger.error(`${this._traceStack()} - ${err.message}`);
    if (typeof res !== 'undefined' && res !== null) {
      this._sendResponse(res, next, 500, err);
    }
    return err;
  }
  return true;
}

/**
 * @type get
 * @path /camera/:camera/stream
 */
function ffmpegConvert(streamURL, camera, req, res, next) {
  debug(`Setup ffmpeg params`);

  let sentURLtoCaller = false;

  const uuid = uuidV4();
  const folderPath = `media/${uuid}`;
  const mediaArgs = [
    '-rtsp_transport',
    'tcp',
    '-vsync',
    0,
    '-vcodec',
    'copy',
    '-fflags',
    'nobuffer',
    '-f',
    'hls',
    '-hls_time',
    1,
    '-hls_wrap',
    5,
  ];

  const args = ['-i', streamURL];
  mediaArgs.map((item) => args.push(item));
  args.push(`${folderPath}/cam.m3u8`);

  try {
    debugStream(`Create folder: ${folderPath}`);
    fs.mkdirSync(folderPath, { recursive: true });
  } catch (err) {
    this.logger.error(`${this._traceStack()} - ${err.message}`);
    return;
  }

  this.logger.info(`Start stream: ${camera} - ${uuid}`);
  let stream;
  try {
    stream = spawn('ffmpeg', args);
  } catch (err) {
    this.logger.error(`${this._traceStack()} - ${err.message}`);
    this.logger.error(args.toString());
    this._sendResponse(res, next, 500, err);
  }

  stream.once('error', (err) => {
    this.logger.error(`${this._traceStack()} - ${err.message}`);
    this.logger.error(args.toString());
    this._sendResponse(res, next, 500, err);
  });

  stream.once('exit', () => {
    this.logger.info(`FFmpeg stream ended: ${camera} - ${uuid}`);
    debugStream(`Removing folder: ${folderPath}`);
    try {
      fs.rmdirSync(folderPath, { recursive: true });
    } catch (err) {
      this.logger.error(`${this._traceStack()} - ${err.message}`);
    }
  });

  stream.stdout.on('data', (data) => {
    debugStream(`stdout:\n${data}`);
  });

  stream.stderr.on('data', (data) => {
    if (
      (data.includes('undefined:') ||
        data.includes('Invalid data found') ||
        data.includes('No such file or directory')) &&
      !sentURLtoCaller
    ) {
      const err = new Error(`Stream error: ${data}`);
      this.logger.error(`${this._traceStack()} - ${data}`);

      this._sendResponse(res, next, 500, err);
      sentURLtoCaller = true;
    } else {
      debugStream(`stderr:\n${data}`);
    }

    if (data.includes(`${folderPath}/cam.m3u8`) && !sentURLtoCaller) {
      this._sendResponse(res, next, 200, {
        stream: `${folderPath}/cam.m3u8`,
      });
      sentURLtoCaller = true;
    }
  });

  setTimeout(() => {
    debugStream(`Timout stream: ${camera} - ${uuid}`);
    stream.kill();
  }, 5 * 60 * 1000); // 5 minutes
}

async function startStream(req, res, next) {
  debug(`Display camera stream API called`);

  const { camera } = req.params;
  let url;

  try {
    switch (camera.toLowerCase()) {
      case 'garden':
        await this.arlo.setPrivacyActive(this.camGardenID, false);
        setTimeout(async () => {
          url = await this.arlo.startStream(this.camGardenID);
          if (url instanceof Error)
            throw new Error(`No stream url available: ${camera.toLowerCase()}`);
          ffmpegConvert.call(this, url, camera, req, res, next);
        }, 2000);
        break;
      case 'livingroom':
        await this.arlo.setPrivacyActive(this.camLivingRoomID, false);
        setTimeout(async () => {
          url = await this.arlo.startStream(this.camLivingRoomID);
          if (url instanceof Error)
            throw new Error(`No stream url available: ${camera.toLowerCase()}`);
          ffmpegConvert.call(this, url, camera, req, res, next);
        }, 2000);
        break;
      case 'kids':
        url = await this._getVaultSecret.call(this, 'HLSCam');
        url += 'onvif/profile5/media.smp';
        ffmpegConvert.call(this, url, camera, req, res, next);
        break;
      default:
        throw new Error('No camera selected');
    }

    return true;
  } catch (err) {
    this.logger.error(`${this._traceStack()} - ${err.message}`);
    if (typeof res !== 'undefined' && res !== null) {
      this._sendResponse(res, next, 500, err);
    }
    return err;
  }
}

module.exports = {
  getImage,
  startStream,
};
