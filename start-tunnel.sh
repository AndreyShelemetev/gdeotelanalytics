#!/bin/bash

# Load environment variables from .env file
if [ -f .env ]; then
    source .env
fi

# SSH Tunnel script for MySQL connection
# Usage: ./start-tunnel.sh

SSH_HOST=${SSH_HOST:-217.168.244.143}
SSH_USER=${SSH_USER:-root}
SSH_PORT=${SSH_PORT:-22}
LOCAL_PORT=${LOCAL_PORT:-13306}
REMOTE_HOST=${REMOTE_HOST:-127.0.0.1}
REMOTE_PORT=${REMOTE_PORT:-3306}

echo "Starting SSH tunnel to $SSH_USER@$SSH_HOST:$SSH_PORT"
echo "Forwarding local port $LOCAL_PORT to $REMOTE_HOST:$REMOTE_PORT"

# Use ssh with ControlMaster for persistent connection
ssh -f -N -L 0.0.0.0:$LOCAL_PORT:$REMOTE_HOST:$REMOTE_PORT \
    -o ControlMaster=auto \
    -o ControlPath=~/.ssh/master-%r@%h:%p \
    -o ControlPersist=10m \
    $SSH_USER@$SSH_HOST -p $SSH_PORT

if [ $? -eq 0 ]; then
    echo "SSH tunnel established successfully"
    echo "MySQL is now accessible on localhost:$LOCAL_PORT"
else
    echo "Failed to establish SSH tunnel"
    exit 1
fi