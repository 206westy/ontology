'use client';

import { useParams } from 'next/navigation';
import OntologyLinkPicker from '@/features/problems/components/OntologyLinkPicker';

export default function OntologyLinkPage() {
  const params = useParams<{ id: string }>();
  return (
    <div className="p-6">
      <OntologyLinkPicker problemId={params.id} />
    </div>
  );
}
