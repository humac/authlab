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

export type CreateAppInstanceInput = z.infer<typeof CreateAppInstanceSchema>;
export type UpdateAppInstanceInput = z.infer<typeof UpdateAppInstanceSchema>;
