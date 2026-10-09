#!/bin/sh
cd /root/wt-ss-b
export VITE_DESIGN_LAB=1
exec npx vite --port 5391 > /tmp/claude-0/vite-b.log 2>&1
