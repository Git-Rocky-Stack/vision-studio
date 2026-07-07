# Third-Party Licenses

Vision Studio's own source code is released under the MIT License (see `LICENSE.txt`). The application additionally bundles the runtime dependencies and provisions the AI models listed below; each retains its own license, linked here in accordance with its terms.

Models under the FLUX.1 [dev] non-commercial license, and other redistribution-restricted weights (e.g. OpenPose, LTX-Video), are NOT bundled - they remain optional, user-initiated installs through the in-app Foundry.

## Bundled AI Models

- **AnimateDiff** (`animatediff`) - [CreativeML Open RAIL-M License](https://huggingface.co/spaces/CompVis/stable-diffusion-license)
- **MiDaS Depth Annotator** (`annotator-midas`) - [MIT License](https://opensource.org/license/mit)
- **NormalBAE Annotator** (`annotator-normalbae`) - [CreativeML Open RAIL-M License](https://huggingface.co/spaces/CompVis/stable-diffusion-license)
- **ControlNet Canny (SD 1.5)** (`controlnet-canny-sd15`) - [Open RAIL-M License](https://www.licenses.ai/)
- **ControlNet Canny (SD 3.5 Large)** (`controlnet-canny-sd35`) - [Stability AI Community License](https://stability.ai/community-license-agreement) - Powered by Stability AI
- **ControlNet Canny (SDXL)** (`controlnet-canny-sdxl`) - [CreativeML Open RAIL++-M License](https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/blob/main/LICENSE.md)
- **ControlNet Depth (SD 1.5)** (`controlnet-depth-sd15`) - [Open RAIL-M License](https://www.licenses.ai/)
- **ControlNet Depth (SD 3.5 Large)** (`controlnet-depth-sd35`) - [Stability AI Community License](https://stability.ai/community-license-agreement) - Powered by Stability AI
- **ControlNet Depth (SDXL)** (`controlnet-depth-sdxl`) - [CreativeML Open RAIL++-M License](https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/blob/main/LICENSE.md)
- **ControlNet Normal (SD 1.5)** (`controlnet-normal-sd15`) - [Open RAIL-M License](https://www.licenses.ai/)
- **ControlNet OpenPose (SD 1.5)** (`controlnet-openpose-sd15`) - [Open RAIL-M License](https://www.licenses.ai/)
- **ControlNet OpenPose (SDXL)** (`controlnet-openpose-sdxl`) - [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0)
- **ControlNet Scribble (SD 1.5)** (`controlnet-scribble-sd15`) - [Open RAIL-M License](https://www.licenses.ai/)
- **ControlNet Union (SDXL)** (`controlnet-union-sdxl`) - [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0)
- **RetinaFace ResNet50 (face detection)** (`edit-face-detection`) - [MIT License](https://opensource.org/license/mit)
- **ParseNet (face parsing)** (`edit-face-parsing`) - [MIT License](https://opensource.org/license/mit)
- **GFPGAN v1.4** (`edit-gfpgan-v14`) - [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0)
- **Real-ESRGAN x4plus** (`edit-realesrgan-x4plus`) - [BSD 3-Clause License](https://opensource.org/license/bsd-3-clause)
- **Real-ESRGAN x4plus Anime** (`edit-realesrgan-x4plus-anime`) - [BSD 3-Clause License](https://opensource.org/license/bsd-3-clause)
- **U2-Net Background Removal** (`edit-u2net`) - [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0)
- **FLUX.1 [schnell]** (`flux-schnell`) - [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0)
- **IP-Adapter Image Encoder (CLIP ViT-L/14)** (`ip-adapter-encoder-clip-vit-l`) - [MIT License](https://opensource.org/license/mit)
- **IP-Adapter Image Encoder (ViT-H)** (`ip-adapter-encoder-vit-h`) - [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0)
- **IP-Adapter (SD 1.5)** (`ip-adapter-sd15`) - [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0)
- **IP-Adapter (SDXL)** (`ip-adapter-sdxl`) - [Apache License 2.0](https://www.apache.org/licenses/LICENSE-2.0)
- **Stable Diffusion 1.5** (`sd-1-5`) - [CreativeML Open RAIL-M License](https://huggingface.co/spaces/CompVis/stable-diffusion-license)
- **SD VAE FT MSE** (`sd-vae-ft-mse`) - [MIT License](https://opensource.org/license/mit)
- **Stable Diffusion 3.5 Large** (`sd3.5-large`) - [Stability AI Community License](https://stability.ai/community-license-agreement) - Powered by Stability AI
- **Stable Diffusion 3.5 Medium** (`sd3.5-medium`) - [Stability AI Community License](https://stability.ai/community-license-agreement) - Powered by Stability AI
- **Stable Diffusion XL Base** (`sdxl-base`) - [CreativeML Open RAIL++-M License](https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/blob/main/LICENSE.md)
- **Stable Diffusion XL Refiner** (`sdxl-refiner`) - [CreativeML Open RAIL++-M License](https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0/blob/main/LICENSE.md)
- **SDXL VAE** (`sdxl-vae`) - [MIT License](https://opensource.org/license/mit)
- **Stable Video Diffusion** (`svd`) - [Stability AI Community License](https://stability.ai/community-license-agreement) - Powered by Stability AI

## Required Attributions

- Powered by Stability AI

## Bundled Runtime Dependencies

### Python

- **PyTorch (torch, torchvision, torchaudio)** - [BSD-3-Clause](https://github.com/pytorch/pytorch/blob/main/LICENSE)
- **diffusers** - [Apache-2.0](https://github.com/huggingface/diffusers/blob/main/LICENSE)
- **transformers** - [Apache-2.0](https://github.com/huggingface/transformers/blob/main/LICENSE)
- **accelerate** - [Apache-2.0](https://github.com/huggingface/accelerate/blob/main/LICENSE)
- **peft** - [Apache-2.0](https://github.com/huggingface/peft/blob/main/LICENSE)
- **controlnet_aux** - [Apache-2.0](https://github.com/huggingface/controlnet_aux/blob/master/LICENSE.txt)
- **safetensors** - [Apache-2.0](https://github.com/huggingface/safetensors/blob/main/LICENSE)
- **huggingface_hub** - [Apache-2.0](https://github.com/huggingface/huggingface_hub/blob/main/LICENSE)
- **onnxruntime** - [MIT](https://github.com/microsoft/onnxruntime/blob/main/LICENSE)
- **spandrel** - [MIT](https://github.com/chaiNNer-org/spandrel/blob/main/LICENSE)
- **facexlib** - [Apache-2.0](https://github.com/xinntao/facexlib/blob/master/LICENSE)
- **numpy** - [BSD-3-Clause](https://github.com/numpy/numpy/blob/main/LICENSE.txt)
- **Pillow** - [MIT-CMU (HPND)](https://github.com/python-pillow/Pillow/blob/main/LICENSE)
- **opencv-python** - [Apache-2.0](https://github.com/opencv/opencv-python/blob/4.x/LICENSE.txt)
- **FastAPI** - [MIT](https://github.com/fastapi/fastapi/blob/master/LICENSE)
- **uvicorn** - [BSD-3-Clause](https://github.com/encode/uvicorn/blob/master/LICENSE.md)
- **pydantic** - [MIT](https://github.com/pydantic/pydantic/blob/main/LICENSE)

### JavaScript

- **Electron** - [MIT](https://github.com/electron/electron/blob/main/LICENSE)
- **React / React DOM** - [MIT](https://github.com/facebook/react/blob/main/LICENSE)
- **Vite** - [MIT](https://github.com/vitejs/vite/blob/main/LICENSE)
- **Zustand** - [MIT](https://github.com/pmndrs/zustand/blob/main/LICENSE)
- **Tailwind CSS** - [MIT](https://github.com/tailwindlabs/tailwindcss/blob/main/LICENSE)
- **Framer Motion** - [MIT](https://github.com/framer/motion/blob/main/LICENSE.md)
- **Konva / react-konva** - [MIT](https://github.com/konvajs/konva/blob/master/LICENSE)
- **lucide-react** - [ISC](https://github.com/lucide-icons/lucide/blob/main/LICENSE)
