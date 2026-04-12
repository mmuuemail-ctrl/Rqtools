"use client";

import { CSSProperties, FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { supabaseBrowser } from "../../lib/supabase-browser";
import {
  getAvailableLanguages,
  getDictionary,
  getStoredLanguage,
  setStoredLanguage,
  t,
  type LanguageDictionary,
  type LanguageMeta
} from "../../lib/i18n";

export default function LoginPage() {
  const router = useRouter();

  const [language, setLanguage] = useState("cs");
  const [dictionary, setDictionary] = useState<LanguageDictionary | null>(null);
  const [availableLanguages, setAvailableLanguages] = useState<LanguageMeta[]>([]);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

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
    const checkSession = async () => {
      const { data } = await supabaseBrowser.auth.getSession();

      if (data.session?.user) {
        router.push("/");
      }
    };

    checkSession().catch(console.error);
  }, [router]);

  async function handleLogin(e: FormEvent) {
    e.preventDefault();

    try {
      setBusy(true);
      setMessage("");

      if (!email.trim() || !password) {
        setMessage(t(dictionary, "errors.invalidInput"));
        return;
      }

      const { error } = await supabaseBrowser.auth.signInWithPassword({
        email: email.trim(),
        password
      });

      if (error) {
        setMessage(error.message);
        return;
      }

      router.push("/");
    } catch (error) {
      console.error(error);
      setMessage(t(dictionary, "errors.generic"));
    } finally {
      setBusy(false);
    }
  }

  return (
    <main style={styles.page}>
      <div style={styles.shell}>
        <div style={styles.topBar}>
          <div style={styles.brand}>RQtools</div>

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
          </div>
        </div>

        <div style={styles.card}>
          <h1 style={styles.title}>{t(dictionary, "common.login")}</h1>

          <form onSubmit={handleLogin} style={styles.form}>
            <label style={styles.label}>{t(dictionary, "auth.email")}</label>
            <input
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={styles.input}
              placeholder="you@example.com"
            />

            <label style={styles.label}>{t(dictionary, "auth.password")}</label>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={styles.input}
              placeholder="••••••••"
            />

            <button type="submit" style={styles.primaryButton} disabled={busy}>
              {busy ? t(dictionary, "common.loading") : t(dictionary, "common.login")}
            </button>
          </form>

          {message ? <div style={styles.message}>{message}</div> : null}

          <div style={styles.footerRow}>
            <span>{t(dictionary, "auth.dontHaveAccount")}</span>
            <button
              type="button"
              style={styles.linkButton}
              onClick={() => router.push("/register")}
            >
              {t(dictionary, "common.register")}
            </button>
          </div>
        </div>
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
    maxWidth: 1100,
    margin: "0 auto",
    display: "flex",
    flexDirection: "column",
    gap: 20
  },
  topBar: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center"
  },
  brand: {
    fontSize: 28,
    fontWeight: 800
  },
  topRight: {
    display: "flex",
    gap: 12,
    alignItems: "center"
  },
  card: {
    width: "100%",
    maxWidth: 520,
    margin: "80px auto 0",
    background: "#ffffff",
    border: "1px solid #dde4ec",
    borderRadius: 18,
    padding: 24,
    boxShadow: "0 10px 30px rgba(15, 23, 42, 0.06)",
    display: "flex",
    flexDirection: "column",
    gap: 16
  },
  title: {
    margin: 0,
    fontSize: 30,
    fontWeight: 800,
    textAlign: "center"
  },
  form: {
    display: "flex",
    flexDirection: "column",
    gap: 12
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
    background: "#ffffff"
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
    fontWeight: 700,
    marginTop: 8
  },
  linkButton: {
    border: "none",
    background: "transparent",
    color: "#2563eb",
    cursor: "pointer",
    fontWeight: 700,
    padding: 0
  },
  message: {
    border: "1px solid #fecaca",
    background: "#fef2f2",
    color: "#991b1b",
    borderRadius: 12,
    padding: 12,
    fontSize: 14
  },
  footerRow: {
    display: "flex",
    gap: 8,
    justifyContent: "center",
    alignItems: "center",
    fontSize: 14
  }
};
