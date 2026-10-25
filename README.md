# Boostlier

Next.js frontend. Import this repository into Vercel with Root Directory `.` and framework Next.js.

Install: `npm ci`
Build: `npm run build`
Development: `npm run dev`

Configure Vercel environment variables:

```dotenv
NEXT_PUBLIC_SITE_URL=https://boostlier.com
BACKEND_URL=https://app.boostlier.com
BACKEND_PROXY_SECRET=YOUR_RANDOM_SHARED_SECRET
IP_GEOLOCATION_PROVIDER=vercel
```

The backend is hosted separately on cPanel. Its document root must point to `backend/public`.
Use the same private shared secret on both hosts. Provider and database credentials stay on cPanel.
