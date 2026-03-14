import { CampaignDetailClient } from "@/components/campaign-detail-client";

export default async function CampaignPage({
  params,
}: {
  params: Promise<{ campaignId: string }>;
}) {
  const { campaignId } = await params;

  return <CampaignDetailClient campaignId={campaignId} />;
}
