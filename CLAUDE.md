# CLAUDE.md

## Project overview

Obsidian plugin that make navigation work like VSCode-style: Single-click a file to open it as a preview (italic, muted title). Single-clicking another file replaces the preview tab's content. Double-click pins the tab so it stays open.

## Infrastructure

- Hosted on **Gitea** at `git.codelab.tec.br` (not GitHub). Use `GITEA_TOKEN` for CI auth; clone auth format is `TOKEN:x-oauth-basic@host`.
- `GITEA_API_TOKEN` is available in `.claude/settings.local.json` env. Read it from there directly rather than relying on env inheritance.
- npm package is published to the private Gitea npm registry, not npmjs.com.

## Build

- esbuild with `platform: "node"`. Run `npm run typecheck && npm run build` before every commit.
- `main.js` is committed to the repo — this is an Obsidian plugin convention (users install by copying files). Do not add it to `.gitignore`.

## Versioning

- Version must stay in sync between `package.json` and `manifest.json`. Use `npm version` — the `version` script in `package.json` handles `manifest.json` via `jq`.

## Commits

Conventional Commits style: `feat:`, `fix:`, `refact:`, `chore:`, etc. Pass commit messages via HEREDOC.