/**
 * ZapCodes Subdomain Worker
 * 
 * Routes *.zapcodes.net requests to the backend API to serve deployed sites.
 * 
 * SETUP INSTRUCTIONS:
 * 1. In Cloudflare DNS, add a proxied wildcard record:
 *    Type: AAAA | Name: * | Content: 100:: | Proxy: ON (orange cloud)
 * 2. Create a Worker in Cloudflare dashboard (Workers & Pages > Create)
 * 3. Paste this code into the Worker editor
 * 4. Add a Route: *.zapcodes.net/* → this worker
 * 5. Add exclusion routes (service: none) for subdomains you DON'T want routed:
 *    - api.zapcodes.net/*  (your backend API)
 *    - www.zapcodes.net/*  (your main site)
 *    - zapcodes.net/*      (root domain)
 * 
 * ENVIRONMENT VARIABLES (set in Worker Settings > Variables):
 *    BACKEND_API_URL = https://api.zapcodes.net  (your Render backend URL)
 */

const EXCLUDED_SUBDOMAINS = [
  'www', 'api', 'app', 'admin', 'mail', 'ftp', 'cdn', 'dev',
  'staging', 'test', 'blog', 'docs', 'status', 'support', 'help',
];

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const hostname = url.hostname;

    // Extract subdomain from hostname (e.g., "nursetools" from "nursetools.zapcodes.net")
    const parts = hostname.split('.');
    if (parts.length < 3) {
      // Not a subdomain request — pass through
      return new Response('Not found', { status: 404 });
    }
    const subdomain = parts[0].toLowerCase();

    // Skip excluded subdomains
    if (EXCLUDED_SUBDOMAINS.includes(subdomain)) {
      return new Response('Not found', { status: 404 });
    }

    // Fetch site HTML from the backend API
    const backendUrl = (env.BACKEND_API_URL || 'https://api.zapcodes.net');
    const apiUrl = `${backendUrl}/api/build/site-preview/${subdomain}`;

    try {
      const response = await fetch(apiUrl, {
        headers: {
          'User-Agent': 'ZapCodes-SubdomainWorker/1.0',
          'Accept': 'text/html',
        },
        cf: {
          // Cache at Cloudflare edge for 5 minutes
          cacheTtl: 300,
          cacheEverything: true,
        },
      });

      if (!response.ok) {
        // Site not found — show a friendly error page
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
  },
};

function getNotFoundHTML(subdomain) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Site Not Found — ZapCodes</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #0a0a1a; color: #fff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    .container { text-align: center; padding: 40px; max-width: 500px; }
    .icon { font-size: 64px; margin-bottom: 20px; }
    h1 { font-size: 28px; margin-bottom: 12px; background: linear-gradient(135deg, #6366f1, #8b5cf6); -webkit-background-clip: text; -webkit-text-fill-color: transparent; }
    p { color: #888; line-height: 1.6; margin-bottom: 24px; }
    .subdomain { font-family: monospace; background: rgba(99,102,241,.15); color: #818cf8; padding: 2px 8px; border-radius: 4px; }
    a { display: inline-block; padding: 12px 28px; background: linear-gradient(135deg, #6366f1, #8b5cf6); color: #fff; text-decoration: none; border-radius: 10px; font-weight: 600; transition: opacity .2s; }
    a:hover { opacity: .85; }
  </style>
</head>
<body>
  <div class="container">
    <div class="icon">🔍</div>
    <h1>Site Not Found</h1>
    <p>The site <span class="subdomain">${subdomain}.zapcodes.net</span> doesn't exist yet or has been removed.</p>
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
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #0a0a1a; color: #fff; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    .container { text-align: center; padding: 40px; max-width: 500px; }
    h1 { font-size: 24px; margin-bottom: 12px; }
    p { color: #888; line-height: 1.6; }
    .retry { display: inline-block; margin-top: 20px; padding: 10px 24px; background: #6366f1; color: #fff; text-decoration: none; border-radius: 8px; cursor: pointer; border: none; font-size: 14px; }
  </style>
</head>
<body>
  <div class="container">
    <h1>⚡ Temporarily Unavailable</h1>
    <p>The site <strong>${subdomain}.zapcodes.net</strong> is experiencing a momentary issue. Please try again in a few seconds.</p>
    <button class="retry" onclick="location.reload()">Retry</button>
  </div>
</body>
</html>`;
}
