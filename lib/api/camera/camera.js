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
    if (camera.toLowerCase() === 'garden')
      imageURL = this.gardenCam.device.presignedLastImageUrl;
    if (camera.toLowerCase() === 'livingroom')
      imageURL = this.livingRoomCam.device.presignedLastImageUrl;

    if (imageURL === undefined) throw new Error('No image aviable');

    request.get(imageURL).pipe(res);
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
async function startStream(req, res, next) {
  this.logger.debug(`${this._traceStack()} - Display camera stream API called`);

  const { camera } = req.params;
  let cam;
  let sentURLtoCaller = false;

  try {
    if (camera.toLowerCase() === 'garden') cam = this.gardenCam;
    if (camera.toLowerCase() === 'livingroom') cam = this.livingRoomCam;
    if (camera.toLowerCase() === 'kids')
      cam = await this._getVaultSecret.call(this, 'HLSCam');
    if (cam === undefined) throw new Error('No camera selected');

    cam.getStream((streamURL) => {
      this.logger.trace(`${this._traceStack()} - Setup ffmpeg params`);
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
        this.logger.trace(
          `${this._traceStack()} - Removing folder: ${folderPath}`,
        );
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
    });
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
