import { useEffect, useState } from 'react';
import { copy } from '@/lib/copy';
import { cn } from '@/lib/utils';
import { Loader2 } from 'lucide-react';

interface LoadingStateProps {
  stage?: 'analyzing' | 'extracting' | 'mapping' | 'generating' | 'quantifying' | 'modeling' | 'scoring' | 'compiling';
  className?: string;
  showProgress?: boolean;
}

const stages = [
  'analyzing',
  'extracting', 
  'mapping',
  'generating',
  'quantifying',
  'modeling',
  'scoring',
  'compiling',
] as const;

export function LoadingState({ stage, className, showProgress = true }: LoadingStateProps) {
  const [currentStage, setCurrentStage] = useState(0);
  
  useEffect(() => {
    if (!stage && showProgress) {
      const interval = setInterval(() => {
        setCurrentStage(prev => (prev + 1) % stages.length);
      }, 2500);
      return () => clearInterval(interval);
    }
  }, [stage, showProgress]);

  const activeStage = stage || stages[currentStage];
  const stageIndex = stages.indexOf(activeStage);
  const progress = ((stageIndex + 1) / stages.length) * 100;

  return (
    <div className={cn('flex flex-col items-center justify-center py-12', className)}>
      <div className="relative mb-6">
        <Loader2 className="w-12 h-12 text-brand-blue animate-spin" />
        <div className="absolute inset-0 w-12 h-12 rounded-full border-4 border-slate-100" />
      </div>
      
      <p className="text-heading-sm text-slate-700 mb-2">
        {copy.status.loading[activeStage]}
      </p>
      
      {showProgress && (
        <div className="w-64 mt-4">
          <div className="h-1 bg-slate-100 rounded-full overflow-hidden">
            <div 
              className="h-full bg-gradient-to-r from-brand-navy to-brand-blue transition-all duration-500 ease-out"
              style={{ width: `${progress}%` }}
            />
          </div>
          <div className="flex justify-between mt-2 text-caption text-slate-400">
            <span>Step {stageIndex + 1} of {stages.length}</span>
            <span>{Math.round(progress)}%</span>
          </div>
        </div>
      )}
    </div>
  );
}
