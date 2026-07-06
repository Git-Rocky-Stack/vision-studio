"""Step preview service (#33): throttled tiny-VAE decode of in-flight latents.

submit() runs inside the generation worker thread. Every failure degrades to
"no preview for this job" - it must never raise into the diffusers step
callback or slow the run beyond the throttled decode itself.
"""

import logging
import threading
import time
from dataclasses import dataclass
from typing import Callable, Dict, Optional, Set

from preview.decoders import decode_latents_to_data_uri

logger = logging.getLogger(__name__)

MIN_DECODE_INTERVAL_S = 0.5


@dataclass(frozen=True)
class StepPreview:
    revision: int
    step: int
    total_steps: int
    image: str


class StepPreviewService:
    """Thread-safe per-job holder of the latest decoded step frame."""

    def __init__(
        self,
        decode: Callable[..., str] = decode_latents_to_data_uri,
        clock: Callable[[], float] = time.monotonic,
    ):
        self._decode = decode
        self._clock = clock
        self._lock = threading.Lock()
        self._latest: Dict[str, StepPreview] = {}
        self._last_decode_at: Dict[str, float] = {}
        self._disabled: Set[str] = set()

    def submit(self, job_id: str, step: int, total_steps: int,
               latents, family: Optional[str], width: int, height: int) -> None:
        if latents is None:
            return
        with self._lock:
            if job_id in self._disabled:
                return
            last = self._last_decode_at.get(job_id)
            now = self._clock()
            if last is not None and (now - last) < MIN_DECODE_INTERVAL_S:
                return
            self._last_decode_at[job_id] = now

        try:
            image = self._decode(latents, family, width, height)
        except Exception as exc:  # noqa: BLE001 - preview must never propagate
            with self._lock:
                self._disabled.add(job_id)
            logger.warning("Step preview disabled for job %s: %s", job_id, exc)
            return

        with self._lock:
            previous = self._latest.get(job_id)
            revision = previous.revision + 1 if previous else 1
            self._latest[job_id] = StepPreview(
                revision=revision, step=step, total_steps=total_steps, image=image)

    def latest(self, job_id: str) -> Optional[StepPreview]:
        with self._lock:
            return self._latest.get(job_id)

    def discard(self, job_id: str) -> None:
        with self._lock:
            self._latest.pop(job_id, None)
            self._last_decode_at.pop(job_id, None)
            self._disabled.discard(job_id)


step_preview_service = StepPreviewService()
