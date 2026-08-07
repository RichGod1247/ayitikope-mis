function cleanBase(value: unknown) {
  return String(value ?? "").trim().replace(/\/+$/, "");
}

function localUatUrlsAllowed() {
  return (
    process.env.NODE_ENV !== "production" &&
    (process.env.EDULIFE_UAT_LOCAL_URLS ?? "")
      .trim()
      .toLowerCase() === "true"
  );
}

function isExactLocalUatBase(value: string) {
  if (!localUatUrlsAllowed()) return false;

  try {
    const url = new URL(value);
    const hostname = url.hostname.toLowerCase();

    return (
      url.protocol === "http:" &&
      (hostname === "127.0.0.1" || hostname === "localhost") &&
      url.port === "3001" &&
      url.pathname === "/" &&
      !url.search &&
      !url.hash &&
      !url.username &&
      !url.password
    );
  } catch {
    return false;
  }
}

function isBadPublicBase(value: string) {
  const v = value.toLowerCase();

  if (!v || v.includes("0.0.0.0")) return true;

  if (v.includes("127.0.0.1") || v.includes("localhost")) {
    return !isExactLocalUatBase(value);
  }

  return false;
}

export function getPublicBaseUrl(req?: Request) {
  const envBase =
    cleanBase(process.env.APP_URL) ||
    cleanBase(process.env.NEXT_PUBLIC_APP_URL) ||
    cleanBase(process.env.NEXTAUTH_URL) ||
    cleanBase(process.env.NEXT_PUBLIC_BASE_URL);

  if (envBase && !isBadPublicBase(envBase)) {
    return envBase;
  }

  if (req && process.env.NODE_ENV !== "production") {
    const proto =
      req.headers.get("x-forwarded-proto")?.split(",")[0]?.trim() || "http";
    const host =
      req.headers.get("x-forwarded-host")?.split(",")[0]?.trim() ||
      req.headers.get("host")?.split(",")[0]?.trim() ||
      "";

    const requestBase = cleanBase(host ? `${proto}://${host}` : "");

    if (requestBase && !isBadPublicBase(requestBase)) {
      return requestBase;
    }
  }

  return "https://edulifeos.com";
}

export function buildPublicUrl(path: string, req?: Request) {
  const cleanPath = String(path || "/").startsWith("/")
    ? String(path || "/")
    : `/${path}`;

  return `${getPublicBaseUrl(req)}${cleanPath}`;
}
