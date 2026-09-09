export const GHANAIAN_LANGUAGE_REGISTRY_VERSION = "GH_EDU_LANGUAGE_REGISTRY_V1" as const;

export const GHANAIAN_LANGUAGE_SUBJECT_KEY = "GHANAIANLANGUAGE" as const;

export const GHANAIAN_LANGUAGE_CODES = [
  "AKUAPEM_TWI",
  "ASANTE_TWI",
  "FANTE",
  "NZEMA",
  "GA",
  "DANGME",
  "EWE",
  "GONJA",
  "KASEM",
  "DAGBANI",
  "DAGAARE",
] as const;

export type GhanaianLanguageCode = (typeof GHANAIAN_LANGUAGE_CODES)[number];

export type GhanaianLanguageTranslationStatus = "NOT_ENABLED_GL_P1";

export type GhanaianLanguageDefinition = {
  code: GhanaianLanguageCode;
  name: string;
  aliases: readonly string[];
  singleLetters: readonly string[];
  multipleLetters: readonly string[];
  keyboardCharacters: readonly string[];
  registryVersion: typeof GHANAIAN_LANGUAGE_REGISTRY_VERSION;
  translationStatus: GhanaianLanguageTranslationStatus;
  sourceAuthority: readonly string[];
};

const AKAN_SINGLE = [
  "a", "b", "d", "e", "ɛ", "f", "g", "h", "i", "k", "l", "m", "n", "o", "ɔ", "p", "r", "s", "t", "u", "v", "w", "y", "z",
] as const;
const AKAN_MULTIPLE = ["dw", "dz", "gy", "hw", "hy", "kw", "ky", "nw", "ny", "ng", "tw", "ts"] as const;

