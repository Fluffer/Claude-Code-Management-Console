# Project Description in GUI and Search — Design

**Date:** 2026-06-11
**Status:** Approved

## Goal

Show a short description of each project in the project list so it is easy to see what a project does, and include that description in the search box matching so projects can be found by keyword.

## Decisions

- **Source:** Auto-extracted from `README.md` (preferred), falling back to `CLAUDE.md`. No manual entry, nothing persisted in `config.json`.
- **Display:** Subtitle line under the project name in each list row. Single line, ellipsis-trimmed, secondary color, full text in tooltip. Row stays compact (subtitle collapsed) when no description exists.
- **Search:** The existing search box matches `Name` OR `Description`, case-insensitive substring. Root filter and SavedFilter AND-logic unchanged.
- **Timing:** Extraction happens during `Rescan()` while the project list is built (Approach A). With an mtime-based cache, repeat scans are nearly free.

## Components

### ProjectDescriptionService (new, `src/Ccmc.Core/Services`)

`string? GetDescription(string projectPath)`

- Candidate files in order: `README.md`, then `CLAUDE.md`. First file that yields a description wins.
- Reads at most the first ~4 KB of the file.
- Returns the first *meaningful* line, skipping:
  - headings (`#`-prefixed)
  - image/badge lines (`![`, `[![` prefixes)
  - HTML tag lines (`<`-prefixed)
  - code fences and fenced content (` ``` `)
  - blockquotes (`>`), horizontal rules (`---`, `***`), empty/whitespace lines
- Strips inline markdown from the chosen line: `[text](url)` → `text`, bold/italic markers, backticks.
- Caps the result at 200 characters.
- In-memory cache keyed by `(filePath, lastWriteTimeUtc)` — a rescan only re-reads files that changed.
- Never throws: missing/unreadable file or any IO error → `null`.

### Data flow

`MainViewModel.Rescan()` obtains a description per project alongside the existing `ProjectInfo` data. The carrier (new property on the `ProjectInfo` record vs. a side dictionary) is an implementation-plan decision; the requirement is that `ApplyFilter()` and `ProjectItemViewModel` both see the same value.

### ProjectItemViewModel

New observable `Description` (string, may be empty) and a derived visibility flag (or converter) so the subtitle `TextBlock` collapses when empty.

### MainWindow.xaml

Second `TextBlock` row beneath the name/badges line inside the list item template:

- `TextTrimming="CharacterEllipsis"`, single line
- secondary foreground (`TextFillColorSecondaryBrush`), smaller font
- `ToolTip` with the full description text
- `Visibility` collapsed when description empty

### ApplyFilter (MainViewModel.cs ~line 274)

```
match = Name.Contains(term, OrdinalIgnoreCase)
     || Description.Contains(term, OrdinalIgnoreCase)
```

## Error handling

Description extraction must never block or fail a scan. Any IO or parse problem results in "no description" for that project only.

## Testing

Unit tests in `Ccmc.Core` tests:

- README with heading then paragraph → paragraph returned
- README starting with badges/images → badges skipped
- README with only headings → falls back to CLAUDE.md
- No README, CLAUDE.md present → CLAUDE.md used
- Empty/whitespace-only files → null
- Markdown stripping (links, bold, inline code)
- 200-char cap
- Cache invalidation on mtime change
- Filter test: search term matching description but not name → project included

UI change verified manually (subtitle renders, tooltip shows, empty case stays compact).

## Out of scope

- Manual description editing/override
- Persisting descriptions in `config.json`
- Multi-line descriptions or markdown rendering in the row
