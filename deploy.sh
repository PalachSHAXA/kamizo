#!/bin/bash

# Kamizo Deployment Script (Cloudflare Workers + D1)
# Layout: frontend in src/frontend, worker in cloudflare/

set -e

echo "🚀 Kamizo Deployment"
echo "===================="

# Parse flags (only --force is understood).
FORCE=0
for arg in "$@"; do
    case "$arg" in
        --force) FORCE=1 ;;
        *) ;;
    esac
done

# ────────────────────────────────────────────────────────────────────────
# Safety guard — refuse to deploy from a dirty or out-of-sync tree.
#
# Reason this exists: prod bundles have shipped multiple times built from
# a dirty working tree, producing source-of-truth code that lived only on
# the deploying laptop and could not be recovered when needed. Never
# again — the deployed bundle must always be reproducible from a commit
# on origin/main.
#
# Skippable only via --force + typed "yes". Use only when you know
# exactly what you are overriding.
# ────────────────────────────────────────────────────────────────────────
if [ "$FORCE" != "1" ]; then
    echo ""
    echo "🛡  Safety check: clean tree + in sync with origin/main..."

    # 1. Uncommitted changes under src/ or cloudflare/src/ — the only
    #    dirs that actually influence what gets built and shipped.
    dirty=$(git status --porcelain -- src cloudflare/src 2>/dev/null)
    if [ -n "$dirty" ]; then
        echo ""
        echo "❌ Uncommitted changes in files that will be built:"
        echo "$dirty" | sed 's/^/     /'
        echo ""
        echo "Fix — commit or stash before deploying:"
        echo "     git add -p && git commit -m '…'"
        echo "     # or: git stash -u"
        exit 1
    fi

    # 2. Fetch origin — refuse if it fails, do not guess.
    if ! git fetch origin --quiet 2>/dev/null; then
        echo ""
        echo "❌ 'git fetch origin' failed — cannot verify sync with origin/main."
        echo "     (Network down, auth broken, remote unreachable — unclear which.)"
        echo ""
        echo "Fix — restore connectivity and retry:"
        echo "     git remote -v"
        echo "     git fetch origin"
        exit 1
    fi

    # 3. HEAD must be at or ahead of origin/main. Behind or diverged → refuse.
    behind=$(git rev-list --count HEAD..origin/main 2>/dev/null || echo 0)
    ahead=$(git rev-list --count origin/main..HEAD 2>/dev/null || echo 0)
    if [ "$behind" -gt 0 ]; then
        echo ""
        if [ "$ahead" -gt 0 ]; then
            echo "❌ HEAD has DIVERGED from origin/main."
            echo "     local-only commits: $ahead"
            echo "     incoming commits:   $behind"
            echo ""
            echo "Fix — reconcile before deploying:"
            echo "     git log --oneline HEAD..origin/main   # inspect incoming"
            echo "     git rebase origin/main                # or: git merge origin/main"
        else
            echo "❌ HEAD is $behind commit(s) BEHIND origin/main."
            echo ""
            echo "Fix — pull first:"
            echo "     git pull --ff-only origin main"
        fi
        exit 1
    fi

    echo "   ✅ Working tree clean, HEAD in sync with origin/main."
else
    # --force override — make the risk visible, require typed consent.
    echo ""
    echo "⚠️  ⚠️  ⚠️   --force in effect — safety checks SKIPPED   ⚠️  ⚠️  ⚠️"
    echo ""
    echo "About to build and deploy from your CURRENT working tree,"
    echo "including any uncommitted edits and regardless of what's on"
    echo "origin/main. Whatever ships now becomes prod bytes that no"
    echo "one else can reproduce from git."
    echo ""
    read -r -p "Type 'yes' to continue: " confirm
    if [ "$confirm" != "yes" ]; then
        echo "Aborted."
        exit 1
    fi
    echo ""
fi

# Sanity: wrangler logged in
if ! (cd cloudflare && npx wrangler whoami &> /dev/null); then
    echo "❌ Wrangler is not authenticated. Run: cd cloudflare && npx wrangler login"
    exit 1
fi

# Step 1: Build frontend
echo ""
echo "📦 Step 1/3: Building frontend..."
cd src/frontend
npm run build
cd ../..
echo "   ✅ Frontend build complete (src/frontend/dist)"

# Step 2: Sync built assets to cloudflare/public
echo ""
echo "📦 Step 2/3: Syncing dist → cloudflare/public..."
rm -rf cloudflare/public
cp -r src/frontend/dist cloudflare/public
echo "   ✅ Assets synced"

# Step 3: Deploy worker
echo ""
echo "📦 Step 3/3: Deploying worker to Cloudflare..."
cd cloudflare
npm run deploy
cd ..

echo ""
echo "✅ Deployment complete — https://kamizo.uz"
echo ""
echo "ℹ️  Migrations are NOT applied automatically."
echo "    Apply manually if needed:"
echo "      cd cloudflare && npx wrangler d1 migrations apply kamizo-db --remote"
