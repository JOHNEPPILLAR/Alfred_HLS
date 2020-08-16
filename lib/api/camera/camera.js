/**
 * Import external libraries
 */
const UUID = require('pure-uuid');
const fs = require('fs');
const { spawn } = require('child_process');
const request = require('request');

/**
 * @type get
 * @path /camera/:camera/image
 */
async function getImage(req, res, next) {
  this.logger.debug(
    `${this._traceStack()} - Display latest camera image API called`,
  );

  const { camera } = req.params;
  let imageURL;

  try {
    switch (camera.toLowerCase()) {
      case 'garden':
        imageURL = this.gardenCam.device.presignedLastImageUrl;
        request.get(imageURL).pipe(res);
        break;
      case 'livingroom':
        imageURL = this.livingRoomCam.device.presignedLastImageUrl;
        request.get(imageURL).pipe(res);
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
        camImage.once('exit', async () => {
          this.logger.info(`Image capture finished: ${camera} - ${uuid}`);

          const image = await fs.createReadStream(
            `${folderPath}/snapshot.jpg`,
            {
              bufferSize: 64 * 1024,
            },
          );
          res.setHeader('Content-Type', 'image/jpeg');
          res.statusCode = 200;
          image.pipe(res);
          next();

          this.logger.trace(
            `${this._traceStack()} - Removing folder: ${folderPath}`,
          );
          fs.rmdirSync(folderPath, { recursive: true });
        });

        break;
      default:
        throw new Error('No image aviable');
    }
    next();
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
  //  this.logger.trace(
  //    `stdout:\n${data}`,
  //  );
  // });

  stream.stderr.on('data', (data) => {
    //  this.logger.trace(
    //    `stderr:\n${data}`,
    //  );

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

  try {
    switch (camera.toLowerCase()) {
      case 'garden':
        await this.gardenCam.setPrivacyActive(false);
        setTimeout(() => {
          this.gardenCam.getStream((streamURL) => {
            ffmpegConvert.call(this, streamURL, camera, req, res, next);
          });
        }, 2000);
        break;
      case 'livingroom':
        await this.livingRoomCam.setPrivacyActive(false);
        this.livingRoomCam.getStream((streamURL) => {
          ffmpegConvert.call(this, streamURL, camera, req, res, next);
        });
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
