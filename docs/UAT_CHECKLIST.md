# User Acceptance Test Checklist

The pass/fail matrix for a Vision Studio release candidate. Run it on the
packaged build users will download, not on `npm run dev`. Labels in **bold** are
the labels in the app; the [User Guide](./USER_GUIDE.md) describes each feature
and [`TROUBLESHOOTING.md`](./TROUBLESHOOTING.md) the known failure modes.

## Test run

| Field | Value |
|-------|-------|
| Build under test (version, artifact, SHA-256) | |
| Test dates | |
| Testers | |
| Machines (OS version, CPU, GPU, VRAM, RAM, free disk) | |

## How to record results

Each row has a column per configuration:

| Column | Configuration |
|--------|---------------|
| **Win GPU** | Windows 10/11 x64 with an NVIDIA GPU (8 GB+ VRAM) |
| **Win CPU** | Windows x64 with no NVIDIA GPU (CPU-only engine) |
| **Mac** | macOS 14 or later on Apple Silicon (Metal) |
| **Lnx GPU** | Linux x64 (Ubuntu 22.04 or 24.04) with an NVIDIA GPU |
| **Lnx CPU** | Linux x64 with no NVIDIA GPU |

Write one of:

- **P** - pass: every part of the expected result held.
- **F-<id>** - fail, with the defect ID (see [Logging defects](#logging-defects)).
- **B-<id>** - blocked by another defect; name it.
- **N/A** - does not apply to this configuration (say why in Notes if it is not
  obvious).

A row passes only if *every* expected outcome holds. Partial passes are fails.

On CPU-only machines generation is slow; use SD 1.5 at 512 x 512 and a low step
count, and record a pass when the result is correct, however long it takes.

Rows marked *(fixed in this release)* cover behaviour changed for this release;
give them extra attention.

## 1. Install and launch

| ID | Steps | Expected result | Win GPU | Win CPU | Mac | Lnx GPU | Lnx CPU |
|----|-------|-----------------|---------|---------|-----|---------|---------|
| INS-01 | Download the installer for the platform from vision-studio-x.com/download and check its SHA-256 against the published value | File downloads completely; hash matches | | | | | |
| INS-02 | Windows: run `Setup.exe`; on SmartScreen click **More info > Run anyway**; choose an install folder | Wizard runs; app package downloads; desktop and Start Menu shortcuts created | | | N/A | N/A | N/A |
| INS-03 | macOS: open the dmg, drag to Applications, open; on macOS 15+ allow under **System Settings > Privacy & Security > Open Anyway** (macOS 14: right-click > **Open**) | App opens after the one-time allow | N/A | N/A | | N/A | N/A |
| INS-04 | Linux: `chmod +x` the AppImage and run it | App window opens | N/A | N/A | N/A | | |
| INS-05 | First launch: time from window open to the header pill leaving **Backend warming** | Pill reaches a ready state (**GPU backend ready** / **CPU mode: backend ready**) within 5 minutes; record the time | | | | | |
| INS-06 | Quit and relaunch | Second launch reaches ready again; the last workspace tab is restored | | | | | |
| INS-07 | **Settings > About** | Version matches the build under test; licence text for models and dependencies is listed | | | | | |
| INS-08 | Windows: uninstall from Settings > Apps | Uninstaller removes the app and shortcuts | | | N/A | N/A | N/A |

## 2. First run and model provisioning

Run on a machine (or user account) that has never had Vision Studio installed.

| ID | Steps | Expected result | Win GPU | Win CPU | Mac | Lnx GPU | Lnx CPU |
|----|-------|-----------------|---------|---------|-----|---------|---------|
| FR-01 | Wait for the backend after first launch | **Welcome to Vision Studio** screen appears, showing **33 models**, the GPU line, the download size and a disk-check line | | | | | |
| FR-02 | Read **What installs, and under which terms** | Lists the integrity check, the pickle-format auto-consent, the Stability AI Community License link and the gated models (SD 3.5 Large, SD 3.5 Medium) | | | | | |
| FR-03 | On a drive with too little space (or simulate it), open the screen | "Not enough disk space" message; **Install all models** disabled; **Re-check** visible and updates the message after freeing space | | | | | |
| FR-04 | Click **Skip for now** | Screen closes; app usable; **Foundry** shows the **Model library** card with **Install remaining** and **Open setup screen** | | | | | |
| FR-05 | **Foundry > Open setup screen**, then press Esc | Screen reopens; Esc closes it | | | | | |
| FR-06 | Click **Install all models** | Overall progress bar, per-model rows with status and percent, speed and ETA | | | | | |
| FR-07 | Click **Continue in background** | Screen closes; header pill reads **Model provisioning in progress**; downloads continue | | | | | |
| FR-08 | **Pause all**, wait, **Resume all** (or **Pause** / **Resume** on the Foundry card) | Downloads stop and resume from where they stopped, not from zero | | | | | |
| FR-09 | Quit during a download and relaunch | Partially downloaded models resume; completed ones stay installed | | | | | |
| FR-10 | Without a Hugging Face token, let SD 3.5 Large download | Row fails with a gated message and shows **Accept license** | | | | | |
| FR-11 | Save a Hugging Face token in the Foundry header, accept the licence via **Accept license**, then **Retry failed** | SD 3.5 Large and Medium download and verify | | | | | |
| FR-12 | **Cancel setup** > **Stop downloads** | Confirmation shown first; downloads stop; installed models remain | | | | | |
| FR-13 | Complete the set | Card reads **All 33 models installed**; **Verify and repair** completes without errors | | | | | |
| FR-14 | Confirm FLUX.1 [dev], FLUX Fill, LTX Video and the OpenPose annotator are **not** in the set | They are absent from the setup list; features needing them say the model is missing | | | | | |

## 3. Foundry

| ID | Steps | Expected result | Win GPU | Win CPU | Mac | Lnx GPU | Lnx CPU |
|----|-------|-----------------|---------|---------|-----|---------|---------|
| FDY-01 | **Discover**, **Hugging Face**, search "sdxl" | Result cards with tier, downloads, likes, size, licence and security badges; **Previous** / **Next** paging works | | | | | |
| FDY-02 | Switch to **CivitAI**, search | Results load; **Show mature (NSFW) results** appears and is off; it is off again after a relaunch | | | | | |
| FDY-03 | Disconnect the network and search | Offline warning instead of an error or spinner that never ends | | | | | |
| FDY-04 | **Acquire** a safetensors result | Download starts with no consent dialog; card shows progress then **Installed**; it appears under **Library > Installed models** and in the Generate Model picker | | | | | |
| FDY-05 | **Acquire** a **Pickle** result; click **Cancel** in the dialog | "Pickle checkpoint - security risk" dialog; Cancel starts nothing | | | | | |
| FDY-06 | Repeat FDY-05 and click **I understand, continue** | Download starts | | | | | |
| FDY-07 | **Acquire** FLUX.1 [dev] from Hugging Face; accept the licence; retry | Gated failure with **Accept license** first; downloads after acceptance | | | | | |
| FDY-08 | **Library > Downloads**: pause, resume and cancel a download | Each control works and the row reflects it | | | | | |
| FDY-09 | Convert an installed pickle checkpoint to safetensors | Conversion completes; model still generates | | | | | |
| FDY-10 | Remove an installed model | Disappears from the library and the Model picker; disk space freed | | | | | |
| FDY-11 | **Library roots**: choose **ComfyUI**, **Add folder** (an existing ComfyUI models folder), **Scan now** | Its models appear in the library | | | | | |
| FDY-12 | **Hardware** | GPU name, VRAM, RAM, disk, CUDA and compute values match the machine (CPU-only: **No CUDA GPU detected**, **CPU only**); **Model fit** lists installed models with a fit label | | | | | |
| FDY-13 | Save a token so that the reply is **Saved**; relaunch | Token still applies after relaunch (gated download works without re-entering it) | | | | | |

## 4. Generate

| ID | Steps | Expected result | Win GPU | Win CPU | Mac | Lnx GPU | Lnx CPU |
|----|-------|-----------------|---------|---------|-----|---------|---------|
| GEN-01 | **Generate**, **Image**, model **Stable Diffusion 1.5**, prompt "a red apple on a wooden table", **Generate Image** | Progress shows **Step n/25**; image appears in the viewer and in **Assets**; file exists in the output folder | | | | | |
| GEN-02 | Same with **Stable Diffusion XL Base** | Image generated at the selected aspect ratio | | | | | |
| GEN-03 | Open **Advanced** before changing anything | Defaults: **Sampling Steps** 25, **CFG Scale** 7.5, **Scheduler** Euler a, **CLIP Skip** 1, **Seed** -1 | | | | | |
| GEN-04 | Set **Seed** to 12345; generate twice with identical settings | The two images are identical | | | | | |
| GEN-05 | Seed -1; generate twice | The two images differ | | | | | |
| GEN-06 | Start a generation; click **Cancel** | Run stops within a step or two; no result is added; the panel is ready for another run | | | | | |
| GEN-07 | Queue several jobs (e.g. a Batch of 4); cancel while some are still queued | Queued jobs never start; running job stops; none produce results | | | | | |
| GEN-08 | **Video**, **Stable Video Diffusion**, no reference image | Warning "Stable Video Diffusion requires a reference image before launch." | | | | | |
| GEN-09 | Attach a reference image under **Reference Inputs**; generate SVD | MP4 clip generated and playable | | | | | |
| GEN-10 | **Video**, **AnimateDiff**, prompt only | MP4 clip generated; duration and frame rate follow **Duration** / **Frame Rate** | | | | | |
| GEN-11 | **Canvas > Control**: add a canny or depth layer from an image; return to Generate and generate with SDXL | Output follows the guide's structure; **Pass Notices** (if any) are shown | | | | | |
| GEN-12 | Add two reference layers; generate with SD 1.5 or SDXL | Render is conditioned on the references (IP-Adapter) | | | | | |
| GEN-13 | One reference layer, **Denoising strength** 0.3, then 0.9 | Low strength stays close to the reference; high strength departs from it | | | | | |
| GEN-14 | Install a LoRA via the Foundry; add it in **Control Layers** with weight 0.8; generate | LoRA effect visible; weight respected | | | | | |
| GEN-15 | Pick a model that is over budget for the GPU (e.g. SD 3.5 Large on 8 GB) | **This run is over your GPU budget** dialog with **Run locally anyway**, **Cancel**, and a **Route to ...** button only for providers that are set up | | | | | |
| GEN-16 | Leave the model on FLUX.1 [dev] without it installed | **Run Readiness** reports the missing model; nothing crashes | | | | | |
| GEN-17 | **Quick**: prompt, installed model, aspect ratio, generate | Image generated and added to Assets | | | | | |
| GEN-18 | **Batch**: three prompts, one per line; run | Three jobs, results in prompt order; **Export All** and **Delete All** work | | | | | |
| GEN-19 | **Batch**: **Variations** on a prompt | Variations added as separate prompts | | | | | |
| GEN-20 | **Batch**: start, then **Cancel Batch** | Running and queued prompts stop | | | | | |
| GEN-21 | **Studio**, provider **Local**: **AI Enhance** and **Expand** on a short prompt *(fixed in this release)* | Both return a rewritten, longer prompt without any key configured | | | | | |
| GEN-22 | **Studio**: **Negative Suggest**, **Style Transfer** | Negative prompt suggested; style wording added to the prompt | | | | | |
| GEN-23 | **Story > Templates**: apply a template | Size, prompt scaffold, steps and CFG set for a new project | | | | | |
| GEN-24 | Notifications on: generate with the app in the background | Desktop notification on completion; with **Generation Complete** off, none | | | | | |

## 5. Hosted routes (BYOK)

Needs an OpenRouter key with credit and a Hugging Face token with inference
access. Record the provider charges each row incurs.

| ID | Steps | Expected result | Win GPU | Win CPU | Mac | Lnx GPU | Lnx CPU |
|----|-------|-----------------|---------|---------|-----|---------|---------|
| BYO-01 | **Settings > AI & Models > User Accounts & BYOK**: **New Account**, rename it, switch with **Active account** | Account created, renamed and selected; the other account's settings are untouched | | | | | |
| BYO-02 | Paste an OpenRouter key, **Save Key**, **Verify** | Success banner; **Key Usage** shows **Credit Remaining**, **Total Usage**, **BYOK Usage**, **Tier & Expiry**; key field is empty afterwards | | | | | |
| BYO-03 | **Verify** with an invalid key | Clear error; nothing else changes | | | | | |
| BYO-04 | **Refresh** both OpenRouter model lists; choose a **Prompt model** and a **Still image model** | Lists populate; choices persist across relaunch | | | | | |
| BYO-05 | **Still Image Provider: OpenRouter**; generate from Generate, Quick and Batch | Panel shows **OpenRouter Still Image Route**; images land in `openrouter/<date>/` and in Assets | | | | | |
| BYO-06 | With OpenRouter selected, look at ControlNet and LoRA controls | Canvas-guided controls are local-only; a LoRA is reported as unsupported on OpenRouter, not silently dropped | | | | | |
| BYO-07 | Save a Hugging Face token under **HuggingFace Inference Token**; set **Still Image Provider: HuggingFace**, model FLUX.1 schnell; generate | **Token stored**; image generated in `huggingface/<date>/` | | | | | |
| BYO-08 | **Motion / Video Provider: HuggingFace**, model LTX-Video; generate a video | MP4 generated; OpenRouter is disabled in this picker | | | | | |
| BYO-09 | HuggingFace route with exactly one FLUX Hub LoRA at weight 1.0; then with two LoRAs | One LoRA runs; two are refused with an explanation | | | | | |
| BYO-10 | **Prompt Enhancement Provider: OpenRouter**, then **HuggingFace**; **AI Enhance** in Studio | Enhanced prompt comes from the chosen provider | | | | | |
| BYO-11 | Stop the backend (quit the backend process, or test before it is ready); generate a still on OpenRouter | Hosted still generates while the backend is offline | | | | | |
| BYO-12 | Backend stopped: try a local video, a retake and a timeline export | Each is refused with a backend-offline message | | | | | |
| BYO-13 | Simulate a timeout on a hosted job (throttle the network so the request times out) *(fixed in this release)* | Job fails once; it is not resent; the provider shows a single charge | | | | | |
| BYO-14 | **Over-Budget Policy**: **Fallback provider** OpenRouter and **Auto-route over-budget local jobs** on; run an over-budget local job | Routes to OpenRouter without the dialog | | | | | |
| BYO-15 | **Remove** an account | Confirmation; account and its stored key gone | | | | | |

## 6. Canvas

Load an image first: open it in the viewer and click **Send to Edit**.

| ID | Steps | Expected result | Win GPU | Win CPU | Mac | Lnx GPU | Lnx CPU |
|----|-------|-----------------|---------|---------|-----|---------|---------|
| CAN-01 | Click each tool in the tool strip | Each tool activates; its tooltip shows its key | | | | | |
| CAN-02 | On the Canvas tab, press V T C R B E S J X U P H Z I in turn, focus outside any text field *(fixed in this release)* | Each key selects Move, Scale, Crop, Rotate, Brush, Eraser, Clone Stamp, Heal, Text, Shape, Pen, Hand, Zoom, Eyedropper | | | | | |
| CAN-03 | Type the same letters into a text field (e.g. the Text inspector) | Letters are typed; the tool does not change | | | | | |
| CAN-04 | + / = / - / 0, scroll, Shift+drag, middle-drag | Zoom in, out, reset; scroll zooms; both drags pan | | | | | |
| CAN-05 | Add a text layer, move a layer, delete a layer; then Ctrl+Z / Cmd+Z three times *(fixed in this release)* | Each undo restores the previous layer state: the deleted layer returns, the moved layer goes back, the text layer is removed | | | | | |
| CAN-06 | After CAN-05, Ctrl+Y / Cmd+Y, then Ctrl+Shift+Z / Cmd+Shift+Z *(fixed in this release)* | Each redo reapplies the next change | | | | | |
| CAN-07 | **Adjust**: move exposure, contrast, saturation | Image updates live | | | | | |
| CAN-08 | **Filters**, **Crop**, **Text** inspector tabs | Each applies to the image or layer | | | | | |
| CAN-09 | **Region**: create a region lock; press V R L B E I | Mask tools switch to select, rectangle, polygon, brush, erase; I inverts the mask | | | | | |
| CAN-10 | **AI Tools > Background Removal** | Background removed on a new result | | | | | |
| CAN-11 | **AI Upscale** (2x and 4x), **Face Enhancement** on a portrait | Larger image; restored face | | | | | |
| CAN-12 | **Generative Fill** and **Object Removal** with a mask | Masked area filled / object removed | | | | | |
| CAN-13 | **AI Expand** in one direction; **Style Transfer** with a preset | Canvas extended; style applied | | | | | |
| CAN-14 | Right-click the image: **Copy Image**, **Save As...**, **Open in Explorer**, a **Refine** pipeline | Each acts on the current image | | | | | |
| CAN-15 | **Clone Stamp (S)**: paint without a source; then Alt+click a source and paint two strokes *(new in this release)* | First stroke shows "Alt+click the image to set a clone source first." and paints nothing; then the source is copied, and the second stroke keeps the same offset (the source marker follows the brush) | | | | | |
| CAN-16 | **Heal (J)** with no source: paint over a blemish or dust spot *(new in this release)* | The spot is replaced by matching nearby texture, with no visible seam or colour shift | | | | | |
| CAN-17 | **Heal** after Alt+clicking a source; vary Size, Hardness and Opacity; press [ and ] *(new in this release)* | Texture comes from the source, colour from around the stroke; the brush ring resizes with [ and ] | | | | | |
| CAN-18 | After CAN-15 to CAN-17: Ctrl+Z through the strokes, Before/After, **Clear retouching**, then **Export** *(new in this release)* | Each undo removes one stroke; Before/After shows the original; Clear removes all; the exported PNG carries the retouching | | | | | |
| CAN-19 | **Shape (U)**: draw a rectangle, an ellipse (Shift), a line (Shift) and an arrow; toggle Fill, change the outline colour and width with one selected *(new in this release)* | Each is its own layer in Layers; Shift squares or snaps to 45 degrees; the selected shape restyles | | | | | |
| CAN-20 | **Pen (P)**: click four points and click the first again; then draw an open path and press Enter; then Backspace and Esc on a third *(new in this release)* | A closed, fillable path layer; an open path layer; Backspace removes the last point and Esc cancels | | | | | |
| CAN-21 | Move, scale and rotate a shape and a path; hide, lock, reorder and delete their layers; Export *(new in this release)* | Transforms stick and undo; layer controls behave as for text; the export matches the canvas | | | | | |

## 7. Story and Timeline

| ID | Steps | Expected result | Win GPU | Win CPU | Mac | Lnx GPU | Lnx CPU |
|----|-------|-----------------|---------|---------|-----|---------|---------|
| STY-01 | **Story > Storyboard**: **Add Scene** three times; edit prompts; drag to reorder | Scenes created, edited, reordered | | | | | |
| STY-02 | **Import Script**: paste a short script; review the draft; commit | Draft lists scenes and elements; committing appends the accepted ones | | | | | |
| STY-03 | Add scene and board references; assign a character | References and character attach to the scene / project | | | | | |
| STY-04 | **Build Timeline**; then **Send To Timeline** on one scene | One clip per approved scene in order; single scene appended | | | | | |
| TL-01 | Select the timeline; press Space twice | Playback starts and stops | | | | | |
| TL-02 | Left / Right, Shift+Left / Shift+Right, Home, End | Playhead moves 250 ms, 1 s, to start, to end | | | | | |
| TL-03 | Select a clip; Alt+Left / Alt+Right | Clip moves one frame earlier / later | | | | | |
| TL-04 | Select a clip; press S | Clip splits at the playhead | | | | | |
| TL-05 | Select a clip; Ctrl+D / Cmd+D | Clip duplicated | | | | | |
| TL-06 | Select a clip; Delete (and Backspace) | Confirmation; clip removed; its media remains in Assets | | | | | |
| TL-07 | **Mark In**, move, **Mark Out**; play; **Clear Range** | Playback limited to the range; cleared afterwards | | | | | |
| TL-08 | **Track** to add an audio track; add an audio asset with **Add Clip**; set gain and fades | Audio plays in preview with gain and fades | | | | | |
| TL-09 | **Export MP4** with a range set and an audio clip | MP4 covers only the range; contains H.264 video and AAC audio; **Open** and **Reveal** work | | | | | |
| TL-10 | **Retake In** / **Retake Out** on a generated clip; **Generate Retake**; compare; **Accept**; then repeat and **Revert To Original** | Take generated and compared; Accept replaces the clip in playback and export; Revert restores the original | | | | | |
| TL-11 | **Regenerate In Place**, **Create Variant**, **Extend Shot** on a generated clip | Each produces a new take for the clip | | | | | |
| TL-12 | **Toggle onion skin** | Neighbouring scenes ghost over the preview | | | | | |

## 8. Workflows and Pipelines

| ID | Steps | Expected result | Win GPU | Win CPU | Mac | Lnx GPU | Lnx CPU |
|----|-------|-----------------|---------|---------|-----|---------|---------|
| WF-01 | **Workflows**: open a saved workflow; **Validate** | Resolved prompt, model and size shown; issues listed if any | | | | | |
| WF-02 | **Run Workflow** | Result in the viewer, Assets and the run rail | | | | | |
| WF-03 | **Import graph**: paste a ComfyUI API-format graph with one KSampler | Imported; runs as a normal generation with its prompt, model, steps, CFG, seed and LoRAs | | | | | |
| WF-04 | Import a graph with an unsupported node | **Unsupported nodes** listed; run disabled with a reason | | | | | |
| WF-05 | **Export ComfyUI JSON** | JSON produced; loads in ComfyUI | | | | | |
| WF-06 | With OpenRouter still images and the backend stopped, run a still-image workflow | Runs on the hosted route | | | | | |
| PL-01 | **Workflows > Pipelines**: open a built-in; **Add Step**; save; **Duplicate pipeline** | Steps added; pipeline saved; duplicate created; built-in unchanged | | | | | |
| PL-02 | Run a pipeline from the Canvas right-click **Refine** menu | Result lands as a new asset | | | | | |

## 9. Assets and Collections

| ID | Steps | Expected result | Win GPU | Win CPU | Mac | Lnx GPU | Lnx CPU |
|----|-------|-----------------|---------|---------|-----|---------|---------|
| AST-01 | **Assets**: search; filter **image / video / audio**; grid and list view | Each narrows or re-lays the list correctly | | | | | |
| AST-02 | **Import** an image, a video and an audio file | All three appear; originals unchanged on disk | | | | | |
| AST-03 | Favourite, **Open in viewer**, **Extract frame to edit** (video) | Each works | | | | | |
| AST-04 | **Export asset** to Desktop, Documents, Downloads, Pictures and Videos | File written to each | | | | | |
| AST-05 | **Export asset** to a folder outside those (e.g. `C:\` or `/tmp`) | Refused with "Invalid destination path"; nothing written | | | | | |
| AST-06 | **Delete asset** | Removed from the library; it no longer appears in collections or the viewer | | | | | |
| COL-01 | **Collections > New Collection**; add assets; rename | Manual collection holds the assets | | | | | |
| COL-02 | **All / Smart / Manual / Tagged / Untagged** filters; search | Filters narrow the list | | | | | |
| COL-03 | **AI Tagging Mode: On Demand**; generate; **Analyze n untagged** | Count shown; tags added after Analyze | | | | | |
| COL-04 | **On Generation**, **Background Batch**, **Off** in turn | Tagged immediately, tagged in a batch when idle, never tagged | | | | | |

## 10. Settings

| ID | Steps | Expected result | Win GPU | Win CPU | Mac | Lnx GPU | Lnx CPU |
|----|-------|-----------------|---------|---------|-----|---------|---------|
| SET-01 | **General > Default Output Location > Browse**, choose a new folder | Backend restarts; next generation is written to the new folder; earlier assets still open | | | | | |
| SET-02 | **Backend Autostart** off; relaunch; **AI & Models > Start Backend** | Backend does not start by itself; Start Backend starts it | | | | | |
| SET-03 | **Clear Cache** | Confirmation; internal cache cleared; custom output folder untouched | | | | | |
| SET-04 | **Performance**: master switch and Auto / On / Off; generate locally | Panel reports what was applied, skipped or fell back | | | | | |
| SET-05 | **Appearance**: dark, light, system | Theme switches at once and persists across relaunch | | | | | |
| SET-06 | **Notifications**: each toggle off, then trigger the event | No desktop notification for a disabled event | | | | | |
| SET-07 | **AI Director (RAG)**: enable, choose sources, **Rebuild index**, **Clear index** | Indexed count changes; Studio reports the context it used | | | | | |
| SET-08 | **About > Check for updates** on the packaged build | A status line reports the check result; no crash. (Unsigned builds do not install updates) | | | | | |
| SET-09 | **User Guide** tab | In-app guide renders | | | | | |

## 11. Accessibility

| ID | Steps | Expected result | Win GPU | Win CPU | Mac | Lnx GPU | Lnx CPU |
|----|-------|-----------------|---------|---------|-----|---------|---------|
| A11Y-01 | Press ? outside a text field; press ? again, then Esc | Shortcuts overlay opens and closes | | | | | |
| A11Y-02 | After launch, press Tab once | **Skip to main content** link appears and moves focus to the main content | | | | | |
| A11Y-03 | Keyboard only: navigate tabs with the arrow keys, generate an image, open Settings and change the theme, open and close a dialog | Everything reachable; focus always visible; dialogs trap focus and return it on close | | | | | |
| A11Y-04 | Turn on the OS reduce-motion setting; use the app | Animations are removed or reduced | | | | | |
| A11Y-05 | Screen reader (NVDA, VoiceOver or Orca) on the Generate panel and Settings | Controls have meaningful names; progress is announced | | | | | |
| A11Y-06 | Light theme: check text contrast on the main panels | Text readable; no low-contrast labels | | | | | |

## Logging defects

Log every failure as a GitHub issue at
[github.com/Git-Rocky-Stack/vision-studio/issues](https://github.com/Git-Rocky-Stack/vision-studio/issues)
(security issues: privately, per [`SECURITY.md`](../SECURITY.md)) and put its
number in the result cell as **F-#123**. Each issue carries:

- **Title**: `[UAT <row ID>] <what went wrong>`, e.g. `[UAT CAN-05] Undo does not restore a deleted layer`.
- **Build**: version, artifact and SHA-256 from the test-run table.
- **Configuration**: OS version, GPU and driver, VRAM, RAM.
- **Steps to reproduce**, **expected** and **actual** result.
- **Evidence**: screenshot or screen recording, and the relevant part of
  `backend.log` (see [Where the logs are](./TROUBLESHOOTING.md#where-the-logs-are)),
  with tokens, keys and personal paths removed. Do not attach generated images
  you would not want public.
- **Severity**:

| Severity | Meaning | Examples |
|----------|---------|----------|
| **S1 - Critical** | Data loss, security issue, crash on launch, or a core flow impossible on a platform | Install fails; app will not start; local image generation fails for every model; a consent gate can be bypassed |
| **S2 - Major** | A feature fails with no reasonable workaround | Timeline export fails; undo loses layers; a hosted job is billed twice |
| **S3 - Minor** | A feature fails with a workaround, or behaves wrongly in an edge case | A shortcut does not work but the button does; a wrong label |
| **S4 - Cosmetic** | Visual or copy problems with no functional effect | Misalignment, typo, contrast slightly low |

Retest each fixed defect on the configuration where it failed, on the new build,
and re-run the rows it could affect.

## Exit criteria

The release candidate may ship when all of the following hold:

1. Every row has a result in every applicable column; no cell is empty.
2. No open S1 or S2 defects.
3. Every S3 defect is either fixed or accepted in writing by the release owner,
   with a note in the release notes where users could notice it.
4. Sections 1 and 2 (install, launch, first run) pass on every configuration.
5. GEN-01, GEN-04, GEN-06, GEN-09 or GEN-10, TL-09, AST-04 and AST-05 pass on
   every configuration.
6. Every row marked *(fixed in this release)* passes on every configuration.
7. The automated gates are green on the release commit: `npm run typecheck`,
   `npm test`, `npm run build`, and the backend `python -m pytest`.
8. The release owner signs off below.

| Role | Name | Date | Decision |
|------|------|------|----------|
| Release owner | | | Ship / Do not ship |
| QA lead | | | |
