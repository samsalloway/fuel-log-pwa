const WHOOP_API_BASE = "https://api.prod.whoop.com";

function corsHeaders(origin) {
  const allowed = new Set([
    "https://samhealthlog.netlify.app",
    "http://localhost:8888",
    "http://localhost:3000",
  ]);
  const allow = origin && allowed.has(origin) ? origin : "https://samhealthlog.netlify.app";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization",
    "Vary": "Origin",
  };
}

function isAllowedPath(path) {
  if (!path || typeof path !== "string") return false;
  if (!path.startsWith("/v2/")) return false;
  // Disallow anything suspicious: backslashes, protocol-relative, path traversal.
  if (path.includes("//") || path.includes("..") || path.includes("\\")) return false;
  return true;
}

exports.handler = async (event) => {
  const origin = event.headers?.origin || event.headers?.Origin;
  const headers = { ...corsHeaders(origin), "Content-Type": "application/json" };

  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers };
  if (event.httpMethod !== "GET") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "method_not_allowed" }) };
  }

  const auth = event.headers?.authorization || event.headers?.Authorization;
  if (!auth || !/^Bearer\s+\S+/i.test(auth)) {
    return { statusCode: 401, headers, body: JSON.stringify({ error: "missing_bearer_token" }) };
  }

  const qs = event.queryStringParameters || {};
  const path = qs.path;
  if (!isAllowedPath(path)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "invalid_path" }) };
  }

  // Forward all query params except "path" itself.
  const forward = new URLSearchParams();
  for (const [k, v] of Object.entries(qs)) {
    if (k === "path" || v == null) continue;
    forward.set(k, v);
  }
  const url = WHOOP_API_BASE + path + (forward.toString() ? "?" + forward.toString() : "");

  try {
    const res = await fetch(url, { method: "GET", headers: { Authorization: auth, Accept: "application/json" } });
    const text = await res.text();
    const passthroughHeaders = { ...headers };
    // Preserve rate-limit headers if Whoop sends them, to help the client back off.
    const rateHdrs = ["retry-after", "x-ratelimit-remaining", "x-ratelimit-reset", "x-ratelimit-limit"];
    for (const h of rateHdrs) {
      const v = res.headers.get(h);
      if (v != null) passthroughHeaders[h] = v;
    }
    return { statusCode: res.status, headers: passthroughHeaders, body: text };
  } catch (err) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: "upstream_failure", detail: String(err?.message || err) }) };
  }
};
