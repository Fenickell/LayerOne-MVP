(function initPricingEngine(globalScope) {
  const DEFAULT_PRECISION = 2;

  const MARKETPLACE_PRESETS = {
    shopee: {
      id: "shopee",
      name: "Shopee",
      editable: true,
      feeModel: "tiered",
      validatedAt: "2026-05",
      notes: "Preset inicial editável. Taxa fixa aplicada por item comercial vendido, incluindo kits.",
      tiers: [
        { label: "Abaixo de R$8", min: 0, max: 7.99, percent: 50, fixed: 0 },
        { label: "R$8 a R$79,99", min: 8, max: 79.99, percent: 20, fixed: 4 },
        { label: "R$80 a R$99,99", min: 80, max: 99.99, percent: 14, fixed: 16 },
        { label: "R$100 a R$199,99", min: 100, max: 199.99, percent: 14, fixed: 20 },
        { label: "R$200 ou mais", min: 200, max: null, percent: 14, fixed: 26 }
      ]
    },
    mercadoLivre: {
      id: "mercadoLivre",
      name: "Mercado Livre",
      editable: true,
      feeModel: "flat",
      percent: 16,
      fixed: 0,
      notes: "Preset genérico. Ajustar por categoria, tipo de anúncio e regra vigente."
    },
    lojaPropria: {
      id: "lojaPropria",
      name: "Loja própria",
      editable: true,
      feeModel: "flat",
      percent: 0,
      fixed: 0
    },
    b2bDireto: {
      id: "b2bDireto",
      name: "B2B direto",
      editable: true,
      feeModel: "flat",
      percent: 0,
      fixed: 0
    }
  };

  function toNumber(value, fallback = 0) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : fallback;
  }

  function round(value, precision = DEFAULT_PRECISION) {
    const factor = 10 ** precision;
    return Math.round((toNumber(value) + Number.EPSILON) * factor) / factor;
  }

  function clamp(value, min, max) {
    return Math.min(max, Math.max(min, value));
  }

  function minutesToHours(hours = 0, minutes = 0) {
    return toNumber(hours) + toNumber(minutes) / 60;
  }

  function normalizePercent(percent) {
    return toNumber(percent) / 100;
  }

  function resolveProductionInput(input = {}) {
    const mode = input.mode === "plate" ? "plate" : "unit";
    const physicalUnits = mode === "plate"
      ? Math.max(1, toNumber(input.physicalUnits || input.plateQuantity, 1))
      : Math.max(1, toNumber(input.physicalUnits || 1, 1));
    const unitsPerOffer = Math.max(1, toNumber(input.unitsPerOffer || 1, 1));
    const commercialOffers = Math.max(0.0001, physicalUnits / unitsPerOffer);
    const totalWeightGrams = toNumber(input.totalWeightGrams) > 0
      ? toNumber(input.totalWeightGrams)
      : toNumber(input.unitWeightGrams) * physicalUnits;
    const totalTimeHours = toNumber(input.totalTimeHours) > 0
      ? toNumber(input.totalTimeHours)
      : minutesToHours(input.totalTimeWholeHours, input.totalTimeMinutes);
    const fallbackUnitTimeHours = toNumber(input.unitTimeHours) > 0
      ? toNumber(input.unitTimeHours)
      : minutesToHours(input.unitTimeWholeHours, input.unitTimeMinutes);
    const resolvedTimeHours = totalTimeHours > 0 ? totalTimeHours : fallbackUnitTimeHours * physicalUnits;

    return {
      mode,
      physicalUnits,
      unitsPerOffer,
      commercialOffers,
      totalWeightGrams,
      unitWeightGrams: physicalUnits > 0 ? totalWeightGrams / physicalUnits : 0,
      totalTimeHours: resolvedTimeHours,
      averageTimeHoursPerPhysicalUnit: physicalUnits > 0 ? resolvedTimeHours / physicalUnits : 0,
      averageTimeHoursPerOffer: commercialOffers > 0 ? resolvedTimeHours / commercialOffers : 0
    };
  }

  function calculateProductionCost(input = {}) {
    const production = resolveProductionInput(input);
    const filamentCostPerGram = toNumber(input.filamentCostPerGram);
    const materialCost = production.totalWeightGrams * filamentCostPerGram;
    const energyCost = production.totalTimeHours * toNumber(input.printerKw) * toNumber(input.kwhCost);
    const depreciationPerHour = toNumber(input.machineLifeHours) > 0
      ? toNumber(input.machineCost) / toNumber(input.machineLifeHours)
      : 0;
    const depreciationCost = production.totalTimeHours * depreciationPerHour;
    const batchExtraCost = toNumber(input.batchExtraCost);
    const productionSubtotal = materialCost + energyCost + depreciationCost + batchExtraCost;
    const failureCost = productionSubtotal * normalizePercent(input.failureRatePercent);
    const productionBatchCost = productionSubtotal + failureCost;
    const productionCostPerOffer = productionBatchCost / production.commercialOffers;
    const packagingCostPerOffer = toNumber(input.packagingCostPerOffer);
    const laborCostPerOffer = toNumber(input.laborCostPerOffer);
    const extraCostPerOffer = toNumber(input.extraCostPerOffer);
    const finalCostPerOffer = productionCostPerOffer + packagingCostPerOffer + laborCostPerOffer + extraCostPerOffer;

    return {
      ...production,
      materialCost: round(materialCost, 4),
      energyCost: round(energyCost, 4),
      depreciationCost: round(depreciationCost, 4),
      batchExtraCost: round(batchExtraCost, 4),
      failureCost: round(failureCost, 4),
      productionBatchCost: round(productionBatchCost, 4),
      productionCostPerPhysicalUnit: round(productionBatchCost / production.physicalUnits, 4),
      productionCostPerOffer: round(productionCostPerOffer, 4),
      packagingCostPerOffer: round(packagingCostPerOffer, 4),
      laborCostPerOffer: round(laborCostPerOffer, 4),
      extraCostPerOffer: round(extraCostPerOffer, 4),
      finalCostPerOffer: round(finalCostPerOffer, 4)
    };
  }

  function getMarketplaceRule(marketplace = {}, salePrice = 0) {
    if (marketplace.feeModel === "tiered") {
      return (marketplace.tiers || []).find((tier) => {
        const min = toNumber(tier.min);
        const max = tier.max === null || tier.max === undefined ? Infinity : toNumber(tier.max);
        return salePrice >= min && salePrice <= max;
      }) || null;
    }

    return {
      label: marketplace.name || "Taxa fixa",
      min: 0,
      max: null,
      percent: toNumber(marketplace.percent),
      fixed: toNumber(marketplace.fixed)
    };
  }

  function calculateMarketplaceFee(marketplace = {}, salePrice = 0) {
    const price = Math.max(0, toNumber(salePrice));
    const rule = getMarketplaceRule(marketplace, price);
    if (!rule) {
      return {
        marketplaceName: marketplace.name || "Marketplace",
        ruleLabel: "Sem regra aplicável",
        percentageFee: 0,
        fixedFee: 0,
        totalFee: 0,
        effectivePercent: 0
      };
    }

    const basePercent = toNumber(rule.percent);
    const additionalPercent = toNumber(marketplace.additionalPercent);
    const percentageFee = price * normalizePercent(basePercent + additionalPercent);
    const fixedFee = toNumber(rule.fixed) + toNumber(marketplace.additionalFixed);
    const totalFee = percentageFee + fixedFee;

    return {
      marketplaceName: marketplace.name || "Marketplace",
      ruleLabel: rule.label || marketplace.name || "Regra",
      percentageFee: round(percentageFee, 4),
      fixedFee: round(fixedFee, 4),
      totalFee: round(totalFee, 4),
      effectivePercent: price > 0 ? round((totalFee / price) * 100, 4) : 0,
      appliedPercent: round(basePercent + additionalPercent, 4)
    };
  }

  function calculateNetResult({ salePrice = 0, costPerOffer = 0, marketplace = {}, taxPercent = 0 } = {}) {
    const price = Math.max(0, toNumber(salePrice));
    const marketplaceFee = calculateMarketplaceFee(marketplace, price);
    const taxCost = price * normalizePercent(taxPercent);
    const totalDeductions = toNumber(costPerOffer) + marketplaceFee.totalFee + taxCost;
    const netProfit = price - totalDeductions;

    return {
      salePrice: round(price, 2),
      costPerOffer: round(costPerOffer, 4),
      marketplaceFee,
      taxCost: round(taxCost, 4),
      totalDeductions: round(totalDeductions, 4),
      netProfit: round(netProfit, 4),
      netMarginPercent: price > 0 ? round((netProfit / price) * 100, 4) : 0
    };
  }

  function candidatePriceForRule(costPerOffer, targetMarginPercent, taxPercent, rule, marketplace = {}) {
    const percent = normalizePercent(toNumber(rule.percent) + toNumber(marketplace.additionalPercent));
    const fixed = toNumber(rule.fixed) + toNumber(marketplace.additionalFixed);
    const targetMargin = normalizePercent(targetMarginPercent);
    const tax = normalizePercent(taxPercent);
    const denominator = 1 - percent - targetMargin - tax;

    if (denominator <= 0) return null;
    return (toNumber(costPerOffer) + fixed) / denominator;
  }

  function calculateTargetPrice({
    costPerOffer = 0,
    marketplace = MARKETPLACE_PRESETS.lojaPropria,
    targetNetMarginPercent = 0,
    taxPercent = 0,
    minimumPrice = 0.01
  } = {}) {
    const candidates = [];
    const rules = marketplace.feeModel === "tiered"
      ? marketplace.tiers || []
      : [getMarketplaceRule(marketplace, minimumPrice)];

    for (const rule of rules) {
      if (!rule) continue;
      const rawCandidate = candidatePriceForRule(costPerOffer, targetNetMarginPercent, taxPercent, rule, marketplace);
      if (!rawCandidate) continue;

      const min = Math.max(minimumPrice, toNumber(rule.min));
      const max = rule.max === null || rule.max === undefined ? Infinity : toNumber(rule.max);
      const salePrice = Math.max(min, Math.ceil(rawCandidate * 100) / 100);
      if (salePrice <= max) {
        const result = calculateNetResult({ salePrice, costPerOffer, marketplace, taxPercent });
        if (result.netMarginPercent + 0.0001 >= toNumber(targetNetMarginPercent)) {
          candidates.push({ ...result, targetNetMarginPercent: toNumber(targetNetMarginPercent) });
        }
      }
    }

    candidates.sort((a, b) => a.salePrice - b.salePrice);
    return candidates[0] || null;
  }

  function compareUnitVsPlate(unitInput = {}, plateInput = {}) {
    const unit = calculateProductionCost({ ...unitInput, mode: "unit" });
    const plate = calculateProductionCost({ ...plateInput, mode: "plate" });
    const savingsPerOffer = unit.finalCostPerOffer - plate.finalCostPerOffer;

    return {
      unit,
      plate,
      savingsPerOffer: round(savingsPerOffer, 4),
      savingsPercent: unit.finalCostPerOffer > 0 ? round((savingsPerOffer / unit.finalCostPerOffer) * 100, 4) : 0,
      timeSavingsHoursPerOffer: round(unit.averageTimeHoursPerOffer - plate.averageTimeHoursPerOffer, 4)
    };
  }

  function calculateAdvancedPricing(input = {}) {
    const marketplace = input.marketplace || MARKETPLACE_PRESETS.lojaPropria;
    const production = calculateProductionCost(input.production || {});
    const breakEven = calculateTargetPrice({
      costPerOffer: production.finalCostPerOffer,
      marketplace,
      targetNetMarginPercent: 0,
      taxPercent: input.taxPercent || 0
    });
    const suggested = calculateTargetPrice({
      costPerOffer: production.finalCostPerOffer,
      marketplace,
      targetNetMarginPercent: input.targetNetMarginPercent || 0,
      taxPercent: input.taxPercent || 0
    });

    return {
      production,
      marketplace,
      breakEven,
      suggested,
      comparison: input.unitReference && input.production?.mode === "plate"
        ? compareUnitVsPlate(input.unitReference, input.production)
        : null
    };
  }

  const api = {
    MARKETPLACE_PRESETS,
    calculateProductionCost,
    calculateMarketplaceFee,
    calculateNetResult,
    calculateTargetPrice,
    calculateAdvancedPricing,
    compareUnitVsPlate,
    minutesToHours
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = api;
  }

  globalScope.LayerOnePricingEngine = api;
})(typeof window !== "undefined" ? window : globalThis);
