"""
Performance benchmarks for generation and editing operations.

Uses pytest-benchmark to measure latency and memory usage.
Run with: pytest tests/benchmarks/ -v --benchmark-only
"""

import asyncio
import pathlib
import sys
import tracemalloc

import pytest
from PIL import Image

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[2]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

# Memory benchmark thresholds
MAX_MEMORY_MB = 50
MAX_IMAGE_PROC_MEMORY_MB = 10


@pytest.fixture
def sample_image_small() -> Image.Image:
    """Create a 64x64 sample image for quick benchmarks."""
    return Image.new("RGB", (64, 64), color="blue")


# The stub-era EditService benchmarks are gone with the stub itself (#34):
# they measured a setTimeout-grade passthrough ("the stub is already fast").
# The real edit tools are model-bound and covered by the VS_REAL_SMOKE
# acceptance smokes instead.


class TestMemoryUsageBenchmarks:
    """Benchmarks for memory usage and leaks."""

    def test_memory_usage_image_processing(self, benchmark, sample_image_small):
        """Test memory efficiency of image processing operations.

        Target: < 10MB per image operation.
        """
        import io

        tracemalloc.start()

        def process_image():
            # Simulate image processing pipeline
            buffer = io.BytesIO()
            sample_image_small.save(buffer, format="PNG")
            buffer.seek(0)
            return Image.open(buffer)

        result = benchmark(process_image)
        current, peak = tracemalloc.get_traced_memory()
        tracemalloc.stop()

        # Peak memory should be under 10MB per operation
        assert peak < MAX_IMAGE_PROC_MEMORY_MB * 1024 * 1024, f"Peak memory {peak / 1024 / 1024:.2f}MB exceeds {MAX_IMAGE_PROC_MEMORY_MB}MB limit"
        assert result is not None


