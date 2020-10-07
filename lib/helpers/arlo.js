/**
 * Import external libraries
 */
const Arlo = require('node-arlo');

const endSessionIntival = 15 * 60 * 1000; // 15 minutes

async function _loginArlo() {
  if (this.activeSession) return;
  const email = await this._getVaultSecret.call(this, 'ArloUsername');
  const password = await this._getVaultSecret.call(this, 'ArloPassword');
  this.logger.trace(`${this._traceStack()} - Logging into Arlo`);
  await this.arlo.login(email, password);
  this.activeSession = true;
  // eslint-disable-next-line no-return-assign
  setTimeout(() => (this.activeSession = false), endSessionIntival);
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

async function _setupArlo() {
  this.activeSession = false;
  this.arlo = new Arlo();

  // Set up devices
  this.arlo.on(Arlo.FOUND, (device) => {
    if (device.getType() === Arlo.BASESTATION) {
      this.logger.trace(
        `${this._traceStack()} - Found/updating base station: ${device.getName()} - ${
          device.id
        }`,
      );
      this.baseStation = device;
      device.subscribe();
    }

    if (device.getType() === Arlo.CAMERA) {
      const deviceName = device.getName();

      this.logger.trace(
        `${this._traceStack()} - Found/updating camera: ${deviceName} - ${
          device.id
        }`,
      );

      if (deviceName === 'Living Room') {
        if (this.livingRoomCam)
          this.livingRoomCam.removeAllListeners([Arlo.UPDATE]);
        this.livingRoomCam = device;
        this.livingRoomCam.on(Arlo.UPDATE, (info) => {
          processUpdate.call(this, deviceName, info);
        });
        this.livingRoomCam.get();
      }

      if (deviceName === 'Garden') {
        if (this.gardenCam) this.gardenCam.removeAllListeners([Arlo.UPDATE]);
        this.gardenCam = device;
        this.gardenCam.on(Arlo.UPDATE, (info) => {
          processUpdate.call(this, deviceName, info);
        });
        this.gardenCam.get();
      }
    }
  });

  // Setup schedules
  await this.setupSchedules();

  // Login & get devices
  this._loginArlo.call(this);

  setTimeout(() => this.listen.call(this), 5000);
}

module.exports = {
  _setupArlo,
  _loginArlo,
};
