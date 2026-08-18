#!/usr/bin/env bash
set -euo pipefail

printf '%s\n' \
  'Local staging deployment is disabled.' \
  'Use GitHub Actions manual dispatch from develop with staging_config_verified=true and approve the protected staging environment.' >&2
exit 1
