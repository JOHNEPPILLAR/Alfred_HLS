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
      serviceHelper.log(
        'trace',
        'Still connected to base station, will not call login',
      );
      return true;
    }
    serviceHelper.log(
      'trace',
      'Logging into Arlo',
    );
    const arloUsername = await serviceHelper.vaultSecret(
      process.env.ENVIRONMENT,
      'ArloUsername',
    );
    const arloPassword = await serviceHelper.vaultSecret(
      process.env.ENVIRONMENT,
      'ArloPassword',
    );
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
      serviceHelper.log(
        'error',
        `Can not connect to arlo service: ${err.message}`,
      );
      return err;
    }
  }

  async getDevices() {
    serviceHelper.log(
      'trace',
      'Getting devices from Arlo',
    );
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
      serviceHelper.log(
        'error',
        `Not able to get devices: ${err.message}`,
      );
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
      serviceHelper.log(
        'error',
        `Not able to get devices: ${err.message}`,
      );
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
        this.deviceId = await serviceHelper.vaultSecret(
          process.env.ENVIRONMENT,
          `ArloCam${cam}`,
        );
        break;
      default:
        serviceHelper.log(
          'error',
          `Not able to match device: ${cam} to Arlo cam`,
        );
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

  async registerCamForEvents(baseStation) {
    try {
      delete this.headers.Accept;
      this.headers.xcloudId = baseStation.xCloudId;
      const options = {
        method: 'POST',
        uri: `https://my.arlo.com/hmsweb/users/devices/notify/${baseStation.deviceId}`,
        json: true,
        jar: true,
        headers: this.headers,
        body: {
          to: baseStation.deviceId,
          resource: `subscriptions/${this.userId}_web`,
          publishResponse: false,
          action: 'set',
          from: `${this.userId}_web`,
          transId: `web!${baseStation.xCloudId}`,
          properties: { devices: [baseStation.deviceId] },
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
          if (!body || body.success !== true) throw new Error(`Not able register device ${baseStation.deviceName} for events`);
        },
      );
      options.uri = `https://my.arlo.com/hmsweb/users/devices/notify/${baseStation.deviceId}`;
      options.body = {
        to: baseStation.deviceId,
        resource: 'cameras',
        publishResponse: false,
        action: 'get',
        from: `${this.userId}_web`,
        transId: `web!${baseStation.xCloudId}`,
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
          if (!body || body.success !== true) throw new Error(`Not able register device ${baseStation.deviceName} for events`);
          if (body.success === true) serviceHelper.log('trace', `Requested events for device: ${baseStation.deviceName}`);
        },
      );
      return true;
    } catch (err) {
      serviceHelper.log(
        'error',
        err.message,
      );
      return err;
    }
  }

  saveCamProperties(prop) {
    let deviceName = '';
    switch (prop.serialNumber) {
      case '5GG28C7XA992D':
        deviceName = 'Garden';
        break;
      case '5GG28C78AA4F8':
        deviceName = 'Living Room';
        break;
      default:
    }
    const SQL = 'INSERT INTO camera("time", deviceID, deviceName, signalStrength, batteryLevel) VALUES ($1, $2, $3, $4, $5)';
    const SQLValues = [
      new Date(),
      prop.serialNumber,
      deviceName,
      prop.signalStrength,
      prop.batteryLevel,
    ];
    (async () => {
      try {
        serviceHelper.log(
          'trace',
          'Connect to data store connection pool',
        );
        const dbConnection = await serviceHelper.connectToDB('arlo');
        serviceHelper.log(
          'trace',
          `Save camera values for device: ${SQLValues[2]}`,
        );
        const results = await dbConnection.query(
          SQL,
          SQLValues,
        );
        serviceHelper.log(
          'trace',
          'Release the data store connection back to the pool',
        );
        await dbConnection.end(); // Close data store connection
        if (results.rowCount !== 1) {
          serviceHelper.log(
            'error',
            `Failed to insert data for camera: ${SQLValues[2]}`,
          );
        } else {
          serviceHelper.log(
            'info',
            `Saved data for camera: ${SQLValues[2]}`,
          );
        }
      } catch (err) {
        serviceHelper.log(
          'error',
          err.message,
        );
      }
    })();
    this.returnValue = true;
  }

  subscribeToEvents(baseStation) {
    const bom = [239, 187, 191];
    const colon = 58;
    const space = 32;
    const lineFeed = 10;
    const carriageReturn = 13;
    function hasBom(buffer) {
      return bom.every((charCode, index) => buffer[index] === charCode);
    }

    const options = {
      method: 'POST',
      uri: `https://my.arlo.com/hmsweb/client/subscribe?token=${this.token}`,
      json: true,
      jar: true,
      headers: this.headers,
    };
    let discardTrailingNewline = false;
    let isFirst = true;
    let buf;
    https
      .get(options)
      .on('data', (chunk) => {
        try {
          buf = buf ? Buffer.concat([buf, chunk]) : chunk;
          if (isFirst && hasBom(buf)) buf = buf.slice(bom.length);
          isFirst = false;
          const { length } = buf;
          let pos = 0;

          while (pos < length) {
            if (discardTrailingNewline) {
              if (buf[pos] === lineFeed) pos += 1;
              discardTrailingNewline = false;
            }

            let lineLength = -1;
            let fieldLength = -1;
            let c;

            for (let i = pos; lineLength < 0 && i < length; i += 1) {
              c = buf[i];
              if (c === colon) {
                if (fieldLength < 0) fieldLength = i - pos;
              } else if (c === carriageReturn) {
                discardTrailingNewline = true;
                lineLength = i - pos;
              } else if (c === lineFeed) lineLength = i - pos;
            }

            if (lineLength < 0) break;
            if (lineLength !== 0 && fieldLength > 0) {
              const noValue = fieldLength < 0;
              const field = buf.slice(pos, pos + (noValue ? lineLength : fieldLength)).toString();
              let step = 0;
              if (noValue) {
                step = lineLength;
              } else if (buf[pos + fieldLength + 1] !== space) {
                step = fieldLength + 1;
              } else {
                step = fieldLength + 2;
              }
              pos += step;

              const valueLength = lineLength - step;
              const value = buf.slice(pos, pos + valueLength).toString();
              let eventData;
              let tmpValue;

              switch (field) {
                case '"status"':
                  eventData = `${value.slice(1, -2)}`;
                  if (eventData === 'connected') {
                    serviceHelper.log(
                      'trace',
                      'Connected to event stream',
                    );
                    this.registerCamForEvents(baseStation);
                  }
                  break;
                case '"resource"':
                  try {
                    if (value.slice(0, 9) === '"cameras"') {
                      serviceHelper.log(
                        'trace',
                        'Got cam resources',
                      );
                      tmpValue = `{${value.slice(10)}`;
                      eventData = JSON.parse(tmpValue);
                      eventData.properties.map((prop) => {
                        this.saveCamProperties(prop);
                        return true;
                      });
                      this.unSubscribeFromEvents();
                    }
                  } catch (err) {
                    serviceHelper.log(
                      'error',
                      err.message,
                    );
                    serviceHelper.log(
                      'error',
                      tmpValue,
                    );
                  }
                  break;
                default:
              }
            }
            pos += lineLength + 1;
          }

          if (pos === length) {
            buf = undefined;
          } else if (pos > 0) {
            buf = buf.slice(pos);
          }
        } catch (err) {
          serviceHelper.log(
            'error',
            err.message,
          );
        }
      })
      .on('error', (err) => serviceHelper.log('error', `Error in devices event stream: ${err.message}`));
  }

  async unSubscribeFromEvents() {
    serviceHelper.log(
      'trace',
      'UnSubscribing from base station events',
    );
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
      serviceHelper.log(
        'error',
        err.message,
      );
      return err;
    }
  }

  async getBatteryStatus() {
    const returnFromLogin = await this.login();
    if (returnFromLogin instanceof Error) return returnFromLogin;
    const devices = await this.getDevices();
    if (devices instanceof Error) return devices;
    const baseStation = devices.data.filter((device) => device.deviceType === 'basestation');
    if (baseStation.length === 0) {
      const err = new Error('No cams to bind battery events to');
      serviceHelper.log(
        'error',
        err.message,
      );
      return err;
    }
    this.subscribeToEvents(baseStation[0]);
    return true;
  }

  async turnOffCam(action) {
    // action: True - Camera is off.
    // action: False - Camera is on.

    const returnFromLogin = await this.login();
    if (returnFromLogin instanceof Error) return returnFromLogin;
    const devices = await this.getDevices();
    if (devices instanceof Error) return devices;
    const baseStation = devices.data.filter((device) => device.deviceType === 'basestation');
    const livingRoomCam = devices.data.filter((device) => device.deviceName === 'Living Room');
    if (baseStation.length === 0) {
      const err = new Error('No cams to bind battery events to');
      serviceHelper.log(
        'error',
        err.message,
      );
      return err;
    }
    this.headers.xcloudId = baseStation[0].xCloudId;
    const options = {
      method: 'POST',
      uri: `https://my.arlo.com/hmsweb/users/devices/notify/${baseStation[0].deviceId}`,
      json: true,
      jar: true,
      headers: this.headers,
      body: {
        from: `${this.userId}_web`,
        to: baseStation[0].deviceId,
        action: 'set',
        resource: `cameras/${livingRoomCam[0].deviceId}`,
        publishResponse: true,
        transId: this.transId,
        properties: { privacyActive: action },
      },
    };
    try {
      const apiData = await rp(options);
      if (!apiData || apiData.success !== true) throw new Error('Error in turning can on/off');
      if (action) serviceHelper.log('info', 'Turned off cam');
      if (!action) serviceHelper.log('info', 'Turned on cam');
      return apiData;
    } catch (err) {
      serviceHelper.log(
        'error',
        err.message,
      );
      return err;
    }
  }
};

module.exports = Arlo;
