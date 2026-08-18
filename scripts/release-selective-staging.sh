#!/usr/bin/env bash
set -euo pipefail

script_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
repo_root=$(git -C "$script_dir" rev-parse --show-toplevel 2>/dev/null) || {
  printf 'selective staging dry-run failed: not inside a Git worktree\n' >&2
  exit 1
}
manifest=${1:-$repo_root/release/selective-staging-manifest.txt}

if [[ ! -f "$manifest" ]]; then
  printf 'selective staging dry-run failed: manifest not found\n' >&2
  exit 1
fi

declare -a intended=()
while IFS= read -r path || [[ -n "$path" ]]; do
  [[ -z "$path" || "$path" == \#* ]] && continue
  case "$path" in
    /*|../*|*/../*|*/..|..|.superpowers/*|*.xlsx|*.XLSX|*.html|*.HTML|cloudflare/public/*|*/dist/*|dist/*|*/test-results/*|*/playwright-report*|*/coverage/*|*/.wrangler/*)
      printf 'selective staging dry-run failed: forbidden manifest path: %s\n' "$path" >&2
      exit 1
      ;;
  esac
  if [[ ! -e "$repo_root/$path" && ! -L "$repo_root/$path" ]]; then
    printf 'selective staging dry-run failed: manifest path does not exist: %s\n' "$path" >&2
    exit 1
  fi
  intended+=("$path")
done <"$manifest"

if (( ${#intended[@]} == 0 )); then
  printf 'selective staging dry-run failed: manifest has no intended paths\n' >&2
  exit 1
fi

credential_remote=0
while IFS= read -r remote; do
  while IFS= read -r url; do
    if [[ "$url" =~ ^https?://[^/]+@ ]] || [[ "$url" =~ [\?\&](token|access_token|auth)=[^\&]+ ]]; then
      credential_remote=1
    fi
  done < <(git -C "$repo_root" remote get-url --all "$remote" 2>/dev/null || true)
done < <(git -C "$repo_root" remote)

printf 'DRY RUN ONLY: no files will be staged, committed, pushed, or deployed.\n'
printf 'Intended release paths (%s):\n' "${#intended[@]}"
printf '  %s\n' "${intended[@]}"

if (( credential_remote != 0 )); then
  printf 'SECURITY ACTION REQUIRED: credential-bearing remote URL detected; value withheld. Revoke the exposed PAT and replace the remote with a credential-free URL before release.\n'
else
  printf 'Remote URL check: no embedded HTTP credential detected.\n'
fi

dirty_total=$(
  {
    git -C "$repo_root" diff --name-only -z
    git -C "$repo_root" diff --cached --name-only -z
    git -C "$repo_root" ls-files --others --exclude-standard -z
  } | tr '\0' '\n' | sort -u | awk 'NF { count++ } END { print count + 0 }'
)
printf 'Working-tree paths outside this allowlist remain untouched and are not listed. Total dirty paths observed: %s.\n' "$dirty_total"
