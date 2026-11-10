import { handleGenerateTheme } from "./generate-theme.ts";
import { handleGenerateOpenAITheme } from "./generate-theme_openai.ts";
import { handleLyricProxy } from "./lyric-proxy.ts";

type Env = {
  ASSETS: {
    fetch(request: Request): Promise<Response>;
  };
  GEMINI_API_KEY?: string;
  OPENAI_API_KEY?: string;
  OPENAI_API_URL?: string;
  OPENAI_API_MODEL?: string;
  OPENAI_API_TEMPERATURE?: string;
};

// Cloudflare 部署下 /api/* 全进 Worker（见 wrangler.jsonc），App 的 origin 是
// https://localhost，必须统一加 CORS 并放行 OPTIONS 预检，否则会被浏览器拦截。
// Vercel 版各函数自带 CORS 头，这里补齐 Worker 入口这一层。
const CORS_HEADERS: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

const withCors = (response: Response): Response => {
  const headers = new Headers(response.headers);
  // 仅补齐缺失的头：lyric-proxy 自带更完整的 CORS 配置，不能被覆盖
  for (const [key, value] of Object.entries(CORS_HEADERS)) {
    if (!headers.has(key)) headers.set(key, value);
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
};

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS" && url.pathname.startsWith("/api/")) {
      return new Response(null, { status: 204, headers: CORS_HEADERS });
    }

    if (url.pathname === "/api/generate-theme") {
      return withCors(await handleGenerateTheme(request, env));
    }

    if (url.pathname === "/api/generate-theme_openai") {
      return withCors(await handleGenerateOpenAITheme(request, env));
    }

    if (url.pathname === "/api/lyric-proxy") {
      return withCors(await handleLyricProxy(request));
    }

    return env.ASSETS.fetch(request);
  },
};
