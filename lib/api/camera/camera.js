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
 * @path /camera/:camera/privacystatus
 */
async function getPrivacyStatus(req, res, next) {
  debug(`Check if camera's privacy status API called`);

  const { camera } = req.params;

  let isPrivacyEnabled = false;

  try {
    switch (camera.toLowerCase()) {
      case 'garden':
        debug(`Get privacy status from Garden cam`);
        isPrivacyEnabled = await this.arlo.isPrivacyEnabled(this.camGarden.ID);
        break;
      case 'livingroom':
        debug(`Get privacy status from Living room cam`);
        isPrivacyEnabled = await this.arlo.isPrivacyEnabled(
          this.camLivingRoom.ID,
        );
        break;
      case 'kids':
        isPrivacyEnabled = false;
        break;
      default:
        throw new Error('Invalid room/cam');
    }

    if (typeof res !== 'undefined' && res !== null) {
      this._sendResponse(res, next, 200, { isPrivacyEnabled });
    }
    return isPrivacyEnabled;
  } catch (err) {
    this.logger.error(`${this._traceStack()} - ${err.message}`);
    if (typeof res !== 'undefined' && res !== null) {
      this._sendResponse(res, next, 500, err);
    }
  }
  return true;
}

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
        imageURL = await this.arlo.getSnapshotURL(this.camGarden.ID);
        if (imageURL instanceof Error || typeof imageURL === 'undefined')
          throw imageURL;
        await axios
          .get(imageURL.presignedFullFrameSnapshotUrl, {
            responseType: 'stream',
          })
          .then((response) => {
            response.data.pipe(res);
          });
        next();
        break;
      case 'livingroom':
        debug(`Get latest image from Living room cam`);
        imageURL = await this.arlo.getSnapshotURL(this.camLivingRoom.ID);
        if (imageURL instanceof Error || typeof imageURL === 'undefined')
          throw imageURL;
        await axios
          .get(imageURL.presignedFullFrameSnapshotUrl, {
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
        const folderPath = `tmp/${uuid}`;
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
  }
}

/**
 * Stream helper functions
 */
function stopStream(camera) {
  // eslint-disable-next-line default-case
  switch (camera.toLowerCase()) {
    case 'garden':
      if (this.arlo.stopStream(this.camGarden.ID))
        this.camGarden.streamURL = null;
      break;
    case 'livingroom':
      if (this.arlo.stopStream(this.camLivingRoom.ID))
        this.camLivingRoom.streamURL = null;
      break;
  }
}

function streamActive(camera, url) {
  // eslint-disable-next-line default-case
  switch (camera.toLowerCase()) {
    case 'garden':
      this.camGarden.streamURL = url;
      break;
    case 'livingroom':
      this.camLivingRoom.streamURL = url;
      break;
  }
}

function ffmpegConvert(streamURL, camera, req, res, next) {
  debug(`Setup ffmpeg params`);

  let sentURLtoCaller = false;

  const uuid = uuidV4();
  const folderPath = `tmp/${uuid}`;
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
    this._sendResponse(res, next, 500, err);
    return;
  }

  try {
    debugStream(`Check folder exists: ${folderPath}`);
    if (fs.existsSync(folderPath)) {
      debugStream(`Folder created: ${folderPath}`);
    } else {
      const err = new Error(`Unable to create folder: ${folderPath}`);
      this.logger.error(`${this._traceStack()} - ${err.message}`);
      this._sendResponse(res, next, 500, err);
      return;
    }
  } catch (err) {
    this.logger.error(`${this._traceStack()} - ${err.message}`);
    this._sendResponse(res, next, 500, err);
    return;
  }

  this.logger.info(`Start stream: ${camera} - ${uuid}`);
  let stream;
  try {
    stream = spawn('ffmpeg', args);
    streamActive.call(this, camera, `${folderPath}/cam.m3u8`);
  } catch (err) {
    this.logger.error(`${this._traceStack()} - ${err.message}`);
    this.logger.error(args.toString());
    stopStream.call(this, camera);
    this._sendResponse(res, next, 500, err);
    return;
  }

  stream.once('error', (err) => {
    this.logger.error(`${this._traceStack()} - ${err.message}`);
    stopStream.call(this, camera);
    this._sendResponse(res, next, 500, err);
  });

  stream.once('exit', () => {
    this.logger.info(`FFmpeg stream ended: ${camera} - ${uuid}`);
    debugStream(`Removing folder: ${folderPath}`);
    stopStream.call(this, camera);
    try {
      fs.rmdirSync(folderPath, { recursive: true });
    } catch (err) {
      this.logger.error(`${this._traceStack()} - ${err.message}`);
    }
  });

  // stream.stdout.on('data', (data) => {
  //   debugStream(`stdout:\n${data}`);
  // });

  stream.stderr.on('data', (data) => {
    if (
      (data.includes('undefined:') ||
        data.includes('Invalid data found') ||
        data.includes('No such file or directory')) &&
      !sentURLtoCaller
    ) {
      try {
        const err = new Error(`Stream error: ${data}`);
        this.logger.error(`${this._traceStack()} - ${data}`);
        this.logger.error(`${this._traceStack()} - ${args}`);
        stopStream.call(this, camera);
        this._sendResponse(res, next, 500, err);
        sentURLtoCaller = true;
        return;
      } catch (err) {
        this.logger.error(`${this._traceStack()} - ${err.message}`);
        return;
      }
    }

    if (data.includes(`${folderPath}/cam.m3u8`) && !sentURLtoCaller) {
      try {
        // Make sure m3u8 file exists
        if (fs.existsSync(`${folderPath}/cam.m3u8`)) {
          this._sendResponse(res, next, 200, {
            stream: `${uuid}/cam.m3u8`,
          });
          sentURLtoCaller = true;
        }
      } catch (err) {
        this.logger.error(`${this._traceStack()} - ${err.message}`);
      }
    }
  });

  setTimeout(() => {
    debugStream(`Timout stream: ${camera} - ${uuid}`);
    this.currentStream = null;
    stream.kill();
  }, 5 * 60 * 1000); // 5 minutes
}

