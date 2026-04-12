import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "../../../lib/supabase-admin";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    const userId = request.nextUrl.searchParams.get("userId");

    if (!userId) {
      return NextResponse.json({ error: "Chybí userId." }, { status: 400 });
    }

    const { data, error } = await supabaseAdmin
      .from("alerts")
      .select("id, alert_type, message, is_read, created_at")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      alerts: data || []
    });
  } catch (error) {
    console.error("GET /api/alerts error:", error);
    return NextResponse.json(
      { error: "Nepodařilo se načíst upozornění." },
      { status: 500 }
    );
  }
}
