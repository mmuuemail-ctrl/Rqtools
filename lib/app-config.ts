export type PlanType = "free" | "day" | "month" | "year";
export type PaidPlanType = "day" | "month" | "year";
export type ContentType = "text" | "url" | "media";
export type ActivationMode = "days" | "subscription_period" | "unlimited";
export type CheckoutBillingMode = "one_time" | "subscription";

export type PlanPricingConfig = {
  priceEur: number;
  includedFreeViews: number;
  textPricePer1000ViewsEur: number;
  urlPricePer1000ViewsEur: number;
  mediaPricePer1000ViewsEur: number;
  allowOneTime: boolean;
  allowSubscription: boolean;
};

export const APP_CONFIG = {
  appName: "RQtools",
  currency: "eur",
  creditPointValueEur: 1,
  maxUploadBytes: 100 * 1024 * 1024,

  allowedMimeTypes: [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",

    "application/pdf",

    "video/mp4",
    "video/webm",
    "video/x-ms-wmv",
    "video/wmv",
    "video/x-msvideo",
    "application/octet-stream",

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
    "wmv",
    "avi",

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
      priceEur: 0,
      includedFreeViews: 0,
      textPricePer1000ViewsEur: 1.2,
      urlPricePer1000ViewsEur: 999999,
      mediaPricePer1000ViewsEur: 999999,
      allowOneTime: false,
      allowSubscription: false
    },

    day: {
      priceEur: 2.5,
      includedFreeViews: 2000,
      textPricePer1000ViewsEur: 0.7,
      urlPricePer1000ViewsEur: 1.4,
      mediaPricePer1000ViewsEur: 2.1,
      allowOneTime: true,
      allowSubscription: false
    },

    month: {
      priceEur: 12,
      includedFreeViews: 25000,
      textPricePer1000ViewsEur: 0.4,
      urlPricePer1000ViewsEur: 0.9,
      mediaPricePer1000ViewsEur: 1.4,
      allowOneTime: true,
      allowSubscription: true
    },

    year: {
      priceEur: 99,
      includedFreeViews: 400000,
      textPricePer1000ViewsEur: 0.25,
      urlPricePer1000ViewsEur: 0.55,
      mediaPricePer1000ViewsEur: 0.9,
      allowOneTime: true,
      allowSubscription: true
    }
  } satisfies Record<PlanType, PlanPricingConfig>
} as const;

export function isPaidPlan(planType: unknown): planType is PaidPlanType {
  return planType === "day" || planType === "month" || planType === "year";
}

export function isContentType(value: unknown): value is ContentType {
  return value === "text" || value === "url" || value === "media";
}

export function isActivationMode(value: unknown): value is ActivationMode {
  return value === "days" || value === "subscription_period" || value === "unlimited";
}

export function isCheckoutBillingMode(value: unknown): value is CheckoutBillingMode {
  return value === "one_time" || value === "subscription";
}
