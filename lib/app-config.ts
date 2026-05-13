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
    // images
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "image/bmp",
    "image/svg+xml",
    "image/avif",

    // video
    "video/mp4",
    "video/webm",
    "video/quicktime",
    "video/ogg",

    // audio
    "audio/mpeg",
    "audio/wav",
    "audio/x-wav",
    "audio/mp4",
    "audio/aac",
    "audio/ogg",
    "audio/flac",

    // documents
    "application/pdf",
    "text/plain",
    "text/csv",
    "application/json",
    "application/xml",
    "text/markdown",

    // office
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",

    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",

    "application/vnd.ms-powerpoint",
    "application/vnd.openxmlformats-officedocument.presentationml.presentation",

    // open document
    "application/vnd.oasis.opendocument.text",
    "application/vnd.oasis.opendocument.spreadsheet",
    "application/vnd.oasis.opendocument.presentation"
  ],

  allowedExtensions: [
    // images
    "jpg",
    "jpeg",
    "png",
    "webp",
    "gif",
    "bmp",
    "svg",
    "avif",

    // video
    "mp4",
    "webm",
    "mov",
    "m4v",
    "ogg",

    // audio
    "mp3",
    "wav",
    "m4a",
    "aac",
    "oga",
    "flac",

    // documents
    "pdf",
    "txt",
    "csv",
    "json",
    "xml",
    "md",

    // office
    "doc",
    "docx",
    "xls",
    "xlsx",
    "ppt",
    "pptx",

    // open document
    "odt",
    "ods",
    "odp"
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
