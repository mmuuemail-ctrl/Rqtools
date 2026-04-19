"use client";

import {
  ChangeEvent,
  CSSProperties,
  useEffect,
  useMemo,
  useRef,
  useState
} from "react";
import QRCode from "qrcode";
import { useRouter } from "next/navigation";
import { supabase } from "../lib/supabase";
import {
  getAvailableLanguages,
  getDictionary,
  getStoredLanguage,
  setStoredLanguage,
  t,
  type LanguageDictionary,
  type LanguageMeta
} from "../lib/i18n";
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

type AlertsResponse = {
  alerts: Array<{
    id: string;
    alert_type: string;
    message: string;
    is_read: boolean;
    created_at: string;
  }>;
};

type HistoryResponse = {
  totalValidScans: number;
};

type DraftContentType = "text" | "url" | "media" | null;

function formatDate(value: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString("cs-CZ");
}

function truncateText(value: string, max = 110) {
  if (!value) return "";
  return value.length > max ? `${value.slice(0, max)}...` : value;
}

function getPlanLabel(planType: "day" | "month" | "year" | "free") {
  if (planType === "day") return "Denní plán";
  if (planType === "month") return "Měsíční plán";
  if (planType === "year") return "Roční plán";
  return "Free plán";
}

function getCurrentRateLabel(
  contentType: ContentType,
  profileData: ProfileResponse | null
) {
  if (!profileData) return "—";

  if (contentType === "text") {
    return `${profileData.approxViewsFromCredit.text.toLocaleString()} views za aktuální kredit`;
  }

  if (contentType === "url") {
    return `${profileData.approxViewsFromCredit.url.toLocaleString()} views za aktuální kredit`;
  }

  return `${profileData.approxViewsFromCredit.media.toLocaleString()} views za aktuální kredit`;
}

function getDisplayActivationLabel(
  activationMode: ActivationMode,
  activationDays: string
) {
  if (activationMode === "subscription_period") {
    return "Po celé předplacené období";
  }

  if (activationMode === "days") {
    return `Od určitého data na ${activationDays || "1"} dní`;
  }

  return "Bez konce, dokud to podmínky dovolí";
}

