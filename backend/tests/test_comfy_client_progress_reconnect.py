"""ComfyUI client: real WebSocket progress (U1) and reconnect lifecycle (U2).

aiohttp is absent in the stub CI env: a minimal fake module is patched in, and
no test needs a live ComfyUI server.
"""

import asyncio
import pathlib
import sys
import types
import unittest
from unittest import mock

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from utils import comfy_client as cc  # noqa: E402


def _progress(prompt_id, value, maximum):
    data = {"value": value, "max": maximum}
    if prompt_id is not None:
        data["prompt_id"] = prompt_id
    return {"type": "progress", "data": data}


class ProgressRoutingTests(unittest.TestCase):
    def setUp(self):
        self.client = cc.ComfyUIClient("http://127.0.0.1:1")
        self.client._prompt_progress["p1"] = 0.0

    def test_progress_maps_into_the_comfy_band(self):
        self.assertEqual(self.client.prompt_progress("p1"), cc.PROGRESS_FLOOR)
        self.client._handle_ws_message(_progress("p1", 10, 20))
        expected = cc.PROGRESS_FLOOR + (cc.PROGRESS_CEILING - cc.PROGRESS_FLOOR) * 0.5
        self.assertAlmostEqual(self.client.prompt_progress("p1"), expected)
        self.client._handle_ws_message(_progress("p1", 20, 20))
        self.assertAlmostEqual(self.client.prompt_progress("p1"), cc.PROGRESS_CEILING)

    def test_progress_never_moves_backwards(self):
        self.client._handle_ws_message(_progress("p1", 18, 20))
        high = self.client.prompt_progress("p1")
        # A second progress-reporting node restarts at 0.
        self.client._handle_ws_message(_progress("p1", 1, 20))
        self.assertEqual(self.client.prompt_progress("p1"), high)

    def test_untracked_prompts_and_malformed_payloads_are_ignored(self):
        self.client._handle_ws_message(_progress("someone-else", 5, 10))
        self.assertNotIn("someone-else", self.client._prompt_progress)
        for bad in ({"value": "x", "max": 10}, {"value": 1, "max": 0},
                    {"value": True, "max": 2}, {"value": 1}):
            self.client._handle_ws_message({"type": "progress", "data": {"prompt_id": "p1", **bad}})
        self.client._handle_ws_message({"type": "progress", "data": "garbage"})
        self.assertEqual(self.client._prompt_progress["p1"], 0.0)

    def test_progress_without_prompt_id_goes_to_the_executing_prompt(self):
        # Older ComfyUI servers omit prompt_id on progress messages.
        self.client._handle_ws_message({"type": "execution_start", "data": {"prompt_id": "p1"}})
        self.client._handle_ws_message(_progress(None, 5, 10))
        self.assertAlmostEqual(self.client._prompt_progress["p1"], 0.5)
        # "executing" with node=None marks the prompt finished.
        self.client._handle_ws_message({"type": "executing", "data": {"node": None, "prompt_id": "p1"}})
        self.assertIsNone(self.client._executing_prompt_id)
        self.client._handle_ws_message(_progress(None, 9, 10))
        self.assertAlmostEqual(self.client._prompt_progress["p1"], 0.5)


