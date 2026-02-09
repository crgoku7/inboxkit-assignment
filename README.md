
# Shared Grid

A real-time, multi-user shared grid where blocks can be claimed and synced live across all connected clients. Ownership is enforced server-side via Convex mutations and streamed to every client through live queries.

## Tech stack

- Next.js (App Router)
- React
- Convex (real-time backend)
- Clerk (authentication)
- TypeScript
- Tailwind CSS (base layer + custom CSS)

## Quick start

1. Install dependencies

```bash
npm install
```

2. Configure environment variables

Create a `.env.local` file in the project root:

```
NEXT_PUBLIC_CONVEX_URL=YOUR_CONVEX_DEPLOYMENT_URL
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=YOUR_PUBLISHABLE_KEY
CLERK_SECRET_KEY=YOUR_SECRET_KEY
CLERK_JWT_ISSUER_DOMAIN=YOUR_ISSUER_DOMAIN
```

3. Start Convex in development

```bash
npx convex dev
```

4. Start the Next.js dev server

```bash
npm run dev
```

Open http://localhost:3000

## Notes

- In Clerk, create a JWT template named `convex` and set `CLERK_JWT_ISSUER_DOMAIN` to the template's issuer URL.
- Convex codegen runs automatically when you start `npx convex dev`.

