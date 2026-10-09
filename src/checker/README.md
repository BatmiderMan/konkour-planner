# Answer checker (پاسخ‌برگ)

Second project, merged into Planex. Entry points: nav tab «تصحیح», the «اسکن پاسخ‌برگ» button on every report part with تست ticked
(report page + timer finish form), and the same button on test rows of the period report.

    engine/keyScan.ts, engine/legacy.ts   scanning code copied verbatim from Pasokhbarg_Checker_v7.html (do not edit)
    engine/badges.ts                      pre-step for books that print the option digit LIGHT on a dark badge (white digit in a purple box): finds the badges and repaints them dark-on-white; only used when the plain read is poor
    engine/headers.ts                     pre/post-step for key tables with a printed header row (سؤال | پاسخ): the header is painted out and the page re-scanned; short columns (e.g. first column with one-digit numbers 1-9) get their missing rows back from the neighbouring column
    engine/pills.ts                       third fallback: question numbers printed white on dark capsules; each capsule is replaced by two dark boxes so the reader finds a number to pair the option digit with
    engine/index.ts, engine/keyPage.ts    typed doorway + the hand-correction layer on top of the key-photo reader
    model.ts                              keys (1 char per key), books, grading, scan records – pure, no DOM
    store.ts                              IndexedDB (+ localStorage fallback), instant book index, lazy key loading, import/export
    launch.ts                             openScan(ctx) / goToChecker() – how the rest of the app talks to the checker
    ScanFlow / SheetStep / ResultView     photo → corners → read → grade → write counts into the part
    KeyBuilder + readers                  create/edit a book: key-list photo, detailed-answers page, paste, tap grid
    SheetsTab / VirtualSheet              «پاسخ‌برگ‌های من»: my own answer sheets, kept without any key (see below)
    CheckerView                           library + my sheets + history section

A report part stores `scanId` (StudyBlock) pointing at the saved scan, so the period report can show the mistakes later.
No answer keys or sample photos ship with the app.

## My answer sheets (no key needed)

`SavedSheet` (model.ts) = the person's own answers, stored in its own IndexedDB store `sheets` (DB version 2) and included in the backup file.
It is created two ways: **virtual sheet** (VirtualSheet.tsx — tap the answers during the test, saved on every tap, stays «در حال آزمون» until finished,
with a timer) or **scan only** (`openScan({ sheetOnly: true })`, or «فقط ذخیره‌ی پاسخ‌برگ» in the normal scan flow).
Comparing is `openScan({ sheet })`: ScanFlow skips the photo step, grades the stored answers against any book and writes a normal history record;
the sheet remembers the last book, percent and `scanId`. The same sheet can be compared again with another key whenever wanted.


## v28 — scanner accuracy pass (low-resolution / faint / shaded key pages)

Problems fixed (test pages: Gaj capsules p.462, Batman key p.483, plus 5 others):

* **Crash on tiny digits** — the capsule/badge fallbacks enlarged an already-enlarged image a second time (out of memory). The
  fallbacks now pass `_up`, and `KeyScan.scan` / `prep.ts` cap every raster at 14 M pixels.
* **`prep.ts`** (new) — sharp Catmull-Rom enlargement + local contrast normalisation. Used only when the plain reading is not a clean table
  (`readingIsGood` in `index.ts`); the best attempt wins by `readingScore` (equal column lengths, no missing cells, most confident digits).
* **`lanes.ts`** (new) — `snapToLanes` (option digits of a column stand in one lane; a stray mark such as the thin leading «۱» of a number
  is replaced by the real digit), `reclassify` (re-cluster the 4 shapes afterwards) and `refineLow` (a digit the clustering could not decide,
  ratio > 0.8, is decided again against its nearest confident neighbours + width/height).
* **`headers.ts`** — `trimOverlong` drops a stray extra cell at the top/bottom of a column that is one longer than the rest.
* **`keyScan.ts`** (edited, was «do not edit») — a crisp thin bar (digit ۱) may be up to 99.5 % inked (was 95 %); `kmeans` exported; enlargement capped.
* **`pills.ts`** — `replacePills(..., hgHint)`.

Offline harness: `tools/keyscan-harness/` (run the real engine on photos, build per-class tile mosaics to check digits by eye).


## v29 — بانک تست (src/bank)

A second section of the planner: books of tests as **question packs** (`.qbank`, see `src/bank/pack.ts`) — every question is an image with its
correct answer. Import a pack (stored in IndexedDB «planex-bank», works offline), build an exam (range / random / previous mistakes, optional
instant feedback), answer on the image, and in the report open any wrong question's image. History of attempts is kept; the percentage uses
the Konkur rule (3 for right, −1 for wrong). Packs are made on a PC with `tools/qbank-builder`.
