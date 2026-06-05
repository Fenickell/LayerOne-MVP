const assert = require("node:assert/strict");
const {
  MARKETPLACE_PRESETS,
  calculateAdvancedPricing,
  calculateMarketplaceFee,
  calculateProductionCost,
  compareUnitVsPlate
} = require("../pricing-engine.js");

const unitInput = {
  mode: "unit",
  physicalUnits: 1,
  unitWeightGrams: 8,
  unitTimeWholeHours: 0,
  unitTimeMinutes: 40,
  filamentCostPerGram: 0.095,
  kwhCost: 0.95,
  printerKw: 0.12,
  machineCost: 2500,
  machineLifeHours: 3000,
  packagingCostPerOffer: 1.25,
  laborCostPerOffer: 1
};

const unit = calculateProductionCost(unitInput);

const plateInput = {
  mode: "plate",
  physicalUnits: 50,
  unitsPerOffer: 1,
  totalWeightGrams: 414,
  totalTimeWholeHours: 12,
  totalTimeMinutes: 30,
  filamentCostPerGram: 0.095,
  kwhCost: 0.95,
  printerKw: 0.12,
  machineCost: 2500,
  machineLifeHours: 3000,
  packagingCostPerOffer: 1.25,
  laborCostPerOffer: 1
};

const plate = calculateProductionCost(plateInput);

assert.equal(unit.mode, "unit");
assert.equal(plate.mode, "plate");
assert.equal(plate.physicalUnits, 50);
assert.equal(plate.commercialOffers, 50);
assert.ok(plate.finalCostPerOffer < unit.finalCostPerOffer);

const kitPlate = calculateProductionCost({
  mode: "plate",
  physicalUnits: 50,
  unitsPerOffer: 5,
  totalWeightGrams: 414,
  totalTimeWholeHours: 12,
  totalTimeMinutes: 30,
  filamentCostPerGram: 0.095,
  kwhCost: 0.95,
  printerKw: 0.12,
  machineCost: 2500,
  machineLifeHours: 3000,
  packagingCostPerOffer: 1.8,
  laborCostPerOffer: 1.5
});

assert.equal(kitPlate.commercialOffers, 10);
assert.ok(kitPlate.finalCostPerOffer > plate.finalCostPerOffer);

const largerKitThanPlate = calculateProductionCost({
  ...plateInput,
  physicalUnits: 6,
  unitsPerOffer: 12,
  totalWeightGrams: 48
});

assert.equal(largerKitThanPlate.commercialOffers, 0.5);
assert.ok(largerKitThanPlate.finalCostPerOffer > plate.finalCostPerOffer);

const shopeeFee = calculateMarketplaceFee(MARKETPLACE_PRESETS.shopee, 29);
assert.equal(shopeeFee.ruleLabel, "R$8 a R$79,99");
assert.equal(shopeeFee.fixedFee, 4);

const pricing = calculateAdvancedPricing({
  production: {
    mode: "plate",
    physicalUnits: 50,
    unitsPerOffer: 1,
    totalWeightGrams: 414,
    totalTimeWholeHours: 12,
    totalTimeMinutes: 30,
    filamentCostPerGram: 0.095,
    kwhCost: 0.95,
    printerKw: 0.12,
    machineCost: 2500,
    machineLifeHours: 3000,
    packagingCostPerOffer: 1.25,
    laborCostPerOffer: 1
  },
  marketplace: MARKETPLACE_PRESETS.shopee,
  targetNetMarginPercent: 35,
  taxPercent: 0
});

assert.ok(pricing.breakEven.salePrice > pricing.production.finalCostPerOffer);
assert.ok(pricing.suggested.netMarginPercent >= 35);

const comparison = compareUnitVsPlate(unitInput, plateInput);

assert.ok(comparison.savingsPerOffer > 0);

console.log("pricing-engine ok");
