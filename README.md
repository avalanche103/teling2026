This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open the local URL printed by Next.js in the terminal to see the result.

## Google Analytics (GA4)

The app supports Google Analytics via `@next/third-parties/google`.

Add your GA4 Measurement ID to `.env.local`:

```bash
NEXT_PUBLIC_GA_ID=G-XXXXXXXXXX
```

Then restart the dev server (`npm run dev`).

## SSD Supplier App In Admin Panel

The project now exposes the supplier Flask app copied into this repository (`ssd-admin-app/`) as a separate internal tool at **/ssd**.

1. Install Python dependencies once:

```bash
npm run ssd:install
```

2. Start the supplier app from the project root:

```bash
npm run ssd:start
```

3. Open `/ssd` in this project.

Export output paths:

- JSON/CSV files: `ssd-admin-app/export/`
- Downloaded product images: `public/images/`

The SSD interface is available from the same site host via:

```text
/ssd
```

So it works under the same site host together with the main site, but on a separate route from the admin dashboard.

By default, the integration uses `http://127.0.0.1:5050`. Port `5000` is avoided because on Windows it is often occupied by another local service.
If you use a different host/port, set this in `.env.local`:

```bash
SSD_ADMIN_APP_URL=http://127.0.0.1:5050
```

For production deployment on the current hosting setup, the Next.js app is expected to listen on:

```text
127.0.0.1:10024
```

## Production Hosting

The current production startup script supports building directly on the server.

Default flow:

1. Upload the project files to the server.
2. Start the app with `start-production.sh`.
3. The script installs dependencies if `node_modules` is missing.
4. The script runs `next build` on the server before startup.

After the build is ready, the app starts on the hosting-provided `PORT`, or falls back to `10024` if the host does not inject one.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
