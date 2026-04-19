"use client";

import { CSSProperties, useEffect, useMemo, useState } from "react";

type ViewResponse =
  | {
      success: true;
      mode: "text";
      title: string;
      text: string;
    }
  | {
      success: true;
      mode: "redirect";
      title: string;
      url: string;
    }
  | {
      success: true;
      mode: "file";
      title: string;
      fileUrl: string;
      fileName: string | null;
      mimeType: string | null;
    }
  | {
      success: true;
      mode: "fallback";
      title: string;
      text: string;
    }
  | {
      success: false;
      error: string;
    };

type PageProps = {
  params: Promise<{
    code: string;
  }>;
};

function getFileExtension(fileName: string | null | undefined) {
  if (!fileName) return "";
  return fileName.split(".").pop()?.toLowerCase() || "";
}

function MessageScreen({
  title,
  text,
  subtitle
}: {
  title: string;
  text: string;
  subtitle?: string;
}) {
  return (
    <main style={styles.screen}>
      <div style={styles.messageWrap}>
        {title ? <div style={styles.title}>{title}</div> : null}
        <div style={styles.text}>{text}</div>
        {subtitle ? <div style={styles.subtitle}>{subtitle}</div> : null}
      </div>
    </main>
  );
}

export default function PublicQrViewPage({ params }: PageProps) {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(true);
  const [payload, setPayload] = useState<ViewResponse | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    let mounted = true;

    const load = async () => {
      try {
        const resolved = await params;
        if (!mounted) return;

        const publicCode = resolved?.code || "";
        setCode(publicCode);

        if (!publicCode) {
          setError("Chybí veřejný kód.");
          setLoading(false);
          return;
        }

        const res = await fetch(`/api/view?code=${encodeURIComponent(publicCode)}`, {
          method: "GET",
          cache: "no-store"
        });

        const data = (await res.json()) as ViewResponse;

        if (!mounted) return;

        if (!res.ok || !data || data.success === false) {
          setError((data as { error?: string })?.error || "Obsah QR není dostupný.");
          setPayload(data);
          setLoading(false);
          return;
        }

        setPayload(data);
        setLoading(false);
      } catch (err) {
        console.error(err);
        if (!mounted) return;
        setError("Obsah QR není dostupný.");
        setLoading(false);
      }
    };

    load();

    return () => {
      mounted = false;
    };
  }, [params]);

  useEffect(() => {
    if (!payload || payload.success !== true) return;
    if (payload.mode !== "redirect") return;
    if (!payload.url) return;

    const timer = window.setTimeout(() => {
      window.location.replace(payload.url);
    }, 900);

    return () => window.clearTimeout(timer);
  }, [payload]);

  const fileInfo = useMemo(() => {
    if (!payload || payload.success !== true || payload.mode !== "file") {
      return {
        extension: "",
        isImage: false,
        isVideo: false,
        isPdf: false,
        isTextLike: false
      };
    }

    const extension = getFileExtension(payload.fileName);
    const mimeType = payload.mimeType || "";

    return {
      extension,
      isImage:
        mimeType.startsWith("image/") ||
        ["jpg", "jpeg", "png", "webp", "gif"].includes(extension),
      isVideo:
        mimeType.startsWith("video/") ||
        ["mp4", "webm"].includes(extension),
      isPdf:
        mimeType === "application/pdf" || extension === "pdf",
      isTextLike:
        mimeType.startsWith("text/") || extension === "txt"
    };
  }, [payload]);

  if (loading) {
    return <MessageScreen title="" text="Načítání..." subtitle={code ? `QR: ${code}` : ""} />;
  }

  if (error) {
    return <MessageScreen title="Chyba" text={error} subtitle="Zkuste to znovu později." />;
  }

  if (!payload || payload.success !== true) {
    return <MessageScreen title="Chyba" text="Obsah QR není dostupný." />;
  }

  if (payload.mode === "text") {
    return (
      <main style={styles.textScreen}>
        <div style={styles.textWrap}>
          {payload.title ? <div style={styles.smallTitle}>{payload.title}</div> : null}
          <div style={styles.bigText}>{payload.text}</div>
        </div>
      </main>
    );
  }

  if (payload.mode === "fallback") {
    return (
      <main style={styles.fallbackScreen}>
        <div style={styles.fallbackCard}>
          {payload.title ? <div style={styles.fallbackTitle}>{payload.title}</div> : null}
          <div style={styles.fallbackText}>{payload.text}</div>
        </div>
      </main>
    );
  }

  if (payload.mode === "redirect") {
    return (
      <MessageScreen
        title={payload.title || ""}
        text="Přesměrovávám..."
        subtitle={payload.url}
      />
    );
  }

  if (payload.mode === "file") {
    if (fileInfo.isImage) {
      return (
        <main style={styles.mediaScreen}>
          <img
            src={payload.fileUrl}
            alt={payload.fileName || payload.title || "QR image"}
            style={styles.image}
          />
        </main>
      );
    }

    if (fileInfo.isVideo) {
      return (
        <main style={styles.mediaScreen}>
          <video
            src={payload.fileUrl}
            controls
            autoPlay
            playsInline
            style={styles.video}
          />
        </main>
      );
    }

    if (fileInfo.isPdf || fileInfo.isTextLike) {
      return (
        <main style={styles.documentScreen}>
          <iframe
            src={payload.fileUrl}
            title={payload.fileName || payload.title || "Document"}
            style={styles.iframe}
          />
        </main>
      );
    }

    return (
      <main style={styles.screen}>
        <div style={styles.fileCard}>
          <div style={styles.fileTitle}>{payload.title || "Soubor"}</div>
          <div style={styles.fileName}>{payload.fileName || "Soubor bez názvu"}</div>
          <a
            href={payload.fileUrl}
            target="_blank"
            rel="noreferrer"
            style={styles.fileButton}
          >
            Otevřít soubor
          </a>
        </div>
      </main>
    );
  }

  return <MessageScreen title="Chyba" text="Neznámý obsah QR." />;
}

