import { z } from "zod/v4";

const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const baseSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  slug: z
    .string()
    .min(1, "Slug is required")
    .max(50)
    .regex(slugRegex, "Slug must be lowercase alphanumeric with hyphens"),
  protocol: z.enum(["OIDC", "SAML"]),
  buttonColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional().nullable(),
});

const oidcFields = z.object({
  issuerUrl: z.url("Invalid issuer URL"),
  clientId: z.string().min(1, "Client ID is required"),
  clientSecret: z.string().min(1, "Client Secret is required"),
  scopes: z.string().optional().nullable(),
});

const samlFields = z.object({
  entryPoint: z.url("Invalid entry point URL"),
  issuer: z.string().min(1, "Issuer is required"),
  idpCert: z.string().min(1, "IdP Certificate is required"),
});

export const CreateAppInstanceSchema = z.discriminatedUnion("protocol", [
  baseSchema
    .extend({ protocol: z.literal("OIDC") })
    .merge(oidcFields)
    .extend({
      entryPoint: z.string().optional().nullable(),
      issuer: z.string().optional().nullable(),
      idpCert: z.string().optional().nullable(),
    }),
  baseSchema
    .extend({ protocol: z.literal("SAML") })
    .merge(samlFields)
    .extend({
      issuerUrl: z.string().optional().nullable(),
      clientId: z.string().optional().nullable(),
      clientSecret: z.string().optional().nullable(),
      scopes: z.string().optional().nullable(),
    }),
]);

export const UpdateAppInstanceSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  slug: z
    .string()
    .min(1)
    .max(50)
    .regex(slugRegex, "Slug must be lowercase alphanumeric with hyphens")
    .optional(),
  issuerUrl: z.string().url().optional().nullable(),
  clientId: z.string().optional().nullable(),
  clientSecret: z.string().optional().nullable(),
  scopes: z.string().optional().nullable(),
  entryPoint: z.string().url().optional().nullable(),
  issuer: z.string().optional().nullable(),
  idpCert: z.string().optional().nullable(),
  buttonColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional().nullable(),
});

export const TransferAppSchema = z.object({
  mode: z.enum(["MOVE", "COPY"]),
  targetTeamId: z.string().min(1, "targetTeamId is required"),
});

export type CreateAppInstanceInput = z.infer<typeof CreateAppInstanceSchema>;
export type UpdateAppInstanceInput = z.infer<typeof UpdateAppInstanceSchema>;

// User auth schemas
export const RegisterSchema = z.object({
  email: z.email("Invalid email address"),
  name: z.string().min(1, "Name is required").max(100),
  password: z.string().min(8, "Password must be at least 8 characters").max(128),
});

export const LoginSchema = z.object({
  email: z.email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export const UpdateUserSchema = z
  .object({
    name: z.string().min(1).max(100).optional(),
    email: z.email().optional(),
    currentPassword: z.string().optional(),
    newPassword: z.string().min(8).max(128).optional(),
  })
  .refine((data) => !data.newPassword || data.currentPassword, {
    message: "Current password required to set new password",
  });

// Team schemas
export const CreateTeamSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  slug: z
    .string()
    .min(1, "Slug is required")
    .max(50)
    .regex(slugRegex, "Slug must be lowercase alphanumeric with hyphens"),
});

export const UpdateTeamSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  slug: z
    .string()
    .min(1)
    .max(50)
    .regex(slugRegex, "Slug must be lowercase alphanumeric with hyphens")
    .optional(),
});

// Invite schemas
export const CreateInviteSchema = z.object({
  email: z.email("Invalid email address"),
  role: z.enum(["ADMIN", "MEMBER"]),
});

export const AcceptInviteSchema = z.object({
  token: z.string().min(1, "Token is required"),
});

export const AddOrInviteMemberSchema = z.object({
  email: z.email("Invalid email address"),
  role: z.enum(["ADMIN", "MEMBER"]),
});

// Admin schemas
export const UpdateSystemSettingSchema = z.object({
  key: z.string().min(1),
  value: z.string(),
});

const TeamMembershipAssignmentSchema = z.object({
  teamId: z.string().min(1, "teamId is required"),
  role: z.enum(["ADMIN", "MEMBER"]),
});

export const AdminCreateUserSchema = z.object({
  email: z.email("Invalid email address"),
  name: z.string().min(1, "Name is required").max(100),
  tempPassword: z.string().min(8, "Temporary password must be at least 8 characters").max(128),
  isSystemAdmin: z.boolean().optional().default(false),
  memberships: z.array(TeamMembershipAssignmentSchema).optional().default([]),
});

export const AdminUpdateUserSchema = z.object({
  email: z.email("Invalid email address").optional(),
  name: z.string().min(1).max(100).optional(),
  isSystemAdmin: z.boolean().optional(),
  mustChangePassword: z.boolean().optional(),
  tempPassword: z.string().min(8).max(128).optional(),
});

export const AdminSetUserTeamsSchema = z.object({
  memberships: z.array(TeamMembershipAssignmentSchema).default([]),
});

export const CreateTeamJoinRequestSchema = z.object({
  note: z.string().max(500).optional(),
  role: z.enum(["ADMIN", "MEMBER"]).default("MEMBER"),
});

export const ReviewTeamJoinRequestSchema = z.object({
  action: z.enum(["approve", "reject"]),
  role: z.enum(["ADMIN", "MEMBER"]).optional(),
});
