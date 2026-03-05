import { CreationStepper } from "@/components/apps/CreationStepper";

export default function NewAppPage() {
  return (
    <div className="space-y-6 animate-enter">
      <div className="text-center">
        <h1 className="text-3xl font-semibold tracking-tight text-[var(--text)]">Create New App Instance</h1>
        <p className="mt-1 text-sm text-[var(--muted)]">
          Configure protocol, metadata, and test experience
        </p>
      </div>
      <CreationStepper />
    </div>
  );
}
