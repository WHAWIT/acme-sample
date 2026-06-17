import { Injectable } from '@nestjs/common';
import { createLogger } from '../common/logger';
import {
  Intensity,
  ScenarioActivation,
  ScenarioDefinition,
  ScenarioName,
} from './scenario.types';

const log = createLogger('scenario-engine');

/**
 * In-memory registry of failure scenarios. Activations auto-expire.
 * Simulated dependencies (gateway sim, caches, traffic generators) read
 * the engine; real domain code never does.
 */
@Injectable()
export class ScenarioEngine {
  private readonly definitions = new Map<ScenarioName, ScenarioDefinition>();
  private readonly active = new Map<ScenarioName, ScenarioActivation>();
  private readonly timers = new Map<ScenarioName, NodeJS.Timeout>();

  register(def: ScenarioDefinition): void {
    this.definitions.set(def.name, def);
  }

  list(): Array<ScenarioDefinition & { activation?: ScenarioActivation }> {
    return [...this.definitions.values()].map((d) => ({
      ...d,
      activation: this.active.get(d.name),
    }));
  }

  isActive(name: ScenarioName): boolean {
    return this.active.has(name);
  }

  intensity(name: ScenarioName): Intensity | undefined {
    return this.active.get(name)?.intensity;
  }

  /** Numeric intensity factor: low=1, medium=2, high=4. 0 when inactive. */
  factor(name: ScenarioName): number {
    const i = this.intensity(name);
    return i === 'low' ? 1 : i === 'medium' ? 2 : i === 'high' ? 4 : 0;
  }

  start(name: ScenarioName, opts: { durationMinutes?: number; intensity?: Intensity } = {}): ScenarioActivation {
    const def = this.definitions.get(name);
    if (!def) throw new Error(`Unknown scenario: ${name}`);
    this.stop(name, 'stopped', true);

    const intensity = opts.intensity ?? 'medium';
    const durationMinutes = opts.durationMinutes ?? def.defaultDurationMinutes;
    const activation: ScenarioActivation = {
      name,
      intensity,
      startedAt: new Date(),
      expiresAt: new Date(Date.now() + durationMinutes * 60_000),
    };
    this.active.set(name, activation);
    this.timers.set(
      name,
      setTimeout(() => this.stop(name, 'expired'), durationMinutes * 60_000),
    );
    def.onStart?.(intensity);
    log.info({ event: 'scenario_started', scenario: name, intensity, durationMinutes }, `Scenario ${name} started (${intensity}, ${durationMinutes}m)`);
    return activation;
  }

  stop(name: ScenarioName, reason: 'expired' | 'stopped' = 'stopped', quiet = false): boolean {
    const wasActive = this.active.delete(name);
    const timer = this.timers.get(name);
    if (timer) clearTimeout(timer);
    this.timers.delete(name);
    if (wasActive) {
      this.definitions.get(name)?.onStop?.(reason);
      if (!quiet) {
        log.info({ event: 'scenario_stopped', scenario: name, reason }, `Scenario ${name} ${reason}`);
      }
    }
    return wasActive;
  }

  stopAll(): number {
    let n = 0;
    for (const name of [...this.active.keys()]) {
      if (this.stop(name)) n++;
    }
    return n;
  }
}
