-- Executor completion photo report.
-- When an executor completes a request (/api/requests/:id/complete) they MAY
-- attach an optional photo report of the finished work. Stored as a JSON array
-- of image data-URLs, mirroring requests.photos (the resident's photos). Photos
-- are only written when actually attached (keeps DB growth minimal). Managers/
-- directors view them in the request detail (ManagementRequestModal).
-- SQLite forbids IF NOT EXISTS on ALTER ADD COLUMN — this runs once.
ALTER TABLE requests ADD COLUMN completion_photos TEXT;
