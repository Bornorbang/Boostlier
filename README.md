# Boostlier

Boostlier frontend built with Next.js, React and TypeScript.

Import this repository into Vercel using the repository root and the Next.js preset.
Vercel installs dependencies with `npm ci` and builds with `npm run build`.

Set these environment variables in Vercel before deploying:

- `NEXT_PUBLIC_SITE_URL`: your frontend HTTPS URL, without a trailing slash.
- `BACKEND_URL`: your separately hosted PHP API HTTPS URL, without a trailing slash.
- `BACKEND_PROXY_SECRET`: the same private shared secret configured on the backend.
- `IP_GEOLOCATION_PROVIDER`: `vercel`.

The backend is hosted separately on cPanel and is not included in this repository.
Provider credentials and database credentials belong on the backend only.

For local development, copy `.env.example` to `.env.local`, configure the API URL,
then run `npm ci` and `npm run dev`.

Run `npm run check` and `npm run build` to verify the frontend.
