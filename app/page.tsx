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
import { type ActivationMode, type ContentType } from "../lib/app-config";

type PlanType = "free" | "day" | "month" | "year";
type SubscriptionStatus = "inactive" | "active" | "expired" | "canceled";
type PrintUnit = "cm" | "inch";
type SelectedPlan = "day" | "month" | "year" | "credit";
type QrActivationChoice = "always" | "range";

type MenuSection =
  | "main"
  | "subscription"
  | "qrSettings"
  | "history"
  | "alerts"
  | "regenerate"
  | "language"
  | "account";

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

function normalizeUrl(value: string) {
  const trimmed = value.trim();

  if (trimmed.startsWith("http://") || trimmed.startsWith("https://")) {
    return trimmed;
  }

  return `https://${trimmed}`;
}

function normalizePrintSize(value: string) {
  const normalized = value.replace(",", ".").trim();
  const parsed = Number(normalized);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }

  return Math.round(parsed * 100) / 100;
}

function getMenuSectionTitle(section: MenuSection) {
  if (section === "subscription") return "Předplatné a kredit";
  if (section === "qrSettings") return "Nastavení QR";
  if (section === "history") return "Historie";
  if (section === "alerts") return "Upozornění";
  if (section === "regenerate") return "Nový QR kód";
  if (section === "language") return "Jazyk";
  if (section === "account") return "Účet";
  return "Menu";
}

