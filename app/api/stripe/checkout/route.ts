import Stripe from "stripe";
import { NextResponse } from "next/server";
import { APP_CONFIG, type PlanType } from "../../../../lib/app-config";

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
  if (!Number.isFinite(parsed)) return fallback;
  const intValue = Math.floor(parsed);
  return intValue > 0 ? intValue : fallback;
}

function isPaidPlanType(value: unknown): value is Exclude<PlanType, "free"> {
  return value === "day" || value === "month" || value === "year";
}

function getPlanName(planType: Exclude<PlanType, "free">, dayCount: number) {
  if (planType === "day") return `Denní plán (${dayCount} dnů)`;
  if (planType === "month") return "Měsíční plán";
  return "Roční plán";
}

export async function POST(req: Request) {
  try {
    if (!stripeSecretKey || !stripe) {
      return NextResponse.json(
        { error: "Chybí STRIPE_SECRET_KEY ve Vercel Environment Variables." },
        { status: 500 }
      );
    }

    if (!baseUrl) {
      return NextResponse.json(
        { error: "Chybí NEXT_PUBLIC_BASE_URL ve Vercel Environment Variables." },
        { status: 500 }
      );
    }

    const body = await req.json();

    const mode = typeof body.mode === "string" ? body.mode : "";
    const userId = typeof body.userId === "string" ? body.userId : "";
    const recurring = body.recurring === true;

    if (!userId) {
      return NextResponse.json({ error: "Chybí userId." }, { status: 400 });
    }

    if (mode === "plan") {
      const planType = body.planType;

      if (!isPaidPlanType(planType)) {
        return NextResponse.json({ error: "Neplatný plán." }, { status: 400 });
      }

      const dayCount = parsePositiveInt(body.dayCount, 1);
      const plan = APP_CONFIG.plans[planType];

      const totalEur =
        planType === "day"
          ? plan.priceEur * dayCount
          : plan.priceEur;

      const includedViews =
        planType === "day"
          ? plan.includedFreeViews * dayCount
          : plan.includedFreeViews;

      const session = await stripe.checkout.sessions.create({
        mode: recurring && planType !== "day" ? "subscription" : "payment",
        payment_method_types: ["card"],
        success_url: `${baseUrl}/subscribe?success=1`,
        cancel_url: `${baseUrl}/subscribe?canceled=1`,
        client_reference_id: userId,
        metadata: {
          purchase_type: "plan",
          user_id: userId,
          plan_type: planType,
          day_count: String(dayCount),
          recurring: String(recurring && planType !== "day"),
          total_eur: String(totalEur)
        },
        line_items: [
          {
            price_data: {
              currency: "eur",
              unit_amount: Math.round(totalEur * 100),
              recurring:
                recurring && planType !== "day"
                  ? {
                      interval: planType === "month" ? "month" : "year"
                    }
                  : undefined,
              product_data: {
                name: getPlanName(planType, dayCount),
                description: `Views zdarma: ${includedViews.toLocaleString("cs-CZ")}`
              }
            },
            quantity: 1
          }
        ]
      });

      if (!session.url) {
        return NextResponse.json({ error: "Stripe nevrátil checkout URL." }, { status: 500 });
      }

      return NextResponse.json({ url: session.url });
    }

    if (mode === "credit") {
      const creditPoints = parsePositiveInt(body.creditPoints, 1);
      const totalEur = creditPoints;

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
        return NextResponse.json({ error: "Stripe nevrátil checkout URL." }, { status: 500 });
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
