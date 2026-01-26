import React from 'react';
import { useParams } from 'react-router-dom';
import PublicResultsPage from '@/components/PublicResultsPage';

const PublicResultsRoute: React.FC = () => {
  const params = useParams();
  const condominioId = params.condominioId as string | undefined;

  return <PublicResultsPage buildingId={condominioId} />;
};

export default PublicResultsRoute;
