import { LotteryResult, Participant, ParkingSpot } from '@/types/lottery';
import exeventosLogo from '@/assets/exeventos-logo.png';

export const generateLotteryPDF = (
  sessionName: string,
  results: LotteryResult[],
  participants: Participant[],
  parkingSpots: ParkingSpot[],
  companyType: string = 'exvagas',
  buildingName?: string,
  orderBy: 'participant' | 'spot' = 'participant' // ✅ ADICIONAR ESTA LINHA
) => {
  const companyLogo = exeventosLogo;
  const companyName = 'Ex Eventos';
  const companyColor = '#4f46e5';

  // ✅ ORDENAR RESULTADOS BASEADO NO PARÂMETRO
  let sortedResults: LotteryResult[];

  if (orderBy === 'spot') {
    // Ordenar por vaga (número da vaga)
    sortedResults = [...results].sort((a, b) => {
      const spotA = parkingSpots.find(s => s.id === a.parkingSpotId);
      const spotB = parkingSpots.find(s => s.id === b.parkingSpotId);

      const numA = spotA?.number || (a.spotSnapshot as any)?.number || '';
      const numB = spotB?.number || (b.spotSnapshot as any)?.number || '';

      return numA.localeCompare(numB, 'pt-BR', { numeric: true });
    });

    console.log('📄 PDF - Ordenado por VAGA');
  } else {
    // Ordenar por participante (bloco/unidade)
    sortedResults = [...results].sort((a, b) => {
      const participantA = participants.find(p => p.id === a.participantId) || (a.participantSnapshot as any);
      const participantB = participants.find(p => p.id === b.participantId) || (b.participantSnapshot as any);

      const blockA = participantA?.block || '';
      const blockB = participantB?.block || '';

      if (blockA !== blockB) {
        return blockA.localeCompare(blockB, 'pt-BR', { numeric: true });
      }

      const unitA = participantA?.unit || '';
      const unitB = participantB?.unit || '';

      return unitA.localeCompare(unitB, 'pt-BR', { numeric: true });
    });

    console.log('📄 PDF - Ordenado por PARTICIPANTE');
  }

  // 🔍 LOG DETALHADO: Verificar o primeiro resultado
  console.log('📄 PDF - Primeiro resultado completo:', {
    result: results[0],
    participantFound: participants.find(p => p.id === results[0]?.participantId),
    spotFound: parkingSpots.find(s => s.id === results[0]?.parkingSpotId),
    participantSnapshot: results[0]?.participantSnapshot,
    spotSnapshot: results[0]?.spotSnapshot
  });

  // 🔍 LOG: Verificar a ordem que chegou
  console.log('📄 PDF - Primeiros 5 results recebidos:', results.slice(0, 5).map((r, idx) => {
    const spot = parkingSpots.find(s => s.id === r.parkingSpotId);
    const spotSnap = r.spotSnapshot as any;
    const participant = participants.find(p => p.id === r.participantId);
    const partSnap = r.participantSnapshot as any;

    return {
      index: idx,
      vaga: spot?.number || spotSnap?.number || 'N/A',
      morador: participant ? `${participant.block}/${participant.unit}` : (partSnap ? `${partSnap.block}/${partSnap.unit}` : 'N/A')
    };
  }));

  // Create HTML content for the PDF
  const getParticipantBlockUnit = (
    id: string,
    priority?: string,
    snapshot?: { name: string; block: string; unit: string },
    spot?: any
  ) => {
    const participant = participants.find(p => p.id === id) || snapshot as any;
    if (!participant) return 'N/A';

    let blockUnit = `Bloco ${participant.block} - Unidade ${participant.unit}`;

    // Marcar PcD / Idoso
    if (priority === 'special-needs') {
      blockUnit += ' <span class="priority pcd">PcD</span>';
    } else if (priority === 'elderly') {
      blockUnit += ' <span class="priority elderly">Idoso</span>';
    }

    // Marcar Veículo Grande
    if (participant.hasLargeCar || (spot?.size === 'G' || spot?.size === 'XG')) {
      blockUnit += ' <span class="priority large-car">Veículo Grande</span>';
    }

    // Marcar Veículo Pequeno
    if (participant.hasSmallCar) {
      blockUnit += ' <span class="priority small-car">Veículo Pequeno</span>';
    }

    // Marcar Motocicleta
    if (participant.hasMotorcycle) {
      blockUnit += ' <span class="priority motorcycle">Motocicleta</span>';
    }

    // Marcar Preferências de Vaga
    if (participant.prefersCovered) {
      blockUnit += ' <span class="priority covered">P. Vaga Coberta</span>';
    }
    if (participant.prefersUncovered) {
      blockUnit += ' <span class="priority uncovered">P. Vaga Descoberta</span>';
    }
    if (participant.prefersLinkedSpot) {
      blockUnit += ' <span class="priority linked">P. Vaga Presa</span>';
    }
    if (participant.prefersUnlinkedSpot) {
      blockUnit += ' <span class="priority unlinked">P. Vaga Livre</span>';
    }
    if (participant.prefersCommonSpot) {
      blockUnit += ' <span class="priority common">P. Vaga Comum</span>';
    }
    if (participant.prefersSmallSpot) {
      blockUnit += ' <span class="priority small-car">P. Vaga Pequena</span>';
    }

    return blockUnit;
  };

  const getSpotInfo = (id: string) => {
    return parkingSpots.find(s => s.id === id);
  };

  const getPriorityLabel = (priority: string) => {
    switch (priority) {
      case 'special-needs': return 'PcD';
      case 'elderly': return 'Idoso';
      case 'up-to-date': return 'Adimplente';
      default: return 'Normal';
    }
  };

  const htmlContent = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Relatório do Sorteio - ${sessionName}</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          margin: 40px;
          color: #333;
        }
        .header {
          text-align: center;
          margin-bottom: 40px;
          border-bottom: 2px solid ${companyColor};
          padding-bottom: 20px;
        }
        .header .logo-container {
          margin-bottom: 15px;
        }
        .header .company-name {
          font-size: 24px;
          font-weight: bold;
          color: ${companyColor};
          margin-bottom: 5px;
        }
        .header h1 {
          color: ${companyColor};
          margin: 0;
          font-size: 28px;
        }
        .header p {
          color: #666;
          margin: 10px 0 0 0;
          font-size: 14px;
        }
        .summary {
          background: #f8fafc;
          padding: 20px;
          border-radius: 8px;
          margin-bottom: 30px;
        }
        .summary h2 {
          margin: 0 0 15px 0;
          color: #1e293b;
          font-size: 18px;
        }
        .summary-item {
          display: inline-block;
          margin-right: 30px;
          margin-bottom: 10px;
        }
        .summary-item strong {
          color: ${companyColor};
        }
        .results {
          margin-bottom: 40px;
        }
        .results h2 {
          color: #1e293b;
          border-bottom: 1px solid #e2e8f0;
          padding-bottom: 10px;
          margin-bottom: 20px;
        }
        table {
          width: 100%;
          border-collapse: collapse;
          margin-bottom: 30px;
        }
        th, td {
          padding: 12px;
          text-align: left;
          border-bottom: 1px solid #e2e8f0;
        }
        th {
          background-color: #f8fafc;
          font-weight: 600;
          color: #1e293b;
        }
        tr:nth-child(even) {
          background-color: #f8fafc;
        }
        .position {
          font-weight: bold;
          color: ${companyColor};
          text-align: center;
          width: 60px;
        }
        .priority {
          display: inline-block;
          padding: 4px 8px;
          border-radius: 4px;
          font-size: 11px;
          font-weight: 600;
          text-transform: uppercase;
        }
        .priority.pcd { background: #9333ea; color: white; }
        .priority.elderly { background: #38bdf8; color: white; }
        .priority.pregnant { background: #10b981; color: white; }
        .priority.up-to-date { background: #dc2626; color: white; }
        .priority.normal { background: #16a34a; color: white; }
        .priority.large-car { background: #000; color: #fff; }
        .priority.small-car { background: #eab308; color: #000; }
        .priority.motorcycle { background: #92400e; color: white; }
        .priority.covered { background: #1d4ed8; color: white; }
        .priority.uncovered { background: #f97316; color: white; }
        .priority.linked { background: #db2777; color: white; }
        .priority.unlinked { background: #16a34a; color: white; }
        .priority.common { background: #64748b; color: white; }

        .footer {
          text-align: center;
          font-size: 12px;
          color: #666;
          border-top: 1px solid #e2e8f0;
          padding-top: 20px;
          margin-top: 40px;
        }
        .audit {
          margin-top: 30px;
          font-size: 12px;
          color: #666;
        }
        .audit p {
          margin: 5px 0;
        }
        @media print {
          body { margin: 20px; }
          .header { page-break-after: avoid; }
        }
      </style>
    </head>
    <body>
      <div class="header">
        <div class="logo-container">
          <img src="${companyLogo}" alt="${companyName}" style="max-width: 200px; max-height: 120px; height: auto;" />
        </div>
        <div class="company-name">${companyName}</div>
        <h1>Relatório do Sorteio de Vagas</h1>
        ${buildingName ? `<p style="font-size: 22px; font-weight: 700; color: ${companyColor}; margin-top: 10px; margin-bottom: 5px;">Condomínio: ${buildingName}</p>` : ''}
        <p>${sessionName}</p>
        <p>Gerado em: ${new Date().toLocaleString('pt-BR')}</p>
      </div>

      <div class="summary">
        <h2>Resumo do Sorteio</h2>
        <div class="summary-item">
          <strong>Total de Resultados:</strong> ${results.length}
        </div>
        <div class="summary-item">
          <strong>Data/Hora:</strong> ${new Date().toLocaleString('pt-BR')}
        </div>
        <div class="summary-item">
          <strong>Participantes PcD:</strong> ${results.filter(r => r.priority === 'special-needs').length}
        </div>
        <div class="summary-item">
          <strong>Idosos:</strong> ${results.filter(r => r.priority === 'elderly').length}
        </div>
      </div>

      <div class="results">
        <h2>Resultados do Sorteio</h2>
        <table>
          <thead>
            <tr>
              <th class="position">#</th>
              <th>Bloco - Unidade</th>
              <th>Vaga Sorteada</th>
              <th>Localização da Vaga</th>
              <th>Tipo da Vaga Sorteada</th>
            </tr>
          </thead>
          <tbody>
            ${sortedResults.map((result, index) => {  // ✅ TROCAR results por sortedResults
    const spotCtx = getSpotInfo(result.parkingSpotId);
    const spotFromSnapshot = result.spotSnapshot as any;
    const spot = spotCtx || spotFromSnapshot;
    const spotTypeValue = spot?.type ?? spotFromSnapshot?.type;
    const spotTypesArray = Array.isArray(spotTypeValue) ? spotTypeValue.filter(t => t !== 'Vaga Comum') : (spotTypeValue && spotTypeValue !== 'Vaga Comum' ? [spotTypeValue] : []);
    const spotTypes = spotTypesArray.join(', ');
    const spotNumber = spot?.number || spotFromSnapshot?.number || 'N/A';
    const spotFloor = spot?.floor || spotFromSnapshot?.floor || 'N/A';
    const spotSize = spot?.size || spotFromSnapshot?.size || 'N/A';

    const isCovered = (spot?.isCovered ?? spotFromSnapshot?.isCovered) === true;
    const isUncovered = (spot?.isUncovered ?? spotFromSnapshot?.isUncovered) === true;
    const coverage = isCovered ? 'Vaga Coberta' : (isUncovered ? 'Vaga Descoberta' : '');

    const tipoDisplay = [spotTypes, coverage].filter(Boolean).join(', ') || 'Vaga Comum';

    return `
                <tr>
                  <td class="position">${index + 1}°</td>
                  <td>${getParticipantBlockUnit(result.participantId, result.priority, result.participantSnapshot as any, spot)}</td>
                  <td><strong>${spotNumber}</strong></td>
                  <td>${spotFloor}</td>
                  <td>${tipoDisplay}</td>
                </tr>
              `;
  }).join('')}
          </tbody>
        </table>
      </div>

      <div class="audit">
        <h3>Informações de Auditoria</h3>
        <p><strong>Sistema:</strong> Sistema de Sorteio Eletrônico de Vagas</p>
        <p><strong>Método:</strong> Sorteio aleatório com prioridades definidas</p>
        <p><strong>Critérios de Prioridade da Unidade:</strong></p>
        <ul>
          <li>1º - Pessoa com Deficiência (PcD)</li>
          <li>2º - Idosos (60+ anos)</li>
          <li>3º - Condôminos adimplentes</li>
        </ul>
        <p><strong>Transparência:</strong> Todos os participantes selecionados tiveram oportunidade igual dentro de sua categoria de prioridade</p>
      </div>

      <div class="footer">
        <p><strong>${companyName} - Inteligência Condominial</strong></p>
        <p>Este documento foi gerado automaticamente pelo Sistema de Sorteio Eletrônico</p>
        <p>Para validação, verifique a integridade dos dados com os registros oficiais</p>
      </div>
    </body>
    </html>
  `;

  // Create and download the PDF
  const printWindow = window.open('', '_blank');
  if (printWindow) {
    printWindow.document.open();
    printWindow.document.write(htmlContent);
    printWindow.document.close();

    printWindow.onload = () => {
      setTimeout(() => {
        printWindow.print();
      }, 250);
    };
  }
};

export const exportDataAsJSON = (data: any, filename: string) => {
  const dataStr = JSON.stringify(data, null, 2);
  const dataBlob = new Blob([dataStr], { type: 'application/json' });
  const url = URL.createObjectURL(dataBlob);

  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}.json`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
};

export const exportDataAsCSV = (results: LotteryResult[], participants: Participant[], parkingSpots: ParkingSpot[], filename: string) => {
  const getParticipantName = (id: string) => {
    return participants.find(p => p.id === id)?.name || 'Participante não encontrado';
  };

  const getSpotInfo = (id: string) => {
    return parkingSpots.find(s => s.id === id);
  };

  const getPriorityLabel = (priority: string) => {
    switch (priority) {
      case 'special-needs': return 'PcD';
      case 'elderly': return 'Idoso';
      case 'pregnant': return 'Gestante';
      case 'up-to-date': return 'Adimplente';
      default: return 'Normal';
    }
  };

  const csvHeader = 'Posição,Participante,Vaga,Andar,Tipo,Tamanho,Prioridade,Data/Hora\n';
  const csvContent = results.map((result, index) => {
    const spot = getSpotInfo(result.parkingSpotId);
    // Filtrar "Vaga Comum" dos tipos e criar array de strings
    const spotTypesArray: string[] = spot?.type ? (Array.isArray(spot.type) ? spot.type.filter(t => t !== 'Vaga Comum') : (spot.type !== 'Vaga Comum' ? [spot.type] : [])) : [];
    // Adicionar informação de cobertura
    if (spot?.isCovered) spotTypesArray.push('Vaga Coberta');
    if (spot?.isUncovered) spotTypesArray.push('Vaga Descoberta');
    const spotTypes = spotTypesArray.length > 0 ? spotTypesArray.join('; ') : 'N/A';
    return [
      index + 1,
      `"${getParticipantName(result.participantId)}"`,
      spot?.number || 'N/A',
      `"${spot?.floor || 'N/A'}"`,
      `"${spotTypes}"`,
      spot?.size || 'N/A',
      getPriorityLabel(result.priority),
      `"${result.timestamp.toLocaleString('pt-BR')}"`
    ].join(',');
  }).join('\n');

  const csvData = csvHeader + csvContent;
  const csvBlob = new Blob([csvData], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(csvBlob);

  const link = document.createElement('a');
  link.href = url;
  link.download = `${filename}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  URL.revokeObjectURL(url);
};

export const exportToExcel = async (
  sessionName: string,
  results: LotteryResult[],
  participants: Participant[],
  parkingSpots: ParkingSpot[],
  buildingName?: string
) => {
  const XLSX = await import('xlsx');

  const getParticipantInfo = (id: string, snapshot?: any) => {
    const participant = participants.find(p => p.id === id) || snapshot;
    return participant;
  };

  const getSpotInfo = (id: string, snapshot?: any) => {
    return parkingSpots.find(s => s.id === id) || snapshot;
  };

  const getPriorityLabel = (priority: string) => {
    switch (priority) {
      case 'special-needs': return 'PcD';
      case 'elderly': return 'Idoso';
      case 'pregnant': return 'Gestante';
      case 'up-to-date': return 'Adimplente';
      default: return 'Normal';
    }
  };

  // Ordenar por bloco/unidade
  const sortedResults = [...results].sort((a, b) => {
    const participantA = getParticipantInfo(a.participantId, a.participantSnapshot);
    const participantB = getParticipantInfo(b.participantId, b.participantSnapshot);

    const blockA = participantA?.block || '';
    const blockB = participantB?.block || '';

    if (blockA !== blockB) {
      return blockA.localeCompare(blockB, 'pt-BR', { numeric: true });
    }

    const unitA = participantA?.unit || '';
    const unitB = participantB?.unit || '';

    return unitA.localeCompare(unitB, 'pt-BR', { numeric: true });
  });

  // Criar dados para a planilha
  const excelData = sortedResults.map((result, index) => {
    const participant = getParticipantInfo(result.participantId, result.participantSnapshot);
    const spot = getSpotInfo(result.parkingSpotId, result.spotSnapshot);

    const spotTypesArray: string[] = spot?.type 
      ? (Array.isArray(spot.type) ? spot.type.filter((t: string) => t !== 'Vaga Comum') : (spot.type !== 'Vaga Comum' ? [spot.type] : [])) 
      : [];
    
    if (spot?.isCovered) spotTypesArray.push('Coberta');
    if (spot?.isUncovered) spotTypesArray.push('Descoberta');
    const spotTypes = spotTypesArray.length > 0 ? spotTypesArray.join(', ') : 'Comum';

    return {
      'Posição': index + 1,
      'Bloco': participant?.block || 'N/A',
      'Unidade': participant?.unit || 'N/A',
      'Morador': participant?.name || 'N/A',
      'Vaga': spot?.number || 'N/A',
      'Andar/Localização': spot?.floor || 'N/A',
      'Tipo da Vaga': spotTypes,
      'Tamanho': spot?.size || 'N/A',
      'Prioridade': getPriorityLabel(result.priority),
      'Data/Hora': result.timestamp instanceof Date 
        ? result.timestamp.toLocaleString('pt-BR') 
        : new Date(result.timestamp).toLocaleString('pt-BR')
    };
  });

  // Criar workbook e worksheet
  const worksheet = XLSX.utils.json_to_sheet(excelData);
  const workbook = XLSX.utils.book_new();

  // Ajustar largura das colunas
  const columnWidths = [
    { wch: 8 },   // Posição
    { wch: 10 },  // Bloco
    { wch: 10 },  // Unidade
    { wch: 30 },  // Morador
    { wch: 12 },  // Vaga
    { wch: 20 },  // Andar/Localização
    { wch: 25 },  // Tipo da Vaga
    { wch: 10 },  // Tamanho
    { wch: 15 },  // Prioridade
    { wch: 20 },  // Data/Hora
  ];
  worksheet['!cols'] = columnWidths;

  XLSX.utils.book_append_sheet(workbook, worksheet, 'Resultado do Sorteio');

  // Criar nome do arquivo
  const dateStr = new Date().toISOString().split('T')[0];
  const safeSessionName = sessionName.replace(/[^a-zA-Z0-9\-_]/g, '_');
  const safeBuildingName = buildingName ? buildingName.replace(/[^a-zA-Z0-9\-_]/g, '_') : '';
  const filename = `Sorteio_${safeBuildingName}_${safeSessionName}_${dateStr}.xlsx`;

  // Download do arquivo
  XLSX.writeFile(workbook, filename);
};