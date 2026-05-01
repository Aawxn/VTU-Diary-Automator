# VTU Diary Automation

Bot-first toolkit for automating VTU Internship Diary entries.

## What works best

1. `bot/` Python Playwright EXE (recommended)
2. `extension/` browser extension (secondary fallback)

Both use the same diary JSON format from `shared/`.

## Quick Start (EXE / Bot)

1. Open `bot/dist/VTU-Diary-Bot-release/VTU-Diary-Bot.exe`
2. Load a preset or paste/load JSON
3. Click `Preview`
4. Click `Run Bot`
5. Log in to VTU in the opened browser
6. Let the run complete

## Bot Files

- `bot/main.py`
- `bot/ui.py`
- `bot/config.json`
- `shared/data.json`
- `shared/presets/*.json`
- `shared/skills.json`

## GPT Prompt (for generating copy-paste JSON)

In the EXE, click `click me for gpt prompt` and copy it.
That prompt already includes:
- strict output JSON structure
- rules for date/hours/fields
- the full allowed VTU skill list from `shared/skills.json`

Expected output shape:

```json
{
  "internship": "<exact internship name>",
  "entries": [
    {
      "date": "YYYY-MM-DD",
      "workSummary": "...",
      "learningOutcomes": "...",
      "hours": 3,
      "skills": ["Machine learning", "Python"]
    }
  ]
}
```

## Presets

Current presets are in `shared/presets/`:

- `android-gen-ai-mind-matrix.data.json`
- `bharat-unnati-ai-fellowship-learners-byte.data.json`
- `random-for-any-internship.data.json`

## Extension (secondary)

Extension is still available in `extension/` for interactive runs, but the bot is generally more reliable for bulk diary submission.

## Project Layout

```text
VTU-Diary-Automation/
  docs/
  shared/
  extension/
  bot/
  installer/
  README.md
  LICENSE
```

## Useful Docs

- `docs/workflow.md`
- `docs/portal-notes.md`
- `docs/known-issues.md`
