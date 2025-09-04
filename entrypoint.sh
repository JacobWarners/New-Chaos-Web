#!/bin/sh

# Exit immediately if a command exits with a non-zero status.
set -e

# --- Pre-Flight Checks ---
echo "--- [Entrypoint] Checking environment variables ---"
printenv | grep DB_ || echo "Warning: No DB_ variables found."

echo "--- [Entrypoint] Waiting for database to be ready ---"
# Use a loop to wait until the TCP connection is successful
# This is more robust than a simple one-off check.
timeout=60
while ! nc -zv $DB_HOST $DB_PORT; do
  timeout=$(($timeout - 1))
  if [ $timeout -eq 0 ]; then
    echo "Error: Timed out waiting for database connection."
    exit 1
  fi
  echo "Database not ready yet. Retrying in 1 second..."
  sleep 1
done

echo "--- [Entrypoint] Database connection is ready. Starting application. ---"

# The 'exec' command replaces the script process with your application process.
# This is important for proper signal handling (like Ctrl+C).
exec ./server_app
