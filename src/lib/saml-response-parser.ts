import { parseStringPromise, processors } from "xml2js";

type SamlTimingStatus = "active" | "future" | "expired" | "captured" | "missing";

export interface SamlSubjectConfirmation {
  method: string | null;
  recipient: string | null;
  inResponseTo: string | null;
  notOnOrAfter: string | null;
  status: SamlTimingStatus;
}

export interface SamlAttributeEntry {
  name: string;
  friendlyName: string | null;
  nameFormat: string | null;
  values: string[];
}

export interface SamlStructuredAssertion {
  parseError: string | null;
  encryptedAssertion: boolean;
  responseIssuer: string | null;
  assertionIssuer: string | null;
  responseStatus: string | null;
  responseIssueInstant: string | null;
  assertionIssueInstant: string | null;
  destination: string | null;
  inResponseTo: string | null;
  subject: {
    nameId: string | null;
    nameIdFormat: string | null;
    confirmations: SamlSubjectConfirmation[];
    posture: SamlTimingStatus;
  };
  conditions: {
    notBefore: string | null;
    notOnOrAfter: string | null;
    audiences: string[];
    status: SamlTimingStatus;
  };
  authn: {
    authnInstant: string | null;
    sessionIndex: string | null;
    sessionNotOnOrAfter: string | null;
    classRef: string | null;
    authorities: string[];
  };
  attributes: SamlAttributeEntry[];
}

function toArray<T>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function getRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function getAttrs(value: unknown): Record<string, string> {
  const record = getRecord(value);
  const attrs = record?.$;
  return attrs && typeof attrs === "object" && !Array.isArray(attrs)
    ? (attrs as Record<string, string>)
    : {};
}

function getFirstChild(
  value: Record<string, unknown> | null,
  key: string,
): Record<string, unknown> | null {
  return getRecord(toArray(value?.[key])[0]);
}