const DEFINITIONS: readonly GhanaianLanguageDefinition[] = [
  {
    code: "AKUAPEM_TWI",
    name: "Akuapem Twi",
    aliases: ["Akuapem", "Akuapim Twi", "Akan - Akuapem Twi"],
    singleLetters: AKAN_SINGLE,
    multipleLetters: AKAN_MULTIPLE,
    keyboardCharacters: ["ɛ", "Ɛ", "ɔ", "Ɔ"],
    registryVersion: GHANAIAN_LANGUAGE_REGISTRY_VERSION,
    translationStatus: "NOT_ENABLED_GL_P1",
    sourceAuthority: ["NaCCA approved Ghanaian-language list", "Ghana Book Development Council official Akan alphabet"],
  },
  {
    code: "ASANTE_TWI",
    name: "Asante Twi",
    aliases: ["Ashanti Twi", "Asante", "Akan - Asante Twi"],
    singleLetters: AKAN_SINGLE,
    multipleLetters: AKAN_MULTIPLE,
    keyboardCharacters: ["ɛ", "Ɛ", "ɔ", "Ɔ"],
    registryVersion: GHANAIAN_LANGUAGE_REGISTRY_VERSION,
    translationStatus: "NOT_ENABLED_GL_P1",
    sourceAuthority: ["NaCCA approved Ghanaian-language list", "Ghana Book Development Council official Akan alphabet"],
  },
  {
    code: "FANTE",
    name: "Fante",
    aliases: ["Fanti", "Mfantse", "Akan - Fante"],
    singleLetters: AKAN_SINGLE,
    multipleLetters: AKAN_MULTIPLE,
    keyboardCharacters: ["ɛ", "Ɛ", "ɔ", "Ɔ"],
    registryVersion: GHANAIAN_LANGUAGE_REGISTRY_VERSION,
    translationStatus: "NOT_ENABLED_GL_P1",
    sourceAuthority: ["NaCCA approved Ghanaian-language list", "Ghana Book Development Council official Akan alphabet"],
  },
  {
    code: "NZEMA",
    name: "Nzema",
    aliases: ["Nzima"],
    singleLetters: ["a", "b", "d", "e", "ɛ", "f", "g", "h", "i", "k", "l", "m", "n", "o", "ɔ", "p", "r", "s", "t", "u", "v", "w", "y", "z"],
    multipleLetters: ["dw", "ky", "hy", "nr", "nw", "kp", "tw", "ny", "hw", "gb", "gy"],
    keyboardCharacters: ["ɛ", "Ɛ", "ɔ", "Ɔ"],
    registryVersion: GHANAIAN_LANGUAGE_REGISTRY_VERSION,
    translationStatus: "NOT_ENABLED_GL_P1",
    sourceAuthority: ["NaCCA approved Ghanaian-language list", "Ghana Book Development Council official Nzema alphabet"],
  },
  {
    code: "GA",
    name: "Ga",
    aliases: ["Ga language"],
    singleLetters: ["a", "b", "d", "e", "ɛ", "f", "g", "h", "i", "j", "k", "l", "m", "n", "ŋ", "o", "ɔ", "p", "r", "s", "t", "u", "v", "w", "y", "z"],
    multipleLetters: ["gb", "gw", "hw", "jw", "kp", "kw", "ny", "ŋm", "ŋw", "sh", "ts", "shw", "tsw"],
    keyboardCharacters: ["ɛ", "Ɛ", "ŋ", "Ŋ", "ɔ", "Ɔ"],
    registryVersion: GHANAIAN_LANGUAGE_REGISTRY_VERSION,
    translationStatus: "NOT_ENABLED_GL_P1",
    sourceAuthority: ["NaCCA approved Ghanaian-language list", "Ghana Book Development Council official Ga alphabet"],
  },
  {
    code: "DANGME",
    name: "Dangme",
    aliases: ["Adangme", "Dangbe"],
    singleLetters: ["a", "b", "d", "e", "ɛ", "f", "g", "h", "i", "j", "k", "l", "m", "n", "o", "ɔ", "p", "r", "s", "t", "u", "v", "ʋ", "w", "y", "z"],
    multipleLetters: ["ng", "ngm", "kp", "gb", "ny", "ts"],
    keyboardCharacters: ["ɛ", "Ɛ", "ɔ", "Ɔ", "ʋ", "Ʋ"],
    registryVersion: GHANAIAN_LANGUAGE_REGISTRY_VERSION,
    translationStatus: "NOT_ENABLED_GL_P1",
    sourceAuthority: ["NaCCA approved Ghanaian-language list", "Ghana Book Development Council official Dangme alphabet"],
  },
  {
    code: "EWE",
    name: "Ewe",
    aliases: ["Eʋe", "Evegbe"],
    singleLetters: ["a", "b", "d", "ɖ", "e", "ɛ", "f", "ƒ", "g", "ɣ", "h", "x", "i", "k", "l", "m", "n", "ŋ", "o", "ɔ", "p", "r", "s", "t", "u", "v", "ʋ", "w", "y", "z"],
    multipleLetters: ["gb", "dz", "ny", "kp", "ts", "kw", "dzy", "tsy"],
    keyboardCharacters: ["ɖ", "Ɖ", "ɛ", "Ɛ", "ƒ", "Ƒ", "ɣ", "Ɣ", "ŋ", "Ŋ", "ɔ", "Ɔ", "ʋ", "Ʋ"],
    registryVersion: GHANAIAN_LANGUAGE_REGISTRY_VERSION,
    translationStatus: "NOT_ENABLED_GL_P1",
    sourceAuthority: ["NaCCA approved Ghanaian-language list", "Ghana Book Development Council official Ewe alphabet"],
  },
  {
    code: "GONJA",
    name: "Gonja",
    aliases: ["Gonja language"],
    singleLetters: ["a", "b", "d", "e", "ɛ", "f", "g", "h", "i", "j", "k", "l", "m", "n", "ŋ", "o", "ɔ", "p", "r", "s", "t", "u", "v", "w", "y", "z"],
    multipleLetters: ["ch", "gb", "kp", "kw", "ny", "ŋm", "sh"],
    keyboardCharacters: ["ɛ", "Ɛ", "ŋ", "Ŋ", "ɔ", "Ɔ"],
    registryVersion: GHANAIAN_LANGUAGE_REGISTRY_VERSION,
    translationStatus: "NOT_ENABLED_GL_P1",
    sourceAuthority: ["NaCCA approved Ghanaian-language list", "Ghana Book Development Council official Gonja alphabet"],
  },
  {
    code: "KASEM",
    name: "Kasem",
    aliases: ["Kasena", "Kassem"],
    singleLetters: ["a", "b", "d", "e", "ɛ", "f", "g", "h", "i", "j", "k", "l", "m", "n", "ŋ", "o", "ɔ", "p", "r", "s", "t", "u", "v", "w", "y", "z"],
    multipleLetters: ["ch", "gw", "kw", "ny", "ŋw", "pw"],
    keyboardCharacters: ["ɛ", "Ɛ", "ŋ", "Ŋ", "ɔ", "Ɔ"],
    registryVersion: GHANAIAN_LANGUAGE_REGISTRY_VERSION,
    translationStatus: "NOT_ENABLED_GL_P1",
    sourceAuthority: ["NaCCA approved Ghanaian-language list", "Ghana Book Development Council official Kasem alphabet"],
  },
  {
    code: "DAGBANI",
    name: "Dagbani",
    aliases: ["Dagbane", "Dagomba"],
    singleLetters: ["a", "b", "d", "e", "ɛ", "f", "g", "h", "i", "j", "k", "l", "m", "n", "ŋ", "o", "ɔ", "p", "r", "s", "t", "u", "v", "w", "y", "z"],
    multipleLetters: ["gb", "ch", "kp", "ny", "ŋw", "sh"],
    keyboardCharacters: ["ɛ", "Ɛ", "ŋ", "Ŋ", "ɔ", "Ɔ"],
    registryVersion: GHANAIAN_LANGUAGE_REGISTRY_VERSION,
    translationStatus: "NOT_ENABLED_GL_P1",
    sourceAuthority: ["NaCCA approved Ghanaian-language list", "Ghana Book Development Council official Dagbani alphabet"],
  },
  {
    code: "DAGAARE",
    name: "Dagaare",
    aliases: ["Dagara", "Dagaaba"],
    singleLetters: ["a", "b", "d", "e", "ɛ", "f", "g", "h", "i", "k", "l", "m", "n", "o", "ɔ", "p", "r", "s", "t", "u", "w", "y", "z"],
    multipleLetters: ["gb", "kp", "ky", "ngm", "ny", "mh"],
    keyboardCharacters: ["ɛ", "Ɛ", "ɔ", "Ɔ"],
    registryVersion: GHANAIAN_LANGUAGE_REGISTRY_VERSION,
    translationStatus: "NOT_ENABLED_GL_P1",
    sourceAuthority: ["NaCCA approved Ghanaian-language list", "Ghana Book Development Council official Dagaare alphabet"],
  },
] as const;

