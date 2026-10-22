# CLAUDE.md

A read-only browser view of Claude Code's per-project memory. `README.md` covers running it, the views, link resolution and the lint rules.

## Constraints

- No dependencies and no build step. The server uses only Node built-ins, and the page loads vanilla ES modules. `public/vendor/` holds pinned copies of marked and d3, so a library update replaces the vendored file and its version in the README.
- The tool never writes to `~/.claude`. The only file it writes is its own config, through `updateConfig` in `lib/config.mjs`, which serializes writes and renames the new file into place.
- Memories hold internal hostnames and customer facts. The server binds to loopback by default and answers only loopback `Host` names (`hostAllowed` in `lib/guard.mjs`). A write endpoint accepts only a JSON body and checks `Origin`, as `setIgnored` in `server.mjs` does.
- Memory text reaches the DOM only through `esc` or the marked renderer, which escapes raw HTML.
- The URL hash holds all view state (`readHash` and `writeHash` in `public/app.js`). Only per-viewer conveniences, such as whether the Ignored section is expanded, live outside it.

## Tests

`npm test` runs `node:test` over `test/`. Tests cover the pure logic in `lib/`; the server and the page get a manual check instead. Before adding a test, name the source edit that would make it fail and no existing test fail. Prefer one whole-value assertion over several partial ones.

After a UI change, load the page in the headless browser, take a screenshot and check the console, in dark mode and at a 400px width too. To exercise the ignore list without touching the real config, start a second server against a scratch file: `PORT=4318 MEMORY_EXPLORER_CONFIG=<scratch path> node server.mjs`.

## Writing

These are the **house prose rules**, and they govern everything an agent writes into the repo: code comments, commit messages, the README and other docs. The sections that follow add rules for one surface; none of them relax these. They do not govern chat replies in the terminal, which follow the active output style.

Write the way an engineer tells a colleague what changed.

- **Name the actor and give it the verb.** Passive voice hides who acts, and the actor is usually the point: "the scanner skips a project whose memory directory is missing", not "a project is skipped when its memory directory is missing". Write it passive only when nobody knows the actor or nobody cares. A noun made out of a verb hides the same way: "the migration adds the column", not "addition of the column happens in the migration". The sentence that summarizes a change takes the changed thing as its subject, not the commit: "the `engines` field now requires Node 20", not "bumps the `engines` field to Node 20". An imperative subject line already carries the elided "this commit", so a body that elides it again only restates the subject line. There is always a file, a setting or a class to put in the subject slot, and it is the more useful actor.
- **One idea per sentence.** Two plain sentences beat one clause-stacked sentence. Hold to a single subordinate clause, and to one splice per sentence — an em dash and a semicolon count alike. A full stop carries the same weight and leaves the reader holding one thought. A sentence past about 25 words is a paragraph nobody split yet.
- **Cut narrative filler.** Delete any sentence that loses no fact when it goes. That covers the wind-up ("It is worth noting that", "In order to", "This change", "Note that", "Simply", "Basically"), the story of the work ("after investigating", "initially X, then Y", "we decided to", "as requested"), and the self-congratulation ("successfully", "now properly", "cleanly"). Open with the fact.
- **Use the plain word.** Keep the real name of an identifier, endpoint, table or protocol exactly as the code spells it. Everywhere else, write the word a reader will not stop on: cut "leverage", "surface" as a verb, "reconcile", "propagate", "orchestrate", "robust", "seamless", "streamline", "holistic", "unlock", "gracefully", "under the hood" and "out of the box". Use one name per thing throughout, because a synonym swapped in for variety reads as a second thing.

Reread what you are about to commit against those four. The check is mechanical: every sentence names something doing something, no sentence survives its own deletion, and no word sends the reader to a dictionary. How much to write, and what to leave out, is a separate question that **Commits** answers.

## Comments

- Keep comments concise; only add them for non-obvious cases. Prefer self-documenting code (clear names, small functions) over explanatory comments.
- Every line must carry something the code doesn't already say. A comment that passes that test can be as long as it needs to be; one that doesn't is too long at two lines. Usage examples and restatements of the signature never pass.
- Explain *why*, not *how* — the code already shows how.
- Write for a future reader with no knowledge of how the code came to be. Never include out-of-context references to chat prompts, task history, or "as requested" framing.
- Answer questions the *code* raises, not ones that came up while writing it. A comment that reads naturally but only exists because someone asked mid-task is still noise — reread comments added during a task and cut those.

## Commits

- Subject: `<Area>: <what changed>`, imperative, under ~72 chars. `<Area>` is capitalized and names the part of the tool (`Server:`, `Scan:`, `Lint:`, `UI:`); drop it for repo-wide changes.
- **Trivial change — subject only.** A config tweak, a rename, a dependency bump, a docs edit, a one-line fix.
- **Non-trivial change — write a body.** A new endpoint, a behavior change, a bug fix with a real cause, a refactor that moves responsibility between modules, anything touching more than one concern. Assume the reader is scanning the log and will not open the diff.
- The body does two things, in order: summarize what the change now does that it did not do before, then give the *why* where the why is not obvious — how an external system actually behaves, a constraint that forced this approach over the obvious one, a consequence somewhere the diff does not touch. Stop after the summary when the change explains itself.
- **Summarize; do not enumerate.** Describe the change as one thing. Never walk the files, and never list every function, field, or enum value touched — name the category instead ("grouped by outcome", not the four outcome names). One or two short paragraphs is normal, three the ceiling.
- An agent signs a commit with `Model: <model name>` on the last line, never a `Co-Authored-By:` trailer and never a "Generated with" footer.
