import { APP_CONFIG, type ContentType, type PlanType } from "./app-config";

export function getPlanPricing(planType: PlanType) {
  return APP_CONFIG.plans[planType];
}

export function getPricePer1000ViewsUsd(
  planType: PlanType,
  contentType: ContentType
) {
  const plan = getPlanPricing(planType);

  if (contentType === "text") {
    return plan.textPricePer1000ViewsUsd;
  }

  if (contentType === "url") {
    return plan.urlPricePer1000ViewsUsd;
  }

  return plan.mediaPricePer1000ViewsUsd;
}

export function getApproxViewsFromCreditPoints(
  creditPoints: number,
  planType: PlanType,
  contentType: ContentType
) {
  const rate = getPricePer1000ViewsUsd(planType, contentType);

  if (rate <= 0 || !Number.isFinite(rate)) {
    return 0;
  }

  return Math.floor((creditPoints / rate) * 1000);
}

export function formatUsd(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2
  }).format(value);
}
