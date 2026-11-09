import type { StatusStory } from '../types/chat';
import type { AdvertisementCampaign } from '../types/ads';

function toSponsoredStatus(campaign: AdvertisementCampaign): StatusStory {
  return {
    id: `sponsored_${campaign.id}`,
    contactId: 'sponsored-ad',
    contactName: campaign.advertiserName,
    contactAvatar: campaign.logoUrl || '',
    timestamp: 'Sponsored',
    timestampRaw: Date.now(),
    type: 'image',
    mediaUrl: campaign.imageUrl,
    text: campaign.body,
    caption: campaign.subtitle,
    viewed: false,
    isSponsored: true,
    campaignId: campaign.id,
    advertiserName: campaign.advertiserName,
    destinationUrl: campaign.destinationUrl,
    ctaText: campaign.ctaText,
  };
}

export function createStatusViewingSequence(
  stories: StatusStory[],
  startIndex: number,
  campaigns: AdvertisementCampaign[]
): StatusStory[] {
  const organic = stories.slice(Math.max(0, startIndex));
  const sequence: StatusStory[] = [];
  let organicCount = 0;
  for (const story of organic) {
    sequence.push(story);
    organicCount += 1;
    if (organicCount % 5 === 0 && campaigns.length > 0) {
      sequence.push(toSponsoredStatus(campaigns[(organicCount / 5 - 1) % campaigns.length]));
    }
  }
  return sequence;
}
