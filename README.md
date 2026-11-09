<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://ai.google.dev/static/site-assets/images/share-ais-513315318.png" />
</div>

# Run and deploy your AI Studio app

This contains everything you need to run your app locally.

View your app in AI Studio: https://ai.studio/apps/2082a314-4d97-411a-813d-6d0c815232b7

## Run Locally

**Prerequisites:**  Node.js


1. Install dependencies:
   `npm install`
2. Set the `GEMINI_API_KEY` in [.env.local](.env.local) to your Gemini API key
3. Run the app:
   `npm run dev`

## Media, links, wallpapers, and ZOLO Ads

- Shared media cards provide filename-preserving download/share actions. Downloads use browser APIs; mobile browsers may require the user to choose a save location and do not necessarily save into Photos/Gallery.
- Message HTTP(S) links open in a new tab. Link previews are fetched by the server, which pins public DNS results, rejects private/loopback addresses, limits redirects and response size, and applies a rate limit.
- Chat wallpapers can be selected per conversation or globally. Uploaded wallpapers use the existing attachment storage and preferences are persisted with the account chat state.
- ZOLO Ads campaigns remain private until approved. Add normalized E.164 administrator numbers to `ZOLO_AD_ADMIN_PHONES` (comma-separated) and set `ZOLO_AD_ANALYTICS_SECRET` to a random secret. The admin phone can review campaigns and reports in the Status tab's **ZOLO Ads** dashboard.
- Apply the additive `supabase_schema.sql` migration to create the campaign, event, and report tables and service-role-only RLS policies. Configure `SUPABASE_SERVICE_ROLE_KEY` on the server; never expose it in frontend variables.
- If `public.ad_campaigns` is missing from Supabase, the app temporarily uses its server-local SQLite Ads tables and logs a warning instead of returning 500 errors. This fallback is per-server-instance and is not shared across replicas. Apply the ZOLO Ads SQL section in Supabase before relying on campaigns across deployments; local fallback campaigns are not automatically copied into Supabase.
- Ad images are validated as JPG, PNG, GIF, or WebP uploads. Only HTTPS public destinations are accepted. Each status-viewing session inserts one approved sponsored campaign after every five organic stories; an impression is recorded only after the ad remains visible for one second.

Run `npm test`, `npm run lint`, and `npm run build` to validate the application.
