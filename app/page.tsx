"use client";

import { CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";
import {
  type ActivationMode,
  type ContentType
} from "../lib/app-config";

type PlanType = "free" | "day" | "month" | "year";
type SubscriptionStatus = "inactive" | "active" | "expired" | "canceled";

type ProfileResponse = {
  profile: {
    id: string;
    plan_type: PlanType;
    subscription_status: SubscriptionStatus;
    subscription_expires_at: string | null;
    billing_period: "day" | "month" | "year" | null;
    free_views_remaining: number;
    credit_points_balance: number;
    low_views_alert_threshold: number;
    fallback_text_default: string;
    views_exhausted_text: string;
  };
  qrCode: {
    id: string;
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
    activation_mode: ActivationMode;
    activation_days: number | null;
    activation_started_at: string | null;
    activation_ends_at: string | null;
    max_views_total: number | null;
    max_views_enabled: boolean;
    fallback_text: string;
    views_exhausted_text: string;
    is_active: boolean;
    total_valid_views: number;
    updated_at: string;
  };
  approxViewsFromCredit: {
    text: number;
    url: number;
    media: number;
  };
  subscriptionPlans: {
    currentPlan: {
      planType: "day" | "month" | "year";
      startsAt: string;
      endsAt: string;
    } | null;
    futurePlans: Array<{
      planType: "day" | "month" | "year";
      startsAt: string;
      endsAt: string;
    }>;
    allMergedPlans: Array<{
      planType: "day" | "month" | "year";
      startsAt: string;
      endsAt: string;
    }>;
  };
};

function formatDate(value: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("cs-CZ");
}

function truncateText(value: string, max = 140) {
  if (!value) return "";
  return value.length > max ? `${value.slice(0, max)}...` : value;
}

function getPlanLabel(planType: "day" | "month" | "year" | "free") {
  if (planType === "day") return "Denní plán";
  if (planType === "month") return "Měsíční plán";
  if (planType === "year") return "Roční plán";
  return "Free plán";
}

function getViewsAvailable(profileData: ProfileResponse | null, contentType: ContentType) {
  if (!profileData) return 0;

  if (contentType === "text") {
    return profileData.approxViewsFromCredit.text;
  }

  if (contentType === "url") {
    return profileData.approxViewsFromCredit.url;
  }

  return profileData.approxViewsFromCredit.media;
}

export default function DashboardPage() {
  const router = useRouter();
  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [profileData, setProfileData] = useState<ProfileResponse | null>(null);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);

        const { data } = await supabase.auth.getSession();
        const currentUserId = data.session?.user?.id || "";

        if (!currentUserId) {
          router.push("/login");
          return;
        }

        const res = await fetch(`/api/profile?userId=${encodeURIComponent(currentUserId)}`, {
          cache: "no-store"
        });

        const dataJson = await res.json();

        if (!res.ok) {
          throw new Error(dataJson?.error || "Profile load failed");
        }

        setProfileData(dataJson as ProfileResponse);
      } catch (error) {
        console.error(error);
        setMessage("Nepodařilo se načíst dashboard.");
      } finally {
        setLoading(false);
      }
    };

    load().catch(console.error);
  }, [router]);

  const publicViewUrl = useMemo(() => {
    if (!profileData || typeof window === "undefined") return "";
    return `${window.location.origin}/view/${profileData.qrCode.public_code}`;
  }, [profileData]);

  useEffect(() => {
    const generateQrPreview = async () => {
      if (!qrCanvasRef.current || !publicViewUrl) return;

      try {
        await QRCode.toCanvas(qrCanvasRef.current, publicViewUrl, {
          width: 240,
          margin: 1
        });
      } catch (error) {
        console.error("QR render error:", error);
      }
    };

    generateQrPreview().catch(console.error);
  }, [publicViewUrl]);

  const currentPlanText = useMemo(() => {
    if (!profileData?.subscriptionPlans.currentPlan) {
      return "Bez aktivního plánu";
    }

    return `${getPlanLabel(profileData.subscriptionPlans.currentPlan.planType)} do ${formatDate(
      profileData.subscriptionPlans.currentPlan.endsAt
    )}`;
  }, [profileData]);

  const previewText = useMemo(() => {
    if (!profileData) return "";

    if (profileData.qrCode.content_type === "text") {
      return truncateText(profileData.qrCode.text_content || "Zatím není nastaven text.", 180);
    }

    if (profileData.qrCode.content_type === "url") {
      return profileData.qrCode.custom_url
        ? `Uživatel bude přesměrován na:\n${profileData.qrCode.custom_url}`
        : "Zatím není nastavena URL.";
    }

    return profileData.qrCode.file_name || "Zatím není nahrané žádné medium.";
  }, [profileData]);

  async function handleCopyLink() {
    try {
      if (!publicViewUrl) return;
      await navigator.clipboard.writeText(publicViewUrl);
      setMessage("QR link byl zkopírován.");
    } catch (error) {
      console.error(error);
      setMessage("Nepodařilo se zkopírovat QR link.");
    }
  }

  function handleDownloadQr() {
    if (!qrCanvasRef.current) return;

    const link = document.createElement("a");
    link.href = qrCanvasRef.current.toDataURL("image/png");
    link.download = `${profileData?.qrCode.title || "rqtools-qr"}.png`;
    link.click();
  }

  function handlePrintQr() {
    if (!qrCanvasRef.current) return;

    const dataUrl = qrCanvasRef.current.toDataURL("image/png");
    const printWindow = window.open("", "_blank", "width=900,height=700");

    if (!printWindow) {
      setMessage("Nepodařilo se otevřít tiskové okno.");
      return;
    }

    printWindow.document.write(`
      <html>
        <head>
          <title>Tisk QR</title>
          <style>
            @page { margin: 12mm; }
            body {
              font-family: Arial, Helvetica, sans-serif;
              display: flex;
              align-items: center;
              justify-content: center;
              min-height: 100vh;
              margin: 0;
            }
            .wrap {
              text-align: center;
            }
            img {
              width: 6cm;
              height: 6cm;
              object-fit: contain;
              display: block;
              margin: 0 auto;
            }
          </style>
        </head>
        <body>
          <div class="wrap">
            <img src="${dataUrl}" alt="QR code" />
          </div>
          <script>
            window.onload = function () {
              window.print();
              window.onafterprint = function () { window.close(); };
            };
          </script>
        </body>
      </html>
    `);

    printWindow.document.close();
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  if (loading || !profileData) {
    return (
      <main style={styles.page}>
        <div style={styles.loadingCard}>
          {message || "Načítání dashboardu..."}
        </div>
      </main>
    );
  }

  return (
    <main style={styles.page}>
      <div style={styles.container}>
        <div style={styles.topRow}>
          <button
            type="button"
            style={{ ...styles.cardButton, ...styles.menuCard }}
            onClick={() => setMessage("Menu uděláme v dalším kroku.")}
          >
            menu
          </button>

          <div style={{ ...styles.infoCard, ...styles.creditCard }}>
            <div style={styles.infoSmall}>Kredit</div>
            <div style={styles.creditValue}>
              {Math.floor(profileData.profile.credit_points_balance).toLocaleString()}
            </div>
          </div>

          <div style={{ ...styles.infoCard, ...styles.planCard }}>
            <div style={styles.infoMedium}>Predplatne do kdy</div>
            <div style={styles.planValue}>{currentPlanText}</div>
          </div>
        </div>

        <section style={styles.wideCard}>
          <div style={styles.viewsRow}>
            <span>views k dispozici :</span>
            <strong>{getViewsAvailable(profileData, profileData.qrCode.content_type).toLocaleString()}</strong>
          </div>

          <div style={styles.viewsRow}>
            <span>Z toho zdarma :</span>
            <strong>{profileData.profile.free_views_remaining.toLocaleString()}</strong>
          </div>
        </section>

        <section style={styles.buttonRow}>
          <button
            type="button"
            style={styles.bigOptionButton}
            onClick={() => setMessage("Obsah Text budeme řešit v dalším kroku přes menu.")}
          >
            text
          </button>

          <button
            type="button"
            style={styles.bigOptionButton}
            onClick={() => setMessage("Obsah URL budeme řešit v dalším kroku přes menu.")}
          >
            url
          </button>

          <button
            type="button"
            style={styles.bigOptionButton}
            onClick={() => setMessage("Obsah Media budeme řešit v dalším kroku přes menu.")}
          >
            media
          </button>
        </section>

        <section style={styles.previewCard}>
          <div style={styles.previewTitle}>nahled</div>
          <div style={styles.previewContent}>{previewText}</div>
        </section>

        <section style={styles.qrCard}>
          <div style={styles.qrCanvasWrap}>
            <canvas ref={qrCanvasRef} />
          </div>
        </section>

        <section style={styles.bottomButtons}>
          <button type="button" style={styles.smallActionButton} onClick={handleCopyLink}>
            Copy qr link
          </button>

          <button type="button" style={styles.smallActionButton} onClick={handlePrintQr}>
            Print qr
          </button>

          <button type="button" style={styles.smallActionButton} onClick={handleDownloadQr}>
            Download Qr kod
          </button>
        </section>

        <button type="button" style={styles.logoutButton} onClick={handleLogout}>
          odhlasit
        </button>
      </div>

      {message ? <div style={styles.messageBox}>{message}</div> : null}
    </main>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    height: "100vh",
    overflow: "hidden",
    background: "#ead790",
    padding: 14,
    boxSizing: "border-box"
  },
  container: {
    width: "100%",
    maxWidth: 1180,
    height: "100%",
    margin: "0 auto",
    display: "grid",
    gridTemplateRows: "auto auto auto minmax(0, 1fr) auto auto auto",
    gap: 14
  },
  topRow: {
    display: "grid",
    gridTemplateColumns: "120px minmax(0, 1fr) minmax(0, 1fr)",
    gap: 14,
    alignItems: "stretch",
    minHeight: 92
  },
  cardButton: {
    border: "5px solid #000000",
    borderRadius: 24,
    background: "#c8d7e7",
    cursor: "pointer",
    fontSize: 24,
    fontWeight: 500
  },
  menuCard: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    textTransform: "lowercase",
    minHeight: 92
  },
  infoCard: {
    border: "5px solid #000000",
    borderRadius: 24,
    background: "#c8d7e7",
    minHeight: 92,
    padding: 10,
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center"
  },
  creditCard: {},
  planCard: {},
  infoSmall: {
    fontSize: 18,
    lineHeight: 1.1,
    marginBottom: 4
  },
  infoMedium: {
    fontSize: 18,
    lineHeight: 1.15,
    marginBottom: 4
  },
  creditValue: {
    fontSize: 34,
    fontWeight: 800,
    lineHeight: 1
  },
  planValue: {
    fontSize: 20,
    fontWeight: 700,
    lineHeight: 1.15
  },
  wideCard: {
    border: "5px solid #000000",
    borderRadius: 24,
    background: "#c8d7e7",
    padding: 14,
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    gap: 10
  },
  viewsRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 14,
    fontSize: 22,
    lineHeight: 1.2,
    flexWrap: "wrap"
  },
  buttonRow: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 14,
    minHeight: 88
  },
  bigOptionButton: {
    minHeight: 88,
    border: "5px solid #000000",
    borderRadius: 24,
    background: "#c8d7e7",
    fontSize: 32,
    fontWeight: 800,
    textTransform: "lowercase",
    cursor: "pointer"
  },
  previewCard: {
    width: "100%",
    maxWidth: 860,
    margin: "0 auto",
    minHeight: 0,
    height: "100%",
    border: "5px solid #000000",
    borderRadius: 42,
    background: "#c8d7e7",
    padding: 18,
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    textAlign: "center",
    gap: 14,
    overflow: "hidden"
  },
  previewTitle: {
    fontSize: 50,
    fontWeight: 800,
    lineHeight: 1
  },
  previewContent: {
    fontSize: 20,
    fontWeight: 600,
    lineHeight: 1.35,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    overflow: "hidden"
  },
  qrCard: {
    width: "100%",
    maxWidth: 300,
    margin: "0 auto",
    border: "5px solid #000000",
    borderRadius: 30,
    background: "#c8d7e7",
    padding: 12,
    boxSizing: "border-box",
    display: "flex",
    alignItems: "center",
    justifyContent: "center"
  },
  qrCanvasWrap: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: "#ffffff",
    padding: 8,
    borderRadius: 16
  },
  bottomButtons: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 14,
    minHeight: 74
  },
  smallActionButton: {
    minHeight: 74,
    border: "5px solid #000000",
    borderRadius: 22,
    background: "#c8d7e7",
    fontSize: 18,
    fontWeight: 800,
    lineHeight: 1.15,
    cursor: "pointer",
    padding: 8
  },
  logoutButton: {
    width: "100%",
    minHeight: 82,
    border: "5px solid #000000",
    borderRadius: 22,
    background: "#c8d7e7",
    fontSize: 28,
    fontWeight: 800,
    textTransform: "lowercase",
    cursor: "pointer"
  },
  loadingCard: {
    maxWidth: 540,
    margin: "120px auto",
    border: "5px solid #000000",
    borderRadius: 24,
    background: "#c8d7e7",
    padding: 24,
    fontSize: 24,
    fontWeight: 700,
    textAlign: "center"
  },
  messageBox: {
    position: "fixed",
    right: 14,
    bottom: 14,
    maxWidth: 320,
    borderRadius: 16,
    background: "#111827",
    color: "#ffffff",
    padding: "12px 14px",
    fontSize: 13,
    lineHeight: 1.4,
    boxShadow: "0 14px 35px rgba(0,0,0,0.22)",
    zIndex: 50
  }
};