/**
 * @type get
 * @path /camera/:camera/stream
 */
async function startStream(req, res, next) {
  debug(`Display camera stream API called`);

  const { camera } = req.params;
  let url;
  let isPrivacyEnabled;

  try {
    switch (camera.toLowerCase()) {
      case 'garden':
        if (
          typeof this.camGarden.streamURL !== 'undefined' &&
          this.camGarden.streamURL !== null
        ) {
          debug('Using existing garden stream');
          this._sendResponse(res, next, 200, {
            stream: this.camGarden.streamURL,
          });
        } else {
          isPrivacyEnabled = await this.arlo.isPrivacyEnabled(
            this.camGarden.ID,
          );
          if (isPrivacyEnabled) {
            const err = new Error(
              'Privacy mode active, unable to start stream',
            );
            this._sendResponse(res, next, 500, err);
            return;
          }
          url = await this.arlo.startStream(this.camGarden.ID);
          if (
            url instanceof Error ||
            url === null ||
            url === '' ||
            url === false ||
            typeof url === 'undefined'
          ) {
            const err = new Error(`Unable to get stream url: ${url}`);
            this.logger.error(`${this._traceStack()} - ${err.message}`);
            this._sendResponse(res, next, 500, err);
            return;
          }
          ffmpegConvert.call(this, url, camera, req, res, next);
        }
        break;
      case 'livingroom':
        if (
          typeof this.camLivingRoom.streamURL !== 'undefined' &&
          this.camLivingRoom.streamURL !== null
        ) {
          debug('Using existing living room stream');
          this._sendResponse(res, next, 200, {
            stream: this.camLivingRoom.streamURL,
          });
        } else {
          isPrivacyEnabled = await this.arlo.isPrivacyEnabled(
            this.camLivingRoom.ID,
          );
          if (isPrivacyEnabled) {
            const err = new Error(
              'Privacy mode active, unable to start stream',
            );
            this._sendResponse(res, next, 500, err);
            return;
          }
          url = await this.arlo.startStream(this.camLivingRoom.ID);
          if (
            url instanceof Error ||
            url === null ||
            url === '' ||
            url === false ||
            typeof url === 'undefined'
          ) {
            const err = new Error(`Unable to get stream url: ${url}`);
            this.logger.error(`${this._traceStack()} - ${err.message}`);
            this._sendResponse(res, next, 500, err);
            return;
          }
          ffmpegConvert.call(this, url, camera, req, res, next);
        }
        break;
      case 'kids':
        url = await this._getVaultSecret.call(this, 'HLSCam');
        url += 'onvif/profile5/media.smp';
        ffmpegConvert.call(this, url, camera, req, res, next);
        break;
      default:
        throw new Error('No camera selected');
    }
  } catch (err) {
    this.logger.error(`${this._traceStack()} - ${err.message}`);
    if (typeof res !== 'undefined' && res !== null) {
      this._sendResponse(res, next, 500, err);
    }
  }
}

module.exports = {
  getPrivacyStatus,
  getImage,
  startStream,
};
