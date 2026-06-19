#!/bin/sh
set -e

export BACKEND_UPSTREAM="${BACKEND_UPSTREAM:-http://re-rtc-backend:9000}"

envsubst '${BACKEND_UPSTREAM}' \
  < /etc/nginx/templates/default.conf.template \
  > /etc/nginx/conf.d/default.conf

exec nginx -g 'daemon off;'
