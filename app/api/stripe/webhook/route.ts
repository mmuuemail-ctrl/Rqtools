import Stripe from "stripe";
import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { APP_CONFIG } from "../../../../lib/app-config";

export const runtime = "nodejs";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!stripeSecretKey) {
  throw new Error("Missing STRIPE_SECRET_KEY");
}

if (!webhookSecret) {
  throw new Error("Missing STRIPE_WEBHOOK_SECRET");
}

if (!supabaseUrl) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
}

if (!serviceRoleKey) {
  throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
}

const stripe = new Stripe(stripeSecretKey, {
  apiVersion: "2025-02-24.acacia"
});

const supabase = createClient(supabaseUrl, serviceRoleKey);

function parsePositiveInt(value: unknown, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const intValue = Math.floor(parsed);
  return intValue > 0 ? intValue : fallback;
}

function parseMoney(value: unknown, fallback = 0) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function addDays(date: Date, days: number) {
  const copy = new Date(date);
  copy.setUTCDate(copy.getUTCDate() + days);
  return copy;
}

function addMonths(date: Date, months: number) {
  const copy = new Date(date);
  copy.setUTCMonth(copy.getUTCMonth() + months);
  return copy;
}

function addYears(date: Date, years: number) {
  const copy = new Date(date);
  copy.setUTCFullYear(copy.getUTCFullYear() + years);
  return copy;
}

async function markEventStarted(eventId: string, eventType: string) {
  const { data, error } = await supabase
    .from("stripe_webhook_events")
    .insert({
      event_id: eventId,
      event_type: eventType
    })
    .select("id")
    .maybeSingle();

  if (error) {
    if (error.code === "23505") {
      return false;
    }

    throw new Error(error.message);
  }

  return !!data;
}

async function getProfile(userId: string) {
  const { data, error } = await supabase
    .from("profiles")
    .select(`
      id,
      plan_type,
      subscription_status,
      subscription_expires_at,
      billing_period,
      free_views_remaining,
      credit_points_balance,
      stripe_customer_id,
      stripe_subscription_id
    `)
    .eq("id", userId)
    .single();

  if (error || !data) {
    throw new Error(error?.message || "Profil nenalezen.");
  }

  return data;
}

async function getLastSubscriptionPeriodEnd(userId: string) {
  const { data, error } = await supabase
    .from("subscription_periods")
    .select("ends_at")
    .eq("user_id", userId)
    .order("ends_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data?.ends_at) {
    return null;
  }

  return data.ends_at as string;
}

function getFutureBaseDate(currentIso: string | null) {
  if (!currentIso) return new Date();

  const current = new Date(currentIso);
  if (Number.isNaN(current.getTime())) return new Date();

  return current.getTime() > Date.now() ? current : new Date();
}

async function recalculateProfileSubscriptionState(userId: string) {
  const { data: periods, error } = await supabase
    .from("subscription_periods")
    .select("plan_type, starts_at, ends_at")
    .eq("user_id", userId)
    .order("starts_at", { ascending: true });

  if (error) {
    throw new Error(error.message);
  }

  const now = Date.now();
  const all = periods || [];

  const active = all.find((item) => {
    const starts = new Date(item.starts_at).getTime();
    const ends = new Date(item.ends_at).getTime();
    return now >= starts && now <= ends;
  });

  if (active) {
    const updateRes = await supabase
      .from("profiles")
      .update({
        plan_type: active.plan_type,
        subscription_status: "active",
        billing_period: active.plan_type,
        subscription_expires_at: active.ends_at
      })
      .eq("id", userId);

    if (updateRes.error) {
      throw new Error(updateRes.error.message);
    }

    return;
  }

  const future = all.find((item) => new Date(item.starts_at).getTime() > now);

  if (future) {
    const updateRes = await supabase
      .from("profiles")
      .update({
        plan_type: future.plan_type,
        subscription_status: "active",
        billing_period: future.plan_type,
        subscription_expires_at: future.ends_at
      })
      .eq("id", userId);

    if (updateRes.error) {
      throw new Error(updateRes.error.message);
    }

    return;
  }

  const updateRes = await supabase
    .from("profiles")
    .update({
      plan_type: "free",
      subscription_status: "inactive",
      subscription_expires_at: null,
      billing_period: null,
      free_views_remaining: 0,
      stripe_subscription_id: null
    })
    .eq("id", userId);

  if (updateRes.error) {
    throw new Error(updateRes.error.message);
  }
}

async function applyPlanPurchase(
  userId: string,
  planType: "day" | "month" | "year",
  dayCount: number,
  stripeEventId: string
) {
  const profile = await getProfile(userId);
  const lastPeriodEnd = await getLastSubscriptionPeriodEnd(userId);
  const base = getFutureBaseDate(lastPeriodEnd || profile.subscription_expires_at);

  let startsAt = base.toISOString();
  let endsAt: string | null = null;
  let freeViews = 0;

  if (planType === "day") {
    endsAt = addDays(base, dayCount).toISOString();
    freeViews = APP_CONFIG.plans.day.includedFreeViews * dayCount;
  }

  if (planType === "month") {
    endsAt = addMonths(base, 1).toISOString();
    freeViews = APP_CONFIG.plans.month.includedFreeViews;
  }

  if (planType === "year") {
    endsAt = addYears(base, 1).toISOString();
    freeViews = APP_CONFIG.plans.year.includedFreeViews;
  }

  const insertRes = await supabase.from("subscription_periods").insert({
    user_id: userId,
    plan_type: planType,
    starts_at: startsAt,
    ends_at: endsAt,
    source: "stripe_checkout",
    stripe_event_id: stripeEventId
  });

  if (insertRes.error) {
    throw new Error(insertRes.error.message);
  }

  const updateRes = await supabase
    .from("profiles")
    .update({
      free_views_remaining: Number(profile.free_views_remaining || 0) + freeViews
    })
    .eq("id", userId);

  if (updateRes.error) {
    throw new Error(updateRes.error.message);
  }

  await recalculateProfileSubscriptionState(userId);
}

