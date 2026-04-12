import { NextRequest, NextResponse } from "next/server";
import { getApproxViewsFromCreditPoints } from "../../../lib/pricing";
import type { ContentType, PlanType } from "../../../lib/app-config";
import { supabaseAdmin } from "../../../lib/supabase-admin";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get("userId");

    if (!userId) {
      return NextResponse.json({ error: "Chybí userId." }, { status: 400 });
    }

    const { data: profile, error: profileError } = await supabaseAdmin
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

    const { data: qrCode, error: qrError } = await supabaseAdmin
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

    const planType = profile.plan_type as PlanType;
    const creditBalance = Number(profile.credit_points_balance || 0);

    return NextResponse.json({
      profile,
      qrCode,
      approxViewsFromCredit: {
        text: getApproxViewsFromCreditPoints(creditBalance, planType, "text" as ContentType),
        url: getApproxViewsFromCreditPoints(creditBalance, planType, "url" as ContentType),
        media: getApproxViewsFromCreditPoints(creditBalance, planType, "media" as ContentType)
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
