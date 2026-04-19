import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import crypto from "crypto";
import {
  APP_CONFIG,
  isActivationMode,
  isContentType
} from "../../../../lib/app-config";

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

function sanitizeString(value: unknown, maxLength: number) {
  if (typeof value !== "string") return "";
  return value.trim().slice(0, maxLength);
}

function parseBoolean(value: unknown) {
  return value === true || value === "true";
}

function parsePositiveInt(value: unknown, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const intValue = Math.floor(parsed);
  return intValue > 0 ? intValue : fallback;
}

function parseNonNegativeInt(value: unknown, fallback = 0) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  const intValue = Math.floor(parsed);
  return intValue >= 0 ? intValue : fallback;
}

function generatePublicCode() {
  return crypto.randomBytes(18).toString("hex");
}

function isAllowedFile(filename: string, mimeType: string) {
  const ext = filename.split(".").pop()?.toLowerCase() || "";
  return (
    APP_CONFIG.allowedExtensions.includes(ext as (typeof APP_CONFIG.allowedExtensions)[number]) &&
    APP_CONFIG.allowedMimeTypes.includes(
      mimeType as (typeof APP_CONFIG.allowedMimeTypes)[number]
    )
  );
}

function parseActivationStartDate(rawValue: string, fallbackIso: string) {
  if (!rawValue) {
    return fallbackIso;
  }

  const parsed = new Date(`${rawValue}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime())) {
    return fallbackIso;
  }

  return parsed.toISOString();
}

async function handleRegenerate(body: { userId?: string; qrId?: string }) {
  const userId = sanitizeString(body.userId, 120);
  const qrId = sanitizeString(body.qrId, 120);

  if (!userId || !qrId) {
    return NextResponse.json({ error: "Neplatná data." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("qr_codes")
    .update({
      public_code: generatePublicCode(),
      updated_at: new Date().toISOString()
    })
    .eq("id", qrId)
    .eq("user_id", userId)
    .select("id, public_code")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, qrCode: data });
}

export async function POST(request: NextRequest) {
  const contentTypeHeader = request.headers.get("content-type") || "";

  try {
    if (contentTypeHeader.includes("application/json")) {
      const body = await request.json();

      if (body.mode === "regenerate") {
        return handleRegenerate(body);
      }

      return NextResponse.json({ error: "Neplatný JSON režim." }, { status: 400 });
    }

    const formData = await request.formData();

    const userId = sanitizeString(formData.get("userId"), 120);
    const qrId = sanitizeString(formData.get("qrId"), 120);
    const title = sanitizeString(formData.get("title"), 120) || "Můj QR kód";

    const rawContentType = sanitizeString(formData.get("contentType"), 20);
    const contentType = isContentType(rawContentType) ? rawContentType : "text";

    const textContent =
      typeof formData.get("textContent") === "string"
        ? String(formData.get("textContent")).slice(0, 20000)
        : "";

    const customUrl = sanitizeString(formData.get("customUrl"), 2048);

    const rawActivationMode = sanitizeString(formData.get("activationMode"), 40);
    const activationMode = isActivationMode(rawActivationMode)
      ? rawActivationMode
      : "subscription_period";

    const activationDays =
      activationMode === "days"
        ? parsePositiveInt(formData.get("activationDays"), 1)
        : null;

    const rawActivationStartDate = sanitizeString(
      formData.get("activationStartDate"),
      40
    );

    const maxViewsEnabled = parseBoolean(formData.get("maxViewsEnabled"));
    const maxViewsTotalThousands = parseNonNegativeInt(
      formData.get("maxViewsTotalThousands"),
      0
    );

    const maxViewsTotal = maxViewsEnabled ? maxViewsTotalThousands * 1000 : null;

    const fallbackText =
      sanitizeString(formData.get("fallbackText"), 1000) ||
      APP_CONFIG.defaultTexts.fallback;

    const viewsExhaustedText =
      sanitizeString(formData.get("viewsExhaustedText"), 1000) ||
      APP_CONFIG.defaultTexts.viewsExhausted;

    const lowViewsAlertThresholdThousands = parseNonNegativeInt(
      formData.get("lowViewsAlertThresholdThousands"),
      0
    );

    if (!userId || !qrId) {
      return NextResponse.json({ error: "Neplatná data." }, { status: 400 });
    }

    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("plan_type, subscription_status, subscription_expires_at")
      .eq("id", userId)
      .single();

    if (profileError || !profile) {
      return NextResponse.json(
        { error: profileError?.message || "Profil nenalezen." },
        { status: 404 }
      );
    }

    const hasActivePaidSubscription =
      (profile.plan_type === "day" ||
        profile.plan_type === "month" ||
        profile.plan_type === "year") &&
      profile.subscription_status === "active" &&
      !!profile.subscription_expires_at &&
      new Date(profile.subscription_expires_at).getTime() > Date.now();

    if ((contentType === "url" || contentType === "media") && !hasActivePaidSubscription) {
      return NextResponse.json(
        {
          error:
            contentType === "url"
              ? "URL je dostupné jen s aktivním předplatným."
              : "Media jsou dostupná jen s aktivním předplatným."
        },
        { status: 403 }
      );
    }

    let file_name: string | null = null;
    let file_key: string | null = null;
    let mime_type: string | null = null;
    let public_url: string | null = null;
    let file_size = 0;

    const currentQrRes = await supabase
      .from("qr_codes")
      .select("file_key, activation_started_at")
      .eq("id", qrId)
      .eq("user_id", userId)
      .single();

    if (currentQrRes.error) {
      return NextResponse.json({ error: currentQrRes.error.message }, { status: 500 });
    }

    const fallbackStartIso =
      currentQrRes.data?.activation_started_at || new Date().toISOString();

    const activationStartedAt =
      activationMode === "days"
        ? parseActivationStartDate(rawActivationStartDate, fallbackStartIso)
        : new Date().toISOString();

    const uploadedFile = formData.get("file");

    if (contentType === "media" && uploadedFile instanceof File) {
      if (uploadedFile.size > APP_CONFIG.maxUploadBytes) {
        return NextResponse.json({ error: "Soubor je příliš velký." }, { status: 400 });
      }

      if (!isAllowedFile(uploadedFile.name, uploadedFile.type)) {
        return NextResponse.json({ error: "Nepovolený typ souboru." }, { status: 400 });
      }

      const safeName = uploadedFile.name
        .replace(/[^\w.\- ]+/g, "")
        .replace(/\s+/g, "-");
      const storageKey = `${userId}/${qrId}-${Date.now()}-${safeName}`;

      if (currentQrRes.data?.file_key) {
        await supabase.storage.from("files").remove([currentQrRes.data.file_key]);
      }

      const buffer = Buffer.from(await uploadedFile.arrayBuffer());

      const { error: uploadError } = await supabase.storage
        .from("files")
        .upload(storageKey, buffer, {
          contentType: uploadedFile.type,
          upsert: false
        });

      if (uploadError) {
        return NextResponse.json({ error: uploadError.message }, { status: 500 });
      }

      const publicData = supabase.storage.from("files").getPublicUrl(storageKey);

      file_name = safeName;
      file_key = storageKey;
      mime_type = uploadedFile.type;
      public_url = publicData.data.publicUrl;
      file_size = uploadedFile.size;
    }

    if (contentType !== "media" && currentQrRes.data?.file_key) {
      await supabase.storage.from("files").remove([currentQrRes.data.file_key]);
    }

    const updatePayload: Record<string, unknown> = {
      title,
      content_type: contentType,
      text_content: contentType === "text" ? textContent : null,
      custom_url: contentType === "url" ? customUrl : null,
      file_name: contentType === "media" ? file_name : null,
      file_key: contentType === "media" ? file_key : null,
      mime_type: contentType === "media" ? mime_type : null,
      public_url: contentType === "media" ? public_url : null,
      file_size: contentType === "media" ? file_size : 0,
      activation_mode: activationMode,
      activation_days: activationMode === "days" ? activationDays : null,
      activation_started_at: activationStartedAt,
      activation_ends_at: null,
      max_views_enabled: maxViewsEnabled,
      max_views_total: maxViewsTotal,
      fallback_text: fallbackText,
      views_exhausted_text: viewsExhaustedText
    };

    const { error: qrUpdateError } = await supabase
      .from("qr_codes")
      .update(updatePayload)
      .eq("id", qrId)
      .eq("user_id", userId);

    if (qrUpdateError) {
      return NextResponse.json({ error: qrUpdateError.message }, { status: 500 });
    }

    const { error: profileUpdateError } = await supabase
      .from("profiles")
      .update({
        low_views_alert_threshold: lowViewsAlertThresholdThousands * 1000,
        fallback_text_default: fallbackText,
        views_exhausted_text: viewsExhaustedText
      })
      .eq("id", userId);

    if (profileUpdateError) {
      return NextResponse.json({ error: profileUpdateError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("POST /api/qr/update error:", error);
    return NextResponse.json({ error: "Nepodařilo se uložit QR." }, { status: 500 });
  }
}
