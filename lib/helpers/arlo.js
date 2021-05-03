/**
 * Import external libraries
 */
const Arlo = require('arlo');
const moment = require('moment');
const fs = require('fs');
const debug = require('debug')('HLS:Arlo');

/**
 * Process event data
 */
async function _processUpdate(eventData) {
  const { batteryLevel } = eventData.data;
  const { signalStrength } = eventData.data;
  const { chargingState } = eventData.data;

  if (
    typeof batteryLevel === 'undefined' &&
    typeof signalStrength === 'undefined'
  ) {
    debug('No battery level or signal strength to record');
    return;
  }

  let location;
  switch (eventData.id) {
    case this.camLivingRoom.ID:
      location = 'Living room';
      break;
    case this.camGarden.ID:
      location = 'Garden';
      break;
    default:
      location = 'N/A';
  }

  debug(`[${eventData.id}] Saving ${location} camera battery event data`);
  const dataVaules = {
    time: new Date(),
    device: eventData.id,
    location,
    signal: signalStrength || 100,
    battery: batteryLevel || 100,
    chargingState: chargingState || 'Off',
  };

  // debug(dataVaules);

  let dbConnection;
  try {
    debug('Connect to DB');
    dbConnection = await this._connectToDB();

    debug('Insert data');
    const results = await dbConnection
      .db(this.namespace)
      .collection(this.namespace)
      .insertOne(dataVaules);

    if (results.insertedCount === 1)
      this.logger.info(`[${eventData.id}] Saved battery data (${location})`);
    else
      this.logger.error(
        `${this._traceStack()} - [${
          eventData.id
        }] Failed to save battery data: ${location})`,
      );
  } catch (err) {
    this.logger.error(`${this._traceStack()} - ${err.message}`);
  } finally {
    try {
      debug(`Close DB connection`);
      await dbConnection.close();
    } catch (err) {
      debug('Not able to close DB');
    }
  }
}

/**
 * Login to Arlo api
 */
async function _logIn() {
  try {
    debug(`Login to Arlo`);
    const sucess = await this.arlo.login();
    if (!sucess) debug('Not able to login');
  } catch (err) {
    debug('Not able to login');
  }
}

/**
 * Login to Arlo api and setup events
 */
async function _setupArloEvents() {
  debug(`Setting up Arlo devices`);

  debug(`Getting arlo init option from vault`);
  const arloUser = await this._getVaultSecret.call(this, 'ArloUsername');
  const arloPassword = await this._getVaultSecret.call(this, 'ArloPassword');
  const emailUser = await this._getVaultSecret.call(this, 'emailUser');
  const emailPassword = await this._getVaultSecret.call(this, 'emailPassword');
  const emailServer = await this._getVaultSecret.call(this, 'emailServer');
  const updatePropertiesEvery = 15;
  const config = {
    arloUser,
    arloPassword,
    emailUser,
    emailPassword,
    emailServer,
    updatePropertiesEvery,
  };

  debug('Create arlo instance');
  this.arlo = new Arlo(config);
  this.camGarden = {};
  this.camLivingRoom = {};

  this.arlo.on(Arlo.EVENT_BATTERY, async (info) => {
    debug('Battery update event');
    await _processUpdate.call(this, info);
  });

  // Set up devices
  this.arlo.on(Arlo.EVENT_GOT_DEVICES, (devices) => {
    // Setup media library collector
    this._getArloMediaData();

    // eslint-disable-next-line no-restricted-syntax
    for (const device of devices) {
      if (device.deviceType === Arlo.TYPE_CAMERA) {
        debug(`Found camera: ${device.deviceName} - ${device.deviceId}`);

        if (device.deviceName === 'Living room') {
          this.camLivingRoom.ID = device.deviceId;
        }
        if (device.deviceName === 'Garden') {
          this.camGarden.ID = device.deviceId;
        }

        // eslint-disable-next-line no-loop-func
        setTimeout(() => {
          debug(`[${device.deviceId}] Requesting full frame snapshop update`);
          this.arlo.getNewSnapshot(device.deviceId);
        }, 5000);
      }
    }
  });

  // Save motion recordings
  this.arlo.on(Arlo.EVENT_MEDIA_UPLOAD, async (media) => {
    debug('New media available');
    const { presignedContentUrl } = media;

    if (presignedContentUrl) {
      debug('Setup storage path');
      const month = moment().format('M');
      let folderPath = `media/${month}`;
      try {
        fs.mkdirSync(folderPath);
      } catch (err) {
        if (!err.message.includes('EEXIST: file already exists')) {
          debug(err);
        }
      }
      folderPath += `/${moment().format('DD-hh-mm-ss')}.mp4`;

      if (fs.existsSync(folderPath)) {
        debug('Recording already exists');
        return;
      }

      try {
        debug('Download and save recording');
        await this._downloadFile.call(this, presignedContentUrl, folderPath);
        this.logger.info(`Saved recording: ${folderPath}`);
      } catch (err) {
        this.logger.error(`${this._traceStack()} - ${err}`);
      }
    }
  });

  this.arlo.once(Arlo.EVENT_LOGOUT, () => {
    this.logger.info(`${this._traceStack()} - Logged out of Arlo api`);

    // Remove event listners
    this.arlo.removeAllListeners();

    // Wait 5 minutes then login again
    debug('Waiting 5 minutes before loggin back in');
    setTimeout(() => {
      debug('Setup Arlo and log back in to Arlo api');
      try {
        debug('Remove Arlo class instance');
        delete this.arlo;

        _setupArloEvents.call(this);
      } catch (err) {
        debug(err);
      }
    }, 5 * 60000);
  });

  // Login to Arlo api
  await _logIn.call(this);
}

/**
 * Setup Arlo
 */
async function _setupArlo() {
  await _setupArloEvents.call(this);

  // Setup schedules
  if (process.env.NO_SCHEDULE === 'true') {
    debug('Ignore setting up schedules');
  } else {
    debug('Set up schedules');
    this.setupSchedules();
  }
}

module.exports = {
  _setupArlo,
};
