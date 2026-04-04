// Barrel: registers all meeting sub-routes

import { registerMeetingListRoutes } from './crud-list';
import { registerMeetingDetailRoutes } from './crud-detail';
import { registerMeetingMutateRoutes } from './crud-mutate';
import { registerWorkflowRoutes } from './workflow';
import { registerCloseVotingRoutes } from './close-voting';
import { registerVotingRoutes } from './voting';
import { registerReconsiderationRoutes } from './reconsideration';
import { registerScheduleRoutes } from './schedule';
import { registerOTPRoutes } from './otp';
import { registerProtocolRoutes } from './protocol';
import { registerProtocolSignRoutes } from './protocol-sign';
import { registerProtocolHtmlRoutes } from './protocol-html';
import { registerProtocolDocRoutes } from './protocol-doc';
import { registerCommentRoutes } from './comments';
import { registerSettingsRoutes } from './settings';

// Re-export helpers used by other modules
export { getMeetingWithDetails, generateVoteHash, generateOTPCode } from './helpers';

export function registerMeetingRoutes() {
  registerMeetingListRoutes();
  registerMeetingDetailRoutes();
  registerMeetingMutateRoutes();
  registerWorkflowRoutes();
  registerCloseVotingRoutes();
  registerVotingRoutes();
  registerReconsiderationRoutes();
  registerScheduleRoutes();
  registerOTPRoutes();
  registerProtocolRoutes();
  registerProtocolSignRoutes();
  registerProtocolHtmlRoutes();
  registerProtocolDocRoutes();
  registerCommentRoutes();
  registerSettingsRoutes();
}
