#!/bin/sh
# Run on ECS after applying the ACME bootstrap bundle and DNS-only A record.
set -eu
action=${1:?Use issue or renew}
host=${2:?Supply the purchased forum hostname}
case "$host" in *[!a-z0-9.-]*|''|.*|*..*|*example.com|*example.net|*example.org) echo 'Invalid or example hostname' >&2; exit 1;; esac
case "$action" in
  issue)
    email=${3:?Supply the ACME notification email}
    docker run --rm \
      -v /opt/moye/deploy/letsencrypt:/etc/letsencrypt \
      -v /opt/moye/deploy/acme:/var/www/acme \
      certbot/certbot:v5.4.0 certonly --webroot -w /var/www/acme \
      --cert-name "$host" -d "$host" --email "$email" --agree-tos --non-interactive
    ;;
  renew)
    docker run --rm \
      -v /opt/moye/deploy/letsencrypt:/etc/letsencrypt \
      -v /opt/moye/deploy/acme:/var/www/acme \
      certbot/certbot:v5.4.0 renew --cert-name "$host" --non-interactive
    docker exec moye-nginx-1 nginx -t
    docker exec moye-nginx-1 nginx -s reload
    ;;
  *) echo 'Use issue or renew' >&2; exit 1;;
esac
