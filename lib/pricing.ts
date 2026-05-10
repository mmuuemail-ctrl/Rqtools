import {
  APP_CONFIG,
  type ContentType,
  type PlanType
} from "./app-config";

export function getPlanPricing(planType: PlanType) {
  return APP_CONFIG.plans[planType];
}

export function getPricePer1000ViewsEur(
  planType: PlanType,
  contentType: ContentType
) {
  const plan = getPlanPricing(planType);

  if (contentType === "text") {
    return plan.textPricePer1000ViewsEur;
  }

  if (contentType === "url") {
    return plan.urlPricePer1000ViewsEur;
  }

  return plan.mediaPricePer1000ViewsEur;
}

export function getApproxViewsFromCreditPoints(
  creditPoints: number,
  planType: PlanType,
  contentType: ContentType
) {
  const rate = getPricePer1000ViewsEur(planType, contentType);

  if (rate <= 0 || !Number.isFinite(rate)) {
    return 0;
  }

  return Math.floor((creditPoints / rate) * 1000);
}

export function formatEur(value: number) {
  return new Intl.NumberFormat("cs-CZ", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 2
  }).format(value);
}
