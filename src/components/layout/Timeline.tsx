import { useState } from 'react';
import { cn } from '@/utils/cn';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Scissors,
  Trash2,
  Copy,
  Layers,
} from 'lucide-react';
import { motion } from 'framer-motion';

interface TimelineTrack {
  id: string;
  type: 'video' | 'image' | 'audio' | 'text';
  name: string;
  duration: number;
  startTime: number;
  color: string;
}

export function Timeline() {
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);

  // Sample tracks
  const tracks: TimelineTrack[] = [
    { id: '1', type: 'video', name: 'Generated Video 1', duration: 5, startTime: 0, color: '#e63946' },
    { id: '2', type: 'image', name: 'Background', duration: 10, startTime: 0, color: '#6c5ce7' },
    { id: '3', type: 'audio', name: 'Music Track', duration: 15, startTime: 0, color: '#00b894' },
  ];

  const totalDuration = 20;
  const progress = (currentTime / totalDuration) * 100;

  return (
    <div className="h-64 bg-surface border-t border-border flex flex-col">
      {/* Timeline Header */}
      <div className="h-10 border-b border-border flex items-center justify-between px-4 bg-elevated">
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsPlaying(!isPlaying)}
            className="p-1.5 rounded-lg bg-red-primary text-text-primary hover:bg-red-highlight transition-all glow-red-subtle"
          >
            {isPlaying ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
          </button>
          <button className="p-1.5 rounded-lg text-text-body hover:text-text-primary hover:bg-surface transition-all">
            <SkipBack className="w-4 h-4" />
          </button>
          <button className="p-1.5 rounded-lg text-text-body hover:text-text-primary hover:bg-surface transition-all">
            <SkipForward className="w-4 h-4" />
          </button>

          <div className="w-px h-6 bg-border mx-2" />

          <span className="font-mono text-sm text-text-primary">
            {formatTime(currentTime)} / {formatTime(totalDuration)}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button className="p-1.5 rounded-lg text-text-body hover:text-text-primary hover:bg-surface transition-all">
            <Scissors className="w-4 h-4" />
          </button>
          <button className="p-1.5 rounded-lg text-text-body hover:text-text-primary hover:bg-surface transition-all">
            <Copy className="w-4 h-4" />
          </button>
          <button className="p-1.5 rounded-lg text-text-body hover:text-text-primary hover:bg-surface transition-all">
            <Trash2 className="w-4 h-4" />
          </button>

          <div className="w-px h-6 bg-border mx-2" />

          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-text-muted" />
            <span className="font-mono text-xs text-text-muted">{tracks.length} tracks</span>
          </div>
        </div>
      </div>

      {/* Timeline Tracks */}
      <div className="flex-1 overflow-y-auto">
        {/* Time Ruler */}
        <div className="h-6 border-b border-border bg-surface relative">
          {Array.from({ length: Math.ceil(totalDuration) + 1 }).map((_, i) => (
            <div
              key={i}
              className="absolute top-0 h-full flex items-end pb-1"
              style={{ left: `${(i / totalDuration) * 100}%` }}
            >
              <span className="font-mono text-[10px] text-text-muted">{i}s</span>
            </div>
          ))}
        </div>

        {/* Tracks */}
        <div className="relative">
          {/* Playhead */}
          <motion.div
            className="absolute top-0 bottom-0 w-px bg-red-primary z-20 pointer-events-none"
            style={{ left: `${progress}%` }}
          >
            <div className="absolute -top-1 -left-1.5 w-3 h-3 bg-red-primary rounded-full shadow-[0_0_6px_rgba(230,57,70,0.5)]" />
          </motion.div>

          {tracks.map((track, index) => (
            <div
              key={track.id}
              className="h-12 border-b border-border flex items-center px-4 hover:bg-elevated/50 transition-all group"
            >
              {/* Track Label */}
              <div className="w-48 flex items-center gap-2 flex-shrink-0">
                <div
                  className="w-2.5 h-2.5 rounded"
                  style={{ backgroundColor: track.color }}
                />
                <span className="font-display text-sm text-text-primary truncate">
                  {track.name}
                </span>
              </div>

              {/* Track Clip */}
              <div className="flex-1 relative h-8">
                <motion.div
                  initial={{ scaleX: 0 }}
                  animate={{ scaleX: 1 }}
                  transition={{ duration: 0.3, delay: index * 0.1 }}
                  className="absolute h-full rounded-lg flex items-center px-2 cursor-pointer"
                  style={{
                    left: `${(track.startTime / totalDuration) * 100}%`,
                    width: `${(track.duration / totalDuration) * 100}%`,
                    backgroundColor: `${track.color}15`,
                    border: `1px solid ${track.color}40`,
                  }}
                >
                  <span className="font-display text-xs text-text-primary font-medium truncate">
                    {track.name}
                  </span>
                </motion.div>
              </div>
            </div>
          ))}

          {/* Empty State */}
          {tracks.length === 0 && (
            <div className="h-32 flex items-center justify-center">
              <span className="font-display text-sm text-text-muted">
                No tracks yet. Generate some content!
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function formatTime(seconds: number): string {
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  const ms = Math.floor((seconds % 1) * 100);
  return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}.${ms.toString().padStart(2, '0')}`;
}
