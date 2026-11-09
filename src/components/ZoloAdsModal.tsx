import React, { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, BarChart3, ExternalLink, Loader2, Megaphone, Plus, Trash2, Upload, X } from 'lucide-react';
import { authApi, AuthApiClientError } from '../utils/authApi';
import type { AdCreativeInput, AdvertisementCampaign } from '../types/ads';

interface ZoloAdsModalProps {
  advertiserName: string;
  onClose: () => void;
}

const EMPTY_CREATIVE: AdCreativeInput = {
  title: '',
  advertiserName: '',
  imageUrl: '',
  body: '',
  subtitle: '',
  destinationUrl: '',
  ctaText: 'Visit Website',
};

function getErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : 'Something went wrong. Please try again.';
}

export const ZoloAdsModal: React.FC<ZoloAdsModalProps> = ({ advertiserName, onClose }) => {
  const [campaigns, setCampaigns] = useState<AdvertisementCampaign[]>([]);
  const [adminCampaigns, setAdminCampaigns] = useState<AdvertisementCampaign[]>([]);
  const [reports, setReports] = useState<Array<{ campaignId: string; reason: string; createdAt: string }>>([]);
  const [creative, setCreative] = useState<AdCreativeInput>({ ...EMPTY_CREATIVE, advertiserName });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminTab, setAdminTab] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [uploadingImage, setUploadingImage] = useState(false);

  const refresh = async () => {
    setIsLoading(true);
    setError('');
    try {
      const { campaigns: ownCampaigns } = await authApi.listAdCampaigns();
      setCampaigns(ownCampaigns);
      try {
        const adminResponse = await authApi.fetchAdminAds();
        setIsAdmin(adminResponse.isAdmin);
        setReports(adminResponse.reports || []);
        setAdminCampaigns(adminResponse.campaigns);
      } catch (adminError) {
        if (!(adminError instanceof AuthApiClientError) || adminError.status !== 403) throw adminError;
        setIsAdmin(false);
      }
    } catch (fetchError) {
      setError(getErrorMessage(fetchError));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const counts = useMemo(() => ({
    total: campaigns.length,
    active: campaigns.filter((campaign) => campaign.status === 'approved').length,
    pending: campaigns.filter((campaign) => campaign.status === 'pending').length,
    rejected: campaigns.filter((campaign) => campaign.status === 'rejected').length,
  }), [campaigns]);

  const resetForm = () => {
    setCreative({ ...EMPTY_CREATIVE, advertiserName });
    setEditingId(null);
    setIsFormOpen(false);
    setError('');
  };

  const saveCreative = async (event: React.FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = editingId
        ? await authApi.updateAdCampaign(editingId, creative)
        : await authApi.createAdCampaign(creative);
      setCampaigns((current) => [
        result.campaign,
        ...current.filter((campaign) => campaign.id !== result.campaign.id),
      ]);
      setNotice('Submitted for review. Your ad will not appear until it is approved.');
      resetForm();
    } catch (saveError) {
      setError(getErrorMessage(saveError));
    } finally {
      setBusy(false);
    }
  };

  const uploadImage = async (file?: File) => {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
      setError('Choose a JPG, PNG, GIF, or WebP image.');
      return;
    }
    setUploadingImage(true);
    setError('');
    try {
      const upload = await authApi.uploadAdImage(file);
      setCreative((current) => ({ ...current, imageUrl: upload.url }));
    } catch (uploadError) {
      setError(getErrorMessage(uploadError));
    } finally {
      setUploadingImage(false);
    }
  };

  const uploadLogo = async (file?: File) => {
    if (!file) return;
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif'].includes(file.type)) {
      setError('Choose a JPG, PNG, GIF, or WebP logo.');
      return;
    }
    setUploadingImage(true);
    setError('');
    try {
      const upload = await authApi.uploadAdImage(file);
      setCreative((current) => ({ ...current, logoUrl: upload.url }));
    } catch (uploadError) {
      setError(getErrorMessage(uploadError));
    } finally {
      setUploadingImage(false);
    }
  };

  const toggleCampaign = async (campaign: AdvertisementCampaign) => {
    setBusy(true);
    setError('');
    try {
      const result = await authApi.setAdCampaignStatus(
        campaign.id,
        campaign.status === 'approved' ? 'paused' : 'approved'
      );
      setCampaigns((current) => current.map((item) => item.id === campaign.id ? result.campaign : item));
    } catch (actionError) {
      setError(getErrorMessage(actionError));
    } finally {
      setBusy(false);
    }
  };

  const removeCampaign = async (campaign: AdvertisementCampaign) => {
    if (!window.confirm(`Delete "${campaign.title}"? This cannot be undone.`)) return;
    setBusy(true);
    setError('');
    try {
      await authApi.deleteAdCampaign(campaign.id);
      setCampaigns((current) => current.filter((item) => item.id !== campaign.id));
    } catch (actionError) {
      setError(getErrorMessage(actionError));
    } finally {
      setBusy(false);
    }
  };

  const moderate = async (campaign: AdvertisementCampaign, status: 'approved' | 'rejected' | 'paused') => {
    const note = status === 'rejected' ? window.prompt('Reason for rejection?') || '' : '';
    if (status === 'rejected' && note.trim().length < 3) {
      setError('Enter a rejection note of at least 3 characters.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const result = await authApi.moderateAdvertisement({ campaignId: campaign.id, status, note });
      setAdminCampaigns((current) => current.map((item) => item.id === campaign.id ? result.campaign : item));
      setNotice(`Advertisement ${status}.`);
    } catch (moderationError) {
      setError(getErrorMessage(moderationError));
    } finally {
      setBusy(false);
    }
  };

  const removeAsAdmin = async (campaign: AdvertisementCampaign) => {
    if (!window.confirm(`Permanently remove "${campaign.title}"?`)) return;
    setBusy(true);
    setError('');
    try {
      await authApi.deleteAdvertisementAsAdmin(campaign.id);
      setAdminCampaigns((current) => current.filter((item) => item.id !== campaign.id));
      setReports((current) => current.filter((report) => report.campaignId !== campaign.id));
      setNotice('Advertisement removed.');
    } catch (deleteError) {
      setError(getErrorMessage(deleteError));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-3 sm:p-6" role="dialog" aria-modal="true" aria-labelledby="zolo-ads-title">
      <div className="flex max-h-[92vh] w-full max-w-4xl flex-col overflow-hidden rounded-2xl border border-slate-700 bg-[#101b22] text-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-white/10 p-4 sm:px-6">
          <div className="flex items-center gap-3">
            <div className="rounded-xl bg-emerald-500/15 p-2 text-emerald-400"><Megaphone className="h-5 w-5" /></div>
            <div><h2 id="zolo-ads-title" className="font-bold">ZOLO Ads</h2><p className="text-xs text-slate-400">Sponsored status campaigns and performance</p></div>
          </div>
          <button type="button" onClick={onClose} className="rounded-full p-2 hover:bg-white/10" aria-label="Close"><X className="h-5 w-5" /></button>
        </div>
        <div className="flex gap-2 border-b border-white/10 px-4 pt-3 sm:px-6">
          <button type="button" onClick={() => setAdminTab(false)} className={`rounded-t-lg px-3 py-2 text-xs ${!adminTab ? 'bg-white/10 text-emerald-300' : 'text-slate-400'}`}>My campaigns</button>
          {isAdmin && <button type="button" onClick={() => setAdminTab(true)} className={`rounded-t-lg px-3 py-2 text-xs ${adminTab ? 'bg-white/10 text-emerald-300' : 'text-slate-400'}`}>Moderation ({reports.length})</button>}
        </div>
        <div className="flex-1 overflow-y-auto p-4 sm:p-6">
          {error && <div role="alert" className="mb-4 rounded-lg border border-rose-500/30 bg-rose-500/10 p-3 text-sm text-rose-300">{error}</div>}
          {notice && <div role="status" className="mb-4 rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-3 text-sm text-emerald-300">{notice}</div>}

          {!adminTab && !isFormOpen && (
            <>
              <div className="mb-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {[
                  ['Ads', counts.total],
                  ['Active', counts.active],
                  ['Pending', counts.pending],
                  ['Rejected', counts.rejected],
                ].map(([label, count]) => <div key={label} className="rounded-xl border border-white/10 bg-white/[0.03] p-3"><div className="text-xl font-bold">{count}</div><div className="text-xs text-slate-400">{label}</div></div>)}
              </div>
              <button type="button" onClick={() => { resetForm(); setIsFormOpen(true); }} className="mb-4 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold hover:bg-emerald-500"><Plus className="h-4 w-4" />Create ad</button>
            </>
          )}

          {isLoading ? <div className="flex justify-center p-8"><Loader2 className="h-6 w-6 animate-spin text-emerald-400" /></div> : null}

          {!isLoading && isFormOpen && !adminTab && (
            <form onSubmit={saveCreative} className="grid gap-5 lg:grid-cols-2">
              <div className="space-y-3">
                {([
                  ['title', 'Advertisement title', true],
                  ['advertiserName', 'Business or advertiser name', true],
                  ['body', 'Main advertising text', true],
                  ['subtitle', 'Optional subtitle', false],
                  ['destinationUrl', 'HTTPS destination URL', true],
                  ['ctaText', 'Call-to-action text', true],
                ] as Array<[keyof AdCreativeInput, string, boolean]>).map(([field, label, required]) => (
                  <label key={field} className="block text-xs text-slate-300">{label}
                    <input
                      required={required}
                      type={field === 'destinationUrl' ? 'url' : 'text'}
                      value={String(creative[field] || '')}
                      onChange={(event) => setCreative((current) => ({ ...current, [field]: event.target.value }))}
                      className="mt-1 w-full rounded-lg border border-white/10 bg-[#0b141a] px-3 py-2 text-sm outline-none focus:border-emerald-500"
                    />
                  </label>
                ))}
                <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-white/20 p-3 text-sm text-slate-300 hover:border-emerald-500">
                  {uploadingImage ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                  {creative.imageUrl ? 'Replace advertisement image' : 'Upload JPG, PNG, GIF, or WebP image'}
                  <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={(event) => { void uploadImage(event.target.files?.[0]); event.target.value = ''; }} />
                </label>
                <label className="flex cursor-pointer items-center gap-2 rounded-lg border border-dashed border-white/20 p-3 text-xs text-slate-400 hover:border-emerald-500">
                  <Upload className="h-4 w-4" />{creative.logoUrl ? 'Replace optional business logo' : 'Upload optional business logo'}
                  <input type="file" accept="image/jpeg,image/png,image/webp,image/gif" className="hidden" onChange={(event) => { void uploadLogo(event.target.files?.[0]); event.target.value = ''; }} />
                </label>
                {!creative.imageUrl && <p className="text-xs text-amber-300">Upload an image to submit the campaign.</p>}
                <div className="flex gap-2">
                  <button disabled={busy || uploadingImage || !creative.imageUrl} type="submit" className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold disabled:opacity-50">{busy ? 'Submitting…' : editingId ? 'Resubmit for review' : 'Submit for approval'}</button>
                  <button type="button" onClick={resetForm} className="rounded-lg bg-white/10 px-4 py-2 text-sm">Cancel</button>
                </div>
              </div>
              <div className="rounded-xl border border-white/10 bg-black/20 p-3">
                <div className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-300"><span className="rounded bg-amber-500 px-2 py-1 text-[10px] uppercase text-black">Sponsored</span>Preview</div>
                {creative.imageUrl ? <img src={creative.imageUrl} alt="Ad creative preview" className="max-h-72 w-full rounded-lg object-cover" /> : <div className="flex h-48 items-center justify-center rounded-lg bg-white/5 text-sm text-slate-500">Advertisement image preview</div>}
                <p className="mt-3 text-lg font-bold">{creative.title || 'Your advertisement title'}</p>
                <div className="mt-1 flex items-center gap-2 text-xs text-slate-400">
                  {creative.logoUrl && <img src={creative.logoUrl} alt="" className="h-6 w-6 rounded-full object-cover" />}
                  {creative.advertiserName || advertiserName}
                </div>
                <p className="mt-2 text-sm">{creative.body || 'Your advertising message appears here.'}</p>
                {creative.subtitle && <p className="mt-1 text-xs text-slate-300">{creative.subtitle}</p>}
                <a href={/^https:\/\//i.test(creative.destinationUrl) ? creative.destinationUrl : undefined} target="_blank" rel="noopener noreferrer nofollow" className="mt-4 inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold">{creative.ctaText || 'Visit Website'}<ExternalLink className="h-4 w-4" /></a>
              </div>
            </form>
          )}

          {!isLoading && !isFormOpen && !adminTab && (
            <div className="space-y-3">
              {campaigns.length === 0 && <p className="rounded-xl border border-white/10 p-5 text-sm text-slate-400">No campaigns yet. Create one to submit it for review.</p>}
              {campaigns.map((campaign) => (
                <article key={campaign.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2"><h3 className="truncate font-semibold">{campaign.title}</h3><span className={`rounded-full px-2 py-0.5 text-[10px] uppercase ${campaign.status === 'approved' ? 'bg-emerald-500/15 text-emerald-300' : campaign.status === 'rejected' ? 'bg-rose-500/15 text-rose-300' : campaign.status === 'paused' ? 'bg-slate-500/20 text-slate-300' : 'bg-amber-500/15 text-amber-300'}`}>{campaign.status}</span></div>
                      <p className="mt-1 text-xs text-slate-400">{campaign.advertiserName}</p>
                      {campaign.moderationNote && <p className="mt-2 flex items-center gap-1 text-xs text-rose-300"><AlertTriangle className="h-3 w-3" />{campaign.moderationNote}</p>}
                      <div className="mt-3 flex flex-wrap gap-4 text-xs text-slate-300"><span><BarChart3 className="mr-1 inline h-3 w-3" />{campaign.impressions || 0} impressions</span><span>{campaign.reach || 0} reach</span><span>{campaign.clicks || 0} clicks</span><span>CTR {campaign.impressions ? ((campaign.clicks || 0) * 100 / campaign.impressions).toFixed(1) : '0.0'}%</span></div>
                    </div>
                    <div className="flex gap-2">
                      {(campaign.status === 'approved' || campaign.status === 'paused') && <button type="button" disabled={busy} onClick={() => void toggleCampaign(campaign)} className="rounded-lg bg-white/10 px-3 py-1.5 text-xs">{campaign.status === 'approved' ? 'Pause' : 'Resume'}</button>}
                      {(campaign.status === 'pending' || campaign.status === 'rejected') && <button type="button" onClick={() => { setEditingId(campaign.id); setCreative({ title: campaign.title, advertiserName: campaign.advertiserName, imageUrl: campaign.imageUrl, body: campaign.body, subtitle: campaign.subtitle, destinationUrl: campaign.destinationUrl, ctaText: campaign.ctaText, logoUrl: campaign.logoUrl }); setIsFormOpen(true); }} className="rounded-lg bg-white/10 px-3 py-1.5 text-xs">Edit</button>}
                      <button type="button" disabled={busy} onClick={() => void removeCampaign(campaign)} className="rounded-lg bg-rose-500/10 p-2 text-rose-300" title="Delete campaign"><Trash2 className="h-4 w-4" /></button>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}

          {!isLoading && adminTab && isAdmin && (
            <div className="space-y-3">
              {adminCampaigns.length === 0 && <p className="rounded-xl border border-white/10 p-5 text-sm text-slate-400">No campaigns submitted for moderation.</p>}
              {adminCampaigns.map((campaign) => (
                <article key={campaign.id} className="rounded-xl border border-white/10 p-4">
                  <div className="flex flex-col gap-3 sm:flex-row">
                    <img src={campaign.imageUrl} alt="" className="h-32 w-full rounded-lg object-cover sm:w-48" />
                    <div className="flex-1">
                      <div className="flex items-center gap-2"><h3 className="font-semibold">{campaign.title}</h3><span className="rounded bg-amber-500/20 px-2 py-1 text-[10px] uppercase text-amber-300">{campaign.status}</span></div>
                      <p className="mt-1 text-xs text-slate-400">{campaign.advertiserName} · {campaign.advertiserPhone}</p>
                      <p className="mt-2 text-sm">{campaign.body}</p>
                      <a href={campaign.destinationUrl} target="_blank" rel="noopener noreferrer nofollow" className="mt-2 inline-flex items-center gap-1 text-xs text-sky-300">{campaign.destinationUrl}<ExternalLink className="h-3 w-3" /></a>
                      {reports.filter((report) => report.campaignId === campaign.id).map((report, index) => <p key={`${report.createdAt}-${index}`} className="mt-2 text-xs text-rose-300">Report: {report.reason}</p>)}
                      <div className="mt-3 flex gap-2">
                        {campaign.status === 'pending' && <button type="button" disabled={busy} onClick={() => void moderate(campaign, 'approved')} className="rounded bg-emerald-600 px-3 py-1.5 text-xs">Approve</button>}
                        {campaign.status !== 'rejected' && <button type="button" disabled={busy} onClick={() => void moderate(campaign, 'rejected')} className="rounded bg-rose-600/80 px-3 py-1.5 text-xs">Reject</button>}
                        {campaign.status === 'approved' && <button type="button" disabled={busy} onClick={() => void moderate(campaign, 'paused')} className="rounded bg-slate-600 px-3 py-1.5 text-xs">Pause</button>}
                        <button type="button" disabled={busy} onClick={() => void removeAsAdmin(campaign)} className="rounded bg-rose-900/70 px-3 py-1.5 text-xs">Remove</button>
                      </div>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
