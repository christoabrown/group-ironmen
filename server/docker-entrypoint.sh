#!/bin/bash
# Database, Discord, hub and cookie settings are read from environment variables
# by the server itself (see config.toml.example).

echo "[entrypoint] Starting server"
exec "$@"
