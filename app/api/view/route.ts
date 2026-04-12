import { NextRequest, NextResponse } from "next/server";
import crypto from "crypto";
import { evaluateAntiAbuse } from "../../../lib/anti-abuse";
import { getPricePer1000ViewsUsd } from "../../../lib/pricing";
import type { ContentType, PlanType } from "../../../lib/app-config";
import { supabaseAdmin } from "../../../lib/supabase-admin";

export const runtime = "nodejs";

type ProfileRow = {
  id: string;
  plan_type: PlanType;
  subscription_status: "inactive" | "active" | "expired" | "canceled";
  subscription_expires_at: string | null;
  free_views_remaining: number;
  credit_points_balance: number;
  low_views_alert_threshold: number;
  fallback_text_default: string;
  views_exhausted_text: string;
};

type QrRow = {
  id: string;
  user_id: string;
  public_code: string;
  title: string;
  content_type: ContentType;
  text_content: string | null;
  custom_url: string | null;
  file_name: string | null;
  file_key: string | null;
  mime_type: string | null;
  public_url: string | null;
  file_size: number;
  activation_mode: "days" | "subscription_period" | "unlimited";
  activation_days: number | null;
  activation_started_at: string | null;
  activation_ends_at: string | null;
  max_views_total: number | null;
  max_views_enabled: boolean;
  fallback_text: string;
  views_exhausted_text: string;
  is_active: boolean;
  total_valid_views: number;
};

function createDeviceHash(request: NextRequest) {
  const forwardedFor = request.headers.get("x-forwarded-for") || "";
  const ip = forwardedFor.split(",")[0]?.trim() || "unknown-ip";
  const userAgent = request.headers.get("user-agent") || "unknown-agent";

  return crypto
    .createHash("sha256")
    .update(`${ip}::${userAgent}`)
    .digest("hex");
}

function hasActivePaidSubscription(profile: ProfileRow) {
  if (
    profile.plan_type !== "day" &&
    profile.plan_type !== "month" &&
    profile.plan_type !== "year"
  ) {
    return false;
  }

  if (profile.subscription_status !== "active") {
    return false;
  }

  if (!profile.subscription_expires_at) {
    return false;
  }

  const expiresAt = new Date(profile.subscription_expires_at);
  if (Number.isNaN(expiresAt.getTime())) {
    return false;
  }

  return expiresAt.getTime() > Date.now();
}

function isQrWithinActivation(qr: QrRow, profile: ProfileRow) {
  if (!qr.is_active) {
    return false;
  }

  const now = Date.now();

  if (qr.activation_mode === "subscription_period") {
    if (qr.content_type === "text") {
      return true;
    }
    return hasActivePaidSubscription(profile);
  }

  if (qr.activation_mode === "days") {
    if (!qr.activation_started_at || !qr.activation_days) {
      return false;
    }

    const startedAt = new Date(qr.activation_started_at).getTime();
    if (Number.isNaN(startedAt)) {
      return false;
    }

    const endsAt = startedAt + qr.activation_days * 24 * 60 * 60 * 1000;
    return now >= startedAt && now <= endsAt;
  }

  if (qr.activation_mode === "unlimited") {
    if (qr.content_type === "text") {
      return true;
    }

    return hasActivePaidSubscription(profile);
  }

  return false;
}

function isContentAllowed(qr: QrRow, profile: ProfileRow) {
  if (qr.content_type === "text") {
    return true;
  }

  return hasActivePaidSubscription(profile);
}

function getFallbackText(qr: QrRow, profile: ProfileRow) {
  return (
    qr.fallback_text ||
    profile.fallback_text_default ||
    "QR kód teď není funkční."
  );
}

function getViewsExhaustedText(qr: QrRow, profile: ProfileRow) {
  return (
    qr.views_exhausted_text ||
    profile.views_exhausted_text ||
    "QR kód teď není aktivní, protože došly views."
  );
}

function shouldChargeForScan(qr: QrRow) {
  return qr.content_type === "text" || qr.content_type === "url" || qr.content_type === "media";
}

function roundTo6(value: number) {
  return Math.round(value * 1_000_000) / 1_000_000;
}

async function insertViewEvent(params: {
  qrId: string;
  deviceHash: string;
  wasCounted: boolean;
  blockedReason: string | null;
  chargedFrom: "free_views" | "credit_points" | "none";
  chargedAmount: number;
}) {
  await supabaseAdmin.from("view_events").insert({
    qr_id: params.qrId,
    device_hash: params.deviceHash,
    was_counted: params.wasCounted,
    blocked_reason: params.blockedReason,
    charged_from: params.chargedFrom,
    charged_amount: params.chargedAmount
  });
}

