#!/bin/sh
set -e

: "${PORT:=8080}"
: "${BACKEND_URL:?BACKEND_URL is required, example: http://aifocus-backend.railway.internal:8000}"

envsubst '${PORT} ${BACKEND_URL}' < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf

exec nginx -g 'daemon off;'
