import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

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

export async function GET(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get("userId");
    const from = request.nextUrl.searchParams.get("from");
    const to = request.nextUrl.searchParams.get("to");

    if (!userId || !from || !to) {
      return NextResponse.json({ error: "Chybí data." }, { status: 400 });
    }

    const fromDate = new Date(`${from}T00:00:00.000Z`);
    const toDate = new Date(`${to}T23:59:59.999Z`);

    if (Number.isNaN(fromDate.getTime()) || Number.isNaN(toDate.getTime())) {
      return NextResponse.json({ error: "Neplatné datum." }, { status: 400 });
    }

    if (fromDate.getTime() > toDate.getTime()) {
      return NextResponse.json(
        { error: "Datum Od nesmí být později než Do." },
        { status: 400 }
      );
    }

    const oneYearAgo = Date.now() - 365 * 24 * 60 * 60 * 1000;

    if (fromDate.getTime() < oneYearAgo || toDate.getTime() < oneYearAgo) {
      return NextResponse.json(
        { error: "Historie může být maximálně rok zpět." },
        { status: 400 }
      );
    }

    const { data: qr, error: qrError } = await supabase
      .from("qr_codes")
      .select("id")
      .eq("user_id", userId)
      .single();

    if (qrError || !qr) {
      return NextResponse.json(
        { error: qrError?.message || "QR nenalezen." },
        { status: 404 }
      );
    }

    const { count, error: countError } = await supabase
      .from("view_events")
      .select("*", { count: "exact", head: true })
      .eq("qr_id", qr.id)
      .eq("was_counted", true)
      .gte("viewed_at", fromDate.toISOString())
      .lte("viewed_at", toDate.toISOString());

    if (countError) {
      return NextResponse.json({ error: countError.message }, { status: 500 });
    }

    return NextResponse.json({
      totalValidScans: count || 0
    });
  } catch (error) {
    console.error("GET /api/history error:", error);
    return NextResponse.json(
      { error: "Nepodařilo se načíst historii." },
      { status: 500 }
    );
  }
}
