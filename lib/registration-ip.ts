// Portable across Workers and Node. Never interpret an arbitrary forwarding chain.
export function normalizeIp(raw: string | null): string | null {
  if (!raw || raw !== raw.trim() || raw.length > 45) return null;
  if (/^\d+\.\d+\.\d+\.\d+$/.test(raw)) {
    const parts = raw.split(".");
    return parts.every((p) => /^(0|[1-9]\d{0,2})$/.test(p) && Number(p) <= 255)
      ? parts.map(Number).join(".")
      : null;
  }
  if (!raw.includes(":") || !/^[a-fA-F0-9:.]+$/.test(raw)) return null;
  try {
    const host = new URL(`http://[${raw}]/`).hostname
      .slice(1, -1)
      .toLowerCase();
    const mapped = host.match(/^::ffff:([a-f0-9]{1,4}):([a-f0-9]{1,4})$/);
    if (mapped) {
      const a = parseInt(mapped[1], 16),
        b = parseInt(mapped[2], 16);
      return [a >> 8, a & 255, b >> 8, b & 255].join(".");
    }
    return host;
  } catch {
    return null;
  }
}

export function registrationIp(req: Request): string | null {
  // nginx mode requires a private app port and an edge that OVERWRITES this header.
  // cloudflare mode is only for a Worker receiving the platform-managed header.
  const mode = process.env.MELON_CLIENT_IP_SOURCE;
  return normalizeIp(
    mode === "nginx"
      ? req.headers.get("x-forwarded-for")
      : mode === "cloudflare"
        ? req.headers.get("cf-connecting-ip")
        : null,
  );
}
