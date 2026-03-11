import { z } from "zod/v4";

const slugRegex = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

const tagSchema = z.string().min(1).max(50);

const baseSchema = z.object({
  name: z.string().min(1, "Name is required").max(100),
  slug: z
    .string()
    .min(1, "Slug is required")
    .max(50)
    .regex(slugRegex, "Slug must be lowercase alphanumeric with hyphens"),
  protocol: z.enum(["OIDC", "SAML"]),
  buttonColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional().nullable(),
  tags: z.array(tagSchema).max(10).optional(),
});

const KeyValueParamSchema = z.object({
  key: z.string().min(1, "Key is required").max(100),
  value: z.string().max(500).default(""),
});

const oidcFields = z.object({
  issuerUrl: z.url("Invalid issuer URL"),
  clientId: z.string().min(1, "Client ID is required"),
  clientSecret: z.string().min(1, "Client Secret is required"),
  scopes: z.string().optional().nullable(),
  customAuthParams: z.array(KeyValueParamSchema).optional(),
  pkceMode: z.enum(["S256", "PLAIN", "NONE"]).optional(),
  usePar: z.boolean().optional(),
});

const samlFields = z.object({
  entryPoint: z.url("Invalid entry point URL"),
  samlLogoutUrl: z.url("Invalid single logout URL").optional().nullable(),
  issuer: z.string().min(1, "Issuer is required"),
  idpCert: z.string().min(1, "IdP Certificate is required"),
  nameIdFormat: z.string().optional().nullable(),
  requestedAuthnContext: z.string().max(300).optional().nullable(),
  forceAuthnDefault: z.boolean().optional(),
  isPassiveDefault: z.boolean().optional(),
  samlSignatureAlgorithm: z.enum(["SHA1", "SHA256"]).optional(),
  clockSkewToleranceSeconds: z.number().int().min(0).max(300).optional(),
  signAuthnRequests: z.boolean().optional(),
  spSigningPrivateKey: z.string().optional().nullable(),
  spSigningCert: z.string().optional().nullable(),
  spEncryptionPrivateKey: z.string().optional().nullable(),
  spEncryptionCert: z.string().optional().nullable(),
});

