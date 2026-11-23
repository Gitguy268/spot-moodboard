#!/bin/sh
# Double-click to open the moodboard from a local web server. Opening index.html directly
# works too; this is only handy if your browser blocks file:// pages.
cd "$(dirname "$0")" || exit 1
PORT=5213
( sleep 1; open "http://localhost:$PORT/" 2>/dev/null || xdg-open "http://localhost:$PORT/" ) &
exec python3 -m http.server "$PORT" --bind 127.0.0.1
