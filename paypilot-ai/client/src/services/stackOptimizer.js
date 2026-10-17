export const PRODUCT_CATEGORIES = [
  { id: 'project-management', label: 'Project management' },
  { id: 'crm', label: 'CRM' },
  { id: 'design', label: 'Design' },
  { id: 'communication', label: 'Communication' },
  { id: 'accounting', label: 'Accounting' },
];

export const GROWTH_SCENARIOS = [
  { id: 'growth-25', label: '+25%', multiplier: 1.25 },
  { id: 'growth-50', label: '+50%', multiplier: 1.5 },
  { id: 'growth-100', label: '+100%', multiplier: 2 },
];

function getMonthlyCost(product, seats) {
  if (
    !Number.isInteger(seats)
    || seats < (product.minSeats ?? 1)
    || seats > (product.maxSeats ?? 10000)
    || product.currency !== 'INR'
    || !Number.isInteger(product.unitPriceCents)
  ) {
    return null;
  }

  const cost = product.pricingModel === 'per_seat'
    ? product.unitPriceCents * seats
    : product.unitPriceCents;

  return Number.isSafeInteger(cost) ? cost : null;
}

function compareFeaturePlan(a, b) {
  if (a.features !== b.features) return b.features - a.features;
  return a.monthlyCostCents - b.monthlyCostCents;
}

export function optimizeStack(products, categories, seats, budgetCents) {
  if (!Number.isInteger(seats) || seats < 1 || seats > 1000) {
    throw new RangeError('Seats must be a whole number between 1 and 1000.');
  }
  if (!Number.isInteger(budgetCents) || budgetCents < 1) {
    throw new RangeError('Budget must be a positive amount in cents.');
  }
  if (!Array.isArray(categories) || categories.length === 0) {
    throw new RangeError('Choose at least one product category.');
  }

  const uniqueCategories = [...new Set(categories)];
  const options = uniqueCategories.map((category) =>
    products
      .filter((product) => product.active && product.category === category)
      .map((product) => {
        const monthlyCostCents = getMonthlyCost(product, seats);
        if (monthlyCostCents === null) return null;
        return {
          product,
          monthlyCostCents,
          features: Array.isArray(product.features) ? product.features.length : 0,
        };
      })
      .filter(Boolean),
  );

  if (options.some((categoryOptions) => categoryOptions.length === 0)) {
    return { plan: null, cheapest: null };
  }

  let plan = null;
  let cheapest = null;

  function visit(index, items, monthlyCostCents, features) {
    if (index === options.length) {
      const candidate = { items, monthlyCostCents, features };
      if (!cheapest || candidate.monthlyCostCents < cheapest.monthlyCostCents
        || (candidate.monthlyCostCents === cheapest.monthlyCostCents && candidate.features > cheapest.features)) {
        cheapest = candidate;
      }
      if (monthlyCostCents <= budgetCents && (!plan || compareFeaturePlan(candidate, plan) < 0)) {
        plan = candidate;
      }
      return;
    }

    for (const option of options[index]) {
      visit(
        index + 1,
        [...items, option],
        monthlyCostCents + option.monthlyCostCents,
        features + option.features,
      );
    }
  }

  visit(0, [], 0, 0);
  return { plan, cheapest };
}

export function forecastStackGrowth({
  products,
  categories,
  seats,
  budgetCents,
  currentPlan,
}) {
  return GROWTH_SCENARIOS.map((scenario) => {
    const forecastSeats = Math.min(1000, Math.max(seats + 1, Math.ceil(seats * scenario.multiplier)));
    const fixedCosts = currentPlan.items.map((item) => getMonthlyCost(item.product, forecastSeats));
    const fixedPlanMonthlyCents = fixedCosts.every((cost) => cost !== null)
      ? fixedCosts.reduce((total, cost) => total + cost, 0)
      : null;
    const optimized = optimizeStack(products, categories, forecastSeats, budgetCents);

    return {
      ...scenario,
      forecastSeats,
      fixedPlanMonthlyCents,
      fixedPlanAnnualCents: fixedPlanMonthlyCents === null ? null : fixedPlanMonthlyCents * 12,
      optimizedPlan: optimized.plan,
      cheapestPlan: optimized.cheapest,
    };
  });
}

const csvCell = (value) => {
  const safeValue = String(value ?? '').replace(/^[\s]*[=+@-]/, "'$&");
  return `"${safeValue.replaceAll('"', '""')}"`;
};

export function buildProcurementBriefCsv({
  generatedAt,
  seats,
  categories,
  budgetCents,
  plan,
  cheapest,
  scenarios,
}) {
  const rows = [
    ['PayPilot procurement brief'],
    ['Generated at', generatedAt],
    ['Team seats', seats],
    ['Selected categories', categories.join(', ')],
    ['Monthly budget (INR)', (budgetCents / 100).toFixed(2)],
    ['Recommended monthly cost (INR)', (plan.monthlyCostCents / 100).toFixed(2)],
    ['Recommended annual cost (INR)', (plan.monthlyCostCents * 12 / 100).toFixed(2)],
    ['Listed feature count', plan.features],
    [],
    ['Recommended stack'],
    ['Category', 'Product', 'Monthly INR', 'Annual INR', 'Seats'],
    ...plan.items.map(({ product, monthlyCostCents }) => [
      product.category,
      product.name,
      (monthlyCostCents / 100).toFixed(2),
      (monthlyCostCents * 12 / 100).toFixed(2),
      seats,
    ]),
  ];

  if (cheapest) {
    rows.push(
      [],
      ['Lowest-cost complete stack'],
      ['Category', 'Product', 'Monthly INR', 'Annual INR', 'Seats'],
      ...cheapest.items.map(({ product, monthlyCostCents }) => [
        product.category,
        product.name,
        (monthlyCostCents / 100).toFixed(2),
        (monthlyCostCents * 12 / 100).toFixed(2),
        seats,
      ]),
    );
  }

  rows.push(
    [],
    ['Growth scenarios at current budget'],
    ['Scenario', 'Forecast seats', 'Current stack monthly INR', 'Optimized monthly INR', 'Optimized stack'],
    ...scenarios.map((scenario) => [
      scenario.label,
      scenario.forecastSeats,
      scenario.fixedPlanMonthlyCents === null
        ? 'Seat limit exceeded'
        : (scenario.fixedPlanMonthlyCents / 100).toFixed(2),
      scenario.optimizedPlan
        ? (scenario.optimizedPlan.monthlyCostCents / 100).toFixed(2)
        : 'No complete stack within budget',
      scenario.optimizedPlan?.items.map((item) => item.product.name).join(', ')
        || scenario.cheapestPlan?.items.map((item) => item.product.name).join(', ')
        || 'No eligible products',
    ]),
  );

  return rows.map((row) => row.map(csvCell).join(',')).join('\r\n');
}
