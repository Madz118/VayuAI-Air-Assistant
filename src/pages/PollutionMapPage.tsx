import React, { useEffect, useRef, useState } from 'react';
import L from 'leaflet';
import { Info, LocateFixed, MapPin, RefreshCw } from 'lucide-react';
import { PRESET_CITIES } from '../config/constants.ts';
import { useVayu } from '../context/VayuContext.tsx';
import type { CityLocation, EnvironmentalDataset } from '../types/airQuality.ts';
import { interpretAqiCategory } from '../utils/aqi.ts';
import { AqiScaleBadge } from '../components/common/AqiScaleBadge.tsx';

interface GridPoint {
  label: string;
  latitude: number;
  longitude: number;
  us_aqi: number | null;
  european_aqi: number | null;
  pm2_5: number | null;
  timestamp: string;
}

function createPopupElement(params: {
  title: string;
  scaleLabel: string;
  scaleValue: number | null;
  pm25: number | null;
  footer: string;
}): HTMLElement {
  const root = document.createElement('div');
  root.style.fontFamily = 'sans-serif';
  root.style.minWidth = '175px';

  const titleEl = document.createElement('strong');
  titleEl.textContent = params.title;
  root.appendChild(titleEl);
  root.appendChild(document.createElement('br'));

  const scaleSpan = document.createElement('span');
  scaleSpan.textContent = `${params.scaleLabel}: `;
  const scaleBold = document.createElement('b');
  scaleBold.textContent = params.scaleValue !== null ? String(params.scaleValue) : 'N/A';
  scaleSpan.appendChild(scaleBold);
  root.appendChild(scaleSpan);
  root.appendChild(document.createElement('br'));

  const pmSpan = document.createElement('span');
  pmSpan.textContent = `PM2.5: ${params.pm25 !== null ? params.pm25.toFixed(1) : '—'} µg/m³`;
  root.appendChild(pmSpan);
  root.appendChild(document.createElement('br'));

  const smallEl = document.createElement('small');
  smallEl.textContent = params.footer;
  root.appendChild(smallEl);

  return root;
}

