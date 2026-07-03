const GITHUB_API = "https://api.github.com";

const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Max-Age": "86400",
};

const JSON_HEADERS = {
  "Accept": "application/vnd.github+json",
  "User-Agent": "llmwebsite-proxy",
};

function jsonResponse(body, status, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      ...CORS_HEADERS,
      ...extraHeaders,
    },
  });
}

async function handleRequest(request, env) {
  if (request.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }

  if (request.method !== "GET") {
    return jsonResponse({ error: "Method not allowed" }, 405);
  }

  const url = new URL(request.url);
  const path = url.pathname;
  const query = url.search;

  if (!path.startsWith("/repos/")) {
    return jsonResponse({ error: "Only /repos/* is proxied" }, 403);
  }

  const githubUrl = `${GITHUB_API}${path}${query}`;

  const headers = { ...JSON_HEADERS };
  if (env.GITHUB_TOKEN) {
    headers["Authorization"] = `Bearer ${env.GITHUB_TOKEN}`;
  }

  let githubResponse;
  try {
    githubResponse = await fetch(githubUrl, { headers });
  } catch (err) {
    return jsonResponse({ error: "Upstream fetch failed" }, 502);
  }

  const body = await githubResponse.text();

  const passthroughHeaders = {};
  for (const name of [
    "X-RateLimit-Limit",
    "X-RateLimit-Remaining",
    "X-RateLimit-Reset",
    "X-RateLimit-Used",
  ]) {
    const value = githubResponse.headers.get(name);
    if (value !== null) {
      passthroughHeaders[name] = value;
    }
  }

  return new Response(body, {
    status: githubResponse.status,
    headers: {
      "Content-Type":
        githubResponse.headers.get("Content-Type") ||
        "application/json; charset=utf-8",
      ...CORS_HEADERS,
      ...passthroughHeaders,
    },
  });
}

export default {
  fetch: handleRequest,
};