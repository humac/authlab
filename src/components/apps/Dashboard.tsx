"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { TeamMembersPanel } from "./TeamMembersPanel";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Input } from "@/components/ui/Input";
import { Badge } from "@/components/ui/Badge";
import { Modal } from "@/components/ui/Modal";
import { detectIdpGroups, groupByTags } from "@/lib/idp-detection";
import type { RedactedAppInstance } from "@/types/app-instance";

type GroupMode = "none" | "idp" | "tags";

interface DashboardProps {
  initialApps: RedactedAppInstance[];
  team: {
    id: string;
    name: string;
    isPersonal: boolean;
    currentRole: "OWNER" | "ADMIN" | "MEMBER";
    members: Array<{
      id: string;
      role: "OWNER" | "ADMIN" | "MEMBER";
      user: {
        id: string;
        name: string;
        email: string;
      };
    }>;
  };
  currentUserId: string;
}

function TagPills({ tags }: { tags: string[] }) {
  if (!tags || tags.length === 0) return null;
  return (
    <div className="mt-0.5 flex flex-wrap gap-1">
      {tags.map((tag) => (
        <span
          key={tag}
          className="inline-flex h-4 items-center rounded px-1.5 text-[10px] font-medium border border-[var(--border)] bg-[var(--surface-2)] text-[var(--muted)]"
        >
          {tag}
        </span>
      ))}
    </div>
  );
}

function AppRow({
  app,
  onDelete,
}: {
  app: RedactedAppInstance;
  onDelete: (app: RedactedAppInstance) => void;
}) {
  return (
    <tr
      data-testid={`app-card-${app.slug}`}
      className="border-t border-[var(--border)] bg-[var(--surface)]"
    >
      <td className="px-3 py-2.5" data-label="Application">
        <div className="flex items-center gap-3">
          <span
            className="h-3 w-3 rounded-full border border-[var(--border)]"
            style={{ backgroundColor: app.buttonColor || "#3B71CA" }}
          />
          <div>
            <p className="font-medium text-[var(--text)]">{app.name}</p>
            <p className="font-mono text-xs text-[var(--muted)]">/{app.slug}</p>
            <TagPills tags={app.tags} />
          </div>
        </div>
      </td>
      <td className="px-3 py-2.5" data-label="Protocol">
        <Badge variant={app.protocol.toLowerCase() as "oidc" | "saml"} />
      </td>
      <td className="px-3 py-2.5 text-[var(--muted)]" data-label="Created">
        {new Date(app.createdAt).toLocaleDateString()}
      </td>
      <td className="px-3 py-2.5" data-label="Actions">
        <div className="flex items-center gap-2">
          <Link href={`/test/${app.slug}`}>
            <Button size="sm">Test</Button>
          </Link>
          <Link href={`/apps/${app.id}`}>
            <Button size="sm" variant="secondary">
              Edit
            </Button>
          </Link>
          <Button
            size="sm"
            variant="ghost"
            className="text-[var(--danger)]"
            onClick={() => onDelete(app)}
          >
            Delete
          </Button>
        </div>
      </td>
    </tr>
  );
}

function AppTable({
  apps,
  onDelete,
  showHeader,
}: {
  apps: RedactedAppInstance[];
  onDelete: (app: RedactedAppInstance) => void;
  showHeader?: boolean;
}) {
  return (
    <table className="responsive-table w-full text-sm">
      {showHeader && (
        <thead className="bg-[var(--surface-2)] text-left text-xs uppercase tracking-[0.08em] text-[var(--muted)]">
          <tr>
            <th className="px-3 py-2">Application</th>
            <th className="px-3 py-2">Protocol</th>
            <th className="px-3 py-2">Created</th>
            <th className="px-3 py-2">Actions</th>
          </tr>
        </thead>
      )}
      <tbody>
        {apps.map((app) => (
          <AppRow key={app.id} app={app} onDelete={onDelete} />
        ))}
      </tbody>
    </table>
  );
}