async function applyCreditPurchase(
  userId: string,
  creditPoints: number,
  pricePaidUsd: number
) {
  const profile = await getProfile(userId);
  const nextBalance = Number(profile.credit_points_balance || 0) + creditPoints;

  const updateRes = await supabase
    .from("profiles")
    .update({
      credit_points_balance: nextBalance
    })
    .eq("id", userId);

  if (updateRes.error) {
    throw new Error(updateRes.error.message);
  }

  const insertRes = await supabase
    .from("credit_purchases")
    .insert({
      user_id: userId,
      purchased_points: creditPoints,
      price_paid_usd: pricePaidUsd,
      source: "stripe_checkout"
    });

  if (insertRes.error) {
    throw new Error(insertRes.error.message);
  }
}

async function downgradeBySubscriptionId(stripeSubscriptionId: string) {
  const { data, error } = await supabase
    .from("profiles")
    .select("id")
    .eq("stripe_subscription_id", stripeSubscriptionId)
    .maybeSingle();

  if (error) {
    throw new Error(error.message);
  }

  if (!data?.id) {
    return;
  }

  await recalculateProfileSubscriptionState(data.id);
}

async function handleCheckoutCompleted(session: Stripe.Checkout.Session, eventId: string) {
  const metadata = (session.metadata || {}) as Record<string, string>;
  const purchaseType = metadata.purchase_type || "";
  const userId = metadata.user_id || session.client_reference_id || "";

  if (!userId) {
    throw new Error("Missing user_id in checkout metadata.");
  }

  if (purchaseType === "plan") {
    const rawPlanType = metadata.plan_type;
    const dayCount = parsePositiveInt(metadata.day_count, 1);

    if (rawPlanType !== "day" && rawPlanType !== "month" && rawPlanType !== "year") {
      throw new Error("Invalid plan_type.");
    }

    const customerId =
      typeof session.customer === "string"
        ? session.customer
        : session.customer && "id" in session.customer
        ? session.customer.id
        : null;

    const subscriptionId =
      typeof session.subscription === "string"
        ? session.subscription
        : session.subscription && "id" in session.subscription
        ? session.subscription.id
        : null;

    await applyPlanPurchase(userId, rawPlanType, dayCount, eventId);

    const updateRes = await supabase
      .from("profiles")
      .update({
        stripe_customer_id: customerId,
        stripe_subscription_id: subscriptionId
      })
      .eq("id", userId);

    if (updateRes.error) {
      throw new Error(updateRes.error.message);
    }

    return;
  }

  if (purchaseType === "credit") {
    const creditPoints = parsePositiveInt(metadata.credit_points, 0);
    const totalUsd = parseMoney(metadata.total_usd, creditPoints);

    if (creditPoints <= 0) {
      throw new Error("Invalid credit points.");
    }

    await applyCreditPurchase(userId, creditPoints, totalUsd);
    return;
  }

  throw new Error(`Unknown purchase_type: ${purchaseType}`);
}

export async function POST(req: Request) {
  const signature = req.headers.get("stripe-signature");

  if (!signature) {
    return NextResponse.json({ error: "Missing Stripe signature" }, { status: 400 });
  }

  const body = await req.text();

  let event: Stripe.Event;

  try {
    event = stripe.webhooks.constructEvent(body, signature, webhookSecret);
  } catch (err) {
    console.error("Webhook signature verification failed:", err);
    return NextResponse.json({ error: "Invalid Stripe webhook signature" }, { status: 400 });
  }

  try {
    const started = await markEventStarted(event.id, event.type);

    if (!started) {
      return NextResponse.json({ received: true, duplicate: true });
    }

    if (event.type === "checkout.session.completed") {
      const session = event.data.object as Stripe.Checkout.Session;
      await handleCheckoutCompleted(session, event.id);
    }

    if (event.type === "customer.subscription.deleted") {
      const subscription = event.data.object as Stripe.Subscription;
      await downgradeBySubscriptionId(subscription.id);
    }

    if (event.type === "invoice.payment_failed") {
      const invoice = event.data.object as Stripe.Invoice & {
        subscription?: string | Stripe.Subscription | null;
      };

      const subscriptionId =
        typeof invoice.subscription === "string"
          ? invoice.subscription
          : invoice.subscription && "id" in invoice.subscription
          ? invoice.subscription.id
          : null;

      if (subscriptionId) {
        await downgradeBySubscriptionId(subscriptionId);
      }
    }

    return NextResponse.json({ received: true });
  } catch (error) {
    console.error("Stripe webhook processing error:", error);
    return NextResponse.json({ error: "Webhook processing failed" }, { status: 500 });
  }
}
