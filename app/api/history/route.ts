import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabase-admin";

export const runtime = "nodejs";

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

    const oneYearAgo = Date.now() - 365 * 24 * 60 * 60 * 1000;
    if (fromDate.getTime() < oneYearAgo) {
      return NextResponse.json(
        { error: "Historie může být maximálně rok zpět." },
        { status: 400 }
      );
    }

    const { data: qr, error: qrError } = await supabaseAdmin
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

    const { count, error: countError } = await supabaseAdmin
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
