# Paperclip-2 Backlog

All runtime artifacts are files so git can be the audit trail.

## Layout

- `research-runs/<YYYY-MM-DD>-<mode>.json`: News Scout outputs.
- `episodes/<NNN>/plan.json`: Showrunner episode plan.
- `episodes/<NNN>/script-<slot>.md`: human-readable segment scripts.
- `episodes/<NNN>/storyboard.json`: shot list for the animation pipeline.
- `episodes/<NNN>/ad-slot.md`: in-show AVIntelligence ad.
- `episodes/<NNN>/status.json`: review-gate status.

The founder reviews and edits files directly, then uses `runtime/` CLI targets to lock, kill, or open an episode folder.
