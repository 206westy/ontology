import { redirect } from 'next/navigation';

// /problems/[id] 진입 = 문제정의 단계로.
export default async function ProblemIndexPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(`/problems/${id}/define`);
}
