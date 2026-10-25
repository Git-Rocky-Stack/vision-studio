# Vision Studio User Guide

How to install Vision Studio, get your models in place, make your first image,
and find your way around every workspace. For problems, see
[`TROUBLESHOOTING.md`](./TROUBLESHOOTING.md). The app carries a shorter guide of
its own under **Settings > User Guide**.

Vision Studio runs on your own computer. Generation uses your GPU (NVIDIA CUDA on
Windows and Linux, Metal on Apple Silicon), or the CPU, slowly, when there is no
GPU. Nothing is sent to a cloud service unless you add your own OpenRouter or
Hugging Face key and choose to route work there. There is no subscription and no
account to create.

## Contents

- [1. Install](#1-install)
- [2. First run: the model library](#2-first-run-the-model-library)
- [3. The Foundry: finding and managing models](#3-the-foundry-finding-and-managing-models)
- [4. Your first image](#4-your-first-image)
- [5. Hosted routes with your own key](#5-hosted-routes-with-your-own-key)
- [6. The workspaces](#6-the-workspaces)
- [7. Settings](#7-settings)
- [8. Keyboard shortcuts](#8-keyboard-shortcuts)
- [9. Privacy: what goes online](#9-privacy-what-goes-online)

## 1. Install

Download the build for your platform from
[vision-studio-x.com/download](https://vision-studio-x.com/download).

| Platform | Download | Requirements |
|----------|----------|--------------|
| Windows | `Vision-Studio-<version>-Setup.exe`, a small web installer (about 1 MB) that downloads the app package (about 2.6 GB) while it installs. A portable zip of the same size needs no install | Windows 10 or 11, x64 |
| macOS | `Vision-Studio-<version>-arm64.dmg` (about 530 MB) | Apple Silicon (M-series) and macOS 14 or later. There is no Intel build |
| Linux | `Vision-Studio-<version>-x86_64.AppImage` (about 3.3 GB) | x64, Ubuntu 22.04 or a distribution with the same glibc or newer |

Plan for the disk space the models need as well as the app: the full first-run
model set is about 137 GB (see [section 2](#2-first-run-the-model-library)).
8 GB of RAM is the minimum; 16 GB and an NVIDIA GPU with 8 GB or more of VRAM, or
an Apple M-series chip, are recommended.

### The installers are not yet code-signed

Your operating system will warn you the first time. This is expected and is not
a fault in the download.

- **Windows (SmartScreen).** "Windows protected your PC" appears. Click **More
  info**, then **Run anyway**. The installer then lets you choose the install
  folder and creates desktop and Start Menu shortcuts.
- **macOS (Gatekeeper).** Open the `.dmg` and drag Vision Studio to
  Applications. On macOS 15 or later, try to open the app once, then go to
  **System Settings > Privacy & Security** and click **Open Anyway**. On
  macOS 14, right-click the app and choose **Open**.
- **Linux.** Make the AppImage executable, then run it:
  `chmod +x Vision-Studio-<version>-x86_64.AppImage`. If it does not start,
  see [Linux: the AppImage will not start](./TROUBLESHOOTING.md#linux-the-appimage-will-not-start).

### The first start is slow

The AI engine (PyTorch, diffusers and the CUDA or Metal runtime) ships inside the
app as a single self-extracting program. It unpacks itself to a temporary folder
every time the app starts, which can take a few minutes, longest on the first
launch. While it unpacks, the status pill in the header reads **Backend warming**;
the Foundry header reads **Backend offline**. Give it time. If it still has not
started after several minutes, the app tells you so and offers the next steps -
see [Backend offline](./TROUBLESHOOTING.md#backend-offline).

## 2. First run: the model library

Once the engine is up, a **Welcome to Vision Studio** screen offers to install the
model library. It only appears while the library is incomplete, and only once the
engine has reported what is installed.

### What the first-run set contains

The set is 33 models, about 137 GB in total, every one installed from its pinned
upstream source and checked against its recorded hash before use:

- **Image:** Stable Diffusion 1.5, Stable Diffusion XL (base and refiner),
  Stable Diffusion 3.5 Large and Medium, FLUX.1 [schnell], plus the SD 1.5 and
  SDXL VAEs.
- **Video:** Stable Video Diffusion (image to video) and AnimateDiff.
- **ControlNet:** canny, depth, normal, OpenPose and scribble for SD 1.5; canny,
  depth, OpenPose and Union for SDXL; canny and depth for SD 3.5 Large; plus the
  MiDaS depth and NormalBAE annotators.
- **IP-Adapter** for SD 1.5 and SDXL, with their image encoders.
- **Edit tools:** U2-Net (background removal), Real-ESRGAN x4plus and its anime
  variant (upscale), GFPGAN v1.4 with RetinaFace and ParseNet (face
  enhancement).

The install button shows the remaining size in binary units, so a fresh install
reads **Install all models (128.0 GB)** - the same ~137 GB, counted in GiB.

### What is not included

Some models' licences do not let Vision Studio install them for you. They are
manual downloads through the Foundry (see
[Getting a model that is not in the set](#getting-a-model-that-is-not-in-the-set)):

- **FLUX.1 [dev]**, and the FLUX-only companions that depend on it: FLUX.1 Fill
  (inpainting), ControlNet Union for FLUX, and IP-Adapter for FLUX. These carry a
  non-commercial licence.
- **LTX Video** (text to video) and the **OpenPose annotator**, also under
  non-commercial licences.

Until you download them, features that need them stay disabled and say which
model is missing. Note that the Generate panel may start with FLUX.1 [dev] or
LTX Video selected; pick an installed model from the Model picker instead.

### The buttons on the setup screen

- **Install all models (size)** starts every download. It is disabled when the
  disk check finds too little free space.
- **Skip for now** closes the screen without downloading anything. You can come
  back to it from the Foundry at any time. Esc does the same.
- After you start, **Continue in background** closes the screen while downloads
  carry on; the header pill shows **Model provisioning in progress**. Each feature
  unlocks the moment its model is ready, so you can keep working.
- **Pause all** and **Resume all** stop and restart every download. A paused
  download keeps its partial files and resumes where it stopped.
- **Retry failed (n)** restarts the downloads that failed.
- **Cancel setup** asks first, then stops the downloads. Partial files are kept
  for resume and installed models stay installed.

### The disk check

Before you start, the screen compares the free space on the drive that holds
your models with what is left to download:

- "Disk check: ... free - enough for the remaining ..." - you are fine.
- "Space is tight" - less than 10% headroom. You can still install.
- "Not enough disk space: ... needed, only ... free" - **Install all** is
  disabled. Free up space, then click **Re-check**.

Every download also checks free space for itself, so a drive that fills up
part-way stops that download with an error rather than corrupting it.

### Gated models: Stable Diffusion 3.5

Stable Diffusion 3.5 Large and Medium are in the set but are gated on Hugging
Face: you need a free Hugging Face account, an access token, and to accept each
model's licence. The setup screen says so before you start.

1. Create a token on huggingface.co (Settings > Access Tokens; read access is
   enough).
2. In Vision Studio, open **Foundry** and paste it into **Hugging Face token** at
   the top, then click **Save**. "Saved" means it is stored encrypted and kept
   for the next launch; "Saved until you quit" means your system offers no
   encryption, so it is held in memory only.
3. When a gated model's row shows **Accept license**, click it. Your browser opens
   the model's page; accept the licence there, then return and retry: **Retry
   failed** on the setup screen, or, for a model you acquired from Discover,
   remove the failed job with **Cancel download** under **Library > Downloads**
   and acquire it again.

The Stability AI models install under the Stability AI Community License, which
is free for individuals and organizations under $1M annual revenue; the setup
screen links to it, and the full text of every model and dependency licence is
under **Settings > About**.

### Coming back later

The **Model library** card at the top of the Foundry is the way back to the set:
it shows how many models are installed and how much is left, with **Install
remaining**, **Open setup screen**, **Pause** / **Resume**, and **Verify and
repair** (re-hashes the installed files against the manifest and re-downloads
any that are corrupt).

## 3. The Foundry: finding and managing models

Open **Foundry** from the left navigation bar. The header shows the GPU the
engine detected and the token fields (**Hugging Face token**, **CivitAI token**).
Below the Model library card are three sections.

### Discover

Search Hugging Face or CivitAI (switch with the two buttons above the search
box), then **Acquire** a result to download it into your library. Each result
card shows:

- a **tier**: verified, compatible or experimental (hover it for the reason);
- downloads, likes, size and the licence;
- **security badges**: **Safetensors** (the safe format), **Pickle** and
  **Remote code** (both run code on your machine when the model loads), **Gated**
  (licence acceptance needed) and **NSFW**.

Acquiring a **Pickle** or **Remote code** model opens a consent dialog first
("Pickle checkpoint - security risk" or "Runs repository code"). The download
only starts if you choose **I understand, continue**; your choice is recorded in
the consent log. Only continue for publishers you trust, and prefer a
safetensors build when there is one.

On CivitAI, **Show mature (NSFW) results** is off by default and resets every
launch.

### Library

- **Downloads** lists the jobs in progress, with pause, resume and cancel.
- **Installed models** lists what you have. A pickle checkpoint offers a
  convert-to-safetensors action; any model can be removed.
- **Library roots** lets you use model folders you already have: pick a layout
  (**Generic**, **ComfyUI** or **Automatic1111**), click **Add folder**, then
  **Scan now**. Installs the app detects on your disk appear under **Detected
  installs** with an add button.

### Hardware

The detected GPU, VRAM total and free, system RAM, free disk, CUDA version and
compute capability, and a **Model fit** list that checks each installed model
against that hardware. Fit is shown as a coloured light and a label: a model fits,
fits with offloading (slower), or is over budget for your GPU. **Refresh** reads
the hardware again.

### Getting a model that is not in the set

1. **Foundry > Discover**, search Hugging Face (for example "FLUX.1-dev" or
   "LTX-Video").
2. **Acquire** the result. If it is gated, the card shows **Accept license**:
   accept it on Hugging Face (with your token saved in the Foundry header), remove
   the failed job under **Library > Downloads**, then acquire again.
3. When it shows **Installed**, it appears in the Generate panel's Model picker.

## 4. Your first image

1. Click **Generate** in the navigation bar. The settings dock has four modes
   along its top: **Generate** (the full panel), **Quick** (a minimal
   still-image panel), **Batch** (many prompts at once) and **Studio** (Prompt
   Studio, for refining a prompt).
2. In **Generate**, leave the **Workflow** switch on **Image**.
3. Type a prompt in the **Prompt** section. A negative prompt (what to avoid) is
   optional.
4. Under **Style + Model**, choose an installed model in the Model picker - for
   a first test, Stable Diffusion 1.5 is the fastest and lightest; SDXL and
   FLUX.1 [schnell] give better results and need more VRAM.
5. Under **Output**, choose an aspect ratio. Width and height follow it.
6. Click **Generate Image** at the bottom. The button becomes a progress bar
   showing the step count, with **Cancel** to stop the run.

Defaults, under **Advanced**: 25 sampling steps, CFG scale 7.5, scheduler
**Euler a**, CLIP skip 1, and seed **-1** (a new random seed each run). Type a
fixed seed to make a run repeatable; the dice button picks a random one. For
video: duration 5 s at 24 fps.

Before a local run the **Run Readiness** check at the bottom of the panel tells
you whether the model is installed and how it fits your GPU. If the run is
likely to run out of VRAM, the **over-budget dialog** opens instead of letting
it fail half-way - see [Over budget](#over-budget).

### Where results land

A finished image opens in the viewer in the centre of the window and is added to
**Assets**. Files are written to the output folder: by default `outputs` inside
the app's data folder, or the folder you choose under **Settings > General >
Default Output Location**. Images from a hosted route land in
`openrouter/<date>/` or `huggingface/<date>/` inside that folder and appear in
Assets with the rest.

### Video

Switch **Workflow** to **Video**. The Model picker then lists video models, and a
**Motion** section adds start and end frames and the duration and frame-rate
controls.

- **Stable Video Diffusion** animates a still image: attach a reference image
  under **Reference Inputs** first (the panel warns until you do).
- **AnimateDiff** works from a prompt.
- **LTX Video** works from a prompt, once you have downloaded it.

Clips are written as MP4.

### ControlNet, reference images and LoRA

- **ControlNet** guides (canny, depth, pose, scribble, normal) are layers on the
  **Canvas** tab's **Control** inspector. They work with SD 1.5, SDXL, SD 3.5
  Large and, once downloaded, FLUX.1 [dev].
- **Reference images** go under **Reference Inputs** (for this run, the active
  scene, or the whole project board). One reference layer runs image-to-image,
  controlled by **Denoising strength**; two or more condition the render through
  IP-Adapter (SD 1.5, SDXL, and FLUX.1 [dev] once downloaded).
- **LoRA**: install LoRAs through the Foundry, then stack them in the LoRA mixer
  under **Control Layers** (or **Motion** for video), each with its own weight.

If a guide or reference needs a model you do not have, the warning above the
Generate button names it, with a **Manage in Foundry** link.

### Quick, Batch and Studio

- **Quick** is a minimal still-image panel for fast drafts: prompt, negative
  prompt, model and aspect ratio, on the active account's still-image route. Its
  model may also start on FLUX.1 [dev]; choose an installed one.
- **Batch** takes one prompt per line (**Add Prompt**, or **Variations** for
  one-click variations of a prompt). Each prompt becomes its own job with the
  shared model, size and settings. **Cancel Batch** stops the run; results can be
  previewed, then **Export All** or **Delete All**.
- **Studio** (Prompt Studio) refines a prompt with **AI Enhance**,
  **Expand**, **Style Transfer** (adds a style's wording) and **Negative
  Suggest**. On the **Local** prompt provider, Enhance and Expand use built-in
  prompt heuristics on your machine; with an OpenRouter or Hugging Face prompt
  provider (section 5) they ask that model instead.

### Templates

**Story > Templates** offers eight starting points (YouTube thumbnail,
TikTok/Reels, Instagram post, stories, cinematic wide, product showcase, AI
portrait, 4K wallpaper) that set the size, prompt scaffold, steps and CFG for a
new project. The templates name FLUX.1 [dev] as their model; if you have not
downloaded it, choose another model before generating.

## 5. Hosted routes with your own key

Everything above runs locally. If you want to, you can bring your own OpenRouter
or Hugging Face key and send some work to a hosted model instead - for example
to keep making stills on a machine without a capable GPU. You pay the provider
directly; Vision Studio adds no charge.

All of this lives in **Settings > AI & Models > User Accounts & BYOK**.

### Accounts

An account here is a local profile, not an online login. Each one has its own
keys and provider choices. Use **New Account** to add one, the **Active account**
picker to switch, and **Remove** to delete one with its stored keys. The active
account decides how the rest of the app routes work.

### OpenRouter

1. Paste your key into **OpenRouter API Key** and click **Save Key**. Keys are
   encrypted with your operating system's secure storage and never shown again;
   paste a new one to replace it, or **Clear** it.
2. Click **Verify**. On success, **Key Usage** shows the live **Credit
   Remaining**, **Total Usage**, **BYOK Usage**, and **Tier & Expiry**
   (**Refresh Usage** updates them).
3. Choose a **Prompt model** (text models that support JSON output) and a **Still
   image model** (models that output images). **Refresh** reloads either list.

### Hugging Face

1. Paste an access token into **HuggingFace Inference Token** and click **Save
   Token**. The status line reads **Token stored**.
2. Choose a **Still image model** (FLUX.1 schnell or SDXL 1.0), a **Video model**
   (LTX-Video) and a **Prompt model** (Llama 3.1 8B Instruct).

The Hugging Face options in the provider pickers stay disabled until a token is
stored.

### Choosing what goes where

Three pickers decide, per account:

| Picker | Local | OpenRouter | HuggingFace |
|--------|-------|------------|-------------|
| **Prompt Enhancement Provider** | Built-in prompt heuristics, no key | The account's OpenRouter prompt model | The account's Hugging Face prompt model |
| **Still Image Provider** | The installed local models, with every canvas control | The account's hosted still-image model | The account's Hugging Face image model |
| **Motion / Video Provider** | The installed local video models | Not available - OpenRouter has no video | The account's Hugging Face video model |

### What stays local

A hosted still-image run sends the prompt, negative prompt, aspect ratio and
seed. Everything that depends on your canvas stays on the local engine:
ControlNet, inpainting, reference-image and other canvas-guided passes, the
Canvas AI tools, retakes, and timeline export. Hosted video is prompt-only.

**LoRA** is the one partial exception. On the Hugging Face still-image route,
exactly one FLUX LoRA hosted on the Hugging Face Hub can run, at weight 1.0.
Several LoRAs, other weights, LoRAs that exist only on your disk, and non-FLUX
LoRAs stay local, and OpenRouter takes no LoRA at all. The app tells you which
of these applies rather than dropping the LoRA silently.

A hosted still-image run does not need the local engine: with a verified key and
a model chosen, Generate, Quick, Batch and Workflow still-image runs keep working
while the backend is offline.

Requests to OpenRouter are retried after a rate limit or a temporary server
error. A request that times out is not sent again, so a slow hosted job is never
charged to you twice.

### Over budget

Before a local run, Vision Studio estimates whether the model fits your GPU. If
it does not, **This run is over your GPU budget** opens with:

- **Route to OpenRouter** / **Route to HuggingFace** - for each hosted provider
  the active account has set up for this kind of job;
- **Run locally anyway** - accept the risk of running out of memory;
- **Cancel**.

If no hosted provider can take the job, the dialog says so. Under **Over-Budget
Policy** in the same settings section you can pick a **Fallback provider** and
tick **Auto-route over-budget local jobs to the fallback provider** to skip the
question.

### Two different Hugging Face tokens

- The **Foundry's Hugging Face token** is for downloading models (including
  gated ones) to your machine. It is shared by every account.
- The **account's HuggingFace Inference Token** is for running models on Hugging
  Face's servers. It belongs to one account.

You can use the same Hugging Face token for both, but you have to save it in
both places.

## 6. The workspaces

The navigation bar on the left holds eight tabs: **Generate**, **Canvas**,
**Story**, **Workflows**, then **Assets**, **Collections**, **Foundry** and
**Settings**. Arrow keys move between them when the bar has focus.

### Canvas

The finishing surface for an image: layers, masks and AI passes. The canvas
works on the current image. To bring one in, open it in the viewer - a result
you just generated, or any image from **Assets** with **Open in viewer** - and
click **Send to Edit**. For a video, **Extract to Edit** takes the current frame.

- **Tool strip** (left): Move (V), Scale (T), Crop (C), Rotate (R); Brush (B),
  Eraser (E), Clone Stamp (S), Heal (J); Text (X), Shape (U), Pen (P); Hand (H),
  Zoom (Z), Eyedropper (I). Hover a tool to see its key. The keys work whenever
  the Canvas tab is open and you are not typing in a field.
- **Inspector** tabs: **Adjust** (exposure, contrast, colour and detail
  sliders), **Filters**, **Crop**, **Text**, **AI Tools**, **Control** (ControlNet
  layers) and **Region** (region locks and masks). On **Control** and **Region**
  the keys switch to the mask tools: V select, R rectangle, L polygon, B brush,
  E erase, I invert the mask.
- **AI Tools**: Background Removal (with an optional replacement background
  prompt), AI Upscale, Style Transfer (Van Gogh, Monet, Ukiyo-e, Comic,
  Watercolor, Pencil Sketch), Generative Fill, Face Enhancement, Object Removal
  and AI Expand. They run on the local engine.
- **Undo and redo**: Ctrl+Z / Cmd+Z undoes, Ctrl+Y / Cmd+Y or Ctrl+Shift+Z /
  Cmd+Shift+Z redoes. Undo restores your edit layers as they were - a removed
  layer comes back, a moved one returns to its place.
- **Zoom and pan**: + or = zooms in, - zooms out, 0 resets; scroll to zoom;
  Shift+drag or the middle mouse button pans. Right-click the image for a menu
  with Copy Image, Save As, Send to Edit, Open in Explorer, and a **Refine** list
  that runs any of your pipelines on the image.

### Story

**Story > Storyboard** lays a project out as scene cards: **Add Scene**, drag to
reorder, set the transition into the next scene, and attach scene and board
references, characters and elements. **Import Script** parses a pasted script
into a draft of scenes and elements for you to review before anything is added.
**Build Timeline** turns the approved
scenes into one clip each on a project sequence; **Send To Timeline** sends a
single scene.

### Timeline

The timeline under the viewer edits a sequence of clips on video and audio
tracks.

- Transport: Space plays and pauses; Home and End jump to the start and end of
  the range; the arrow keys step 250 ms (Shift: 1 s); Alt+arrow nudges the
  selected clip by one frame.
- Editing the selected clip: S splits it at the playhead, Ctrl+D / Cmd+D
  duplicates it, Delete or Backspace removes it (after a confirmation; the media
  stays in Assets). The same actions are buttons on the clip toolbar.
- **Add Clip** puts the selected media asset on the timeline; **Track** adds a
  track.
- **Mark In** / **Mark Out** set a play range that also limits export; **Clear
  Range** removes it.
- Audio clips have gain, fades and an offset, and are mixed into the export.
- **Toggle onion skin** ghosts the neighbouring scenes over the preview.
- **Retakes**: **Retake In** / **Retake Out** mark part of a clip, **Generate
  Retake** (in the clip inspector) makes a new take, and the compare view offers
  **Accept**, **Reject** and **Revert To Original**. Clips that were generated
  also offer **Regenerate In Place**, **Create Variant** and **Extend Shot**.
- **Export MP4** renders the sequence (or its range) to H.264 video with AAC
  audio. Export runs on the local engine, so it needs the backend running.

### Workflows

**Workflows > Workflows** is a node-graph editor. **Import graph** takes a
ComfyUI API-format graph; **Validate** shows the exact request a run would send
(prompt, model, size) and any problems; **Run Workflow** runs it on the built-in
engine; **Export ComfyUI JSON** hands it back to ComfyUI, and **Run on ComfyUI**
sends it to a ComfyUI server you run yourself. A graph with a single KSampler
runs as a normal generation, with its prompt, model, steps, CFG, seed and LoRAs.

**Workflows > Pipelines** builds reusable chains of post-processing steps for an
existing image - the built-ins are Upscale 4x, Face Restore, Denoise Clean,
Background Remove, Style Transfer and HDR Enhance. **Add Step**, then save or
duplicate the pipeline. Run one from the Canvas right-click menu, under
**Refine**.

### Assets and Collections

**Assets** lists every generated and imported file: search, filter by
**all / image / video / audio**, switch between grid and list, favourite, open
in the viewer, extract a video frame to edit, export or delete. **Import** copies
outside images, videos and audio into the library; the originals are not
touched.

**Export** copies a file to a folder you choose inside your Desktop, Documents,
Downloads, Pictures or Videos folder (or a folder below one of them). Any other
destination is refused, so the app can never be used to write elsewhere on your
disk.

**Collections** groups assets. **New Collection** creates a manual collection
that you fill yourself; the **All / Smart / Manual / Tagged / Untagged** filters
narrow the list.

### AI tagging

Assets are tagged with style, subject, colour and mood, derived from the prompt
you wrote - on your machine, with no cloud call and no extra model, and the same
every time. **Settings > AI & Models > AI Tagging Mode** decides when:

- **On Generation** - every new asset as it arrives;
- **Background Batch** - new assets queue and are tagged together when the app
  is idle;
- **On Demand** - only when you click **Analyze n untagged** on the Collections
  page;
- **Off**.

### AI Director

**Settings > AI & Models > AI Director (RAG)** grounds prompt enhancement in your
own material: **Your prior prompts**, **Your asset library** and a
**Model-prompting knowledge base**. Turn on **Enable retrieval-augmented
assist**, choose the sources, and use **Rebuild index** / **Clear index**. The
index lives on your machine. When prompt assist runs on OpenRouter or Hugging
Face, the excerpts it retrieved are sent to that provider with your prompt.

## 7. Settings

| Tab | What is there |
|-----|---------------|
| **General** | **Default Output Location** (**Browse**; changing it restarts the backend so new work goes to the new folder), **Auto Save**, **Backend Autostart**, **Storage Usage** with **Clear Cache** (removes cached generated assets in the app's internal output folder; custom output folders are kept) |
| **AI & Models** | GPU status, **Start Backend** when the backend is offline, **User Accounts & BYOK**, **Over-Budget Policy**, **AI Tagging Mode**, **AI Director (RAG)**, and **Installed Models** with **Manage in Foundry** |
| **Performance** | Acceleration: a master switch and Auto / On / Off for each optimization (SDPA, channels-last, torch.compile, attention slicing; quantization and TensorRT when their optional packages are present). After a local run it reports what was applied, skipped or fell back |
| **Appearance** | Theme: dark, light or system |
| **Notifications** | Desktop notifications for **Generation Complete**, **Generation Failed** and **Model Downloads** |
| **User Guide** | The in-app guide |
| **About** | Version, **Updates** (**Check for updates**, **Restart to update**), and the licence text for every model and bundled dependency |

Automatic updates only run in the installed app. Until releases are code-signed,
the updater will not install an update; download the new version from the
website instead.

## 8. Keyboard shortcuts

Press **?** anywhere (outside a text field) to show the shortcuts overlay; press
it again or Esc to close it.

| Where | Keys | Action |
|-------|------|--------|
| Anywhere | ? | Show or hide the shortcuts overlay |
| Anywhere | Esc | Close a dialog or cancel |
| Anywhere | Ctrl+Z / Cmd+Z | Undo |
| Anywhere | Ctrl+Y / Cmd+Y, or Ctrl+Shift+Z / Cmd+Shift+Z | Redo |
| Navigation bar | Arrow keys, Home, End | Move between workspace tabs |
| Canvas | V T C R | Move, Scale, Crop, Rotate |
| Canvas | B E S J | Brush, Eraser, Clone Stamp, Heal |
| Canvas | X U P | Text, Shape, Pen |
| Canvas | H Z I | Hand, Zoom, Eyedropper |
| Canvas | + or =, -, 0 | Zoom in, zoom out, reset zoom and pan |
| Canvas | Shift+drag, middle mouse button | Pan |
| Canvas | Scroll | Zoom |
| Canvas (Control and Region tabs) | V R L B E | Select, rectangle, polygon, brush, erase mask tools |
| Canvas (Control and Region tabs) | I | Invert the mask |
| Timeline | Space | Play or pause |
| Timeline | Home / End | Start / end of the range |
| Timeline | Left / Right | Step 250 ms (with Shift: 1 s) |
| Timeline | Alt+Left / Alt+Right | Nudge the selected clip one frame |
| Timeline | S | Split the selected clip at the playhead |
| Timeline | Ctrl+D / Cmd+D | Duplicate the selected clip |
| Timeline | Delete or Backspace | Delete the selected clip (asks first) |

Single-letter keys do nothing while you are typing in a text field.

The window also has the standard menu, where **View > Reload** (Ctrl+R /
Cmd+R) reloads the window. Unsaved canvas layers and the open Generate form are
lost when you do - see
[Reloading the window](./TROUBLESHOOTING.md#reloading-the-window-lost-my-work).

## 9. Privacy: what goes online

Vision Studio has no telemetry and no analytics. It connects to the internet
only for:

- **Model searches and downloads you start** - Hugging Face and CivitAI. Your
  Foundry tokens are sent to those hosts with the requests that need them.
- **The first-run model set**, if you install it - from each model's upstream
  host.
- **The automatic update check**, in the installed app - to
  `updates.vision-studio-x.com`.
- **Hosted routes you configure** - OpenRouter or Hugging Face receive the
  prompts (and, for AI Director, the retrieved excerpts) of the jobs you route
  there, plus the Verify, model-list and usage requests for your key.
- **Licence pages** - **Accept license** and the licence links open in your
  browser.

Everything else - generation on the local engine, canvas edits, tagging, the AI
Director index, your projects and assets - stays on your computer. The engine
listens only on `127.0.0.1` and requires a per-launch token, so other machines
on your network cannot reach it.

---

Problems? See [`TROUBLESHOOTING.md`](./TROUBLESHOOTING.md). Testing a release?
See [`UAT_CHECKLIST.md`](./UAT_CHECKLIST.md).
