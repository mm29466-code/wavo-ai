#!/bin/bash
echo "Starting Backend OPAL Proxy..."
lsof -i :8000 | grep LISTEN | awk '{print $2}' | xargs kill -9 2>/dev/null
python3 server.py