export default function DashboardPage() {
  const router = useRouter();
  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [language, setLanguageState] = useState("cs");
  const [dictionary, setDictionary] = useState<LanguageDictionary | null>(null);
  const [availableLanguages, setAvailableLanguages] = useState<LanguageMeta[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [userId, setUserId] = useState("");

  const [profileData, setProfileData] = useState<ProfileResponse | null>(null);
  const [alerts, setAlerts] = useState<AlertsResponse["alerts"]>([]);
  const [showFuturePlans, setShowFuturePlans] = useState(false);

  const [title, setTitle] = useState("");
  const [contentType, setContentType] = useState<ContentType>("text");
  const [textContent, setTextContent] = useState("");
  const [customUrl, setCustomUrl] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const [activationMode, setActivationMode] =
    useState<ActivationMode>("subscription_period");
  const [activationDays, setActivationDays] = useState("1");
  const [activationStartDate, setActivationStartDate] = useState("");
  const [maxViewsEnabled, setMaxViewsEnabled] = useState(false);
  const [maxViewsTotalThousands, setMaxViewsTotalThousands] = useState("");

  const [fallbackText, setFallbackText] = useState("");
  const [viewsExhaustedText, setViewsExhaustedText] = useState("");
  const [lowViewsAlertThresholdThousands, setLowViewsAlertThresholdThousands] =
    useState("");

  const [historyFrom, setHistoryFrom] = useState("");
  const [historyTo, setHistoryTo] = useState("");
  const [historyResult, setHistoryResult] = useState<number | null>(null);

  const [showRegenerateConfirm, setShowRegenerateConfirm] = useState(false);

  const [showContentModal, setShowContentModal] = useState(false);
  const [modalType, setModalType] = useState<DraftContentType>(null);
  const [draftTextContent, setDraftTextContent] = useState("");
  const [draftCustomUrl, setDraftCustomUrl] = useState("");
  const [draftFile, setDraftFile] = useState<File | null>(null);

  const [showPrintModal, setShowPrintModal] = useState(false);
  const [printUnit, setPrintUnit] = useState<"cm" | "inch">("cm");
  const [printSize, setPrintSize] = useState("5");

  useEffect(() => {
    setLanguageState(getStoredLanguage());
  }, []);

  useEffect(() => {
    setStoredLanguage(language);
  }, [language]);

  useEffect(() => {
    const loadLanguageData = async () => {
      const [langs, dict] = await Promise.all([
        getAvailableLanguages(),
        getDictionary(language)
      ]);

      setAvailableLanguages(langs);
      setDictionary(dict);
    };

    loadLanguageData().catch(console.error);
  }, [language]);

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

        await Promise.all([loadProfile(currentUserId), loadAlerts(currentUserId)]);
      } catch (error) {
        console.error(error);
        setMessage(t(dictionary, "errors.generic"));
      } finally {
        setLoading(false);
      }
    };

    load().catch(console.error);
  }, [router, dictionary]);

  useEffect(() => {
    const generateQrPreview = async () => {
      if (!qrCanvasRef.current || !profileData || typeof window === "undefined") {
        return;
      }

      const publicUrl = `${window.location.origin}/view/${profileData.qrCode.public_code}`;

      try {
        await QRCode.toCanvas(qrCanvasRef.current, publicUrl, {
          width: 280,
          margin: 2
        });
      } catch (error) {
        console.error("QR render error:", error);
      }
    };

    generateQrPreview().catch(console.error);
  }, [profileData]);

  async function loadProfile(currentUserId: string) {
    const res = await fetch(`/api/profile?userId=${encodeURIComponent(currentUserId)}`, {
      cache: "no-store"
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data?.error || "Profile load failed");
    }

    const typed = data as ProfileResponse;

    setProfileData(typed);
    setTitle(typed.qrCode.title || "");
    setContentType(typed.qrCode.content_type);
    setTextContent(typed.qrCode.text_content || "");
    setCustomUrl(typed.qrCode.custom_url || "");
    setActivationMode(typed.qrCode.activation_mode);
    setActivationDays(String(typed.qrCode.activation_days || 1));
    setActivationStartDate(
      typed.qrCode.activation_started_at
        ? typed.qrCode.activation_started_at.slice(0, 10)
        : ""
    );
    setMaxViewsEnabled(typed.qrCode.max_views_enabled);
    setMaxViewsTotalThousands(
      typed.qrCode.max_views_total
        ? String(Math.floor(typed.qrCode.max_views_total / 1000))
        : ""
    );
    setFallbackText(typed.qrCode.fallback_text || "");
    setViewsExhaustedText(typed.qrCode.views_exhausted_text || "");
    setLowViewsAlertThresholdThousands(
      typed.profile.low_views_alert_threshold
        ? String(Math.floor(typed.profile.low_views_alert_threshold / 1000))
        : ""
    );
  }

  async function loadAlerts(currentUserId: string) {
    const res = await fetch(`/api/alerts?userId=${encodeURIComponent(currentUserId)}`, {
      cache: "no-store"
    });

    const data = await res.json();

    if (!res.ok) {
      throw new Error(data?.error || "Alerts load failed");
    }

    setAlerts((data as AlertsResponse).alerts);
  }

  const publicViewUrl = useMemo(() => {
    if (!profileData || typeof window === "undefined") return "";
    return `${window.location.origin}/view/${profileData.qrCode.public_code}`;
  }, [profileData]);

  const currentPublishedContent = useMemo(() => {
    if (!profileData) return "";

    if (contentType === "text") {
      return truncateText(textContent || profileData.qrCode.text_content || "", 120);
    }

    if (contentType === "url") {
      return truncateText(customUrl || profileData.qrCode.custom_url || "", 120);
    }

    if (contentType === "media") {
      return selectedFile?.name || profileData.qrCode.file_name || "";
    }

    return "";
  }, [profileData, contentType, textContent, customUrl, selectedFile]);

  const previewText = useMemo(() => {
    if (contentType === "text") {
      return textContent || "Zatím není nastaven žádný text.";
    }

    if (contentType === "url") {
      return customUrl
        ? `Uživatelé budou přesměrováni na:\n${customUrl}`
        : "Zatím není nastavena žádná URL.";
    }

    return selectedFile?.name || profileData?.qrCode.file_name || "Zatím není vybraný soubor.";
  }, [contentType, textContent, customUrl, selectedFile, profileData]);

  const currentPlanSummary = useMemo(() => {
    if (!profileData) return "Free plán";

    const currentPlan = profileData.subscriptionPlans.currentPlan;

    if (!currentPlan) {
      return "Free plán";
    }

    return `${getPlanLabel(currentPlan.planType)} aktivní do ${formatDate(currentPlan.endsAt)}`;
  }, [profileData]);

  function openContentModal(type: DraftContentType) {
    setModalType(type);

    if (type === "text") {
      setDraftTextContent(textContent);
      setDraftCustomUrl("");
      setDraftFile(null);
    } else if (type === "url") {
      setDraftCustomUrl(customUrl);
      setDraftTextContent("");
      setDraftFile(null);
    } else if (type === "media") {
      setDraftTextContent("");
      setDraftCustomUrl("");
      setDraftFile(null);
    }

    setShowContentModal(true);
  }

  function closeContentModal() {
    setShowContentModal(false);
    setModalType(null);
    setDraftTextContent("");
    setDraftCustomUrl("");
    setDraftFile(null);
  }

  function confirmContentModal() {
    if (modalType === "text") {
      setContentType("text");
      setTextContent(draftTextContent);
    }

    if (modalType === "url") {
      setContentType("url");
      setCustomUrl(draftCustomUrl);
    }

    if (modalType === "media") {
      setContentType("media");
      setSelectedFile(draftFile);
    }

    closeContentModal();
  }

  async function handleSave() {
    if (!userId || !profileData) return;

    try {
      setSaving(true);
      setMessage("");

      const formData = new FormData();
      formData.append("userId", userId);
      formData.append("qrId", profileData.qrCode.id);
      formData.append("title", title.trim());
      formData.append("contentType", contentType);
      formData.append("textContent", textContent);
      formData.append("customUrl", customUrl);
      formData.append("activationMode", activationMode);
      formData.append("activationDays", activationDays);
      formData.append("activationStartDate", activationStartDate);
      formData.append("maxViewsEnabled", String(maxViewsEnabled));
      formData.append("maxViewsTotalThousands", maxViewsTotalThousands);
      formData.append("fallbackText", fallbackText.trim());
      formData.append("viewsExhaustedText", viewsExhaustedText.trim());
      formData.append(
        "lowViewsAlertThresholdThousands",
        lowViewsAlertThresholdThousands
      );

      if (selectedFile) {
        formData.append("file", selectedFile);
      }

      const res = await fetch("/api/qr/update", {
        method: "POST",
        body: formData
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage(data?.error || t(dictionary, "errors.saveFailed"));
        return;
      }

      await Promise.all([loadProfile(userId), loadAlerts(userId)]);
      setSelectedFile(null);
      setMessage("Uloženo.");
    } catch (error) {
      console.error(error);
      setMessage(t(dictionary, "errors.saveFailed"));
    } finally {
      setSaving(false);
    }
  }

  async function handleLoadHistory() {
    if (!userId || !historyFrom || !historyTo) return;

    try {
      const params = new URLSearchParams({
        userId,
        from: historyFrom,
        to: historyTo
      });

      const res = await fetch(`/api/history?${params.toString()}`, {
        cache: "no-store"
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage(data?.error || t(dictionary, "errors.generic"));
        return;
      }

      setHistoryResult((data as HistoryResponse).totalValidScans);
    } catch (error) {
      console.error(error);
      setMessage(t(dictionary, "errors.generic"));
    }
  }

  async function handleRegenerateQr() {
    if (!userId || !profileData) return;

    try {
      setSaving(true);
      setMessage("");

      const res = await fetch("/api/qr/update", {
        method: "POST",
        body: JSON.stringify({
          mode: "regenerate",
          userId,
          qrId: profileData.qrCode.id
        }),
        headers: {
          "Content-Type": "application/json"
        }
      });

      const data = await res.json();

      if (!res.ok) {
        setMessage(data?.error || t(dictionary, "errors.generic"));
        return;
      }

      await loadProfile(userId);
      setShowRegenerateConfirm(false);
      setMessage("Nový QR kód byl vygenerován.");
    } catch (error) {
      console.error(error);
      setMessage(t(dictionary, "errors.generic"));
    } finally {
      setSaving(false);
    }
  }

  async function handleCopyLink() {
    try {
      if (!publicViewUrl) return;
      await navigator.clipboard.writeText(publicViewUrl);
      setMessage("Odkaz byl zkopírován.");
    } catch (error) {
      console.error(error);
      setMessage("Nepodařilo se zkopírovat odkaz.");
    }
  }

  function handleDownloadQr() {
    if (!qrCanvasRef.current) return;

    const link = document.createElement("a");
    link.href = qrCanvasRef.current.toDataURL("image/png");
    link.download = "rqtools-qr.png";
    link.click();
  }

  function handlePrintQr() {
    if (!qrCanvasRef.current) return;

    const dataUrl = qrCanvasRef.current.toDataURL("image/png");
    const size = Number(printSize) || 5;
    const unit = printUnit;

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
              width: ${size}${unit};
              height: ${size}${unit};
              object-fit: contain;
              display: block;
              margin: 0 auto 12px auto;
            }
          </style>
        </head>
        <body>
          <div class="wrap">
            <img src="${dataUrl}" alt="QR code" />
            <div>${title || "Můj QR kód"}</div>
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

  if (loading || !profileData) {
    return (
      <main style={styles.page}>
        <div style={styles.loadingCard}>{t(dictionary, "common.loading")}</div>
      </main>
    );
  }

  const currentPlan = profileData.subscriptionPlans.currentPlan;
  const futurePlans = profileData.subscriptionPlans.futurePlans;

  return (
    <main style={styles.page}>
      <div style={styles.topBar}>
        <div>
          <div style={styles.brand}>RQtools</div>
          <div style={styles.subBrand}>Dashboard</div>
        </div>

        <div style={styles.topRight}>
          <select
            value={language}
            onChange={(e) => setLanguageState(e.target.value)}
            style={styles.select}
          >
            {availableLanguages.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.label}
              </option>
            ))}
          </select>

          <button
            type="button"
            style={styles.secondaryButton}
            onClick={async () => {
              await supabase.auth.signOut();
              router.push("/login");
            }}
          >
            Odhlásit se
          </button>
        </div>
      </div>

      <div style={styles.stackGrid}>
        <section style={styles.phoneCard}>
          <div style={styles.cardTitle}>Aktuální plán</div>
          <div style={styles.bigValue}>{currentPlanSummary}</div>

          {currentPlan ? (
            <div style={styles.smallText}>
              Aktivní od {formatDate(currentPlan.startsAt)} do {formatDate(currentPlan.endsAt)}
            </div>
          ) : (
            <div style={styles.smallText}>Momentálně běží free režim.</div>
          )}

          {futurePlans.length > 0 ? (
            <>
              <button
                type="button"
                style={styles.secondaryButton}
                onClick={() => setShowFuturePlans((prev) => !prev)}
              >
                {showFuturePlans
                  ? "Skrýt další předplacené plány"
                  : "Zobrazit další předplacené plány"}
              </button>

              {showFuturePlans ? (
                <div style={styles.inlinePlanList}>
                  {futurePlans.map((plan, index) => (
                    <div key={`${plan.planType}-${plan.startsAt}-${index}`} style={styles.inlinePlanItem}>
                      <div style={styles.inlinePlanTitle}>{getPlanLabel(plan.planType)}</div>
                      <div style={styles.inlinePlanText}>
                        Začátek: {formatDate(plan.startsAt)}
                      </div>
                      <div style={styles.inlinePlanText}>
                        Konec: {formatDate(plan.endsAt)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </>
          ) : null}
        </section>

        <section style={styles.phoneCard}>
          <div style={styles.cardTitle}>Kredit a cena views</div>
          <div style={styles.rowTwoCols}>
            <div style={styles.valueBox}>
              <div style={styles.valueLabel}>Aktuální kredit</div>
              <div style={styles.valueNumber}>
                {profileData.profile.credit_points_balance.toFixed(2)}
              </div>
            </div>

            <div style={styles.valueBox}>
              <div style={styles.valueLabel}>Cena / 1000 views při tomto plánu</div>
              <div style={styles.valueNumberSmall}>
                {contentType === "text"
                  ? "Text"
                  : contentType === "url"
                  ? "URL"
                  : "Media"}
              </div>
              <div style={styles.valueHint}>{getCurrentRateLabel(contentType, profileData)}</div>
            </div>
          </div>
        </section>

        <section style={styles.phoneCard}>
          <div style={styles.cardTitle}>Views zdarma a views za kredit</div>
          <div style={styles.rowTwoCols}>
            <div style={styles.valueBox}>
              <div style={styles.valueLabel}>Views zdarma</div>
              <div style={styles.valueNumber}>
                {profileData.profile.free_views_remaining.toLocaleString()}
              </div>
            </div>

            <div style={styles.valueBox}>
              <div style={styles.valueLabel}>Views za aktuální kredit</div>
              <div style={styles.valueNumber}>
                {(contentType === "text"
                  ? profileData.approxViewsFromCredit.text
                  : contentType === "url"
                  ? profileData.approxViewsFromCredit.url
                  : profileData.approxViewsFromCredit.media
                ).toLocaleString()}
              </div>
            </div>
          </div>
        </section>

        <section style={styles.phoneCard}>
          <div style={styles.cardTitle}>Upozornění při poklesu views</div>
          <label style={styles.label}>Při kolika tisícovkách informovat</label>
          <input
            type="number"
            min="0"
            value={lowViewsAlertThresholdThousands}
            onChange={(e) => setLowViewsAlertThresholdThousands(e.target.value)}
            style={styles.input}
            placeholder="např. 10"
          />
          <div style={styles.smallText}>
            Např. 10 = informovat při poklesu pod 10 000 views.
          </div>
        </section>

        <section style={styles.phoneCard}>
          <div style={styles.cardTitle}>Historie views</div>
          <div style={styles.rowTwoCols}>
            <div>
              <label style={styles.label}>Od</label>
              <input
                type="date"
                value={historyFrom}
                onChange={(e) => setHistoryFrom(e.target.value)}
                style={styles.input}
              />
            </div>

            <div>
              <label style={styles.label}>Do</label>
              <input
                type="date"
                value={historyTo}
                onChange={(e) => setHistoryTo(e.target.value)}
                style={styles.input}
              />
            </div>
          </div>

          <button type="button" style={styles.secondaryButton} onClick={handleLoadHistory}>
            Zobrazit historii
          </button>

          <div style={styles.valueBoxFull}>
            <div style={styles.valueLabel}>Počet validních skenů</div>
            <div style={styles.valueNumber}>
              {historyResult === null ? "—" : historyResult.toLocaleString()}
            </div>
          </div>
        </section>

        <section style={styles.phoneCard}>
          <div style={styles.cardTitle}>Aktivace zobrazení</div>

          <div style={styles.segmentRow}>
            <button
              type="button"
              onClick={() => setActivationMode("subscription_period")}
              style={{
                ...styles.segmentButton,
                ...(activationMode === "subscription_period"
                  ? styles.segmentButtonActive
                  : {})
              }}
            >
              Pořád v předplaceném období
            </button>

            <button
              type="button"
              onClick={() => setActivationMode("days")}
              style={{
                ...styles.segmentButton,
                ...(activationMode === "days" ? styles.segmentButtonActive : {})
              }}
            >
              Od data + počet dní
            </button>

            <button
              type="button"
              onClick={() => setActivationMode("unlimited")}
              style={{
                ...styles.segmentButton,
                ...(activationMode === "unlimited"
                  ? styles.segmentButtonActive
                  : {})
              }}
            >
              Bez konce
            </button>
          </div>

          {activationMode === "days" ? (
            <div style={styles.rowTwoCols}>
              <div>
                <label style={styles.label}>Od data</label>
                <input
                  type="date"
                  value={activationStartDate}
                  onChange={(e) => setActivationStartDate(e.target.value)}
                  style={styles.input}
                />
              </div>

              <div>
                <label style={styles.label}>Počet dní</label>
                <input
                  type="number"
                  min="1"
                  value={activationDays}
                  onChange={(e) => setActivationDays(e.target.value)}
                  style={styles.input}
                />
              </div>
            </div>
          ) : null}

          <div style={styles.smallText}>
            {getDisplayActivationLabel(activationMode, activationDays)}
          </div>
        </section>

        <section style={styles.phoneCard}>
          <div style={styles.cardTitle}>Název QR kódu</div>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={styles.input}
            placeholder="Název QR kódu"
          />
        </section>

        <section style={styles.phoneCard}>
          <div style={styles.cardTitle}>Obsah QR</div>

          <div style={styles.segmentRow}>
            <button type="button" style={styles.segmentButton} onClick={() => openContentModal("text")}>
              Text
            </button>
            <button type="button" style={styles.segmentButton} onClick={() => openContentModal("url")}>
              URL
            </button>
            <button type="button" style={styles.segmentButton} onClick={() => openContentModal("media")}>
              Media
            </button>
          </div>

          <div style={styles.valueBoxFull}>
            <div style={styles.valueLabel}>Aktuálně zveřejněno</div>
            <div style={styles.valueNumberSmall}>
              {currentPublishedContent || "Zatím není zveřejněn žádný obsah."}
            </div>
          </div>
        </section>

        <section style={styles.phoneCard}>
          <div style={styles.cardTitle}>Náhled zobrazení po naskenování</div>
          <div style={styles.previewBox}>{previewText}</div>
        </section>

        <section style={styles.phoneCard}>
          <div style={styles.cardTitle}>QR kód</div>

          <div style={styles.qrWrap}>
            <canvas ref={qrCanvasRef} />
          </div>

          <div style={styles.linkBox}>{publicViewUrl}</div>

          <div style={styles.buttonStack}>
            <button type="button" style={styles.secondaryButton} onClick={handleCopyLink}>
              Copy link na URL
            </button>

            <button
              type="button"
              style={styles.secondaryButton}
              onClick={() => setShowPrintModal(true)}
            >
              Print QR kód
            </button>

            <button type="button" style={styles.secondaryButton} onClick={handleDownloadQr}>
              Download obrázek QR kódu
            </button>

            <button
              type="button"
              style={styles.dangerButton}
              onClick={() => setShowRegenerateConfirm(true)}
            >
              Vygenerovat nový QR kód
            </button>
          </div>
        </section>

        <section style={styles.phoneCard}>
          <div style={styles.cardTitle}>Fallback texty</div>

          <label style={styles.label}>Obecný fallback</label>
          <textarea
            value={fallbackText}
            onChange={(e) => setFallbackText(e.target.value)}
            style={styles.textarea}
          />

          <label style={styles.label}>Text při vyčerpání views</label>
          <textarea
            value={viewsExhaustedText}
            onChange={(e) => setViewsExhaustedText(e.target.value)}
            style={styles.textarea}
          />
        </section>

        <section style={styles.phoneCard}>
          <div style={styles.cardTitle}>Upozornění</div>

          {alerts.length === 0 ? (
            <div style={styles.smallText}>Zatím nejsou žádná upozornění.</div>
          ) : (
            <div style={styles.alertList}>
              {alerts.slice(0, 8).map((alert) => (
                <div key={alert.id} style={styles.alertItem}>
                  <div style={styles.alertMessage}>{alert.message}</div>
                  <div style={styles.alertDate}>{formatDate(alert.created_at)}</div>
                </div>
              ))}
            </div>
          )}
        </section>

        <section style={styles.phoneCard}>
          <div style={styles.cardTitle}>Uložit změny</div>
          <button
            type="button"
            style={styles.primaryButton}
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Ukládám..." : "Uložit vše"}
          </button>
        </section>
      </div>

      {message ? <div style={styles.floatingMessage}>{message}</div> : null}

      {showContentModal ? (
        <div style={styles.modalOverlay} onClick={closeContentModal}>
          <div style={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalTitle}>
              {modalType === "text"
                ? "Nastavit text"
                : modalType === "url"
                ? "Nastavit URL"
                : "Vybrat media"}
            </div>

            {modalType === "text" ? (
              <textarea
                value={draftTextContent}
                onChange={(e) => setDraftTextContent(e.target.value)}
                style={styles.modalTextarea}
                placeholder="Sem napiš text"
              />
            ) : null}

            {modalType === "url" ? (
              <input
                value={draftCustomUrl}
                onChange={(e) => setDraftCustomUrl(e.target.value)}
                style={styles.input}
                placeholder="https://..."
              />
            ) : null}

            {modalType === "media" ? (
              <div style={styles.filePickerWrap}>
                <input
                  type="file"
                  onChange={(e: ChangeEvent<HTMLInputElement>) => {
                    setDraftFile(e.target.files?.[0] || null);
                  }}
                  style={styles.input}
                />
                <div style={styles.smallText}>
                  {draftFile ? draftFile.name : "Zatím není vybraný soubor."}
                </div>
              </div>
            ) : null}

            <div style={styles.modalActions}>
              <button type="button" style={styles.secondaryButton} onClick={closeContentModal}>
                Zrušit
              </button>
              <button
                type="button"
                style={styles.primaryButton}
                onClick={confirmContentModal}
              >
                Potvrdit
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showRegenerateConfirm ? (
        <div style={styles.modalOverlay} onClick={() => setShowRegenerateConfirm(false)}>
          <div style={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalTitle}>Vygenerovat nový QR kód</div>
            <div style={styles.warningText}>
              QR kód bude nevratně změněn. Aktuální QR kód už nebude nikde platný
              a bude nahrazen novým.
            </div>

            <div style={styles.modalActions}>
              <button
                type="button"
                style={styles.secondaryButton}
                onClick={() => setShowRegenerateConfirm(false)}
              >
                Zrušit
              </button>
              <button
                type="button"
                style={styles.dangerButton}
                onClick={handleRegenerateQr}
                disabled={saving}
              >
                {saving ? "Provádím..." : "Potvrdit změnu"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showPrintModal ? (
        <div style={styles.modalOverlay} onClick={() => setShowPrintModal(false)}>
          <div style={styles.modalCard} onClick={(e) => e.stopPropagation()}>
            <div style={styles.modalTitle}>Tisk QR kódu</div>

            <div style={styles.rowTwoCols}>
              <div>
                <label style={styles.label}>Jednotka</label>
                <select
                  value={printUnit}
                  onChange={(e) => setPrintUnit(e.target.value as "cm" | "inch")}
                  style={styles.select}
                >
                  <option value="cm">cm</option>
                  <option value="inch">inch</option>
                </select>
              </div>

              <div>
                <label style={styles.label}>Velikost</label>
                <input
                  type="number"
                  min="1"
                  value={printSize}
                  onChange={(e) => setPrintSize(e.target.value)}
                  style={styles.input}
                />
              </div>
            </div>

            <div style={styles.modalActions}>
              <button
                type="button"
                style={styles.secondaryButton}
                onClick={() => setShowPrintModal(false)}
              >
                Zavřít
              </button>
              <button type="button" style={styles.primaryButton} onClick={handlePrintQr}>
                Tisknout
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </main>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "#f3f6fb",
    padding: 16,
    boxSizing: "border-box"
  },
  topBar: {
    maxWidth: 1600,
    margin: "0 auto 16px auto",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 16,
    flexWrap: "wrap"
  },
  brand: {
    fontSize: 28,
    fontWeight: 800,
    color: "#0f172a"
  },
  subBrand: {
    fontSize: 14,
    color: "#64748b",
    marginTop: 4
  },
  topRight: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap"
  },
  stackGrid: {
    maxWidth: 1600,
    margin: "0 auto",
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(290px, 360px))",
    gap: 16,
    alignItems: "start",
    justifyContent: "start"
  },
  phoneCard: {
    width: "100%",
    minHeight: 220,
    background: "#ffffff",
    border: "1px solid #dbe3ee",
    borderRadius: 24,
    padding: 18,
    boxSizing: "border-box",
    boxShadow: "0 10px 30px rgba(15, 23, 42, 0.06)",
    display: "flex",
    flexDirection: "column",
    gap: 14
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 800,
    color: "#0f172a"
  },
  bigValue: {
    fontSize: 22,
    fontWeight: 800,
    lineHeight: 1.35,
    color: "#111827"
  },
  smallText: {
    fontSize: 13,
    color: "#64748b",
    lineHeight: 1.5
  },
  rowTwoCols: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 12
  },
  valueBox: {
    border: "1px solid #e2e8f0",
    borderRadius: 16,
    padding: 14,
    background: "#f8fbff",
    minHeight: 110,
    boxSizing: "border-box"
  },
  valueBoxFull: {
    border: "1px solid #e2e8f0",
    borderRadius: 16,
    padding: 14,
    background: "#f8fbff",
    boxSizing: "border-box"
  },
  valueLabel: {
    fontSize: 13,
    color: "#64748b",
    marginBottom: 8
  },
  valueNumber: {
    fontSize: 28,
    fontWeight: 800,
    color: "#0f172a",
    wordBreak: "break-word"
  },
  valueNumberSmall: {
    fontSize: 18,
    fontWeight: 800,
    color: "#0f172a",
    wordBreak: "break-word"
  },
  valueHint: {
    marginTop: 8,
    fontSize: 12,
    color: "#64748b",
    lineHeight: 1.4
  },
  label: {
    fontSize: 13,
    fontWeight: 700,
    color: "#334155"
  },
  input: {
    width: "100%",
    padding: 12,
    borderRadius: 14,
    border: "1px solid #cbd5e1",
    background: "#ffffff",
    fontSize: 14,
    boxSizing: "border-box"
  },
  select: {
    width: "100%",
    padding: 12,
    borderRadius: 14,
    border: "1px solid #cbd5e1",
    background: "#ffffff",
    fontSize: 14,
    boxSizing: "border-box"
  },
  textarea: {
    width: "100%",
    minHeight: 96,
    padding: 12,
    borderRadius: 14,
    border: "1px solid #cbd5e1",
    background: "#ffffff",
    fontSize: 14,
    boxSizing: "border-box",
    resize: "vertical",
    fontFamily: "inherit"
  },
  segmentRow: {
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: 10
  },
  segmentButton: {
    width: "100%",
    padding: "12px 14px",
    borderRadius: 14,
    border: "1px solid #cbd5e1",
    background: "#ffffff",
    cursor: "pointer",
    fontWeight: 700,
    fontSize: 14,
    textAlign: "left"
  },
  segmentButtonActive: {
    background: "#eff6ff",
    border: "1px solid #2563eb",
    color: "#1d4ed8"
  },
  previewBox: {
    border: "1px dashed #cbd5e1",
    borderRadius: 18,
    background: "#ffffff",
    padding: 18,
    minHeight: 180,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
    fontSize: 18,
    fontWeight: 700,
    lineHeight: 1.4,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center"
  },
  qrWrap: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    padding: 12,
    borderRadius: 18,
    background: "#ffffff",
    border: "1px solid #e2e8f0"
  },
  linkBox: {
    padding: 12,
    borderRadius: 14,
    border: "1px solid #e2e8f0",
    background: "#f8fbff",
    fontSize: 13,
    lineHeight: 1.5,
    wordBreak: "break-all"
  },
  buttonStack: {
    display: "flex",
    flexDirection: "column",
    gap: 10
  },
  primaryButton: {
    width: "100%",
    padding: "13px 16px",
    borderRadius: 14,
    border: "1px solid #2563eb",
    background: "#2563eb",
    color: "#ffffff",
    cursor: "pointer",
    fontWeight: 800,
    fontSize: 14
  },
  secondaryButton: {
    width: "100%",
    padding: "13px 16px",
    borderRadius: 14,
    border: "1px solid #cbd5e1",
    background: "#ffffff",
    color: "#111827",
    cursor: "pointer",
    fontWeight: 800,
    fontSize: 14
  },
  dangerButton: {
    width: "100%",
    padding: "13px 16px",
    borderRadius: 14,
    border: "1px solid #dc2626",
    background: "#dc2626",
    color: "#ffffff",
    cursor: "pointer",
    fontWeight: 800,
    fontSize: 14
  },
  alertList: {
    display: "flex",
    flexDirection: "column",
    gap: 10
  },
  alertItem: {
    border: "1px solid #e2e8f0",
    borderRadius: 14,
    background: "#fffaf0",
    padding: 12
  },
  alertMessage: {
    fontSize: 14,
    fontWeight: 700,
    color: "#0f172a",
    lineHeight: 1.45
  },
  alertDate: {
    marginTop: 6,
    fontSize: 12,
    color: "#64748b"
  },
  floatingMessage: {
    position: "fixed",
    right: 18,
    bottom: 18,
    maxWidth: 360,
    padding: "12px 14px",
    borderRadius: 14,
    background: "#0f172a",
    color: "#ffffff",
    fontSize: 14,
    boxShadow: "0 12px 35px rgba(15,23,42,0.25)",
    zIndex: 1001
  },
  loadingCard: {
    maxWidth: 500,
    margin: "120px auto",
    background: "#ffffff",
    border: "1px solid #dbe3ee",
    borderRadius: 22,
    padding: 24,
    textAlign: "center",
    fontWeight: 700
  },
  modalOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(15,23,42,0.5)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 18,
    zIndex: 1000
  },
  modalCard: {
    width: "100%",
    maxWidth: 560,
    background: "#ffffff",
    borderRadius: 22,
    border: "1px solid #dbe3ee",
    padding: 18,
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    gap: 14
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 800,
    color: "#0f172a"
  },
  modalTextarea: {
    width: "100%",
    minHeight: 180,
    padding: 12,
    borderRadius: 14,
    border: "1px solid #cbd5e1",
    background: "#ffffff",
    fontSize: 14,
    boxSizing: "border-box",
    resize: "vertical",
    fontFamily: "inherit"
  },
  filePickerWrap: {
    display: "flex",
    flexDirection: "column",
    gap: 10
  },
  modalActions: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 12
  },
  warningText: {
    padding: 12,
    borderRadius: 14,
    border: "1px solid #fecaca",
    background: "#fef2f2",
    color: "#991b1b",
    fontSize: 14,
    lineHeight: 1.6
  },
  inlinePlanList: {
    display: "flex",
    flexDirection: "column",
    gap: 10
  },
  inlinePlanItem: {
    border: "1px solid #dbeafe",
    background: "#f8fbff",
    borderRadius: 14,
    padding: 12
  },
  inlinePlanTitle: {
    fontSize: 16,
    fontWeight: 800,
    color: "#1e3a8a"
  },
  inlinePlanText: {
    marginTop: 4,
    fontSize: 13,
    color: "#475569"
  }
};
