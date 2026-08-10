# Paperclip-2 Agent Runtime

This runtime coordinates the AI After Dark agent team from the command line. It stores research runs, episode plans, scripts, storyboards, ad slots, and review-gate state as JSON and Markdown files in `../backlog/`.

## Environment

The runtime loads `runtime/.env` first, then reuses the main AVIntelligence app key from `/Users/avin/Documents/AVINTELLIGENCE/avint/.env.local`. `ANTHROPIC_API_KEY` must be present there.

## Setup

```bash
make setup
```

## Verify

```bash
make verify
```

The smoke test checks env loading, prompt extraction, shared docs, a tiny agent cascade, file persistence, and review listing.

## Workflows

```bash
make sprint
make weekly
```

`make sprint` starts the pre-launch backlog sprint. `make weekly` creates one weekly episode candidate from the last seven days. Both pause at file-based review gates.

## Review

```bash
make review:list
make review:lock id=001
make review:kill id=001
make review:edit id=001
```

Artifacts live in `../backlog/episodes/<id>/`. Edit files directly in your editor, then lock or kill the gate from the CLI.

## Single-Agent Test

```bash
npm run agent:test researcher
```

Valid names: `researcher`, `producer`, `script-writer`, `joke-doctor`, `storyboard-artist`, `ad-writer`, `voice-director`, `animation-engineer`, `editor-assembler`, `thumbnail-titler`, `publisher`.

## Troubleshooting

- Env errors: confirm `/Users/avin/Documents/AVINTELLIGENCE/avint/.env.local` contains `ANTHROPIC_API_KEY`.
- JSON validation errors: open the agent output in the terminal logs and rerun the specific agent test.
- Prompt extraction errors: confirm each `agents/*.md` file has a fenced code block under `System Prompt`.
- Review stuck: run `make review:list`, open the episode folder, then run `make review:lock id=<NNN>` or `make review:kill id=<NNN>`.
