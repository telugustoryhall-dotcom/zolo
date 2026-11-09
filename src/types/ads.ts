export type AdStatus = 'pending' | 'approved' | 'rejected' | 'paused';

export interface AdvertisementCampaign {
  id: string;
  advertiserPhone: string;
  title: string;
  advertiserName: string;
  imageUrl: string;
  body: string;
  subtitle: string;
  destinationUrl: string;
  ctaText: string;
  logoUrl: string | null;
  status: AdStatus;
  moderationNote: string | null;
  createdAt: string;
  updatedAt: string;
  impressions?: number;
  clicks?: number;
  reach?: number;
}

export interface AdCreativeInput {
  title: string;
  advertiserName: string;
  imageUrl: string;
  body: string;
  subtitle?: string;
  destinationUrl: string;
  ctaText: string;
  logoUrl?: string | null;
}
