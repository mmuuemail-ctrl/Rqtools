"use client";

import { CSSProperties, Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { supabase } from "../../lib/supabase";
import {
  APP_CONFIG,
  isPaidPlan,
  type CheckoutBillingMode,
  type PaidPlanType
} from "../../lib/app-config";
import { formatEur } from "../../lib/pricing";
import {
  getAvailableLanguages,
  getDictionary,
  getStoredLanguage,
  setStoredLanguage,
  t,
  type LanguageDictionary,
  type LanguageMeta
} from "../../lib/i18n";

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
    content_type: "text" | "url" | "media";
    text_content: string | null;
    custom_url: string | null;
    file_name: string | null;
    file_key: string | null;
    mime_type: string | null;
    public_url: string | null;
    file_size: number;
    activation_mode: "days" | "subscription_period" | "unlimited";
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

type PlanMode = PaidPlanType;

function parsePositiveInt(value: string, fallback = 1) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  const intValue = Math.floor(parsed);

  return intValue > 0 ? intValue : fallback;
}

function formatDate(value: string | null) {
  if (!value) return "—";

  const d = new Date(value);

  if (Number.isNaN(d.getTime())) {
    return value;
  }

  return d.toLocaleString("cs-CZ");
}

function getPlanLabel(planType: PaidPlanType) {
  if (planType === "day") return "Denní plán";
  if (planType === "month") return "Měsíční plán";
  return "Roční plán";
}

function getBillingModeLabel(mode: CheckoutBillingMode) {
  if (mode === "subscription") {
    return "Automatické obnovování";
  }

  return "Jednorázová platba";
}

