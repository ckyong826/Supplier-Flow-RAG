import type { PublicView } from "../components/SiteChrome";
import type { Section } from "../admin/portal/types";

export type DemoTier = "starter" | "growth" | "premium";

const tierRank: Record<DemoTier, number> = { starter: 1, growth: 2, premium: 3 };

const publicViewMinimum: Record<PublicView, DemoTier> = {
  catalog: "starter",
  rfq: "starter",
  track: "starter",
  ai: "premium",
};

const sectionMinimum: Record<Section, DemoTier> = {
  dashboard: "starter",
  rfqs: "starter",
  products: "starter",
  settings: "starter",
  quotations: "growth",
  customers: "premium",
  tasks: "premium",
  inventory: "premium",
  knowledge: "premium",
  integrations: "premium",
  "ai-actions": "premium",
  audit: "premium",
  files: "premium",
};

export function parseDemoTier(value: string | null | undefined): DemoTier {
  const tier = String(value || "").toLowerCase();
  return tier === "starter" || tier === "growth" || tier === "premium" ? tier : "premium";
}

export function allowsDemoTier(current: DemoTier, minimum: DemoTier) {
  return tierRank[current] >= tierRank[minimum];
}

export function canViewPublic(current: DemoTier, view: PublicView) {
  return allowsDemoTier(current, publicViewMinimum[view]);
}

export function canViewSection(current: DemoTier, section: Section) {
  return allowsDemoTier(current, sectionMinimum[section]);
}

export const demoTierLabel: Record<DemoTier, string> = {
  starter: "STARTER DEMO",
  growth: "GROWTH DEMO",
  premium: "PREMIUM DEMO",
};
