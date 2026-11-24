import React, { useEffect, useRef, useState } from 'react';
import { Link, NavLink, Outlet, useLocation } from 'react-router-dom';
import {
  Activity,
  Bell,
  BookOpen,
  CalendarClock,
  Leaf,
  Map as MapIcon,
  MapPin,
  Menu,
  MessageSquareText,
  RefreshCw,
  Shield,
  SlidersHorizontal,
  Wind,
  X,
} from 'lucide-react';
import { useVayu } from '../context/VayuContext.tsx';
import { CitySearchModal } from '../components/common/CitySearchModal.tsx';
import { NotificationsPanel } from '../components/common/NotificationsPanel.tsx';
import { PreferencesModal } from '../components/common/PreferencesModal.tsx';
import { VayuWindScene } from '../components/three/VayuWindScene.tsx';

const NAV_ITEMS = [
  { to: '/dashboard', label: 'Air Dashboard', icon: Activity },
  { to: '/map', label: 'Pollution Map', icon: MapIcon },
  { to: '/ask', label: 'Ask VAYU AI', icon: MessageSquareText },
  { to: '/planner', label: 'Routine Planner', icon: CalendarClock },
  { to: '/family', label: 'Family Protection', icon: Shield },
  { to: '/community', label: 'Sustainability', icon: Leaf },
  { to: '/about', label: 'Methodology', icon: BookOpen },
];