const styles: Record<string, CSSProperties> = {
  screen: {
    minHeight: "100vh",
    width: "100%",
    margin: 0,
    padding: 24,
    boxSizing: "border-box",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#ffffff",
    color: "#111111"
  },
  textScreen: {
    minHeight: "100vh",
    width: "100%",
    margin: 0,
    background: "#ffffff",
    color: "#111111"
  },
  fallbackScreen: {
    minHeight: "100vh",
    width: "100%",
    margin: 0,
    padding: 24,
    boxSizing: "border-box",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#f8fafc"
  },
  messageWrap: {
    width: "100%",
    maxWidth: 1200,
    display: "flex",
    flexDirection: "column",
    gap: 16,
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center"
  },
  title: {
    fontSize: 28,
    fontWeight: 700
  },
  text: {
    fontSize: "clamp(28px, 6vw, 72px)",
    lineHeight: 1.15,
    fontWeight: 700,
    wordBreak: "break-word",
    whiteSpace: "pre-wrap"
  },
  subtitle: {
    fontSize: 18,
    opacity: 0.7,
    wordBreak: "break-word"
  },
  textWrap: {
    minHeight: "100vh",
    width: "100%",
    padding: "4vh 5vw",
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    textAlign: "center",
    gap: "3vh",
    background: "#ffffff"
  },
  smallTitle: {
    fontSize: "clamp(18px, 2vw, 32px)",
    fontWeight: 600,
    opacity: 0.75,
    wordBreak: "break-word"
  },
  bigText: {
    fontSize: "clamp(34px, 8vw, 110px)",
    lineHeight: 1.1,
    fontWeight: 700,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    maxWidth: "100%"
  },
  fallbackCard: {
    width: "100%",
    maxWidth: 900,
    border: "1px solid #e2e8f0",
    borderRadius: 24,
    padding: "32px 24px",
    background: "#ffffff",
    boxShadow: "0 12px 40px rgba(15, 23, 42, 0.08)",
    textAlign: "center"
  },
  fallbackTitle: {
    fontSize: "clamp(20px, 3vw, 34px)",
    fontWeight: 700,
    color: "#0f172a",
    marginBottom: 16
  },
  fallbackText: {
    fontSize: "clamp(22px, 5vw, 48px)",
    lineHeight: 1.25,
    fontWeight: 700,
    color: "#111827",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word"
  },
  mediaScreen: {
    minHeight: "100vh",
    width: "100%",
    margin: 0,
    padding: 0,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#000000"
  },
  image: {
    width: "100vw",
    height: "100vh",
    objectFit: "contain",
    display: "block"
  },
  video: {
    width: "100vw",
    height: "100vh",
    objectFit: "contain",
    display: "block"
  },
  documentScreen: {
    minHeight: "100vh",
    width: "100%",
    margin: 0,
    padding: 0,
    background: "#ffffff"
  },
  iframe: {
    width: "100%",
    height: "100vh",
    border: "none",
    display: "block"
  },
  fileCard: {
    width: "100%",
    maxWidth: 720,
    border: "1px solid #d9dee7",
    borderRadius: 18,
    padding: 24,
    boxSizing: "border-box",
    textAlign: "center",
    background: "#f8fafc",
    display: "flex",
    flexDirection: "column",
    gap: 14
  },
  fileTitle: {
    fontSize: 28,
    fontWeight: 700,
    wordBreak: "break-word"
  },
  fileName: {
    fontSize: 18,
    opacity: 0.75,
    wordBreak: "break-word"
  },
  fileButton: {
    display: "inline-block",
    padding: "14px 18px",
    borderRadius: 12,
    textDecoration: "none",
    border: "1px solid #c6d0dc",
    color: "#111111",
    background: "#eef2f7",
    fontWeight: 600
  }
};
