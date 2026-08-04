#!/bin/bash
set -e

echo "=== SYNCING LOCAL DATABASE TO PRODUCTION SERVER (168.144.121.252) ==="
scp /home/surendra/O2CTest/O2C/server/database.sqlite root@168.144.121.252:/root/P2P/O2C/server/database.sqlite
ssh root@168.144.121.252 "pm2 restart o2c-backend"

echo "✓ SUCCESS: Production database updated and backend reloaded!"
