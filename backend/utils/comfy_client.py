"""
ComfyUI Client - Interface with ComfyUI server

Connection lifecycle
--------------------
ComfyUI is optional and runs as a separate process the user may start, stop or
restart at any time. The client therefore never assumes the startup connection
is the only one:

- ``ensure_connected()`` reconnects on demand right before a job is queued, so
  a ComfyUI started after the backend is picked up by the next job. Failed
  on-demand attempts are rate limited (``ON_DEMAND_RETRY_SECONDS``) so a job
  arriving while ComfyUI is down does not pay the connect timeout every time.
- ``start_reconnect_loop()`` runs a background task that reconnects with
  exponential backoff (``RECONNECT_BACKOFF_*``) whenever the WebSocket drops;
  ``disconnect()`` stops it, so shutdown never leaves a task behind.

Progress
--------
ComfyUI streams ``progress`` messages (``{"value", "max", "prompt_id"}``) over
the WebSocket for the client id that queued the prompt. The listener records
them per prompt, and ``wait_for_prompt_completion`` maps them onto job
progress (``PROGRESS_FLOOR`` .. ``PROGRESS_CEILING``), never moving backwards
even when a workflow runs several progress-reporting nodes in sequence.
"""

from __future__ import annotations

import asyncio
import json
import logging
import uuid
from typing import Callable, Dict, List, Optional

try:
    import aiohttp
except ModuleNotFoundError:  # CI stub omits aiohttp; keep the module import-safe.
    aiohttp = None  # type: ignore[assignment]

from .comfy_workflows import extract_history_outputs
from .job_manager import GenerationCancelled

logger = logging.getLogger(__name__)

# Bound on the startup probe and WebSocket handshake.
CONNECT_TIMEOUT_SECONDS = 5
# How long a queued prompt may run before it is cancelled. Video workflows
# take minutes per clip, so they get a longer budget than images.
IMAGE_PROMPT_TIMEOUT_SECONDS = 600
VIDEO_PROMPT_TIMEOUT_SECONDS = 1800

# Background reconnect backoff: first retry after the initial delay, doubling
# up to the cap; a successful connect resets it.
RECONNECT_BACKOFF_INITIAL_SECONDS = 2.0
RECONNECT_BACKOFF_MAX_SECONDS = 60.0
# Minimum gap between two FAILED on-demand connect attempts. Queueing a job
# while ComfyUI is down falls straight through to the direct generator instead
# of waiting on a connect that just failed.
ON_DEMAND_RETRY_SECONDS = 10.0

# Job progress band owned by the ComfyUI run: the caller reports ~10% once the
# prompt is queued, and 95% once outputs are found; sampling fills the middle.
PROGRESS_FLOOR = 15.0
PROGRESS_CEILING = 90.0