async function maybeCreateLowViewsAlert(profile: ProfileRow) {
  if (!profile.low_views_alert_threshold || profile.low_views_alert_threshold <= 0) {
    return;
  }

  const remainingFree = Number(profile.free_views_remaining || 0);
  if (remainingFree >= profile.low_views_alert_threshold) {
    return;
  }

  const existing = await supabaseAdmin
    .from("alerts")
    .select("id")
    .eq("user_id", profile.id)
    .eq("alert_type", "low_views_threshold")
    .gte("created_at", new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString())
    .limit(1);

  if (existing.data && existing.data.length > 0) {
    return;
  }

  await supabaseAdmin.from("alerts").insert({
    user_id: profile.id,
    alert_type: "low_views_threshold",
    message: `Zbývá méně než ${profile.low_views_alert_threshold.toLocaleString()} views.`
  });
}

async function createViewsExhaustedAlert(profile: ProfileRow) {
  const existing = await supabaseAdmin
    .from("alerts")
    .select("id")
    .eq("user_id", profile.id)
    .eq("alert_type", "views_exhausted")
    .gte("created_at", new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString())
    .limit(1);

  if (existing.data && existing.data.length > 0) {
    return;
  }

  await supabaseAdmin.from("alerts").insert({
    user_id: profile.id,
    alert_type: "views_exhausted",
    message: "QR už není aktivní, protože došly views nebo kredit."
  });
}