export const GHANAIAN_LANGUAGES = DEFINITIONS;

const BY_CODE = new Map<GhanaianLanguageCode, GhanaianLanguageDefinition>(
  GHANAIAN_LANGUAGES.map((language) => [language.code, language]),
);

function compact(raw: unknown) {
  return String(raw ?? "")
    .normalize("NFC")
    .trim()
    .toUpperCase()
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function stripTeachingLevelPrefix(raw: unknown) {
  return String(raw ?? "")
    .normalize("NFC")
    .trim()
    .replace(
      /^(?:(?:JHS\s*[1-3]|JHS[1-3])|(?:JUNIOR\s+HIGH\s+SCHOOL\s*[1-3])|(?:BASIC\s*[1-9]|BASIC[1-9])|(?:BS\s*[1-9]|BS[1-9])|(?:B\s*[1-9]|B[1-9])|(?:P\s*[1-6]|P[1-6])|(?:PRIMARY\s*[1-6])|(?:KG\s*[1-2]|KG[1-2]))\s*[:\-–—]?\s*/i,
      "",
    );
}

export function isGhanaianLanguageSubject(raw: unknown) {
  const key = compact(stripTeachingLevelPrefix(raw));
  return key === "GHANAIANLANGUAGE" || key === "GHANAIANLANGUAGES";
}

export function getGhanaianLanguage(code: unknown): GhanaianLanguageDefinition | null {
  const normalized = String(code ?? "").trim().toUpperCase() as GhanaianLanguageCode;
  return BY_CODE.get(normalized) ?? null;
}

export function resolveGhanaianLanguage(raw: unknown): GhanaianLanguageDefinition | null {
  const direct = getGhanaianLanguage(raw);
  if (direct) return direct;

  const key = compact(raw);
  if (!key) return null;

  for (const language of GHANAIAN_LANGUAGES) {
    if (compact(language.name) === key) return language;
    if (language.aliases.some((alias) => compact(alias) === key)) return language;
  }

  return null;
}

export function listGhanaianLanguageOptions() {
  return GHANAIAN_LANGUAGES.map((language) => ({
    code: language.code,
    name: language.name,
    keyboardCharacters: [...language.keyboardCharacters],
    registryVersion: language.registryVersion,
    translationStatus: language.translationStatus,
  }));
}
