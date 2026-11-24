import React, { useEffect, useRef, useState } from 'react';
import { LocateFixed, MapPin, Search, X } from 'lucide-react';
import { PRESET_CITIES } from '../../config/constants.ts';
import type { CityLocation } from '../../types/airQuality.ts';

interface CitySearchModalProps {
  open: boolean;
  onClose: () => void;
  currentLocation: CityLocation;
  onSelectLocation: (loc: CityLocation) => void;
}

export const CitySearchModal: React.FC<CitySearchModalProps> = ({
  open,
  onClose,
  currentLocation,
  onSelectLocation,
}) => {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<CityLocation[]>([]);
  const [searching, setSearching] = useState(false);
  const [geoLoading, setGeoLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (!open) return;
    requestAnimationFrame(() => inputRef.current?.focus());
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const handleSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (query.trim().length < 2) {
      setError('Enter at least 2 characters to search.');
      return;
    }
    setSearching(true);
    setError(null);
    try {
      const res = await fetch(`/api/geocode?q=${encodeURIComponent(query.trim())}`);
      const json = await res.json();
      if (!res.ok) {
        throw new Error(json.error || 'City lookup failed');
      }
      setResults(json.results ?? []);
      if ((json.results ?? []).length === 0) {
        setError(`No cities matched "${query.trim()}". Try another city name.`);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Unable to search cities.');
    } finally {
      setSearching(false);
    }
  };

  const handleBrowserLocation = () => {
    if (!navigator.geolocation) {
      setError('Browser geolocation is not supported on this device.');
      return;
    }
    setGeoLoading(true);
    setError(null);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeoLoading(false);
        onSelectLocation({
          id: `gps-${pos.coords.latitude.toFixed(2)}-${pos.coords.longitude.toFixed(2)}`,
          name: 'Current Location',
          country: 'Browser GPS',
          latitude: Math.round(pos.coords.latitude * 10000) / 10000,
          longitude: Math.round(pos.coords.longitude * 10000) / 10000,
        });
        onClose();
      },
      (geoErr) => {
        setGeoLoading(false);
        setError(geoErr.message || 'Location access was declined or unavailable.');
      },
      { timeout: 10000 },
    );
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="city-modal-title"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      className="fixed inset-0 z-50 flex items-center justify-center bg-[#07111F]/80 p-4"
    >
      <div className="w-full max-w-lg max-h-[90vh] overflow-y-auto rounded-2xl border border-white/10 bg-[#0B1928] p-6 shadow-2xl">
        <div className="flex items-center justify-between gap-4">
          <h2 id="city-modal-title" className="text-lg font-semibold text-[#F2F7FA]">
            Select Urban Location
          </h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close location modal"
            className="min-h-[40px] min-w-[40px] flex items-center justify-center rounded-lg text-[#B5C7D4] hover:bg-white/5 hover:text-[#F2F7FA]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="mt-1 text-xs text-[#B5C7D4]">
          Active: {currentLocation.name}, {currentLocation.country} ({currentLocation.latitude.toFixed(2)},{' '}
          {currentLocation.longitude.toFixed(2)})
        </p>

        <form onSubmit={handleSearch} className="mt-4 flex gap-2">
          <label htmlFor="city-search-input" className="sr-only">
            Search city name
          </label>
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-[#B5C7D4] absolute left-3 top-1/2 -translate-y-1/2" aria-hidden="true" />
            <input
              ref={inputRef}
              id="city-search-input"
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search city (e.g. Chennai, Bengaluru, Tokyo)"
              aria-invalid={Boolean(error)}
              className="w-full rounded-xl border border-white/10 bg-[#102334] pl-9 pr-3 py-2.5 text-sm text-[#F2F7FA] placeholder-[#9BB0C0] focus:border-[#49E3D0]"
            />
          </div>
          <button
            type="submit"
            disabled={searching}
            className="rounded-xl bg-[#16C7B0] px-4 py-2.5 text-xs font-semibold text-[#07111F] hover:bg-[#49E3D0] transition-colors disabled:opacity-60 whitespace-nowrap"
          >
            {searching ? 'Searching...' : 'Search'}
          </button>
        </form>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-white/10 bg-[#102334]/80 px-3.5 py-2.5">
          <p className="text-xs text-[#B5C7D4]">
            Use device coordinates only with your explicit permission.
          </p>
          <button
            type="button"
            onClick={handleBrowserLocation}
            disabled={geoLoading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-[#49E3D0]/35 bg-[#16C7B0]/10 px-3 py-2 text-xs font-medium text-[#49E3D0] hover:bg-[#16C7B0]/20 whitespace-nowrap shrink-0"
          >
            <LocateFixed className="w-3.5 h-3.5" aria-hidden="true" />
            <span>{geoLoading ? 'Locating...' : 'Use My Location'}</span>
          </button>
        </div>

        {error && (
          <p role="alert" className="mt-3 text-xs text-amber-300">
            {error}
          </p>
        )}

        {results.length > 0 && (
          <div className="mt-4">
            <h3 className="text-xs font-medium text-[#B5C7D4] mb-2">Search Results</h3>
            <ul className="max-h-48 overflow-y-auto divide-y divide-white/5 rounded-xl border border-white/10 bg-[#102334]">
              {results.map((city) => (
                <li key={city.id}>
                  <button
                    type="button"
                    onClick={() => {
                      onSelectLocation(city);
                      onClose();
                    }}
                    className="w-full flex items-center justify-between gap-3 px-3.5 py-2.5 text-left hover:bg-white/5 transition-colors"
                  >
                    <span className="flex items-center gap-2 min-w-0">
                      <MapPin className="w-3.5 h-3.5 text-[#16C7B0] shrink-0" aria-hidden="true" />
                      <span className="text-sm text-[#F2F7FA] truncate">
                        {city.name}
                        {city.region ? `, ${city.region}` : ''}
                      </span>
                    </span>
                    <span className="text-xs text-[#B5C7D4] shrink-0">{city.country}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div className="mt-5">
          <h3 className="text-xs font-medium text-[#B5C7D4] mb-2">Featured Urban Hubs</h3>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {PRESET_CITIES.map((city) => {
              const active = city.name === currentLocation.name && Math.abs(city.latitude - currentLocation.latitude) < 0.05;
              return (
                <button
                  key={city.id}
                  type="button"
                  aria-pressed={active}
                  onClick={() => {
                    onSelectLocation(city);
                    onClose();
                  }}
                  className={`rounded-xl border px-3 py-2 text-left text-xs transition-colors min-h-[44px] ${
                    active
                      ? 'border-[#49E3D0]/50 bg-[#16C7B0]/15 text-[#F2F7FA]'
                      : 'border-white/10 bg-[#102334] text-[#B5C7D4] hover:border-white/20 hover:text-[#F2F7FA]'
                  }`}
                >
                  <div className="font-medium truncate">{city.name}</div>
                  <div className="text-xs text-[#9BB0C0] truncate">{city.country}</div>
                </button>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
