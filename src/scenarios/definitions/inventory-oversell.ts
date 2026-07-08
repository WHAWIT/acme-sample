import { HOT_SKUS } from '../../inventory/oversell-config';
import { ScenarioDefinition } from '../scenario.types';

export const inventoryOversell: ScenarioDefinition = {
  name: 'inventory-oversell',
  description:
    `A flash sale concentrates demand on two hot SKUs (${HOT_SKUS.join(', ')}) at large quantities while their true stock sits below the reservation ledger; allocations clear against inflated availability and surface oversell_detected and order_backordered.`,
  defaultDurationMinutes: 15,
  suggestedMonitorQuery:
    'oversell_detected / order_backordered concentrated on a small set of hot SKUs',
};
