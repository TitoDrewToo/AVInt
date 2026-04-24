# memory/

Runtime data location. **Nothing in this directory is committed to git.**

- `incidents/<id>/` — per-incident timeline, artifacts, decision.json, review.md.
- `reviews/` — weekly/quarterly postmortems.
- `false-positives/` — tuning evidence, feeds rule suppression.
- `false-negatives/` — missed-attack evidence, feeds rule creation.

Actual storage in year 1: Supabase Postgres + Supabase Storage. This directory exists only as a conceptual anchor and is kept in the tree via this README.
