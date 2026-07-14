---
name: next-subpath-cache-triage
description: Diagnose Next.js apps deployed under a subpath behind nginx, BaoTa proxy cache, and Alibaba Cloud ESA/CDN. Use when pages show network errors, API requests miss the basePath, Next responses include x-nextjs-prerender or stale Cache-Control, or deployment works through 127.0.0.1 but fails through nginx/ESA.
---

# Next Subpath Cache Triage

## When To Use

Use this skill for production-only web failures involving:

- Next.js deployed under a subpath such as `/wzry`.
- Client requests incorrectly going to `/api/...` instead of `/wzry/api/...`.
- Alibaba Cloud ESA/CDN, nginx, or BaoTa proxy cache returning stale HTML/JS.
- `next start` returning 502 because `.next` is missing or PM2 is unhealthy.
- Headers such as `x-nextjs-prerender: 1`, `x-nextjs-cache: HIT`, `Server: ESA`, or `x-site-cache-status`.

## Triage Order

Do not assume CDN first. Prove which layer is stale or broken.

1. Check the app process:

```bash
pm2 status
pm2 logs <app-name> --lines 100
ss -lntp | grep 3000
```

If PM2 is `errored` and logs say `.next` is missing, run a production build before `next start`.

2. Compare direct Next, local nginx, and public ESA:

```bash
curl -I http://127.0.0.1:3000/wzry/hero-power
curl -I -H "Host: www.example.com" http://127.0.0.1/wzry/hero-power
curl -I https://www.example.com/wzry/hero-power
```

Interpretation:

- Direct Next bad: fix app build/runtime first.
- Direct Next good, local nginx bad: nginx/proxy cache or wrong upstream.
- Local nginx good, public domain bad: ESA/CDN cache or rule issue.

3. Check API paths independently:

```bash
curl -I https://www.example.com/wzry/api/hero-power/heroes
curl -I https://www.example.com/api/hero-power/heroes
```

The correct subpath API should be `200`. The root `/api` may be `502`; if old JS still calls it, add a temporary nginx compatibility proxy.

## Header Signals

Use headers to identify the culprit:

- `Server: ESA`, `Via: ens-cache...`, `EagleId`: response passed through Alibaba Cloud ESA.
- `x-site-cache-status: HIT`: ESA served cached content.
- `x-site-cache-status: DYNAMIC`: ESA passed through, but upstream may still be cached.
- `x-nextjs-prerender: 1` and `x-nextjs-cache: HIT`: Next served a prerendered/static cached page.
- `Cache-Control: s-maxage=31536000`: long-lived cache likely unsafe for dynamic HTML.
- `Cache-Control: no-store, no-cache, must-revalidate, proxy-revalidate`: desired for dynamic pages/API.
- `Age` or `x-swift-cachetime`: CDN object age/cache lifetime.

## Fix Base Path Bugs

For Next apps mounted under `/wzry`, client fetches must use the base path.

Use a shared helper such as `withBasePath("/api/...")`. Ensure it can resolve basePath from:

- server-injected value such as `window.__WZRY_BASE_PATH__`;
- build/runtime env such as `NEXT_BASE_PATH=/wzry`;
- browser URL or `_next` script paths as fallback.

When verifying in browser Network, the page should request:

```text
https://www.example.com/wzry/api/...
```

not:

```text
https://www.example.com/api/...
```

## Fix Next Static HTML Cache

If direct Next returns `x-nextjs-prerender: 1` for a page that must not be cached, force the route dynamic.

For a route segment such as `src/app/hero-power`, add a server layout:

```tsx
import type { ReactNode } from "react";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function HeroPowerLayout({ children }: { children: ReactNode }) {
  return children;
}
```

Rebuild and restart:

```bash
NEXT_BASE_PATH=/wzry npm run build
pm2 restart <app-name> --update-env
```

Verify direct Next no longer returns `x-nextjs-prerender: 1`.

## Fix nginx/BaoTa Proxy Cache

If direct Next is good but local nginx still returns old headers, inspect nginx config:

```bash
nginx -T | grep -nE "server_name|proxy_pass|proxy_cache|wzry|hero-power"
```

BaoTa often sets global proxy cache:

```nginx
proxy_cache_path /www/server/nginx/proxy_cache_dir ...;
proxy_cache cache_one;
```

Disable cache for the app location:

```nginx
location /wzry {
    proxy_pass http://127.0.0.1:3000;

    proxy_cache off;
    proxy_no_cache 1;
    proxy_cache_bypass 1;

    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

Clear old proxy cache and reload:

```bash
rm -rf /www/server/nginx/proxy_cache_dir/*
nginx -t && nginx -s reload
```

## Temporary Compatibility Proxy

If old cached JS still calls `/api/...`, add a temporary root API proxy:

```nginx
location /api/ {
    proxy_pass http://127.0.0.1:3000/wzry/api/;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
}
```

Remove it after old client chunks are no longer in use, unless root `/api` is intentionally supported.

## ESA Rules

Keep ESA caching for hashed static assets:

```text
/wzry/_next/static/*
```

Do not cache dynamic APIs and pages:

```text
/wzry/api/* -> bypass cache
/wzry/hero-power -> bypass cache
/wzry/leaderboard -> bypass cache, if data changes often
```

If ESA still serves old content after the source is fixed, purge with direct delete if available:

```text
https://www.example.com/wzry/hero-power
https://www.example.com/wzry/
https://www.example.com/wzry/_next/static/chunks/
```

## Low-Memory Build Failures

If `npm run build` is killed and `dmesg` shows OOM:

```bash
free -h
dmesg -T | tail -50
```

Mitigations:

- Stop the app before building: `pm2 stop <app-name>`.
- Add swap if the server has about 2 GB RAM.
- For Next 16, try Webpack build: `npx next build --webpack`.
- Prefer building on a larger machine/CI and deploying `.next` when the server is too small.

## Final Verification Checklist

Before calling the incident resolved:

- `pm2 status` is online.
- `ss -lntp | grep 3000` shows Next listening.
- Direct Next returns `200` and `Cache-Control: no-store` for dynamic pages.
- Local nginx returns the same cache headers as direct Next.
- Public ESA returns `Server: ESA`, `x-site-cache-status: DYNAMIC`, and `Cache-Control: no-store` for dynamic pages/API.
- Browser Network shows `/wzry/api/...` requests returning `200`.
- The page no longer displays "网络错误".
