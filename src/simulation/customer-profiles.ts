/**
 * Fixed customer population used by the traffic generators. Stable ids keep
 * queries and orders correlated across restarts. Profiles flagged
 * `zeroOrders` belong to registered customers who never buy anything —
 * lookups against them always return empty result sets.
 */
export type Warehouse = 'US-EAST-1' | 'US-WEST-2' | 'EU-CENTRAL-1';

export interface CustomerProfile {
  id: string;
  name: string;
  b2b: boolean;
  country: string;
  city: string;
  street: string;
  zip: string;
  warehouse: Warehouse;
  zeroOrders?: boolean;
}

export const CUSTOMER_PROFILES: CustomerProfile[] = [
  { id: 'cus_ah3k2m', name: 'Emma Johnson', b2b: false, country: 'US', city: 'New York', street: '245 W 52nd St', zip: '10019', warehouse: 'US-EAST-1' },
  { id: 'cus_bq9x1p', name: 'Liam Rodriguez', b2b: false, country: 'US', city: 'Austin', street: '1809 Barton Springs Rd', zip: '78704', warehouse: 'US-EAST-1' },
  { id: 'cus_cw7d4n', name: 'Olivia Chen', b2b: false, country: 'US', city: 'San Francisco', street: '1266 Valencia St', zip: '94110', warehouse: 'US-WEST-2' },
  { id: 'cus_dr2f8t', name: 'Noah Patel', b2b: false, country: 'US', city: 'Seattle', street: '400 Pine St', zip: '98101', warehouse: 'US-WEST-2' },
  { id: 'cus_ez5g6v', name: 'Ava Thompson', b2b: false, country: 'US', city: 'Chicago', street: '3021 N Clark St', zip: '60657', warehouse: 'US-EAST-1' },
  { id: 'cus_fj8h3w', name: 'Sofía Herrera', b2b: false, country: 'ES', city: 'Madrid', street: 'Calle Peñalver 12', zip: '28006', warehouse: 'EU-CENTRAL-1' },
  { id: 'cus_gk1j7y', name: 'Lukas Schneider', b2b: false, country: 'DE', city: 'Berlin', street: 'Müllerstraße 5', zip: '13353', warehouse: 'EU-CENTRAL-1' },
  { id: 'cus_hm4k9z', name: 'Mariana Alves', b2b: false, country: 'PT', city: 'Porto', street: 'São João 88', zip: '4000-123', warehouse: 'EU-CENTRAL-1' },
  { id: 'cus_in6l2a', name: 'Chloé Dubois', b2b: false, country: 'FR', city: 'Lyon', street: '14 Rue de la République', zip: '69002', warehouse: 'EU-CENTRAL-1' },
  { id: 'cus_jp9m5b', name: 'Mia Novak', b2b: false, country: 'AT', city: 'Wien', street: 'Kärntner Straße 21', zip: '1010', warehouse: 'EU-CENTRAL-1' },
  { id: 'cus_kq2n8c', name: 'Northwind Supply Co', b2b: true, country: 'US', city: 'Newark', street: '77 Frelinghuysen Ave', zip: '07114', warehouse: 'US-EAST-1' },
  { id: 'cus_lr5p1d', name: 'Ethan Brooks', b2b: false, country: 'US', city: 'Denver', street: '1550 Larimer St', zip: '80202', warehouse: 'US-WEST-2' },
  { id: 'cus_ms8q4e', name: 'Isabella Rossi', b2b: false, country: 'IT', city: 'Milano', street: 'Via Torino 34', zip: '20123', warehouse: 'EU-CENTRAL-1' },
  { id: 'cus_nt1r7f', name: 'William Hughes', b2b: false, country: 'GB', city: 'Manchester', street: '18 Deansgate', zip: 'M3 1AY', warehouse: 'EU-CENTRAL-1' },
  { id: 'cus_ou4s9g', name: 'Baumarkt Hoffmann GmbH', b2b: true, country: 'DE', city: 'Köln', street: 'Hohenzollernring 57', zip: '50672', warehouse: 'EU-CENTRAL-1' },
  { id: 'cus_pv7t2h', name: 'Charlotte Evans', b2b: false, country: 'US', city: 'Boston', street: '360 Newbury St', zip: '02115', warehouse: 'US-EAST-1' },
  { id: 'cus_qw9u5j', name: 'Daniel Kim', b2b: false, country: 'US', city: 'Portland', street: '1022 SE Hawthorne Blvd', zip: '97214', warehouse: 'US-WEST-2' },
  { id: 'cus_rx2v8k', name: 'Amélie Laurent', b2b: false, country: 'FR', city: 'Paris', street: '92 Rue du Faubourg Saint-Honoré', zip: '75008', warehouse: 'EU-CENTRAL-1' },
  { id: 'cus_sy5w1l', name: 'Henrik Andersen', b2b: false, country: 'NL', city: 'Amsterdam', street: 'Prinsengracht 263', zip: '1016 GV', warehouse: 'EU-CENTRAL-1' },
  { id: 'cus_tz8x4m', name: 'Iberia Office Solutions SL', b2b: true, country: 'ES', city: 'Barcelona', street: 'Carrer de Mallorca 401', zip: '08013', warehouse: 'EU-CENTRAL-1' },
  { id: 'cus_ua1y7n', name: 'Grace Miller', b2b: false, country: 'US', city: 'Atlanta', street: '675 Ponce de Leon Ave NE', zip: '30308', warehouse: 'US-EAST-1' },
  { id: 'cus_vb4z9p', name: 'Mateo García', b2b: false, country: 'ES', city: 'Valencia', street: 'Avinguda del Port 15', zip: '46021', warehouse: 'EU-CENTRAL-1' },
  { id: 'cus_wc7a2q', name: 'Hannah Fischer', b2b: false, country: 'DE', city: 'München', street: 'Leopoldstraße 88', zip: '80802', warehouse: 'EU-CENTRAL-1' },
  { id: 'cus_xd9b5r', name: 'James O’Connor', b2b: false, country: 'IE', city: 'Dublin', street: '41 Camden Street Lower', zip: 'D02 XY61', warehouse: 'EU-CENTRAL-1' },
  { id: 'cus_ye2c8s', name: 'Great Lakes Retail LLC', b2b: true, country: 'US', city: 'Cleveland', street: '1240 W 6th St', zip: '44113', warehouse: 'US-EAST-1' },
  { id: 'cus_zf5d1t', name: 'Lucía Fernández', b2b: false, country: 'ES', city: 'Sevilla', street: 'Calle Sierpes 44', zip: '41004', warehouse: 'EU-CENTRAL-1' },
  { id: 'cus_ag8e4u', name: 'Benjamin Wright', b2b: false, country: 'US', city: 'Phoenix', street: '4747 N Central Ave', zip: '85012', warehouse: 'US-WEST-2' },
  { id: 'cus_bh1f7v', name: 'Freja Lindqvist', b2b: false, country: 'FI', city: 'Helsinki', street: 'Mannerheimintie 12', zip: '00100', warehouse: 'EU-CENTRAL-1' },
  { id: 'cus_cj4g9w', name: 'Atelier Fournier SARL', b2b: true, country: 'FR', city: 'Bordeaux', street: '5 Cours de l’Intendance', zip: '33000', warehouse: 'EU-CENTRAL-1' },
  { id: 'cus_dk7h2x', name: 'Sophia Nguyen', b2b: false, country: 'US', city: 'San Diego', street: '3745 India St', zip: '92103', warehouse: 'US-WEST-2' },
  { id: 'cus_el9j5y', name: 'Tiago Sousa', b2b: false, country: 'PT', city: 'Lisboa', street: 'Rua Augusta 210', zip: '1100-053', warehouse: 'EU-CENTRAL-1' },
  { id: 'cus_fm2k8z', name: 'Van Dijk Kantoor BV', b2b: true, country: 'NL', city: 'Rotterdam', street: 'Coolsingel 104', zip: '3011 AG', warehouse: 'EU-CENTRAL-1' },
  { id: 'cus_gn5l1a', name: 'Ella Martin', b2b: false, country: 'GB', city: 'London', street: '221 Baker Street', zip: 'NW1 6XE', warehouse: 'EU-CENTRAL-1' },
  { id: 'cus_hp8m4b', name: 'Jakob Weber', b2b: false, country: 'DE', city: 'Hamburg', street: 'Mönckebergstraße 7', zip: '20095', warehouse: 'EU-CENTRAL-1' },
  { id: 'cus_iq1n7c', name: 'Amara Washington', b2b: false, country: 'US', city: 'Charlotte', street: '525 N Tryon St', zip: '28202', warehouse: 'US-EAST-1' },

  // Registered accounts with no purchase history.
  { id: 'cus_jr4p9d', name: 'Harold Whitfield', b2b: false, country: 'US', city: 'Buffalo', street: '617 Main St', zip: '14203', warehouse: 'US-EAST-1', zeroOrders: true },
  { id: 'cus_ks7q2e', name: 'Ingrid Sørensen', b2b: false, country: 'NL', city: 'Utrecht', street: 'Oudegracht 158', zip: '3511 AZ', warehouse: 'EU-CENTRAL-1', zeroOrders: true },
  { id: 'cus_lt9r5f', name: 'Tomás Carvalho', b2b: false, country: 'PT', city: 'Braga', street: 'Avenida da Liberdade 642', zip: '4710-249', warehouse: 'EU-CENTRAL-1', zeroOrders: true },
  { id: 'cus_mu2s8g', name: 'Beatrice Kaufmann', b2b: false, country: 'AT', city: 'Graz', street: 'Herrengasse 3', zip: '8010', warehouse: 'EU-CENTRAL-1', zeroOrders: true },
  { id: 'cus_nv5t1h', name: 'Walter Brandt', b2b: false, country: 'DE', city: 'Leipzig', street: 'Grimmaische Straße 10', zip: '04109', warehouse: 'EU-CENTRAL-1', zeroOrders: true },
];

export const PROMO_CODES = ['WELCOME10', 'VIP20', 'FREESHIP'];

/** Rolled out with the summer campaign; storefront starts sending it on the new release. */
export const NEW_PROMO = 'SUMMER25';
