import { CreationStepper } from "@/components/apps/CreationStepper";

export default function NewAppPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold text-gray-900 mb-6 text-center">
        Create New App Instance
      </h1>
      <CreationStepper />
    </div>
  );
}
