/**
 * Import external libraries
 */
const Arlo = require('node-arlo');

const subscribeTimer = 15 * 60 * 1000; // 15 minutes

async function loginArlo() {
  const email = await this._getVaultSecret.call(this, 'ArloUsername');
  const password = await this._getVaultSecret.call(this, 'ArloPassword');
  this.logger.trace(`${this._traceStack()} - Logging into Arlo`);
  this.arlo.login(email, password);
}

async function processUpdate(deviceName, info) {
  this.logger.trace(
    `${this._traceStack()} - ${deviceName} update event: ${JSON.stringify(
      info,
    )}`,
  );

  const { batteryLevel } = info;
  const { signalStrength } = info;

  if (batteryLevel === undefined || signalStrength === undefined) {
    return;
  }

  const dataVaules = {
    time: new Date(),
    device: info.serialNumber,
    location: deviceName,
    signal: info.signalStrength,
    battery: info.batteryLevel,
  };

  let dbConnection;

  this.logger.trace(
    `${this._traceStack()} - Saving data: ${dataVaules.location} (${
      dataVaules.device
    })`,
  );

  try {
    dbConnection = await this._connectToDB();
    this.logger.trace(`${this._traceStack()} - Insert data`);
    const results = await dbConnection
      .db(this.namespace)
      .collection(this.namespace)
      .insertOne(dataVaules);

    if (results.insertedCount === 1)
      this.logger.info(
        `Saved data: ${dataVaules.location} (${dataVaules.device})`,
      );
    else
      this.logger.error(
        `${this._traceStack()} - Failed to save data: ${dataVaules.location} (${
          dataVaules.device
        })`,
      );
  } catch (err) {
    this.logger.error(`${this._traceStack()} - ${err.message}`);
  } finally {
    this.logger.trace(`${this._traceStack()} - Close DB connection`);
    await dbConnection.close();
  }
}

function _setupArlo() {
  this.arlo = new Arlo();

  // Set up devices
  this.arlo.on(Arlo.FOUND, (device) => {
    if (device.getType() === Arlo.BASESTATION) {
      this.logger.trace(
        `${this._traceStack()} - Found base station: ${device.getName()} - ${
          device.id
        }`,
      );
      this.baseStation = device;
      setTimeout(() => this.baseStation.subscribe(), 1000);
    }

    if (device.getType() === Arlo.CAMERA) {
      const deviceName = device.getName();

      this.logger.trace(
        `${this._traceStack()} - Found camera: ${deviceName} - ${device.id}`,
      );

      if (deviceName === 'Living Room') {
        this.livingRoomCam = device;
        this.livingRoomCam.on(Arlo.UPDATE, (info) =>
          processUpdate.call(this, deviceName, info),
        );
        setTimeout(() => this.livingRoomCam.get(), 1000);
        setInterval(() => {
          this.livingRoomCam.get();
          this.livingRoomCam.getSnapshot();
        }, subscribeTimer);
      }

      if (deviceName === 'Garden') {
        this.gardenCam = device;
        this.gardenCam.on(Arlo.UPDATE, (info) =>
          processUpdate.call(this, deviceName, info),
        );
        setTimeout(() => this.gardenCam.get(), 1000);
        setInterval(() => {
          this.gardenCam.get();
          this.gardenCam.getSnapshot();
        }, subscribeTimer);
      }
    }
  });

  // Setup schedules
  this.setupSchedules();

  // Login & get devices
  loginArlo.call(this);
}

module.exports = {
  _setupArlo,
};
