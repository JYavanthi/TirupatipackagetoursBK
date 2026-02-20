#!/usr/bin/env bash

set -e

PACKAGE_URL="https://phonepe.mycloudrepo.io/public/repositories/phonepe-pg-sdk-node/releases/v2/phonepe-pg-sdk-node.tgz"
VENDOR_DIR="vendor"
PKG_NAME="phonepe-pg-sdk-node.tgz"
LOCAL_PATH="$VENDOR_DIR/$PKG_NAME"

echo "➡️  Creating vendor directory if not exists..."
mkdir -p $VENDOR_DIR

echo "➡️  Downloading PhonePe SDK..."
curl -L "$PACKAGE_URL" -o "$LOCAL_PATH"

echo "➡️  Updating package.json to use local vendor package..."

# Replace existing phonepe-pg-sdk-node entry or add it if missing
if grep -q "\"phonepe-pg-sdk-node\"" package.json; then
    # Replace existing line
    sed -i.bak 's|"phonepe-pg-sdk-node":.*|"phonepe-pg-sdk-node": "file:vendor/phonepe-pg-sdk-node.tgz",|' package.json
else
    # Insert under "dependencies"
    sed -i.bak 's|"dependencies": {|"dependencies": {\n    "phonepe-pg-sdk-node": "file:vendor/phonepe-pg-sdk-node.tgz",|' package.json
fi

echo "➡️  Running npm install..."
npm install

echo "✅ Done! The PhonePe SDK is now fully bundled inside your repo."

