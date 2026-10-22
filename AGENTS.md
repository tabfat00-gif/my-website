# AGENTS.md — BEXO project rules (repo-local)

This repo is the live BEXO website (`https://tabfat00-gif.github.io/my-website/`), published
from `main` via GitHub Pages. It is a **static** site: HTML/CSS/JS on Bootstrap 5, with
Supabase (`ulxreyrjtavflppahqlp`) as the backend.

The full BEXO content-publishing contract lives in `/home/kalimoh/AGENTS.md`. The rules
below are the repo-local short version — follow both.

## Content
- Content lives in Supabase, **not** in this repo. Do not add article/book rows to JSON or
  hardcode content into HTML. `blog.html`, `blog-details.html`, `software.html`, `search.html`
  and `index.html` all read from Supabase at runtime.
- `articles`: `title`, `description`, `content`, `category`, `image_url`, `is_published`.
  `blog.html` shows only `is_published = true`. `image_url` may be null — the page falls back
  to `assets/images/blog/blog-01.jpg`.
- `software` (also used for books): `title`, `description`, `download_url`, `category`,
  `image_url`, `is_premium`. Books use `category = "Books"`.
- Live article categories: `Technology`, `Cybersecurity`, `Software`. Live software
  categories: `Windows`, `Linux`, `Android`, `Tools`, `Books`.

## Publishing
- The only authorized write path is: authenticated admin session → `db.rpc("is_admin")` must
  return `true` → `db.from("articles"|"software").insert(...)`.
- The publishable key committed in these pages has **no INSERT grant** on those tables.
  Do not "fix" that by adding a `service_role` key — it would bypass RLS and leak a secret.
- Publishing a record requires the user's explicit `OK` for that exact item, one item at a time.
  Verify by reading the row back and checking the public page/query afterwards.
- Use the publisher CLI at `/home/kalimoh/bexo-publisher/` (outside this repo) for writes.

## Git
- Do **not** `git add`, `commit`, `push`, or change production settings without a separate
  explicit permission from the user.
- `supabase/.temp/` is untracked and must stay untracked.
- `.github/workflows/bexo-seo.yml` validates SEO metadata of the static pages on push; keep
  `<title>`, meta description, exactly one `<h1>`, the canonical URL and the `noindex` rules
  intact when editing a page.
