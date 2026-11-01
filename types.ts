import React from 'react';
import { User as FirebaseUser } from 'firebase/auth';

export interface Space {
  id: number;
  name: string;
  capacity: number;
  features: string[];
  image: string;
  icon: (props: any) => React.ReactElement;
}

export interface Reservation {
  id: string;
  spaceName: string;
  date: string;
  apartment: string;
  status: 'Pendente' | 'Confirmado';
  value: number;
  createdAt: string;
  userId?: string;
  userEmail?: string;
  proofUrl?: string;
  confirmedBy?: string;
  confirmedAt?: string;
}

export interface BlockedDate {
  id: string;
  spaceName: string;
  date: string;
  reason: string;
}

export interface Resident {
  id: string;
  fullName: string;
  apartment: string;
  phone: string; // com DDD
  status: 'ativo' | 'inativo' | 'pendente';
  relationshipType?: string;
  vehicles?: string;
  dependents?: { name: string; relationship: string }[];
}

export interface Package {
  id: string;
  residentId: string;
  residentName: string;
  apartment: string;
  receivedAt: string;
  packageType?: string;        // Tipo padronizado: Amazon, Correios, etc.
  description: string;         // Detalhes adicionais
  observations?: string;       // Observações do porteiro (danos, etc.)
  photoUrl: string;
  status: 'Recebido' | 'Notificado' | 'Entregue';
  notifiedAt?: string;         // Quando o WhatsApp foi enviado
  deliveredAt?: string;
  code?: string;               // Código único VT-XXXX
  deliveredToName?: string;    // Nome de quem retirou (comprovante)
  residentNameLower?: string;  // residentName em minúsculas, para busca por prefixo no Firestore
  items?: PackageItem[];       // Encomendas extras consolidadas neste mesmo registro (mesmo morador)
}

// Quando chega uma 2ª (3ª, 4ª...) encomenda para quem já tem uma pendente,
// em vez de criar um registro novo, a foto/detalhe entra aqui dentro do
// registro já existente.
export interface PackageItem {
  photoUrl: string;
  packageType: string;
  description?: string;
  receivedAt: string;
}

export interface SuggestionComplaint {
  id: string;
  type: 'Sugestão' | 'Reclamação';
  subject: string;
  description: string;
  userId: string;
  apartment: string;
  createdAt: string;
  status: 'Pendente' | 'Respondido';
  adminReply?: string;
  repliedAt?: string;
}

export type User = FirebaseUser;
