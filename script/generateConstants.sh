#!/bin/bash

set -o pipefail
set -exu

cd "$(dirname "$0")"
SCRIPTDIR="$(pwd)"
cd ..
ROOTDIR="$(pwd)"
NODE_PATH="$ROOTDIR/node_modules"

node "$SCRIPTDIR/generateConstants.js" | tee "$ROOTDIR/Constants.ts"
