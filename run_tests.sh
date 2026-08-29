#!/bin/bash
pnpm --filter @oca/web preview --host 127.0.0.1 --port 4173 &
PID=$!
sleep 3
pnpm test:e2e
EXIT_CODE=$?
kill $PID
exit $EXIT_CODE
