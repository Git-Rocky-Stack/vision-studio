"""ComfyUI connection lifecycle and the direct-path fallback.

- the WebSocket listener ending (server restart, network drop) clears
  `connected`, so new jobs stop queueing to a ComfyUI that is gone;
- a failed connect closes the session it opened, and the probe is bounded;
- a prompt that times out is cancelled on ComfyUI, and video prompts get the
  longer budget;
- a job whose queue call fails runs on the direct generator instead.

aiohttp is absent in the stub CI env: a minimal fake module is patched in.
"""

import asyncio
import pathlib
import shutil
import sys
import tempfile
import types
import unittest
from unittest import mock

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from utils import comfy_client as cc  # noqa: E402
from utils.job_manager import GenerationJob, JobManager, JobStatus  # noqa: E402


class _Msg:
    def __init__(self, type_, data=""):
        self.type, self.data = type_, data


class _FakeWS:
    def __init__(self, messages=(), raise_after=None):
        self._messages = list(messages)
        self._raise_after = raise_after
        self.closed = False

    def __aiter__(self):
        return self

    async def __anext__(self):
        if self._messages:
            return self._messages.pop(0)
        if self._raise_after is not None:
            raise self._raise_after
        raise StopAsyncIteration

    def exception(self):
        return None

    async def close(self):
        self.closed = True


class _Response:
    def __init__(self, status):
        self.status = status

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False


class _FakeSession:
    instances = []

    def __init__(self, *args, status=200, **kwargs):
        self.status = status
        self.closed = False
        self.get_kwargs = None
        _FakeSession.instances.append(self)

    def get(self, url, **kwargs):
        self.get_kwargs = kwargs
        return _Response(self.status)

    async def ws_connect(self, url):
        return _FakeWS()

    async def close(self):
        self.closed = True


def _fake_aiohttp(status=200):
    module = types.SimpleNamespace()
    module.ClientSession = lambda *a, **k: _FakeSession(status=status)
    module.ClientTimeout = lambda **kw: ("timeout", kw)
    module.WSMsgType = types.SimpleNamespace(TEXT="text", ERROR="error")
    return module


class ListenerTests(unittest.IsolatedAsyncioTestCase):
    async def test_listener_end_clears_connected(self):
        with mock.patch.object(cc, "aiohttp", _fake_aiohttp()):
            client = cc.ComfyUIClient("http://127.0.0.1:1")
            client.connected = True
            client.ws = _FakeWS([_Msg("text", '{"type": "status"}')])
            await client._ws_listener()
        self.assertFalse(client.connected)

    async def test_listener_error_clears_connected(self):
        with mock.patch.object(cc, "aiohttp", _fake_aiohttp()):
            client = cc.ComfyUIClient("http://127.0.0.1:1")
            client.connected = True
            client.ws = _FakeWS(raise_after=ConnectionResetError("gone"))
            await client._ws_listener()
        self.assertFalse(client.connected)


class ConnectTests(unittest.IsolatedAsyncioTestCase):
    async def test_failed_connect_closes_the_session(self):
        _FakeSession.instances.clear()
        with mock.patch.object(cc, "aiohttp", _fake_aiohttp(status=500)):
            client = cc.ComfyUIClient("http://127.0.0.1:1")
            with self.assertRaises(ConnectionError):
                await client.connect()
        self.assertFalse(client.connected)
        self.assertTrue(_FakeSession.instances[-1].closed)
        self.assertIsNone(client._session)

    async def test_probe_is_bounded_and_success_connects(self):
        _FakeSession.instances.clear()
        with mock.patch.object(cc, "aiohttp", _fake_aiohttp()):
            client = cc.ComfyUIClient("http://127.0.0.1:1")
            await client.connect()
            await asyncio.sleep(0)  # let the listener run to completion
        session = _FakeSession.instances[-1]
        self.assertEqual(session.get_kwargs["timeout"],
                         ("timeout", {"total": cc.CONNECT_TIMEOUT_SECONDS}))
        self.assertIsNotNone(client._listener_task)


