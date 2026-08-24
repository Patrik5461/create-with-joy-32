#!/bin/bash
set -e
cd /home/patrik/create-with-joy-32
echo "$(date): Deploy started" >> /home/patrik/deploy.log

git checkout -- src/routeTree.gen.ts 2>/dev/null || true
git pull origin main

# Obnov chýbajúce tajné kľúče zo zálohy (mima-secrets.env)
if [ -f /home/patrik/mima-secrets.env ]; then
  while IFS='=' read -r key _; do
    [ -z "$key" ] && continue
    if ! grep -q "^${key}=" .env; then
      grep "^${key}=" /home/patrik/mima-secrets.env >> .env
      echo "$(date): Restored missing key ${key}" >> /home/patrik/deploy.log
    fi
  done < /home/patrik/mima-secrets.env
fi

bun install --frozen-lockfile
bun run build
pm2 restart mima-crm --update-env
echo "$(date): Deploy finished" >> /home/patrik/deploy.log
