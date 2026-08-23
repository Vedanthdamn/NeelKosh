import { SubmissionDetailClient } from "./DetailClient";

export default async function SubmissionDetailPage(props: PageProps<"/queue/[submissionId]">) {
  const { submissionId } = await props.params;
  return <SubmissionDetailClient submissionId={submissionId} />;
}