class WaitReportsRealProgressTests(unittest.IsolatedAsyncioTestCase):
    async def test_wait_reports_ws_progress_monotonically_and_cleans_up(self):
        client = cc.ComfyUIClient("http://127.0.0.1:1")
        polls = {"n": 0}

        async def fake_history(prompt_id=None):
            polls["n"] += 1
            # Simulate the listener receiving progress between polls.
            if polls["n"] == 2:
                client._handle_ws_message(_progress("p1", 5, 10))
            if polls["n"] == 3:
                client._handle_ws_message(_progress("p1", 2, 10))  # second node restart
            if polls["n"] == 4:
                return {"p1": {"outputs": {"9": {"images": [{"filename": "a.png"}]}}}}
            return {}

        client.get_history = fake_history
        reported = []
        outputs = await client.wait_for_prompt_completion(
            "p1", poll_interval=0.0, progress_callback=reported.append)

        self.assertEqual(outputs[0]["filename"], "a.png")
        mid = cc.PROGRESS_FLOOR + (cc.PROGRESS_CEILING - cc.PROGRESS_FLOOR) * 0.5
        # Floor once, the real 50% once (the restart does not re-report), then 95.
        self.assertEqual(reported, [cc.PROGRESS_FLOOR, mid, 95.0])
        self.assertEqual(reported, sorted(reported))
        self.assertNotIn("p1", client._prompt_progress)

    async def test_no_progress_is_invented_while_comfyui_is_silent(self):
        client = cc.ComfyUIClient("http://127.0.0.1:1")
        polls = {"n": 0}

        async def fake_history(prompt_id=None):
            polls["n"] += 1
            if polls["n"] >= 5:
                return {"p1": {"outputs": {"9": {"images": [{"filename": "a.png"}]}}}}
            return {}

        client.get_history = fake_history
        reported = []
        await client.wait_for_prompt_completion(
            "p1", poll_interval=0.0, progress_callback=reported.append)
        # Elapsed time no longer fakes a climbing bar.
        self.assertEqual(reported, [cc.PROGRESS_FLOOR, 95.0])


class _Resp:
    def __init__(self, status=200, body=None):
        self.status, self._body = status, body

    async def json(self):
        return self._body

    async def __aenter__(self):
        return self

    async def __aexit__(self, *exc):
        return False


class _BlockingWS:
    """A WebSocket that stays open until closed (or told to drop)."""

    def __init__(self):
        self._closed = asyncio.Event()

    def __aiter__(self):
        return self

    async def __anext__(self):
        await self._closed.wait()
        raise StopAsyncIteration

    def drop(self):
        self._closed.set()

    def exception(self):
        return None

    async def close(self):
        self._closed.set()


class _Server:
    """Fake ComfyUI reachability, flipped up/down by the test."""

    def __init__(self, up=True):
        self.up = up
        self.sessions = []
        self.sockets = []
        self.probes = 0


def _fake_aiohttp(server):
    class Session:
        def __init__(self, *a, **k):
            self.closed = False
            server.sessions.append(self)

        def get(self, url, **kwargs):
            server.probes += 1
            if not server.up:
                raise ConnectionRefusedError("down")
            return _Resp(200)

        def post(self, url, json=None, **kwargs):
            return _Resp(200, {"prompt_id": "queued-1"})

        async def ws_connect(self, url):
            ws = _BlockingWS()
            server.sockets.append(ws)
            return ws

        async def close(self):
            self.closed = True

    module = types.SimpleNamespace()
    module.ClientSession = Session
    module.ClientTimeout = lambda **kw: kw
    module.WSMsgType = types.SimpleNamespace(TEXT="text", ERROR="error")
    return module


class EnsureConnectedTests(unittest.IsolatedAsyncioTestCase):
    async def test_reconnects_on_demand_when_comfyui_comes_up(self):
        server = _Server(up=False)
        with mock.patch.object(cc, "aiohttp", _fake_aiohttp(server)), \
                mock.patch.object(cc, "ON_DEMAND_RETRY_SECONDS", 0.0):
            client = cc.ComfyUIClient("http://127.0.0.1:1")
            self.assertFalse(await client.ensure_connected())
            server.up = True
            self.assertTrue(await client.ensure_connected())
            self.assertTrue(client.connected)
            await client.disconnect()

    async def test_failed_attempts_are_rate_limited(self):
        server = _Server(up=False)
        with mock.patch.object(cc, "aiohttp", _fake_aiohttp(server)), \
                mock.patch.object(cc, "ON_DEMAND_RETRY_SECONDS", 3600.0):
            client = cc.ComfyUIClient("http://127.0.0.1:1")
            self.assertFalse(await client.ensure_connected())
            self.assertFalse(await client.ensure_connected())
            self.assertEqual(server.probes, 1)
            # Every failed attempt closed the session it opened.
            self.assertTrue(all(s.closed for s in server.sessions))

    async def test_without_aiohttp_nothing_is_attempted(self):
        with mock.patch.object(cc, "aiohttp", None):
            client = cc.ComfyUIClient("http://127.0.0.1:1")
            self.assertFalse(client.available)
            self.assertFalse(await client.ensure_connected())
            client.start_reconnect_loop()
            self.assertIsNone(client._reconnect_task)

    async def test_reconnect_replaces_the_old_session(self):
        server = _Server(up=True)
        with mock.patch.object(cc, "aiohttp", _fake_aiohttp(server)):
            client = cc.ComfyUIClient("http://127.0.0.1:1")
            await client.connect()
            first = server.sessions[-1]
            await client.connect()
            self.assertTrue(first.closed)
            self.assertEqual(len([s for s in server.sessions if not s.closed]), 1)
            await client.disconnect()
            self.assertTrue(all(s.closed for s in server.sessions))


