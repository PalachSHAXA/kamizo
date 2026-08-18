#!/usr/bin/env bash
set -euo pipefail

repo_root=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
preflight="$repo_root/scripts/preflight-backend-production.sh"
fixture_root=$(mktemp -d)
trap 'rm -r -- "$fixture_root"' EXIT

cat >"$fixture_root/valid.snapshot" <<'EOF'
===NGINX===
server {
    listen 80;
    server_name api.kamizo.uz;
    return 301 https://$host$request_uri;
}
server {
    listen 443 ssl;
    server_name api.kamizo.uz;
    location / {
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_pass http://127.0.0.1:3000;
    }
}
===LISTENERS===
LISTEN 0 511 127.0.0.1:3000 0.0.0.0:*
EOF

"$preflight" --snapshot "$fixture_root/valid.snapshot" >"$fixture_root/out"
grep -q 'backend production preflight passed' "$fixture_root/out"

cat >"$fixture_root/missing-real-ip.snapshot" <<'EOF'
===NGINX===
server {
    listen 443 ssl;
    server_name api.kamizo.uz;
    location / {
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_pass http://127.0.0.1:3000;
    }
}
===LISTENERS===
LISTEN 0 511 127.0.0.1:3000 0.0.0.0:*
EOF
if "$preflight" --snapshot "$fixture_root/missing-real-ip.snapshot" >"$fixture_root/out" 2>"$fixture_root/err"; then
  printf 'expected missing X-Real-IP overwrite to fail\n' >&2
  exit 1
fi
grep -q 'X-Real-IP' "$fixture_root/err"

cat >"$fixture_root/public-listener.snapshot" <<'EOF'
===NGINX===
server {
    listen 443 ssl;
    server_name api.kamizo.uz;
    location / {
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_pass http://127.0.0.1:3000;
    }
}
===LISTENERS===
LISTEN 0 511 0.0.0.0:3000 0.0.0.0:*
EOF
if "$preflight" --snapshot "$fixture_root/public-listener.snapshot" >"$fixture_root/out" 2>"$fixture_root/err"; then
  printf 'expected public port 3000 listener to fail\n' >&2
  exit 1
fi
grep -q 'loopback' "$fixture_root/err"

mkdir -p "$fixture_root/deploy/scripts" "$fixture_root/deploy/cloudflare/src" \
  "$fixture_root/deploy/bin" "$fixture_root/deploy/home/.ssh"
cp "$repo_root/scripts/deploy-vps.sh" "$fixture_root/deploy/scripts/deploy-vps.sh"
printf 'fixture-key\n' >"$fixture_root/deploy/home/.ssh/kamizo_vps"
cat >"$fixture_root/deploy/scripts/preflight-backend-production.sh" <<'EOF'
#!/usr/bin/env bash
printf 'preflight\n' >>"${ORDER_LOG:?}"
EOF
cat >"$fixture_root/deploy/bin/rsync" <<'EOF'
#!/usr/bin/env bash
printf 'rsync\n' >>"${ORDER_LOG:?}"
EOF
cat >"$fixture_root/deploy/bin/ssh" <<'EOF'
#!/usr/bin/env bash
printf 'ssh\n' >>"${ORDER_LOG:?}"
EOF
cat >"$fixture_root/deploy/bin/curl" <<'EOF'
#!/usr/bin/env bash
printf '{"status":"healthy"}\n'
EOF
chmod +x "$fixture_root/deploy/scripts/"*.sh "$fixture_root/deploy/bin/"*
HOME="$fixture_root/deploy/home" ORDER_LOG="$fixture_root/order" \
  PATH="$fixture_root/deploy/bin:$PATH" "$fixture_root/deploy/scripts/deploy-vps.sh" \
  >"$fixture_root/out"
test "$(sed -n '1p' "$fixture_root/order")" = 'preflight'
test "$(sed -n '2p' "$fixture_root/order")" = 'rsync'

printf 'backend production preflight tests passed\n'