function getNodeText(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  const record = getRecord(value);
  if (!record) {
    return null;
  }

  if (typeof record._ === "string") {
    const trimmed = record._.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  return null;
}

function getLocalName(value: string | null): string | null {
  if (!value) {
    return null;
  }

  const segments = value.split(":");
  return segments[segments.length - 1] ?? value;
}

function evaluateWindow(
  notBefore: string | null,
  notOnOrAfter: string | null,
  now: Date,
): SamlTimingStatus {
  if (!notBefore && !notOnOrAfter) {
    return "missing";
  }

  if (notBefore) {
    const parsed = new Date(notBefore);
    if (!Number.isNaN(parsed.getTime()) && now < parsed) {
      return "future";
    }
  }

  if (notOnOrAfter) {
    const parsed = new Date(notOnOrAfter);
    if (!Number.isNaN(parsed.getTime()) && now >= parsed) {
      return "expired";
    }
  }

  return "active";
}

function evaluateSubjectConfirmation(
  confirmation: Record<string, unknown>,
  now: Date,
): SamlSubjectConfirmation {
  const attrs = getAttrs(confirmation);
  const data = getFirstChild(confirmation, "SubjectConfirmationData");
  const dataAttrs = getAttrs(data);
  const notOnOrAfter = dataAttrs.NotOnOrAfter ?? null;
  const status = notOnOrAfter
    ? evaluateWindow(null, notOnOrAfter, now)
    : data
      ? "captured"
      : "missing";

  return {
    method: attrs.Method ?? null,
    recipient: dataAttrs.Recipient ?? null,
    inResponseTo: dataAttrs.InResponseTo ?? null,
    notOnOrAfter,
    status,
  };
}

function collapsePosture(confirmations: SamlSubjectConfirmation[]): SamlTimingStatus {
  if (confirmations.length === 0) {
    return "missing";
  }

  if (confirmations.some((confirmation) => confirmation.status === "active")) {
    return "active";
  }

  if (confirmations.some((confirmation) => confirmation.status === "future")) {
    return "future";
  }

  if (confirmations.every((confirmation) => confirmation.status === "expired")) {
    return "expired";
  }

  return confirmations.some((confirmation) => confirmation.status === "captured")
    ? "captured"
    : "missing";
}

function normalizeAttributeValues(value: unknown): string[] {
  return toArray(value)
    .flatMap((entry) => {
      const text = getNodeText(entry);
      if (text) {
        return [text];
      }

      const record = getRecord(entry);
      if (!record) {
        return [];
      }

      return Object.values(record)
        .map((nested) => getNodeText(nested))
        .filter((nested): nested is string => Boolean(nested));
    })
    .filter((entry, index, all) => all.indexOf(entry) === index);
}

function emptyAssertion(parseError: string | null = null): SamlStructuredAssertion {
  return {
    parseError,
    encryptedAssertion: false,
    responseIssuer: null,
    assertionIssuer: null,
    responseStatus: null,
    responseIssueInstant: null,
    assertionIssueInstant: null,
    destination: null,
    inResponseTo: null,
    subject: {
      nameId: null,
      nameIdFormat: null,
      confirmations: [],
      posture: "missing",
    },
    conditions: {
      notBefore: null,
      notOnOrAfter: null,
      audiences: [],
      status: "missing",
    },
    authn: {
      authnInstant: null,
      sessionIndex: null,
      sessionNotOnOrAfter: null,
      classRef: null,
      authorities: [],
    },
    attributes: [],
  };
}

export async function parseSamlResponseXml(
  xml: string,
  now: Date = new Date(),
): Promise<SamlStructuredAssertion> {
  try {
    const parsed = await parseStringPromise(xml, {
      explicitArray: false,
      trim: true,
      attrkey: "$",
      charkey: "_",
      tagNameProcessors: [processors.stripPrefix],
      attrNameProcessors: [processors.stripPrefix],
    });

    const rootName = Object.keys(parsed)[0];
    const response = getRecord(parsed[rootName]);
    if (!response) {
      return emptyAssertion("The SAML response could not be parsed into a structured document.");
    }

    const responseAttrs = getAttrs(response);
    const assertion = getFirstChild(response, "Assertion");
    const assertionAttrs = getAttrs(assertion);
    const subject = getFirstChild(assertion, "Subject");
    const nameIdNode = getFirstChild(subject, "NameID");
    const conditions = getFirstChild(assertion, "Conditions");
    const authnStatement = getFirstChild(assertion, "AuthnStatement");
    const authnContext = getFirstChild(authnStatement, "AuthnContext");
    const confirmations = toArray(subject?.SubjectConfirmation)
      .map((confirmation) => getRecord(confirmation))
      .filter((confirmation): confirmation is Record<string, unknown> => Boolean(confirmation))
      .map((confirmation) => evaluateSubjectConfirmation(confirmation, now));
    const conditionsAttrs = getAttrs(conditions);
    const attributes = toArray(assertion?.AttributeStatement)
      .flatMap((statement) => toArray(getRecord(statement)?.Attribute))
      .map((attribute) => getRecord(attribute))
      .filter((attribute): attribute is Record<string, unknown> => Boolean(attribute))
      .map((attribute) => {
        const attrs = getAttrs(attribute);
        return {
          name: attrs.Name ?? "Unnamed attribute",
          friendlyName: attrs.FriendlyName ?? null,
          nameFormat: attrs.NameFormat ?? null,
          values: normalizeAttributeValues(attribute.AttributeValue),
        };
      });

    return {
      parseError: null,
      encryptedAssertion: Boolean(response.EncryptedAssertion) && !assertion,
      responseIssuer: getNodeText(response.Issuer),
      assertionIssuer: getNodeText(assertion?.Issuer),
      responseStatus:
        getAttrs(getFirstChild(getFirstChild(response, "Status"), "StatusCode")).Value ??
        getNodeText(getFirstChild(getFirstChild(response, "Status"), "StatusCode")),
      responseIssueInstant: responseAttrs.IssueInstant ?? null,
      assertionIssueInstant: assertionAttrs.IssueInstant ?? null,
      destination: responseAttrs.Destination ?? null,
      inResponseTo: responseAttrs.InResponseTo ?? null,
      subject: {
        nameId: getNodeText(nameIdNode),
        nameIdFormat: getAttrs(nameIdNode).Format ?? null,
        confirmations,
        posture: collapsePosture(confirmations),
      },
      conditions: {
        notBefore: conditionsAttrs.NotBefore ?? null,
        notOnOrAfter: conditionsAttrs.NotOnOrAfter ?? null,
        audiences: toArray(conditions?.AudienceRestriction)
          .flatMap((restriction) => toArray(getRecord(restriction)?.Audience))
          .map((audience) => getNodeText(audience))
          .filter((audience): audience is string => Boolean(audience)),
        status: evaluateWindow(
          conditionsAttrs.NotBefore ?? null,
          conditionsAttrs.NotOnOrAfter ?? null,
          now,
        ),
      },
      authn: {
        authnInstant: getAttrs(authnStatement).AuthnInstant ?? null,
        sessionIndex: getAttrs(authnStatement).SessionIndex ?? null,
        sessionNotOnOrAfter: getAttrs(authnStatement).SessionNotOnOrAfter ?? null,
        classRef: getNodeText(authnContext?.AuthnContextClassRef),
        authorities: toArray(authnContext?.AuthenticatingAuthority)
          .map((authority) => getNodeText(authority))
          .filter((authority): authority is string => Boolean(authority)),
      },
      attributes,
    };
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "The SAML response could not be parsed into a structured document.";
    return emptyAssertion(message);
  }
}

export function formatSamlStatusLabel(value: string | null): string {
  const localName = getLocalName(value);
  if (!localName) {
    return "Unavailable";
  }

  const normalized = localName
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/_/g, " ")
    .trim();

  return normalized.replace(/\b\w/g, (character) => character.toUpperCase());
}
