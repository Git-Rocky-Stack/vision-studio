"""/ws lifecycle: bad input never kills the socket, `subscribe` filters, a
finished job gets one final update, and every exit releases the connection.

Integration tier (the _api.py suffix disables the local-auth middleware).
"""
import pathlib
import sys

import pytest

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

import main  # noqa: E402
from utils.job_manager import GenerationJob, JobManager, JobStatus  # noqa: E402


def _job(job_id, status=JobStatus.PROCESSING, progress=40.0):
    return GenerationJob(id=job_id, type="image", status=status, params={},
                         output_dir="out", progress=progress)


@pytest.fixture
def manager(monkeypatch):
    jobs = JobManager()
    monkeypatch.setattr(main, "job_manager", jobs)
    monkeypatch.setattr(main.step_preview_service, "latest", lambda _id: None)
    return jobs


# --- pure helpers --------------------------------------------------------------

@pytest.mark.parametrize("text", [None, "", "not json", "[1, 2]", '"subscribe"'])
def test_parse_ws_command_tolerates_bad_input(text):
    assert main.parse_ws_command(text) is None


def test_subscribe_and_unsubscribe_edit_the_filter():
    subs = set()
    main.apply_ws_command({"action": "subscribe", "job_id": "a"}, subs)
    main.apply_ws_command({"action": "subscribe", "job_id": "b"}, subs)
    main.apply_ws_command({"action": "unsubscribe", "job_id": "a"}, subs)
    assert subs == {"b"}
    main.apply_ws_command({"action": "subscribe"}, subs)  # no job_id: all jobs again
    assert subs == set()
    main.apply_ws_command({"action": "dance", "job_id": "c"}, subs)
    main.apply_ws_command(None, subs)
    assert subs == set()


def test_build_ws_updates_honors_subscriptions(manager):
    jobs = [_job("a"), _job("b")]
    messages = main.build_ws_updates(jobs, {}, {"b"})
    assert [m["job_id"] for m in messages] == ["b"]
    assert [m["job_id"] for m in main.build_ws_updates(jobs, {})] == ["a", "b"]


def test_finished_job_gets_exactly_one_final_update(manager):
    manager.add_job(_job("a", JobStatus.COMPLETED, progress=100.0))
    reported, revisions = {"a"}, {"a": 3}

    first = main.build_ws_final_updates(reported, set(), revisions)
    second = main.build_ws_final_updates(reported, set(), revisions)

    assert first == [{"type": "job_update", "job_id": "a",
                      "status": "completed", "progress": 100.0}]
    assert second == []
    assert reported == set() and revisions == {}


def test_final_update_respects_subscriptions(manager):
    manager.add_job(_job("a", JobStatus.FAILED))
    reported = {"a"}
    assert main.build_ws_final_updates(reported, set(), {}, {"other"}) == []
    assert reported == set()


def test_still_running_job_is_not_finalized(manager):
    manager.add_job(_job("a", JobStatus.PENDING))
    reported = {"a"}
    assert main.build_ws_final_updates(reported, set(), {}) == []
    assert reported == {"a"}


# --- the endpoint ----------------------------------------------------------------

def test_bad_json_does_not_close_and_subscribe_filters(manager):
    from fastapi.testclient import TestClient

    manager.add_job(_job("a"))
    manager.add_job(_job("b"))
    client = TestClient(main.app)

    with client.websocket_connect("/ws") as ws:
        ws.send_text("{not json")
        ws.send_bytes(b"\x00\x01")
        ws.send_json({"action": "subscribe", "job_id": "b"})
        # The first tick may predate the subscribe ([b, a] - newest first);
        # every later tick carries only b. Four messages cover both orderings:
        # the socket is still open after the bad input, and the tail is filtered.
        seen = [ws.receive_json()["job_id"] for _ in range(4)]
        assert seen in (["b", "a", "b", "b"], ["b", "b", "b", "b"])

    assert main.manager.active_connections == []


def test_completion_sends_a_final_update(manager):
    from fastapi.testclient import TestClient

    manager.add_job(_job("a"))
    client = TestClient(main.app)

    with client.websocket_connect("/ws") as ws:
        assert ws.receive_json()["status"] == "processing"
        manager.update_job("a", status=JobStatus.COMPLETED, progress=100.0)
        final = ws.receive_json()

    assert final == {"type": "job_update", "job_id": "a",
                     "status": "completed", "progress": 100.0}
    assert main.manager.active_connections == []
