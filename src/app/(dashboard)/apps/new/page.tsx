import { CreationStepper } from "@/components/apps/CreationStepper";
import { PageHeader } from "@/components/layout/PageHeader";

export default function NewAppPage() {
  return (
    <div className="space-y-4 animate-enter">
      <PageHeader
        title="Create new app instance"
        description="Define protocol settings, provider metadata, and the analyst-facing launch experience in one compact workflow."
      />
      <CreationStepper />
    </div>
  );
}
