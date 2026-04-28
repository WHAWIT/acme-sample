/**
 * Process-wide runtime state. The deployed version can change at runtime
 * (blue/green rollouts flip the label before instances recycle).
 */
class RuntimeState {
  private currentVersion = process.env.SERVICE_VERSION || '1.4.2';

  readonly instanceId = `acme-orders-${(process.env.K_REVISION || 'local')
    .split('-')
    .slice(-2)
    .join('-')}`;

  get version(): string {
    return this.currentVersion;
  }

  setVersion(version: string): void {
    this.currentVersion = version;
  }
}

export const runtimeState = new RuntimeState();
