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

function isAllowedRedirect(uri, envRedirect) {
  if (!uri || typeof uri !== "string") return false;
  if (envRedirect && uri === envRedirect) return true;
  if (uri === "http://localhost:8888/whoop-callback") return true;
  if (uri === "http://localhost:3000/whoop-callback") return true;
  return false;
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
  const envRedirect = process.env.WHOOP_REDIRECT_URI;
  if (!clientId || !clientSecret) {
    return { statusCode: 500, headers, body: JSON.stringify({ error: "server_not_configured" }) };
  }

  let body;
  try { body = JSON.parse(event.body || "{}"); }
  catch { return { statusCode: 400, headers, body: JSON.stringify({ error: "invalid_json" }) }; }

  const { code, redirect_uri } = body;
  if (!code || !redirect_uri) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "missing_params" }) };
  }
  if (!isAllowedRedirect(redirect_uri, envRedirect)) {
    return { statusCode: 400, headers, body: JSON.stringify({ error: "redirect_uri_not_allowed" }) };
  }

  const form = new URLSearchParams();
  form.set("grant_type", "authorization_code");
  form.set("code", code);
  form.set("client_id", clientId);
  form.set("client_secret", clientSecret);
  form.set("redirect_uri", redirect_uri);

  try {
    const res = await fetch(WHOOP_TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: form.toString(),
    });
    const text = await res.text();
    if (!res.ok) {
      return { statusCode: 502, headers, body: JSON.stringify({ error: "whoop_token_error", status: res.status, detail: text.slice(0, 500) }) };
    }
    return { statusCode: 200, headers, body: text };
  } catch (err) {
    return { statusCode: 502, headers, body: JSON.stringify({ error: "upstream_failure", detail: String(err?.message || err) }) };
  }
};
