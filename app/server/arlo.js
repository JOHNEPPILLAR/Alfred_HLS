/**
 * Import external libraries
 */
const serviceHelper = require('alfred-helper');
const rp = require('request-promise');

const Arlo = class {
  constructor() {
    this.headers = {
      'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 11_1_2 like Mac OS X) AppleWebKit/604.3.5 (KHTML, like Gecko) Mobile/15B202 NETGEAR/v1 (iOS Vuezone)',
    };
  }

  async login() {
    serviceHelper.log('trace', 'Getting Arlo login creds');
    const arloUsername = await serviceHelper.vaultSecret(process.env.ENVIRONMENT, 'ArloUsername');
    const arloPassword = await serviceHelper.vaultSecret(process.env.ENVIRONMENT, 'ArloPassword');
    const options = {
      method: 'POST',
      uri: 'https://arlo.netgear.com/hmsweb/login',
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
      return true;
    } catch (err) {
      serviceHelper.log('error', `Can not connect to arlo service: ${err.message}`);
      return err;
    }
  }

  async getDevices() {
    const options = {
      method: 'GET',
      uri: 'https://arlo.netgear.com/hmsweb/users/devices',
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

  async getCamURL() {
    const options = {
      method: 'POST',
      uri: 'https://arlo.netgear.com/hmsweb/users/devices/startStream',
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

  async getCamInfo(cam) {
    const returnFromCall = await this.login();
    if (returnFromCall instanceof Error) return returnFromCall.messagew;
    const devices = await this.getDevices();

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

    this.deviceName = camInfo[0].deviceName;
    this.parentId = camInfo[0].parentId;
    this.xCloudId = camInfo[0].xCloudId;
    this.headers.xcloudId = this.xCloudId;
    this.transId = `node-arlo-${camInfo[0].deviceId}!stream-${Date.now()}`;

    const camDetails = await this.getCamURL();
    if (camDetails instanceof Error) return camDetails;
    if (camDetails.success !== true) return new Error(`Not able to get device url for: ${cam}`);

    const newCamURL = camDetails.data.url.replace('rtsp://', 'rtsps://');
    const returnData = { camURL: newCamURL, name: this.deviceName };
    return returnData;
  }
};

module.exports = Arlo;
