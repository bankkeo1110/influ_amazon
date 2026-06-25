# BadmintonDN — Tìm bạn & sân cầu lông Đà Nẵng

A community board for finding badminton partners and open courts in Đà Nẵng.
Built with Next.js (App Router) + Prisma. UI follows "Option A": a chronological
feed with tabs, search, and a floating "Đăng bài" button.

## Why no Facebook auto-scraping

Automatically scraping Facebook groups violates Facebook's Terms of Service
and gets accounts/IPs blocked quickly — it's not something this app does.
Instead:

1. **Users post directly** on the app (main flow).
2. **Manual "save from Facebook" flow**: when posting, there's an optional
   "Link bài Facebook gốc" field — if you (or any user) sees a good post in
   a Facebook group, you can manually copy the post link + details into the
   form. This keeps a human in the loop and stays within FB's rules.
3. You (as admin) can seed the app early by manually copying interesting
   posts in, and sharing the app link inside the Facebook groups to
   bootstrap real users.

## Local setup

```bash
cd badminton-app
npm install
cp .env.example .env
npx prisma migrate dev --name init
npm run seed        # optional: adds 3 sample posts
npm run dev
```

Visit http://localhost:3000

## Project structure

```
src/
  app/
    page.tsx                 — main feed (Option A UI)
    layout.tsx
    globals.css
    api/posts/route.ts       — GET (list+filter), POST (create)
    api/posts/[id]/route.ts  — PATCH (update status/players), DELETE
  components/
    PostCard.tsx
    CreatePostModal.tsx
  lib/
    prisma.ts                — Prisma client singleton
    constants.ts             — labels, types, areas
prisma/
  schema.prisma              — Post model (SQLite by default)
  seed.js
```

## Data model

`Post`: type (`FIND_PARTNER` | `COURT`), title, area, location, date, time,
skillLevel (`Y`/`TBY`/`TB`/`TBK`/`K`/`T`/`ANY` — standard VN badminton scale),
playersNeeded/playersCurrent, pricePerHour (for court posts), contactName,
contactPhone, notes, sourceUrl (optional FB link), status.

## Deploying to a free host

SQLite files don't persist on serverless platforms (Vercel resets the
filesystem on every deploy/cold start), so for production swap to a free
Postgres database:

1. Create a free Postgres DB — easiest options:
   - **Neon** (https://neon.tech) — generous free tier, made for serverless
   - **Supabase** (https://supabase.com)
   - **Railway** (https://railway.app)
2. In `prisma/schema.prisma`, change:
   ```prisma
   datasource db {
     provider = "postgresql"
     url      = env("DATABASE_URL")
   }
   ```
3. Set `DATABASE_URL` to your Postgres connection string (in Vercel:
   Project Settings → Environment Variables).
4. Run `npx prisma migrate deploy` once against the new database
   (locally, pointed at the prod `DATABASE_URL`, or via a one-off CI step).
5. Deploy:
   - **Vercel** (recommended, free tier): `vercel` CLI or connect the
     GitHub repo at vercel.com — it auto-detects Next.js.
   - **Render** free web service also works and *does* support a
     persistent disk if you'd rather keep SQLite — attach a disk and
     point `DATABASE_URL` at `file:/data/prod.db`.

## Next steps you might want

- Phone-number OTP or simple passwordless login before posting (currently
  anyone can post — fine for a small community, but add moderation/auth
  before it scales).
- "Mark as filled" / delete buttons on your own posts (API already
  supports `PATCH`/`DELETE` on `/api/posts/[id]`, just needs UI wiring
  and a way to identify "your" posts — e.g. a local-storage secret token
  per post).
- Push/Zalo notifications when a new post matches saved filters.
