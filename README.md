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

## Firebase Cloud Messaging

The web Firebase application is already configured in `firebase-applet-config.json` and is reused by the client and server. The web API key and app identifiers in that file are public Firebase client configuration; do not put Firebase Admin service-account keys there.

To enable real push delivery:

1. In Firebase Console, select the project matching the existing `projectId` in `firebase-applet-config.json` (or replace that file with the values for the intended project).
2. In **Project settings → General → Your apps**, register the ZOLO web app if it is not already registered. Keep its web app configuration in `firebase-applet-config.json`.
3. In **Messaging**, enable Firebase Cloud Messaging for the project and create a Web Push certificate/key pair. Set the **public** key as `FCM_VAPID_PUBLIC_KEY` on the server. Do not put a VAPID private key in the frontend.
4. Create a Firebase Admin service account for the same project. Set its full JSON key as the server-only `FIREBASE_SERVICE_ACCOUNT_JSON` secret, or use `FIREBASE_SERVICE_ACCOUNT_BASE64` / Google Application Default Credentials. Never commit or expose this credential, and do not use a client `VITE_` variable for it.
5. Apply the FCM tables at the end of `supabase_schema.sql` to the configured Supabase project. The server requires service-role access for these tables; the migration denies browser-role access. If using the direct PostgreSQL (`SQL_HOST`) adapter instead of Supabase, create the same `fcm_devices`, `notification_preferences`, and `notification_events` tables from that migration; the app does not auto-run PostgreSQL migrations. For local-only development the server creates equivalent SQLite tables automatically.
6. Configure `FCM_VAPID_PUBLIC_KEY` and `FIREBASE_SERVICE_ACCOUNT_JSON` in the production host's secret environment (including Render's environment settings). Deploy over HTTPS; Web Push and service workers do not work on ordinary insecure origins.
7. Open ZOLO on each device, sign in, and enable device notifications under **Security & Privacy → Notifications**. Grant browser permission from that user gesture. Preferences are stored on the account and remain disabled when turned off.

The server generates `/firebase-messaging-sw.js` from the existing public Firebase app configuration. It does not contain Admin credentials. Push content uses generic message descriptions rather than message text. Call invitations contain only the metadata needed to recover an active WebRTC call; FCM is not used for media transport.

After deployment, validate with two separate accounts and devices: enable notifications on the receiving account; send private and group messages; start audio and video private and group calls; check foreground and background delivery, notification-click navigation, reject/accept, missed-call state, permission-denied behavior, logout/account switching, and stale-token cleanup. Also verify retries do not duplicate user-visible events. Firebase Console's delivery acceptance is not evidence that a person saw a notification. A real multi-account/device delivery test requires the Firebase VAPID key, Admin credentials, HTTPS deployment, and test accounts/devices; those external prerequisites are not available in a local code-only test.

## Media, links, wallpapers, and ZOLO Ads

- Shared media cards provide filename-preserving download/share actions. Downloads use browser APIs; mobile browsers may require the user to choose a save location and do not necessarily save into Photos/Gallery.
- Message HTTP(S) links open in a new tab. Link previews are fetched by the server, which pins public DNS results, rejects private/loopback addresses, limits redirects and response size, and applies a rate limit.
- Chat wallpapers can be selected per conversation or globally. Uploaded wallpapers use the existing attachment storage and preferences are persisted with the account chat state.
- ZOLO Ads campaigns remain private until approved. Add normalized E.164 administrator numbers to `ZOLO_AD_ADMIN_PHONES` (comma-separated) and set `ZOLO_AD_ANALYTICS_SECRET` to a random secret. The admin phone can review campaigns and reports in the Status tab's **ZOLO Ads** dashboard.
- Apply the additive `supabase_schema.sql` migration to create the campaign, event, and report tables and service-role-only RLS policies. Configure `SUPABASE_SERVICE_ROLE_KEY` on the server; never expose it in frontend variables.
- Creating a new ad campaign requires a server-issued, single-use VYNDORS timed-visit verification. The timer only counts while the ZOLO tab is visible and focused. This verifies elapsed time, not that a person viewed or engaged with VYNDORS. The `ad_visit_verifications` table is included in `supabase_schema.sql`.
- The schema restricts application-table policies and grants to `service_role`; browser clients must not connect using service credentials. Reapply the updated schema to existing projects so the private-table policy changes take effect.
- If `public.ad_campaigns` is missing from Supabase, the app temporarily uses its server-local SQLite Ads tables and logs a warning instead of returning 500 errors. This fallback is per-server-instance and is not shared across replicas. Apply the ZOLO Ads SQL section in Supabase before relying on campaigns across deployments; local fallback campaigns are not automatically copied into Supabase.
- Ad images are validated as JPG, PNG, GIF, or WebP uploads. Only HTTPS public destinations are accepted. Each status-viewing session inserts one approved sponsored campaign after every five organic stories; an impression is recorded only after the ad remains visible for one second.

Run `npm test`, `npm run lint`, and `npm run build` to validate the application.
