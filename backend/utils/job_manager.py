"""
Job Manager - Manages generation jobs
"""

from enum import Enum
from dataclasses import dataclass, field
from datetime import datetime, timedelta
from typing import Optional, Dict, List, Callable, Any
from threading import Lock


class JobStatus(Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


@dataclass
class GenerationJob:
    id: str
    type: str  # 'image' or 'video'
    status: JobStatus
    params: Dict[str, Any]
    output_dir: str
    progress: float = 0.0
    result: Optional[Dict[str, Any]] = None
    error: Optional[str] = None
    created_at: datetime = field(default_factory=datetime.now)
    completed_at: Optional[datetime] = None
    
    def to_dict(self) -> Dict:
        return {
            "id": self.id,
            "type": self.type,
            "status": self.status.value,
            "params": self.params,
            "progress": self.progress,
            "result": self.result,
            "error": self.error,
            "created_at": self.created_at.isoformat(),
            "completed_at": self.completed_at.isoformat() if self.completed_at else None
        }


class JobManager:
    """Thread-safe job manager"""
    
    def __init__(self):
        self._jobs: Dict[str, GenerationJob] = {}
        self._lock = Lock()
        self._callbacks: Dict[str, List[Callable]] = {}
    
    def add_job(self, job: GenerationJob):
        """Add a new job"""
        with self._lock:
            self._jobs[job.id] = job
    
    def get_job(self, job_id: str) -> Optional[GenerationJob]:
        """Get job by ID"""
        with self._lock:
            return self._jobs.get(job_id)
    
    def update_job(self, job_id: str, **kwargs):
        """Update job fields"""
        with self._lock:
            job = self._jobs.get(job_id)
            if job:
                for key, value in kwargs.items():
                    if hasattr(job, key):
                        setattr(job, key, value)
                
                # Notify callbacks
                if job_id in self._callbacks:
                    for callback in self._callbacks[job_id]:
                        try:
                            callback(job)
                        except Exception as e:
                            print(f"Callback error: {e}")
    
    def list_jobs(self, status: Optional[str] = None, limit: int = 50) -> List[GenerationJob]:
        """List jobs with optional filtering"""
        with self._lock:
            jobs = list(self._jobs.values())
            
            # Sort by creation date (newest first)
            jobs.sort(key=lambda j: j.created_at, reverse=True)
            
            # Filter by status
            if status:
                jobs = [j for j in jobs if j.status.value == status]
            
            return jobs[:limit]
    
    def delete_job(self, job_id: str) -> bool:
        """Delete a job"""
        with self._lock:
            if job_id in self._jobs:
                del self._jobs[job_id]
                return True
            return False
    
    def cleanup_old_jobs(self, max_age_hours: int = 24):
        """Remove jobs older than specified hours"""
        with self._lock:
            cutoff = datetime.now() - timedelta(hours=max_age_hours)
            to_delete = [
                job_id for job_id, job in self._jobs.items()
                if job.created_at < cutoff and job.status in [
                    JobStatus.COMPLETED, JobStatus.FAILED, JobStatus.CANCELLED
                ]
            ]
            for job_id in to_delete:
                del self._jobs[job_id]
            return len(to_delete)
    
    def subscribe(self, job_id: str, callback: Callable):
        """Subscribe to job updates"""
        with self._lock:
            if job_id not in self._callbacks:
                self._callbacks[job_id] = []
            self._callbacks[job_id].append(callback)
    
    def unsubscribe(self, job_id: str, callback: Callable):
        """Unsubscribe from job updates"""
        with self._lock:
            if job_id in self._callbacks:
                if callback in self._callbacks[job_id]:
                    self._callbacks[job_id].remove(callback)
