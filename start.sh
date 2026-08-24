#!/bin/bash
cd /home/patrik/create-with-joy-32
export PORT=3000
exec bun .output/server/index.mjs
