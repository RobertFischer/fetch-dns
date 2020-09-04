#!/bin/bash

set -o pipefail
set -exu

cd "$(dirname "$0")/.."
ROOTDIR="$(pwd)"

cd "${TMPDIR:=/tmp}"
wget 'https://www.iana.org/assignments/dns-parameters/dns-parameters-4.csv' -O dns-rrtypes.csv
npx csvtojson dns-rrtypes.csv | tee "$ROOTDIR/Rrtypes.json"

