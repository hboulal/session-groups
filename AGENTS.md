# Session Groups

A VS Code extension: a side panel of the user's own groups of coding-agent sessions, each run in a terminal and resumed by a click. The behaviour is specified in `docs/design.md`; keep it current with every change.

## Rules

- **The design doc is binding.** Update `docs/design.md` (and `README.md` where it describes the same thing) with the code. Documents describe the current state; history belongs in git.
- **Platform facts are verified, not recalled.** Check VS Code API claims against `@types/vscode` (the version in `package.json`). Check agent CLI flags against the tool's `--help` or documentation. A claim that cannot be checked is labelled "to verify" in the design doc.
- **Pure logic is tested.** Tree shapes, labels, ordering and transcript parsing live in modules without a `vscode` import (`view.ts`, `model.ts`, `title.ts`, `opencode.ts`, `order.ts`, `reattach.ts`, `launch.ts`), each with a vitest file next to it.
- **Checks before done:** `npm run typecheck && npm test && npm run build`.
- **English everywhere.** Each markdown paragraph is a single line.

## Commands

```bash
npm ci
npm run typecheck && npm test && npm run build
npm run package   # session-groups-<version>.vsix for a local install: code --install-extension <file> --force
```
