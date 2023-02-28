#!/bin/bash

CONFIG_FILE=config.toml

echo "[entrypoint] Creating $CONFIG_FILE"
if [ -e $CONFIG_FILE ]
then
  echo "[entrypoint] $CONFIG_FILE already exists, deleting and starting fresh"
  rm $CONFIG_FILE
fi

echo "[pg]" >> $CONFIG_FILE
echo "user = \"$PG_USER\"" >> $CONFIG_FILE
echo "password = \"$PG_PASSWORD\"" >> $CONFIG_FILE
echo "host = \"$PG_HOST\"" >> $CONFIG_FILE
echo "port = $PG_PORT" >> $CONFIG_FILE
echo "dbname = \"$PG_DB\"" >> $CONFIG_FILE
echo "pool.max_size = 16" >> $CONFIG_FILE

SECRET_FILE=secret

echo "[entrypoint] Creating $SECRET_FILE"
if [ -e $SECRET_FILE ]
then
  echo "[entrypoint] $SECRET_FILE already exists, deleting and starting fresh"
  rm $SECRET_FILE
fi
echo "$BACKEND_SECRET" >> $SECRET_FILE

echo "[entrypoint] Running run"
exec "$@"
