import { z } from "zod";
import { AppRole } from "@shared/auth/permissions";
import { NormalizedEmail } from "./email";

export const TeamRoleSchema = z.enum([AppRole.OWNER, AppRole.MANAGER, AppRole.STAFF]);

export const TeamMemberSchema = z.object({
  id: z.string(),
  userId: z.string(),
  name: z.string(),
  email: z.email(),
  role: TeamRoleSchema,
  createdAt: z.string(),
});

export type TeamMember = z.infer<typeof TeamMemberSchema>;

export const InvitationStatusSchema = z.enum([
  "pending",
  "accepted",
  "rejected",
  "canceled",
  "expired",
]);

export const TeamInvitationSchema = z.object({
  id: z.string(),
  email: z.email(),
  role: TeamRoleSchema,
  status: InvitationStatusSchema,
  expiresAt: z.string(),
  createdAt: z.string(),
  acceptUrl: z.url(),
});

export type TeamInvitation = z.infer<typeof TeamInvitationSchema>;

export const TeamOverviewSchema = z.object({
  members: z.array(TeamMemberSchema),
  invitations: z.array(TeamInvitationSchema),
});

export type TeamOverview = z.infer<typeof TeamOverviewSchema>;

export const InviteTeamMemberSchema = z.object({
  email: NormalizedEmail,
  role: TeamRoleSchema,
  resend: z.boolean().optional().default(false),
});

export type InviteTeamMemberInput = z.infer<typeof InviteTeamMemberSchema>;

export const InviteTeamMemberResponseSchema = z.object({
  invitation: TeamInvitationSchema,
  delivery: z.object({
    status: z.literal("queued"),
    message: z.string(),
  }),
});

export type InviteTeamMemberResponse = z.infer<typeof InviteTeamMemberResponseSchema>;

export const UpdateTeamMemberRoleSchema = z.object({ role: TeamRoleSchema });

export const InvitationRegistrationSchema = z.object({
  name: z.string().trim().min(2).max(100),
  password: z.string().min(8).max(72),
});

export const InvitationPublicSchema = TeamInvitationSchema.pick({
  id: true,
  email: true,
  role: true,
  status: true,
  expiresAt: true,
}).extend({
  organizationName: z.string(),
  actionable: z.boolean(),
});

export type InvitationPublic = z.infer<typeof InvitationPublicSchema>;

export const TeamMutationResponseSchema = z.object({ success: z.literal(true) });
