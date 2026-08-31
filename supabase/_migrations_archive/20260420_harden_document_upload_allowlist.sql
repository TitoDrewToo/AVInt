-- Harden document upload allowlist.
-- Legacy XLS/OLE files are intentionally excluded because they can contain
-- opaque macro content that the free prescan gate cannot inspect reliably.

update storage.buckets
set
  allowed_mime_types = array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'image/webp',
    'image/heic',
    'text/csv',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
  ],
  file_size_limit = 62914560
where id = 'documents';
