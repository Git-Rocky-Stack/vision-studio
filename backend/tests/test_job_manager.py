"""
Integration tests for the JobManager class.

Tests job lifecycle (creation → status transitions → listing → cleanup)
and thread safety of the job manager.
"""
import pathlib
import sys
import tempfile
import unittest
from datetime import datetime, timedelta
from threading import Thread

BACKEND_ROOT = pathlib.Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from utils.job_manager import JobManager, GenerationJob, JobStatus


class JobManagerLifecycleTests(unittest.TestCase):
    """Tests for the full job lifecycle."""

    def setUp(self):
        self.manager = JobManager()

    def _make_job(self, job_id="job-1", job_type="image", status=JobStatus.PENDING):
        return GenerationJob(
            id=job_id,
            type=job_type,
            status=status,
            params={"prompt": "test"},
            output_dir=f"/tmp/outputs/{job_id}",
        )

    def test_add_and_get_job(self):
        job = self._make_job()
        self.manager.add_job(job)

        retrieved = self.manager.get_job("job-1")
        self.assertIsNotNone(retrieved)
        self.assertEqual(retrieved.id, "job-1")
        self.assertEqual(retrieved.status, JobStatus.PENDING)

    def test_get_nonexistent_job_returns_none(self):
        self.assertIsNone(self.manager.get_job("nonexistent"))

    def test_update_job_status_transition(self):
        job = self._make_job()
        self.manager.add_job(job)

        # pending → processing
        self.manager.update_job("job-1", status=JobStatus.PROCESSING, progress=25.0)
        updated = self.manager.get_job("job-1")
        self.assertEqual(updated.status, JobStatus.PROCESSING)
        self.assertEqual(updated.progress, 25.0)

        # processing → completed
        self.manager.update_job(
            "job-1",
            status=JobStatus.COMPLETED,
            progress=100.0,
            result={"images": ["/outputs/job-1/image_001.png"], "seed": 42},
            completed_at=datetime.now(),
        )
        completed = self.manager.get_job("job-1")
        self.assertEqual(completed.status, JobStatus.COMPLETED)
        self.assertEqual(completed.progress, 100.0)
        self.assertIn("images", completed.result)
        self.assertIsNotNone(completed.completed_at)

    def test_update_job_failure_path(self):
        job = self._make_job()
        self.manager.add_job(job)

        self.manager.update_job(
            "job-1",
            status=JobStatus.FAILED,
            error="Out of VRAM",
            completed_at=datetime.now(),
        )

        failed = self.manager.get_job("job-1")
        self.assertEqual(failed.status, JobStatus.FAILED)
        self.assertEqual(failed.error, "Out of VRAM")

    def test_update_job_cancellation(self):
        job = self._make_job(status=JobStatus.PROCESSING)
        self.manager.add_job(job)

        self.manager.update_job(
            "job-1",
            status=JobStatus.CANCELLED,
            completed_at=datetime.now(),
        )

        cancelled = self.manager.get_job("job-1")
        self.assertEqual(cancelled.status, JobStatus.CANCELLED)

    def test_update_nonexistent_job_is_noop(self):
        # Should not raise
        self.manager.update_job("nonexistent", status=JobStatus.COMPLETED)

    def test_delete_job(self):
        job = self._make_job()
        self.manager.add_job(job)
        self.assertTrue(self.manager.delete_job("job-1"))
        self.assertIsNone(self.manager.get_job("job-1"))

    def test_delete_nonexistent_returns_false(self):
        self.assertFalse(self.manager.delete_job("nonexistent"))


class JobManagerListingTests(unittest.TestCase):
    """Tests for job listing and filtering."""

    def setUp(self):
        self.manager = JobManager()
        # Create a mix of jobs
        for i, status in enumerate(
            [JobStatus.PENDING, JobStatus.PROCESSING, JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.COMPLETED]
        ):
            job = GenerationJob(
                id=f"job-{i}",
                type="image",
                status=status,
                params={"prompt": f"test {i}"},
                output_dir=f"/tmp/outputs/job-{i}",
            )
            self.manager.add_job(job)

    def test_list_all_jobs(self):
        jobs = self.manager.list_jobs()
        self.assertEqual(len(jobs), 5)

    def test_list_jobs_by_status(self):
        completed = self.manager.list_jobs(status="completed")
        self.assertEqual(len(completed), 2)
        for job in completed:
            self.assertEqual(job.status, JobStatus.COMPLETED)

    def test_list_jobs_with_limit(self):
        jobs = self.manager.list_jobs(limit=3)
        self.assertEqual(len(jobs), 3)

    def test_list_jobs_sorted_newest_first(self):
        jobs = self.manager.list_jobs()
        for i in range(len(jobs) - 1):
            self.assertGreaterEqual(jobs[i].created_at, jobs[i + 1].created_at)

    def test_cleanup_old_jobs_removes_only_terminal_jobs_past_max_age(self):
        old_completed = GenerationJob(
            id="old-completed",
            type="image",
            status=JobStatus.COMPLETED,
            params={},
            output_dir="/tmp/outputs/old-completed",
            created_at=datetime.now() - timedelta(hours=25),
        )
        old_processing = GenerationJob(
            id="old-processing",
            type="image",
            status=JobStatus.PROCESSING,
            params={},
            output_dir="/tmp/outputs/old-processing",
            created_at=datetime.now() - timedelta(hours=25),
        )
        recent_failed = GenerationJob(
            id="recent-failed",
            type="image",
            status=JobStatus.FAILED,
            params={},
            output_dir="/tmp/outputs/recent-failed",
            created_at=datetime.now(),
        )

        manager = JobManager()
        manager.add_job(old_completed)
        manager.add_job(old_processing)
        manager.add_job(recent_failed)

        removed_count = manager.cleanup_old_jobs(max_age_hours=24)

        self.assertEqual(removed_count, 1)
        self.assertIsNone(manager.get_job("old-completed"))
        self.assertIsNotNone(manager.get_job("old-processing"))
        self.assertIsNotNone(manager.get_job("recent-failed"))


