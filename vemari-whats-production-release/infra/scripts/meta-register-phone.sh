#!/usr/bin/env sh
set -eu
: "${META_GRAPH_API_VERSION:?}" "${META_PHONE_NUMBER_ID:?}" "${META_ACCESS_TOKEN:?}" "${META_APP_SECRET:?}" "${META_REGISTRATION_PIN:?}"
PROOF="$(printf '%s' "$META_ACCESS_TOKEN" | openssl dgst -sha256 -hmac "$META_APP_SECRET" -hex | awk '{print $2}')"
curl --fail-with-body -X POST \
  "https://graph.facebook.com/${META_GRAPH_API_VERSION}/${META_PHONE_NUMBER_ID}/register?appsecret_proof=${PROOF}" \
  -H "Authorization: Bearer ${META_ACCESS_TOKEN}" \
  -H "Content-Type: application/json" \
  --data "{\"messaging_product\":\"whatsapp\",\"pin\":\"${META_REGISTRATION_PIN}\"}"
