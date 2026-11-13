import crypto from 'node:crypto';
import { getLocalDb } from './localDatabase.ts';
import {
  getSupabaseServerClient,
  isSupabaseTableMissingError,
} from '../lib/supabaseServer.ts';
import type { AdCreativeInput, AdStatus, AdvertisementCampaign } from '../types/ads.ts';

let useLocalAdStorage = false;
let localFallbackWarningShown = false;

function getAdsSupabaseClient() {
  return useLocalAdStorage ? null : getSupabaseServerClient();
}

export function isAdsCampaignTableMissingError(error: unknown): boolean {
  if (!isSupabaseTableMissingError(error)) return false;
  const message = String((error as { message?: string }).message || '').toLowerCase();
  return message.includes('ad_campaigns');
}

function useLocalFallbackForMissingTable(error: unknown): boolean {
  if (!isAdsCampaignTableMissingError(error)) return false;
  useLocalAdStorage = true;
  if (!localFallbackWarningShown) {
    localFallbackWarningShown = true;
    console.warn(
      'ZOLO Ads Supabase tables are missing or not in the PostgREST schema cache. Ads are temporarily using this server instance SQLite database. Apply the ZOLO Ads section of supabase_schema.sql and restart the server to restore shared Supabase storage.'
    );
  }
  return true;
}

interface AdRow {
  id: string;
  advertiser_phone: string;
  title: string;
  advertiser_name: string;
  image_url: string;
  body: string;
  subtitle: string;
  destination_url: string;
  cta_text: string;
  logo_url: string | null;
  status: AdStatus;
  moderation_note: string | null;
  created_at: string;
  updated_at: string;
}

