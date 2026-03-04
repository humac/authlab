import { NextResponse } from "next/server";
import { z } from "zod/v4";
import {
  MetadataFetchError,
  MetadataFormatError,
  MetadataUrlBlockedError,
  MetadataValidationError,
  fetchAndParseIdpMetadata,
  parseIdpMetadata,
} from "@/lib/saml-metadata";

const ImportMetadataSchema = z.discriminatedUnion("source", [
  z.object({
    source: z.literal("xml"),
    xml: z.string().min(1, "Metadata XML is required"),
  }),
  z.object({
    source: z.literal("url"),
    url: z.url("Metadata URL must be a valid URL"),
  }),
]);

export async function POST(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json(
      { error: "Invalid JSON body" },
      { status: 400 },
    );
  }

  const parsed = ImportMetadataSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Validation failed", issues: parsed.error.issues },
      { status: 400 },
    );
  }

  try {
    const result =
      parsed.data.source === "xml"
        ? await parseIdpMetadata(parsed.data.xml)
        : await fetchAndParseIdpMetadata(parsed.data.url);

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    if (error instanceof MetadataUrlBlockedError) {
      return NextResponse.json(
        { error: error.message },
        { status: 403 },
      );
    }
    if (error instanceof MetadataValidationError) {
      return NextResponse.json(
        { error: error.message },
        { status: 422 },
      );
    }
    if (error instanceof MetadataFetchError) {
      return NextResponse.json(
        { error: error.message },
        { status: 502 },
      );
    }
    if (error instanceof MetadataFormatError) {
      return NextResponse.json(
        { error: error.message },
        { status: 400 },
      );
    }
    throw error;
  }
}