class JobManagerSerializationTests(unittest.TestCase):
    """Tests for the job to_dict serialization contract."""

    def test_to_dict_contract(self):
        job = GenerationJob(
            id="job-1",
            type="image",
            status=JobStatus.COMPLETED,
            params={"prompt": "sunset", "width": 1024},
            output_dir="/tmp/outputs/job-1",
            progress=100.0,
            result={"images": ["/outputs/job-1/image_001.png"], "seed": 42},
            completed_at=datetime.now(),
        )

        d = job.to_dict()

        # Verify all required contract fields
        self.assertEqual(d["id"], "job-1")
        self.assertEqual(d["type"], "image")
        self.assertEqual(d["status"], "completed")  # enum .value
        self.assertEqual(d["progress"], 100.0)
        self.assertIsInstance(d["created_at"], str)
        self.assertIsInstance(d["completed_at"], str)
        self.assertEqual(d["result"]["images"], ["/outputs/job-1/image_001.png"])
        self.assertEqual(d["params"]["prompt"], "sunset")
        self.assertIsNone(d["error"])

    def test_to_dict_with_no_result(self):
        job = GenerationJob(
            id="job-2",
            type="video",
            status=JobStatus.PENDING,
            params={},
            output_dir="/tmp/outputs/job-2",
        )

        d = job.to_dict()
        self.assertEqual(d["status"], "pending")
        self.assertIsNone(d["result"])
        self.assertIsNone(d["completed_at"])


class JobManagerCallbackTests(unittest.TestCase):
    """Tests for the subscribe/unsubscribe/callback mechanism."""

    def setUp(self):
        self.manager = JobManager()
        self.manager.add_job(
            GenerationJob(
                id="job-1",
                type="image",
                status=JobStatus.PENDING,
                params={},
                output_dir="/tmp/outputs/job-1",
            )
        )

    def test_subscribe_receives_update_callbacks(self):
        received = []
        self.manager.subscribe("job-1", lambda job: received.append(job.progress))

        self.manager.update_job("job-1", progress=50.0)
        self.manager.update_job("job-1", progress=100.0)

        self.assertEqual(received, [50.0, 100.0])

    def test_unsubscribe_stops_callbacks(self):
        received = []
        callback = lambda job: received.append(job.progress)

        self.manager.subscribe("job-1", callback)
        self.manager.update_job("job-1", progress=25.0)

        self.manager.unsubscribe("job-1", callback)
        self.manager.update_job("job-1", progress=75.0)

        self.assertEqual(received, [25.0])

    def test_callback_error_does_not_break_updates(self):
        def bad_callback(job):
            raise ValueError("Callback crash")

        received = []
        self.manager.subscribe("job-1", bad_callback)
        self.manager.subscribe("job-1", lambda job: received.append(job.progress))

        # Should not raise despite bad_callback
        self.manager.update_job("job-1", progress=50.0)
        self.assertEqual(received, [50.0])


class JobManagerConcurrencyTests(unittest.TestCase):
    """Basic thread-safety smoke tests."""

    def test_concurrent_add_and_list(self):
        manager = JobManager()

        def add_jobs(start):
            for i in range(50):
                manager.add_job(
                    GenerationJob(
                        id=f"job-{start + i}",
                        type="image",
                        status=JobStatus.PENDING,
                        params={},
                        output_dir=f"/tmp/outputs/job-{start + i}",
                    )
                )

        t1 = Thread(target=add_jobs, args=(0,))
        t2 = Thread(target=add_jobs, args=(100,))
        t1.start()
        t2.start()
        t1.join()
        t2.join()

        jobs = manager.list_jobs(limit=200)
        self.assertEqual(len(jobs), 100)


if __name__ == "__main__":
    unittest.main()
