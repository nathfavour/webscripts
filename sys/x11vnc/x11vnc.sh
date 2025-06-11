#!/bin/bash

# Set display and resolution
XVFB_DISPLAY=":1"
XVFB_RES="1920x1080x24"

# Start Xvfb if not already running
if ! pgrep -f "Xvfb $XVFB_DISPLAY" > /dev/null; then
    Xvfb $XVFB_DISPLAY -screen 0 $XVFB_RES &
    sleep 2  # Give Xvfb time to start
fi

# Start x11vnc on the virtual display without a password
x11vnc -display $XVFB_DISPLAY -forever &