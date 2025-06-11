#!/bin/bash

# Get the primary IP address (first non-loopback)
IP=$(hostname -I | awk '{print $1}')

PORT=246

while true; do
    # Wait for a connection and serve the IP address as a simple HTML page
    { 
        echo -e "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\n\r\n<h1>Device IP: $IP</h1>";
    } | nc -l -p $PORT -q 1
done