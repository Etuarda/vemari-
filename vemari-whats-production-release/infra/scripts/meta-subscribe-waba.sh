#!/usr/bin/env sh
set -eu
: "${META_GRAPH_API_VERSION:?}" "${META_WABA_ID:?}" "${META_ACCESS_TOKEN:?}" "${META_APP_SECRET:?}"
PROOF="$(printf '%s' "$META_ACCESS_TOKEN" | openssl dgst -sha256 -hmac "$META_APP_SECRET" -hex | awk '{print $2}')"
curl --fail-with-body -X POST \
  "https://graph.facebook.com/${META_GRAPH_API_VERSION}/${META_WABA_ID}/subscribed_apps?appsecret_proof=${PROOF}" \
  -H "Authorization: Bearer ${META_ACCESS_TOKEN}"
