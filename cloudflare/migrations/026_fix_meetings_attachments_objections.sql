-- Migration 026: Fix meetings system
-- 1. Add attachments to agenda items (manager uploads, residents preview)
-- 2. Add comment_type to agenda comments (comment vs objection)
-- 3. Add counter_proposal field for against votes

ALTER TABLE meeting_agenda_items ADD COLUMN attachments TEXT;
ALTER TABLE meeting_agenda_items ADD COLUMN description_extended TEXT;

ALTER TABLE meeting_agenda_comments ADD COLUMN comment_type TEXT DEFAULT 'comment';
ALTER TABLE meeting_agenda_comments ADD COLUMN counter_proposal TEXT;
