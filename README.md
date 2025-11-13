# SAE Visitor MVP (Vercel + Supabase)

This is a minimal, functional web app you can deploy for free. It stores records and uploads files to Supabase and exposes a single public form for QR access.

## What you need
- Supabase account (free)
- Vercel account (free)
- A Google Chrome browser

## 1) Create Supabase project
1. Go to https://supabase.com -> Sign up -> New project.
2. Note your Project URL and **Service Role** key (Settings -> API).
3. In **Storage**, create a **private** bucket named `visitor-uploads`.
4. In **SQL Editor**, paste and run the contents of `schema.sql` from this repo.
   - RLS is enabled with basic policies allowing inserts via service role.

## 2) Deploy this app to Vercel
1. Go to https://vercel.com -> New Project -> "Import" a Git repository.
   - If you don't use Git, click "Deploy from GitHub" and create a new repository, then upload these files.
2. Once the project is created, go to **Settings -> Environment Variables** and add:
   - `SUPABASE_URL` = your Supabase project URL
   - `SUPABASE_SERVICE_ROLE_KEY` = the service role key (keep secret)
   - `SUPABASE_BUCKET` = `visitor-uploads`
   - `ALLOWED_EMAIL_DOMAIN` = `@student.sae.edu.au`
   - `LEAD_TIME_HOURS` = `2`
3. Click **Redeploy**.

> Alternative: Use `vercel` CLI locally if you prefer.

## 3) Test the form
- Open your Vercel URL (e.g., `https://your-project.vercel.app`).
- Fill the form and upload the two files.
- Submit → you should see "Reference: <visit_id>".
- In Supabase -> Table editor, check `students`, `visitors`, `visits`, `documents` for records.
- In Supabase -> Storage -> `visitor-uploads/visits/<visit_id>/...` check files exist.

## 4) Make a QR code
- Use any QR generator to encode your Vercel URL.
- Print and place at entry points.

## 5) Next steps (optional)
- Add admin UI (protected) for Approve/Decline.
- Add hCaptcha/Turnstile on submit for abuse protection.
- Add email notifications via Resend/SMTP.
- Add retention job to delete old files.

## Notes
- This MVP handles everything in a single multipart POST to `/api/submit`.
- Uploaded files are saved to a **private** bucket using the service role; the public cannot read them.
- Keep your service role key secret (only on Vercel server env). Do NOT expose it in the browser.
