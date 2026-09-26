# わたしの坂道選抜

Standalone static page: https://zaka-info.flf.jp/senbatsu/

Published file: `senbatsu/index.html` on `gh-pages`.
Published commit: `8622b0657567fd5c2153c8d02c02404c473e4cfc`.
Verified source blob: `e0c93a8fabcdc1ad1925baa5198debe77f6f55af`.
Source-preservation branch: `source/senbatsu-web-20260927`.

## Features

- No build step, dependencies, account, server API, external fonts, analytics, or photos.
- Nogizaka46, Sakurazaka46 and Hinatazaka46 candidate filters and cross-group selection.
- 92 seeded candidate names (33 / 32 / 27). These are a fixed reference list, NOT a verified current-active roster. Graduation/hiatus status is not inferred. Manual names are supported.
- 1–36 positions across up to three rows; presets for 11, 16, 18 and 21 positions.
- Tap a seat then a member; tap occupied seat then another seat to swap; desktop drag and drop; duplicate prevention.
- Geometric center indication (one center for odd front row, two for even); move-to-center control.
- Thirty-step formation undo; resize refuses total-capacity loss and reflows displaced members into empty seats.
- Local draft autosave and up to 20 named saves. A shared URL never silently overwrites the original local draft.
- UTF-8 base64url fragment sharing. The payload contains title and selected member names/groups, not local saved projects.
- PNG export (1560 × 1060), download/long-press fallback, optional native file sharing, X composer link (does not automatically post).
- Strict share-payload validation, textContent rendering, script-hash CSP, and disabled-storage handling.

## Verification on 2026-09-27

41 offline Chromium DOM checks passed. Screen layouts inspected at widths 390 and 1440, and overflow checked at 320. PNG output inspected. Local storage was stubbed because environment policies block navigation; these are not live-origin or real-iPhone/Safari tests. Native clipboard, X posting, native share sheets, mobile download behavior, and real persistence across a live-origin reload still require device acceptance testing.

Checks included initial seats/candidates, mixed-group selection, duplicate moves, tap swaps, undo, resizing, single/double center positions, search, escaped custom names/title, named saves, draft and custom-name restoration, shared state round-trip and draft isolation, malformed/oversized/version-mismatched/duplicated payload rejection, PNG generation, 36-seat layout, viewport overflow, disabled storage, uncaught exceptions, and CSP blocking injected inline scripts.

The exact tested bytes were uploaded and the Git blob SHA was verified against the local file.

## Important: preserve this page during automatic regeneration

The existing `gh-pages` site is refreshed by an external Hermes-generated publishing process. Its upstream source/deployment script was not available in this repository. This change does NOT modify or disable that process. If it replaces the output directory, it may remove `senbatsu/` on a later refresh.

Before generating/pushing the next site, copy the source branch's `senbatsu/index.html` into the output's `senbatsu/index.html`, or explicitly preserve that directory in the deployment script. Do not force-push the old source branch over a freshly generated `gh-pages` branch. No recurring workflow was added, and the existing home/Expo bundle was left unchanged.

This branch preserves the page even if a later generated deployment removes the published copy. Integrate the file into the real upstream project when available. Linking from the main app must likewise be done in its upstream source, not by repeatedly patching its minified bundle.

## Editing the file

The inline script is protected by a SHA-256 CSP hash. After changing JavaScript, recompute the hash of the exact text between `<script>` and `</script>` (including leading/trailing newlines) and replace the `script-src 'sha256-…'` value. Without updating the hash the browser correctly refuses to run changed code.

Do not add API keys or private data: everything under this public static site is public. Share fragments are not sent as part of HTTP requests, but anyone receiving a full shared URL can read its contents.

## Roster references

Checked 2026-09-27. These source pages may themselves lag membership changes; the UI expressly makes no active-membership claim.

- https://sp.nogizaka46.com/p/members
- https://sakurazaka46.com/s/s46/search/artist
- https://www.hinatazaka46.com/s/official/search/artist
