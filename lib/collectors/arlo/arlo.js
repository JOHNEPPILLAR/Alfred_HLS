/**
 * Import libraries
 */
const debug = require('debug')('HLS:MediaLibrary');

const mediaPollingIntival = 60 * 60000; // 1 hr

/**
 * Process video
 */
async function _processEvent(mediaEvent, dbConnection) {
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

    const collectionName = `media_${location}`;

    debug('Check if recording exists');
    const query = { filename: thumbFileName };
    const results = await dbConnection
      .db(this.namespace)
      .collection(`${collectionName}.files`)
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
      collectionName,
      thumbFileName,
      mediaEvent.presignedThumbnailUrl,
    );

    debug(`[${mediaEvent.deviceId}] Save video file`);
    await this._saveStreamToDB(
      dbConnection,
      collectionName,
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

  debug('Connect to DB');
  const dbConnection = await this._connectToDB();

  debug('Store video');
  // eslint-disable-next-line no-restricted-syntax
  for (const mediaEvent of mediaLibrary) {
    // eslint-disable-next-line no-await-in-loop
    await _processEvent.call(this, mediaEvent, dbConnection);
  }

  debug(`Close DB connection`);
  // eslint-disable-next-line no-await-in-loop
  await dbConnection.close();
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
