import Stripe from "stripe";
import { NextResponse } from "next/server";
import {
  APP_CONFIG,
  isCheckoutBillingMode,
  type CheckoutBillingMode,
  type PaidPlanType,
  type PlanType
} from "../../../../lib/app-config";

export const runtime = "nodejs";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;

const stripe = stripeSecretKey
  ? new Stripe(stripeSecretKey, {
      apiVersion: "2025-02-24.acacia"
    })
  : null;

function parsePositiveInt(value: unknown, fallback = 1) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  const intValue = Math.floor(parsed);

  return intValue > 0 ? intValue : fallback;
}

function isPlanType(value: unknown): value is PlanType {
  return (
    value === "free" ||
    value === "day" ||
    value === "month" ||
    value === "year"
  );
}

function getPlanDisplayName(planType: PaidPlanType, dayCount: number) {
  if (planType === "day") {
    return `Denní plán (${dayCount} dnů)`;
  }

  if (planType === "month") {
    return "Měsíční plán";
  }

  return "Roční plán";
}

function getStripeRecurringInterval(planType: PaidPlanType) {
  if (planType === "month") {
    return {
      interval: "month" as const,
      interval_count: 1
    };
  }

  return {
    interval: "year" as const,
    interval_count: 1
  };
}

export async function POST(req: Request) {
  try {
    if (!stripeSecretKey) {
      return NextResponse.json(
        { error: "Missing STRIPE_SECRET_KEY in server environment." },
        { status: 500 }
      );
    }

    if (!baseUrl) {
      return NextResponse.json(
        { error: "Missing NEXT_PUBLIC_BASE_URL in server environment." },
        { status: 500 }
      );
    }

    if (!stripe) {
      return NextResponse.json(
        { error: "Stripe client was not created." },
        { status: 500 }
      );
    }

    const body = await req.json();

    const mode = typeof body.mode === "string" ? body.mode : "";
    const userId = typeof body.userId === "string" ? body.userId : "";

    if (!userId) {
      return NextResponse.json(
        { error: "Chybí userId." },
        { status: 400 }
      );
    }

    if (mode === "plan") {
      const planType = body.planType;
      const billingModeRaw = body.billingMode;

      if (!isPlanType(planType) || planType === "free") {
        return NextResponse.json(
          { error: "Neplatný plán." },
          { status: 400 }
        );
      }

      if (!isCheckoutBillingMode(billingModeRaw)) {
        return NextResponse.json(
          { error: "Neplatný billing mode." },
          { status: 400 }
        );
      }

      const billingMode: CheckoutBillingMode = billingModeRaw;

      const plan = APP_CONFIG.plans[planType];
      const dayCount = parsePositiveInt(body.dayCount, 1);

      if (billingMode === "subscription" && !plan.allowSubscription) {
        return NextResponse.json(
          { error: "Tento plán nepodporuje automatické obnovování." },
          { status: 400 }
        );
      }

      const totalEur =
        planType === "day"
          ? plan.priceEur * dayCount
          : plan.priceEur;

      const includedViews =
        planType === "day"
          ? plan.includedFreeViews * dayCount
          : plan.includedFreeViews;

      const commonMetadata = {
        purchase_type: "plan",
        user_id: userId,
        plan_type: planType,
        billing_mode: billingMode,
        day_count: String(dayCount),
        total_eur: String(totalEur)
      };

      if (billingMode === "subscription") {
        const recurring = getStripeRecurringInterval(planType);

        const session = await stripe.checkout.sessions.create({
          mode: "subscription",
          payment_method_types: ["card"],
          success_url: `${baseUrl}/subscribe?success=1`,
          cancel_url: `${baseUrl}/subscribe?canceled=1`,
          client_reference_id: userId,
          metadata: commonMetadata,
          subscription_data: {
            metadata: commonMetadata
          },
          line_items: [
            {
              price_data: {
                currency: "eur",
                recurring,
                unit_amount: Math.round(totalEur * 100),
                product_data: {
                  name: `${getPlanDisplayName(planType, dayCount)} AUTO`,
                  description: `Automatické obnovování · Views zdarma: ${includedViews}`
                }
              },
              quantity: 1
            }
          ]
        });

        if (!session.url) {
          return NextResponse.json(
            { error: "Stripe nevrátil URL." },
            { status: 500 }
          );
        }

        return NextResponse.json({
          url: session.url
        });
      }

      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        payment_method_types: ["card"],
        success_url: `${baseUrl}/subscribe?success=1`,
        cancel_url: `${baseUrl}/subscribe?canceled=1`,
        client_reference_id: userId,
        metadata: commonMetadata,
        line_items: [
          {
            price_data: {
              currency: "eur",
              unit_amount: Math.round(totalEur * 100),
              product_data: {
                name: getPlanDisplayName(planType, dayCount),
                description: `Views zdarma: ${includedViews}`
              }
            },
            quantity: 1
          }
        ]
      });

      if (!session.url) {
        return NextResponse.json(
          { error: "Stripe nevrátil URL." },
          { status: 500 }
        );
      }

      return NextResponse.json({
        url: session.url
      });
    }

    if (mode === "credit") {
      const creditPoints = parsePositiveInt(body.creditPoints, 1);

      const totalEur =
        creditPoints * APP_CONFIG.creditPointValueEur;

      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        payment_method_types: ["card"],
        success_url: `${baseUrl}/subscribe?success=1`,
        cancel_url: `${baseUrl}/subscribe?canceled=1`,
        client_reference_id: userId,
        metadata: {
          purchase_type: "credit",
          user_id: userId,
          credit_points: String(creditPoints),
          total_eur: String(totalEur)
        },
        line_items: [
          {
            price_data: {
              currency: "eur",
              unit_amount: Math.round(totalEur * 100),
              product_data: {
                name: `Kreditní body (${creditPoints})`,
                description: "1 kreditní bod = 1 EUR"
              }
            },
            quantity: 1
          }
        ]
      });

      if (!session.url) {
        return NextResponse.json(
          { error: "Stripe nevrátil URL." },
          { status: 500 }
        );
      }

      return NextResponse.json({
        url: session.url
      });
    }

    return NextResponse.json(
      { error: "Neplatný režim checkoutu." },
      { status: 400 }
    );
  } catch (error) {
    console.error("POST /api/stripe/checkout error:", error);

    const message =
      error instanceof Error
        ? error.message
        : "Nepodařilo se vytvořit Stripe checkout.";

    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