class ComfyUIClient:
    """Client for communicating with ComfyUI server"""

    def __init__(self, server_address: str = "http://127.0.0.1:8188"):
        self.server_address = server_address.replace("http://", "").replace("https://", "")
        self.http_url = f"http://{self.server_address}"
        self.ws_url = f"ws://{self.server_address}/ws"
        self.client_id = str(uuid.uuid4())
        self.connected = False
        self.ws = None
        self._session: Optional["aiohttp.ClientSession"] = None
        self._listener_task: Optional[asyncio.Task] = None
        # Reconnect machinery (created lazily: the client may be constructed
        # outside a running event loop).
        self._connect_lock: Optional[asyncio.Lock] = None
        self._disconnected_event: Optional[asyncio.Event] = None
        self._reconnect_task: Optional[asyncio.Task] = None
        self._last_failed_attempt: Optional[float] = None
        # prompt_id -> highest sampling fraction (0..1) reported over the WS.
        # Only prompts this client queued are tracked, so the map stays bounded
        # by in-flight jobs; wait_for_prompt_completion drops the entry.
        self._prompt_progress: Dict[str, float] = {}
        # Prompt ComfyUI reports as executing: older servers send progress
        # messages without a prompt_id, attributed to this prompt instead.
        self._executing_prompt_id: Optional[str] = None

    @property
    def available(self) -> bool:
        """False when the aiohttp transport is not installed (no connect possible)."""
        return aiohttp is not None

    # ------------------------------------------------------------------
    # Connection lifecycle
    # ------------------------------------------------------------------

    def _lock(self) -> asyncio.Lock:
        if self._connect_lock is None:
            self._connect_lock = asyncio.Lock()
        return self._connect_lock

    def _disconnect_signal(self) -> asyncio.Event:
        if self._disconnected_event is None:
            self._disconnected_event = asyncio.Event()
        return self._disconnected_event

    async def connect(self):
        """Connect to ComfyUI server.

        The reachability probe and the WebSocket handshake are each bounded
        (CONNECT_TIMEOUT_SECONDS) so a wedged ComfyUI cannot stall backend
        startup; a failed connect closes the session it opened. Any previous
        transport is torn down first, so a reconnect never leaks a session.
        """
        if aiohttp is None:
            raise ConnectionError("The aiohttp transport is not installed.")
        await self._stop_listener()
        await self._close_transport()
        try:
            self._session = aiohttp.ClientSession()

            # Test HTTP connection
            async with self._session.get(
                f"{self.http_url}/system_stats",
                timeout=aiohttp.ClientTimeout(total=CONNECT_TIMEOUT_SECONDS),
            ) as resp:
                if resp.status != 200:
                    raise ConnectionError(f"ComfyUI returned status {resp.status}")

            # Connect WebSocket for real-time updates
            self.ws = await asyncio.wait_for(
                self._session.ws_connect(f"{self.ws_url}?clientId={self.client_id}"),
                timeout=CONNECT_TIMEOUT_SECONDS,
            )
            self.connected = True
            self._last_failed_attempt = None
            self._disconnect_signal().clear()
            logger.info("Connected to ComfyUI at %s", self.http_url)

            # Start WebSocket listener (held so it is not garbage collected).
            self._listener_task = asyncio.create_task(self._ws_listener())

        except Exception as e:
            logger.info("Could not connect to ComfyUI at %s: %s", self.http_url, e)
            self.connected = False
            await self._close_transport()
            raise

    async def ensure_connected(self) -> bool:
        """Return True when connected, reconnecting on demand first if needed.

        Never raises. A failed attempt is not repeated for
        ON_DEMAND_RETRY_SECONDS, so jobs arriving while ComfyUI is down go to
        the direct generator without waiting on another connect timeout (the
        background loop keeps retrying meanwhile).
        """
        if self.connected:
            return True
        if not self.available:
            return False
        loop = asyncio.get_running_loop()
        async with self._lock():
            if self.connected:  # another caller reconnected while we waited
                return True
            if (
                self._last_failed_attempt is not None
                and loop.time() - self._last_failed_attempt < ON_DEMAND_RETRY_SECONDS
            ):
                return False
            try:
                await self.connect()
            except Exception:  # noqa: BLE001 - connect() already logged the cause
                self._last_failed_attempt = loop.time()
                return False
            return True

    def start_reconnect_loop(self) -> None:
        """Start the background reconnect task (idempotent; no-op without aiohttp)."""
        if not self.available:
            return
        if self._reconnect_task is not None and not self._reconnect_task.done():
            return
        self._reconnect_task = asyncio.create_task(self._reconnect_loop())

    async def stop_reconnect_loop(self) -> None:
        """Cancel the background reconnect task and wait for it to finish."""
        task, self._reconnect_task = self._reconnect_task, None
        if task is None:
            return
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
        except Exception as exc:  # noqa: BLE001 - shutdown must not raise
            logger.debug("ComfyUI reconnect loop ended with an error: %s", exc)

    async def _reconnect_loop(self) -> None:
        """Keep the connection up: wait for a drop, then retry with backoff."""
        delay = RECONNECT_BACKOFF_INITIAL_SECONDS
        while True:
            if self.connected:
                delay = RECONNECT_BACKOFF_INITIAL_SECONDS
                await self._disconnect_signal().wait()
                continue
            async with self._lock():
                if not self.connected:
                    try:
                        await self.connect()
                    except asyncio.CancelledError:
                        raise
                    except Exception:  # noqa: BLE001 - logged by connect(); retry later
                        pass
            if self.connected:
                continue
            await asyncio.sleep(delay)
            delay = min(delay * 2, RECONNECT_BACKOFF_MAX_SECONDS)

    async def _stop_listener(self) -> None:
        task, self._listener_task = self._listener_task, None
        if task is None or task.done() or task is asyncio.current_task():
            return
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
        except Exception:  # noqa: BLE001 - a dead listener is being replaced
            pass

    async def _close_transport(self):
        """Close the WebSocket and HTTP session; never raises."""
        ws, session = self.ws, self._session
        self.ws, self._session = None, None
        for closable in (ws, session):
            if closable is None:
                continue
            try:
                await closable.close()
            except Exception:  # noqa: BLE001 - closing a dead transport
                pass

    async def disconnect(self):
        """Disconnect from ComfyUI and stop reconnecting (backend shutdown)."""
        await self.stop_reconnect_loop()
        self.connected = False
        await self._stop_listener()
        await self._close_transport()

    def _mark_disconnected(self) -> None:
        self.connected = False
        self._executing_prompt_id = None
        if self._disconnected_event is not None:
            self._disconnected_event.set()

    async def _ws_listener(self):
        """Listen for WebSocket messages.

        However the stream ends - server restart, network drop, error frame -
        the client is no longer connected, so new jobs take the direct GPU
        path instead of queueing to a ComfyUI that is gone, and the
        background reconnect loop is woken.
        """
        try:
            async for msg in self.ws:
                if msg.type == aiohttp.WSMsgType.TEXT:
                    try:
                        data = json.loads(msg.data)
                    except (TypeError, ValueError):
                        logger.debug("Ignoring a non-JSON ComfyUI WebSocket frame")
                        continue
                    if isinstance(data, dict):
                        self._handle_ws_message(data)
                elif msg.type == aiohttp.WSMsgType.ERROR:
                    logger.warning("ComfyUI WebSocket error: %s", self.ws.exception())
                    break
        except asyncio.CancelledError:
            raise
        except Exception as e:
            logger.warning("ComfyUI WebSocket listener stopped: %s", e)
        finally:
            self._mark_disconnected()

    def _handle_ws_message(self, data: Dict) -> None:
        """Route one WebSocket message: progress to its prompt, lifecycle to logs."""
        msg_type = data.get("type")
        payload = data.get("data")
        if not isinstance(payload, dict):
            payload = {}
        prompt_id = payload.get("prompt_id")

        if msg_type == "progress":
            self._record_progress(prompt_id or self._executing_prompt_id, payload)
        elif msg_type == "execution_start":
            self._executing_prompt_id = prompt_id
            logger.debug("ComfyUI started prompt %s", prompt_id)
        elif msg_type == "executing":
            if payload.get("node") is None:
                # ComfyUI signals "prompt finished" as executing node=None.
                if prompt_id is None or prompt_id == self._executing_prompt_id:
                    self._executing_prompt_id = None
                logger.debug("ComfyUI finished prompt %s", prompt_id)
            else:
                if prompt_id:
                    self._executing_prompt_id = prompt_id
                logger.debug("ComfyUI executing node %s", payload.get("node"))
        elif msg_type == "executed":
            logger.debug("ComfyUI executed node output for prompt %s", prompt_id)

    def _record_progress(self, prompt_id: Optional[str], payload: Dict) -> None:
        if not prompt_id or prompt_id not in self._prompt_progress:
            return
        value, maximum = payload.get("value"), payload.get("max")
        if isinstance(value, bool) or isinstance(maximum, bool):
            return
        if not isinstance(value, (int, float)) or not isinstance(maximum, (int, float)):
            return
        if maximum <= 0:
            return
        fraction = min(1.0, max(0.0, float(value) / float(maximum)))
        # Monotonic: a second progress-reporting node (e.g. a decode pass after
        # sampling) restarts at 0, which must not move the job backwards.
        if fraction > self._prompt_progress[prompt_id]:
            self._prompt_progress[prompt_id] = fraction

    def prompt_progress(self, prompt_id: str) -> float:
        """Job progress (PROGRESS_FLOOR..PROGRESS_CEILING) for a tracked prompt."""
        fraction = self._prompt_progress.get(prompt_id, 0.0)
        return PROGRESS_FLOOR + (PROGRESS_CEILING - PROGRESS_FLOOR) * fraction

    # ------------------------------------------------------------------
    # HTTP API
    # ------------------------------------------------------------------

    async def upload_image(self, image_path: str, name: str = None) -> str:
        """Upload image to ComfyUI"""
        import aiofiles

        if name is None:
            name = image_path.replace("\\", "/").split("/")[-1]

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
        """Queue a workflow for execution and start tracking its progress."""
        if self._session is None:
            raise ConnectionError("ComfyUI is not connected.")
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
                prompt_id = result.get("prompt_id")
                if prompt_id:
                    # Registered before any WS progress for it can arrive.
                    self._prompt_progress.setdefault(prompt_id, 0.0)
                return prompt_id
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
        timeout_seconds: int = IMAGE_PROMPT_TIMEOUT_SECONDS,
        poll_interval: float = 1.0,
        progress_callback: Optional[Callable[[float], None]] = None,
        kinds: tuple[str, ...] = ("images",),
        should_cancel: Optional[Callable[[], bool]] = None,
    ) -> List[Dict[str, str]]:
        """Poll history until the prompt has outputs; report real WS progress.

        Progress comes from ComfyUI's own ``progress`` messages for this
        prompt (see ``prompt_progress``); it is reported only when it moves,
        and never moves backwards.
        """
        start = asyncio.get_running_loop().time()
        self._prompt_progress.setdefault(prompt_id, 0.0)
        last_reported: Optional[float] = None

        try:
            while True:
                if should_cancel is not None and should_cancel():
                    try:
                        await self.cancel_prompt(prompt_id)
                    except Exception as exc:  # noqa: BLE001 - the job is cancelled regardless
                        logger.warning("ComfyUI did not accept the cancel for %s: %s", prompt_id, exc)
                    raise GenerationCancelled(prompt_id)

                history = await self.get_history(prompt_id)
                outputs = extract_history_outputs(history, prompt_id, kinds=kinds)
                if outputs:
                    if progress_callback:
                        progress_callback(95.0)
                    return outputs

                if asyncio.get_running_loop().time() - start > timeout_seconds:
                    # Stop the prompt before giving up on it: left alone it keeps
                    # the GPU busy for a job that has already failed.
                    try:
                        await self.cancel_prompt(prompt_id)
                    except Exception as exc:  # noqa: BLE001 - the job fails regardless
                        logger.warning("ComfyUI did not accept the cancel for %s: %s", prompt_id, exc)
                    raise TimeoutError(f"Timed out waiting for ComfyUI prompt {prompt_id}")

                if progress_callback:
                    progress = self.prompt_progress(prompt_id)
                    if last_reported is None or progress > last_reported:
                        progress_callback(progress)
                        last_reported = progress

                await asyncio.sleep(poll_interval)
        finally:
            self._prompt_progress.pop(prompt_id, None)

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

    async def cancel_prompt(self, prompt_id: str) -> None:
        """Stop one prompt: drop it from the queue, and interrupt it if running.

        ComfyUI's POST /queue {"delete": [...]} removes a queued prompt. An
        interrupt is sent only when GET /queue lists this prompt as running:
        servers that predate targeted interrupts (e.g. v0.3.0) ignore the
        {"prompt_id": ...} body and stop whatever is running, which could be
        another client's prompt.
        """
        async with self._session.post(
            f"{self.http_url}/queue", json={"delete": [prompt_id]}
        ):
            pass
        if prompt_id in await self._running_prompt_ids():
            async with self._session.post(
                f"{self.http_url}/interrupt", json={"prompt_id": prompt_id}
            ):
                pass

    async def _running_prompt_ids(self) -> List[str]:
        """Prompt ids ComfyUI is executing (queue items are (number, prompt_id, ...))."""
        async with self._session.get(f"{self.http_url}/queue") as resp:
            queue = await resp.json()
        return [item[1] for item in queue.get("queue_running", []) if len(item) > 1]