export const AppLayout: React.FC = () => {
  const {
    location,
    setLocation,
    dataset,
    loading,
    refreshData,
    preferences,
    updatePreferences,
    notifications,
    dismissNotification,
  } = useVayu();

  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [cityModalOpen, setCityModalOpen] = useState(false);
  const [prefsModalOpen, setPrefsModalOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const routeLoc = useLocation();

  const mobileMenuBtnRef = useRef<HTMLButtonElement | null>(null);
  const mobileCloseBtnRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    mobileCloseBtnRef.current?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setMobileMenuOpen(false);
        mobileMenuBtnRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [mobileMenuOpen]);

  const closeMobileMenu = () => {
    setMobileMenuOpen(false);
    requestAnimationFrame(() => mobileMenuBtnRef.current?.focus());
  };

  const freshnessText = loading
    ? 'Updating...'
    : dataset
      ? dataset.isStale
        ? `Aged (${dataset.dataAgeMinutes}m)`
        : `Fresh (${dataset.dataAgeMinutes}m ago)`
      : 'Unavailable';

  return (
    <div className="min-h-screen bg-[#07111F] text-[#F2F7FA] relative flex">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      {/* Subdued 3D Wind Environment behind dashboard workspace */}
      <VayuWindScene intensity="subdued" reducedMotion={preferences.reducedMotion} />

      {/* Desktop Sidebar */}
      <aside className="hidden lg:flex lg:w-64 lg:flex-col lg:fixed lg:inset-y-0 z-20 border-r border-white/10 bg-[#07111F]/92">
        <div className="h-16 px-5 flex items-center border-b border-white/10">
          <Link
            to="/"
            className="flex items-center gap-2.5 font-display text-lg font-bold tracking-tight text-[#F2F7FA] whitespace-nowrap"
          >
            <Wind className="w-5 h-5 text-[#49E3D0]" aria-hidden="true" />
            <span>VAYU AI</span>
          </Link>
        </div>

        <nav aria-label="Primary navigation" className="flex-1 px-3 py-5 space-y-1 overflow-y-auto">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-xl px-3.5 py-2.5 text-sm font-medium transition-colors whitespace-nowrap ${
                    isActive
                      ? 'bg-[#16C7B0]/15 text-[#49E3D0] border border-[#49E3D0]/30'
                      : 'text-[#B5C7D4] hover:bg-white/5 hover:text-[#F2F7FA] border border-transparent'
                  }`
                }
              >
                <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>

        <div className="p-4 border-t border-white/10 text-xs text-[#B5C7D4]">
          <div className="font-medium text-[#F2F7FA] truncate">
            {location.name}
            {location.country ? `, ${location.country}` : ''}
          </div>
          <div className="mt-1 font-mono text-xs text-[#9BB0C0]">
            {dataset ? `${dataset.currentTimestamp} · ${preferences.preferredScale === 'european_aqi' ? 'EU EAQI' : 'US AQI'}` : 'Open-Meteo CAMS'}
          </div>
        </div>
      </aside>

      {/* Mobile Navigation Drawer */}
      {mobileMenuOpen && (
        <div
          id="mobile-nav-drawer"
          role="dialog"
          aria-modal="true"
          aria-label="Mobile navigation menu"
          className="fixed inset-0 z-50 lg:hidden flex"
        >
          <div
            className="fixed inset-0 bg-[#07111F]/80"
            onClick={closeMobileMenu}
            aria-hidden="true"
          />
          <aside className="relative z-10 w-72 max-w-[82vw] bg-[#0B1928] border-r border-white/10 flex flex-col">
            <div className="h-14 px-4 flex items-center justify-between border-b border-white/10">
              <Link
                to="/"
                onClick={() => setMobileMenuOpen(false)}
                className="flex items-center gap-2 font-display text-base font-bold text-[#F2F7FA]"
              >
                <Wind className="w-4 h-4 text-[#49E3D0]" aria-hidden="true" />
                <span>VAYU AI</span>
              </Link>
              <button
                ref={mobileCloseBtnRef}
                type="button"
                onClick={closeMobileMenu}
                aria-label="Close navigation menu"
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-[#B5C7D4] hover:bg-white/5 hover:text-[#F2F7FA]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <nav aria-label="Mobile navigation" className="flex-1 p-3 space-y-1 overflow-y-auto">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    onClick={() => setMobileMenuOpen(false)}
                    className={({ isActive }) =>
                      `flex items-center gap-3 rounded-xl px-3.5 py-3 min-h-[44px] text-sm font-medium ${
                        isActive
                          ? 'bg-[#16C7B0]/15 text-[#49E3D0] border border-[#49E3D0]/30'
                          : 'text-[#B5C7D4] hover:bg-white/5 hover:text-[#F2F7FA]'
                      }`
                    }
                  >
                    <Icon className="w-4 h-4 shrink-0" aria-hidden="true" />
                    <span>{item.label}</span>
                  </NavLink>
                );
              })}
            </nav>

            <div className="p-4 border-t border-white/10 text-xs text-[#B5C7D4] space-y-1">
              <div className="font-medium text-[#F2F7FA] truncate">
                {location.name}
                {location.country ? `, ${location.country}` : ''}
              </div>
              <div className="font-mono text-xs text-[#9BB0C0]">
                {freshnessText} · {preferences.preferredScale === 'european_aqi' ? 'EU EAQI' : 'US AQI'}
              </div>
            </div>
          </aside>
        </div>
      )}

      {/* Main Content Area */}
      <div className="flex-1 lg:pl-64 flex flex-col min-w-0 relative z-10">
        {/* Consistent Header */}
        <header className="sticky top-0 z-30 h-16 border-b border-white/10 bg-[#07111F]/95 px-4 sm:px-6 flex items-center justify-between gap-2.5">
          <div className="flex items-center gap-2 min-w-0">
            <button
              ref={mobileMenuBtnRef}
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation menu"
              aria-expanded={mobileMenuOpen}
              aria-controls="mobile-nav-drawer"
              className="lg:hidden min-h-[44px] min-w-[44px] -ml-2 flex items-center justify-center rounded-xl text-[#B5C7D4] hover:bg-white/5 hover:text-[#F2F7FA]"
            >
              <Menu className="w-5 h-5" />
            </button>

            <button
              type="button"
              onClick={() => setCityModalOpen(true)}
              aria-label={`Change location, currently ${location.name}`}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-[#102334] px-3 min-h-[40px] text-xs sm:text-sm font-medium text-[#F2F7FA] hover:border-[#49E3D0]/40 transition-colors min-w-0"
            >
              <MapPin className="w-3.5 h-3.5 text-[#49E3D0] shrink-0" aria-hidden="true" />
              <span className="truncate max-w-[130px] sm:max-w-[220px]">
                {location.name}
                {location.country ? `, ${location.country}` : ''}
              </span>
            </button>

            <span
              className="hidden md:inline-flex items-center gap-1.5 text-xs text-[#B5C7D4] font-mono whitespace-nowrap"
              title="Environmental data freshness"
            >
              <span>·</span>
              <span>{freshnessText}</span>
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => refreshData()}
              disabled={loading}
              aria-label="Refresh environmental data"
              title="Refresh environmental data"
              className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl border border-white/10 bg-[#102334] text-[#B5C7D4] hover:text-[#F2F7FA] hover:border-white/20 disabled:opacity-50"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} aria-hidden="true" />
            </button>

            <button
              type="button"
              onClick={() => setNotifOpen((v) => !v)}
              aria-label={`Notifications (${notifications.length} active)`}
              aria-expanded={notifOpen}
              className="relative min-h-[40px] min-w-[40px] flex items-center justify-center rounded-xl border border-white/10 bg-[#102334] text-[#B5C7D4] hover:text-[#F2F7FA] hover:border-white/20"
            >
              <Bell className="w-4 h-4" aria-hidden="true" />
              {notifications.length > 0 && (
                <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-[#16C7B0] text-[#07111F] font-mono text-[10px] font-bold flex items-center justify-center">
                  {notifications.length}
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setPrefsModalOpen(true)}
              aria-label="User display preferences"
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-[#102334] px-3 min-h-[40px] min-w-[40px] text-xs font-medium text-[#B5C7D4] hover:text-[#F2F7FA] hover:border-white/20 whitespace-nowrap"
            >
              <SlidersHorizontal className="w-4 h-4 sm:w-3.5 sm:h-3.5" aria-hidden="true" />
              <span className="hidden sm:inline">Preferences</span>
            </button>
          </div>
        </header>

        <main
          id="main-content"
          tabIndex={-1}
          className="flex-1 p-4 sm:p-6 lg:p-8 max-w-[1320px] w-full mx-auto focus:outline-none"
          data-route={routeLoc.pathname}
        >
          <Outlet />
        </main>
      </div>

      <CitySearchModal
        open={cityModalOpen}
        onClose={() => setCityModalOpen(false)}
        currentLocation={location}
        onSelectLocation={setLocation}
      />

      <PreferencesModal
        open={prefsModalOpen}
        onClose={() => setPrefsModalOpen(false)}
        preferences={preferences}
        onUpdate={updatePreferences}
      />

      <NotificationsPanel
        open={notifOpen}
        onClose={() => setNotifOpen(false)}
        notifications={notifications}
        onDismiss={dismissNotification}
      />
    </div>
  );
};
