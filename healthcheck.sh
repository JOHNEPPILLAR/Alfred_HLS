#!/usr/bin/env sh

set -x
set -e

echo "Set env vars"
export ENVIRONMENT="production"

node lib/server/healthcheck.js

exit $?