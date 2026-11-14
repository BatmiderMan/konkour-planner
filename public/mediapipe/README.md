# Optional: a real face model for Beast mode (قوی‌تر از حالت پیش‌فرض)

Without these files Beast mode still works (it compares the picture with the empty room). With them it uses Google's
MediaPipe face detector, which also notices when your head is turned away. Put these files in this folder, exactly:

    public/mediapipe/vision_bundle.mjs                      (from the npm package @mediapipe/tasks-vision@0.10.14, folder root)
    public/mediapipe/wasm/vision_wasm_internal.js           (same package, folder wasm/)
    public/mediapipe/wasm/vision_wasm_internal.wasm
    public/mediapipe/wasm/vision_wasm_nosimd_internal.js
    public/mediapipe/wasm/vision_wasm_nosimd_internal.wasm
    public/mediapipe/blaze_face_short_range.tflite          https://storage.googleapis.com/mediapipe-models/face_detector/blaze_face_short_range/float16/1/blaze_face_short_range.tflite

Quick way (needs internet once):  npm pack @mediapipe/tasks-vision@0.10.14  → unzip → copy vision_bundle.mjs and the wasm/ folder.
If the files are missing the app tries a CDN, and if that fails too it silently uses the empty-room method.
