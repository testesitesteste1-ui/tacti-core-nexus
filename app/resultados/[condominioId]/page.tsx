"use client";

import { useParams } from 'next/navigation';
import { PublicResultsPage } from '@/components/PublicResultsPage';

export default function PublicResults() {
  const params = useParams();
  const buildingId = params?.condominioId as string | undefined;

  return <PublicResultsPage buildingId={buildingId || ''} />;
}
