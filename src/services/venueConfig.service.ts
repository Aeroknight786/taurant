import { Prisma } from '@prisma/client';
import { z } from 'zod';
import { prisma } from '../config/database';
import { AppError } from '../middleware/errorHandler';

function optionalTrimmedString(max: number) {
  return z.preprocess((value) => {
    if (value == null) return undefined;
    const trimmed = String(value).trim();
    return trimmed || undefined;
  }, z.string().min(1).max(max).optional());
}

function optionalUrl() {
  return z.preprocess((value) => {
    if (value == null) return undefined;
    const trimmed = String(value).trim();
    return trimmed || undefined;
  }, z.string().url().optional());
}

function optionalHexColor() {
  return z.preprocess((value) => {
    if (value == null) return undefined;
    const trimmed = String(value).trim();
    return trimmed || undefined;
  }, z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional());
}

export const VenueThemeKeySchema = z.enum(['default', 'craftery']);
export const VenueQueueDispatchModeSchema = z.enum(['AUTO_TABLE', 'MANUAL_NOTIFY']);
export const VenueTableSourceModeSchema = z.enum(['MANUAL', 'TMS', 'HYBRID']);
export const VenueJoinConfirmationModeSchema = z.enum(['WEB_ONLY', 'WHATSAPP', 'WHATSAPP_SMS']);
export const VenueReadyNotificationChannelSchema = z.enum(['WHATSAPP', 'SMS', 'IVR']);
export const VenueGuestWaitFormulaSchema = z.enum(['LEGACY_TURN_HEURISTIC', 'SUBKO_FIXED_V1']);
export const VenueContentModeSchema = z.enum(['DEFAULT', 'SUBKO_WAIT_CONTENT']);

export const VenueBrandConfigSchema = z.object({
  displayName: optionalTrimmedString(120),
  shortName: optionalTrimmedString(60),
  tagline: optionalTrimmedString(160),
  logoUrl: optionalUrl(),
  themeKey: VenueThemeKeySchema.optional(),
  themeColor: optionalHexColor(),
}).strict();

export const VenueFeatureConfigSchema = z.object({
  guestQueue: z.boolean().optional(),
  preOrder: z.boolean().optional(),
  partyShare: z.boolean().optional(),
  seatedOrdering: z.boolean().optional(),
  finalPayment: z.boolean().optional(),
  staffConsole: z.boolean().optional(),
  adminConsole: z.boolean().optional(),
  flowLog: z.boolean().optional(),
  historyTab: z.boolean().optional(),
  refunds: z.boolean().optional(),
  offlineSettle: z.boolean().optional(),
  bulkClear: z.boolean().optional(),
}).strict();

export const VenueUiConfigSchema = z.object({
  landingMode: z.enum(['venue']).optional(),
  defaultGuestTray: z.enum(['menu', 'bucket', 'ordered']).optional(),
  showContinueEntry: z.boolean().optional(),
  supportCopy: optionalTrimmedString(240),
}).strict();

export const VenueOpsConfigSchema = z.object({
  queueDispatchMode: VenueQueueDispatchModeSchema.optional(),
  tableSourceMode: VenueTableSourceModeSchema.optional(),
  joinConfirmationMode: VenueJoinConfirmationModeSchema.optional(),
  readyNotificationChannels: z.array(VenueReadyNotificationChannelSchema).min(1).optional(),
  readyReminderEnabled: z.boolean().optional(),
  readyReminderOffsetMin: z.number().int().min(1).max(15).optional(),
  expiryNotificationEnabled: z.boolean().optional(),
  guestWaitFormula: VenueGuestWaitFormulaSchema.optional(),
  contentMode: VenueContentModeSchema.optional(),
}).strict();

export type VenueBrandConfig = z.infer<typeof VenueBrandConfigSchema>;
export type VenueFeatureConfig = z.infer<typeof VenueFeatureConfigSchema>;
export type VenueUiConfig = z.infer<typeof VenueUiConfigSchema>;
export type VenueOpsConfig = z.infer<typeof VenueOpsConfigSchema>;

export type ResolvedVenueBrandConfig = {
  displayName: string;
  shortName: string;
  tagline: string;
  logoUrl: string | null;
  themeKey: z.infer<typeof VenueThemeKeySchema>;
  themeColor: string;
};

export type ResolvedVenueFeatureConfig = Required<VenueFeatureConfig>;
export type ResolvedVenueUiConfig = {
  landingMode: 'venue';
  defaultGuestTray: 'menu' | 'bucket' | 'ordered';
  showContinueEntry: boolean;
  supportCopy: string;
};

