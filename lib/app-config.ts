export type PlanType = "free" | "day" | "month" | "year";
export type ContentType = "text" | "url" | "media";
export type ActivationMode = "days" | "subscription_period" | "unlimited";

export type PlanPricingConfig = {
  subscriptionPriceUsd: number;
  includedFreeViews: number;
  textPricePer1000ViewsUsd: number;
  urlPricePer1000ViewsUsd: number;
  mediaPricePer1000ViewsUsd: number;
};

export const APP_CONFIG = {
  appName: "RQtools",
  maxUploadBytes: 100 * 1024 * 1024,

  allowedMimeTypes: [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "application/pdf",
    "video/mp4",
    "video/webm",
    "text/plain"
  ],

  allowedExtensions: [
    "jpg",
    "jpeg",
    "png",
    "webp",
    "gif",
    "pdf",
    "mp4",
    "webm",
    "txt"
  ],

  antiAbuse: {
    firstWindowMaxScans: 4,
    firstWindowSeconds: 120,
    cooldownWindowMaxScans: 1,
    cooldownWindowSeconds: 60,
    resetAfterIdleMinutes: 60
  },

  defaultTexts: {
    fallback: "QR kód teď není funkční.",
    viewsExhausted: "QR kód teď není aktivní, protože došly views."
  },

  plans: {
    free: {
      subscriptionPriceUsd: 0,
      includedFreeViews: 0,
      textPricePer1000ViewsUsd: 1.2,
      urlPricePer1000ViewsUsd: 999999,
      mediaPricePer1000ViewsUsd: 999999
    },
    day: {
      subscriptionPriceUsd: 2.5,
      includedFreeViews: 2000,
      textPricePer1000ViewsUsd: 0.7,
      urlPricePer1000ViewsUsd: 1.4,
      mediaPricePer1000ViewsUsd: 2.1
    },
    month: {
      subscriptionPriceUsd: 12,
      includedFreeViews: 25000,
      textPricePer1000ViewsUsd: 0.4,
      urlPricePer1000ViewsUsd: 0.9,
      mediaPricePer1000ViewsUsd: 1.4
    },
    year: {
      subscriptionPriceUsd: 99,
      includedFreeViews: 400000,
      textPricePer1000ViewsUsd: 0.25,
      urlPricePer1000ViewsUsd: 0.55,
      mediaPricePer1000ViewsUsd: 0.9
    }
  } satisfies Record<PlanType, PlanPricingConfig>
} as const;

export function isPaidPlan(planType: unknown): planType is "day" | "month" | "year" {
  return planType === "day" || planType === "month" || planType === "year";
}

export function isContentType(value: unknown): value is ContentType {
  return value === "text" || value === "url" || value === "media";
}

export function isActivationMode(value: unknown): value is ActivationMode {
  return value === "days" || value === "subscription_period" || value === "unlimited";
}