class WaitTimeoutTests(unittest.IsolatedAsyncioTestCase):
    async def test_timed_out_prompt_is_cancelled_on_comfyui(self):
        client = cc.ComfyUIClient("http://127.0.0.1:1")
        cancelled = []

        async def fake_history(prompt_id=None):
            return {}

        async def fake_cancel(prompt_id):
            cancelled.append(prompt_id)

        client.get_history = fake_history
        client.cancel_prompt = fake_cancel
        with self.assertRaises(TimeoutError):
            await client.wait_for_prompt_completion(
                "p-1", timeout_seconds=0, poll_interval=0.001)
        self.assertEqual(cancelled, ["p-1"])

    async def test_a_failing_cancel_still_raises_the_timeout(self):
        client = cc.ComfyUIClient("http://127.0.0.1:1")

        async def fake_history(prompt_id=None):
            return {}

        async def fake_cancel(prompt_id):
            raise ConnectionError("gone")

        client.get_history = fake_history
        client.cancel_prompt = fake_cancel
        with self.assertRaises(TimeoutError):
            await client.wait_for_prompt_completion(
                "p-1", timeout_seconds=0, poll_interval=0.001)

    def test_video_gets_a_longer_budget(self):
        self.assertGreater(cc.VIDEO_PROMPT_TIMEOUT_SECONDS, cc.IMAGE_PROMPT_TIMEOUT_SECONDS)


class _QueueFailingClient:
    connected = True

    def __init__(self):
        self.wait_kwargs = None

    async def upload_image(self, path):
        return "frame.png"

    async def queue_prompt(self, workflow, extra_data=None):
        raise ConnectionRefusedError("ComfyUI is gone")

    async def wait_for_prompt_completion(self, prompt_id, **kwargs):
        self.wait_kwargs = kwargs
        return []


class DirectFallbackTests(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        import main

        self.main = main
        self.manager = JobManager()
        self.direct_calls = []
        test = self

        class FakeDirect:
            async def generate_image(self, **kwargs):
                test.direct_calls.append(("image", kwargs["job_id"]))
                return {"images": ["/outputs/x/generated.png"]}

            async def generate_video(self, **kwargs):
                test.direct_calls.append(("video", kwargs["job_id"]))
                return {"video": "/outputs/x/video.mp4"}

        output_dir = tempfile.mkdtemp()
        self.addCleanup(lambda: shutil.rmtree(output_dir, ignore_errors=True))
        for name, value in (("job_manager", self.manager),
                            ("OUTPUT_DIR", output_dir),
                            ("comfy_client", _QueueFailingClient()),
                            ("direct_generator", FakeDirect()),
                            ("direct_video_generator", FakeDirect())):
            patcher = mock.patch.object(main, name, value)
            patcher.start()
            self.addCleanup(patcher.stop)

    def _add(self, job_id, kind):
        self.manager.add_job(GenerationJob(
            id=job_id, type=kind, status=JobStatus.PENDING, params={}, output_dir="out"))

    async def test_image_job_falls_back_when_queueing_fails(self):
        self._add("img", "image")
        await self.main.process_image_generation(
            "img", self.main.ImageGenerationRequest(prompt="a cat", model="sdxl"))
        self.assertEqual(self.direct_calls, [("image", "img")])
        self.assertEqual(self.manager.get_job("img").status, JobStatus.COMPLETED)

    async def test_video_job_falls_back_when_queueing_fails(self):
        self._add("vid", "video")
        await self.main.process_video_generation(
            "vid", self.main.VideoGenerationRequest(
                prompt="", model="svd", image_path="frame.png"))
        self.assertEqual(self.direct_calls, [("video", "vid")])
        self.assertEqual(self.manager.get_job("vid").status, JobStatus.COMPLETED)

    async def test_no_direct_generator_reports_the_comfy_failure(self):
        self._add("img2", "image")
        with mock.patch.object(self.main, "direct_generator", None):
            await self.main.process_image_generation(
                "img2", self.main.ImageGenerationRequest(prompt="a cat", model="sdxl"))
        job = self.manager.get_job("img2")
        self.assertEqual(job.status, JobStatus.FAILED)
        self.assertIn("ComfyUI is gone", job.error)

    async def test_video_wait_uses_the_video_budget(self):
        client = _QueueFailingClient()

        async def queue_ok(workflow, extra_data=None):
            return "p-1"

        async def get_image(*a, **k):
            return b""

        client.queue_prompt = queue_ok
        client.get_image = get_image
        with mock.patch.object(self.main, "comfy_client", client):
            await self.main.generate_video_with_comfyui(
                "vid2", self.main.VideoGenerationRequest(
                    prompt="", model="svd", image_path="frame.png"))
        self.assertEqual(client.wait_kwargs["timeout_seconds"],
                         cc.VIDEO_PROMPT_TIMEOUT_SECONDS)


if __name__ == "__main__":
    unittest.main()
