import { NextRequest, NextResponse } from "next/server";

const APP_CONFIG = {
  allowedExtensions: ["jpg", "jpeg", "png", "webp", "gif", "pdf"] as const,
  allowedMimeTypes: [
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/gif",
    "application/pdf"
  ]
};

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file" }, { status: 400 });
    }

    const filename = file.name;
    const mimeType = file.type;

    const ext = filename.split(".").pop()?.toLowerCase() || "";

    const isValid =
      APP_CONFIG.allowedExtensions.includes(ext as any) &&
      APP_CONFIG.allowedMimeTypes.includes(mimeType);

    if (!isValid) {
      return NextResponse.json(
        { error: "Invalid file type" },
        { status: 400 }
      );
    }

    // TODO: tady pak bude upload do Supabase

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error(error);
    return NextResponse.json(
      { error: "Upload failed" },
      { status: 500 }
    );
  }
}
