import { cn } from '@/utils/cn';
import {
  Dice5,
  Wand2,
  Clock,
  Heart,
  Copy,
} from 'lucide-react';
import { useState } from 'react';

interface PromptToolbarProps {
  prompt: string;
  isFavorited: boolean;
  onRandomize: () => void;
  onEnhance: () => void;
  onShowHistory: () => void;
  onToggleFavorite: () => void;
}

interface ToolbarButtonProps {
  icon: React.ElementType;
  title: string;
  onClick: () => void;
  active?: boolean;
  activeColor?: string;
}

function ToolbarButton({ icon: Icon, title, onClick, active, activeColor }: ToolbarButtonProps) {
  return (
    <button
      onClick={onClick}
      className={cn(
        'w-7 h-7 flex items-center justify-center rounded-md transition-all',
        active
          ? 'text-red-primary bg-red-aura'
          : 'text-text-muted hover:text-text-primary hover:bg-elevated'
      )}
      style={active && activeColor ? { color: activeColor } : undefined}
      aria-label={title}
      aria-pressed={active}
    >
      <Icon className="w-3.5 h-3.5" />
    </button>
  );
}

export function PromptToolbar({
  prompt,
  isFavorited,
  onRandomize,
  onEnhance,
  onShowHistory,
  onToggleFavorite,
}: PromptToolbarProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    if (!prompt.trim()) return;
    await navigator.clipboard.writeText(prompt);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="flex items-center gap-1 pt-2">
      <ToolbarButton icon={Dice5} title="Randomize prompt" onClick={onRandomize} />
      <ToolbarButton icon={Wand2} title="AI enhance prompt" onClick={onEnhance} />
      <ToolbarButton icon={Clock} title="Prompt history" onClick={onShowHistory} />
      <ToolbarButton
        icon={Heart}
        title={isFavorited ? 'Remove from favorites' : 'Save to favorites'}
        onClick={onToggleFavorite}
        active={isFavorited}
      />
      <ToolbarButton
        icon={Copy}
        title={copied ? 'Copied!' : 'Copy prompt'}
        onClick={handleCopy}
        active={copied}
      />
    </div>
  );
}
