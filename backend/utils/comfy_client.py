"""
ComfyUI Client - Interface with ComfyUI server
"""

import asyncio
import json
import uuid
from typing import Any, Callable, Dict, List, Optional

import aiohttp

from .comfy_workflows import extract_history_image_outputs


class ComfyUIClient:
    """Client for communicating with ComfyUI server"""
    
    def __init__(self, server_address: str = "http://127.0.0.1:8188"):
        self.server_address = server_address.replace("http://", "").replace("https://", "")
        self.http_url = f"http://{self.server_address}"
        self.ws_url = f"ws://{self.server_address}/ws"
        self.client_id = str(uuid.uuid4())
        self.connected = False
        self.ws = None
        self._session: Optional[aiohttp.ClientSession] = None
    
    async def connect(self):
        """Connect to ComfyUI server"""
        try:
            self._session = aiohttp.ClientSession()
            
            # Test HTTP connection
            async with self._session.get(f"{self.http_url}/system_stats") as resp:
                if resp.status == 200:
                    print(f"✅ Connected to ComfyUI at {self.http_url}")
                    self.connected = True
                else:
                    raise ConnectionError(f"ComfyUI returned status {resp.status}")
            
            # Connect WebSocket for real-time updates
            self.ws = await self._session.ws_connect(
                f"{self.ws_url}?clientId={self.client_id}"
            )
            
            # Start WebSocket listener
            asyncio.create_task(self._ws_listener())
            
        except Exception as e:
            print(f"❌ Failed to connect to ComfyUI: {e}")
            self.connected = False
            raise
    
    async def disconnect(self):
        """Disconnect from ComfyUI"""
        self.connected = False
        if self.ws:
            await self.ws.close()
        if self._session:
            await self._session.close()
    
    async def _ws_listener(self):
        """Listen for WebSocket messages"""
        try:
            async for msg in self.ws:
                if msg.type == aiohttp.WSMsgType.TEXT:
                    data = json.loads(msg.data)
                    await self._handle_ws_message(data)
                elif msg.type == aiohttp.WSMsgType.ERROR:
                    print(f"WebSocket error: {self.ws.exception()}")
                    break
        except Exception as e:
            print(f"WebSocket listener error: {e}")
    
    async def _handle_ws_message(self, data: Dict):
        """Handle incoming WebSocket messages"""
        msg_type = data.get("type")
        
        if msg_type == "progress":
            # Generation progress update
            pass
        elif msg_type == "execution_start":
            print(f"Started execution: {data.get('data', {}).get('prompt_id')}")
        elif msg_type == "executing":
            node = data.get("data", {}).get("node")
            print(f"Executing node: {node}")
        elif msg_type == "executed":
            print(f"Executed: {data.get('data', {}).get('prompt_id')}")
    
    async def get_object_info(self, node_type: Optional[str] = None) -> Dict:
        """Get node object info"""
        url = f"{self.http_url}/object_info"
        if node_type:
            url += f"/{node_type}"
        
        async with self._session.get(url) as resp:
            if resp.status == 200:
                return await resp.json()
            raise RuntimeError(f"Failed to get object info: {resp.status}")
    
    async def upload_image(self, image_path: str, name: str = None) -> str:
        """Upload image to ComfyUI"""
        import aiofiles
        
        if name is None:
            name = image_path.split("/")[-1]
        
        async with aiofiles.open(image_path, 'rb') as f:
            image_data = await f.read()
        
        data = aiohttp.FormData()
        data.add_field('image', image_data, filename=name)
        data.add_field('type', 'input')
        data.add_field('overwrite', 'true')
        
        async with self._session.post(
            f"{self.http_url}/upload/image",
            data=data
        ) as resp:
            if resp.status == 200:
                result = await resp.json()
                return result.get("name")
            raise RuntimeError(f"Failed to upload image: {resp.status}")
    
    async def queue_prompt(self, workflow: Dict, extra_data: Dict = None) -> str:
        """Queue a workflow for execution"""
        prompt_data = {
            "prompt": workflow,
            "client_id": self.client_id
        }
        
        if extra_data:
            prompt_data["extra_data"] = extra_data
        
        async with self._session.post(
            f"{self.http_url}/prompt",
            json=prompt_data
        ) as resp:
            if resp.status == 200:
                result = await resp.json()
                return result.get("prompt_id")
            raise RuntimeError(f"Failed to queue prompt: {resp.status}")
    
    async def get_history(self, prompt_id: Optional[str] = None) -> Dict:
        """Get execution history"""
        url = f"{self.http_url}/history"
        if prompt_id:
            url += f"/{prompt_id}"
        
        async with self._session.get(url) as resp:
            if resp.status == 200:
                return await resp.json()
            raise RuntimeError(f"Failed to get history: {resp.status}")

    async def wait_for_prompt_completion(
        self,
        prompt_id: str,
        timeout_seconds: int = 600,
        poll_interval: float = 1.0,
        progress_callback: Optional[Callable[[float], None]] = None,
    ) -> List[Dict[str, str]]:
        start = asyncio.get_running_loop().time()

        while True:
            history = await self.get_history(prompt_id)
            outputs = extract_history_image_outputs(history, prompt_id)
            if outputs:
                if progress_callback:
                    progress_callback(95.0)
                return outputs

            if asyncio.get_running_loop().time() - start > timeout_seconds:
                raise TimeoutError(f"Timed out waiting for ComfyUI prompt {prompt_id}")

            if progress_callback:
                elapsed = asyncio.get_running_loop().time() - start
                progress_callback(min(90.0, 15.0 + elapsed * 2))

            await asyncio.sleep(poll_interval)
    
    async def get_image(self, filename: str, subfolder: str = "", folder_type: str = "output") -> bytes:
        """Get generated image"""
        params = {
            "filename": filename,
            "subfolder": subfolder,
            "type": folder_type
        }
        
        async with self._session.get(
            f"{self.http_url}/view",
            params=params
        ) as resp:
            if resp.status == 200:
                return await resp.read()
            raise RuntimeError(f"Failed to get image: {resp.status}")
    
    async def interrupt(self):
        """Interrupt current generation"""
        async with self._session.post(f"{self.http_url}/interrupt") as resp:
            return resp.status == 200
    
    async def free_memory(self, unload_models: bool = True, free_memory: bool = True):
        """Free VRAM"""
        data = {
            "unload_models": unload_models,
            "free_memory": free_memory
        }
        async with self._session.post(f"{self.http_url}/free", json=data) as resp:
            return resp.status == 200
    
    def create_flux_workflow(self, prompt: str, width: int = 1024, height: int = 1024, 
                            steps: int = 20, cfg: float = 1.0, seed: int = None) -> Dict:
        """Create a FLUX workflow"""
        if seed is None:
            import random
            seed = random.randint(0, 2**32 - 1)
        
        # Basic FLUX workflow (simplified)
        workflow = {
            "1": {
                "inputs": {"ckpt_name": "flux1-dev.safetensors"},
                "class_type": "CheckpointLoaderSimple"
            },
            "2": {
                "inputs": {"text": prompt, "clip": ["1", 1]},
                "class_type": "CLIPTextEncode"
            },
            "3": {
                "inputs": {"width": width, "height": height, "batch_size": 1},
                "class_type": "EmptyLatentImage"
            },
            "4": {
                "inputs": {
                    "seed": seed,
                    "steps": steps,
                    "cfg": cfg,
                    "sampler_name": "euler",
                    "scheduler": "simple",
                    "model": ["1", 0],
                    "positive": ["2", 0],
                    "negative": ["2", 0],
                    "latent_image": ["3", 0]
                },
                "class_type": "KSampler"
            },
            "5": {
                "inputs": {"samples": ["4", 0], "vae": ["1", 2]},
                "class_type": "VAEDecode"
            },
            "6": {
                "inputs": {"filename_prefix": "flux_output", "images": ["5", 0]},
                "class_type": "SaveImage"
            }
        }
        
        return workflow
    
    def create_sdxl_workflow(self, prompt: str, negative_prompt: str = "", 
                            width: int = 1024, height: int = 1024,
                            steps: int = 30, cfg: float = 7.5, seed: int = None) -> Dict:
        """Create an SDXL workflow"""
        if seed is None:
            import random
            seed = random.randint(0, 2**32 - 1)
        
        workflow = {
            "1": {
                "inputs": {"ckpt_name": "sdxl_base.safetensors"},
                "class_type": "CheckpointLoaderSimple"
            },
            "2": {
                "inputs": {"text": prompt, "clip": ["1", 1]},
                "class_type": "CLIPTextEncode"
            },
            "3": {
                "inputs": {"text": negative_prompt, "clip": ["1", 1]},
                "class_type": "CLIPTextEncode"
            },
            "4": {
                "inputs": {"width": width, "height": height, "batch_size": 1},
                "class_type": "EmptyLatentImage"
            },
            "5": {
                "inputs": {
                    "seed": seed,
                    "steps": steps,
                    "cfg": cfg,
                    "sampler_name": "dpmpp_2m",
                    "scheduler": "karras",
                    "model": ["1", 0],
                    "positive": ["2", 0],
                    "negative": ["3", 0],
                    "latent_image": ["4", 0]
                },
                "class_type": "KSampler"
            },
            "6": {
                "inputs": {"samples": ["5", 0], "vae": ["1", 2]},
                "class_type": "VAEDecode"
            },
            "7": {
                "inputs": {"filename_prefix": "sdxl_output", "images": ["6", 0]},
                "class_type": "SaveImage"
            }
        }
        
        return workflow
