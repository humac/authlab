import type { ReactNode } from "react";
import { Badge } from "@/components/ui/Badge";
import {
  formatSamlStatusLabel,
  type SamlStructuredAssertion,
} from "@/lib/saml-response-parser";

interface SamlOverviewPanelProps {
  assertion: SamlStructuredAssertion | null;
  claims: Record<string, unknown> | null;
  hasRawXml: boolean;
  outboundAuthParams?: Record<string, string> | null;
}

function formatDateTime(value: string | null): string {
  if (!value) {
    return "Unavailable";
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? value : parsed.toLocaleString();
}

function statusBadgeVariant(status: string): "green" | "blue" | "gray" {
  if (status === "active") {
    return "green";
  }

  if (status === "captured" || status === "future") {
    return "blue";
  }

  return "gray";
}

function renderValue(value: string | null, className = ""): ReactNode {
  return value ? (
    <p className={`break-all text-sm font-medium text-[var(--text)] ${className}`}>{value}</p>
  ) : (
    <p className="text-sm text-[var(--muted)]">Unavailable</p>
  );
}

function getFallbackClaimCount(claims: Record<string, unknown> | null): number {
  return claims ? Object.keys(claims).length : 0;
}

export function SamlOverviewPanel({
  assertion,
  claims,
  hasRawXml,
  outboundAuthParams,
}: SamlOverviewPanelProps) {
  const attributeCount = assertion?.attributes.length ?? getFallbackClaimCount(claims);
  const responseStatus = formatSamlStatusLabel(assertion?.responseStatus ?? null);
  const conditionStatus = assertion?.conditions.status ?? "missing";
  const subjectPosture = assertion?.subject.posture ?? "missing";
  const requestedAuthnContext = outboundAuthParams?.requestedAuthnContext?.trim() || null;
  const requestedNameIdFormat = outboundAuthParams?.nameIdFormat?.trim() || null;
  const requestedForceAuthn = outboundAuthParams?.forceAuthn ?? null;
  const requestedIsPassive = outboundAuthParams?.isPassive ?? null;
  const requestedSignatureAlgorithm = outboundAuthParams?.samlSignatureAlgorithm ?? null;
  const requestedClockSkew = outboundAuthParams?.clockSkewToleranceSeconds ?? null;

  return (
    <div className="space-y-4">
      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-semibold text-[var(--text)]">Structured SAML assertion</p>
              <Badge variant="saml">SAML</Badge>
              <Badge
                variant={
                  responseStatus === "Success" ? "green" : assertion?.responseStatus ? "blue" : "gray"
                }
              >
                {responseStatus}
              </Badge>
            </div>
            <p className="max-w-3xl text-sm leading-6 text-[var(--muted)]">
              The inspector now parses the captured SAML response into subject, conditions,
              authentication, and attribute sections so assertion shape problems are visible without
              reading raw XML.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant={hasRawXml ? "green" : "gray"}>
              {hasRawXml ? "Raw XML captured" : "No raw XML"}
            </Badge>
            {assertion?.encryptedAssertion && <Badge variant="blue">Encrypted assertion detected</Badge>}
          </div>
        </div>
        {assertion?.parseError && (
          <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-2 text-sm text-[var(--muted)]">
            Structured parsing fell back to the raw assertion payload: {assertion.parseError}
          </div>
        )}
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--muted)]">
            Conditions
          </p>
          <div className="mt-2 flex items-center gap-2">
            <Badge variant={statusBadgeVariant(conditionStatus)}>
              {formatSamlStatusLabel(conditionStatus)}
            </Badge>
          </div>
          <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
            NotBefore {formatDateTime(assertion?.conditions.notBefore ?? null)}
          </p>
          <p className="text-xs leading-5 text-[var(--muted)]">
            NotOnOrAfter {formatDateTime(assertion?.conditions.notOnOrAfter ?? null)}
          </p>
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--muted)]">
            Subject confirmation
          </p>
          <div className="mt-2 flex items-center gap-2">
            <Badge variant={statusBadgeVariant(subjectPosture)}>
              {formatSamlStatusLabel(subjectPosture)}
            </Badge>
          </div>
          <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
            {assertion?.subject.confirmations.length ?? 0} confirmation method
            {(assertion?.subject.confirmations.length ?? 0) === 1 ? "" : "s"} captured
          </p>
          <p className="text-xs leading-5 text-[var(--muted)]">
            NameID format {assertion?.subject.nameIdFormat ?? "Unavailable"}
          </p>
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--muted)]">
            Authn context
          </p>
          {renderValue(assertion?.authn.classRef ?? null, "mt-2")}
          <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
            Authn instant {formatDateTime(assertion?.authn.authnInstant ?? null)}
          </p>
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
          <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--muted)]">
            Attributes
          </p>
          <p className="mt-2 text-sm font-medium text-[var(--text)]">{attributeCount}</p>
          <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
            Structured attribute entries are parsed from the assertion while all flat values remain
            available in Claims.
          </p>
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)]">
        <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-[var(--text)]">Assertion envelope</p>
              <p className="mt-1 text-sm text-[var(--muted)]">
                Issuer, routing, response status, and issue instants from the SAML response.
              </p>
            </div>
          </div>

          <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3">
              <dt className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--muted)]">
                Response issuer
              </dt>
              <dd className="mt-2">{renderValue(assertion?.responseIssuer ?? null)}</dd>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3">
              <dt className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--muted)]">
                Assertion issuer
              </dt>
              <dd className="mt-2">{renderValue(assertion?.assertionIssuer ?? null)}</dd>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3">
              <dt className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--muted)]">
                Destination
              </dt>
              <dd className="mt-2">{renderValue(assertion?.destination ?? null)}</dd>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3">
              <dt className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--muted)]">
                InResponseTo
              </dt>
              <dd className="mt-2">{renderValue(assertion?.inResponseTo ?? null)}</dd>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3">
              <dt className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--muted)]">
                Response issue instant
              </dt>
              <dd className="mt-2 text-sm text-[var(--text)]">
                {formatDateTime(assertion?.responseIssueInstant ?? null)}
              </dd>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3">
              <dt className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--muted)]">
                Assertion issue instant
              </dt>
              <dd className="mt-2 text-sm text-[var(--text)]">
                {formatDateTime(assertion?.assertionIssueInstant ?? null)}
              </dd>
            </div>
          </dl>
        </section>

        <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <div>
            <p className="text-sm font-semibold text-[var(--text)]">Subject</p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              NameID, format, and subject-confirmation methods retained from the assertion.
            </p>
          </div>

          <div className="mt-4 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3">
            <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--muted)]">
              NameID
            </p>
            <div className="mt-2">{renderValue(assertion?.subject.nameId ?? null)}</div>
            <p className="mt-2 text-xs leading-5 text-[var(--muted)]">
              Format {assertion?.subject.nameIdFormat ?? "Unavailable"}
            </p>
          </div>

          <div className="mt-3 space-y-2">
            {assertion?.subject.confirmations.length ? (
              assertion.subject.confirmations.map((confirmation, index) => (
                <div
                  key={`${confirmation.method ?? "subject-confirmation"}-${index}`}
                  className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm font-medium text-[var(--text)]">
                      {formatSamlStatusLabel(confirmation.method)}
                    </p>
                    <Badge variant={statusBadgeVariant(confirmation.status)}>
                      {formatSamlStatusLabel(confirmation.status)}
                    </Badge>
                  </div>
                  <dl className="mt-2 grid gap-2 text-xs text-[var(--muted)] sm:grid-cols-2">
                    <div>
                      <dt className="uppercase tracking-[0.06em]">Recipient</dt>
                      <dd className="mt-1 break-all text-[var(--text)]">
                        {confirmation.recipient ?? "Unavailable"}
                      </dd>
                    </div>
                    <div>
                      <dt className="uppercase tracking-[0.06em]">InResponseTo</dt>
                      <dd className="mt-1 break-all text-[var(--text)]">
                        {confirmation.inResponseTo ?? "Unavailable"}
                      </dd>
                    </div>
                    <div className="sm:col-span-2">
                      <dt className="uppercase tracking-[0.06em]">NotOnOrAfter</dt>
                      <dd className="mt-1 text-[var(--text)]">
                        {formatDateTime(confirmation.notOnOrAfter)}
                      </dd>
                    </div>
                  </dl>
                </div>
              ))
            ) : (
              <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3 text-sm text-[var(--muted)]">
                No subject confirmation details were captured in the current assertion.
              </div>
            )}
          </div>
        </section>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
        <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <div>
            <p className="text-sm font-semibold text-[var(--text)]">Requested policy</p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Request-time controls captured when this SAML run was launched.
            </p>
          </div>

          <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3">
              <dt className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--muted)]">
                ForceAuthn
              </dt>
              <dd className="mt-2 text-sm text-[var(--text)]">{requestedForceAuthn ?? "Unavailable"}</dd>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3">
              <dt className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--muted)]">
                IsPassive
              </dt>
              <dd className="mt-2 text-sm text-[var(--text)]">{requestedIsPassive ?? "Unavailable"}</dd>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3">
              <dt className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--muted)]">
                Requested AuthnContextClassRef
              </dt>
              <dd className="mt-2">{renderValue(requestedAuthnContext)}</dd>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3">
              <dt className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--muted)]">
                Requested NameID format
              </dt>
              <dd className="mt-2">{renderValue(requestedNameIdFormat)}</dd>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3">
              <dt className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--muted)]">
                Signature algorithm
              </dt>
              <dd className="mt-2 text-sm text-[var(--text)]">
                {requestedSignatureAlgorithm ?? "Unavailable"}
              </dd>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3">
              <dt className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--muted)]">
                Clock skew tolerance
              </dt>
              <dd className="mt-2 text-sm text-[var(--text)]">
                {requestedClockSkew ? `${requestedClockSkew}s` : "0s"}
              </dd>
            </div>
          </dl>
        </section>

        <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <div>
            <p className="text-sm font-semibold text-[var(--text)]">Conditions</p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Assertion validity window and audience restrictions.
            </p>
          </div>

          <dl className="mt-4 grid gap-3">
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3">
              <dt className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--muted)]">
                Validity window
              </dt>
              <dd className="mt-2 space-y-1 text-sm text-[var(--text)]">
                <p>NotBefore {formatDateTime(assertion?.conditions.notBefore ?? null)}</p>
                <p>NotOnOrAfter {formatDateTime(assertion?.conditions.notOnOrAfter ?? null)}</p>
              </dd>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3">
              <dt className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--muted)]">
                Audiences
              </dt>
              <dd className="mt-2 space-y-2">
                {assertion?.conditions.audiences.length ? (
                  assertion.conditions.audiences.map((audience) => (
                    <div
                      key={audience}
                      className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2 text-xs text-[var(--text)]"
                    >
                      {audience}
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-[var(--muted)]">No audience restrictions were captured.</p>
                )}
              </dd>
            </div>
          </dl>
        </section>

        <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
          <div>
            <p className="text-sm font-semibold text-[var(--text)]">Authentication statement</p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Authn context, session index, and session expiry data from the assertion.
            </p>
          </div>

          <dl className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3 sm:col-span-2">
              <dt className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--muted)]">
                AuthnContextClassRef
              </dt>
              <dd className="mt-2">{renderValue(assertion?.authn.classRef ?? null)}</dd>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3">
              <dt className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--muted)]">
                AuthnInstant
              </dt>
              <dd className="mt-2 text-sm text-[var(--text)]">
                {formatDateTime(assertion?.authn.authnInstant ?? null)}
              </dd>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3">
              <dt className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--muted)]">
                SessionIndex
              </dt>
              <dd className="mt-2">{renderValue(assertion?.authn.sessionIndex ?? null)}</dd>
            </div>
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3 sm:col-span-2">
              <dt className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--muted)]">
                SessionNotOnOrAfter
              </dt>
              <dd className="mt-2 text-sm text-[var(--text)]">
                {formatDateTime(assertion?.authn.sessionNotOnOrAfter ?? null)}
              </dd>
            </div>
          </dl>

          {assertion?.authn.authorities.length ? (
            <div className="mt-3 rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3">
              <p className="text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--muted)]">
                Authenticating authorities
              </p>
              <div className="mt-2 space-y-2">
                {assertion.authn.authorities.map((authority) => (
                  <div
                    key={authority}
                    className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2.5 py-2 text-xs text-[var(--text)]"
                  >
                    {authority}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </section>
      </div>

      <section className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold text-[var(--text)]">Attribute statement</p>
            <p className="mt-1 text-sm text-[var(--muted)]">
              Structured attributes extracted from the assertion payload.
            </p>
          </div>
          <Badge variant={attributeCount > 0 ? "blue" : "gray"}>
            {attributeCount} attribute{attributeCount === 1 ? "" : "s"}
          </Badge>
        </div>

        <div className="mt-4 overflow-x-auto">
          {assertion?.attributes.length ? (
            <table className="min-w-full border-separate border-spacing-0 text-left">
              <thead>
                <tr>
                  <th className="border-b border-[var(--border)] px-3 py-2 text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--muted)]">
                    Name
                  </th>
                  <th className="border-b border-[var(--border)] px-3 py-2 text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--muted)]">
                    Friendly name
                  </th>
                  <th className="border-b border-[var(--border)] px-3 py-2 text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--muted)]">
                    Values
                  </th>
                </tr>
              </thead>
              <tbody>
                {assertion.attributes.map((attribute) => (
                  <tr key={`${attribute.name}-${attribute.friendlyName ?? "value"}`}>
                    <td className="border-b border-[var(--border)] px-3 py-3 align-top text-sm font-medium text-[var(--text)]">
                      <div>{attribute.name}</div>
                      {attribute.nameFormat && (
                        <div className="mt-1 text-xs font-normal text-[var(--muted)]">
                          {attribute.nameFormat}
                        </div>
                      )}
                    </td>
                    <td className="border-b border-[var(--border)] px-3 py-3 align-top text-sm text-[var(--text)]">
                      {attribute.friendlyName ?? "Unavailable"}
                    </td>
                    <td className="border-b border-[var(--border)] px-3 py-3 align-top">
                      <div className="flex flex-wrap gap-2">
                        {attribute.values.length ? (
                          attribute.values.map((value) => (
                            <span
                              key={`${attribute.name}-${value}`}
                              className="rounded-md border border-[var(--border)] bg-[var(--surface-2)] px-2.5 py-1 text-xs text-[var(--text)]"
                            >
                              {value}
                            </span>
                          ))
                        ) : (
                          <span className="text-sm text-[var(--muted)]">No explicit values captured</span>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] px-3 py-4 text-sm text-[var(--muted)]">
              No structured attribute statement was parsed from the current assertion. The Claims tab
              still shows the flattened values captured during the callback.
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
