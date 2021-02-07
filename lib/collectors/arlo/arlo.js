/**
 * Import libraries
 */
const fs = require('fs');
const axios = require('axios');
const moment = require('moment');
const debug = require('debug')('HLS:MediaLibrary');

const mediaPollingIntival = 60 * 60000; // 1 hr

/**
 * Download file
 */
async function downloadFile(fileUrl, outputLocationPath) {
  return axios({
    method: 'get',
    url: fileUrl,
    responseType: 'stream',
  }).then((response) => {
    const writer = fs.createWriteStream(`${outputLocationPath}`);
    return new Promise((resolve, reject) => {
      response.data.pipe(writer);
      let error = null;
      writer.on('error', (err) => {
        error = err;
        writer.close();
        reject(err);
      });
      writer.on('close', () => {
        if (!error) {
          resolve(true);
        }
      });
    });
  });
}

/**
 * Process video
 */
async function _processEvent(mediaEvent) {
  if (mediaEvent.presignedContentUrl) {
    debug('Setup filenames');
    const baseName = mediaEvent.utcCreatedDate;

    let location;
    switch (mediaEvent.deviceId) {
      case '4SW17CSW57D2D':
        location = 'mum';
        break;
      case '5GG28C7XA992D':
        location = 'garden';
        break;
      default:
        location = 'living_room';
        break;
    }

    const thumbFileName = `${baseName}.jpg`;
    const videoFileName = `${baseName}.mp4`;

    debug('Ensure month folder exists');
    const month = moment().format('M');
    const year = moment().format('YYYY');
    const folderPath = `media/arlo/${year}/${month}/${location}`;
    try {
      fs.mkdirSync(folderPath, { recursive: true });
    } catch (err) {
      if (!err.message.includes('EEXIST: file already exists')) throw err;
    }

    debug('Check if file exists');
    const fullFilePath = `${folderPath}/${videoFileName}`;
    if (fs.existsSync(fullFilePath)) {
      debug('Recording already exists');
      return;
    }

    debug(`[${mediaEvent.deviceId}] Save thumb file`);
    await downloadFile.call(
      this,
      mediaEvent.presignedThumbnailUrl,
      `${folderPath}/${thumbFileName}`,
    );
    this.logger.info(`Saved file: ${thumbFileName}`);

    debug(`[${mediaEvent.deviceId}] Save video file`);
    await downloadFile.call(
      this,
      mediaEvent.presignedContentUrl,
      `${folderPath}/${videoFileName}`,
    );
    this.logger.info(`Saved file: ${videoFileName}`);
  }
}

/**
 * Process media library
 */
async function _processMediaLibrary(mediaLibrary) {
  debug(`Processing media library`);

  if (mediaLibrary.length === 0) {
    debug(`Nothing to process`);
    return;
  }

  debug('Store video');
  // eslint-disable-next-line no-restricted-syntax
  for (const mediaEvent of mediaLibrary) {
    try {
      // eslint-disable-next-line no-await-in-loop
      await _processEvent.call(this, mediaEvent);
    } catch (err) {
      this.logger.error(`${this._traceStack()} - ${err.message}`);
    }
  }
}

/**
 * Get data from Arlo media library
 */
async function _getArloMediaData() {
  try {
    debug("Get today's media library");
    const mediaLibrary = await this.arlo.getMediaLibrary();

    if (mediaLibrary instanceof Error || typeof mediaLibrary === 'undefined') {
      debug(mediaLibrary.message);
      return;
    }
    await _processMediaLibrary.call(this, mediaLibrary);
  } catch (err) {
    this.logger.error(`${this._traceStack()} - ${err.message}`);
  }

  setTimeout(() => _getArloMediaData.call(this), mediaPollingIntival);
}

module.exports = {
  _getArloMediaData,
};
