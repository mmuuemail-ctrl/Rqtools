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
          width: 320,
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
    link.download = `${title || "rqtools-qr"}.png`;
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
            .label {
              font-size: 16px;
              font-weight: 700;
            }
          </style>
        </head>
        <body>
          <div class="wrap">
            <img src="${dataUrl}" alt="QR code" />
            <div class="label">${title || "Můj QR kód"}</div>
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
            style={styles.selectCompact}
          >
            {availableLanguages.map((lang) => (
              <option key={lang.code} value={lang.code}>
                {lang.label}
              </option>
            ))}
          </select>

          <button
            type="button"
            style={styles.headerButton}
            onClick={() => router.push("/subscribe")}
          >
            Předplatné a kredit
          </button>

          <button
            type="button"
            style={styles.headerButton}
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
        <section style={{ ...styles.phoneCard, ...styles.cardCompact }}>
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

        <section style={{ ...styles.phoneCard, ...styles.cardCompact }}>
          <div style={styles.cardTitle}>Kredit a cena views</div>
          <div style={styles.rowTwoCols}>
            <div style={styles.valueBoxCompact}>
              <div style={styles.valueLabel}>Aktuální kredit</div>
              <div style={styles.valueNumber}>
                {profileData.profile.credit_points_balance.toFixed(2)}
              </div>
            </div>

            <div style={styles.valueBoxCompact}>
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

        <section style={{ ...styles.phoneCard, ...styles.cardCompact }}>
          <div style={styles.cardTitle}>Views zdarma a views za kredit</div>
          <div style={styles.rowTwoCols}>
            <div style={styles.valueBoxCompact}>
              <div style={styles.valueLabel}>Views zdarma</div>
              <div style={styles.valueNumber}>
                {profileData.profile.free_views_remaining.toLocaleString()}
              </div>
            </div>

            <div style={styles.valueBoxCompact}>
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

        <section style={{ ...styles.phoneCard, ...styles.cardCompact }}>
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

        <section style={{ ...styles.phoneCard, ...styles.cardCompact }}>
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

        <section style={{ ...styles.phoneCard, ...styles.cardCompact }}>
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

        <section style={{ ...styles.phoneCard, ...styles.cardCompact }}>
          <div style={styles.cardTitle}>Název QR kódu</div>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            style={styles.input}
            placeholder="Název QR kódu"
          />
        </section>

        <section style={{ ...styles.phoneCard, ...styles.cardCompact }}>
          <div style={styles.cardTitle}>Obsah QR</div>

          <div style={styles.segmentRowThree}>
            <button type="button" style={styles.segmentButtonCenter} onClick={() => openContentModal("text")}>
              Text
            </button>
            <button type="button" style={styles.segmentButtonCenter} onClick={() => openContentModal("url")}>
              URL
            </button>
            <button type="button" style={styles.segmentButtonCenter} onClick={() => openContentModal("media")}>
              Media
            </button
