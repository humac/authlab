import { notFound } from "next/navigation";
import { getRedactedAppInstanceById } from "@/repositories/app-instance.repo";
import { EditAppForm } from "@/components/apps/EditAppForm";

export default async function EditAppPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const app = await getRedactedAppInstanceById(id);

  if (!app) {
    notFound();
  }

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-gray-900 mb-6">
        Edit: {app.name}
      </h1>
      <EditAppForm app={app} />
    </div>
  );
}
