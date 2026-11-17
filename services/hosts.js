// Picks the public subdomain for an app: <repo>.<APP_DOMAIN>.
// A user keeps their previous host; if another user already owns the name, fall back to <repo>-<user>.
const RESERVED = new Set(['www', 'deploy', 'mail', 'api', 'admin', 'ftp', 'smtp', 'ns1', 'ns2', 'localhost']);

function normalizeDomain(d) {
  return String(d || '').trim().toLowerCase().replace(/^\.+|\.+$/g, '');
}

function pickHost({ appName, userSlug, domain, login, previous, ownerOf }) {
  const dom = normalizeDomain(domain);
  if (!dom) return null;
  const label = RESERVED.has(appName) ? `${appName}-app` : appName;
  const candidates = [
    previous,
    `${label}.${dom}`,
    `${label.slice(0, 30)}-${userSlug.slice(0, 30)}.${dom}`, // always unique per user
  ].filter(Boolean);
  return candidates.find((h) => { const o = ownerOf(h); return !o || o === login; }) || candidates[candidates.length - 1];
}

module.exports = { pickHost, normalizeDomain, RESERVED };
