# حالت بیست (Beast mode)

Code: `src/beast/` · tests: `tools/beast-tests/` · hooks into `livePlan.ts`, `LiveTimer.tsx`, `FocusGuard.tsx`, `App.tsx`, `SettingsHub.tsx`.

- **Contract**: floating 🔥 chip → sign today/tomorrow by pressing and holding. The planner's cards become fixed parts (snapshot, so editing/deleting a card does not escape it).
- **Exact clock**: a part starts at its minute and ends at its minute (`beastEngine.tick`, timestamp based). Late = those seconds are lost. No pause, no +5 min, no cancel; only limited excused breaks and a forfeit button.
- **Camera (on device)**: `presence.ts` picks the best available way: MediaPipe face model (drop the files in `public/mediapipe/`, see its README; also notices a turned head) → the browser's `FaceDetector` → **empty-room comparison** (no model: you step out of frame once so it learns the room, then sit; works for any skin tone / wall colour). The contract sheet shows a live readout (method, state, size %, fps) and a box over the preview so you can see what it sees. Pictures are never stored or sent (silhouette mode keeps an 80×60 picture of the empty room on this device only). Camera unavailable → unverified time earns 50%.
- **Credit**: present time + half of unverified; leaving shorter than the grace period is forgiven, longer counts from the moment of leaving. The block put in the report starts when the part was due and lasts as long as the credited time. A card is ticked done at ≥ `doneAtPct`.
- **Pressure**: 60 s countdown, soft chime → alarm → full-screen «برگرد» overlay, streak of days ≥ `minPct`, end-of-day verdict.
- **Storage**: `planex_beast_v1` (settings, streak, history: synced + backed up) and `planex_beast_run_v1` (live accounting: this device only).
- Not possible in a web app: blocking other apps or the network (see the native-app discussion).
