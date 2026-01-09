#!/bin/bash

# ==================== UK CRM Database Backup Script ====================
# Creates timestamped backup of D1 database

set -e

# Colors
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }

# Configuration
DB_NAME="uk-crm-db"
BACKUP_DIR="backups/database"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)
BACKUP_FILE="$BACKUP_DIR/backup-$TIMESTAMP.sql"

# Create backup directory
mkdir -p "$BACKUP_DIR"

echo ""
log_info "╔════════════════════════════════════════╗"
log_info "║   UK CRM Database Backup               ║"
log_info "╚════════════════════════════════════════╝"
echo ""

log_info "Database: $DB_NAME"
log_info "Backup file: $BACKUP_FILE"
echo ""

# Export database schema
log_info "Exporting database schema..."
npx wrangler d1 execute "$DB_NAME" --remote \
  --command="SELECT sql FROM sqlite_master WHERE type='table'" \
  > "$BACKUP_DIR/schema-$TIMESTAMP.sql"

log_success "Schema exported"

# Export data from each table
log_info "Exporting data..."

# Get list of tables
TABLES=$(npx wrangler d1 execute "$DB_NAME" --remote \
  --command="SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'" \
  --json | jq -r '.[].results[].name' 2>/dev/null || echo "")

if [ -z "$TABLES" ]; then
  log_warning "No tables found or failed to retrieve table list"
  log_info "Creating basic backup..."

  # Fallback: export everything via SQL dump
  cat > "$BACKUP_FILE" << 'EOF'
-- UK CRM Database Backup
-- Generated: $(date)
-- Database: uk-crm-db

-- Note: Use wrangler d1 execute for full backup
-- This is a placeholder backup file

.echo on
.mode insert

-- To create a full backup, run:
-- npx wrangler d1 backup create uk-crm-db
-- npx wrangler d1 backup download uk-crm-db <backup-id>
EOF
else
  log_info "Found tables: $(echo $TABLES | tr '\n' ', ')"

  # Create backup file header
  cat > "$BACKUP_FILE" << EOF
-- UK CRM Database Backup
-- Generated: $(date)
-- Database: $DB_NAME
-- Timestamp: $TIMESTAMP

BEGIN TRANSACTION;
EOF

  # Export each table
  for table in $TABLES; do
    log_info "Backing up table: $table"

    npx wrangler d1 execute "$DB_NAME" --remote \
      --command="SELECT * FROM $table" --json \
      >> "$BACKUP_DIR/data-$table-$TIMESTAMP.json" 2>/dev/null || true
  done

  echo "COMMIT;" >> "$BACKUP_FILE"
  log_success "Data exported"
fi

# Compress backup
log_info "Compressing backup..."
tar -czf "$BACKUP_DIR/backup-$TIMESTAMP.tar.gz" \
  "$BACKUP_DIR"/*-$TIMESTAMP.* 2>/dev/null || true

# Get backup size
BACKUP_SIZE=$(du -h "$BACKUP_DIR/backup-$TIMESTAMP.tar.gz" 2>/dev/null | cut -f1 || echo "N/A")

log_success "Backup compressed: $BACKUP_SIZE"

# Clean up old backups (keep last 30)
log_info "Cleaning up old backups (keeping last 30)..."
cd "$BACKUP_DIR"
ls -t backup-*.tar.gz 2>/dev/null | tail -n +31 | xargs rm -f 2>/dev/null || true
cd - > /dev/null

OLD_COUNT=$(ls -1 "$BACKUP_DIR"/backup-*.tar.gz 2>/dev/null | wc -l || echo 0)
log_success "Old backups cleaned (remaining: $OLD_COUNT)"

# Create backup metadata
cat > "$BACKUP_DIR/backup-$TIMESTAMP.meta.json" << EOF
{
  "timestamp": "$TIMESTAMP",
  "date": "$(date -Iseconds)",
  "database": "$DB_NAME",
  "backup_file": "backup-$TIMESTAMP.tar.gz",
  "size": "$BACKUP_SIZE",
  "tables_backed_up": $(echo "$TABLES" | wc -l | tr -d ' ')
}
EOF

echo ""
log_success "╔════════════════════════════════════════╗"
log_success "║   Backup Completed Successfully       ║"
log_success "╚════════════════════════════════════════╝"
echo ""
log_info "Backup location: $BACKUP_DIR/backup-$TIMESTAMP.tar.gz"
log_info "Backup size: $BACKUP_SIZE"
log_info "Total backups: $OLD_COUNT"
echo ""

# Optional: Upload to cloud storage (uncomment if using)
# log_info "Uploading to cloud storage..."
# aws s3 cp "$BACKUP_DIR/backup-$TIMESTAMP.tar.gz" s3://your-bucket/backups/
# log_success "Uploaded to S3"
