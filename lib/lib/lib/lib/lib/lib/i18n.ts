export type DictionaryObject = Record<string, unknown>;

export type LanguageMeta = {
  code: string;
  label: string;
};

export type LanguageDictionary = {
  meta: LanguageMeta;
} & DictionaryObject;

const LANGUAGE_STORAGE_KEY = "rqtools_language";

async function fetchJson<T>(url: string): Promise<T> {
  const res = await fetch(url, { cache: "no-store" });

  if (!res.ok) {
    throw new Error(`Failed to fetch ${url}`);
  }

  return res.json() as Promise<T>;
}

export async function getDictionary(languageCode: string): Promise<LanguageDictionary> {
  try {
    return await fetchJson<LanguageDictionary>(`/language/${languageCode}.json`);
  } catch {
    return fetchJson<LanguageDictionary>("/language/cs.json");
  }
}

export async function getAvailableLanguages(): Promise<LanguageMeta[]> {
  const candidates = ["cs", "en"];
  const loaded = await Promise.all(
    candidates.map(async (code) => {
      try {
        const dict = await getDictionary(code);
        return {
          code: dict.meta.code,
          label: dict.meta.label
        };
      } catch {
        return null;
      }
    })
  );

  return loaded.filter((item): item is LanguageMeta => item !== null);
}

export function getStoredLanguage() {
  if (typeof window === "undefined") return "cs";
  return window.localStorage.getItem(LANGUAGE_STORAGE_KEY) || "cs";
}

export function setStoredLanguage(language: string) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LANGUAGE_STORAGE_KEY, language);
}

export function t(
  dictionary: LanguageDictionary | null,
  path: string,
  replacements?: Record<string, string | number>
) {
  if (!dictionary) return path;

  const parts = path.split(".");
  let current: unknown = dictionary;

  for (const part of parts) {
    if (!current || typeof current !== "object" || !(part in current)) {
      return path;
    }

    current = (current as Record<string, unknown>)[part];
  }

  if (typeof current !== "string") {
    return path;
  }

  if (!replacements) {
    return current;
  }

  return Object.entries(replacements).reduce((text, [key, value]) => {
    return text.replaceAll(`{${key}}`, String(value));
  }, current);
}
