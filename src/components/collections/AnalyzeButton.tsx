import { memo } from 'react';
import { Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/Button';
import { useAppStore } from '@/store/appStore';

interface AnalyzeButtonProps {
  className?: string;
}

export const AnalyzeButton = memo(function AnalyzeButton({ className }: AnalyzeButtonProps) {
  const taggingQueue = useAppStore((s) => s.taggingQueue);
  const analyzeAssets = useAppStore((s) => s.analyzeAssets);

  const untaggedCount = taggingQueue.length;

  return (
    <Button
      variant="secondary"
      size="sm"
      icon={Sparkles}
      className={className}
      onClick={() => {
        if (untaggedCount > 0) return;
        // In a full implementation, this would gather untagged asset IDs
        analyzeAssets([]);
      }}
      disabled={untaggedCount > 0}
    >
      {untaggedCount > 0 ? `Analyzing ${untaggedCount}...` : 'Analyze Untagged'}
    </Button>
  );
});