"use client";

import { ChangeEvent, CSSProperties, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "../lib/supabase-browser";
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

type ProfileResponse = {
  profile: {
    id: string;
    plan_type: "free" | "day" | "month" | "year";
    subscription_status: "inactive" | "active" | "expired" | "canceled";
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

function formatDate(value: string | null) {
  if (!value) return "—";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

function truncateText(value: string, max = 90) {
  if (!value) return "";
  return value.length > max ? `${value.slice(0, max)}...` : value;
}

export default function DashboardPage() {
  const router = useRouter();

  const [language, setLanguage] = useState("cs");
  const [dictionary, setDictionary] = useState<LanguageDictionary | null>(null);
  const [availableLanguages, setAvailableLanguages] = useState<LanguageMeta[]>([]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [userId, setUserId] = useState("");

  const [profileData, setProfileData] = useState<ProfileResponse | null>(null);
  const [alerts, setAlerts] = useState<AlertsResponse["alerts"]>([]);

  const [title, setTitle] = useState("");
  const [contentType, setContentType] = useState<ContentType>("text");
  const [textContent, setTextContent] = useState("");
  const [customUrl, setCustomUrl] = useState("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const [activationMode, setActivationMode] = useState<ActivationMode>("subscription_period");
  const [activationDays, setActivationDays] = useState("1");
  const [maxViewsEnabled, setMaxViewsEnabled] = useState(false);
  const [maxViewsTotalThousands, setMaxViewsTotalThousands] = useState("");
  const [fallbackText, setFallbackText] = useState("");
  const [viewsExhaustedText, setViewsExhaustedText] = useState("");
  const [lowViewsAlertThresholdThousands, setLowViewsAlertThresholdThousands] = useState("");

  const [historyFrom, setHistoryFrom] = useState("");
  const [historyTo, setHistoryTo] = useState("");
  const [historyResult, setHistoryResult] = useState<number | null>(null);

  const [showRegenerateConfirm, setShowRegenerateConfirm] = useState(false);

  useEffect(() => {
    setLanguage(getStoredLanguage());
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

        const { data } = await supabaseBrowser.auth.getSession();
        const currentUserId = data.session?.user?.id || "";

        if (!currentUserId) {
          router.push("/login");
          return;
        }

        setUserId(currentUserId);

        await Promise.all([
          loadProfile(currentUserId),
          loadAlerts(currentUserId)
        ]);
      } catch (error) {
        console.error(error);
        setMessage(t(dictionary, "errors.generic"));
      } finally {
        setLoading(false);
      }
    };

    load().catch(console.error);
  }, [router, dictionary]);

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
    setMaxViewsEnabled(typed.qrCode.max_views_enabled);
    setMaxViewsTotalThousands(
      typed.qrCode.max_views_total ? String(Math.floor(typed.qrCode.max_views_total / 1000)) : ""
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

  const publicViewUrl = useMemo(() => {
    if (!profileData || typeof window === "undefined") return "";
    return `${window.location.origin}/view/${profileData.qrCode.public_code}`;
  }, [profileData]);

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
      formData.append("maxViewsEnabled", String(maxViewsEnabled));
      formData.append("maxViewsTotalThousands", maxViewsTotalThousands);
      formData.append("fallbackText", fallbackText.trim());
      formData.append("viewsExhaustedText", viewsExhaustedText.trim());
      formData.append("lowViewsAlertThresholdThousands", lowViewsAlertThresholdThousands);

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

      await Promise.all([
        loadProfile(userId),
        loadAlerts(userId)
      ]);

      setSelectedFile(null);
      setMessage(t(dictionary, "common.save"));
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
      setMessage(t(dictionary, "common.generateNew"));
    } catch (error) {
      console.error(error);
      setMessage(t(dictionary, "errors.generic"));
    } finally {
      setSaving(false);
    }
  }

  if (loading || !profileData) {
    return (
      <main style={styles.page}>
        <div style={styles.centerCard}>{t(dictionary, "common.loading")}</div>
      </main>
    );
  }

  const planLabel =
    profileData.profile.subscription_status === "active"
      ? `${profileData.profile.plan_type.toUpperCase()} · ${formatDate(profileData.profile.subscription_expires_at)}`
      : "FREE";

  return (
    <main style={styles.page}>
      <div style={styles.shell}>
        <div style={styles.topBar}>
          <div>
            <div style={styles.brand}>{t(dictionary, "common.appName")}</div>
            <div style={styles.pageTitle}>{t(dictionary, "dashboard.title")}</div>
          </div>

          <div style={styles.topActions}>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value)}
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
                await supabaseBrowser.auth.signOut();
                router.push("/login");
              }}
            >
              {t(dictionary, "common.logout")}
            </button>
          </div>
        </div>

        <div style={styles.grid}>
          <section style={styles.card}>
            <h2 style={styles.sectionTitle}>{t(dictionary, "dashboard.planStatus")}</h2>

            <div style={styles.infoGrid}>
              <div style={styles.infoBox}>
                <div style={styles.infoLabel}>{t(dictionary, "dashboard.planStatus")}</div>
                <div style={styles.infoValue}>{planLabel}</div>
              </div>

              <div style={styles.infoBox}>
                <div style={styles.infoLabel}>{t(dictionary, "dashboard.freeViewsRemaining")}</div>
                <div style={styles.infoValue}>
                  {profileData.profile.free_views_remaining.toLocaleString()}
                </div>
              </div>

              <div style={styles.infoBox}>
                <div style={styles.infoLabel}>{t(dictionary, "dashboard.creditPointsRemaining")}</div>
                <div style={styles.infoValue}>
                  {profileData.profile.credit_points_balance.toFixed(2)}
                </div>
              </div>

              <div style={styles.infoBox}>
                <div style={styles.infoLabel}>{t(dictionary, "dashboard.approxViewsFromCredit")}</div>
                <div style={styles.infoValue}>
                  T: {profileData.approxViewsFromCredit.text.toLocaleString()} · U: {profileData.approxViewsFromCredit.url.toLocaleString()} · M: {profileData.approxViewsFromCredit.media.toLocaleString()}
                </div>
              </div>
            </div>

            <div style={styles.actionRow}>
              <button
                type="button"
                style={styles.primaryButton}
                onClick={() => router.push("/subscribe")}
              >
                {t(dictionary, "dashboard.subscriptionButton")}
              </button>

              <button
                type="button"
                style={styles.secondaryButton}
                onClick={() => router.push("/subscribe")}
              >
                {t(dictionary, "dashboard.creditButton")}
              </button>
            </div>

            <h3 style={styles.subSectionTitle}>{t(dictionary, "dashboard.alerts")}</h3>

            {alerts.length === 0 ? (
              <div style={styles.noticeBox}>—</div>
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

          <section style={styles.card}>
            <h2 style={styles.sectionTitle}>{t(dictionary, "dashboard.qrName")}</h2>

            <label style={styles.label}>{t(dictionary, "dashboard.renameQr")}</label>
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              style={styles.input}
            />

            <div style={styles.tabRow}>
              {(["text", "url", "media"] as ContentType[]).map((tab) => (
                <button
                  key={tab}
                  type="button"
                  style={{
                    ...styles.tabButton,
                    ...(contentType === tab ? styles.tabButtonActive : {})
                  }}
                  onClick={() => setContentType(tab)}
                >
                  {tab === "text"
                    ? t(dictionary, "common.text")
                    : tab === "url"
                    ? t(dictionary, "common.url")
                    : t(dictionary, "common.media")}
                </button>
              ))}
            </div>

            {contentType === "text" ? (
              <textarea
                value={textContent}
                onChange={(e) => setTextContent(e.target.value)}
                style={styles.textarea}
                placeholder={t(dictionary, "dashboard.textPlaceholder")}
              />
            ) : null}

            {contentType === "url" ? (
              <>
                {profileData.profile.subscription_status !== "active" ? (
                  <div style={styles.noticeBox}>
                    {t(dictionary, "dashboard.contentLockedUrl")}
                  </div>
                ) : null}
                <input
                  value={customUrl}
                  onChange={(e) => setCustomUrl(e.target.value)}
                  style={styles.input}
                  placeholder={t(dictionary, "dashboard.urlPlaceholder")}
                />
              </>
            ) : null}

            {contentType === "media" ? (
              <>
                {profileData.profile.subscription_status !== "active" ? (
                  <div style={styles.noticeBox}>
                    {t(dictionary, "dashboard.contentLockedMedia")}
                  </div>
                ) : null}
                <input
                  type="file"
                  onChange={(e: ChangeEvent<HTMLInputElement>) => {
                    setSelectedFile(e.target.files?.[0] || null);
                  }}
                  style={styles.input}
                />
                {selectedFile ? (
                  <div style={styles.noticeBox}>{selectedFile.name}</div>
                ) : null}
              </>
            ) : null}

            <div style={styles.infoBox}>
              <div style={styles.infoLabel}>{t(dictionary, "dashboard.publishedContent")}</div>
              <div style={styles.infoValue}>
                {currentPublishedContent || t(dictionary, "dashboard.currentContentPlaceholder")}
              </div>
            </div>
          </section>

          <section style={styles.card}>
            <h2 style={styles.sectionTitle}>{t(dictionary, "dashboard.preview")}</h2>

            <div style={styles.previewBox}>
              {contentType === "text" ? (
                <div style={styles.previewText}>
                  {textContent || t(dictionary, "dashboard.noContent")}
                </div>
              ) : null}

              {contentType === "url" ? (
                <div style={styles.previewText}>
                  Přesměrování na…<br />
                  {customUrl || "—"}
                </div>
              ) : null}

              {contentType === "media" ? (
                <div style={styles.previewText}>
                  {selectedFile?.name || profileData.qrCode.file_name || "—"}
                </div>
              ) : null}
            </div>

            <button
              type="button"
              style={styles.secondaryButton}
              onClick={() => window.open(publicViewUrl, "_blank")}
            >
              {t(dictionary, "dashboard.publicPreviewButton")}
            </button>

            <div style={styles.infoBox}>
              <div style={styles.infoLabel}>Public URL</div>
              <div style={styles.infoValue}>{publicViewUrl}</div>
            </div>
          </section>

          <section style={styles.card}>
            <h2 style={styles.sectionTitle}>{t(dictionary, "dashboard.activationMode")}</h2>

            <div style={styles.tabRow}>
              <button
                type="button"
                style={{
                  ...styles.tabButton,
                  ...(activationMode === "days" ? styles.tabButtonActive : {})
                }}
                onClick={() => setActivationMode("days")}
              >
                {t(dictionary, "dashboard.activationDays")}
              </button>

              <button
                type="button"
                style={{
                  ...styles.tabButton,
                  ...(activationMode === "subscription_period" ? styles.tabButtonActive : {})
                }}
                onClick={() => setActivationMode("subscription_period")}
              >
                {t(dictionary, "dashboard.activationSubscription")}
              </button>

              <button
                type="button"
                style={{
                  ...styles.tabButton,
                  ...(activationMode === "unlimited" ? styles.tabButtonActive : {})
                }}
                onClick={() => setActivationMode("unlimited")}
              >
                {t(dictionary, "dashboard.activationUnlimited")}
              </button>
            </div>

            {activationMode === "days" ? (
              <>
                <label style={styles.label}>{t(dictionary, "dashboard.activationDays")}</label>
                <input
                  type="number"
                  min="1"
                  value={activationDays}
                  onChange={(e) => setActivationDays(e.target.value)}
                  style={styles.input}
                />
              </>
            ) : null}

            <div style={styles.checkboxRow}>
              <input
                id="max-views-enabled"
                type="checkbox"
                checked={maxViewsEnabled}
                onChange={(e) => setMaxViewsEnabled(e.target.checked)}
              />
              <label htmlFor="max-views-enabled">{t(dictionary, "dashboard.maxViewsTotal")}</label>
            </div>

            {maxViewsEnabled ? (
              <input
                type="number"
                min="1"
                value={maxViewsTotalThousands}
                onChange={(e) => setMaxViewsTotalThousands(e.target.value)}
                style={styles.input}
                placeholder="Po tisících"
              />
            ) : (
              <div style={styles.noticeBox}>{t(dictionary, "dashboard.unlimitedViews")}</div>
            )}
          </section>

          <section style={styles.card}>
            <h2 style={styles.sectionTitle}>{t(dictionary, "dashboard.fallbackText")}</h2>

            <label style={styles.label}>{t(dictionary, "dashboard.fallbackText")}</label>
            <textarea
              value={fallbackText}
              onChange={(e) => setFallbackText(e.target.value)}
              style={styles.textareaSmall}
            />

            <label style={styles.label}>{t(dictionary, "dashboard.viewsExhaustedText")}</label>
            <textarea
              value={viewsExhaustedText}
              onChange={(e) => setViewsExhaustedText(e.target.value)}
              style={styles.textareaSmall}
            />

            <label style={styles.label}>{t(dictionary, "dashboard.lowViewsAlertThreshold")}</label>
            <input
              type="number"
              min="0"
              value={lowViewsAlertThresholdThousands}
              onChange={(e) => setLowViewsAlertThresholdThousands(e.target.value)}
              style={styles.input}
              placeholder="Po tisících"
            />

            <div style={styles.actionRow}>
              <button
                type="button"
                style={styles.secondaryButton}
                onClick={() => setShowRegenerateConfirm(true)}
              >
                {t(dictionary, "dashboard.regenerateQr")}
              </button>

              <button
                type="button"
                style={styles.primaryButton}
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? t(dictionary, "common.loading") : t(dictionary, "common.save")}
              </button>
            </div>
          </section>

          <section style={styles.card}>
            <h2 style={styles.sectionTitle}>{t(dictionary, "dashboard.history")}</h2>

            <label style={styles.label}>{t(dictionary, "dashboard.historyFrom")}</label>
            <input
              type="date"
              value={historyFrom}
              onChange={(e) => setHistoryFrom(e.target.value)}
              style={styles.input}
            />

            <label style={styles.label}>{t(dictionary, "dashboard.historyTo")}</label>
            <input
              type="date"
              value={historyTo}
              onChange={(e) => setHistoryTo(e.target.value)}
              style={styles.input}
            />

            <button
              type="button"
              style={styles.secondaryButton}
              onClick={handleLoadHistory}
            >
              {t(dictionary, "dashboard.history")}
            </button>

            <div style={styles.infoBox}>
              <div style={styles.infoLabel}>{t(dictionary, "dashboard.historyResult")}</div>
              <div style={styles.infoValue}>
                {historyResult === null ? "—" : historyResult.toLocaleString()}
              </div>
            </div>
          </section>
        </div>

        {message ? <div style={styles.messageBox}>{message}</div> : null}

        {showRegenerateConfirm ? (
          <div style={styles.modalOverlay} onClick={() => setShowRegenerateConfirm(false)}>
            <div style={styles.modalCard} onClick={(e) => e.stopPropagation()}>
              <h3 style={styles.modalTitle}>{t(dictionary, "dashboard.regenerateQr")}</h3>
              <div style={styles.noticeBox}>{t(dictionary, "dashboard.regenerateWarning")}</div>

              <div style={styles.actionRow}>
                <button
                  type="button"
                  style={styles.secondaryButton}
                  onClick={() => setShowRegenerateConfirm(false)}
                >
                  {t(dictionary, "common.cancel")}
                </button>

                <button
                  type="button"
                  style={styles.primaryButton}
                  onClick={handleRegenerateQr}
                  disabled={saving}
                >
                  {saving ? t(dictionary, "common.loading") : t(dictionary, "common.confirm")}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
    </main>
  );
}

const styles: Record<string, CSSProperties> = {
  page: {
    minHeight: "100vh",
    background: "#f5f7fb",
    padding: 24,
    boxSizing: "border-box"
  },
  shell: {
    width: "100%",
    maxWidth: 1500,
    margin: "0 auto",
    display: "flex",
    flexDirection: "column",
    gap: 20
  },
  topBar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 16,
    flexWrap: "wrap"
  },
  brand: {
    fontSize: 30,
    fontWeight: 800
  },
  pageTitle: {
    fontSize: 16,
    color: "#5b6777"
  },
  topActions: {
    display: "flex",
    gap: 12,
    alignItems: "center",
    flexWrap: "wrap"
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
    gap: 20
  },
  card: {
    background: "#ffffff",
    border: "1px solid #dde4ec",
    borderRadius: 18,
    padding: 20,
    boxShadow: "0 10px 30px rgba(15, 23, 42, 0.06)",
    display: "flex",
    flexDirection: "column",
    gap: 14
  },
  sectionTitle: {
    margin: 0,
    fontSize: 22,
    fontWeight: 800
  },
  subSectionTitle: {
    margin: "8px 0 0 0",
    fontSize: 18,
    fontWeight: 700
  },
  infoGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: 12
  },
  infoBox: {
    border: "1px solid #e1e7ee",
    borderRadius: 14,
    background: "#fafbfd",
    padding: 14,
    display: "flex",
    flexDirection: "column",
    gap: 6
  },
  infoLabel: {
    fontSize: 13,
    color: "#617083"
  },
  infoValue: {
    fontSize: 16,
    fontWeight: 700,
    wordBreak: "break-word",
    whiteSpace: "pre-wrap"
  },
  alertList: {
    display: "flex",
    flexDirection: "column",
    gap: 10
  },
  alertItem: {
    border: "1px solid #e1e7ee",
    background: "#fafbfd",
    borderRadius: 12,
    padding: 12
  },
  alertMessage: {
    fontSize: 14,
    fontWeight: 600
  },
  alertDate: {
    marginTop: 6,
    fontSize: 12,
    color: "#64748b"
  },
  label: {
    fontSize: 14,
    fontWeight: 600
  },
  input: {
    width: "100%",
    padding: 12,
    borderRadius: 12,
    border: "1px solid #cad4df",
    fontSize: 15,
    background: "#ffffff",
    boxSizing: "border-box"
  },
  textarea: {
    width: "100%",
    minHeight: 160,
    padding: 12,
    borderRadius: 12,
    border: "1px solid #cad4df",
    fontSize: 15,
    resize: "vertical",
    fontFamily: "inherit",
    boxSizing: "border-box"
  },
  textareaSmall: {
    width: "100%",
    minHeight: 90,
    padding: 12,
    borderRadius: 12,
    border: "1px solid #cad4df",
    fontSize: 15,
    resize: "vertical",
    fontFamily: "inherit",
    boxSizing: "border-box"
  },
  select: {
    padding: 12,
    borderRadius: 12,
    border: "1px solid #cad4df",
    fontSize: 15,
    background: "#ffffff"
  },
  tabRow: {
    display: "flex",
    gap: 10,
    flexWrap: "wrap"
  },
  tabButton: {
    flex: 1,
    minWidth: 90,
    padding: "12px 14px",
    borderRadius: 12,
    border: "1px solid #cad4df",
    background: "#ffffff",
    cursor: "pointer",
    fontWeight: 700
  },
  tabButtonActive: {
    background: "#eff6ff",
    border: "1px solid #2563eb"
  },
  previewBox: {
    minHeight: 220,
    borderRadius: 14,
    border: "1px dashed #cbd5e1",
    background: "#ffffff",
    padding: 16,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    textAlign: "center"
  },
  previewText: {
    fontSize: 24,
    fontWeight: 700,
    lineHeight: 1.25,
    whiteSpace: "pre-wrap",
    wordBreak: "break-word"
  },
  actionRow: {
    display: "flex",
    gap: 12,
    flexWrap: "wrap"
  },
  checkboxRow: {
    display: "flex",
    gap: 10,
    alignItems: "center",
    fontSize: 14,
    fontWeight: 600
  },
  primaryButton: {
    flex: 1,
    minWidth: 160,
    padding: "14px 16px",
    borderRadius: 12,
    border: "1px solid #2563eb",
    background: "#2563eb",
    color: "#ffffff",
    cursor: "pointer",
    fontWeight: 700
  },
  secondaryButton: {
    flex: 1,
    minWidth: 160,
    padding: "14px 16px",
    borderRadius: 12,
    border: "1px solid #cad4df",
    background: "#ffffff",
    color: "#111827",
    cursor: "pointer",
    fontWeight: 700
  },
  noticeBox: {
    border: "1px solid #dde5ee",
    background: "#f8fafc",
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    color: "#334155",
    whiteSpace: "pre-wrap"
  },
  messageBox: {
    border: "1px solid #dbeafe",
    background: "#eff6ff",
    color: "#1d4ed8",
    borderRadius: 12,
    padding: 12,
    fontSize: 14
  },
  centerCard: {
    maxWidth: 600,
    margin: "120px auto",
    background: "#ffffff",
    border: "1px solid #dde4ec",
    borderRadius: 18,
    padding: 24,
    textAlign: "center"
  },
  modalOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(15, 23, 42, 0.45)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
    zIndex: 1000
  },
  modalCard: {
    width: "100%",
    maxWidth: 620,
    background: "#ffffff",
    borderRadius: 18,
    border: "1px solid #dde4ec",
    padding: 20,
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    gap: 14,
    boxShadow: "0 15px 50px rgba(15, 23, 42, 0.18)"
  },
  modalTitle: {
    margin: 0,
    fontSize: 24,
    fontWeight: 800
  }
};
