/**
 * Import libraries
 */
const debug = require('debug')('HLS:MediaLibrary');

const mediaPollingIntival = 60 * 60000; // 1 hr

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
        location = 'Mum';
        break;
      case '5GG28C7XA992D':
        location = 'Garden';
        break;
      default:
        location = 'LivingRoom';
        break;
    }

    const thumbFileName = `${baseName}-${location}.jpg`;
    const videoFileName = `${baseName}-${location}.mp4`;

    debug('Connect to DB');
    const dbConnection = await this._connectToDB();

    debug('Check if recording exists');
    const query = { filename: thumbFileName };
    const results = await dbConnection
      .db(this.namespace)
      .collection('arloMedia.files')
      .find(query)
      .toArray();

    if (results.length > 0) {
      // Exit function event already is saved
      debug('Media event already saved in DB');
      return false;
    }

    debug(`[${mediaEvent.deviceId}] Save thumb file`);
    await this._saveStreamToDB(
      dbConnection,
      'arloMedia',
      thumbFileName,
      mediaEvent.presignedThumbnailUrl,
    );

    debug(`[${mediaEvent.deviceId}] Save video file`);
    await this._saveStreamToDB(
      dbConnection,
      'arloMedia',
      videoFileName,
      mediaEvent.presignedContentUrl,
    );

    this.logger.info(`[${mediaEvent.deviceId}] Saved motion event`);
  }
  return true;
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

  await _processEvent.call(this, mediaLibrary[0]);
  // eslint-disable-next-line no-restricted-syntax
  for (const mediaEvent of mediaLibrary) {
    debug('Store video');
    // eslint-disable-next-line no-await-in-loop
    await _processEvent.call(this, mediaEvent);
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
    this.logger.error(`${this._traceStack()} - ${err}`);
  }

  setTimeout(() => _getArloMediaData.call(this), mediaPollingIntival);
}

module.exports = {
  _getArloMediaData,
};
