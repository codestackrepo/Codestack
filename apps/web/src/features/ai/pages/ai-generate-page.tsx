import { useState } from 'react';
import { Sparkles } from 'lucide-react';
import { EmptyState } from '@/components/shared/empty-state';
import { GenerationForm } from '../components/generation-form';
import { GenerationDetail } from '../components/generation-detail';
import { PastGenerations } from '../components/past-generations';

export function AiGeneratePage() {
  const [activeId, setActiveId] = useState<string | null>(null);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <Sparkles className="size-6 text-brand" />
          AI Question Generation
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Turn a topic and your study material into validated, ready-to-use practice problems.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <div className="lg:sticky lg:top-6 lg:self-start">
          <GenerationForm onGenerated={(gen) => setActiveId(gen.id)} />
        </div>

        <div>
          {activeId ? (
            <GenerationDetail generationId={activeId} />
          ) : (
            <EmptyState
              title="No active generation"
              description="Submit the form to generate problems, or pick a past generation below."
            />
          )}
        </div>
      </div>

      <div className="space-y-3">
        <h2 className="text-lg font-semibold">Past generations</h2>
        <PastGenerations activeId={activeId} onSelect={setActiveId} />
      </div>
    </div>
  );
}
