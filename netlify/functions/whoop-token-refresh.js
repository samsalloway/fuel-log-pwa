const WHOOP_TOKEN_URL = "https://api.prod.whoop.com/oauth/oauth2/token";

function corsHeaders(origin) {
  const allowed = new Set([
    "https://samhealthlog.netlify.app",
    "http://localhost:8888",
    "http://localhost:3000",
  ]);
  const allow = origin && allowed.has(origin) ? origin : "https://samhealthlog.netlify.app";
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin",
  };
}

async function exchange(form) {
  const res = await fetch(WHOOP_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: form.toString(),
  });
  const text = await res.text();
  return { status: res.status, ok: res.ok, text };
}

exports.handler = async (event) => {
  const origin = event.headers?.origin || event.headers?.Origin;
  const headers = { ...corsHeaders(origin), "Content-Type": "application/json" };

  if (event.httpMethod === "OPTIONS") return { statusCode: 204, headers };
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers, body: JSON.stringify({ error: "method_not_allowed" }) };
  }

  const clientId = process.env.WHOOP_CLIENT_ID;
  const clientSecret = process.env.WHOOP_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: "server_not_configured" }) };
  }

  let body;
  try { body = JSON.parse(event.body || "{}"); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: "invalid_json" }) }; }

  const { refresh_token, scope } = body;
  if (!refresh_token) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "missing_refresh_token" }) };
  }

  const base = new URLSearchParams();
  base.set("grant_type", "refresh_token");
  base.set("refresh_token", refresh_token);
  base.set("client_id", clientId);
  base.set("client_secret", clientSecret);

  // First attempt: include scope (Whoop docs list it as required).
  const withScope = new URLSearchParams(base);
  if (scope) withScope.set("scope", scope);

  try {
    let r = await exchange(withScope);
    // Some providers reject unknown scope on refresh; retry once without it.
    if (!r.ok && scope) {
      r = await exchange(base);
    }
    if (!r.ok) {
      return { statusCode: r.status === 401 ? 401 : 502, headers, body: JSON.stringify({ error: "whoop_refresh_error", status: r.status, detail: r.text.slice(0, 500) }) };
    }
    return { statusCode: 200, headers, body: r.text };
  } catch (err) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: "upstream_failure", detail: String(err?.message || err) }) };
  }
};
