/**
 * Normalises a Host header value: lowercase, strip port and trailing dot, reject anything that
 * isn't a syntactically valid hostname (prevents cache poisoning with odd header values).
 */
const HOSTNAME = /^(?=.{1,253}$)([a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)(\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/;
const IPV4 = /^\d{1,3}(\.\d{1,3}){3}$/;

export function normaliseHost(raw: string | undefined | null): string | null {
  if (!raw) return null;
  let host = raw.trim().toLowerCase();
  if (host.startsWith('[')) return null; // IPv6 literals are not tenant hostnames
  host = host.replace(/:\d+$/, '').replace(/\.$/, '');
  if (IPV4.test(host)) return host;
  return HOSTNAME.test(host) ? host : null;
}
