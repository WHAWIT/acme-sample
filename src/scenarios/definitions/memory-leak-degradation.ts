import { ScenarioDefinition } from '../scenario.types';

export const memoryLeakDegradation: ScenarioDefinition = {
  name: 'memory-leak-degradation',
  description:
    'Heap usage grows steadily while request latency degrades in step; metrics snapshots show heapUsedMb climbing without recovery between GC cycles.',
  defaultDurationMinutes: 30,
  suggestedMonitorQuery: 'heapUsedMb trending upward in metrics_snapshot together with rising latencyMs',
};
