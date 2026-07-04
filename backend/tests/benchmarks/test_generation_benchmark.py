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


@pytest.fixture
def sample_image_base64() -> str:
    """Create a base64-encoded sample image."""
    import base64
    import io

    img = Image.new("RGB", (64, 64), color="green")
    buffer = io.BytesIO()
    img.save(buffer, format="PNG")
    return base64.b64encode(buffer.getvalue()).decode("ascii")


class TestEditServiceBenchmarks:
    """Benchmarks for Edit service operations."""

    def test_background_removal_latency(self, benchmark, sample_image_base64):
        """Benchmark background removal latency.

        Target: < 2.0 seconds mean latency.
        """
        from services.edit_service import EditService

        async def remove_bg():
            service = EditService()
            return await service.remove_background(sample_image_base64)

        # EditService uses stub implementation - no mocking needed
        # The stub simply converts to RGBA without actual background removal
        result = benchmark.pedantic(
            lambda: asyncio.run(remove_bg()),
            iterations=10,
            rounds=3,
        )

        # Result should be tuple of (image_base64, processing_time)
        assert isinstance(result, tuple)
        assert len(result) == 2

    def test_upscale_4x_latency(self, benchmark, sample_image_base64):
        """Benchmark 4x upscaling latency.

        Target: < 3.0 seconds mean latency.
        """
        from services.edit_service import EditService

        async def upscale_4x():
            service = EditService()
            return await service.upscale(sample_image_base64, scale=4)

        # EditService uses stub implementation (simple PIL resize)
        # No mocking needed - the stub is already fast
        result = benchmark.pedantic(
            lambda: asyncio.run(upscale_4x()),
            iterations=10,
            rounds=3,
        )

        # Result should be tuple of (image_base64, orig_size, new_size, time)
        assert isinstance(result, tuple)

    def test_restore_faces_latency(self, benchmark, sample_image_base64):
        """Benchmark face restoration latency.

        Target: < 2.0 seconds mean latency.
        """
        from services.edit_service import EditService

        async def restore_faces():
            service = EditService()
            return await service.restore_faces(sample_image_base64, fidelity=0.5)

        # EditService uses stub implementation - no mocking needed
        result = benchmark.pedantic(
            lambda: asyncio.run(restore_faces()),
            iterations=10,
            rounds=3,
        )

        # Result should be tuple of (image_base64, faces_detected, processing_time)
        assert isinstance(result, tuple)


class TestMemoryUsageBenchmarks:
    """Benchmarks for memory usage and leaks."""

    def test_memory_usage_edit_service(self):
        """Test EditService memory usage doesn't exceed baseline.

        Target: < 50MB peak memory for 100 create/destroy cycles.
        """
        from services.edit_service import EditService

        tracemalloc.start()

        # Create/destroy several service instances
        for _ in range(100):
            _ = EditService()

        current, peak = tracemalloc.get_traced_memory()
        tracemalloc.stop()

        # Peak memory should be under 50MB
        assert peak < MAX_MEMORY_MB * 1024 * 1024, f"Peak memory {peak / 1024 / 1024:.2f}MB exceeds {MAX_MEMORY_MB}MB limit"

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