export async function GET(request: NextRequest) {
  try {
    const code = request.nextUrl.searchParams.get("code");

    if (!code) {
      return NextResponse.json({ success: false, error: "Chybí veřejný kód." }, { status: 400 });
    }

    const { data: qrCode, error: qrError } = await supabaseAdmin
      .from("qr_codes")
      .select(`
        id,
        user_id,
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
        total_valid_views
      `)
      .eq("public_code", code)
      .single();

    if (qrError || !qrCode) {
      return NextResponse.json({ success: false, error: "QR kód nebyl nalezen." }, { status: 404 });
    }

    const qr = qrCode as QrRow;

    const { data: profile, error: profileError } = await supabaseAdmin
      .from("profiles")
      .select(`
        id,
        plan_type,
        subscription_status,
        subscription_expires_at,
        free_views_remaining,
        credit_points_balance,
        low_views_alert_threshold,
        fallback_text_default,
        views_exhausted_text
      `)
      .eq("id", qr.user_id)
      .single();

    if (profileError || !profile) {
      return NextResponse.json({ success: false, error: "Profil nebyl nalezen." }, { status: 404 });
    }

    const typedProfile = profile as ProfileRow;
    const deviceHash = createDeviceHash(request);

    const priorEventsRes = await supabaseAdmin
      .from("view_events")
      .select("viewed_at, was_counted")
      .eq("qr_id", qr.id)
      .eq("device_hash", deviceHash)
      .gte("viewed_at", new Date(Date.now() - 61 * 60 * 1000).toISOString())
      .order("viewed_at", { ascending: true });

    if (priorEventsRes.error) {
      return NextResponse.json(
        { success: false, error: priorEventsRes.error.message },
        { status: 500 }
      );
    }

    const antiAbuse = evaluateAntiAbuse(priorEventsRes.data || []);

    if (!antiAbuse.shouldCount) {
      await insertViewEvent({
        qrId: qr.id,
        deviceHash,
        wasCounted: false,
        blockedReason: antiAbuse.blockedReason,
        chargedFrom: "none",
        chargedAmount: 0
      });

      if (!isQrWithinActivation(qr, typedProfile) || !isContentAllowed(qr, typedProfile)) {
        return NextResponse.json({
          success: true,
          mode: "fallback",
          title: qr.title || "",
          text: getFallbackText(qr, typedProfile)
        });
      }

      if (qr.content_type === "text") {
        return NextResponse.json({
          success: true,
          mode: "text",
          title: qr.title || "",
          text: qr.text_content || ""
        });
      }

      if (qr.content_type === "url") {
        return NextResponse.json({
          success: true,
          mode: "redirect",
          title: qr.title || "",
          url: qr.custom_url || ""
        });
      }

      return NextResponse.json({
        success: true,
        mode: "file",
        title: qr.title || "",
        fileUrl: qr.public_url || "",
        fileName: qr.file_name || null,
        mimeType: qr.mime_type || null
      });
    }

    if (!isQrWithinActivation(qr, typedProfile) || !isContentAllowed(qr, typedProfile)) {
      await insertViewEvent({
        qrId: qr.id,
        deviceHash,
        wasCounted: false,
        blockedReason: "inactive_or_locked",
        chargedFrom: "none",
        chargedAmount: 0
      });

      return NextResponse.json({
        success: true,
        mode: "fallback",
        title: qr.title || "",
        text: getFallbackText(qr, typedProfile)
      });
    }

    if (qr.max_views_enabled && qr.max_views_total !== null && qr.total_valid_views >= qr.max_views_total) {
      await insertViewEvent({
        qrId: qr.id,
        deviceHash,
        wasCounted: false,
        blockedReason: "qr_max_views_reached",
        chargedFrom: "none",
        chargedAmount: 0
      });

      await createViewsExhaustedAlert(typedProfile);

      return NextResponse.json({
        success: true,
        mode: "fallback",
        title: qr.title || "",
        text: getViewsExhaustedText(qr, typedProfile)
      });
    }

    let chargedFrom: "free_views" | "credit_points" | "none" = "none";
    let chargedAmount = 0;

    if (shouldChargeForScan(qr)) {
      if (typedProfile.free_views_remaining > 0) {
        chargedFrom = "free_views";
        chargedAmount = 1;

        const nextFreeViews = Math.max(typedProfile.free_views_remaining - 1, 0);

        const updateRes = await supabaseAdmin
          .from("profiles")
          .update({
            free_views_remaining: nextFreeViews
          })
          .eq("id", typedProfile.id);

        if (updateRes.error) {
          return NextResponse.json({ success: false, error: updateRes.error.message }, { status: 500 });
        }

        typedProfile.free_views_remaining = nextFreeViews;
        await maybeCreateLowViewsAlert(typedProfile);
      } else {
        const ratePer1000 = getPricePer1000ViewsUsd(
          typedProfile.plan_type,
          qr.content_type
        );

        const ratePerSingleView = ratePer1000 / 1000;
        const nextCreditBalance = roundTo6(
          Number(typedProfile.credit_points_balance || 0) - ratePerSingleView
        );

        if (nextCreditBalance < 0) {
          await insertViewEvent({
            qrId: qr.id,
            deviceHash,
            wasCounted: false,
            blockedReason: "no_free_views_or_credit",
            chargedFrom: "none",
            chargedAmount: 0
          });

          await createViewsExhaustedAlert(typedProfile);

          return NextResponse.json({
            success: true,
            mode: "fallback",
            title: qr.title || "",
            text: getViewsExhaustedText(qr, typedProfile)
          });
        }

        chargedFrom = "credit_points";
        chargedAmount = roundTo6(ratePerSingleView);

        const updateRes = await supabaseAdmin
          .from("profiles")
          .update({
            credit_points_balance: nextCreditBalance
          })
          .eq("id", typedProfile.id);

        if (updateRes.error) {
          return NextResponse.json({ success: false, error: updateRes.error.message }, { status: 500 });
        }

        typedProfile.credit_points_balance = nextCreditBalance;
      }
    }

    await insertViewEvent({
      qrId: qr.id,
      deviceHash,
      wasCounted: true,
      blockedReason: null,
      chargedFrom,
      chargedAmount
    });

    const qrUpdateRes = await supabaseAdmin
      .from("qr_codes")
      .update({
        total_valid_views: (qr.total_valid_views || 0) + 1
      })
      .eq("id", qr.id);

    if (qrUpdateRes.error) {
      return NextResponse.json({ success: false, error: qrUpdateRes.error.message }, { status: 500 });
    }

    if (qr.content_type === "text") {
      return NextResponse.json({
        success: true,
        mode: "text",
        title: qr.title || "",
        text: qr.text_content || ""
      });
    }

    if (qr.content_type === "url") {
      return NextResponse.json({
        success: true,
        mode: "redirect",
        title: qr.title || "",
        url: qr.custom_url || ""
      });
    }

    return NextResponse.json({
      success: true,
      mode: "file",
      title: qr.title || "",
      fileUrl: qr.public_url || "",
      fileName: qr.file_name || null,
      mimeType: qr.mime_type || null
    });
  } catch (error) {
    console.error("GET /api/view error:", error);
    return NextResponse.json(
      { success: false, error: "Nepodařilo se načíst veřejný QR obsah." },
      { status: 500 }
    );
  }
}
