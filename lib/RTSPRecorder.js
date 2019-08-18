/**
 * Import external libraries
 */
const moment = require('moment');
const childProcess = require('child_process');
const path = require('path');
const fs = require('fs');
const UUID = require('pure-uuid');
const rimraf = require('rimraf');

/**
 * Import helper libraries
 */
const serviceHelper = require('./helper.js');

const RTSPRecorder = class {
  constructor(config = {}) {
    this.uuid = new UUID(4);
    this.config = config;
    this.name = config.name;
    this.url = config.url;
    this.timeLimit = config.timeLimit || 60;
    this.folder = 'recordings/';
    this.categoryType = config.type || 'record';
    this.disableStreaming = config.disableStreaming;
    this.directoryPathFormat = config.directoryPathFormat || 'D-MMM-YYYY';
    this.fileNameFormat = config.fileNameFormat || 'D-MMM-YYYY HH-mm-ss';
    this.createDirIfNotExists(this.getDirectoryPath());
  }

  getDirectoryPath() {
    if (this.categoryType === 'stream') {
      return this.folder;
    }
    return path.join(this.folder, (this.name ? this.name : ''));
  }

  getTodayPath() {
    return path.join(this.getDirectoryPath(), moment().format(this.directoryPathFormat));
  }

  getMediaTypePath() {
    if (this.categoryType === 'stream') {
      return path.join(this.getDirectoryPath(), `${this.uuid}`);
    }
    return this.getTodayPath();
  }

  getFilename(folderPath) {
    if (this.categoryType === 'stream') {
      return path.join(folderPath, 'cam.m3u8');
    }
    return path.join(folderPath, `${moment().format(this.fileNameFormat)}.mp4`);
  }

  // eslint-disable-next-line class-methods-use-this
  createDirIfNotExists(folderPath) {
    try {
      if (!fs.lstatSync(folderPath).isDirectory()) {
        fs.mkdirSync(folderPath);
      }
    } catch (e) {
      fs.mkdirSync(folderPath);
    }
  }

  getArguments() {
    if (this.categoryType === 'stream') {
      return ['-f', 'hls', '-hls_time', 3, '-hls_wrap', 10];
    }
    return ['-f', 'mp4']; // Default is record
  }

  getChildProcess(fileName) {
    const args = ['-i', this.url];
    const mediaArgs = this.getArguments();
    mediaArgs.forEach((item) => args.push(item));
    args.push(fileName);

    const child = childProcess.spawn('ffmpeg',
      args,
      { detached: false, stdio: 'ignore' });

    return child;
  }

  stopRecording() {
    this.disableStreaming = true;
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    if (this.writeStream) {
      this.killStream();
    }
  }

  startRecording() {
    if (process.env.Mock === 'true') {
      serviceHelper.log('trace', 'Mock mode enabled, using test file as stream');
      this.url = process.env.mockCamURL;
    }
    if (!this.url) {
      serviceHelper.log('error', `Webcam URL Not Found: ${this.url}`);
      return true;
    }

    if (this.categoryType === 'record') {
      serviceHelper.log('info', 'Starting to record to disk webcam stream');
      this.createDirIfNotExists(this.getTodayPath());
    } else {
      serviceHelper.log('info', 'Restreaming webcam stream');
    }

    this.recordStream();
    return this.uuid.format();
  }

  removeTempFolder() {
    try {
      const folderPath = this.getMediaTypePath();
      serviceHelper.log('trace', `Removing temp streaming folder: ${folderPath}`);
      rimraf.sync(folderPath);
    } catch (err) {
      serviceHelper.log('error', err.message);
    }
  }

  killStream() {
    this.writeStream.kill();
    if (this.categoryType === 'stream') this.removeTempFolder();
  }

  recordStream() {
    const self = this;
    if (this.timer) clearTimeout(this.timer);
    if (this.writeStream && this.writeStream.binded) return false;

    if (this.writeStream && this.writeStream.connected) {
      this.writeStream.binded = true;
      this.writeStream.once('exit', () => {
        self.recordStream();
      });
      this.killStream();
      return false;
    }
    this.writeStream = null;

    const folderPath = this.getMediaTypePath();
    this.createDirIfNotExists(folderPath);
    const fileName = this.getFilename(folderPath);
    this.writeStream = this.getChildProcess(fileName);

    this.writeStream.once('exit', () => {
      if (self.disableStreaming) {
        serviceHelper.log('trace', `Finished recording: ${fileName}`);
        return true;
      }
      self.recordStream();
      return true;
    });
    this.timer = setTimeout(self.killStream.bind(this), this.timeLimit * 1000);

    this.fileName = fileName;
    serviceHelper.log('trace', `Saving to file: ${fileName}`);
    return true;
  }
};

module.exports = RTSPRecorder;
