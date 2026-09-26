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
