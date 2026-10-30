#!/usr/bin/env bash
# Makes a self-signed HTTPS certificate for Quantum Code so camera and
# microphone work in the live classroom from other machines on your network.
# Browsers will show a one-time "not private" warning: choose Advanced → Proceed.
set -e
cd "$(dirname "$0")/.."
mkdir -p backend/certs
ips=$(hostname -I 2>/dev/null | tr ' ' '\n' | grep -E '^[0-9.]+$' | sed 's/^/,IP:/' | tr -d '\n')
san="DNS:localhost,IP:127.0.0.1${ips}"
openssl req -x509 -newkey rsa:2048 -nodes -days 825 \
  -keyout backend/certs/dev.key -out backend/certs/dev.crt \
  -subj "/CN=Quantum Code" -addext "subjectAltName=${san}" >/dev/null 2>&1
echo "Created backend/certs/dev.key and backend/certs/dev.crt for ${san}"
echo "Now set in backend/.env:"
echo "  HTTPS_KEY=certs/dev.key"
echo "  HTTPS_CERT=certs/dev.crt"
echo "and restart. Open https://<this-machine-ip>:PORT from other devices."
