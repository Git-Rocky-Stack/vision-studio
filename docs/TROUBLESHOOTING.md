# Troubleshooting

Fixes for the problems people most often hit, roughly in the order they meet
them. For how the app is meant to work, see the [User Guide](./USER_GUIDE.md).

- [Installing and launching](#installing-and-launching)
  - [Windows: "Windows protected your PC"](#windows-windows-protected-your-pc)
  - [macOS: the app "cannot be opened"](#macos-the-app-cannot-be-opened)
  - [Linux: the AppImage will not start](#linux-the-appimage-will-not-start)
- [Backend offline](#backend-offline)
- [GPU not detected](#gpu-not-detected)
- [Out of memory, and the over-budget dialog](#out-of-memory-and-the-over-budget-dialog)
- [Model downloads](#model-downloads)
  - [Gated models: 401 / 403, "is gated"](#gated-models-401--403-is-gated)
  - [Not enough disk space](#not-enough-disk-space)
  - [A model is missing from the picker](#a-model-is-missing-from-the-picker)
- [Hosted routes (OpenRouter, Hugging Face)](#hosted-routes-openrouter-hugging-face)
- [Exporting](#exporting)
- [Using an external ComfyUI](#using-an-external-comfyui)
- [Reloading the window lost my work](#reloading-the-window-lost-my-work)
- [Where the logs are](#where-the-logs-are)
- [Reporting a problem](#reporting-a-problem)

## Installing and launching

Vision Studio's installers are not yet code-signed, so every platform warns on
first launch. The warnings are expected.

### Windows: "Windows protected your PC"

SmartScreen blocks unsigned installers by default. Click **More info**, then
**Run anyway**. The web installer then downloads the app package (about 2.6 GB)
from `updates.vision-studio-x.com`; if that download fails, check your
connection and run the installer again, or use the portable zip instead.

### macOS: the app "cannot be opened"

- **macOS 15 or later:** try to open the app once, then open **System Settings >
  Privacy & Security**, scroll to the message about Vision Studio and click
  **Open Anyway**.
- **macOS 14:** right-click (or Control-click) the app in Applications and
  choose **Open**, then **Open** again.

Vision Studio needs Apple Silicon and macOS 14 or later. There is no Intel build:
PyTorch publishes no macOS x64 wheels for the version the app ships.

### Linux: the AppImage will not start

- Make it executable: `chmod +x Vision-Studio-<version>-x86_64.AppImage`.
- AppImages need FUSE 2. On Ubuntu 22.04 install `libfuse2`; on Ubuntu 24.04
  install `libfuse2t64`.
- The build is made on Ubuntu 22.04 and needs its glibc version or newer.

## Backend offline

The header pill reads **Backend offline** (or stays on **Backend warming**), the
Foundry header says **Backend offline**, or **Settings > AI & Models** shows
**AI Backend Offline**. Local generation, model downloads and timeline export
all need the backend.

1. **Wait for the unpack.** The bundled engine unpacks itself to a temporary
   folder every time the app starts. That can take several minutes, longest the
   first time and on a slow disk; antivirus scanning the unpacked files makes it
   slower. The app waits up to five minutes before it gives up and shows **Could
   not start the AI backend**.
2. **Start it by hand.** In **Settings > AI & Models**, click **Start Backend** in
   the **AI Backend Offline** box.
3. **Check Backend Autostart.** If the backend never starts on its own, check
   that **Settings > General > Backend Autostart** is on.
4. **Restart the app.** Close every Vision Studio window and start it again.
5. **Read the log.** `backend.log` (see [Where the logs are](#where-the-logs-are))
   records why the engine stopped.

If the dialog says **No backend executable was found**, the installation is
incomplete: reinstall the app.

When working from source, the backend comes from `backend/venv`; see
[`CONTRIBUTING.md`](../CONTRIBUTING.md#clone-and-install) to set it up. A venv
with only `requirements.txt` installed starts the backend but cannot generate.

## GPU not detected

**Settings > AI & Models** shows **GPU not detected** and **CPU mode, No CUDA**,
the Foundry header shows **CPU only**, or generation is very slow.

- **Windows and Linux** use NVIDIA GPUs through CUDA 12.1. Install a current
  NVIDIA driver (CUDA 12.1 needs driver 531 or newer on Windows, 530 or newer on
  Linux) and restart the app. AMD and
  Intel GPUs are not used; the engine falls back to the CPU.
- **macOS** uses the Apple Silicon GPU through Metal; there is no CUDA, so "No
  CUDA" is expected there.
- **Foundry > Hardware** shows what the engine detected. Click **Refresh** after
  changing drivers.
- Check that the **Performance** settings master switch is on (it is by
  default).

## Out of memory, and the over-budget dialog

Before a local run, Vision Studio estimates whether the model fits your GPU. If
it does not, **This run is over your GPU budget** opens:

- **Route to OpenRouter** / **Route to HuggingFace** sends the job to a hosted
  provider your active account has set up (see the
  [User Guide](./USER_GUIDE.md#over-budget)).
- **Run locally anyway** runs it, with the risk of running out of memory.
- **Cancel** stops.

If a run still fails with "CUDA out of memory":

- Use a smaller model (SD 1.5 instead of SDXL or FLUX); **Foundry > Hardware >
  Model fit** shows how each installed model fits.
- Lower the resolution (**Output** section) or the number of ControlNet and
  reference layers.
- Close other programs that use the GPU.
- The engine already retries a model load that runs out of memory, stepping down
  through fp16, CPU offload, VAE tiling and maximum attention slicing before it
  gives up.

## Model downloads

### Gated models: 401 / 403, "is gated"

A download fails with "Model '...' is gated. Accept the license at ..." and the
row shows **Accept license**. Stable Diffusion 3.5 and FLUX.1 [dev] are gated on
Hugging Face.

1. Make sure your Hugging Face token is saved: **Foundry**, **Hugging Face
   token**, **Save**. "Saved until you quit" means your system has no secure
   storage and the token is lost when the app closes.
2. Click **Accept license**, sign in to Hugging Face in your browser and accept the
   licence on the model page. The token must belong to the same Hugging Face
   account.
3. Retry: **Retry failed** on the setup screen, or remove the failed job under
   **Foundry > Library > Downloads** and acquire the model again.

A CivitAI download that answers 401 or 403 needs a CivitAI API key in **CivitAI
token**.

### Not enough disk space

The setup screen shows "Not enough disk space: ... needed, only ... free" and
**Install all** is disabled, or a download stops with a disk-space error. The
first-run set needs about 137 GB on the drive that holds your models (the app's
data folder). Free up space, then click **Re-check** on the setup screen, or
**Retry failed** / acquire again. Partial downloads are kept, so a resumed
download does not start over.

### A model is missing from the picker

- FLUX.1 [dev] and LTX Video are not part of the first-run set; download them
  from **Foundry > Discover**.
- **Foundry > Model library > Verify and repair** re-checks the installed files
  and re-downloads any that are corrupt.
- Models in another folder (a ComfyUI or Automatic1111 install, for example) can
  be added under **Foundry > Library > Library roots**: pick the layout, **Add
  folder**, **Scan now**.

## Hosted routes (OpenRouter, Hugging Face)

- **Verify fails, or Key Usage stays empty.** Check the key on openrouter.ai, then
  paste it again in **Settings > AI & Models > User Accounts & BYOK > OpenRouter
  API Key**, **Save Key**, **Verify**. Verify needs an internet connection.
- **The OpenRouter model lists are empty.** **Verify** first, then **Refresh**
  next to **Prompt model** or **Still image model**.
- **"Not set in Settings" on the Generate panel.** The account routes still images
  through OpenRouter but has no **Still image model** chosen.
- **The HuggingFace options are greyed out.** Save a token under **HuggingFace
  Inference Token** first. There is no Verify button for Hugging Face: a bad
  token shows up as an error on the first hosted job.
- **A hosted job is slow or times out.** It is not resent automatically, so you
  are not charged twice; run it again when the provider is responsive.
  OpenRouter calls are retried automatically only after a rate limit or a
  temporary server error.
- **ControlNet, references or canvas tools are disabled.** They only run on the
  local engine. Set **Still Image Provider** back to **Local**, or switch to an
  account that uses Local.
- **The backend is stopped.** Hosted still images still work with a verified key
  and a model chosen. Video on the local route, retakes and timeline export do
  not.

## Exporting

- **Timeline export fails with "The AI backend is not running."** Timeline export
  runs on the local engine, even for a sequence made of hosted stills. Start the
  backend (see [Backend offline](#backend-offline)) and export again.
- **Asset export fails with "Invalid destination path".** Exports may only be
  written inside your Desktop, Documents, Downloads, Pictures or Videos folder,
  or a folder below one of them. Choose a destination there.
- **"Refusing to open a path outside managed or export locations."** Open and
  Reveal work only on files in the app's output folders or in those same export
  folders.

## Using an external ComfyUI

The backend connects to a ComfyUI server at startup: `http://127.0.0.1:8188`, or
the address in the `COMFYUI_URL` **environment variable**. No `.env` file is
read; set the variable in the environment that starts Vision Studio, for example
`set COMFYUI_URL=http://192.168.1.20:8188` in a Windows command prompt before
running the app from it, or `COMFYUI_URL=http://192.168.1.20:8188 npm run dev`
from source.

- ComfyUI must already be running when the backend starts; start it first, then
  restart Vision Studio.
- While connected, plain image jobs and image-to-video jobs run on ComfyUI.
  Text-to-video, and image jobs with ControlNet, reference, inpaint or other
  canvas layers, stay on the built-in engine.
- The hand-off uses fixed checkpoint file names (for example
  `flux1-dev.safetensors`) and does not pass LoRAs; image-to-video always becomes
  ComfyUI's SVD-XT workflow (14 frames) without the model, prompt or duration.
- To keep every job on the built-in engine, start Vision Studio without ComfyUI
  running.

## Reloading the window lost my work

The window has the standard Electron menu, so **View > Reload** (Ctrl+R / Cmd+R)
and **Force Reload** reload the interface. A reload keeps your projects,
storyboards, timeline sequences, assets, collections, prompt history and
settings, but it drops what lives only in the open window: the canvas edit layers
and their undo history, and the prompt and settings in the open Generate and
Quick forms. A job that was already running keeps running in the backend and
writes its file to the output folder, but the reloaded window may not show its
progress. Avoid reloading while you have unsaved canvas work.

## Where the logs are

The backend writes `logs/backend.log` in the app's user-data folder:

| Platform | Folder |
|----------|--------|
| Windows | `%APPDATA%\vision-studio` |
| macOS | `~/Library/Application Support/vision-studio` |
| Linux | `~/.config/vision-studio` |

If that folder does not exist, look for one named `Vision Studio` in the same
place. The same folder holds the database (`data/vision_studio.db`), the models
(`models/`) and, unless you chose another folder, the outputs (`outputs/`).

To see the Electron shell's own messages, start the app from a terminal with
logging on:

```bash
# Windows
"Vision Studio.exe" --enable-logging
# macOS
"/Applications/Vision Studio.app/Contents/MacOS/Vision Studio" --enable-logging
# Linux
./Vision-Studio-<version>-x86_64.AppImage --enable-logging
```

Remove paths, tokens and keys before you share a log.

## Reporting a problem

Open an issue at
[github.com/Git-Rocky-Stack/vision-studio/issues](https://github.com/Git-Rocky-Stack/vision-studio/issues)
with your version (**Settings > About**), operating system, GPU, the steps that
reproduce it, and the relevant part of `backend.log`. Never attach a generated
image you would not want to be public. Security problems go to
[`SECURITY.md`](../SECURITY.md), never to a public issue.
