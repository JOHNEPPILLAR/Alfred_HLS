/**
 * Import external libraries
 */
const UUID = require('pure-uuid');
const fs = require('fs');
const { spawn } = require('child_process');
const axios = require('axios');

/**
 * @type get
 * @path /camera/:camera/image
 */
async function getImage(req, res, next) {
  this.logger.trace(
    `${this._traceStack()} - Display latest camera image API called`,
  );

  const { camera } = req.params;

  let imageURL;

  try {
    switch (camera.toLowerCase()) {
      case 'garden':
        this.logger.trace(
          `${this._traceStack()} - Get latest image from Garden cam`,
        );
        imageURL = await this.arlo.getFFSnapshotURL(this.camGarden.id);
        await axios
          .get(imageURL, { responseType: 'stream' })
          .then((response) => {
            response.data.pipe(res);
          });
        next();
        break;
      case 'livingroom':
        this.logger.trace(
          `${this._traceStack()} - Get latest image from Living room cam`,
        );
        imageURL = await this.arlo.getFFSnapshotURL(this.camLivingRoom.id);
        await axios
          .get(imageURL, { responseType: 'stream' })
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
        const uuid = new UUID(4);
        // eslint-disable-next-line no-case-declarations
        const folderPath = `media/${uuid}`;
        // eslint-disable-next-line no-case-declarations
        const mediaArgs = ['-vframes', 1, '-r', 1];
        // eslint-disable-next-line no-case-declarations
        const args = ['-i', url];
        mediaArgs.map((item) => args.push(item));
        args.push(`${folderPath}/snapshot.jpg`);

        this.logger.trace(
          `${this._traceStack()} - Create folder: ${folderPath}`,
        );
        fs.mkdirSync(folderPath);

        this.logger.info(`Start image capture: ${camera} - ${uuid}`);
        // eslint-disable-next-line no-case-declarations
        const camImage = spawn('ffmpeg', args);

        camImage.once('exit', async (code) => {
          this.logger.trace(
            `${this._traceStack()} - Child process exit code : ${code}`,
          );

          this.logger.info(`Image capture finished: ${camera} - ${uuid}`);
          try {
            imageURL = await fs.createReadStream(`${folderPath}/snapshot.jpg`, {
              bufferSize: 64 * 1024,
            });
            res.setHeader('Content-Type', 'image/jpeg');
            res.statusCode = 200;
            imageURL.pipe(res);
            next();

            this.logger.trace(
              `${this._traceStack()} - Removing folder: ${folderPath}`,
            );
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
  this.logger.trace(`${this._traceStack()} - Setup ffmpeg params`);

  let sentURLtoCaller = false;

  const uuid = new UUID(4);
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

  this.logger.trace(`${this._traceStack()} - Create folder: ${folderPath}`);
  fs.mkdirSync(folderPath);

  this.logger.info(`Start stream: ${camera} - ${uuid}`);
  const stream = spawn('ffmpeg', args);

  stream.once('exit', () => {
    this.logger.info(`Stream finished: ${camera} - ${uuid}`);
    this.logger.trace(`${this._traceStack()} - Removing folder: ${folderPath}`);
    fs.rmdirSync(folderPath, { recursive: true });
  });

  // stream.stdout.on('data', (data) => {
  //  this.logger.trace(`stdout:\n${data}`);
  // });

  stream.stderr.on('data', (data) => {
    if (
      (data.includes('undefined:') || data.includes('Invalid data found')) &&
      !sentURLtoCaller
    ) {
      const err = new Error(`Creating stream error: ${data}`);
      this.logger.error(`${this._traceStack()} - ${data}`);
      this._sendResponse(res, next, 500, err);
      sentURLtoCaller = true;
    } else {
      this.logger.trace(`stderr:\n${data}`);
    }

    if (data.includes(`${folderPath}/cam.m3u8.tmp`) && !sentURLtoCaller) {
      this._sendResponse(res, next, 200, {
        stream: `${folderPath}/cam.m3u8`,
      });
      sentURLtoCaller = true;
    }
  });

  setTimeout(() => {
    this.logger.trace(
      `${this._traceStack()} - Timout stream: ${camera} - ${uuid}`,
    );
    stream.kill();
  }, 5 * 60 * 1000); // 5 minutes
}

async function startStream(req, res, next) {
  this.logger.debug(`${this._traceStack()} - Display camera stream API called`);

  const { camera } = req.params;
  let url;
  let device;

  try {
    switch (camera.toLowerCase()) {
      case 'garden':
        device = await this.arlo.getDevice(this.camGarden.id);
        await device.setPrivacyActive(false);
        setTimeout(async () => {
          url = await this.arlo.getStream(this.camGarden.id);
          if (url instanceof Error)
            throw new Error(`No stream url available: ${camera.toLowerCase()}`);
          ffmpegConvert.call(this, url, camera, req, res, next);
        }, 2000);
        break;
      case 'livingroom':
        device = await this.arlo.getDevice(this.camLivingRoom.id);
        await device.setPrivacyActive(false);
        setTimeout(async () => {
          url = await this.arlo.getStream(this.camLivingRoom.id);
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
