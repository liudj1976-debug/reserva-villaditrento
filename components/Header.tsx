import React from 'react';
import { AppRole, canAccessAdmin, canAccessPortaria } from '../utils/authorization';

interface HeaderProps {
  user: any;
  role: AppRole | null;
  isAdminMode: boolean;
  isPackageMode: boolean;
  isDarkMode: boolean;
  setIsDarkMode: (val: boolean) => void;
  handleLogout: () => void;
  setAuthModalOpen: (val: boolean) => void;
  setIsAdminMode: (val: boolean) => void;
  setIsPackageMode: (val: boolean) => void;
  triggerHaptic: (style?: 'light' | 'medium' | 'heavy') => void;
}

export const Header: React.FC<HeaderProps> = ({
  user,
  role,
  isAdminMode,
  isPackageMode,
  isDarkMode,
  setIsDarkMode,
  handleLogout,
  setAuthModalOpen,
  setIsAdminMode,
  setIsPackageMode,
  triggerHaptic
}) => (
  <header className="sticky top-4 z-30 mx-4 mt-4 glassmorphism rounded-xl shadow-lg border-green-300/50 dark:border-white/10 animate-slide-up">
    <div className="container mx-auto px-2 md:px-4 py-3 flex justify-between items-center text-sm md:text-base">
      <div className="flex items-center gap-2 md:gap-3 shrink-0">
        <i className="fas fa-home text-2xl md:text-3xl bg-clip-text text-transparent bg-gradient-to-r from-green-600 to-yellow-500 animate-pulse-subtle"></i>
        <div className="flex flex-col">
          <h1 className="text-base sm:text-lg md:text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-green-800 to-yellow-600 dark:from-green-400 dark:to-yellow-300 whitespace-nowrap leading-none">
            Villa Di Trento
          </h1>
          {user && (
            <span className="text-[10px] md:text-xs font-bold text-green-700/70 dark:text-green-400/70 mt-0.5">
              Olá, {user.displayName || user.email?.split('@')[0]}
            </span>
          )}
        </div>
      </div>
      <div className="flex items-center gap-1 md:gap-2">
        <button
          onClick={() => { triggerHaptic(); setIsDarkMode(!isDarkMode); }}
          className="p-3 text-yellow-600 dark:text-yellow-400 hover:bg-yellow-50 dark:hover:bg-yellow-900/20 rounded-xl transition shadow-sm border border-transparent dark:border-white/5"
          title={isDarkMode ? "Modo Claro" : "Modo Escuro"}
        >
          <i className={`fas ${isDarkMode ? 'fa-sun' : 'fa-moon'} text-lg`}></i>
        </button>
        {user ? (
          <div className="flex items-center gap-2">
            <button
              onClick={() => { triggerHaptic(); handleLogout(); }}
              className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition"
              title="Sair"
            >
              <i className="fas fa-sign-out-alt"></i>
            </button>
            {user?.uid && (
              canAccessPortaria(role)
            ) && (
              <button
                onClick={() => {
                  triggerHaptic('medium');
                  if (isPackageMode) setIsPackageMode(false);
                  else setIsPackageMode(true);
                  setIsAdminMode(false);
                }}
                title="Portaria"
                className="bg-blue-600/10 dark:bg-blue-400/20 text-blue-900 dark:text-blue-100 font-bold py-2 px-2 md:px-4 rounded-lg hover:bg-blue-600/20 transition-all duration-300 whitespace-nowrap"
              >
                {isPackageMode ? (
                  <><i className="fas fa-arrow-left"></i><span className="hidden md:inline ml-2">Voltar</span></>
                ) : (
                  <><i className="fas fa-box"></i><span className="hidden md:inline ml-2">Portaria</span></>
                )}
              </button>
            )}
            {canAccessAdmin(role) && (
            <button
              onClick={() => {
                triggerHaptic('medium');
                if (isAdminMode) {
                  setIsAdminMode(false);
                } else {
                  if (canAccessAdmin(role)) { setIsAdminMode(true); }
                }
                setIsPackageMode(false);
              }}
              title="Painel do Síndico"
              className="bg-green-600/10 dark:bg-green-400/20 text-green-900 dark:text-green-100 font-bold py-2 px-2 md:px-4 rounded-lg hover:bg-green-600/20 transition-all duration-300 whitespace-nowrap"
            >
              {isAdminMode ? (
                <><i className="fas fa-times"></i><span className="hidden md:inline ml-2">Sair Painel</span></>
              ) : (
                <><i className="fas fa-lock"></i><span className="hidden md:inline ml-2">Síndico</span></>
              )}
            </button>)}
          </div>
        ) : (
          <button
            onClick={() => { triggerHaptic(); setAuthModalOpen(true); }}
            className="bg-green-600 text-white font-bold py-2 px-6 rounded-lg shadow-md hover:bg-green-700 transition-all duration-300"
          >
            Entrar
          </button>
        )}
      </div>
    </div>
  </header>
);