function GroupSection({
  title,
  badges,
  children,
  defaultOpen = true,
}: {
  title: string;
  badges?: React.ReactNode;
  children: React.ReactNode;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-t border-[var(--border)] first:border-t-0">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-semibold uppercase tracking-[0.08em] text-[var(--muted)] hover:bg-[var(--surface-2)]"
      >
        <span
          className="inline-block text-[10px] transition-transform"
          style={{ transform: open ? "rotate(90deg)" : "rotate(0deg)" }}
        >
          &#9654;
        </span>
        <span className="flex-1">{title}</span>
        {badges}
      </button>
      {open && children}
    </div>
  );
}

export function Dashboard({ initialApps, team, currentUserId }: DashboardProps) {
  const [apps, setApps] = useState(initialApps);
  const [query, setQuery] = useState("");
  const [groupMode, setGroupMode] = useState<GroupMode>("none");
  const [deleteTarget, setDeleteTarget] = useState<RedactedAppInstance | null>(null);
  const [deleting, setDeleting] = useState(false);

  const filteredApps = useMemo(
    () =>
      apps
        .filter((app) =>
          [app.name, app.slug, app.protocol, ...(app.tags || [])].some(
            (value) => value.toLowerCase().includes(query.toLowerCase()),
          ),
        )
        .sort((a, b) => a.name.localeCompare(b.name)),
    [apps, query],
  );

  const idpGroups = useMemo(
    () => (groupMode === "idp" ? detectIdpGroups(filteredApps) : []),
    [filteredApps, groupMode],
  );

  const tagGroups = useMemo(
    () => (groupMode === "tags" ? groupByTags(filteredApps) : []),
    [filteredApps, groupMode],
  );

  const idpCount = useMemo(() => {
    const groups = detectIdpGroups(apps);
    return groups.filter((g) => g.idpKey !== "__unconfigured__").length;
  }, [apps]);

  async function handleDelete() {
    if (!deleteTarget) {
      return;
    }

    setDeleting(true);
    try {
      const res = await fetch(`/api/apps/${deleteTarget.id}`, { method: "DELETE" });
      if (res.ok) {
        setApps((prev) => prev.filter((app) => app.id !== deleteTarget.id));
        setDeleteTarget(null);
      }
    } finally {
      setDeleting(false);
    }
  }

  const groupModes: { key: GroupMode; label: string }[] = [
    { key: "none", label: "Flat" },
    { key: "idp", label: "By IDP" },
    { key: "tags", label: "By Tag" },
  ];

  return (
    <div className="grid grid-cols-1 items-start gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="space-y-4">
        <div className="grid gap-3 md:grid-cols-4">
          <Card className="bg-[var(--surface-2)]">
            <p className="text-xs uppercase tracking-[0.08em] text-[var(--muted)]">Applications</p>
            <p className="mt-2 text-2xl font-semibold text-[var(--text)]">{apps.length}</p>
          </Card>
          <Card className="bg-[var(--surface-2)]">
            <p className="text-xs uppercase tracking-[0.08em] text-[var(--muted)]">IDP Providers</p>
            <p className="mt-2 text-2xl font-semibold text-[var(--text)]">{idpCount}</p>
          </Card>
          <Card className="bg-[var(--surface-2)]">
            <p className="text-xs uppercase tracking-[0.08em] text-[var(--muted)]">Members</p>
            <p className="mt-2 text-2xl font-semibold text-[var(--text)]">{team.members.length}</p>
          </Card>
          <Card className="bg-[var(--surface-2)]">
            <p className="text-xs uppercase tracking-[0.08em] text-[var(--muted)]">Role</p>
            <div className="mt-2">
              <Badge variant={team.currentRole === "OWNER" ? "blue" : team.currentRole === "ADMIN" ? "green" : "gray"}>
                {team.currentRole}
              </Badge>
            </div>
          </Card>
        </div>

        <Card className="space-y-3">
          <div className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between">
            <div>
              <p className="text-xs uppercase tracking-[0.08em] text-[var(--muted)]">App inventory</p>
              <p className="mt-1 text-sm text-[var(--muted)]">
                Compact view of apps in {team.isPersonal ? "your personal workspace" : team.name}.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <div className="inline-flex rounded-lg border border-[var(--border)] bg-[var(--surface-2)]">
                {groupModes.map(({ key, label }) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setGroupMode(key)}
                    className={`px-2.5 py-1 text-xs font-medium transition-colors first:rounded-l-[7px] last:rounded-r-[7px] ${
                      groupMode === key
                        ? "bg-[var(--surface)] text-[var(--text)] shadow-sm"
                        : "text-[var(--muted)] hover:text-[var(--text)]"
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <Input
                label="Search apps"
                uiSize="sm"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search name, slug, protocol, tag"
              />
              <Link href="/apps/new" className="flex items-end">
                <Button size="sm">New App</Button>
              </Link>
            </div>
          </div>

          <div className="overflow-hidden rounded-xl border border-[var(--border)]">
            {groupMode === "none" && (
              <>
                <AppTable
                  apps={filteredApps}
                  onDelete={setDeleteTarget}
                  showHeader
                />
                {filteredApps.length === 0 && (
                  <div className="px-4 py-8 text-center text-sm text-[var(--muted)]">
                    No applications matched this view.
                  </div>
                )}
              </>
            )}

            {groupMode === "idp" && (
              <>
                {idpGroups.map((group) => (
                  <GroupSection
                    key={group.idpKey}
                    title={
                      group.providerName
                        ? `${group.providerName} (${group.label})`
                        : group.label
                    }
                    badges={
                      <span className="flex gap-1">
                        <span className="text-[10px] font-normal text-[var(--muted)]">
                          {group.apps.length} app{group.apps.length !== 1 ? "s" : ""}
                        </span>
                        {group.isSsoScenario && (
                          <Badge variant="blue" className="!h-4 !text-[9px]">
                            SSO
                          </Badge>
                        )}
                        {group.isCrossProtocol && (
                          <Badge variant="green" className="!h-4 !text-[9px]">
                            Cross-protocol
                          </Badge>
                        )}
                      </span>
                    }
                  >
                    <AppTable apps={group.apps} onDelete={setDeleteTarget} />
                  </GroupSection>
                ))}
                {idpGroups.length === 0 && (
                  <div className="px-4 py-8 text-center text-sm text-[var(--muted)]">
                    No applications matched this view.
                  </div>
                )}
              </>
            )}

            {groupMode === "tags" && (
              <>
                {tagGroups.map((group) => (
                  <GroupSection
                    key={group.tag}
                    title={group.tag}
                    badges={
                      <span className="text-[10px] font-normal text-[var(--muted)]">
                        {group.apps.length} app{group.apps.length !== 1 ? "s" : ""}
                      </span>
                    }
                  >
                    <AppTable apps={group.apps} onDelete={setDeleteTarget} />
                  </GroupSection>
                ))}
                {tagGroups.length === 0 && (
                  <div className="px-4 py-8 text-center text-sm text-[var(--muted)]">
                    No applications matched this view.
                  </div>
                )}
              </>
            )}
          </div>
        </Card>
      </div>

      <TeamMembersPanel
        key={team.id}
        teamId={team.id}
        teamName={team.name}
        isPersonal={team.isPersonal}
        currentUserId={currentUserId}
        currentUserRole={team.currentRole}
        initialMembers={team.members}
      />

      <Modal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        title="Delete app"
      >
        <p className="text-sm text-[var(--muted)]">
          Delete <strong>{deleteTarget?.name}</strong>? This action cannot be undone.
        </p>
        <div className="mt-4 flex justify-end gap-2">
          <Button variant="secondary" size="sm" onClick={() => setDeleteTarget(null)}>
            Cancel
          </Button>
          <Button variant="danger" size="sm" onClick={handleDelete} loading={deleting}>
            Delete
          </Button>
        </div>
      </Modal>
    </div>
  );
}
