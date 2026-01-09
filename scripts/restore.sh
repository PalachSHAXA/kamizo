#!/bin/bash

# ==================== UK CRM Database Restore Script ====================
# Restores database from backup

set -e

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0m'

log_info() { echo -e "${BLUE}ℹ️  $1${NC}"; }
log_success() { echo -e "${GREEN}✅ $1${NC}"; }
log_warning() { echo -e "${YELLOW}⚠️  $1${NC}"; }
log_error() { echo -e "${RED}❌ $1${NC}"; }

# Configuration
DB_NAME="uk-crm-db"
BACKUP_DIR="backups/database"

echo ""
log_error "╔════════════════════════════════════════╗"
log_error "║   DATABASE RESTORE                     ║"
log_error "╚════════════════════════════════════════╝"
echo ""

# Warning
log_error "⚠️  WARNING: This will restore the database from a backup!"
log_warning "This operation will OVERWRITE existing data."
echo ""

# List available backups
log_info "Available backups:"
echo ""

if [ ! -d "$BACKUP_DIR" ] || [ -z "$(ls -A $BACKUP_DIR/*.tar.gz 2>/dev/null)" ]; then
  log_error "No backups found in $BACKUP_DIR"
  exit 1
fi

ls -lh "$BACKUP_DIR"/*.tar.gz | awk '{print NR". "$9" ("$5")"}'
echo ""

# Select backup
read -p "Enter backup number to restore (or 'q' to cancel): " BACKUP_NUM

if [ "$BACKUP_NUM" = "q" ]; then
  log_info "Restore cancelled"
  exit 0
fi

# Get backup file
BACKUP_FILE=$(ls "$BACKUP_DIR"/*.tar.gz | sed -n "${BACKUP_NUM}p")

if [ -z "$BACKUP_FILE" ]; then
  log_error "Invalid backup number"
  exit 1
fi

log_info "Selected backup: $BACKUP_FILE"
echo ""

# Final confirmation
log_error "⚠️  FINAL WARNING: This will OVERWRITE the database!"
read -p "Type 'RESTORE' to confirm: " CONFIRM

if [ "$CONFIRM" != "RESTORE" ]; then
  log_info "Restore cancelled"
  exit 0
fi

echo ""
log_info "Starting restore process..."

# Extract backup
TEMP_DIR=$(mktemp -d)
log_info "Extracting backup to $TEMP_DIR..."
tar -xzf "$BACKUP_FILE" -C "$TEMP_DIR"

# Find SQL files
SQL_FILES=$(find "$TEMP_DIR" -name "*.sql")

if [ -z "$SQL_FILES" ]; then
  log_warning "No SQL files found in backup"
  log_info "Checking for JSON data files..."

  JSON_FILES=$(find "$TEMP_DIR" -name "data-*.json")

  if [ -z "$JSON_FILES" ]; then
    log_error "No data files found in backup"
    rm -rf "$TEMP_DIR"
    exit 1
  fi

  log_info "Found JSON data files"
  log_warning "JSON restore requires manual processing"
  log_info "Data files extracted to: $TEMP_DIR"
  echo ""
  log_info "To restore manually:"
  for json_file in $JSON_FILES; do
    table_name=$(basename "$json_file" | sed 's/data-\(.*\)-[0-9]*.json/\1/')
    log_info "  - Import $table_name from $json_file"
  done
  exit 0
fi

# Restore from SQL
log_info "Restoring from SQL files..."

for sql_file in $SQL_FILES; do
  log_info "Executing: $(basename $sql_file)"

  # Note: D1 doesn't support direct SQL file import
  # This is a placeholder - actual restore requires wrangler commands
  log_warning "SQL file found: $sql_file"
  log_info "Use: npx wrangler d1 execute $DB_NAME --file=$sql_file"
done

# Cleanup
rm -rf "$TEMP_DIR"

echo ""
log_success "╔════════════════════════════════════════╗"
log_success "║   Restore Process Information          ║"
log_success "╚════════════════════════════════════════╝"
echo ""
log_info "Backup extracted and ready for manual import"
log_info "D1 Database restore requires wrangler commands"
echo ""
log_info "Recommended restore steps:"
log_info "1. Create a new D1 database (staging)"
log_info "2. npx wrangler d1 execute $DB_NAME --file=schema.sql"
log_info "3. Import data table by table"
log_info "4. Test the restored database"
log_info "5. Switch to restored database if successful"
echo ""
