import { memo } from 'react';
import { useAppStore } from '@/store/appStore';
import { motion } from 'framer-motion';

export const GenerationProgress = memo(function GenerationProgress() {
  const { activeJobs } = useAppStore();
  const activeJob = activeJobs.find(
    (j) => j.status === 'pending' || j.status === 'processing'
  );

  if (!activeJob) return null;

  const progress = activeJob.progress || 0;
  const radius = 52;
  const circumference = 2 * Math.PI * radius;
  const strokeOffset = circumference - (progress / 100) * circumference;

  // Estimate step from progress and params
  const totalSteps = activeJob.params?.steps || 25;
  const currentStep = Math.round((progress / 100) * totalSteps);
  const model = typeof activeJob.params?.model === 'string' ? activeJob.params.model : 'model pending';
  const runtime = typeof activeJob.params?.runtime === 'string' ? activeJob.params.runtime : 'local';

  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9 }}
      animate={{ opacity: 1, scale: 1 }}
      exit={{ opacity: 0, scale: 0.9 }}
      className="absolute inset-0 z-30 flex items-center justify-center pointer-events-none"
    >
      {/* Backdrop blur */}
      <div className="absolute inset-0 bg-void/40 backdrop-blur-sm" />

      {/* Progress surface */}
      <div className="relative flex flex-col items-center gap-3 rounded-md border border-border bg-elevated/95 px-6 py-5 shadow-cinematic">
        <div
          className="relative w-[120px] h-[120px]"
          role="progressbar"
          aria-valuenow={Math.round(progress)}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-label="Generation progress"
        >
          <svg
            viewBox="0 0 120 120"
            className="w-full h-full -rotate-90"
          >
            {/* Track */}
            <circle
              cx="60"
              cy="60"
              r={radius}
              fill="none"
              stroke="var(--color-border)"
              strokeWidth="6"
            />
            {/* Progress */}
            <circle
              cx="60"
              cy="60"
              r={radius}
              fill="none"
              stroke="url(#progressGradient)"
              strokeWidth="6"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={strokeOffset}
              style={{ transition: 'stroke-dashoffset 0.3s ease-out' }}
            />
            <defs>
              <linearGradient id="progressGradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="var(--color-gradient-progress-start)" />
                <stop offset="100%" stopColor="var(--color-gradient-progress-end)" />
              </linearGradient>
            </defs>
          </svg>

          {/* Center text */}
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="type-title">
              {currentStep}
              <span className="text-text-muted text-sm"> / {totalSteps}</span>
            </span>
          </div>
        </div>

        <div className="text-center">
          <motion.p
            className="type-section text-text-body"
            animate={{ opacity: [0.5, 1, 0.5] }}
            transition={{ duration: 2, repeat: Infinity }}
          >
            Generating...
          </motion.p>
          <p className="mt-1 type-caption" aria-live="polite">
            {Math.round(progress)}% complete
          </p>
          <div className="mt-3 flex items-center justify-center gap-1.5">
            <span className="rounded-md border border-border bg-canvas px-2 py-1 type-meta text-text-body">
              {model}
            </span>
            <span className="rounded-md border border-accent-primary-border bg-accent-primary-muted px-2 py-1 type-meta text-accent-primary">
              {runtime}
            </span>
          </div>
        </div>
      </div>
    </motion.div>
  );
});
