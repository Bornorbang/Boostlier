# Boostlier

The local project has two independent applications:

- `frontend/`: Next.js website, UI, public assets, frontend environment and Node dependencies.
- `backend/`: PHP API, Composer dependencies, migrations, provider integrations and private storage.

Only the frontend is tracked in this GitHub repository. The backend stays local for separate cPanel deployment.

## Frontend

Run commands from `frontend/`:

```sh
cd frontend
npm ci
npm run dev
```

Copy `.env.example` to `.env.local` and configure the separately hosted API.
Verify with `npm run check` and `npm run build`.

## Vercel

Set **Root Directory** to **frontend**, framework **Next.js**. Use `npm ci` to install and `npm run build` to build.

Configure these environment variables:

- `NEXT_PUBLIC_SITE_URL`: frontend HTTPS URL, without a trailing slash.
- `BACKEND_URL`: PHP API HTTPS URL, without a trailing slash.
- `BACKEND_PROXY_SECRET`: same private shared secret as the backend.
- `IP_GEOLOCATION_PROVIDER`: `vercel`.

Provider and database credentials stay on the separately hosted backend.