export default function DashboardPage() {
  const router = useRouter();
  const qrCanvasRef = useRef<HTMLCanvasElement | null>(null);

  const [loading, setLoading] = useState(true);
  const [savingText, setSavingText] = useState(false);
  const [savingUrl, setSavingUrl] = useState(false);
  const [savingMedia, setSavingMedia] = useState(false);
  const [message, setMessage] = useState("");
  const [userId, setUserId] = useState("");
  const [profileData, setProfileData] = useState<ProfileResponse | null>(null);
  const [scale, setScale] = useState(1);

  const [showTextModal, setShowTextModal] = useState(false);
  const [draftText, setDraftText] = useState("");

  const [showUrlModal, setShowUrlModal] = useState(false);
  const [draftUrl, setDraftUrl] = useState("");

  const [showMediaModal, setShowMediaModal] = useState(false);
  const [draftFile, setDraftFile] = useState<File | null>(null);

  const [showPrintModal, setShowPrintModal] = useState(false);
  const [printUnit, setPrintUnit] = useState<PrintUnit>("cm");
  const [printSize, setPrintSize] = useState("6.00");

  const [showMenuModal, setShowMenuModal] = useState(false);
  const [activeMenuSection, setActiveMenuSection] = useState<MenuSection>("main");
  const [selectedPlan, setSelectedPlan] = useState<SelectedPlan>("day");
  const [qrActivationChoice, setQrActivationChoice] = useState<QrActivationChoice>("always");

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

  function openMenuModal() {
    setActiveMenuSection("main");
    setShowMenuModal(true);
    setMessage("");
  }

  function closeMenuModal() {
    setShowMenuModal(false);
    setActiveMenuSection("main");
  }

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

  function openUrlModal() {
    setDraftUrl(profileData?.qrCode.custom_url || "");
    setShowUrlModal(true);
    setMessage("");
  }

  function closeUrlModal() {
    if (savingUrl) return;
    setShowUrlModal(false);
    setDraftUrl("");
  }

  function openMediaModal() {
    setDraftFile(null);
    setShowMediaModal(true);
    setMessage("");
  }

  function closeMediaModal() {
    if (savingMedia) return;
    setShowMediaModal(false);
    setDraftFile(null);
  }

  function openPrintModal() {
    setPrintUnit("cm");
    setPrintSize("6.00");
    setShowPrintModal(true);
    setMessage("");
  }

  function closePrintModal() {
    setShowPrintModal(false);
  }

  function showPending(label: string) {
    setMessage(`${label}: zatím jen návrh obrazovky, funkci napojíme v dalším kroku.`);
  }

  function buildBaseFormData(contentType: ContentType) {
    if (!profileData || !userId) return null;

    const formData = new FormData();
    formData.append("userId", userId);
    formData.append("qrId", profileData.qrCode.id);
    formData.append("title", profileData.qrCode.title || "");
    formData.append("contentType", contentType);
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

    return formData;
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

      const formData = buildBaseFormData("text");
      if (!formData) return;

      formData.append("textContent", cleanText);
      formData.append("customUrl", "");

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

  async function confirmUrlModal() {
    if (!profileData || !userId) return;

    const cleanUrl = normalizeUrl(draftUrl);

    if (!draftUrl.trim() || cleanUrl === "https://") {
      setMessage("Nejdřív zadej URL.");
      return;
    }

    try {
      setSavingUrl(true);
      setMessage("");

      const formData = buildBaseFormData("url");
      if (!formData) return;

      formData.append("textContent", "");
      formData.append("customUrl", cleanUrl);

      const res = await fetch("/api/qr/update", {
        method: "POST",
        body: formData
      });

      const dataJson = await res.json();

      if (!res.ok) {
        setMessage(dataJson?.error || "URL se nepodařilo uložit.");
        return;
      }

      await loadProfile(userId);

      setShowUrlModal(false);
      setDraftUrl("");
      setMessage("URL byla uložena.");
    } catch (error) {
      console.error(error);
      setMessage("URL se nepodařilo uložit.");
    } finally {
      setSavingUrl(false);
    }
  }

  async function confirmMediaModal() {
    if (!profileData || !userId) return;

    if (!draftFile) {
      setMessage("Nejdřív vyber soubor.");
      return;
    }

    try {
      setSavingMedia(true);
      setMessage("");

      const formData = buildBaseFormData("media");
      if (!formData) return;

      formData.append("textContent", "");
      formData.append("customUrl", "");
      formData.append("file", draftFile);

      const res = await fetch("/api/qr/update", {
        method: "POST",
        body: formData
      });

      const dataJson = await res.json();

      if (!res.ok) {
        setMessage(dataJson?.error || "Media se nepodařilo uložit.");
        return;
      }

      await loadProfile(userId);

      setShowMediaModal(false);
      setDraftFile(null);
      setMessage("Media byla uložena.");
    } catch (error) {
      console.error(error);
      setMessage("Media se nepodařilo uložit.");
    } finally {
      setSavingMedia(false);
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

    const parsedSize = normalizePrintSize(printSize);

    if (!parsedSize) {
      setMessage("Zadej platnou velikost QR kódu.");
      return;
    }

    const safeSize = parsedSize.toFixed(2);
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
              width: ${safeSize}${printUnit};
              height: ${safeSize}${printUnit};
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
    setShowPrintModal(false);
  }

  async function handleLogout() {
    await supabase.auth.signOut();
    router.push("/login");
  }

  function renderMenuContent() {
    if (activeMenuSection === "subscription") {
      return (
        <div style={styles.menuPanelStack}>
          <div style={styles.menuSectionTitle}>Předplatné a kredit</div>

          <div style={styles.menuInfoBox}>
            Aktuální stav: {currentPlanText}. Kredit:{" "}
            {Math.floor(profileData?.profile.credit_points_balance || 0).toLocaleString()}.
          </div>

          <div style={styles.menuSubTitle}>Vyber položku</div>

          <div style={styles.planChoiceGrid}>
            <button
              type="button"
              style={{
                ...styles.menuToggleButton,
                ...(selectedPlan === "credit" ? styles.menuToggleButtonActive : {})
              }}
              onClick={() => setSelectedPlan("credit")}
            >
              kredit
            </button>

            <button
              type="button"
              style={{
                ...styles.menuToggleButton,
                ...(selectedPlan === "day" ? styles.menuToggleButtonActive : {})
              }}
              onClick={() => setSelectedPlan("day")}
            >
              denní
            </button>

            <button
              type="button"
              style={{
                ...styles.menuToggleButton,
                ...(selectedPlan === "month" ? styles.menuToggleButtonActive : {})
              }}
              onClick={() => setSelectedPlan("month")}
            >
              měsíční
            </button>

            <button
              type="button"
              style={{
                ...styles.menuToggleButton,
                ...(selectedPlan === "year" ? styles.menuToggleButtonActive : {})
              }}
              onClick={() => setSelectedPlan("year")}
            >
              roční
            </button>
          </div>

          {selectedPlan !== "credit" ? (
            <div style={styles.innerCard}>
              <div style={styles.innerCardTitle}>{getPlanLabel(selectedPlan)}</div>

              {selectedPlan === "day" ? (
                <>
                  <label style={styles.inputLabel}>Počet dní</label>
                  <input type="number" min="1" step="1" defaultValue="1" style={styles.menuInput} />
                </>
              ) : null}

              {selectedPlan === "month" ? (
                <div style={styles.menuInfoBox}>
                  Měsíční plán se nastaví na 1 měsíc.
                </div>
              ) : null}

              {selectedPlan === "year" ? (
                <div style={styles.menuInfoBox}>
                  Roční plán se nastaví na 1 rok.
                </div>
              ) : null}

              <button
                type="button"
                style={styles.menuPrimaryButton}
                onClick={() => showPending(`Nákup: ${getPlanLabel(selectedPlan)}`)}
              >
                pokračovat k nákupu předplatného
              </button>
            </div>
          ) : null}

          {selectedPlan === "credit" ? (
            <div style={styles.innerCard}>
              <div style={styles.innerCardTitle}>Jen kredit</div>
              <div style={styles.menuInfoBox}>
                Kredit je možné používat jen s aktivním předplatným.
              </div>
              <label style={styles.inputLabel}>Kredit celé číslo</label>
              <input type="number" min="1" step="1" defaultValue="10" style={styles.menuInput} />
              <button
                type="button"
                style={styles.menuPrimaryButton}
                onClick={() => {
                  if (!profileData?.subscriptionPlans.currentPlan) {
                    setMessage("Pro použití kreditu je potřeba mít aktivní předplatné.");
                    return;
                  }
                  showPending("Dokoupení kreditu");
                }}
              >
                přidat kredit
              </button>
            </div>
          ) : null}
        </div>
      );
    }

    if (activeMenuSection === "qrSettings") {
      return (
        <div style={styles.menuPanelStack}>
          <div style={styles.menuSectionTitle}>Nastavení QR</div>

          <div style={styles.menuSubTitle}>Kdy má být QR funkční</div>
          <div style={styles.qrChoiceGrid}>
            <button
              type="button"
              style={{
                ...styles.menuToggleButton,
                ...(qrActivationChoice === "always" ? styles.menuToggleButtonActive : {})
              }}
              onClick={() => setQrActivationChoice("always")}
            >
              pořád
            </button>

            <button
              type="button"
              style={{
                ...styles.menuToggleButton,
                ...(qrActivationChoice === "range" ? styles.menuToggleButtonActive : {})
              }}
              onClick={() => setQrActivationChoice("range")}
            >
              od / do
            </button>
          </div>

          {qrActivationChoice === "always" ? (
            <div style={styles.menuInfoBox}>
              QR bude funkční pořád, dokud to dovoluje předplatné, kredit a ostatní limity.
            </div>
          ) : (
            <div style={styles.menuTwoCols}>
              <div>
                <label style={styles.inputLabel}>Aktivní od</label>
                <input type="datetime-local" style={styles.menuInput} />
              </div>
              <div>
                <label style={styles.inputLabel}>Aktivní do</label>
                <input type="datetime-local" style={styles.menuInput} />
              </div>
            </div>
          )}

          <div style={styles.menuSubTitle}>Limit views</div>
          <div style={styles.menuTwoCols}>
            <div>
              <label style={styles.inputLabel}>Období</label>
              <select style={styles.menuInput} defaultValue="hour">
                <option value="hour">za hodinu</option>
                <option value="day">za den</option>
                <option value="month">za měsíc</option>
              </select>
            </div>
            <div>
              <label style={styles.inputLabel}>Max views</label>
              <input type="number" min="0" step="1" defaultValue="0" style={styles.menuInput} />
            </div>
          </div>

          <div style={styles.menuSubTitle}>Text, když QR není aktivní</div>
          <textarea
            defaultValue={profileData?.qrCode.fallback_text || ""}
            style={styles.menuTextArea}
            placeholder="Tento QR kód teď není aktivní."
          />

          <div style={styles.menuInfoBox}>
            Náhled fallback textu se nebude účtovat jako placený scan, aby neodebíral kredit.
          </div>

          <button type="button" style={styles.menuPrimaryButton} onClick={() => showPending("Nastavení QR")}>
            uložit nastavení QR
          </button>
        </div>
      );
    }

    if (activeMenuSection === "history") {
      return (
        <div style={styles.menuPanelStack}>
          <div style={styles.menuSectionTitle}>Historie scanů</div>

          <div style={styles.menuTwoCols}>
            <div>
              <label style={styles.inputLabel}>Od</label>
              <input type="datetime-local" style={styles.menuInput} />
            </div>
            <div>
              <label style={styles.inputLabel}>Do</label>
              <input type="datetime-local" style={styles.menuInput} />
            </div>
          </div>

          <button type="button" style={styles.menuPrimaryButton} onClick={() => showPending("Historie scanů")}>
            zobrazit historii
          </button>

          <div style={styles.historyResultBox}>
            <div style={styles.inputLabel}>Počet validních scanů</div>
            <div style={styles.historyBigNumber}>—</div>
          </div>

          <div style={styles.menuInfoBox}>
            Tady později přidáme výpis podle hodin, dnů nebo konkrétních období.
          </div>
        </div>
      );
    }

    if (activeMenuSection === "alerts") {
      const currentThousands = Math.floor(
        Number(profileData?.profile.low_views_alert_threshold || 0) / 1000
      );

      return (
        <div style={styles.menuPanelStack}>
          <div style={styles.menuSectionTitle}>Upozornění</div>

          <div style={styles.menuInfoBox}>
            Upozornění se nastavuje po tisících views. Například 10 znamená upozornit při poklesu pod 10 000 dostupných views.
          </div>

          <label style={styles.inputLabel}>Upozornit při poklesu pod počet tisíc views</label>
          <div style={styles.menuTwoCols}>
            <input
              type="number"
              min="0"
              step="1"
              defaultValue={currentThousands}
              style={styles.menuInput}
            />
            <div style={styles.menuInfoBox}>× 1000 views</div>
          </div>

          <div style={styles.menuCardGrid}>
            <button type="button" style={styles.menuToggleButton} onClick={() => showPending("Upozornění v aplikaci")}>
              upozornění v aplikaci
            </button>
            <button type="button" style={styles.menuToggleButton} onClick={() => showPending("Email upozornění")}>
              email upozornění
            </button>
          </div>

          <button type="button" style={styles.menuPrimaryButton} onClick={() => showPending("Nastavení upozornění")}> 
            uložit upozornění
          </button>
        </div>
      );
    }

    if (activeMenuSection === "regenerate") {
      return (
        <div style={styles.menuPanelStack}>
          <div style={styles.menuSectionTitle}>Vygenerovat nový QR</div>

          <div style={styles.menuWarning}>
            Pozor: při vygenerování nového QR kódu se aktuální QR kód nenávratně přepíše.
            Starý QR kód už nebude fungovat nikde, kde je vytištěný nebo sdílený.
          </div>

          <button type="button" style={styles.dangerButton} onClick={() => showPending("Vygenerování nového QR")}>
            vygenerovat nový QR kód
          </button>
        </div>
      );
    }

    if (activeMenuSection === "language") {
      return (
        <div style={styles.menuPanelStack}>
          <div style={styles.menuSectionTitle}>Jazyk</div>

          <div style={styles.innerCard}>
            <div style={styles.innerCardTitle}>Dostupné jazyky</div>
            <button type="button" style={styles.menuPrimaryButton} onClick={() => setMessage("Čeština je aktivní.")}>
              čeština
            </button>
            <button type="button" style={styles.disabledButton}>
              angličtina později
            </button>
          </div>
        </div>
      );
    }

    if (activeMenuSection === "account") {
      return (
        <div style={styles.menuPanelStack}>
          <div style={styles.menuSectionTitle}>Účet</div>

          <label style={styles.inputLabel}>Jméno organizace / uživatele</label>
          <input type="text" style={styles.menuInput} placeholder="Název organizace" />

          <label style={styles.inputLabel}>Adresa</label>
          <input type="text" style={styles.menuInput} placeholder="Adresa" />

          <div style={styles.menuTwoCols}>
            <div>
              <label style={styles.inputLabel}>Email</label>
              <input type="email" style={styles.menuInput} placeholder="email@example.com" />
            </div>
            <div>
              <label style={styles.inputLabel}>Telefon</label>
              <input type="tel" style={styles.menuInput} placeholder="+420..." />
            </div>
          </div>

          <div style={styles.menuSubTitle}>Změna hesla</div>
          <input type="password" style={styles.menuInput} placeholder="Nové heslo" />

          <button type="button" style={styles.menuPrimaryButton} onClick={() => showPending("Účet")}>
            uložit účet
          </button>
        </div>
      );
    }

    return null;
  }

  if (loading || !profileData) {
    return (
      <main style={styles.page}>
        <div style={styles.loadingCard}>{message || "Načítání dashboardu..."}</div>
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
              onClick={openMenuModal}
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

            <button type="button" style={styles.bigOptionButton} onClick={openUrlModal}>
              url
            </button>

            <button type="button" style={styles.bigOptionButton} onClick={openMediaModal}>
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

            <button type="button" style={styles.smallActionButton} onClick={openPrintModal}>
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

      {showMenuModal ? (
        <div style={styles.menuOverlay}>
          <div style={styles.menuBox}>
            <div style={styles.menuHeader}>
              {activeMenuSection !== "main" ? (
                <button
                  type="button"
                  style={styles.menuBackButton}
                  onClick={() => setActiveMenuSection("main")}
                >
                  zpět
                </button>
              ) : (
                <button type="button" style={styles.menuBackButton} onClick={closeMenuModal}>
                  zavřít
                </button>
              )}

              <div style={styles.menuTitle}>
                {activeMenuSection === "main" ? "Menu" : getMenuSectionTitle(activeMenuSection)}
              </div>

              <button type="button" style={styles.menuCloseButton} onClick={closeMenuModal}>
                ×
              </button>
            </div>

            {activeMenuSection === "main" ? (
              <div style={styles.menuGrid}>
                <button type="button" style={styles.menuItemButton} onClick={() => setActiveMenuSection("subscription")}>
                  1. Předplatné a kredit
                </button>
                <button type="button" style={styles.menuItemButton} onClick={() => setActiveMenuSection("qrSettings")}>
                  2. Nastavení QR
                </button>
                <button type="button" style={styles.menuItemButton} onClick={() => setActiveMenuSection("history")}>
                  3. Historie
                </button>
                <button type="button" style={styles.menuItemButton} onClick={() => setActiveMenuSection("alerts")}>
                  4. Upozornění
                </button>
                <button type="button" style={styles.menuItemButton} onClick={() => setActiveMenuSection("regenerate")}>
                  5. Nový QR kód
                </button>
                <button type="button" style={styles.menuItemButton} onClick={() => setActiveMenuSection("language")}>
                  6. Jazyk
                </button>
                <button type="button" style={styles.menuItemButton} onClick={() => setActiveMenuSection("account")}>
                  7. Účet
                </button>
              </div>
            ) : (
              <div style={styles.menuContent}>{renderMenuContent()}</div>
            )}
          </div>
        </div>
      ) : null}

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
              <button type="button" style={styles.modalCancelButton} onClick={closeTextModal} disabled={savingText}>
                zrusit
              </button>
              <button type="button" style={styles.modalConfirmButton} onClick={confirmTextModal} disabled={savingText}>
                {savingText ? "ukladam..." : "potvrdit"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showUrlModal ? (
        <div style={styles.modalOverlay}>
          <div style={styles.modalBox}>
            <div style={styles.modalTitle}>Zadat URL</div>
            <input
              value={draftUrl}
              onChange={(e) => setDraftUrl(e.target.value)}
              style={styles.urlInput}
              placeholder="https://example.com"
              autoFocus
            />
            <div style={styles.modalButtons}>
              <button type="button" style={styles.modalCancelButton} onClick={closeUrlModal} disabled={savingUrl}>
                zrusit
              </button>
              <button type="button" style={styles.modalConfirmButton} onClick={confirmUrlModal} disabled={savingUrl}>
                {savingUrl ? "ukladam..." : "potvrdit"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showMediaModal ? (
        <div style={styles.modalOverlay}>
          <div style={styles.modalBox}>
            <div style={styles.modalTitle}>Vybrat media</div>
            <input
              type="file"
              onChange={(e: ChangeEvent<HTMLInputElement>) => {
                setDraftFile(e.target.files?.[0] || null);
              }}
              style={styles.fileInput}
              disabled={savingMedia}
            />
            <div style={styles.selectedFileBox}>
              {draftFile ? draftFile.name : "Zatím není vybraný žádný soubor."}
            </div>
            <div style={styles.modalButtons}>
              <button type="button" style={styles.modalCancelButton} onClick={closeMediaModal} disabled={savingMedia}>
                zrusit
              </button>
              <button type="button" style={styles.modalConfirmButton} onClick={confirmMediaModal} disabled={savingMedia}>
                {savingMedia ? "ukladam..." : "potvrdit"}
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {showPrintModal ? (
        <div style={styles.modalOverlay}>
          <div style={styles.modalBox}>
            <div style={styles.modalTitle}>Velikost tisku QR</div>
            <div style={styles.printGrid}>
              <div>
                <div style={styles.inputLabel}>Jednotka</div>
                <select
                  value={printUnit}
                  onChange={(e) => setPrintUnit(e.target.value as PrintUnit)}
                  style={styles.selectInput}
                >
                  <option value="cm">cm</option>
                  <option value="inch">inch</option>
                </select>
              </div>
              <div>
                <div style={styles.inputLabel}>Velikost</div>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={printSize}
                  onChange={(e) => setPrintSize(e.target.value)}
                  onBlur={() => {
                    const parsed = normalizePrintSize(printSize);
                    if (parsed) setPrintSize(parsed.toFixed(2));
                  }}
                  style={styles.urlInput}
                  placeholder="6.00"
                />
              </div>
            </div>
            <div style={styles.printHint}>Přesnost velikosti je maximálně na 2 desetinná místa.</div>
            <div style={styles.modalButtons}>
              <button type="button" style={styles.modalCancelButton} onClick={closePrintModal}>
                zrusit
              </button>
              <button type="button" style={styles.modalConfirmButton} onClick={handlePrintQr}>
                tisknout
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
    border: "6px solid #000000",
    borderRadius: 34,
    padding: 12,
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    gap: 18,
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
    borderRadius: 34,
    background: "#c8d7e7",
    padding: 12,
    fontSize: 28,
    fontWeight: 700,
    textAlign: "center",
    boxSizing: "border-box"
  },
  menuOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0, 0, 0, 0.45)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 10,
    boxSizing: "border-box",
    zIndex: 120
  },
  menuBox: {
    width: "min(calc(100vw - 20px), 720px, calc((100vh - 20px) * 0.486486))",
    aspectRatio: "720 / 1480",
    overflow: "hidden",
    border: "6px solid #000000",
    borderRadius: 34,
    background: "#ead790",
    padding: 12,
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    gap: 12
  },
  menuHeader: {
    display: "grid",
    gridTemplateColumns: "120px 1fr 60px",
    gap: 12,
    alignItems: "center",
    flexShrink: 0
  },
  menuBackButton: {
    minHeight: 58,
    border: "5px solid #000000",
    borderRadius: 18,
    background: "#ffffff",
    fontSize: 20,
    fontWeight: 900,
    cursor: "pointer"
  },
  menuCloseButton: {
    minHeight: 58,
    border: "5px solid #000000",
    borderRadius: 18,
    background: "#ead790",
    fontSize: 30,
    fontWeight: 900,
    cursor: "pointer"
  },
  menuTitle: {
    fontSize: 32,
    fontWeight: 900,
    textAlign: "center",
    lineHeight: 1.1
  },
  menuGrid: {
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: 12,
    padding: 0,
    boxSizing: "border-box",
    flex: 1,
    minHeight: 0,
    overflow: "auto"
  },
  menuItemButton: {
    minHeight: 78,
    border: "6px solid #000000",
    borderRadius: 34,
    background: "#ffffff",
    fontSize: 22,
    fontWeight: 900,
    textAlign: "left",
    padding: "0 18px",
    cursor: "pointer"
  },
  menuContent: {
    border: "6px solid #000000",
    borderRadius: 34,
    background: "#c8d7e7",
    padding: 12,
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    gap: 14,
    flex: 1,
    minHeight: 0,
    overflow: "auto"
  },
  menuPanelStack: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    minHeight: "100%",
    justifyContent: "flex-start"
  },
  menuSectionTitle: {
    fontSize: 28,
    fontWeight: 900,
    lineHeight: 1.15
  },
  menuSubTitle: {
    fontSize: 23,
    fontWeight: 900,
    lineHeight: 1.2
  },
  menuText: {
    fontSize: 20,
    fontWeight: 700,
    lineHeight: 1.45
  },
  menuWarning: {
    border: "6px solid #000000",
    borderRadius: 34,
    background: "#ead790",
    padding: 14,
    fontSize: 20,
    fontWeight: 900,
    lineHeight: 1.4
  },
  menuInfoBox: {
    border: "6px solid #000000",
    borderRadius: 34,
    background: "#eef6ff",
    padding: 14,
    fontSize: 18,
    fontWeight: 800,
    lineHeight: 1.35
  },
  menuCardGrid: {
    display: "grid",
    gridTemplateColumns: "1fr",
    gap: 12
  },
  planChoiceGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: 12
  },
  qrChoiceGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    gap: 12
  },
  innerCard: {
    border: "6px solid #000000",
    borderRadius: 34,
    background: "#ffffff",
    padding: 12,
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    gap: 10
  },
  innerCardTitle: {
    fontSize: 22,
    fontWeight: 900,
    lineHeight: 1.2
  },
  menuTwoCols: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 12
  },
  menuInput: {
    width: "100%",
    minHeight: 62,
    border: "6px solid #000000",
    borderRadius: 28,
    padding: "0 12px",
    boxSizing: "border-box",
    fontSize: 19,
    fontWeight: 800,
    background: "#ffffff",
    color: "#000000",
    outline: "none"
  },
  menuTextArea: {
    width: "100%",
    minHeight: 130,
    border: "6px solid #000000",
    borderRadius: 28,
    padding: 12,
    boxSizing: "border-box",
    fontSize: 19,
    fontWeight: 800,
    lineHeight: 1.35,
    resize: "vertical",
    background: "#ffffff",
    color: "#000000",
    outline: "none"
  },
  menuToggleButton: {
    minHeight: 68,
    border: "6px solid #000000",
    borderRadius: 34,
    background: "#ffffff",
    fontSize: 20,
    fontWeight: 900,
    cursor: "pointer"
  },
  menuToggleButtonActive: {
    background: "#ead790",
    transform: "translateY(2px)",
    boxShadow: "inset 0 0 0 3px rgba(0,0,0,0.12)"
  },
  menuPrimaryButton: {
    minHeight: 68,
    border: "6px solid #000000",
    borderRadius: 34,
    background: "#ead790",
    fontSize: 22,
    fontWeight: 900,
    cursor: "pointer"
  },
  dangerButton: {
    minHeight: 78,
    border: "6px solid #000000",
    borderRadius: 34,
    background: "#ffb4a8",
    fontSize: 22,
    fontWeight: 900,
    cursor: "pointer"
  },
  disabledButton: {
    minHeight: 68,
    border: "6px solid #000000",
    borderRadius: 34,
    background: "#dddddd",
    color: "#555555",
    fontSize: 22,
    fontWeight: 900,
    cursor: "not-allowed"
  },
  historyResultBox: {
    border: "6px solid #000000",
    borderRadius: 34,
    background: "#ead790",
    padding: 18,
    boxSizing: "border-box",
    textAlign: "center"
  },
  historyBigNumber: {
    fontSize: 56,
    fontWeight: 900,
    lineHeight: 1
  },
  modalOverlay: {
    position: "fixed",
    inset: 0,
    background: "rgba(0, 0, 0, 0.45)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 10,
    boxSizing: "border-box",
    zIndex: 100
  },
  modalBox: {
    width: "min(calc(100vw - 20px), 720px, calc((100vh - 20px) * 0.486486))",
    aspectRatio: "720 / 1480",
    overflow: "auto",
    border: "6px solid #000000",
    borderRadius: 34,
    background: "#ead790",
    padding: 12,
    boxSizing: "border-box",
    display: "flex",
    flexDirection: "column",
    gap: 14
  },
  modalTitle: {
    fontSize: 34,
    fontWeight: 900,
    textAlign: "center"
  },
  textArea: {
    width: "100%",
    minHeight: 260,
    resize: "vertical",
    border: "6px solid #000000",
    borderRadius: 34,
    padding: 16,
    boxSizing: "border-box",
    fontSize: 22,
    fontWeight: 700,
    lineHeight: 1.35,
    background: "#ffffff",
    color: "#000000",
    outline: "none"
  },
  urlInput: {
    width: "100%",
    minHeight: 72,
    border: "6px solid #000000",
    borderRadius: 34,
    padding: "0 16px",
    boxSizing: "border-box",
    fontSize: 22,
    fontWeight: 700,
    background: "#ffffff",
    color: "#000000",
    outline: "none"
  },
  selectInput: {
    width: "100%",
    minHeight: 72,
    border: "6px solid #000000",
    borderRadius: 34,
    padding: "0 16px",
    boxSizing: "border-box",
    fontSize: 22,
    fontWeight: 700,
    background: "#ffffff",
    color: "#000000",
    outline: "none"
  },
  inputLabel: {
    fontSize: 20,
    fontWeight: 900,
    marginBottom: 8
  },
  printGrid: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 14
  },
  printHint: {
    border: "5px solid #000000",
    borderRadius: 22,
    background: "#ffffff",
    padding: 14,
    fontSize: 18,
    fontWeight: 800,
    lineHeight: 1.35,
    textAlign: "center"
  },
  fileInput: {
    width: "100%",
    border: "6px solid #000000",
    borderRadius: 34,
    padding: 16,
    boxSizing: "border-box",
    fontSize: 18,
    fontWeight: 700,
    background: "#ffffff",
    color: "#000000",
    outline: "none"
  },
  selectedFileBox: {
    width: "100%",
    border: "6px solid #000000",
    borderRadius: 34,
    padding: 16,
    boxSizing: "border-box",
    fontSize: 20,
    fontWeight: 800,
    lineHeight: 1.35,
    background: "#ffffff",
    color: "#000000",
    wordBreak: "break-word",
    textAlign: "center"
  },
  modalButtons: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    gap: 14
  },
  modalCancelButton: {
    minHeight: 72,
    border: "6px solid #000000",
    borderRadius: 34,
    background: "#ffffff",
    fontSize: 24,
    fontWeight: 900,
    cursor: "pointer"
  },
  modalConfirmButton: {
    minHeight: 72,
    border: "6px solid #000000",
    borderRadius: 34,
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
