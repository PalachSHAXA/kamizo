// Barrel — registers all misc sub-modules

import { registerWebSocketRoutes } from './websocket';
import { registerChatChannelRoutes } from './chat-channels';
import { registerChatReadRoutes } from './chat-read';
import { registerChatMessageRoutes } from './chat-messages';
import { registerNotesRoutes } from './notes';
import { registerAnnouncementListRoutes } from './announcements-list';
import { registerAnnouncementMutationRoutes } from './announcements-mutations';
import { registerAnnouncementViewRoutes } from './announcements-views';
import { registerRatingsRoutes } from './ratings';
import { registerStatsRoutes } from './stats';
import { registerSettingsRoutes } from './settings';
import { registerHealthRoutes } from './health';
import { registerPaymentRoutes } from './payments';

export function registerMiscRoutes() {
  registerWebSocketRoutes();
  registerChatChannelRoutes();
  registerChatReadRoutes();
  registerChatMessageRoutes();
  registerNotesRoutes();
  registerAnnouncementListRoutes();
  registerAnnouncementMutationRoutes();
  registerAnnouncementViewRoutes();
  registerRatingsRoutes();
  registerStatsRoutes();
  registerSettingsRoutes();
  registerHealthRoutes();
  registerPaymentRoutes();
}
