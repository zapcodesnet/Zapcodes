/**
 * ZapCodes Subdomain Worker v2
 *
 * Routes *.zapcodes.net requests:
 * - preview-*.zapcodes.net  → Guest site preview (new)
 * - *.zapcodes.net          → Deployed user sites (existing, unchanged)
 *
 * SETUP (unchanged from v1):
 * 1. Cloudflare DNS: AAAA * → 100:: (proxied)
 * 2. Worker route: *.zapcodes.net/*
 * 3. Exclusion routes (service: none) for: api.*, www.*, zapcodes.net
 * 4. Env var: BACKEND_API_URL = https://api.zapcodes.net
 */

const EXCLUDED_SUBDOMAINS = [
  'www', 'api', 'app', 'admin', 'mail', 'ftp', 'cdn', 'dev',
  'staging', 'test', 'blog', 'docs', 'status', 'support', 'help',
];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const hostname = url.hostname;
    const parts = hostname.split('.');

    if (parts.length < 3) return new Response('Not found', { status: 404 });

    const subdomain = parts[0].toLowerCase();
    if (EXCLUDED_SUBDOMAINS.includes(subdomain)) return new Response('Not found', { status: 404 });

    const backendUrl = (env.BACKEND_API_URL || 'https://api.zapcodes.net');

    // ── Route: preview-* subdomains → guest site endpoint ─────────────────
    if (subdomain.startsWith('preview-')) {
      return serveGuestSite(subdomain, backendUrl);
    }

    // ── Route: all other subdomains → deployed user sites (unchanged) ──────
    return serveDeployedSite(subdomain, backendUrl);
  },
};

// ── Guest site serving ─────────────────────────────────────────────────────
async function serveGuestSite(subdomain, backendUrl) {
  const apiUrl = `${backendUrl}/api/guest/site/${subdomain}?raw=1`;
  try {
    const response = await fetch(apiUrl, {
      headers: { 'User-Agent': 'ZapCodes-SubdomainWorker/2.0', 'Accept': 'text/html' },
      cf: { cacheTtl: 60, cacheEverything: true }, // Short cache for guest previews
    });

    if (response.status === 410 || response.status === 404) {
      // Site expired or not found
      const isExpired = response.status === 410;
      return new Response(getExpiredHTML(subdomain, isExpired), {
        status: isExpired ? 410 : 404,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    if (!response.ok) {
      return new Response(getErrorHTML(subdomain, `Status ${response.status}`), {
        status: 502,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    const html = await response.text();
    return new Response(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=60',
        'X-Powered-By': 'ZapCodes',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err) {
    return new Response(getErrorHTML(subdomain, err.message), {
      status: 502,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }
}

// ── Deployed user site serving (unchanged logic from v1) ──────────────────
async function serveDeployedSite(subdomain, backendUrl) {
  const apiUrl = `${backendUrl}/api/build/site-preview/${subdomain}`;
  try {
    const response = await fetch(apiUrl, {
      headers: { 'User-Agent': 'ZapCodes-SubdomainWorker/2.0', 'Accept': 'text/html' },
      cf: { cacheTtl: 300, cacheEverything: true },
    });

    if (!response.ok) {
      return new Response(getNotFoundHTML(subdomain), {
        status: 404,
        headers: { 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    const html = await response.text();
    return new Response(html, {
      status: 200,
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'public, max-age=300',
        'X-Powered-By': 'ZapCodes',
        'Access-Control-Allow-Origin': '*',
      },
    });
  } catch (err) {
    return new Response(getErrorHTML(subdomain, err.message), {
      status: 502,
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    });
  }
}

// ── HTML pages ─────────────────────────────────────────────────────────────
function getExpiredHTML(subdomain, isExpired) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${isExpired ? 'Preview Expired' : 'Not Found'} — ZapCodes</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{min-height:100vh;display:flex;align-items:center;justify-content:center;background:#07090B;color:#F0F4F8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
    .wrap{text-align:center;padding:40px;max-width:520px}
    .icon{font-size:56px;margin-bottom:20px}
    h1{font-size:26px;margin-bottom:12px;color:#00E5A0}
    p{color:#7A8EA0;line-height:1.6;margin-bottom:24px}
    .sub{font-family:monospace;background:rgba(0,229,160,.1);color:#00E5A0;padding:2px 8px;border-radius:4px}
    a{display:inline-flex;align-items:center;gap:6px;padding:12px 28px;background:#00E5A0;color:#07090B;text-decoration:none;border-radius:10px;font-weight:700;transition:opacity .2s}
    a:hover{opacity:.85}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="icon">${isExpired ? '⏰' : '🔍'}</div>
    <h1>${isExpired ? 'This preview has expired' : 'Site not found'}</h1>
    <p>${isExpired ? `The site <span class="sub">${subdomain}.zapcodes.net</span> was a free guest preview that expired after 7 days.` : `The site <span class="sub">${subdomain}.zapcodes.net</span> doesn't exist yet.`}</p>
    <a href="https://zapcodes.net">⚡ Build Your Free Site at ZapCodes →</a>
  </div>
</body>
</html>`;
}

function getNotFoundHTML(subdomain) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Site Not Found — ZapCodes</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{min-height:100vh;display:flex;align-items:center;justify-content:center;background:#07090B;color:#F0F4F8;font-family:-apple-system,sans-serif}
    .wrap{text-align:center;padding:40px;max-width:500px}
    .icon{font-size:64px;margin-bottom:20px}
    h1{font-size:28px;margin-bottom:12px;background:linear-gradient(135deg,#6366f1,#8b5cf6);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
    p{color:#888;line-height:1.6;margin-bottom:24px}
    .sub{font-family:monospace;background:rgba(99,102,241,.15);color:#818cf8;padding:2px 8px;border-radius:4px}
    a{display:inline-block;padding:12px 28px;background:linear-gradient(135deg,#6366f1,#8b5cf6);color:#fff;text-decoration:none;border-radius:10px;font-weight:600}
  </style>
</head>
<body>
  <div class="wrap">
    <div class="icon">🔍</div>
    <h1>Site Not Found</h1>
    <p>The site <span class="sub">${subdomain}.zapcodes.net</span> doesn't exist yet or has been removed.</p>
    <a href="https://zapcodes.net">Build Your Own Site with ZapCodes</a>
  </div>
</body>
</html>`;
}

function getErrorHTML(subdomain, error) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Loading Error — ZapCodes</title>
  <style>
    *{margin:0;padding:0;box-sizing:border-box}
    body{min-height:100vh;display:flex;align-items:center;justify-content:center;background:#07090B;color:#F0F4F8;font-family:-apple-system,sans-serif}
    .wrap{text-align:center;padding:40px;max-width:500px}
    h1{font-size:24px;margin-bottom:12px}
    p{color:#888;line-height:1.6}
    .retry{display:inline-block;margin-top:20px;padding:10px 24px;background:#6366f1;color:#fff;text-decoration:none;border-radius:8px;cursor:pointer;border:none;font-size:14px}
  </style>
</head>
<body>
  <div class="wrap">
    <h1>⚡ Temporarily Unavailable</h1>
    <p>The site <strong>${subdomain}.zapcodes.net</strong> is experiencing a momentary issue. Please try again in a few seconds.</p>
    <button class="retry" onclick="location.reload()">Retry</button>
  </div>
</body>
</html>`;
}
