import { CopyButton } from "@/components/ui/CopyButton";
import { Card } from "@/components/ui/Card";
import type { ScimRequestLog, ScimStoredResource } from "@/types/scim";

interface ScimProvisioningPanelProps {
  baseUrl: string;
  bearerToken: string;
  users: ScimStoredResource[];
  groups: ScimStoredResource[];
  logs: ScimRequestLog[];
}

function renderPayloadPreview(resource: ScimStoredResource) {
  return JSON.stringify(resource.payload, null, 2);
}

export function ScimProvisioningPanel({
  baseUrl,
  bearerToken,
  users,
  groups,
  logs,
}: ScimProvisioningPanelProps) {
  return (
    <Card className="space-y-4">
      <div>
        <p className="text-xs font-medium uppercase tracking-[0.08em] text-[var(--muted)]">
          SCIM mock provisioning
        </p>
        <h2 className="mt-1 text-lg font-semibold tracking-tight text-[var(--text)]">
          Provisioning target
        </h2>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Use these endpoints and bearer token for SCIM 2.0 provisioning tests. The token is
          app-scoped and only shown on this authenticated page.
        </p>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-[var(--muted)]">
            Base URL
          </p>
          <code className="mt-2 block break-all rounded-md bg-[var(--surface)] px-2 py-1.5 text-xs text-[var(--text)]">
            {baseUrl}
          </code>
          <div className="mt-2">
            <CopyButton text={baseUrl} />
          </div>
        </div>
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface-2)] p-3">
          <p className="text-xs font-medium uppercase tracking-[0.08em] text-[var(--muted)]">
            Bearer token
          </p>
          <code className="mt-2 block break-all rounded-md bg-[var(--surface)] px-2 py-1.5 text-xs text-[var(--text)]">
            {bearerToken}
          </code>
          <div className="mt-2">
            <CopyButton text={bearerToken} />
          </div>
        </div>
      </div>

      <div className="grid gap-3 lg:grid-cols-2">
        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-[var(--text)]">Users</p>
            <span className="text-xs font-medium uppercase tracking-[0.08em] text-[var(--muted)]">
              {users.length}
            </span>
          </div>
          <div className="mt-3 space-y-2">
            {users.slice(0, 5).map((resource) => (
              <div key={resource.resourceId} className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3">
                <p className="text-sm font-medium text-[var(--text)]">
                  {resource.displayName ?? resource.resourceId}
                </p>
                <p className="mt-1 font-mono text-xs text-[var(--muted)]">{resource.resourceId}</p>
                <pre className="mt-2 overflow-x-auto rounded-md bg-[var(--surface)] px-2 py-1.5 text-xs text-[var(--text)]">
                  {renderPayloadPreview(resource)}
                </pre>
              </div>
            ))}
            {users.length === 0 && (
              <p className="text-sm text-[var(--muted)]">No SCIM users provisioned yet.</p>
            )}
          </div>
        </div>

        <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold text-[var(--text)]">Groups</p>
            <span className="text-xs font-medium uppercase tracking-[0.08em] text-[var(--muted)]">
              {groups.length}
            </span>
          </div>
          <div className="mt-3 space-y-2">
            {groups.slice(0, 5).map((resource) => (
              <div key={resource.resourceId} className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3">
                <p className="text-sm font-medium text-[var(--text)]">
                  {resource.displayName ?? resource.resourceId}
                </p>
                <p className="mt-1 font-mono text-xs text-[var(--muted)]">{resource.resourceId}</p>
                <pre className="mt-2 overflow-x-auto rounded-md bg-[var(--surface)] px-2 py-1.5 text-xs text-[var(--text)]">
                  {renderPayloadPreview(resource)}
                </pre>
              </div>
            ))}
            {groups.length === 0 && (
              <p className="text-sm text-[var(--muted)]">No SCIM groups provisioned yet.</p>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3">
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm font-semibold text-[var(--text)]">Recent SCIM requests</p>
          <span className="text-xs font-medium uppercase tracking-[0.08em] text-[var(--muted)]">
            {logs.length}
          </span>
        </div>
        <div className="mt-3 space-y-2">
          {logs.map((log) => (
            <div key={log.id} className="rounded-lg border border-[var(--border)] bg-[var(--surface-2)] p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="text-sm font-medium text-[var(--text)]">
                  {log.method} {log.path}
                </p>
                <span className="text-xs font-medium text-[var(--muted)]">
                  {log.statusCode} · {log.createdAt.toLocaleString()}
                </span>
              </div>
            </div>
          ))}
          {logs.length === 0 && (
            <p className="text-sm text-[var(--muted)]">No SCIM requests captured yet.</p>
          )}
        </div>
      </div>
    </Card>
  );
}

