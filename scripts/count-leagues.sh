#!/bin/bash
cd /home/nuno/programmazione/fantavega
set -a
source .env.local
set +a
npx tsx scripts/count-leagues.ts