export type ResolvedVenueOpsConfig = {
  queueDispatchMode: z.infer<typeof VenueQueueDispatchModeSchema>;
  tableSourceMode: z.infer<typeof VenueTableSourceModeSchema>;
  joinConfirmationMode: z.infer<typeof VenueJoinConfirmationModeSchema>;
  readyNotificationChannels: Array<z.infer<typeof VenueReadyNotificationChannelSchema>>;
  readyReminderEnabled: boolean;
  readyReminderOffsetMin: number;
  expiryNotificationEnabled: boolean;
  guestWaitFormula: z.infer<typeof VenueGuestWaitFormulaSchema>;
  contentMode: z.infer<typeof VenueContentModeSchema>;
};

export type ResolvedVenueConfig = {
  brandConfig: ResolvedVenueBrandConfig;
  featureConfig: ResolvedVenueFeatureConfig;
  uiConfig: ResolvedVenueUiConfig;
  opsConfig: ResolvedVenueOpsConfig;
};

export type VenueFeatureKey = keyof ResolvedVenueFeatureConfig;

type VenueConfigSource = {
  id: string;
  name: string;
  slug: string;
  city?: string;
  isQueueOpen?: boolean;
  brandConfig?: Prisma.JsonValue | null;
  featureConfig?: Prisma.JsonValue | null;
  uiConfig?: Prisma.JsonValue | null;
  opsConfig?: Prisma.JsonValue | null;
};

const THEME_PRESET_DEFAULTS: Record<z.infer<typeof VenueThemeKeySchema>, { themeColor: string }> = {
  default: {
    themeColor: '#141210',
  },
  craftery: {
    themeColor: '#1E1A16',
  },
};

const DEFAULT_VENUE_FEATURE_CONFIG: ResolvedVenueFeatureConfig = {
  guestQueue: true,
  preOrder: true,
  partyShare: true,
  seatedOrdering: true,
  finalPayment: true,
  staffConsole: true,
  adminConsole: true,
  flowLog: true,
  historyTab: true,
  refunds: true,
  offlineSettle: true,
  bulkClear: true,
};

const DEFAULT_VENUE_UI_CONFIG: ResolvedVenueUiConfig = {
  landingMode: 'venue',
  defaultGuestTray: 'menu',
  showContinueEntry: true,
  supportCopy: 'No app download. Use your phone number as your queue identity and receive a seating OTP instantly.',
};

const DEFAULT_VENUE_OPS_CONFIG: ResolvedVenueOpsConfig = {
  queueDispatchMode: 'AUTO_TABLE',
  tableSourceMode: 'MANUAL',
  joinConfirmationMode: 'WHATSAPP',
  readyNotificationChannels: ['WHATSAPP'],
  readyReminderEnabled: false,
  readyReminderOffsetMin: 1,
  expiryNotificationEnabled: false,
  guestWaitFormula: 'LEGACY_TURN_HEURISTIC',
  contentMode: 'DEFAULT',
};

const FEATURE_DISABLED_MESSAGES: Record<VenueFeatureKey, string> = {
  guestQueue: 'Guest queue is disabled for this venue.',
  preOrder: 'Pre-orders are disabled for this venue.',
  partyShare: 'Shared party sessions are disabled for this venue.',
  seatedOrdering: 'At-table ordering is disabled for this venue.',
  finalPayment: 'Final online payment is disabled for this venue.',
  staffConsole: 'Staff console is disabled for this venue.',
  adminConsole: 'Admin console is disabled for this venue.',
  flowLog: 'Flow log is disabled for this venue.',
  historyTab: 'History view is disabled for this venue.',
  refunds: 'Refunds are disabled for this venue.',
  offlineSettle: 'Offline settlement is disabled for this venue.',
  bulkClear: 'Bulk clear actions are disabled for this venue.',
};

function parseStoredConfig<T extends z.ZodTypeAny>(schema: T, raw: Prisma.JsonValue | null | undefined): z.infer<T> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return {} as z.infer<T>;
  }

  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return {} as z.infer<T>;
  }

  return parsed.data;
}

export function resolveVenueConfig(source: VenueConfigSource): ResolvedVenueConfig {
  const rawBrandConfig = parseStoredConfig(VenueBrandConfigSchema, source.brandConfig);
  const rawFeatureConfig = parseStoredConfig(VenueFeatureConfigSchema, source.featureConfig);
  const rawUiConfig = parseStoredConfig(VenueUiConfigSchema, source.uiConfig);
  const rawOpsConfig = parseStoredConfig(VenueOpsConfigSchema, source.opsConfig);

  const themeKey = rawBrandConfig.themeKey ?? 'default';
  const themePreset = THEME_PRESET_DEFAULTS[themeKey];

  return {
    brandConfig: {
      displayName: rawBrandConfig.displayName ?? source.name,
      shortName: rawBrandConfig.shortName ?? rawBrandConfig.displayName ?? source.name,
      tagline: rawBrandConfig.tagline ?? 'Queue · Pre-order · Pay',
      logoUrl: rawBrandConfig.logoUrl ?? null,
      themeKey,
      themeColor: rawBrandConfig.themeColor ?? themePreset.themeColor,
    },
    featureConfig: {
      ...DEFAULT_VENUE_FEATURE_CONFIG,
      ...rawFeatureConfig,
    },
    uiConfig: {
      ...DEFAULT_VENUE_UI_CONFIG,
      ...rawUiConfig,
    },
    opsConfig: {
      ...DEFAULT_VENUE_OPS_CONFIG,
      ...rawOpsConfig,
    },
  };
}

