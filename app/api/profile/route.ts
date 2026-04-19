import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { getApproxViewsFromCreditPoints } from "../../../lib/pricing";
import type { ContentType, PlanType } from "../../../lib/app-config";

export const runtime = "nodejs";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl) {
  throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
}

if (!serviceRoleKey) {
  throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

type SubscriptionPeriodRow = {
  id: string;
  user_id: string;
  plan_type: "day" | "month" | "year";
  starts_at: string;
  ends_at: string;
  source: string;
  stripe_event_id: string | null;
  created_at: string;
};

type DisplayPlanItem = {
  planType: "day" | "month" | "year";
  startsAt: string;
  endsAt: string;
};

function isSamePlanType(a: DisplayPlanItem, b: DisplayPlanItem) {
  return a.planType === b.planType;
}

function buildDisplayPlanQueue(periods: SubscriptionPeriodRow[]) {
  if (!periods.length) {
    return {
      currentPlan: null as DisplayPlanItem | null,
      futurePlans: [] as DisplayPlanItem[],
      allMergedPlans: [] as DisplayPlanItem[]
    };
  }

  const sorted = [...periods].sort(
    (a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime()
  );

  const merged: DisplayPlanItem[] = [];

  for (const item of sorted) {
    const nextItem: DisplayPlanItem = {
      planType: item.plan_type,
      startsAt: item.starts_at,
      endsAt: item.ends_at
    };

    const prev = merged[merged.length - 1];

    if (!prev) {
      merged.push(nextItem);
      continue;
    }

    const prevEnds = new Date(prev.endsAt).getTime();
    const nextStarts = new Date(nextItem.startsAt).getTime();
    const gapMs = Math.abs(nextStarts - prevEnds);

    const touchesDirectly = gapMs <= 60 * 1000;

    if (isSamePlanType(prev, nextItem) && touchesDirectly) {
      prev.endsAt = nextItem.endsAt;
      continue;
    }

    merged.push(nextItem);
  }

  const now = Date.now();

  let currentIndex = merged.findIndex((item) => {
    const starts = new Date(item.startsAt).getTime();
    const ends = new Date(item.endsAt).getTime();
    return now >= starts && now <= ends;
  });

  if (currentIndex === -1) {
    currentIndex = merged.findIndex((item) => new Date(item.startsAt).getTime() > now);
  }

  const currentPlan = currentIndex >= 0 ? merged[currentIndex] : null;
  const futurePlans = currentIndex >= 0 ? merged.slice(currentIndex + 1) : merged;

  return {
    currentPlan,
    futurePlans,
    allMergedPlans: merged
  };
}

export async function GET(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get("userId");

    if (!userId) {
      return NextResponse.json({ error: "Chybí userId." }, { status: 400 });
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select(`
        id,
        plan_type,
        subscription_status,
        subscription_expires_at,
        billing_period,
        free_views_remaining,
        credit_points_balance,
        low_views_alert_threshold,
        fallback_text_default,
        views_exhausted_text
      `)
      .eq("id", userId)
      .maybeSingle();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: profileError?.message || "Profil nenalezen." },
        { status: 404 }
      );
    }

    const { data: qrCode, error: qrError } = await supabase
      .from("qr_codes")
      .select(`
        id,
        public_code,
        title,
        content_type,
        text_content,
        custom_url,
        file_name,
        file_key,
        mime_type,
        public_url,
        file_size,
        activation_mode,
        activation_days,
        activation_started_at,
        activation_ends_at,
        max_views_total,
        max_views_enabled,
        fallback_text,
        views_exhausted_text,
        is_active,
        total_valid_views,
        updated_at
      `)
      .eq("user_id", userId)
      .single();

    if (qrError || !qrCode) {
      return NextResponse.json(
        { error: qrError?.message || "QR kód nenalezen." },
        { status: 404 }
      );
    }

    const { data: periods, error: periodsError } = await supabase
      .from("subscription_periods")
      .select(`
        id,
        user_id,
        plan_type,
        starts_at,
        ends_at,
        source,
        stripe_event_id,
        created_at
      `)
      .eq("user_id", userId)
      .order("starts_at", { ascending: true });

    if (periodsError) {
      return NextResponse.json(
        { error: periodsError.message },
        { status: 500 }
      );
    }

    const displayPlanQueue = buildDisplayPlanQueue((periods || []) as SubscriptionPeriodRow[]);

    const planType = profile.plan_type as PlanType;
    const creditBalance = Number(profile.credit_points_balance || 0);

    return NextResponse.json({
      profile,
      qrCode,
      approxViewsFromCredit: {
        text: getApproxViewsFromCreditPoints(creditBalance, planType, "text" as ContentType),
        url: getApproxViewsFromCreditPoints(creditBalance, planType, "url" as ContentType),
        media: getApproxViewsFromCreditPoints(creditBalance, planType, "media" as ContentType)
      },
      subscriptionPlans: {
        currentPlan: displayPlanQueue.currentPlan,
        futurePlans: displayPlanQueue.futurePlans,
        allMergedPlans: displayPlanQueue.allMergedPlans
      }
    });
  } catch (error) {
    console.error("GET /api/profile error:", error);
    return NextResponse.json(
      { error: "Nepodařilo se načíst profil." },
      { status: 500 }
    );
  }
}
