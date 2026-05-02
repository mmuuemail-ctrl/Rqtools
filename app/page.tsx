"use client";

import { CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import QRCode from "qrcode";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";
import { type ActivationMode, type ContentType } from "../lib/app-config";

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

function truncateText(value: string, max = 180) {
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

  if (contentType === "text") return profileData.approxViewsFromCredit.text;
  if (contentType === "url") return profileData.approxViewsFromCredit.url;

  return profileData.approxViewsFromCredit.media;
}

export default function DashboardPage() {
  const router = useRouter();
  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [loading, setLoading] = useState(true);
  const [savingText, setSavingText] = useState(false);
  const [message, setMessage] = useState("");
  const [userId, setUserId] = useState("");
  const [profileData, setProfileData] = useState<ProfileResponse | null>(null);
  const [scale, setScale] = useState(1);

  const [showTextModal, setShowTextModal] = useState(false);
  const [draftText, setDraftText] = useState("");

  const BASE_WIDTH = 720;
  const BASE_HEIGHT = 1480;

  async function loadProfile(currentUserId: string) {
    const res = await fetch(`/api/profile?userId=${encodeURIComponent(currentUserId)}`, {
      cache: "no-store"
    });

    const dataJson = await res.json();

    if (!res.ok) {
      throw new Error(dataJson?.error || "Profile load failed");
    }

    setProfileData(dataJson as ProfileResponse);
  }

  useEffect(() => {
    const updateScale = () => {
      const padding = 20;
      const availableWidth = window.innerWidth - padding * 2;
      const availableHeight = window.innerHeight - padding * 2;
      const nextScale = Math.min(
        availableWidth / BASE_WIDTH,
        availableHeight / BASE_HEIGHT,
        1
      );
      setScale(nextScale);
    };

    updateScale();
    window.addEventListener("resize", updateScale);

    return () => {
      window.removeEventListener("resize", updateScale);
    };
  }, []);

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

        setUserId(currentUserId);
        await loadProfile(currentUserId);
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
          width: 250,
          margin: 2
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
      return truncateText(profileData.qrCode.text_content || "Zatím není nastaven text.");
    }

    if (profileData.qrCode.content_type === "url") {
      return profileData.qrCode.custom_url
        ? `Uživatel bude přesměrován na:\n${profileData.qrCode.custom_url}`
        : "Zatím není nastavena URL.";
    }

    return profileData.qrCode.file_name || "Zatím není nahrané žádné medium.";
  }, [profileData]);

  function openTextModal() {
    setDraftText(profileData?.qrCode.text_content || "");
    setShowTextModal(true);
    setMessage("");
  }

  function closeTextModal() {
    if (savingText) return;
    setShowTextModal(false);
    setDraftText("");
  }

  async function confirmTextModal() {
    if (!profileData || !userId) return;

    const cleanText = draftText.trim();

    if (!cleanText) {
      setMessage("Nejdřív napiš text.");
      return;
    }

    try {
      setSavingText(true);
      setMessage("");

      const formData = new FormData();
      formData.append("userId", userId);
      formData.append("qrId", profileData.qrCode.id);
      formData.append("title", profileData.qrCode.title || "");
      formData.append("contentType", "text");
      formData.append("textContent", cleanText);
      formData.append("customUrl", "");
      formData.append("activationMode", profileData.qrCode.activation_mode);
      formData.append("activationDays", String(profileData.qrCode.activation_days || 1));
      formData.append(
        "activationStartDate",
        profileData.qrCode.activation_started_at
          ? profileData.qrCode.activation_started_at.slice(0, 10)
          : ""
      );
      formData.append("maxViewsEnabled", String(profileData.qrCode.max_views_enabled));
      formData.append(
        "maxViewsTotalThousands",
        profileData.qrCode.max_views_total
          ? String(Math.floor(profileData.qrCode.max_views_total / 1000))
          : ""
      );
      formData.append("fallbackText", profileData.qrCode.fallback_text || "");
      formData.append("viewsExhaustedText", profileData.qrCode.views_exhausted_text || "");
      formData.append(
        "lowViewsAlertThresholdThousands",
        profileData.profile.low_views_alert_threshold
          ? String(Math.floor(profileData.profile.low_views_alert_threshold / 1000))
          : ""
      );

      const res = await fetch("/api/qr/update", {
        method: "POST",
        body: formData
      });

      const dataJson = await res.json();

      if (!res.ok) {
        setMessage(dataJson?.error || "Text se nepodařilo uložit.");
        return;
      }

      await loadProfile(userId);

      setShowTextModal(false);
      setDraftText("");
      setMessage("Text byl uložen.");
    } catch (error) {
      console.error(error);
      setMessage("Text se nepodařilo uložit.");
    } finally {
      setSavingText(false);
    }
  }

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
      <div
        style={{
          ...styles.fitBox,
          width: BASE_WIDTH * scale,
          height: BASE_HEIGHT * scale
        }}
      >
        <div
          style={{
            ...styles.board,
            width: BASE_WIDTH,
            height: BASE_HEIGHT,
            transform: `scale(${scale})`
          }}
        >
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
              <span>views k dispozici</span>
              <strong>
                {getViewsAvailable(profileData, profileData.qrCode.content_type).toLocaleString()}
              </strong>
            </div>

            <div style={styles.viewsRow}>
              <span>Z toho zdarma</span>
              <strong>{profileData.profile.free_views_remaining.toLocaleString()}</strong>
            </div>
          </section>

          <section style={styles.buttonRow}>
            <button type="button" style={styles.bigOptionButton} onClick={openTextModal}>
              text
            </button>

            <button
              type="button"
              style={styles.bigOptionButton}
              onClick={() => setMessage("URL nastavíme v dalším kroku.")}
            >
              url
            </button>

            <button
              type="button"
              style={styles.bigOptionButton}
              onClick={() => setMessage("Media nastavíme v dalším kroku.")}
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
      </div>

      {showTextModal ? (
        <div style={styles.modalOverlay}>
          <div style={styles.modalBox}>
            <div style={styles.modalTitle}>Zadat text</div>

            <textarea
              value={draftText}
              onChange={(e) => setDraftText(e.target.value)}
              style={styles.textArea}
              placeholder="Napiš text, který se zobrazí po naskenování QR kódu."
              autoFocus
            />

            <div style={styles.modalButtons}>
              <button
                type="button"
                style={styles.modalCancelButton}
                onClick={closeTextModal}
                disabled={savingText}
              >
                zrusit
              </button>

              <button
                type="button"
                style={styles.modalConfirmButton}
                onClick={confirmTextModal}
                disabled={savingText}
              >
                {savingText ? "ukladam..." : "potvrdit"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {message ? <div style={styles.messageBox}>{message}</div> : null}
    </main>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    width: "100%",
    height: "100vh",
    minHeight: "100vh",
    overflow: "hidden",
    background: "#ead790",
    padding: 10,
    boxSizing: "border-box",
    display: "flex",
    alignItems: "center",
    justifyContent: "center"
  },
  fitBox: {
    position: "relative",
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "center"
  },
  board: {
    position: "absolute",
    top: 0,
    left: 0,
    transformOrigin: "top left",
    background: "#ead790",
    padding: 24,
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    gap: 22,
    overflow: "hidden"
  },
  topRow: {
    display: "grid",
    gridTemplateColumns: "120px 1fr 1fr",
    gap: 18,
    alignItems: "stretch"
  },
  cardButton: {
    border: "6px solid #000000",
    borderRadius: 26,
    background: "#c8d7e7",
    cursor: "pointer",
    minHeight: 122,
    fontSize: 28,
    fontWeight: 500
  },
  menuCard: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    textTransform: "lowercase"
  },
  infoCard: {
    border: "6px solid #000000",
    borderRadius: 26,
    background: "#c8d7e7",
    minHeight: 122,
    padding: 14,
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
    fontSize: 28,
    lineHeight: 1.1,
    marginBottom: 6
  },
  infoMedium: {
    fontSize: 24,
    lineHeight: 1.15,
    marginBottom: 8
  },
  creditValue: {
    fontSize: 44,
    fontWeight: 800,
    lineHeight: 1
  },
  planValue: {
    fontSize: 24,
    fontWeight: 700,
    lineHeight: 1.2
  },
  wideCard: {
    border: "6px solid #000000",
    borderRadius: 28,
    background: "#c8d7e7",
    padding: 18,
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    gap: 16
  },
  viewsRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 16,
    fontSize: 28,
    lineHeight: 1.2,
    flexWrap: "wrap"
  },
  buttonRow: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 18
  },
  bigOptionButton: {
    minHeight: 132,
    border: "6px solid #000000",
    borderRadius: 28,
    background: "#c8d7e7",
    fontSize: 52,
    fontWeight: 800,
    textTransform: "lowercase",
    cursor: "pointer"
  },
  previewCard: {
    width: "100%",
    maxWidth: 500,
    margin: "0 auto",
    minHeight: 380,
    border: "6px solid #000000",
    borderRadius: 60,
    background: "#c8d7e7",
    padding: 24,
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    justifyContent: "center",
    alignItems: "center",
    textAlign: "center",
    position: "relative",
    gap: 24
  },
  previewTitle: {
    fontSize: 72,
    fontWeight: 800,
    lineHeight: 1,
    opacity: 0.18,
    position: "absolute",
    pointerEvents: "none",
    userSelect: "none"
  },
  previewContent: {
    fontSize: 28,
    fontWeight: 700,
    lineHeight: 1.4,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word"
  },
  qrCard: {
    width: "100%",
    maxWidth: 320,
    margin: "0 auto",
    minHeight: 300,
    border: "6px solid #000000",
    borderRadius: 42,
    background: "#c8d7e7",
    padding: 22,
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
    padding: 0,
    borderRadius: 16,
    width: 250,
    height: 250,
    overflow: "hidden"
  },
  bottomButtons: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 18
  },
  smallActionButton: {
    minHeight: 104,
    border: "6px solid #000000",
    borderRadius: 24,
    background: "#c8d7e7",
    fontSize: 24,
    fontWeight: 800,
    lineHeight: 1.15,
    cursor: "pointer",
    padding: 10
  },
  logoutButton: {
    width: "100%",
    minHeight: 98,
    border: "6px solid #000000",
    borderRadius: 24,
    background: "#c8d7e7",
    fontSize: 38,
    fontWeight: 800,
    textTransform: "lowercase",
    cursor: "pointer"
  },
  loadingCard: {
    maxWidth: 540,
    margin: "0 auto",
    border: "6px solid #000000",
    borderRadius: 28,
    background: "#c8d7e7",
    padding: 28,
    fontSize: 28,
    fontWeight: 700,
    textAlign: "center"
  },
  modalOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0, 0, 0, 0.45)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
    boxSizing: "border-box",
    zIndex: 100
  },
  modalBox: {
    width: "100%",
    maxWidth: 520,
    border: "6px solid #000000",
    borderRadius: 28,
    background: "#c8d7e7",
    padding: 22,
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    gap: 16
  },
  modalTitle: {
    fontSize: 34,
    fontWeight: 900,
    textAlign: "center"
  },
  textArea: {
    width: "100%",
    minHeight: 210,
    resize: "vertical",
    border: "5px solid #000000",
    borderRadius: 22,
    padding: 16,
    boxSizing: "border-box",
    fontSize: 22,
    fontWeight: 700,
    lineHeight: 1.35,
    background: "#ffffff",
    color: "#000000",
    outline: "none"
  },
  modalButtons: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 14
  },
  modalCancelButton: {
    minHeight: 70,
    border: "5px solid #000000",
    borderRadius: 20,
    background: "#ffffff",
    fontSize: 24,
    fontWeight: 900,
    cursor: "pointer"
  },
  modalConfirmButton: {
    minHeight: 70,
    border: "5px solid #000000",
    borderRadius: 20,
    background: "#ead790",
    fontSize: 24,
    fontWeight: 900,
    cursor: "pointer"
  },
  messageBox: {
    position: "fixed",
    right: 18,
    bottom: 18,
    maxWidth: 360,
    borderRadius: 18,
    background: "#111827",
    color: "#ffffff",
    padding: "14px 16px",
    fontSize: 14,
    lineHeight: 1.45,
    boxShadow: "0 14px 35px rgba(0,0,0,0.22)",
    zIndex: 150
  }
};