export const PollutionMapPage: React.FC = () => {
  const { location, setLocation, dataset, preferences } = useVayu();
  const mapContainerRef = useRef<HTMLDivElement | null>(null);
  const mapInstanceRef = useRef<L.Map | null>(null);
  const layerGroupRef = useRef<L.LayerGroup | null>(null);

  const [gridPoints, setGridPoints] = useState<GridPoint[]>([]);
  const [gridLoading, setGridLoading] = useState(false);
  const [gridError, setGridError] = useState<string | null>(null);

  const [compareCity, setCompareCity] = useState<CityLocation>(() =>
    PRESET_CITIES.find((c) => c.name !== location.name) ?? PRESET_CITIES[3],
  );
  const [compareData, setCompareData] = useState<EnvironmentalDataset | null>(null);
  const [compareLoading, setCompareLoading] = useState(false);
  const [compareError, setCompareError] = useState<string | null>(null);
  const [geoStatus, setGeoStatus] = useState<string | null>(null);

  // Initialize Leaflet map once
  useEffect(() => {
    const el = mapContainerRef.current;
    if (!el || mapInstanceRef.current) return;

    const map = L.map(el, {
      center: [location.latitude, location.longitude],
      zoom: 10,
      zoomControl: true,
    });

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      attribution: '&copy; OpenStreetMap contributors',
      maxZoom: 18,
    }).addTo(map);

    const group = L.layerGroup().addTo(map);
    mapInstanceRef.current = map;
    layerGroupRef.current = group;

    const handleResize = () => map.invalidateSize();
    window.addEventListener('resize', handleResize);
    const timer = window.setTimeout(() => map.invalidateSize(), 150);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('resize', handleResize);
      map.remove();
      mapInstanceRef.current = null;
      layerGroupRef.current = null;
    };
  }, []);

  // Fetch surrounding CAMS forecast grid points when location changes
  useEffect(() => {
    let active = true;
    const loadGrid = async () => {
      setGridLoading(true);
      setGridError(null);
      try {
        const res = await fetch(
          `/api/air-quality/grid?lat=${encodeURIComponent(location.latitude)}&lon=${encodeURIComponent(location.longitude)}`,
        );
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to load local grid');
        if (active) setGridPoints(json.points ?? []);
      } catch (err) {
        if (active) setGridError(err instanceof Error ? err.message : 'Unable to load nearby grid points.');
      } finally {
        if (active) setGridLoading(false);
      }
    };
    loadGrid();
    return () => {
      active = false;
    };
  }, [location.latitude, location.longitude]);

  // Fetch comparison city dataset
  useEffect(() => {
    let active = true;
    const loadCompare = async () => {
      setCompareLoading(true);
      setCompareError(null);
      setCompareData(null);
      try {
        const url = new URL('/api/air-quality', window.location.origin);
        url.searchParams.set('lat', String(compareCity.latitude));
        url.searchParams.set('lon', String(compareCity.longitude));
        url.searchParams.set('name', compareCity.name);
        url.searchParams.set('country', compareCity.country);
        const res = await fetch(url.toString());
        const json = await res.json();
        if (!res.ok) {
          throw new Error(json.error || `Comparison lookup failed (${res.status}).`);
        }
        if (active) setCompareData(json as EnvironmentalDataset);
      } catch (err) {
        if (active) {
          setCompareError(err instanceof Error ? err.message : 'Unable to load comparison city data.');
        }
      } finally {
        if (active) setCompareLoading(false);
      }
    };
    loadCompare();
    return () => {
      active = false;
    };
  }, [compareCity]);

  // Update markers & map center
  useEffect(() => {
    const map = mapInstanceRef.current;
    const group = layerGroupRef.current;
    if (!map || !group) return;

    map.setView([location.latitude, location.longitude], 10, {
      animate: !preferences.reducedMotion,
    });
    group.clearLayers();

    const mainVal = dataset
      ? preferences.preferredScale === 'european_aqi'
        ? dataset.current.european_aqi
        : dataset.current.us_aqi
      : null;
    const mainCat = interpretAqiCategory(mainVal, preferences.preferredScale);

    const centerMarker = L.circleMarker([location.latitude, location.longitude], {
      radius: 12,
      color: '#F2F7FA',
      weight: 2,
      fillColor: mainCat.colorHex,
      fillOpacity: 0.9,
    });
    centerMarker.bindPopup(
      createPopupElement({
        title: location.name,
        scaleLabel: mainCat.label,
        scaleValue: mainCat.value,
        pm25: dataset?.current.pm2_5 ?? null,
        footer: 'Modelled Open-Meteo CAMS node',
      }),
    );
    centerMarker.addTo(group);

    for (const pt of gridPoints) {
      const val = preferences.preferredScale === 'european_aqi' ? pt.european_aqi : pt.us_aqi;
      const cat = interpretAqiCategory(val, preferences.preferredScale);
      const marker = L.circleMarker([pt.latitude, pt.longitude], {
        radius: 8,
        color: '#49E3D0',
        weight: 1.5,
        fillColor: cat.colorHex,
        fillOpacity: 0.72,
      });
      marker.bindPopup(
        createPopupElement({
          title: pt.label,
          scaleLabel: cat.label,
          scaleValue: cat.value,
          pm25: pt.pm2_5,
          footer: `CAMS grid point (${pt.timestamp})`,
        }),
      );
      marker.addTo(group);
    }
  }, [location, dataset, gridPoints, preferences.preferredScale, preferences.reducedMotion]);

  const handleUseMyLocation = () => {
    if (!navigator.geolocation) {
      setGeoStatus('Browser geolocation is unavailable.');
      return;
    }
    setGeoStatus('Requesting location permission...');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setGeoStatus(null);
        setLocation({
          id: `gps-${pos.coords.latitude.toFixed(2)}`,
          name: 'Current Location',
          country: 'Browser GPS',
          latitude: Math.round(pos.coords.latitude * 10000) / 10000,
          longitude: Math.round(pos.coords.longitude * 10000) / 10000,
        });
      },
      (err) => {
        setGeoStatus(err.message || 'Location permission declined.');
      },
    );
  };

  const mainVal = dataset
    ? preferences.preferredScale === 'european_aqi'
      ? dataset.current.european_aqi
      : dataset.current.us_aqi
    : null;
  const mainCat = interpretAqiCategory(mainVal, preferences.preferredScale);

  const compVal = compareData
    ? preferences.preferredScale === 'european_aqi'
      ? compareData.current.european_aqi
      : compareData.current.us_aqi
    : null;
  const compCat = interpretAqiCategory(compVal, preferences.preferredScale);

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#F2F7FA]">
            Interactive Pollution Map
          </h1>
          <p className="mt-1 text-sm text-[#9BB0C0]">
            Explore Open-Meteo CAMS modelled grid values around {location.name} and compare cities side-by-side.
          </p>
        </div>

        <button
          type="button"
          onClick={handleUseMyLocation}
          className="inline-flex items-center gap-2 rounded-xl border border-[#49E3D0]/40 bg-[#16C7B0]/15 px-4 min-h-[42px] text-xs font-semibold text-[#49E3D0] hover:bg-[#16C7B0]/25 self-start md:self-auto"
        >
          <LocateFixed className="w-4 h-4" aria-hidden="true" />
          <span>Center on My Location</span>
        </button>
      </div>

      {geoStatus && (
        <p role="status" className="text-xs text-[#49E3D0]">
          {geoStatus}
        </p>
      )}

      <div className="rounded-xl border border-[#55B8E8]/25 bg-[#0B1928]/95 px-4 py-3 flex items-start gap-3">
        <Info className="w-4 h-4 text-[#55B8E8] shrink-0 mt-0.5" aria-hidden="true" />
        <p className="text-xs text-[#B5C7D4] leading-relaxed">
          Map markers represent <strong className="text-[#F2F7FA]">Open-Meteo CAMS atmospheric model grid points</strong> on OpenStreetMap tiles. VAYU AI does not display synthetic or unverified physical ground-station pins.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Leaflet Map Container */}
        <div
          role="region"
          aria-label={`Interactive air quality map centered on ${location.name}`}
          className="lg:col-span-8 rounded-2xl border border-white/10 bg-[#102334] overflow-hidden"
        >
          <div
            ref={mapContainerRef}
            data-testid="leaflet-pollution-map"
            className="h-[360px] sm:h-[480px] w-full"
          />
          <div className="px-4 py-3 border-t border-white/10 flex flex-wrap items-center justify-between gap-2 text-xs text-[#B5C7D4]">
            <span>
              Center: {location.latitude.toFixed(4)}, {location.longitude.toFixed(4)}
            </span>
            <span>
              {gridLoading ? 'Sampling nearby grid nodes...' : `${gridPoints.length} surrounding CAMS grid nodes loaded`}
            </span>
          </div>
        </div>

        {/* City Selector + Nearby Grid + Comparison */}
        <div className="lg:col-span-4 space-y-5">
          <section className="rounded-2xl border border-white/10 bg-[#102334]/95 p-5">
            <h2 className="text-sm font-semibold text-[#F2F7FA]">Quick City Switch</h2>
            <div className="mt-3 grid grid-cols-2 gap-2" role="group" aria-label="Quick city switch">
              {PRESET_CITIES.map((c) => {
                const active =
                  Math.abs(c.latitude - location.latitude) < 0.05 &&
                  Math.abs(c.longitude - location.longitude) < 0.05;
                return (
                  <button
                    key={c.id}
                    type="button"
                    aria-pressed={active}
                    onClick={() => setLocation(c)}
                    className={`flex items-center gap-1.5 rounded-xl border px-3 py-2 min-h-[42px] text-xs text-left transition-colors ${
                      active
                        ? 'border-[#49E3D0]/60 bg-[#16C7B0]/15 text-[#F2F7FA]'
                        : 'border-white/10 bg-[#0B1928] text-[#B5C7D4] hover:text-[#F2F7FA]'
                    }`}
                  >
                    <MapPin className="w-3.5 h-3.5 text-[#49E3D0] shrink-0" aria-hidden="true" />
                    <span className="truncate">{c.name}</span>
                  </button>
                );
              })}
            </div>
          </section>

          <section className="rounded-2xl border border-white/10 bg-[#102334]/95 p-5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold text-[#F2F7FA]">City Comparison</h2>
              {compareLoading && <RefreshCw className="w-3.5 h-3.5 text-[#49E3D0] animate-spin" aria-hidden="true" />}
            </div>

            <label htmlFor="compare-city-select" className="block text-xs text-[#B5C7D4] mt-3 mb-1.5">
              Compare {location.name} against:
            </label>
            <select
              id="compare-city-select"
              value={compareCity.id}
              onChange={(e) => {
                const found = PRESET_CITIES.find((c) => c.id === e.target.value);
                if (found) setCompareCity(found);
              }}
              className="w-full rounded-xl border border-white/10 bg-[#0B1928] px-3 py-2.5 text-xs text-[#F2F7FA]"
            >
              {PRESET_CITIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}, {c.country}
                </option>
              ))}
            </select>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-white/10 bg-[#0B1928] p-3">
                <div className="text-xs font-medium text-[#B5C7D4] truncate">{location.name}</div>
                <div className="mt-1 font-mono text-2xl font-bold text-[#F2F7FA] tabular-nums">
                  {mainCat.value ?? '—'}
                </div>
                <div className="mt-2">
                  <AqiScaleBadge category={mainCat} size="sm" />
                </div>
                <div className="mt-2 text-xs font-mono text-[#9BB0C0]">
                  PM2.5: {dataset?.current.pm2_5?.toFixed(1) ?? '—'} µg/m³
                </div>
              </div>

              <div className="rounded-xl border border-white/10 bg-[#0B1928] p-3">
                <div className="text-xs font-medium text-[#B5C7D4] truncate">{compareCity.name}</div>
                <div className="mt-1 font-mono text-2xl font-bold text-[#F2F7FA] tabular-nums">
                  {compCat.value ?? '—'}
                </div>
                <div className="mt-2">
                  <AqiScaleBadge category={compCat} size="sm" />
                </div>
                <div className="mt-2 text-xs font-mono text-[#9BB0C0]">
                  PM2.5: {compareData?.current.pm2_5?.toFixed(1) ?? '—'} µg/m³
                </div>
              </div>
            </div>

            {compareError && (
              <p role="alert" className="mt-3 text-xs text-amber-300">
                {compareError}
              </p>
            )}
          </section>

          {gridError && (
            <p role="alert" className="text-xs text-amber-300">
              {gridError}
            </p>
          )}
        </div>
      </div>
    </div>
  );
};
