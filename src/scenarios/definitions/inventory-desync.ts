import { ScenarioDefinition } from '../scenario.types';

export const inventoryDesync: ScenarioDefinition = {
  name: 'inventory-desync',
  description:
    'Warehouse stock counts drift from the reservation ledger; allocations succeed against stock that is no longer there and fulfilment surfaces oversells.',
  defaultDurationMinutes: 15,
  suggestedMonitorQuery: 'oversell or insufficient stock errors from inventory after successful allocation',
};
