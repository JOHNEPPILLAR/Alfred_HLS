/**
 * Import external libraries
 */
const serviceHelper = require('alfred-helper');
const rp = require('request-promise');
const https = require('request');

const Arlo = class {
  constructor() {
    this.eventStream = null;
    this.headers = {
      'Content-Type': 'application/json',
      Authorization: '',
      'User-Agent': '',
    };
  }

  async login() {
    if (this.connected) {
      serviceHelper.log('trace', 'Still connected to base station, will not call login');
      return true;
    }
    serviceHelper.log('trace', 'Logging into Arlo');
    const arloUsername = await serviceHelper.vaultSecret(process.env.ENVIRONMENT, 'ArloUsername');
    const arloPassword = await serviceHelper.vaultSecret(process.env.ENVIRONMENT, 'ArloPassword');
    const options = {
      method: 'POST',
      uri: 'https://my.arlo.com/hmsweb/login/v2',
      json: true,
      jar: true,
      headers: this.headers,
      body: { email: arloUsername, password: arloPassword },
    };
    try {
      const apiData = await rp(options);
      if (!apiData || apiData.success !== true) throw new Error('Not able to login to arlo');
      this.userId = apiData.data.userId;
      this.token = apiData.data.token;
      this.headers.Authorization = this.token;
      this.connected = true;
      return true;
    } catch (err) {
      serviceHelper.log('error', `Can not connect to arlo service: ${err.message}`);
      return err;
    }
  }

  async getDevices() {
    serviceHelper.log('trace', 'Getting devices from Arlo');
    const options = {
      method: 'GET',
      uri: 'https://my.arlo.com/hmsweb/users/devices',
      json: true,
      jar: true,
      headers: this.headers,
    };
    try {
      const apiData = await rp(options);
      if (!apiData || apiData.success !== true) throw new Error('Not able to get arlo devices');
      return apiData;
    } catch (err) {
      serviceHelper.log('error', `Not able to get devices: ${err.message}`);
      return err;
    }
  }

  async getCamStreamURL() {
    this.headers['User-Agent'] = 'Mozilla/5.0 (iPhone; CPU iPhone OS 11_1_2 like Mac OS X) AppleWebKit/604.3.5 (KHTML, like Gecko) Mobile/15B202 NETGEAR/v1 (iOS Vuezone)';
    const options = {
      method: 'POST',
      uri: 'https://my.arlo.com/hmsweb/users/devices/startStream',
      json: true,
      jar: true,
      headers: this.headers,
      body: {
        from: `${this.userId}_web`,
        to: this.parentId,
        action: 'set',
        resource: `cameras/${this.deviceId}`,
        publishResponse: true,
        transId: this.transId,
        properties: { activityState: 'startUserStream', cameraId: this.deviceId },
      },
    };
    try {
      const apiData = await rp(options);
      if (!apiData || apiData.success !== true) throw new Error('Not able to get arlo cam info');
      return apiData;
    } catch (err) {
      serviceHelper.log('error', `Not able to get devices: ${err.message}`);
      return err;
    }
  }

  async getCamStream(cam) {
    const returnFromLogin = await this.login();
    if (returnFromLogin instanceof Error) return returnFromLogin.message;
    const devices = await this.getDevices();
    if (devices instanceof Error) return devices.message;

    switch (cam) {
      case 'Garden':
      case 'Living':
        this.deviceId = await serviceHelper.vaultSecret(process.env.ENVIRONMENT, `ArloCam${cam}`);
        break;
      default:
        serviceHelper.log('error', `Not able to match device: ${cam} to Arlo cam`);
        return new Error(`Not able to match device: ${cam} to Arlo cam`);
    }
    const camInfo = devices.data.filter((device) => device.deviceId === this.deviceId);
    if (camInfo instanceof Error) return camInfo;
    if (!camInfo[0] || camInfo.length === 0) return new Error(`Not able to get device info for: ${cam}`);

    const { deviceName } = camInfo[0];
    this.parentId = camInfo[0].parentId;
    this.xCloudId = camInfo[0].xCloudId;
    this.headers.xcloudId = this.xCloudId;
    this.transId = `node-arlo-${camInfo[0].deviceId}!stream-${Date.now()}`;

    const camDetails = await this.getCamStreamURL();
    if (camDetails instanceof Error) return camDetails;
    if (camDetails.success !== true) return new Error(`Not able to get device url for: ${cam}`);

    const newCamURL = camDetails.data.url.replace('rtsp://', 'rtsps://');
    const returnData = { camURL: newCamURL, name: deviceName };
    return returnData;
  }

  async registerCamForEvents(cam) {
    try {
      delete this.headers.Accept;
      this.headers.xcloudId = cam.xCloudId;
      const options = {
        method: 'POST',
        uri: `https://my.arlo.com/hmsweb/users/devices/notify/${cam.parentId}`,
        json: true,
        jar: true,
        headers: this.headers,
        body: {
          to: cam.parentId,
          resource: `subscriptions/${this.userId}_web`,
          publishResponse: false,
          action: 'set',
          from: `${this.userId}_web`,
          transId: `web!${cam.xCloudId}`,
          properties: { devices: [cam.parentId] },
        },
      };
      https(
        {
          url: options.uri,
          method: options.method,
          body: options.body,
          json: options.json,
          jar: options.jar,
          headers: options.headers,
        },
        (error, response, body) => {
          if (error) serviceHelper.log('error', error.message);
          if (!body || body.success !== true) throw new Error(`Not able register device ${cam.deviceName} for events`);
        },
      );
      options.uri = `https://my.arlo.com/hmsweb/users/devices/notify/${cam.parentId}`;
      options.body = {
        to: cam.parentId,
        resource: 'cameras',
        publishResponse: false,
        action: 'get',
        from: `${this.userId}_web`,
        transId: `web!${cam.xCloudId}`,
        properties: {},
      };
      https(
        {
          url: options.uri,
          method: options.method,
          body: options.body,
          json: options.json,
          jar: options.jar,
          headers: options.headers,
        },
        (error, response, body) => {
          if (error) serviceHelper.log('error', error.message);
          if (!body || body.success !== true) throw new Error(`Not able register device ${cam.deviceName} for events`);
          if (body.success === true) serviceHelper.log('trace', `Requested events for device: ${cam.deviceName}`);
        },
      );
      return true;
    } catch (err) {
      serviceHelper.log('error', err.message);
      return err;
    }
  }

  subscribeToEvents(camsToProcessEvents) {
    let jsonStr;
    this.headers.Accept = 'text/event-stream';
    const options = {
      method: 'POST',
      uri: `https://my.arlo.com/hmsweb/client/subscribe?token=${this.token}`,
      json: true,
      jar: true,
      headers: this.headers,
    };
    let camCounter = 0;
    https
      .get(options)
      .on('data', (data) => {
        let str;
        let msg;
        try {
          str = data.toString();
          jsonStr = `{${str.toString().replace(/^event: message\s*data/, '"event": "message", "data"')}}`;

          if (jsonStr.includes('batteryLevel')) {
            // serialNumber
            let startPoint = jsonStr.indexOf('serialNumber') + 15;
            const deviceId = jsonStr.slice(startPoint, startPoint + 13);

            // signalStrength
            startPoint = jsonStr.indexOf('signalStrength') + 16;
            const signalStrength = jsonStr.slice(startPoint, startPoint + 1);

            // batteryLevel
            startPoint = jsonStr.indexOf('batteryLevel') + 14;
            const batteryLevel = jsonStr.slice(startPoint, startPoint + 2);
            msg = { event: 'message', data: { deviceId, signalStrength, batteryLevel } };
          } else {
            msg = JSON.parse(jsonStr);
          }

          const dataStream = msg.data;
          if (dataStream.status === 'connected') {
            serviceHelper.log('trace', 'Connected to base station event streams');
            this.registerCamForEvents(camsToProcessEvents[0]);
          }

          if (dataStream.batteryLevel) {
            serviceHelper.log('trace', 'Processing camera properities');
            camCounter += 1;
            if (camCounter === 2) this.unSubscribeFromEvents();
            let camInfo;
            try {
              // eslint-disable-next-line max-len
              camInfo = camsToProcessEvents.filter((device) => device.deviceId === dataStream.deviceId);
            } catch (err) {
              serviceHelper.log('error', 'Not able to get and save cam details');
              return;
            }
            const { deviceName } = camInfo[0];
            const SQL = 'INSERT INTO camera("time", deviceID, deviceName, signalStrength, batteryLevel) VALUES ($1, $2, $3, $4, $5)';
            const SQLValues = [
              new Date(),
              dataStream.deviceId,
              deviceName,
              dataStream.signalStrength,
              dataStream.batteryLevel,
            ];
            (async () => {
              try {
                serviceHelper.log('trace', 'Connect to data store connection pool');
                const dbConnection = await serviceHelper.connectToDB('arlo');
                const dbClient = await dbConnection.connect(); // Connect to data store
                serviceHelper.log('trace', `Save camera values for device: ${SQLValues[2]}`);
                const results = await dbClient.query(SQL, SQLValues);
                serviceHelper.log(
                  'trace',
                  'Release the data store connection back to the pool',
                );
                await dbClient.release(); // Return data store connection back to pool
                await dbClient.end(); // Close data store connection

                if (results.rowCount !== 1) {
                  serviceHelper.log('error', `Failed to insert data for camera: ${SQLValues[2]}`);
                } else {
                  serviceHelper.log('info', `Saved data for camera: ${SQLValues[2]}`);
                }
              } catch (err) {
                serviceHelper.log('error', err.message);
              }
            })();
          }

          if (dataStream.action === 'logout') {
            serviceHelper.log('info', 'Logged out by some other entity.');
            this.connected = false;
          }
        } catch (err) {
          serviceHelper.log('error', err.message);
        }
      })
      .on('error', (err) => serviceHelper.log('error', `Error in devices event stream: ${err.message}`));
  }

  async unSubscribeFromEvents() {
    serviceHelper.log('trace', 'UnSubscribing from base station events');
    delete this.headers.Accept;
    const options = {
      url: 'https://my.arlo.com/hmsweb/client/unsubscribe',
      json: true,
      jar: true,
      headers: this.headers,
    };
    try {
      const apiData = await rp(options);
      if (!apiData || apiData.success !== true) throw new Error('Error in unSubscribing from base station events');
      return apiData;
    } catch (err) {
      serviceHelper.log('error', err.message);
      return err;
    }
  }

  getCamIDs() {
    const camNames = ['Garden', 'Living'];
    this.returnVal = Promise.all(
      camNames.map(async (camName) => {
        const camID = await serviceHelper.vaultSecret(process.env.ENVIRONMENT, `ArloCam${camName}`);
        return camID;
      }),
    );
    return this.returnVal;
  }

  async getBatteryStatus() {
    const returnFromLogin = await this.login();
    if (returnFromLogin instanceof Error) return returnFromLogin;
    const devices = await this.getDevices();
    if (devices instanceof Error) return devices;

    const cams = await this.getCamIDs();
    if (cams.length === 0) {
      serviceHelper.log('error', 'No cams to bind battery events to');
      return new Error('No cams to bind battery events to');
    }
    // eslint-disable-next-line max-len
    const camsToProcessEvents = devices.data.filter((device) => cams.indexOf(device.deviceId) !== -1);
    this.subscribeToEvents(camsToProcessEvents);

    return true;
  }
};

module.exports = Arlo;
