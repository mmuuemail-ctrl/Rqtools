import Stripe from "stripe";
import { NextResponse } from "next/server";
import { APP_CONFIG, type PlanType } from "../../../../lib/app-config";

export const runtime = "nodejs";

const stripeSecretKey = process.env.STRIPE_SECRET_KEY;
const baseUrl = process.env.NEXT_PUBLIC_BASE_URL;

const stripe = stripeSecretKey
  ? new Stripe(stripeSecretKey, {
      apiVersion: "2025-08-27.basil"
    })
  : null;

function parsePositiveInt(value: unknown, fallback = 1) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const intValue = Math.floor(parsed);
  return intValue > 0 ? intValue : fallback;
}

function isPlanType(value: unknown): value is PlanType {
  return value === "free" || value === "day" || value === "month" || value === "year";
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
      return NextResponse.json({ error: "Chybí userId." }, { status: 400 });
    }

    if (mode === "plan") {
      const planType = body.planType;

      if (!isPlanType(planType) || planType === "free") {
        return NextResponse.json({ error: "Neplatný plán." }, { status: 400 });
      }

      const dayCount = parsePositiveInt(body.dayCount, 1);
      const plan = APP_CONFIG.plans[planType];
      const totalUsd =
        planType === "day"
          ? plan.subscriptionPriceUsd * dayCount
          : plan.subscriptionPriceUsd;

      const session = await stripe.checkout.sessions.create({
        mode: "payment",
        payment_method_types: ["card"],
        success_url: `${baseUrl}/subscribe?success=1`,
        cancel_url: `${baseUrl}/subscribe?canceled=1`,
        client_reference_id: userId,
        metadata: {
          purchase_type: "plan",
          user_id: userId,
          plan_type: planType,
          day_count: String(dayCount),
          total_usd: String(totalUsd)
        },
        line_items: [
          {
            price_data: {
              currency: "usd",
              unit_amount: Math.round(totalUsd * 100),
              product_data: {
                name:
                  planType === "day"
                    ? `Denní plán (${dayCount} dnů)`
                    : planType === "month"
                    ? "Měsíční plán"
                    : "Roční plán",
                description: `Views zdarma: ${
                  planType === "day" ? plan.includedFreeViews * dayCount : plan.includedFreeViews
                }`
              }
            },
            quantity: 1
          }
        ]
      });

      if (!session.url) {
        return NextResponse.json({ error: "Stripe nevrátil URL." }, { status: 500 });
      }

      return NextResponse.json({ url: session.url });
    }

    if (mode === "credit") {
      const creditPoints = parsePositiveInt(body.creditPoints, 1);
      const totalUsd = creditPoints;

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
          total_usd: String(totalUsd)
        },
        line_items: [
          {
            price_data: {
              currency: "usd",
              unit_amount: Math.round(totalUsd * 100),
              product_data: {
                name: `Kreditní body (${creditPoints})`,
                description: "1 kreditní bod = 1 USD"
              }
            },
            quantity: 1
          }
        ]
      });

      if (!session.url) {
        return NextResponse.json({ error: "Stripe nevrátil URL." }, { status: 500 });
      }

      return NextResponse.json({ url: session.url });
    }

    return NextResponse.json({ error: "Neplatný režim checkoutu." }, { status: 400 });
  } catch (error) {
    console.error("POST /api/stripe/checkout error:", error);

    const message =
      error instanceof Error ? error.message : "Nepodařilo se vytvořit Stripe checkout.";

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
