# Claude memory explorer

A read-only browser view of Claude Code's per-project memory: the Markdown files under `~/.claude/projects/<project>/memory/` and each project's `MEMORY.md` index. It lists, searches and graphs memories, and lints the store for drift that Claude's recall would miss.

## Run

```bash
node server.mjs        # or: npm start
```

Open http://localhost:4317. On WSL2, the Windows browser reaches it through localhost forwarding.

The server has no dependencies and rescans the memory directories on every request. The page refetches when its window regains focus, so it shows what Claude wrote a moment ago. The tool never writes to the memory store. The only file it writes is its own config.

| Variable | Default | Purpose |
|---|---|---|
| `PORT` | `4317` | Listen port |
| `HOST` | `127.0.0.1` | Bind address. Memories hold internal hostnames and customer facts, so the default stays on loopback. |
| `CLAUDE_HOME` | `~/.claude` | Root whose `projects/` directory gets scanned |
| `MEMORY_EXPLORER_CONFIG` | `$XDG_CONFIG_HOME/claude-memory-explorer/config.json`, else `~/.config/…` | Config file holding the ignore list |

On a loopback bind, the server answers only requests whose `Host` is a loopback name. That stops a page on another site from pointing its own hostname at 127.0.0.1 and reading the API.

## Ignoring projects

Select a project and click **Ignore project** in its overview to leave it out of **All projects**: its memories drop out of the list, graph, search and lint totals. Ignored projects sit in a collapsed **Ignored** section at the bottom of the sidebar. Open one there and click **Stop ignoring** to bring it back.

The list lives in the config file as `{"ignore": ["<project dir name>"]}`, so you can edit it by hand too. The page writes it through `POST /api/ignore`, which takes only a JSON body from the page's own origin. An entry whose project no longer exists stays in the file but doesn't show in the sidebar, so remove it by hand.

## Views

- **List**: search over name, description, body and filename, with every term required. Filter by type, and sort by newest or name.
- **Graph**: `[[links]]` within the selected scope. Nodes are colored by type and sized by degree. Broken links point at a dashed ghost node. Selecting a node highlights its neighbours.
- **Lint**: findings grouped by rule, filtered by severity. **Copy for Claude** copies the findings on screen as a Markdown prompt to paste into a Claude Code session. The prompt names each memory directory by absolute path and gives a fix for each rule it contains.
- **Detail**: frontmatter, the rendered body, outgoing links and backlinks. A link that resolves only loosely shows amber, and a broken one shows red.

The URL hash holds the whole view state, so reload, back/forward and bookmarks all work. Keys: `/` focuses search, `j`/`k` step through the list, `[` hides or shows the projects sidebar.

## Link resolution

A `[[target]]` resolves within its own project. The resolver tries the memory's `name:` first, then its filename with or without `.md`, then either one with case and `-`/`_` folded. Claude's recall matches on `name`, so a link that needs the second or third rule still works here but is flagged `loose-link`.

## Lint rules

| Rule | Severity | Meaning |
|---|---|---|
| `broken-link` | error | `[[target]]` matches no memory |
| `no-frontmatter` | error | File has no parseable `---` block |
| `missing-name`, `missing-description` | error | Required frontmatter key is absent or empty |
| `loose-link` | warn | Link resolves only by filename or folded spelling |
| `name-mismatch` | warn | `name:` differs from the filename stem |
| `legacy-type` | warn | `type:` sits at the top level instead of under `metadata:` |
| `missing-type`, `unknown-type` | warn | Type absent, or not one of user, feedback, project, reference |
| `duplicate-name` | warn | Two files in a project share a `name:` |
| `index-missing-file` | warn | `MEMORY.md` links a file that does not exist |
| `not-indexed` | warn | Memory file missing from `MEMORY.md` |
| `no-index` | warn | Project has memories but no `MEMORY.md` |
| `isolated` | info | Memory has no links in or out |

## Project names

Claude Code names a project directory by replacing `/` and `.` in its path with `-`, which loses dashes that were in the original names. The scanner rebuilds each path by checking which directories exist. A project whose directory has since been deleted shows its raw encoded id.

## Tests

```bash
npm test
```

The tests cover the pure logic: frontmatter parsing, link resolution, the index parser, the lint rules, path decoding, config parsing and the `Host` check.

`public/vendor/` holds marked 15.0.12 and d3 7.9.0, so the page works offline. Their licenses sit beside them.

## License

Public domain under the Unlicense (see `LICENSE`), except `public/vendor/`, which keeps the marked and d3 licenses.