class ReconnectLoopTests(unittest.IsolatedAsyncioTestCase):
    async def test_loop_reconnects_after_a_drop_with_backoff(self):
        server = _Server(up=True)
        with mock.patch.object(cc, "aiohttp", _fake_aiohttp(server)), \
                mock.patch.object(cc, "RECONNECT_BACKOFF_INITIAL_SECONDS", 0.01), \
                mock.patch.object(cc, "RECONNECT_BACKOFF_MAX_SECONDS", 0.02):
            client = cc.ComfyUIClient("http://127.0.0.1:1")
            client.start_reconnect_loop()
            await self._until(lambda: client.connected)

            # ComfyUI restarts: the socket drops and it is briefly unreachable.
            server.up = False
            server.sockets[-1].drop()
            await self._until(lambda: not client.connected)
            probes_while_down = server.probes
            await asyncio.sleep(0.1)
            self.assertGreater(server.probes, probes_while_down)  # it keeps retrying

            server.up = True
            await self._until(lambda: client.connected)
            await client.disconnect()
            self.assertIsNone(client._reconnect_task)
            self.assertFalse(client.connected)

    async def test_disconnect_cancels_the_loop_while_down(self):
        server = _Server(up=False)
        with mock.patch.object(cc, "aiohttp", _fake_aiohttp(server)), \
                mock.patch.object(cc, "RECONNECT_BACKOFF_INITIAL_SECONDS", 10.0):
            client = cc.ComfyUIClient("http://127.0.0.1:1")
            client.start_reconnect_loop()
            task = client._reconnect_task
            await asyncio.sleep(0.01)
            await asyncio.wait_for(client.disconnect(), timeout=2)
            self.assertTrue(task.done())

    async def test_start_is_idempotent(self):
        server = _Server(up=True)
        with mock.patch.object(cc, "aiohttp", _fake_aiohttp(server)):
            client = cc.ComfyUIClient("http://127.0.0.1:1")
            client.start_reconnect_loop()
            task = client._reconnect_task
            client.start_reconnect_loop()
            self.assertIs(client._reconnect_task, task)
            await client.disconnect()

    async def _until(self, predicate, timeout=2.0):
        loop = asyncio.get_running_loop()
        deadline = loop.time() + timeout
        while not predicate():
            if loop.time() > deadline:
                self.fail("condition not reached")
            await asyncio.sleep(0.005)


class QueueTracksPromptTests(unittest.IsolatedAsyncioTestCase):
    async def test_queue_registers_the_prompt_for_progress(self):
        server = _Server(up=True)
        with mock.patch.object(cc, "aiohttp", _fake_aiohttp(server)):
            client = cc.ComfyUIClient("http://127.0.0.1:1")
            await client.connect()
            prompt_id = await client.queue_prompt({"1": {}})
            self.assertEqual(prompt_id, "queued-1")
            self.assertIn("queued-1", client._prompt_progress)
            await client.disconnect()

    async def test_queue_without_a_session_raises_connection_error(self):
        client = cc.ComfyUIClient("http://127.0.0.1:1")
        with self.assertRaises(ConnectionError):
            await client.queue_prompt({"1": {}})


if __name__ == "__main__":
    unittest.main()
