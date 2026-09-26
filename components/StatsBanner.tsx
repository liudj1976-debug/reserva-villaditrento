import React from 'react';
import { Space, Reservation } from '../types';

interface StatCardProps {
  icon: React.ReactNode;
  value: any;
  label: string;
  delay: number;
}

const StatCard: React.FC<StatCardProps> = ({ icon, value, label, delay }) => (
  <div className="bg-white/50 dark:bg-black/20 p-4 rounded-xl shadow-md border border-white/20 dark:border-white/5 flex items-center gap-4 animate-slide-up" style={{ '--delay': `${delay}s` } as any}>
    <div className="text-3xl text-green-700 dark:text-green-400">{icon}</div>
    <div>
      <p className="text-2xl font-bold text-green-900 dark:text-green-100">{value}</p>
      <p className="text-sm text-gray-500 dark:text-gray-400">{label}</p>
    </div>
  </div>
);

interface StatsBannerProps {
  reservations: Reservation[];
  spaces: Space[];
}

export const StatsBanner: React.FC<StatsBannerProps> = ({ reservations, spaces }) => (
  <div className="my-6 p-4 rounded-xl bg-gradient-to-r from-green-100 to-yellow-100 dark:from-green-900/40 dark:to-yellow-900/20 border border-green-200/50 dark:border-green-800/30 animate-slide-up" style={{ '--delay': '0.2s' } as any}>
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
      <StatCard icon={<i className="fas fa-calendar-check"></i>} value={reservations.filter(r => r.status !== 'Cancelado').length} label="Total de Reservas" delay={0.4} />
      <StatCard icon={<i className="fas fa-building"></i>} value={spaces.length} label="Espaços Disponíveis" delay={0.6} />
      <StatCard icon={<i className="fas fa-users"></i>} value={spaces.reduce((acc, s) => acc + s.capacity, 0)} label="Capacidade Total" delay={0.8} />
    </div>
  </div>
);
