"""Download telemetry — a pure, synchronous, clock-injectable byte accountant.

ProgressSink is unit-testable with no network and a fake clock. The Download
manager creates one sink per job (total = sum of per-file sizes from
get_paths_info) and threads byte deltas in through a headless tqdm subclass
(see make_tqdm_class, Task 3). Speed is an EWMA over (bytes, seconds) deltas;
ETA is remaining / speed.
"""

import threading
import time
from typing import Callable, Optional

from foundry.download_errors import DownloadCancelledError

# Exponential-moving-average weight for new speed samples. Higher = more
# responsive, lower = smoother. 0.3 reads well for a per-second UI gauge.
_EWMA_ALPHA = 0.3


class ProgressSink:
    def __init__(
        self,
        total_bytes: int,
        clock: Callable[[], float] = time.monotonic,
        cancel_event: Optional[threading.Event] = None,
    ):
        self._total = max(int(total_bytes), 0)
        self._clock = clock
        self._cancel_event = cancel_event

        self._completed_bytes = 0          # bytes from finished files
        self._inflight_bytes = 0           # bytes of the current file so far
        self._current_file_size = 0        # expected size of the current file

        self._speed = 0.0                  # bytes/sec EWMA
        self._last_time: Optional[float] = None
        self._samples = 0

    # -- lifecycle ---------------------------------------------------------
    def start_file(self, expected_size: int, initial: int = 0) -> None:
        """Begin a new file. ``initial`` is the resume offset (>0 on resume)."""
        self._current_file_size = max(int(expected_size), 0)
        self._inflight_bytes = max(int(initial), 0)
        self._last_time = None  # speed sampling restarts per file boundary

    def add(self, n: int) -> None:
        """Account ``n`` newly-transferred bytes. Raises on cooperative cancel."""
        if self._cancel_event is not None and self._cancel_event.is_set():
            raise DownloadCancelledError("download cancelled")
        if n <= 0:
            return
        self._inflight_bytes += int(n)
        self._update_speed(int(n))

    def finish_file(self) -> None:
        """Mark the current file complete; fold its size into completed bytes."""
        self._completed_bytes += self._current_file_size
        self._inflight_bytes = 0
        self._current_file_size = 0
        self._last_time = None

    # -- derived telemetry -------------------------------------------------
    @property
    def total_bytes(self) -> int:
        return self._total

    @property
    def progress(self) -> float:
        if self._total <= 0:
            return 0.0
        transferred = self._completed_bytes + self._inflight_bytes
        fraction = transferred / self._total
        if fraction < 0.0:
            return 0.0
        return 1.0 if fraction > 1.0 else fraction

    @property
    def speed(self) -> float:
        return self._speed

    @property
    def eta(self) -> Optional[float]:
        if self._speed <= 0.0:
            return None
        remaining = self._total - (self._completed_bytes + self._inflight_bytes)
        if remaining < 0:
            remaining = 0
        return remaining / self._speed

    # -- internals ---------------------------------------------------------
    def _update_speed(self, n: int) -> None:
        now = self._clock()
        if self._last_time is None:
            # First sample of the file: establish a baseline, no rate yet.
            self._last_time = now
            self._samples += 1
            return
        elapsed = now - self._last_time
        self._last_time = now
        self._samples += 1
        if elapsed <= 0:
            return
        instantaneous = n / elapsed
        if self._speed <= 0.0:
            self._speed = instantaneous
        else:
            self._speed = (
                _EWMA_ALPHA * instantaneous + (1 - _EWMA_ALPHA) * self._speed
            )