function SubscribeInner() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [language, setLanguage] = useState("cs");
  const [dictionary, setDictionary] = useState<LanguageDictionary | null>(null);
  const [availableLanguages, setAvailableLanguages] = useState<LanguageMeta[]>([]);

  const [userId, setUserId] = useState("");
  const [profileData, setProfileData] = useState<ProfileResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState("");
  const [message, setMessage] = useState("");
  const [showFuturePlans, setShowFuturePlans] = useState(false);

  const [planMode, setPlanMode] = useState<PlanMode>("month");
  const [billingMode, setBillingMode] = useState<CheckoutBillingMode>("one_time");
  const [dayCount, setDayCount] = useState("1");
  const [creditPointsToBuy, setCreditPointsToBuy] = useState("10");

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
    if (planMode === "day") {
      setBillingMode("one_time");
    }
  }, [planMode]);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        setMessage("");

        const success = searchParams.get("success");
        const canceled = searchParams.get("canceled");

        if (success === "1") {
          setMessage("Platba byla dokončena. Změny se mohou propsat během chvíle.");
        }

        if (canceled === "1") {
          setMessage("Platba byla zrušena.");
        }

        const { data } = await supabase.auth.getSession();
        const currentUserId = data.session?.user?.id || "";

        if (!currentUserId) {
          router.push("/login");
          return;
        }

        setUserId(currentUserId);

        const res = await fetch(`/api/profile?userId=${encodeURIComponent(currentUserId)}`, {
          cache: "no-store"
        });

        const json = await res.json();

        if (!res.ok) {
          setMessage(json?.error || "Nastala chyba");
          return;
        }

        setProfileData(json as ProfileResponse);
      } catch (error) {
        console.error(error);
        setMessage("Nastala chyba");
      } finally {
        setLoading(false);
      }
    };

    load().catch(console.error);
  }, [router, searchParams]);

  const safeDayCount = parsePositiveInt(dayCount, 1);
  const safeCreditPointsToBuy = parsePositiveInt(creditPointsToBuy, 1);

  const selectedPlan = useMemo(() => {
    return APP_CONFIG.plans[planMode];
  }, [planMode]);

  const planPriceEur = useMemo(() => {
    if (planMode === "day") {
      return selectedPlan.priceEur * safeDayCount;
    }

    return selectedPlan.priceEur;
  }, [planMode, selectedPlan, safeDayCount]);

  const includedViews = useMemo(() => {
    if (planMode === "day") {
      return selectedPlan.includedFreeViews * safeDayCount;
    }

    return selectedPlan.includedFreeViews;
  }, [planMode, selectedPlan, safeDayCount]);

  const currentPlan = profileData?.subscriptionPlans.currentPlan || null;
  const futurePlans = profileData?.subscriptionPlans.futurePlans || [];

  const hasActivePlan =
    !!currentPlan ||
    (profileData?.profile.subscription_status === "active" &&
      isPaidPlan(profileData.profile.plan_type));

  async function handleBuyPlan() {
    if (!userId) return;

    try {
      setBusy("plan");
      setMessage("");

      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          mode: "plan",
          userId,
          planType: planMode,
          billingMode,
          dayCount: safeDayCount
        })
      });

      const json = await res.json();

      if (!res.ok) {
        setMessage(json?.error || t(dictionary, "errors.paymentFailed"));
        return;
      }

      if (json?.url) {
        window.location.href = json.url;
        return;
      }

      setMessage(t(dictionary, "errors.paymentFailed"));
    } catch (error) {
      console.error(error);
      setMessage(t(dictionary, "errors.paymentFailed"));
    } finally {
      setBusy("");
    }
  }

  async function handleBuyCredit() {
    if (!userId) return;

    if (!hasActivePlan) {
      setMessage("Pro použití kreditu je potřeba mít aktivní předplatné.");
      return;
    }

    try {
      setBusy("credit");
      setMessage("");

      const res = await fetch("/api/stripe/checkout", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          mode: "credit",
          userId,
          creditPoints: safeCreditPointsToBuy
        })
      });

      const json = await res.json();

      if (!res.ok) {
        setMessage(json?.error || t(dictionary, "errors.paymentFailed"));
        return;
      }

      if (json?.url) {
        window.location.href = json.url;
        return;
      }

      setMessage(t(dictionary, "errors.paymentFailed"));
    } catch (error) {
      console.error(error);
      setMessage(t(dictionary, "errors.paymentFailed"));
    } finally {
      setBusy("");
    }
  }

  if (loading || !profileData) {
    return (
      <main style={styles.page}>
        <div style={styles.centerCard}>{t(dictionary, "common.loading")}</div>
      </main>
    );
  }

  return (
    <main style={styles.page}>
      <div style={styles.shell}>
        <div style={styles.topBar}>
          <div>
            <h1 style={styles.title}>Předplatné a kredit</h1>
            <div style={styles.subTitle}>
              {currentPlan
                ? `${getPlanLabel(currentPlan.planType)} · ${formatDate(currentPlan.endsAt)}`
                : "FREE"}
            </div>
          </div>

          <div style={styles.topRight}>
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
              onClick={() => router.push("/")}
            >
              Zpět na dashboard
            </button>
          </div>
        </div>

        <section style={styles.card}>
          <h2 style={styles.sectionTitle}>Aktuální předplatné</h2>

          <div style={styles.infoBox}>
            <div style={styles.infoLabel}>Aktivní plán</div>
            <div style={styles.infoValue}>
              {currentPlan
                ? `${getPlanLabel(currentPlan.planType)} do ${formatDate(currentPlan.endsAt)}`
                : "Žádné aktivní předplatné"}
            </div>
          </div>

          {futurePlans.length > 0 ? (
            <>
              <button
                type="button"
                style={styles.secondaryButton}
                onClick={() => setShowFuturePlans((prev) => !prev)}
              >
                {showFuturePlans ? "Skrýt další plány" : "Zobrazit další plány"}
              </button>

              {showFuturePlans ? (
                <div style={styles.planList}>
                  {futurePlans.map((plan, index) => (
                    <div
                      key={`${plan.planType}-${plan.startsAt}-${index}`}
                      style={styles.planItem}
                    >
                      <div style={styles.planItemTitle}>{getPlanLabel(plan.planType)}</div>
                      <div style={styles.planItemText}>
                        Začátek: {formatDate(plan.startsAt)}
                      </div>
                      <div style={styles.planItemText}>
                        Konec: {formatDate(plan.endsAt)}
                      </div>
                    </div>
                  ))}
                </div>
              ) : null}
            </>
          ) : null}
        </section>

        <div style={styles.summaryGrid}>
          <div style={styles.summaryBox}>
            <div style={styles.summaryLabel}>Views zdarma</div>
            <div style={styles.summaryValue}>
              {profileData.profile.free_views_remaining.toLocaleString()}
            </div>
          </div>

          <div style={styles.summaryBox}>
            <div style={styles.summaryLabel}>Kredit</div>
            <div style={styles.summaryValue}>
              {profileData.profile.credit_points_balance.toFixed(2)}
            </div>
          </div>

          <div style={styles.summaryBox}>
            <div style={styles.summaryLabel}>Odhad views z kreditu</div>
            <div style={styles.summaryValueSmall}>
              Text: {profileData.approxViewsFromCredit.text.toLocaleString()} · URL:{" "}
              {profileData.approxViewsFromCredit.url.toLocaleString()} · Media:{" "}
              {profileData.approxViewsFromCredit.media.toLocaleString()}
            </div>
          </div>
        </div>

        <section style={styles.card}>
          <h2 style={styles.sectionTitle}>Koupit předplatné</h2>

          <div style={styles.modeRow}>
            <button
              type="button"
              onClick={() => setPlanMode("day")}
              style={{
                ...styles.modeButton,
                ...(planMode === "day" ? styles.modeButtonActive : {})
              }}
            >
              Denní
            </button>

            <button
              type="button"
              onClick={() => setPlanMode("month")}
              style={{
                ...styles.modeButton,
                ...(planMode === "month" ? styles.modeButtonActive : {})
              }}
            >
              Měsíční
            </button>

            <button
              type="button"
              onClick={() => setPlanMode("year")}
              style={{
                ...styles.modeButton,
                ...(planMode === "year" ? styles.modeButtonActive : {})
              }}
            >
              Roční
            </button>
          </div>

          <div style={styles.billingRow}>
            <button
              type="button"
              onClick={() => setBillingMode("one_time")}
              style={{
                ...styles.modeButton,
                ...(billingMode === "one_time" ? styles.modeButtonActive : {})
              }}
            >
              Jednorázově
            </button>

            <button
              type="button"
              onClick={() => {
                if (planMode === "day") {
                  setMessage("Denní plán je dostupný jen jako jednorázová platba.");
                  return;
                }

                setBillingMode("subscription");
              }}
              style={{
                ...styles.modeButton,
                ...(billingMode === "subscription" ? styles.modeButtonActive : {}),
                ...(planMode === "day" ? styles.disabledModeButton : {})
              }}
            >
              Automaticky obnovovat
            </button>
          </div>

          {planMode === "day" ? (
            <>
              <label style={styles.label}>Počet dní</label>
              <input
                type="number"
                min="1"
                value={dayCount}
                onChange={(e) => setDayCount(e.target.value)}
                style={styles.input}
              />
            </>
          ) : null}

          <div style={styles.pricingGrid}>
            <div style={styles.infoBox}>
              <div style={styles.infoLabel}>Typ platby</div>
              <div style={styles.infoValue}>{getBillingModeLabel(billingMode)}</div>
            </div>

            <div style={styles.infoBox}>
              <div style={styles.infoLabel}>Cena</div>
              <div style={styles.infoValue}>{formatEur(planPriceEur)}</div>
            </div>

            <div style={styles.infoBox}>
              <div style={styles.infoLabel}>Views zdarma</div>
              <div style={styles.infoValue}>{includedViews.toLocaleString()}</div>
            </div>

            <div style={styles.infoBox}>
              <div style={styles.infoLabel}>Text / 1000 views</div>
              <div style={styles.infoValue}>
                {formatEur(selectedPlan.textPricePer1000ViewsEur)}
              </div>
            </div>

            <div style={styles.infoBox}>
              <div style={styles.infoLabel}>URL / 1000 views</div>
              <div style={styles.infoValue}>
                {formatEur(selectedPlan.urlPricePer1000ViewsEur)}
              </div>
            </div>

            <div style={styles.infoBox}>
              <div style={styles.infoLabel}>Media / 1000 views</div>
              <div style={styles.infoValue}>
                {formatEur(selectedPlan.mediaPricePer1000ViewsEur)}
              </div>
            </div>
          </div>

          <button
            type="button"
            style={styles.primaryButton}
            onClick={handleBuyPlan}
            disabled={busy !== ""}
          >
            {busy === "plan" ? "Načítání..." : "Pokračovat k platbě"}
          </button>
        </section>

        <section style={styles.card}>
          <h2 style={styles.sectionTitle}>Dokoupit kredit</h2>

          {!hasActivePlan ? (
            <div style={styles.warningBox}>
              Kredit je možné používat až po aktivaci předplatného.
            </div>
          ) : null}

          <label style={styles.label}>Počet kreditních bodů</label>
          <input
            type="number"
            min="1"
            value={creditPointsToBuy}
            onChange={(e) => setCreditPointsToBuy(e.target.value)}
            style={styles.input}
          />

          <div style={styles.noticeBox}>1 kreditní bod = 1 EUR</div>

          <div style={styles.infoBox}>
            <div style={styles.infoLabel}>Cena</div>
            <div style={styles.infoValue}>{formatEur(safeCreditPointsToBuy)}</div>
          </div>

          <button
            type="button"
            style={styles.primaryButton}
            onClick={handleBuyCredit}
            disabled={busy !== ""}
          >
            {busy === "credit" ? "Načítání..." : "Koupit kredit"}
          </button>
        </section>

        {message ? <div style={styles.messageBox}>{message}</div> : null}
      </div>
    </main>
  );
}

