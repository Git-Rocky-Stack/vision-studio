import pathlib
import sys
import threading
import unittest

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from foundry.download_errors import DownloadCancelledError  # type: ignore[import-not-found]
from foundry.download_telemetry import ProgressSink  # type: ignore[import-not-found]


class FakeClock:
    """A monotonic clock we step manually for deterministic speed/eta."""

    def __init__(self):
        self._now = 0.0

    def __call__(self) -> float:
        return self._now

    def advance(self, seconds: float) -> None:
        self._now += seconds


class ProgressSinkTests(unittest.TestCase):
    def test_progress_is_zero_for_zero_total(self):
        sink = ProgressSink(total_bytes=0, clock=FakeClock())
        self.assertEqual(sink.progress, 0.0)

    def test_single_file_progress_tracks_inflight_bytes(self):
        sink = ProgressSink(total_bytes=100, clock=FakeClock())
        sink.start_file(expected_size=100)
        sink.add(25)
        self.assertAlmostEqual(sink.progress, 0.25)
        sink.add(25)
        self.assertAlmostEqual(sink.progress, 0.50)

    def test_finish_file_moves_inflight_into_completed(self):
        sink = ProgressSink(total_bytes=300, clock=FakeClock())
        sink.start_file(expected_size=100)
        sink.add(100)
        sink.finish_file()
        # File 1 complete; inflight reset.
        self.assertAlmostEqual(sink.progress, 100 / 300)
        sink.start_file(expected_size=200)
        sink.add(100)
        # completed(100) + inflight(100) over total(300).
        self.assertAlmostEqual(sink.progress, 200 / 300)

    def test_progress_clamps_to_one(self):
        sink = ProgressSink(total_bytes=100, clock=FakeClock())
        sink.start_file(expected_size=100)
        sink.add(250)  # overshoot (e.g. recompressed) never exceeds 1.0
        self.assertEqual(sink.progress, 1.0)

    def test_resume_initial_offset_counts_as_inflight(self):
        sink = ProgressSink(total_bytes=100, clock=FakeClock())
        sink.start_file(expected_size=100, initial=40)
        self.assertAlmostEqual(sink.progress, 0.40)
        sink.add(10)
        self.assertAlmostEqual(sink.progress, 0.50)

    def test_speed_is_zero_before_two_samples(self):
        clock = FakeClock()
        sink = ProgressSink(total_bytes=100, clock=clock)
        sink.start_file(expected_size=100)
        self.assertEqual(sink.speed, 0.0)
        sink.add(10)  # first sample, no delta yet
        self.assertEqual(sink.speed, 0.0)

    def test_speed_is_bytes_per_second_ewma(self):
        clock = FakeClock()
        sink = ProgressSink(total_bytes=1000, clock=clock)
        sink.start_file(expected_size=1000)
        sink.add(100)
        clock.advance(1.0)
        sink.add(100)  # 100 bytes in 1.0s -> 100 B/s
        self.assertGreater(sink.speed, 0.0)
        self.assertLessEqual(sink.speed, 100.0)

    def test_eta_is_remaining_over_speed(self):
        clock = FakeClock()
        sink = ProgressSink(total_bytes=1000, clock=clock)
        sink.start_file(expected_size=1000)
        sink.add(100)
        clock.advance(1.0)
        sink.add(100)  # speed ~100 B/s, 800 bytes remain -> ~8s
        self.assertIsNotNone(sink.eta)
        self.assertGreater(sink.eta, 0.0)

    def test_eta_is_none_when_speed_is_zero(self):
        sink = ProgressSink(total_bytes=1000, clock=FakeClock())
        sink.start_file(expected_size=1000)
        self.assertIsNone(sink.eta)

    def test_add_raises_when_cancel_event_set(self):
        event = threading.Event()
        sink = ProgressSink(total_bytes=100, clock=FakeClock(), cancel_event=event)
        sink.start_file(expected_size=100)
        sink.add(10)
        event.set()
        with self.assertRaises(DownloadCancelledError):
            sink.add(10)


import foundry.download_telemetry as telemetry_module  # noqa: E402


class FakeTqdm:
    """Minimal stand-in for tqdm.auto.tqdm so make_tqdm_class is testable
    without importing the real library."""

    def __init__(self, *args, **kwargs):
        self.total = kwargs.get("total")
        self.n = kwargs.get("initial", 0)
        self.disable = kwargs.get("disable", False)
        self.closed = False

    def update(self, n=1):
        self.n += n

    def close(self):
        self.closed = True


class MakeTqdmClassTests(unittest.TestCase):
    def setUp(self):
        # Force the factory to subclass our fake base, not the real tqdm.
        self._orig = telemetry_module._tqdm_base
        telemetry_module._tqdm_base = lambda: FakeTqdm

    def tearDown(self):
        telemetry_module._tqdm_base = self._orig

    def test_factory_forces_headless_and_starts_a_file(self):
        sink = ProgressSink(total_bytes=100, clock=FakeClock())
        cls = telemetry_module.make_tqdm_class(sink)
        bar = cls(total=100, initial=0)
        # hf passes disable through; we force it True so no terminal bar prints.
        self.assertTrue(bar.disable)
        # start_file was called with total -> progress reacts to updates.
        bar.update(50)
        self.assertAlmostEqual(sink.progress, 0.50)

    def test_update_feeds_the_sink_and_the_base(self):
        sink = ProgressSink(total_bytes=200, clock=FakeClock())
        cls = telemetry_module.make_tqdm_class(sink)
        bar = cls(total=200)
        bar.update(40)
        self.assertAlmostEqual(sink.progress, 40 / 200)
        self.assertEqual(bar.n, 40)  # base also advanced

    def test_close_finishes_the_file(self):
        sink = ProgressSink(total_bytes=200, clock=FakeClock())
        cls = telemetry_module.make_tqdm_class(sink)
        bar = cls(total=100)
        bar.update(100)
        bar.close()
        self.assertTrue(bar.closed)
        self.assertAlmostEqual(sink.progress, 100 / 200)  # folded into completed


if __name__ == "__main__":
    unittest.main()
