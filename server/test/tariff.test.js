const assert = require('assert');
const { calculateElectricityCostFromSlabs } = require('../services/billingService');

// Current Sri Lankan Domestic Tariff Structure
const TEST_DOMESTIC_SLABS = [
  // Group A (0–60 kWh)
  { tariff_group: 'DOMESTIC_0_60', group_display_name: 'GROUP A', group_min_consumption: 0, group_max_consumption: 60, slab_min: 0, slab_max: 30, energy_rate: 5.00, fixed_charge: 80.00 },
  { tariff_group: 'DOMESTIC_0_60', group_display_name: 'GROUP A', group_min_consumption: 0, group_max_consumption: 60, slab_min: 31, slab_max: 60, energy_rate: 9.00, fixed_charge: 210.00 },
  
  // Group B (61–180 kWh)
  { tariff_group: 'DOMESTIC_61_180', group_display_name: 'GROUP B', group_min_consumption: 61, group_max_consumption: 180, slab_min: 0, slab_max: 60, energy_rate: 14.00, fixed_charge: 0.00 },
  { tariff_group: 'DOMESTIC_61_180', group_display_name: 'GROUP B', group_min_consumption: 61, group_max_consumption: 180, slab_min: 61, slab_max: 90, energy_rate: 20.00, fixed_charge: 400.00 },
  { tariff_group: 'DOMESTIC_61_180', group_display_name: 'GROUP B', group_min_consumption: 61, group_max_consumption: 180, slab_min: 91, slab_max: 120, energy_rate: 28.00, fixed_charge: 1000.00 },
  { tariff_group: 'DOMESTIC_61_180', group_display_name: 'GROUP B', group_min_consumption: 61, group_max_consumption: 180, slab_min: 121, slab_max: 180, energy_rate: 44.00, fixed_charge: 1500.00 },
  
  // Group C (Above 180 kWh)
  { tariff_group: 'DOMESTIC_ABOVE_180', group_display_name: 'GROUP C', group_min_consumption: 181, group_max_consumption: null, slab_min: 0, slab_max: 180, energy_rate: 32.50, fixed_charge: 0.00 },
  { tariff_group: 'DOMESTIC_ABOVE_180', group_display_name: 'GROUP C', group_min_consumption: 181, group_max_consumption: null, slab_min: 181, slab_max: null, energy_rate: 100.00, fixed_charge: 2500.00 }
];

const testCases = [
  { kwh: 0, expectedGroup: 'DOMESTIC_0_60', expectedEnergy: 0.0, expectedFixed: 80.0, expectedTotal: 80.0 },
  { kwh: 1, expectedGroup: 'DOMESTIC_0_60', expectedEnergy: 5.0, expectedFixed: 80.0, expectedTotal: 85.0 },
  { kwh: 30, expectedGroup: 'DOMESTIC_0_60', expectedEnergy: 150.0, expectedFixed: 80.0, expectedTotal: 230.0 },
  { kwh: 31, expectedGroup: 'DOMESTIC_0_60', expectedEnergy: 159.0, expectedFixed: 210.0, expectedTotal: 369.0 },
  { kwh: 60, expectedGroup: 'DOMESTIC_0_60', expectedEnergy: 420.0, expectedFixed: 210.0, expectedTotal: 630.0 },
  
  // Critical Boundary Transition 60 -> 61 kWh
  { kwh: 61, expectedGroup: 'DOMESTIC_61_180', expectedEnergy: 860.0, expectedFixed: 400.0, expectedTotal: 1260.0 },
  { kwh: 80, expectedGroup: 'DOMESTIC_61_180', expectedEnergy: 1240.0, expectedFixed: 400.0, expectedTotal: 1640.0 },
  { kwh: 90, expectedGroup: 'DOMESTIC_61_180', expectedEnergy: 1440.0, expectedFixed: 400.0, expectedTotal: 1840.0 },
  { kwh: 91, expectedGroup: 'DOMESTIC_61_180', expectedEnergy: 1468.0, expectedFixed: 1000.0, expectedTotal: 2468.0 },
  { kwh: 120, expectedGroup: 'DOMESTIC_61_180', expectedEnergy: 2280.0, expectedFixed: 1000.0, expectedTotal: 3280.0 },
  { kwh: 121, expectedGroup: 'DOMESTIC_61_180', expectedEnergy: 2324.0, expectedFixed: 1500.0, expectedTotal: 3824.0 },
  { kwh: 150, expectedGroup: 'DOMESTIC_61_180', expectedEnergy: 3600.0, expectedFixed: 1500.0, expectedTotal: 5100.0 },
  { kwh: 180, expectedGroup: 'DOMESTIC_61_180', expectedEnergy: 4920.0, expectedFixed: 1500.0, expectedTotal: 6420.0 },
  
  // Critical Boundary Transition 180 -> 181 kWh
  { kwh: 181, expectedGroup: 'DOMESTIC_ABOVE_180', expectedEnergy: 5950.0, expectedFixed: 2500.0, expectedTotal: 8450.0 },
  { kwh: 190, expectedGroup: 'DOMESTIC_ABOVE_180', expectedEnergy: 6850.0, expectedFixed: 2500.0, expectedTotal: 9350.0 }
];

console.log('====================================================');
console.log('Running Sri Lanka Domestic Tariff Validation Tests...');
console.log('====================================================');

let passedCount = 0;
let failedCount = 0;

for (const tc of testCases) {
  try {
    const res = calculateElectricityCostFromSlabs(tc.kwh, TEST_DOMESTIC_SLABS);
    
    assert.strictEqual(res.tariffGroup, tc.expectedGroup, `[${tc.kwh} kWh] Expected group ${tc.expectedGroup}, got ${res.tariffGroup}`);
    assert.strictEqual(res.energyCharge, tc.expectedEnergy, `[${tc.kwh} kWh] Expected energy charge ${tc.expectedEnergy}, got ${res.energyCharge}`);
    assert.strictEqual(res.fixedCharge, tc.expectedFixed, `[${tc.kwh} kWh] Expected fixed charge ${tc.expectedFixed}, got ${res.fixedCharge}`);
    assert.strictEqual(res.totalCharge, tc.expectedTotal, `[${tc.kwh} kWh] Expected total charge ${tc.expectedTotal}, got ${res.totalCharge}`);

    console.log(`✅ Passed: ${tc.kwh.toString().padStart(3)} kWh -> Group: ${res.tariffGroup.padEnd(18)} | Energy: LKR ${res.energyCharge.toFixed(2).padStart(7)} | Fixed: LKR ${res.fixedCharge.toFixed(2).padStart(7)} | Total: LKR ${res.totalCharge.toFixed(2).padStart(8)}`);
    passedCount++;
  } catch (err) {
    console.error(`❌ Failed: ${tc.kwh} kWh - ${err.message}`);
    failedCount++;
  }
}

console.log('----------------------------------------------------');
console.log(`Results: ${passedCount} Passed, ${failedCount} Failed.`);

if (failedCount > 0) {
  process.exit(1);
} else {
  console.log('All Sri Lankan tariff boundary validation tests passed successfully! 🎉');
  process.exit(0);
}
