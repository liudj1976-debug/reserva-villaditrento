import React from 'react';
import { Space } from '../types';

interface SpaceCardProps {
  space: Space;
  delay: number;
  price: number;
  onBooking: (space: Space) => void;
}

export const SpaceCard: React.FC<SpaceCardProps> = ({ space, delay, price, onBooking }) => (
  <div className="bg-white dark:bg-neutral-900 rounded-2xl shadow-lg overflow-hidden group hover-lift border border-transparent dark:border-white/5 animate-slide-up" style={{ '--delay': `${delay}s` } as any}>
    <div className="relative">
      <img src={space.image} alt={space.name} className="w-full h-48 object-cover transition-transform duration-700 group-hover:scale-110" />
      <div className="absolute top-4 right-4 bg-white/90 dark:bg-black/80 backdrop-blur-md text-green-700 dark:text-green-400 font-bold py-1.5 px-4 rounded-full shadow-lg animate-pulse-subtle">
        R$ {(price || 0).toFixed(2).replace('.', ',')}
      </div>
    </div>
    <div className="p-6">
      <div className="flex items-center gap-4 mb-4">
        <div className="transition-transform duration-500 group-hover:rotate-12">{space.icon({})}</div>
        <h3 className="text-2xl font-bold dark:text-white">{space.name}</h3>
      </div>
      <div className="space-y-3 mb-8">
        <p className="text-gray-600 dark:text-gray-400 flex items-center gap-2"><i className="fas fa-users text-green-600"></i>Capacidade: {space.capacity} pessoas</p>
        <ul className="space-y-2">
          {space.features.map(feat => (
            <li key={feat} className="flex items-center text-gray-500 dark:text-gray-400 text-sm">
              <i className="fas fa-check-circle text-green-500 mr-2 text-xs"></i>{feat}
            </li>
          ))}
        </ul>
      </div>
      <button onClick={() => onBooking(space)} className="w-full bg-green-600 hover:bg-green-700 text-white font-bold py-4 rounded-xl shadow-md transition-all active:scale-95">
        <i className="fas fa-calendar-alt mr-2"></i>Reservar Agora
      </button>
    </div>
  </div>
);
