#!/usr/bin/env bash
# Deploy rapid-response.in to Firebase Hosting (project rrt-new-backend).
#
#   bash tools/deploy-firebase.sh
#
# What it does, in order:
#   1. checks firebase.json still matches vercel.json and runs the proxy tests
#   2. creates the Hosting site "rapid-response-in" the first time (the admin
#      panel keeps the project's default site; nothing of it changes)
#   3. deploys the website (npm run build runs first) and the store proxy
#      function webStoreProxy (codebase "web": the backend's functions are
#      not touched)
# The site is then live at https://rapid-response-in.web.app . The domain
# rapid-response.in only moves when you add it in the Firebase console.
set -euo pipefail
cd "$(dirname "$0")/.."

PROJECT=rrt-new-backend
SITE=rapid-response-in
FB="npx --yes firebase-tools@15"

echo "== checks"
node tools/firebase-config.js --check
node functions-web/proxy.test.js
[ -d node_modules ] || npm ci --no-audit --no-fund
(cd functions-web && npm ci --no-audit --no-fund)

echo "== sign in (opens a browser the first time)"
$FB login

echo "== Hosting site $SITE"
if ! $FB hosting:sites:get "$SITE" --project "$PROJECT" >/dev/null 2>&1; then
  $FB hosting:sites:create "$SITE" --project "$PROJECT" || {
    echo "Could not create site $SITE (the name may be taken). Pick another name, put it in"
    echo ".firebaserc (targets > hosting > web) and SITE= in this script, then run again."
    exit 1
  }
fi

echo "== deploy"
$FB deploy --only "hosting:web,functions:web" --project "$PROJECT"

echo
echo "Done. Check https://$SITE.web.app (home, shop, a product, /app) before moving the domain."