function toJsonValue(value: Record<string, unknown>): Prisma.InputJsonValue | undefined {
  const entries = Object.entries(value).filter(([, entryValue]) => entryValue !== undefined);
  if (!entries.length) {
    return undefined;
  }
  return Object.fromEntries(entries) as Prisma.InputJsonValue;
}

export function buildVenueConfigPatch(source: VenueConfigSource, patch: {
  brandConfig?: VenueBrandConfig;
  featureConfig?: VenueFeatureConfig;
  uiConfig?: VenueUiConfig;
  opsConfig?: VenueOpsConfig;
}) {
  const existingBrandConfig = parseStoredConfig(VenueBrandConfigSchema, source.brandConfig);
  const existingFeatureConfig = parseStoredConfig(VenueFeatureConfigSchema, source.featureConfig);
  const existingUiConfig = parseStoredConfig(VenueUiConfigSchema, source.uiConfig);
  const existingOpsConfig = parseStoredConfig(VenueOpsConfigSchema, source.opsConfig);

  return {
    ...(patch.brandConfig ? { brandConfig: toJsonValue({ ...existingBrandConfig, ...patch.brandConfig }) } : {}),
    ...(patch.featureConfig ? { featureConfig: toJsonValue({ ...existingFeatureConfig, ...patch.featureConfig }) } : {}),
    ...(patch.uiConfig ? { uiConfig: toJsonValue({ ...existingUiConfig, ...patch.uiConfig }) } : {}),
    ...(patch.opsConfig ? { opsConfig: toJsonValue({ ...existingOpsConfig, ...patch.opsConfig }) } : {}),
  };
}

export async function getResolvedVenueConfigById(venueId: string): Promise<ResolvedVenueConfig> {
  const venue = await prisma.venue.findUnique({
    where: { id: venueId },
    select: {
      id: true,
      name: true,
      slug: true,
      brandConfig: true,
      featureConfig: true,
      uiConfig: true,
      opsConfig: true,
    },
  });

  if (!venue) {
    throw new AppError('Venue not found', 404);
  }

  return resolveVenueConfig(venue);
}

export async function assertVenueFeatureEnabled(venueId: string, feature: VenueFeatureKey): Promise<ResolvedVenueConfig> {
  const config = await getResolvedVenueConfigById(venueId);
  if (!config.featureConfig[feature]) {
    throw new AppError(FEATURE_DISABLED_MESSAGES[feature], 403, 'VENUE_FEATURE_DISABLED');
  }
  return config;
}

export function mapVenueToPublicSummary(source: VenueConfigSource) {
  const config = resolveVenueConfig(source);
  return {
    id: source.id,
    slug: source.slug,
    name: source.name,
    city: source.city ?? '',
    isQueueOpen: Boolean(source.isQueueOpen),
    brandConfig: {
      displayName: config.brandConfig.displayName,
      shortName: config.brandConfig.shortName,
      tagline: config.brandConfig.tagline,
      logoUrl: config.brandConfig.logoUrl,
      themeKey: config.brandConfig.themeKey,
      themeColor: config.brandConfig.themeColor,
    },
    featureConfig: {
      guestQueue: config.featureConfig.guestQueue,
      preOrder: config.featureConfig.preOrder,
      staffConsole: config.featureConfig.staffConsole,
      adminConsole: config.featureConfig.adminConsole,
    },
    uiConfig: {
      landingMode: config.uiConfig.landingMode,
      showContinueEntry: config.uiConfig.showContinueEntry,
      supportCopy: config.uiConfig.supportCopy,
    },
  };
}

export const venueFeatureDisabledMessages = FEATURE_DISABLED_MESSAGES;

export function isManualQueueDispatchConfig(config: Pick<ResolvedVenueConfig, 'opsConfig'> | ResolvedVenueOpsConfig): boolean {
  const opsConfig = 'opsConfig' in config ? config.opsConfig : config;
  return opsConfig.queueDispatchMode === 'MANUAL_NOTIFY';
}

export function shouldSendJoinQueueNotification(config: Pick<ResolvedVenueConfig, 'opsConfig'> | ResolvedVenueOpsConfig): boolean {
  const opsConfig = 'opsConfig' in config ? config.opsConfig : config;
  return opsConfig.joinConfirmationMode !== 'WEB_ONLY';
}
