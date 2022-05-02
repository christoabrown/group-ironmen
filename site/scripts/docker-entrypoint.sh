#!/bin/bash

API_FILE_PATH=./src/data/api.js

echo "[entrypoint] Replacing the API URL with the given HOST_URL"
sed -i -e "s#https://groupiron.men#$HOST_URL#g" $API_FILE_PATH

echo "[entrypoint] Running bundle"
npm run bundle

echo "[entrypoint] Running serve"
exec "$@"
