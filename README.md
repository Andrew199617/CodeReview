# FETools Code Review CLI

A small Node.js CLI to run a GPT-powered code review on a Perforce changelist.

## Features
- Accepts a Perforce changelist number and a text file of review instructions.
- Pulls file lists and unified diffs via `p4` (must be available in PATH and authenticated).
- Sends each file diff with your instructions to an OpenAI GPT-5.0 mini model.
- Writes per-file Markdown reviews and a summary.

## Usage
1. Install dependencies
```
npm install
```
2. Copy `.env.example` to `.env` and set `OPENAI_API_KEY`.
3. Run the review:
```
node ./src/index.js --cl 123456 --instructions ./my_instructions.txt --out ./reviews
```

You can also pass `--model` to override the default model.

## Requirements
- Node.js 18+
- Perforce CLI (`p4`) configured (P4PORT, P4USER, P4CLIENT, etc). You must have access to the changelist.

## Outputs
- A new folder under `--out` (default: `./reviews/CL_<number>`) with:
  - `summary.md` - overall notes
  - one `<escaped-file-path>.md` per file reviewed