export default function SubscribePage() {
  return (
    <Suspense
      fallback={
        <main style={styles.page}>
          <div style={styles.centerCard}>Načítání...</div>
        </main>
      }
    >
      <SubscribeInner />
    </Suspense>
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
    maxWidth: 1300,
    margin: "0 auto",
    display: "flex",
    flexDirection: "column",
    gap: 20
  },
  topBar: {
    display: "flex",
    justifyContent: "space-between",
    gap: 16,
    alignItems: "center",
    flexWrap: "wrap"
  },
  topRight: {
    display: "flex",
    gap: 12,
    alignItems: "center",
    flexWrap: "wrap"
  },
  title: {
    margin: 0,
    fontSize: 32,
    fontWeight: 800
  },
  subTitle: {
    marginTop: 6,
    fontSize: 14,
    color: "#5b6777"
  },
  summaryGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: 14
  },
  summaryBox: {
    background: "#ffffff",
    border: "1px solid #dde4ec",
    borderRadius: 18,
    padding: 18,
    boxSizing: "border-box",
    boxShadow: "0 10px 30px rgba(15, 23, 42, 0.05)"
  },
  summaryLabel: {
    fontSize: 13,
    color: "#617083",
    marginBottom: 8
  },
  summaryValue: {
    fontSize: 22,
    fontWeight: 800,
    wordBreak: "break-word"
  },
  summaryValueSmall: {
    fontSize: 16,
    fontWeight: 700,
    wordBreak: "break-word",
    lineHeight: 1.5
  },
  card: {
    background: "#ffffff",
    border: "1px solid #dde4ec",
    borderRadius: 18,
    padding: 20,
    boxSizing: "border-box",
    boxShadow: "0 10px 30px rgba(15, 23, 42, 0.06)",
    display: "flex",
    flexDirection: "column",
    gap: 16
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
  sectionTitle: {
    margin: 0,
    fontSize: 22,
    fontWeight: 800
  },
  modeRow: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: 12
  },
  billingRow: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 12
  },
  modeButton: {
    width: "100%",
    padding: "14px 16px",
    borderRadius: 14,
    border: "1px solid #cad4df",
    background: "#ffffff",
    cursor: "pointer",
    fontWeight: 700
  },
  modeButtonActive: {
    background: "#eff6ff",
    border: "1px solid #2563eb"
  },
  disabledModeButton: {
    opacity: 0.55,
    cursor: "not-allowed"
  },
  pricingGrid: {
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
    wordBreak: "break-word"
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
  select: {
    padding: 12,
    borderRadius: 12,
    border: "1px solid #cad4df",
    fontSize: 15,
    background: "#ffffff"
  },
  primaryButton: {
    width: "100%",
    padding: "14px 16px",
    borderRadius: 12,
    border: "1px solid #2563eb",
    background: "#2563eb",
    color: "#ffffff",
    cursor: "pointer",
    fontWeight: 700
  },
  secondaryButton: {
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
    color: "#334155"
  },
  warningBox: {
    border: "1px solid #fed7aa",
    background: "#fff7ed",
    color: "#9a3412",
    borderRadius: 12,
    padding: 12,
    fontSize: 14,
    fontWeight: 700
  },
  messageBox: {
    border: "1px solid #dbeafe",
    background: "#eff6ff",
    color: "#1d4ed8",
    borderRadius: 12,
    padding: 12,
    fontSize: 14
  },
  planList: {
    display: "flex",
    flexDirection: "column",
    gap: 10
  },
  planItem: {
    border: "1px solid #dbeafe",
    background: "#f8fbff",
    borderRadius: 14,
    padding: 12
  },
  planItemTitle: {
    fontSize: 16,
    fontWeight: 800,
    color: "#1e3a8a"
  },
  planItemText: {
    marginTop: 4,
    fontSize: 13,
    color: "#475569"
  }
};
