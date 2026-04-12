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
      .from("qr_codes")
      .select("*")
      .eq("user_id", userId)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ qrCode: data });
  } catch (error) {
    console.error("GET /api/qr error:", error);
    return NextResponse.json(
      { error: "Nepodařilo se načíst QR." },
      { status: 500 }
    );
  }
}
