export function officialWebsiteDomain(rawUrl: string) {
  const url = new URL(rawUrl);
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
    throw new Error("Invalid official website URL");
  }

  const hostname = url.hostname.toLowerCase().replace(/^www\./, "");
  if (
    !hostname.includes(".")
    || hostname.endsWith(".local")
    || !/^[a-z0-9.-]+$/.test(hostname)
    || /^\d{1,3}(?:\.\d{1,3}){3}$/.test(hostname)
  ) {
    throw new Error("Invalid official website domain");
  }
  return hostname;
}

export function sourceBelongsToDomain(rawUrl: string, domain: string) {
  try {
    const hostname = new URL(rawUrl).hostname.toLowerCase().replace(/^www\./, "");
    return hostname === domain || hostname.endsWith(`.${domain}`);
  } catch {
    return false;
  }
}
