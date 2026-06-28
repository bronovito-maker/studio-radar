import type { Json } from "@/types/database";

type ScoredLead = {
  business_name: string;
  region: string | null;
  category: string | null;
  phone: string | null;
  email: string | null;
  website_url: string | null;
  rating: number | null;
  review_count: number | null;
  has_booking: boolean;
};

function nullable(value: unknown) {
  return typeof value === "string" && value.length ? value : null;
}

export function isScoreSnapshotCurrent(snapshot: Json, lead: ScoredLead) {
  if (!snapshot || Array.isArray(snapshot) || typeof snapshot !== "object") return false;
  const input = snapshot.input;
  if (!input || Array.isArray(input) || typeof input !== "object") return false;

  return input.businessName === lead.business_name
    && nullable(input.region) === lead.region
    && nullable(input.category) === lead.category
    && nullable(input.phone) === lead.phone
    && nullable(input.email) === lead.email
    && nullable(input.websiteUrl) === lead.website_url
    && (typeof input.rating === "number" ? input.rating : null) === lead.rating
    && (typeof input.reviewCount === "number" ? input.reviewCount : null) === lead.review_count
    && Boolean(input.hasBooking) === lead.has_booking;
}
