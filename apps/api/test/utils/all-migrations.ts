import { InitUsers1784388727774 } from '../../src/database/migrations/1784388727774-InitUsers';
import { InitProblems1784388980702 } from '../../src/database/migrations/1784388980702-InitProblems';
import { InitClassrooms1784389334962 } from '../../src/database/migrations/1784389334962-InitClassrooms';
import { InitAssignments1784389613287 } from '../../src/database/migrations/1784389613287-InitAssignments';
import { InitSubmissions1784390487648 } from '../../src/database/migrations/1784390487648-InitSubmissions';
import { InitGrading1784390834115 } from '../../src/database/migrations/1784390834115-InitGrading';
import { InitDemo1784390961571 } from '../../src/database/migrations/1784390961571-InitDemo';
import { DropRedundantIndexes1784404788981 } from '../../src/database/migrations/1784404788981-DropRedundantIndexes';
import { AddAiGenerationTables1784409505122 } from '../../src/database/migrations/1784409505122-AddAiGenerationTables';
import { AddBillingTables1784431044465 } from '../../src/database/migrations/1784431044465-AddBillingTables';
import { AddNotifications1784500000000 } from '../../src/database/migrations/1784500000000-AddNotifications';
import { NotificationTypeToVarchar1784600000000 } from '../../src/database/migrations/1784600000000-NotificationTypeToVarchar';
import { AddOnboardingTables1784700000000 } from '../../src/database/migrations/1784700000000-AddOnboardingTables';
import { AddProblemCatalog1784800000000 } from '../../src/database/migrations/1784800000000-AddProblemCatalog';
import { AddBatchesAndAssignmentTargeting1784900000000 } from '../../src/database/migrations/1784900000000-AddBatchesAndAssignmentTargeting';
import { AddAssignmentItems1785000000000 } from '../../src/database/migrations/1785000000000-AddAssignmentItems';
import { GeneralizeSubmissionTarget1785100000000 } from '../../src/database/migrations/1785100000000-GeneralizeSubmissionTarget';
import { AddModuleAccess1785200000000 } from '../../src/database/migrations/1785200000000-AddModuleAccess';
import { AddGamification1785300000000 } from '../../src/database/migrations/1785300000000-AddGamification';
import { AddOrganizations1785400000000 } from '../../src/database/migrations/1785400000000-AddOrganizations';
import { AddOrgToClassrooms1785420000000 } from '../../src/database/migrations/1785420000000-AddOrgToClassrooms';
import { AddOrgToAssignmentsSubmissionsGamification1785440000000 } from '../../src/database/migrations/1785440000000-AddOrgToAssignmentsSubmissionsGamification';
import { AddProblemScope1785450000000 } from '../../src/database/migrations/1785450000000-AddProblemScope';
import { AddClerkIdentityToUsers1785460000000 } from '../../src/database/migrations/1785460000000-AddClerkIdentityToUsers';
import { AddOrgInvitesMirror1785470000000 } from '../../src/database/migrations/1785470000000-AddOrgInvitesMirror';
import { OrgScopeModuleAccess1785480000000 } from '../../src/database/migrations/1785480000000-OrgScopeModuleAccess';
import { AddOrgModuleGrant1785490000000 } from '../../src/database/migrations/1785490000000-AddOrgModuleGrant';
import { AddOrgQuotas1785500000000 } from '../../src/database/migrations/1785500000000-AddOrgQuotas';
import { DropClerkIntegration1785510000000 } from '../../src/database/migrations/1785510000000-DropClerkIntegration';
import { RelaxUsersOrgRequired1785520000000 } from '../../src/database/migrations/1785520000000-RelaxUsersOrgRequired';
import { ReshapeOrgInvites1785530000000 } from '../../src/database/migrations/1785530000000-ReshapeOrgInvites';
import { DropProfessorInvites1785540000000 } from '../../src/database/migrations/1785540000000-DropProfessorInvites';
import { AddPasswordResetTokens1785550000000 } from '../../src/database/migrations/1785550000000-AddPasswordResetTokens';
import { AddProblemFeedback1785560000000 } from '../../src/database/migrations/1785560000000-AddProblemFeedback';
import { AddTopics1785570000000 } from '../../src/database/migrations/1785570000000-AddTopics';
import { ReserveLeagueContext1785580000000 } from '../../src/database/migrations/1785580000000-ReserveLeagueContext';

/**
 * EVERY migration, in timeline order — this IS the e2e schema.
 *
 * Listed statically rather than glob-loaded so ts-jest treats each one like any
 * other module. The cost of that is drift: adding a migration and forgetting this
 * list boots the suite against a stale schema, and the first symptom is a 42703
 * from an entity column no test mentions. That is how the list came to stop nine
 * migrations back at `AddGamification1785300000000`.
 *
 * `src/database/migrations-coverage.spec.ts` is the guard, and it is a UNIT spec
 * because CI runs `pnpm test`, never `test:e2e` (Docker). It imports THIS module
 * rather than `test-app.ts` on purpose: `test-app.ts` pulls in testcontainers,
 * which needs `test/utils/jest.setup.ts`'s polyfills and blows up under the unit
 * jest environment. Keep this file dependency-free apart from the migrations.
 */
export const ALL_MIGRATIONS = [
  InitUsers1784388727774,
  InitProblems1784388980702,
  InitClassrooms1784389334962,
  InitAssignments1784389613287,
  InitSubmissions1784390487648,
  InitGrading1784390834115,
  InitDemo1784390961571,
  DropRedundantIndexes1784404788981,
  AddAiGenerationTables1784409505122,
  AddBillingTables1784431044465,
  AddNotifications1784500000000,
  NotificationTypeToVarchar1784600000000,
  AddOnboardingTables1784700000000,
  AddProblemCatalog1784800000000,
  AddBatchesAndAssignmentTargeting1784900000000,
  AddAssignmentItems1785000000000,
  GeneralizeSubmissionTarget1785100000000,
  AddModuleAccess1785200000000,
  AddGamification1785300000000,
  AddOrganizations1785400000000,
  AddOrgToClassrooms1785420000000,
  AddOrgToAssignmentsSubmissionsGamification1785440000000,
  AddProblemScope1785450000000,
  AddClerkIdentityToUsers1785460000000,
  AddOrgInvitesMirror1785470000000,
  OrgScopeModuleAccess1785480000000,
  AddOrgModuleGrant1785490000000,
  AddOrgQuotas1785500000000,
  DropClerkIntegration1785510000000,
  RelaxUsersOrgRequired1785520000000,
  ReshapeOrgInvites1785530000000,
  DropProfessorInvites1785540000000,
  AddPasswordResetTokens1785550000000,
  AddProblemFeedback1785560000000,
  AddTopics1785570000000,
  ReserveLeagueContext1785580000000,
];
