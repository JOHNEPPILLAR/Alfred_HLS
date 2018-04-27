const fs = require('fs');

const fsProvider = {};

fsProvider.exists = function FnExists(req, cb) {
  fs.exists(req.filePath, (exists) => {
    cb(null, exists);
  });
};

fsProvider.getSegmentStream = function FnGetSegmentStream(req, cb) {
  cb(null, fs.createReadStream(req.filePath));
};

fsProvider.getManifestStream = function FnGetManifestStream(req, cb) {
  cb(null, fs.createReadStream(req.filePath, { bufferSize: 64 * 1024 }));
};

module.exports = fsProvider;

