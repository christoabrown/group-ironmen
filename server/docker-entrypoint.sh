#!/bin/bash
# Database, Discord, hub and cookie settings are read from environment variables
# by the server itself (see config.toml.example). Only the hashing secret is
# written to a file, which keeps token hashes stable across upgrades.

SECRET_FILE=secret

echo "[entrypoint] Creating $SECRET_FILE"
if [ -z "$BACKEND_SECRET" ]; then
  echo "[entrypoint] BACKEND_SECRET is not set" >&2
  exit 1
fi
rm -f $SECRET_FILE
echo "$BACKEND_SECRET" >> $SECRET_FILE

echo "[entrypoint] Starting server"
exec "$@"
