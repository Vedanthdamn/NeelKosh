import type { Ecosystem, ProjectStatus } from "@/lib/api";

const ECOSYSTEM_LABEL: Record<Ecosystem, string> = {
  Mangrove: "Mangrove",
  Seagrass: "Seagrass",
  Saltmarsh: "Saltmarsh",
};

export function EcosystemBadge({ ecosystem }: { ecosystem: Ecosystem }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-teal-600/10 px-2.5 py-1 text-xs font-medium text-teal-600">
      <span className="h-1.5 w-1.5 rounded-full bg-teal-500" aria-hidden="true" />
      {ECOSYSTEM_LABEL[ecosystem]}
    </span>
  );
}

export function StatusBadge({ status }: { status: ProjectStatus }) {
  if (status === "Active") {
    return (
      <span className="inline-flex items-center gap-1.5 rounded-full bg-sand-500/15 px-2.5 py-1 text-xs font-medium text-sand-700">
        <span className="h-1.5 w-1.5 rounded-full bg-sand-500" aria-hidden="true" />
        Active
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-coral-500/10 px-2.5 py-1 text-xs font-medium text-coral-600">
      <span className="h-1.5 w-1.5 rounded-full bg-coral-500" aria-hidden="true" />
      Suspended
    </span>
  );
}

export function SubmissionStatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    Issued: "bg-teal-600/10 text-teal-600",
    Approved: "bg-sand-500/15 text-sand-700",
    Pending: "bg-mudflat-200 text-ink-700",
    Rejected: "bg-coral-500/10 text-coral-600",
  };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-1 text-xs font-medium ${styles[status] ?? "bg-mudflat-200 text-ink-700"}`}>
      {status}
    </span>
  );
}
