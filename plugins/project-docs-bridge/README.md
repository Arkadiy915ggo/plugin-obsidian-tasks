# Project Docs Bridge

Desktop-only Obsidian plugin that safely exposes project documentation inside a real vault folder. It mirrors Markdown, `.excalidraw`, `.excalidraw.md`, and locally referenced images/PDFs without virtual files, symlinks, adapter replacement, or Git operations.

## Recommended Layout

Keep the vault as a child of the repository. The default settings then work without changes: source root `..` and mirror root `doc`.

```text
my-project/
  .git/
  packages/
    api/
      docs.md
      architecture.excalidraw
      diagram.png
  .project-vault/
    .obsidian/
    doc/                         # generated physical mirror
      packages/api/docs.md
```

Open `.project-vault` as the vault, enable the plugin, review **Settings > Project Docs Bridge**, then choose **Initialize mirror**. Initialization copies source-only files into `doc`, accepts equal copies, and creates a conflict instead of overwriting different copies. It never creates a source file from a stale mirror-only file during bootstrap.

## Synchronization Model

- The mirror is a normal vault folder, so File Explorer, editor, preview, search, links, backlinks, and Excalidraw work normally.
- Every tracked file has a persisted SHA-256 baseline. Only one changed side is copied to the other side.
- Different simultaneous edits create snapshots in `doc/_project-docs-conflicts/`; neither current version is overwritten.
- Delete from source sends the mirror file to Obsidian trash. Delete from mirror moves the source file to `<sourceRoot>/.project-docs-trash/<timestamp>/`.
- Tombstones prevent a later watcher scan from restoring a deleted file automatically.
- Source and vault rename events are paired by content hash where unambiguous. Case-only Windows renames use a temporary path.
- The source tree is watched with a debounced serial queue. Own write events are ignored only when their actual SHA-256 equals the expected destination hash.

Use **Open conflicts** to choose `Keep source` or `Keep vault`. The plugin rechecks current hashes before applying the choice; snapshots remain available for manual recovery.

## Attachments

The plugin mirrors attachments referenced by managed documentation, preserving their relative paths and without rewriting links. Supported references include Markdown embeds/links, wiki embeds/links, URL-encoded paths, paths with fragments or queries, Excalidraw Markdown embedded files, and path-like legacy `.excalidraw` JSON values.

Supported extensions by default: `png`, `jpg`, `jpeg`, `gif`, `webp`, `svg`, `pdf`.

Configure Obsidian attachment location as **Same folder as current file** or a folder inside `doc`. Attachments created outside the mirror root are intentionally not synchronized. Ambiguous wiki basenames and links outside the source root are skipped with a warning.

## Git Ignore

The plugin does not edit `.gitignore`. This repository ignores the default local `.project-vault/`, its local `plugins-obsidian-doc/` vault, and source-side `.project-docs-trash/`. Those patterns do not match `plugins/project-docs-bridge/`, so plugin source remains tracked. If a project uses a differently named local vault, add that vault directory and its source-side `.project-docs-trash/` to that project's `.gitignore`.

## Obsidian Sync

Obsidian Sync is optional.

- Recommended desktop workflow: exclude `doc` from Sync and build the mirror from each machine's local Git checkout.
- Optional mobile workflow: include `doc` in Sync. Mobile can read and edit real mirror files, but this desktop-only plugin does not run on mobile.
- On the next desktop sync, a mirror edit is treated as a normal vault edit. It copies to the local source only if source still matches the persisted baseline; otherwise it becomes a conflict.

Syncing plugin settings or manifest data between machines is not a correctness transport. Current file hashes remain authoritative.

## Limitations

- Desktop Obsidian on Ubuntu and Windows only; no Android/iOS source-repository access.
- No Git commands, automatic three-way merges, virtual `TFile`, adapter patching, symlinks, multiple source roots, or permanent source deletion.
- Files outside the configured source root, filesystem symlinks/junctions, and unreferenced new binary files are not mirrored.
- Verify Windows locks, case-only renames, and actual Obsidian/Excalidraw behavior before release.

## Development

```bash
npm ci
npm run build:docs
npm test --workspace project-docs-bridge
```

Tests use Node's built-in `node:test` runner. The test script compiles TypeScript to `.test-dist` before running it.