function mapAd(row: AdRow): AdvertisementCampaign {
  return {
    id: row.id,
    advertiserPhone: row.advertiser_phone,
    title: row.title,
    advertiserName: row.advertiser_name,
    imageUrl: row.image_url,
    body: row.body,
    subtitle: row.subtitle || '',
    destinationUrl: row.destination_url,
    ctaText: row.cta_text,
    logoUrl: row.logo_url,
    status: row.status,
    moderationNote: row.moderation_note,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toRow(ad: AdvertisementCampaign): AdRow {
  return {
    id: ad.id,
    advertiser_phone: ad.advertiserPhone,
    title: ad.title,
    advertiser_name: ad.advertiserName,
    image_url: ad.imageUrl,
    body: ad.body,
    subtitle: ad.subtitle,
    destination_url: ad.destinationUrl,
    cta_text: ad.ctaText,
    logo_url: ad.logoUrl,
    status: ad.status,
    moderation_note: ad.moderationNote,
    created_at: ad.createdAt,
    updated_at: ad.updatedAt,
  };
}

function asLocalRow(row: Record<string, unknown>): AdRow {
  return {
    id: String(row.id),
    advertiser_phone: String(row.advertiser_phone),
    title: String(row.title),
    advertiser_name: String(row.advertiser_name),
    image_url: String(row.image_url),
    body: String(row.body),
    subtitle: String(row.subtitle || ''),
    destination_url: String(row.destination_url),
    cta_text: String(row.cta_text),
    logo_url: row.logo_url ? String(row.logo_url) : null,
    status: String(row.status) as AdStatus,
    moderation_note: row.moderation_note ? String(row.moderation_note) : null,
    created_at: String(row.created_at),
    updated_at: String(row.updated_at),
  };
}

function normalizeCreative(input: AdCreativeInput): AdCreativeInput {
  const text = (value: string | undefined, max: number) => (value || '').trim().slice(0, max);
  const result: AdCreativeInput = {
    title: text(input.title, 100),
    advertiserName: text(input.advertiserName, 100),
    imageUrl: text(input.imageUrl, 2048),
    body: text(input.body, 500),
    subtitle: text(input.subtitle, 160),
    destinationUrl: text(input.destinationUrl, 2048),
    ctaText: text(input.ctaText, 32),
    logoUrl: input.logoUrl ? text(input.logoUrl, 2048) : null,
  };
  if (
    result.title.length < 2 ||
    result.advertiserName.length < 2 ||
    result.body.length < 5 ||
    result.ctaText.length < 2 ||
    !/^https?:\/\//i.test(result.imageUrl)
  ) {
    throw new Error('Complete all required advertisement fields and upload a valid image.');
  }
  const destination = new URL(result.destinationUrl);
  if (destination.protocol !== 'https:' || destination.username || destination.password) {
    throw new Error('The destination must be a secure HTTPS website without embedded credentials.');
  }
  result.destinationUrl = destination.href;
  return result;
}

const AD_VISIT_DURATION_MS = 10_000;
const AD_VISIT_TTL_MS = 30 * 60_000;

interface AdVisitVerificationRow {
  id: string;
  advertiser_phone: string;
  submission_id: string;
  started_at: string;
  completed_at: string | null;
  consumed_at: string | null;
  expires_at: string;
}

export type AdVisitVerificationStatus =
  | 'eligible'
  | 'completed'
  | 'too_early'
  | 'expired'
  | 'not_found'
  | 'consumed';

export function getAdVisitVerificationStatus(
  row: Pick<AdVisitVerificationRow, 'started_at' | 'expires_at' | 'completed_at' | 'consumed_at'>,
  now: number
): AdVisitVerificationStatus {
  if (row.consumed_at) return 'consumed';
  const expiresAt = Date.parse(row.expires_at);
  if (!Number.isFinite(expiresAt) || expiresAt <= now) return 'expired';
  const startedAt = Date.parse(row.started_at);
  if (!Number.isFinite(startedAt) || startedAt + AD_VISIT_DURATION_MS > now) return 'too_early';
  return row.completed_at ? 'completed' : 'eligible';
}

function mapAdVisitVerification(row: AdVisitVerificationRow) {
  return {
    verificationId: row.id,
    submissionId: row.submission_id,
    startedAt: row.started_at,
    expiresAt: row.expires_at,
    completedAt: row.completed_at,
  };
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export async function startAdVisitVerification(
  advertiserPhone: string,
  submissionId: string
): Promise<ReturnType<typeof mapAdVisitVerification>> {
  if (!isUuid(submissionId)) throw new Error('Invalid advertisement submission ID.');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + AD_VISIT_TTL_MS).toISOString();
  const supabase = getAdsSupabaseClient();
  if (supabase) {
    const { data: existing, error: existingError } = await supabase
      .from('ad_visit_verifications')
      .select('*')
      .eq('advertiser_phone', advertiserPhone)
      .eq('submission_id', submissionId)
      .maybeSingle();
    if (existingError) throw new Error(`Could not load advertisement verification: ${existingError.message}`);
    if (
      existing &&
      !existing.consumed_at &&
      Date.parse(existing.expires_at) > now.getTime()
    ) {
      return mapAdVisitVerification(existing as AdVisitVerificationRow);
    }

    const row: AdVisitVerificationRow = {
      id: crypto.randomUUID(),
      advertiser_phone: advertiserPhone,
      submission_id: submissionId,
      started_at: now.toISOString(),
      completed_at: null,
      consumed_at: null,
      expires_at: expiresAt,
    };
    const { data, error } = await supabase
      .from('ad_visit_verifications')
      .upsert(row, { onConflict: 'advertiser_phone,submission_id' })
      .select('*')
      .single();
    if (error) throw new Error(`Could not start advertisement verification: ${error.message}`);
    return mapAdVisitVerification(data as AdVisitVerificationRow);
  }

  const db = getLocalDb();
  const existing = db.prepare(`
    SELECT * FROM local_ad_visit_verifications
    WHERE advertiser_phone = ? AND submission_id = ?
  `).get(advertiserPhone, submissionId) as Record<string, unknown> | undefined;
  if (
    existing &&
    !existing.consumed_at &&
    Date.parse(String(existing.expires_at)) > now.getTime()
  ) {
    return mapAdVisitVerification(existing as unknown as AdVisitVerificationRow);
  }
  const row: AdVisitVerificationRow = {
    id: crypto.randomUUID(),
    advertiser_phone: advertiserPhone,
    submission_id: submissionId,
    started_at: now.toISOString(),
    completed_at: null,
    consumed_at: null,
    expires_at: expiresAt,
  };
  db.prepare(`
    INSERT INTO local_ad_visit_verifications
      (id, advertiser_phone, submission_id, started_at, completed_at, consumed_at, expires_at)
    VALUES (?, ?, ?, ?, NULL, NULL, ?)
    ON CONFLICT(advertiser_phone, submission_id) DO UPDATE SET
      id = excluded.id,
      started_at = excluded.started_at,
      completed_at = NULL,
      consumed_at = NULL,
      expires_at = excluded.expires_at
  `).run(row.id, row.advertiser_phone, row.submission_id, row.started_at, row.expires_at);
  return mapAdVisitVerification(row);
}

export async function completeAdVisitVerification(
  advertiserPhone: string,
  verificationId: string
): Promise<'completed' | 'too_early' | 'expired' | 'not_found' | 'consumed'> {
  const now = new Date();
  const supabase = getAdsSupabaseClient();
  if (supabase) {
    const { data, error } = await supabase
      .from('ad_visit_verifications')
      .select('*')
      .eq('id', verificationId)
      .eq('advertiser_phone', advertiserPhone)
      .maybeSingle();
    if (error) throw new Error(`Could not verify advertisement visit: ${error.message}`);
    if (!data) return 'not_found';
    const row = data as AdVisitVerificationRow;
    const status = getAdVisitVerificationStatus(row, now.getTime());
    if (status !== 'eligible') return status;
    const { data: updated, error: updateError } = await supabase
      .from('ad_visit_verifications')
      .update({ completed_at: now.toISOString() })
      .eq('id', verificationId)
      .eq('advertiser_phone', advertiserPhone)
      .is('completed_at', null)
      .is('consumed_at', null)
      .gt('expires_at', now.toISOString())
      .select('id')
      .maybeSingle();
    if (updateError) throw new Error(`Could not complete advertisement verification: ${updateError.message}`);
    return updated ? 'completed' : 'consumed';
  }

  const db = getLocalDb();
  const row = db.prepare(`
    SELECT * FROM local_ad_visit_verifications WHERE id = ? AND advertiser_phone = ?
  `).get(verificationId, advertiserPhone) as Record<string, unknown> | undefined;
  if (!row) return 'not_found';
  const status = getAdVisitVerificationStatus({
    started_at: String(row.started_at),
    expires_at: String(row.expires_at),
    completed_at: row.completed_at ? String(row.completed_at) : null,
    consumed_at: row.consumed_at ? String(row.consumed_at) : null,
  }, now.getTime());
  if (status !== 'eligible') return status;
  const result = db.prepare(`
    UPDATE local_ad_visit_verifications SET completed_at = ?
    WHERE id = ? AND advertiser_phone = ? AND completed_at IS NULL
      AND consumed_at IS NULL AND expires_at > ?
  `).run(now.toISOString(), verificationId, advertiserPhone, now.toISOString());
  return Number(result.changes) > 0 ? 'completed' : 'consumed';
}

export async function cancelAdVisitVerification(
  advertiserPhone: string,
  verificationId: string
): Promise<void> {
  const cancelledAt = new Date().toISOString();
  const supabase = getAdsSupabaseClient();
  if (supabase) {
    const { error } = await supabase
      .from('ad_visit_verifications')
      .update({ consumed_at: cancelledAt })
      .eq('id', verificationId)
      .eq('advertiser_phone', advertiserPhone)
      .is('consumed_at', null);
    if (error) throw new Error(`Could not cancel advertisement verification: ${error.message}`);
    return;
  }
  getLocalDb().prepare(`
    UPDATE local_ad_visit_verifications SET consumed_at = ?
    WHERE id = ? AND advertiser_phone = ? AND consumed_at IS NULL
  `).run(cancelledAt, verificationId, advertiserPhone);
}

async function consumeAdVisitVerification(
  advertiserPhone: string,
  verificationId: string,
  submissionId: string
): Promise<string | null> {
  const now = new Date().toISOString();
  const supabase = getAdsSupabaseClient();
  if (supabase) {
    const { data, error } = await supabase
      .from('ad_visit_verifications')
      .update({ consumed_at: now })
      .eq('id', verificationId)
      .eq('advertiser_phone', advertiserPhone)
      .eq('submission_id', submissionId)
      .not('completed_at', 'is', null)
      .is('consumed_at', null)
      .gt('expires_at', now)
      .select('consumed_at')
      .maybeSingle();
    if (error) throw new Error(`Could not authorize advertisement submission: ${error.message}`);
    return data ? String(data.consumed_at) : null;
  }
  const db = getLocalDb();
  const result = db.prepare(`
    UPDATE local_ad_visit_verifications SET consumed_at = ?
    WHERE id = ? AND advertiser_phone = ? AND submission_id = ?
      AND completed_at IS NOT NULL AND consumed_at IS NULL AND expires_at > ?
  `).run(now, verificationId, advertiserPhone, submissionId, now);
  return Number(result.changes) > 0 ? now : null;
}

async function releaseAdVisitVerification(
  advertiserPhone: string,
  verificationId: string,
  consumedAt: string
): Promise<void> {
  const supabase = getAdsSupabaseClient();
  if (supabase) {
    const { error } = await supabase
      .from('ad_visit_verifications')
      .update({ consumed_at: null })
      .eq('id', verificationId)
      .eq('advertiser_phone', advertiserPhone)
      .eq('consumed_at', consumedAt);
    if (error) throw new Error(`Could not restore advertisement verification: ${error.message}`);
    return;
  }
  getLocalDb().prepare(`
    UPDATE local_ad_visit_verifications SET consumed_at = NULL
    WHERE id = ? AND advertiser_phone = ? AND consumed_at = ?
  `).run(verificationId, advertiserPhone, consumedAt);
}

export async function createVerifiedAdCampaign(params: {
  advertiserPhone: string;
  submissionId: string;
  verificationId: string;
  creative: AdCreativeInput;
}): Promise<AdvertisementCampaign> {
  if (!isUuid(params.submissionId) || !isUuid(params.verificationId)) {
    throw new Error('Invalid advertisement verification.');
  }
  const creative = normalizeCreative(params.creative);
  const campaignId = `ad_${params.submissionId.replace(/-/g, '')}`;
  const existing = await getAdCampaign(campaignId);
  if (existing) {
    if (existing.advertiserPhone !== params.advertiserPhone) {
      throw new Error('Advertisement submission does not belong to this account.');
    }
    const existingCreative = normalizeCreative(existing);
    if (JSON.stringify(existingCreative) !== JSON.stringify(creative)) {
      throw new Error('This advertisement submission ID has already been used.');
    }
    return existing;
  }

  const consumedAt = await consumeAdVisitVerification(
    params.advertiserPhone,
    params.verificationId,
    params.submissionId
  );
  if (!consumedAt) throw new Error('Complete the VYNDORS timed visit before submitting this advertisement.');
  try {
    return await createAdCampaign(params.advertiserPhone, creative, campaignId);
  } catch (error) {
    await releaseAdVisitVerification(params.advertiserPhone, params.verificationId, consumedAt);
    throw error;
  }
}

export async function createAdCampaign(
  advertiserPhone: string,
  input: AdCreativeInput,
  campaignId?: string
): Promise<AdvertisementCampaign> {
  const creative = normalizeCreative(input);
  const now = new Date().toISOString();
  const campaign: AdvertisementCampaign = {
    id: campaignId || `ad_${crypto.randomUUID()}`,
    advertiserPhone,
    ...creative,
    subtitle: creative.subtitle || '',
    logoUrl: creative.logoUrl || null,
    status: 'pending',
    moderationNote: null,
    createdAt: now,
    updatedAt: now,
  };
  const supabase = getAdsSupabaseClient();
  if (supabase) {
    const { error } = await supabase.from('ad_campaigns').insert(toRow(campaign));
    if (error && !useLocalFallbackForMissingTable(error)) {
      throw new Error(`Could not create advertisement: ${error.message}`);
    }
    if (!error) return campaign;
  }
  const db = getLocalDb();
  db.prepare(`
    INSERT INTO local_ad_campaigns
    (id, advertiser_phone, title, advertiser_name, image_url, body, subtitle, destination_url, cta_text, logo_url, status, moderation_note, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(campaign.id, campaign.advertiserPhone, campaign.title, campaign.advertiserName, campaign.imageUrl, campaign.body, campaign.subtitle, campaign.destinationUrl, campaign.ctaText, campaign.logoUrl, campaign.status, campaign.moderationNote, now, now);
  return campaign;
}

export async function listAdCampaigns(params: { advertiserPhone?: string; status?: AdStatus }): Promise<AdvertisementCampaign[]> {
  const supabase = getAdsSupabaseClient();
  let rows: AdRow[];
  if (supabase) {
    let query = supabase.from('ad_campaigns').select('*').order('created_at', { ascending: false }).limit(1000);
    if (params.advertiserPhone) query = query.eq('advertiser_phone', params.advertiserPhone);
    if (params.status) query = query.eq('status', params.status);
    const { data, error } = await query;
    if (error && !useLocalFallbackForMissingTable(error)) {
      throw new Error(`Could not load advertisements: ${error.message}`);
    }
    if (!error) return ((data || []) as AdRow[]).map(mapAd);
  }
  const db = getLocalDb();
  const clauses: string[] = [];
  const values: string[] = [];
  if (params.advertiserPhone) {
    clauses.push('advertiser_phone = ?');
    values.push(params.advertiserPhone);
  }
  if (params.status) {
    clauses.push('status = ?');
    values.push(params.status);
  }
  const where = clauses.length ? `WHERE ${clauses.join(' AND ')}` : '';
  rows = (db.prepare(`SELECT * FROM local_ad_campaigns ${where} ORDER BY created_at DESC LIMIT 100`).all(...values) as Array<Record<string, unknown>>).map(asLocalRow);
  return rows.map(mapAd);
}

export async function getAdCampaign(id: string): Promise<AdvertisementCampaign | null> {
  const supabase = getAdsSupabaseClient();
  if (supabase) {
    const { data, error } = await supabase.from('ad_campaigns').select('*').eq('id', id).maybeSingle();
    if (error && !useLocalFallbackForMissingTable(error)) {
      throw new Error(`Could not load advertisement: ${error.message}`);
    }
    if (!error) return data ? mapAd(data as AdRow) : null;
  }
  const row = getLocalDb().prepare('SELECT * FROM local_ad_campaigns WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  return row ? mapAd(asLocalRow(row)) : null;
}

export async function updateAdCampaign(params: {
  id: string;
  advertiserPhone: string;
  creative: AdCreativeInput;
}): Promise<AdvertisementCampaign | null> {
  const existing = await getAdCampaign(params.id);
  if (!existing || existing.advertiserPhone !== params.advertiserPhone) return null;
  if (existing.status === 'approved' || existing.status === 'paused') {
    throw new Error('Only pending or rejected advertisements can be edited.');
  }
  const creative = normalizeCreative(params.creative);
  const updated: AdvertisementCampaign = {
    ...existing,
    ...creative,
    subtitle: creative.subtitle || '',
    logoUrl: creative.logoUrl || null,
    status: 'pending',
    moderationNote: null,
    updatedAt: new Date().toISOString(),
  };
  const supabase = getAdsSupabaseClient();
  if (supabase) {
    const { error } = await supabase.from('ad_campaigns').update(toRow(updated)).eq('id', updated.id).eq('advertiser_phone', params.advertiserPhone);
    if (error && !useLocalFallbackForMissingTable(error)) {
      throw new Error(`Could not update advertisement: ${error.message}`);
    }
    if (!error) return updated;
  }
  const row = toRow(updated);
  getLocalDb().prepare(`
    UPDATE local_ad_campaigns SET title = ?, advertiser_name = ?, image_url = ?, body = ?, subtitle = ?,
    destination_url = ?, cta_text = ?, logo_url = ?, status = ?, moderation_note = ?, updated_at = ?
    WHERE id = ? AND advertiser_phone = ?
  `).run(row.title, row.advertiser_name, row.image_url, row.body, row.subtitle, row.destination_url, row.cta_text, row.logo_url, row.status, row.moderation_note, row.updated_at, row.id, row.advertiser_phone);
  return updated;
}

export async function setAdCampaignStatus(
  id: string,
  status: AdStatus,
  moderationNote: string | null
): Promise<AdvertisementCampaign | null> {
  const now = new Date().toISOString();
  const supabase = getAdsSupabaseClient();
  let row: AdRow | null = null;
  if (supabase) {
    const { data, error } = await supabase.from('ad_campaigns').update({
      status,
      moderation_note: moderationNote,
      updated_at: now,
    }).eq('id', id).select('*').maybeSingle();
    if (error && !useLocalFallbackForMissingTable(error)) {
      throw new Error(`Could not moderate advertisement: ${error.message}`);
    }
    if (!error) return data ? mapAd(data as AdRow) : null;
  }
  const db = getLocalDb();
  const result = db.prepare('UPDATE local_ad_campaigns SET status = ?, moderation_note = ?, updated_at = ? WHERE id = ?').run(status, moderationNote, now, id);
  if (Number(result.changes) > 0) {
    row = asLocalRow(db.prepare('SELECT * FROM local_ad_campaigns WHERE id = ?').get(id) as Record<string, unknown>);
  }
  return row ? mapAd(row) : null;
}

export async function deleteAdCampaign(id: string, advertiserPhone: string): Promise<boolean> {
  const supabase = getAdsSupabaseClient();
  if (supabase) {
    const { data, error } = await supabase.from('ad_campaigns').delete().eq('id', id).eq('advertiser_phone', advertiserPhone).select('id');
    if (error && !useLocalFallbackForMissingTable(error)) {
      throw new Error(`Could not delete advertisement: ${error.message}`);
    }
    if (!error) return Boolean(data?.length);
  }
  const db = getLocalDb();
  db.exec('BEGIN');
  let changes = 0;
  try {
    db.prepare('DELETE FROM local_ad_events WHERE campaign_id = ?').run(id);
    db.prepare('DELETE FROM local_ad_reports WHERE campaign_id = ?').run(id);
    const result = db.prepare('DELETE FROM local_ad_campaigns WHERE id = ? AND advertiser_phone = ?').run(id, advertiserPhone);
    changes = Number(result.changes);
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
  return changes > 0;
}

export async function getAdAnalytics(campaigns: AdvertisementCampaign[]): Promise<AdvertisementCampaign[]> {
  if (campaigns.length === 0) return [];
  const ids = campaigns.map((campaign) => campaign.id);
  const supabase = getAdsSupabaseClient();
  const counts = new Map<string, { impressions: number; clicks: number; reach: Set<string> }>();
  for (const id of ids) counts.set(id, { impressions: 0, clicks: 0, reach: new Set() });

  if (supabase) {
    let offset = 0;
    while (true) {
      const { data, error } = await supabase.from('ad_events')
        .select('campaign_id,event_type,viewer_key')
        .in('campaign_id', ids)
        .range(offset, offset + 999);
      if (error) throw new Error(`Could not load advertisement analytics: ${error.message}`);
      for (const event of data || []) {
        const count = counts.get(String(event.campaign_id));
        if (!count) continue;
        if (event.event_type === 'impression') count.impressions += 1;
        if (event.event_type === 'click' || event.event_type === 'cta') count.clicks += 1;
        if (event.event_type === 'impression') count.reach.add(String(event.viewer_key));
      }
      if ((data || []).length < 1000) break;
      offset += 1000;
    }
  } else {
    const db = getLocalDb();
    const placeholders = ids.map(() => '?').join(',');
    const events = db.prepare(`SELECT campaign_id,event_type,viewer_key FROM local_ad_events WHERE campaign_id IN (${placeholders})`).all(...ids) as Array<Record<string, unknown>>;
    for (const event of events) {
      const count = counts.get(String(event.campaign_id));
      if (!count) continue;
      if (event.event_type === 'impression') count.impressions += 1;
      if (event.event_type === 'click' || event.event_type === 'cta') count.clicks += 1;
      if (event.event_type === 'impression') count.reach.add(String(event.viewer_key));
    }
  }

  return campaigns.map((campaign) => {
    const stats = counts.get(campaign.id)!;
    return { ...campaign, impressions: stats.impressions, clicks: stats.clicks, reach: stats.reach.size };
  });
}

export async function recordAdEvent(params: {
  campaignId: string;
  eventType: 'impression' | 'click' | 'cta';
  viewerKey: string;
  eventKey: string;
}): Promise<void> {
  const campaign = await getAdCampaign(params.campaignId);
  if (!campaign || campaign.status !== 'approved') throw new Error('Advertisement is not available.');
  const createdAt = new Date().toISOString();
  const eventKey = params.eventType === 'impression'
    ? createdAt.slice(0, 10)
    : params.eventKey;
  const supabase = getAdsSupabaseClient();
  if (supabase) {
    const { error } = await supabase.from('ad_events').upsert({
      campaign_id: campaign.id,
      event_type: params.eventType,
      viewer_key: params.viewerKey,
      event_key: eventKey,
      created_at: createdAt,
    }, { onConflict: 'campaign_id,event_type,viewer_key,event_key', ignoreDuplicates: true });
    if (error) throw new Error(`Could not record advertisement event: ${error.message}`);
    return;
  }
  getLocalDb().prepare(`
    INSERT OR IGNORE INTO local_ad_events (campaign_id,event_type,viewer_key,event_key,created_at)
    VALUES (?,?,?,?,?)
  `).run(campaign.id, params.eventType, params.viewerKey, eventKey, createdAt);
}

export async function reportAd(campaignId: string, reporterKey: string, reason: string): Promise<void> {
  const campaign = await getAdCampaign(campaignId);
  if (!campaign || campaign.status !== 'approved') throw new Error('Advertisement is not available.');
  const now = new Date().toISOString();
  const safeReason = reason.trim().slice(0, 300) || 'Other';
  const supabase = getAdsSupabaseClient();
  if (supabase) {
    const { error } = await supabase.from('ad_reports').upsert({
      campaign_id: campaignId,
      reporter_key: reporterKey,
      reason: safeReason,
      created_at: now,
    }, { onConflict: 'campaign_id,reporter_key', ignoreDuplicates: true });
    if (error) throw new Error(`Could not report advertisement: ${error.message}`);
  } else {
    getLocalDb().prepare('INSERT OR IGNORE INTO local_ad_reports (campaign_id,reporter_key,reason,created_at) VALUES (?,?,?,?)')
      .run(campaignId, reporterKey, safeReason, now);
  }
}

export async function listAdReports(): Promise<Array<{
  campaignId: string;
  reason: string;
  createdAt: string;
}>> {
  const supabase = getAdsSupabaseClient();
  if (supabase) {
    const { data, error } = await supabase.from('ad_reports')
      .select('campaign_id,reason,created_at')
      .order('created_at', { ascending: false })
      .limit(500);
    if (error) throw new Error(`Could not load advertisement reports: ${error.message}`);
    return (data || []).map((row) => ({
      campaignId: String(row.campaign_id),
      reason: String(row.reason),
      createdAt: String(row.created_at),
    }));
  }
  const rows = getLocalDb().prepare(`
    SELECT campaign_id,reason,created_at FROM local_ad_reports
    ORDER BY created_at DESC LIMIT 500
  `).all() as Array<Record<string, unknown>>;
  return rows.map((row) => ({
    campaignId: String(row.campaign_id),
    reason: String(row.reason),
    createdAt: String(row.created_at),
  }));
}