export const CreateAppInstanceSchema = z.discriminatedUnion("protocol", [
  baseSchema
    .extend({ protocol: z.literal("OIDC") })
    .merge(oidcFields)
    .extend({
      entryPoint: z.string().optional().nullable(),
      samlLogoutUrl: z.string().optional().nullable(),
      issuer: z.string().optional().nullable(),
      idpCert: z.string().optional().nullable(),
      nameIdFormat: z.string().optional().nullable(),
      requestedAuthnContext: z.string().max(300).optional().nullable(),
      forceAuthnDefault: z.boolean().optional(),
      isPassiveDefault: z.boolean().optional(),
      samlSignatureAlgorithm: z.enum(["SHA1", "SHA256"]).optional(),
      clockSkewToleranceSeconds: z.number().int().min(0).max(300).optional(),
      signAuthnRequests: z.boolean().optional(),
      spSigningPrivateKey: z.string().optional().nullable(),
      spSigningCert: z.string().optional().nullable(),
      spEncryptionPrivateKey: z.string().optional().nullable(),
      spEncryptionCert: z.string().optional().nullable(),
    }),
  baseSchema
    .extend({ protocol: z.literal("SAML") })
    .merge(samlFields)
    .extend({
      issuerUrl: z.string().optional().nullable(),
      clientId: z.string().optional().nullable(),
      clientSecret: z.string().optional().nullable(),
      scopes: z.string().optional().nullable(),
      customAuthParams: z.array(KeyValueParamSchema).optional(),
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
  customAuthParams: z.array(KeyValueParamSchema).optional(),
  pkceMode: z.enum(["S256", "PLAIN", "NONE"]).optional(),
  usePar: z.boolean().optional(),
  entryPoint: z.string().url().optional().nullable(),
  samlLogoutUrl: z.string().url().optional().nullable(),
  issuer: z.string().optional().nullable(),
  idpCert: z.string().optional().nullable(),
  nameIdFormat: z.string().optional().nullable(),
  requestedAuthnContext: z.string().max(300).optional().nullable(),
  forceAuthnDefault: z.boolean().optional(),
  isPassiveDefault: z.boolean().optional(),
  samlSignatureAlgorithm: z.enum(["SHA1", "SHA256"]).optional(),
  clockSkewToleranceSeconds: z.number().int().min(0).max(300).optional(),
  signAuthnRequests: z.boolean().optional(),
  spSigningPrivateKey: z.string().optional().nullable(),
  spSigningCert: z.string().optional().nullable(),
  spEncryptionPrivateKey: z.string().optional().nullable(),
  spEncryptionCert: z.string().optional().nullable(),
  buttonColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional().nullable(),
  tags: z.array(tagSchema).max(10).optional(),
});

export const TransferAppSchema = z.object({
  mode: z.enum(["MOVE", "COPY"]),
  targetTeamId: z.string().min(1, "targetTeamId is required"),
});

export type CreateAppInstanceInput = z.infer<typeof CreateAppInstanceSchema>;
export type UpdateAppInstanceInput = z.infer<typeof UpdateAppInstanceSchema>;

export const RegisterSchema = z.object({
  email: z.email("Invalid email address"),
  name: z.string().min(1, "Name is required").max(100),
  password: z.string().min(8, "Password must be at least 8 characters").max(128),
});

export const LoginSchema = z.object({
  email: z.email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

export const LoginMfaTotpSchema = z.object({
  code: z.string().regex(/^\d{6}$/, "TOTP code must be 6 digits"),
});

export const VerifyEmailResendSchema = z.object({
  email: z.email("Invalid email address"),
});

export const PasswordResetRequestSchema = z.object({
  email: z.email("Invalid email address"),
});

export const PasswordResetCompleteSchema = z.object({
  token: z.string().min(1, "Token is required"),
  newPassword: z.string().min(8).max(128),
  totpCode: z
    .string()
    .regex(/^\d{6}$/)
    .optional(),
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

export const TotpSetupVerifySchema = z.object({
  code: z.string().regex(/^\d{6}$/, "TOTP code must be 6 digits"),
});

export const TotpDisableSchema = z.object({
  currentPassword: z.string().min(1, "Current password is required"),
  code: z.string().regex(/^\d{6}$/, "TOTP code must be 6 digits"),
});

export const PasskeyAssertionSchema = z.object({
  response: z.unknown(),
});

export const PasskeyRegistrationSchema = z.object({
  response: z.unknown(),
});

export const PasskeyLoginOptionsSchema = z.object({
  email: z.email("Invalid email address").optional(),
});

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

export const UpdateSystemSettingSchema = z.object({
  key: z.string().min(1),
  value: z.string(),
});

export const EmailProviderTypeSchema = z.enum(["SMTP", "BREVO"]);

const OptionalNonEmptyStringSchema = z.preprocess((value) => {
  if (typeof value !== "string") {
    return value;
  }

  const trimmed = value.trim();
  return trimmed.length === 0 ? undefined : trimmed;
}, z.string().min(1).optional());

export const SmtpConfigSchema = z.object({
  host: z.string().min(1),
  port: z.number().int().min(1).max(65535),
  secure: z.boolean(),
  username: z.string().min(1),
  password: OptionalNonEmptyStringSchema,
  fromName: z.string().min(1).max(100),
  fromEmail: z.email(),
});

export const BrevoConfigSchema = z.object({
  apiKey: OptionalNonEmptyStringSchema,
  fromName: z.string().min(1).max(100),
  fromEmail: z.email(),
});

export const UpdateEmailProviderSchema = z.object({
  activeProvider: EmailProviderTypeSchema,
  smtp: SmtpConfigSchema.optional(),
  brevo: BrevoConfigSchema.optional(),
});

export const TestEmailProviderSchema = z.object({
  provider: EmailProviderTypeSchema,
  recipientEmail: z.email(),
  smtp: SmtpConfigSchema.optional(),
  brevo: BrevoConfigSchema.optional(),
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
  isVerified: z.boolean().optional(),
  mfaEnabled: z.boolean().optional(),
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
