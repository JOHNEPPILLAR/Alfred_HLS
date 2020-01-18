#!/bin/bash
clear

echo "The following node processes were found and will be killed:"
export PORT=3978
lsof -i :$PORT
kill -9 $(lsof -sTCP:LISTEN -i:$PORT -t)

echo "Removing node modules folder and installing latest"
rm -rf node_modules
ncu -u
npm install
npm audit fix
snyk test

echo "Set env vars"
export ENVIRONMENT="development"
export MOCK="false"
export MOCK_CAM_URL='http://commondatastorage.googleapis.com/gtv-videos-bucket/sample/BigBuckBunny.mp4'

echo "Run the server"
npm run local
