import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Activity,
  ArrowRight,
  CalendarClock,
  CheckCircle2,
  Compass,
  Leaf,
  Menu,
  MessageSquareText,
  ShieldCheck,
  Sparkles,
  Wind,
  X,
} from 'lucide-react';
import { VayuWindScene } from '../components/three/VayuWindScene.tsx';
import { useVayu } from '../context/VayuContext.tsx';
import { interpretAqiCategory } from '../utils/aqi.ts';
import { AqiScaleBadge } from '../components/common/AqiScaleBadge.tsx';

export const LandingPage: React.FC = () => {
  const { dataset, preferences, location } = useVayu();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
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

  const aqiVal =
    dataset && (preferences.preferredScale === 'european_aqi' ? dataset.current.european_aqi : dataset.current.us_aqi);
  const category = interpretAqiCategory(aqiVal ?? null, preferences.preferredScale);

  const agents = [
    {
      num: '01',
      name: 'Pollution Intelligence Agent',
      role: 'Interprets PM2.5, PM10, NO₂, O₃, SO₂, and CO against WHO references, tracks 24h trends, and flags missing or aged readings.',
      icon: Activity,
    },
    {
      num: '02',
      name: 'Family Protection Agent',
      role: 'Adapts environmental exposure guidance for children, older adults, and respiratory sensitivities without offering medical diagnoses.',
      icon: ShieldCheck,
    },
    {
      num: '03',
      name: 'Smart Routine Agent',
      role: 'Compares 3-hour forecast windows and weather dispersion to suggest lower-exposure outdoor timings or indoor alternatives.',
      icon: CalendarClock,
    },
    {
      num: '04',
      name: 'Sustainability Agent',
      role: 'Provides low-emission travel switches with transparent emission assumptions and gates active travel by current air quality.',
      icon: Leaf,
    },
    {
      num: '05',
      name: 'Verification Agent',
      role: 'Validates timestamps, enforces US vs EU AQI scale labelling, blocks safety guarantees, and catches cross-agent contradictions.',
      icon: CheckCircle2,
    },
  ];

  return (
    <div className="min-h-screen bg-[#07111F] text-[#F2F7FA] relative overflow-x-hidden">
      <a href="#main-content" className="skip-link">
        Skip to main content
      </a>

      {/* Signature 3D Flowing Wind Background */}
      <VayuWindScene intensity="prominent" reducedMotion={preferences.reducedMotion} />

      {/* Top Bar Contract: Brand wordmark — 4 nav links — 1 primary CTA */}
      <header className="relative z-20 border-b border-white/10 bg-[#07111F]/80">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4 sm:gap-8">
          <div className="flex items-center gap-2">
            <button
              ref={mobileMenuBtnRef}
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              aria-label="Open navigation menu"
              aria-expanded={mobileMenuOpen}
              aria-controls="landing-mobile-menu"
              className="md:hidden min-h-[44px] min-w-[44px] -ml-2 flex items-center justify-center rounded-xl text-[#B5C7D4] hover:bg-white/5 hover:text-[#F2F7FA]"
            >
              <Menu className="w-5 h-5" />
            </button>

            <Link
              to="/"
              className="font-display text-lg font-bold tracking-tight text-[#F2F7FA] whitespace-nowrap shrink-0 flex items-center gap-2"
            >
              <Wind className="w-5 h-5 text-[#49E3D0]" aria-hidden="true" />
              <span>VAYU AI</span>
            </Link>
          </div>

          <nav aria-label="Landing navigation" className="hidden md:flex items-center gap-7 text-sm font-medium text-[#B5C7D4]">
            <Link to="/dashboard" className="hover:text-[#F2F7FA] transition-colors whitespace-nowrap shrink-0">
              Dashboard
            </Link>
            <Link to="/map" className="hover:text-[#F2F7FA] transition-colors whitespace-nowrap shrink-0">
              Pollution Map
            </Link>
            <Link to="/ask" className="hover:text-[#F2F7FA] transition-colors whitespace-nowrap shrink-0">
              Ask VAYU
            </Link>
            <Link to="/about" className="hover:text-[#F2F7FA] transition-colors whitespace-nowrap shrink-0">
              Methodology
            </Link>
          </nav>

          <div className="shrink-0">
            <Link
              to="/dashboard"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-[#16C7B0] px-4 min-h-[40px] text-xs font-semibold text-[#07111F] hover:bg-[#49E3D0] transition-colors whitespace-nowrap shrink-0"
            >
              <span>Explore Air Quality</span>
            </Link>
          </div>
        </div>
      </header>

      {/* Landing Mobile Drawer */}
      {mobileMenuOpen && (
        <div
          id="landing-mobile-menu"
          role="dialog"
          aria-modal="true"
          aria-label="Landing mobile navigation"
          className="fixed inset-0 z-50 md:hidden flex"
        >
          <div
            className="fixed inset-0 bg-[#07111F]/80"
            onClick={() => {
              setMobileMenuOpen(false);
              requestAnimationFrame(() => mobileMenuBtnRef.current?.focus());
            }}
            aria-hidden="true"
          />
          <aside className="relative z-10 w-72 max-w-[82vw] bg-[#0B1928] border-r border-white/10 flex flex-col">
            <div className="h-16 px-4 flex items-center justify-between border-b border-white/10">
              <span className="flex items-center gap-2 font-display text-base font-bold text-[#F2F7FA]">
                <Wind className="w-4 h-4 text-[#49E3D0]" aria-hidden="true" />
                <span>VAYU AI</span>
              </span>
              <button
                ref={mobileCloseBtnRef}
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  requestAnimationFrame(() => mobileMenuBtnRef.current?.focus());
                }}
                aria-label="Close navigation menu"
                className="min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg text-[#B5C7D4] hover:bg-white/5 hover:text-[#F2F7FA]"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <nav aria-label="Mobile navigation links" className="flex-1 p-3 space-y-1">
              {[
                { to: '/dashboard', label: 'Air Dashboard' },
                { to: '/map', label: 'Pollution Map' },
                { to: '/ask', label: 'Ask VAYU AI' },
                { to: '/planner', label: 'Routine Planner' },
                { to: '/family', label: 'Family Protection' },
                { to: '/community', label: 'Sustainability & Community' },
                { to: '/about', label: 'Methodology' },
              ].map((link) => (
                <Link
                  key={link.to}
                  to={link.to}
                  onClick={() => setMobileMenuOpen(false)}
                  className="flex items-center rounded-xl px-3.5 py-3 min-h-[44px] text-sm font-medium text-[#B5C7D4] hover:bg-white/5 hover:text-[#F2F7FA]"
                >
                  {link.label}
                </Link>
              ))}
            </nav>
          </aside>
        </div>
      )}

      <main id="main-content" tabIndex={-1} className="focus:outline-none">
      {/* Hero Section */}
      <section className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 pt-12 pb-16 sm:pt-16 sm:pb-20 lg:pt-24 lg:pb-28">
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-10 items-center">
          <div className="lg:col-span-7">
            <p className="text-xs font-semibold tracking-[0.18em] text-[#49E3D0] uppercase">
              VAYU AI · Urban Air Quality Intelligence
            </p>
            <h1 className="mt-4 font-display text-4xl sm:text-5xl lg:text-6xl font-bold tracking-tight text-[#F2F7FA] leading-[1.08] [text-wrap:balance]">
              BREATHE SMARTER. LIVE BETTER.
            </h1>
            <p className="mt-6 text-base sm:text-lg text-[#9BB0C0] max-w-xl leading-relaxed">
              Understand the air around you. Make smarter decisions for the people you care about.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-4">
              <Link
                to="/dashboard"
                className="inline-flex items-center gap-2.5 rounded-xl bg-[#16C7B0] px-6 py-3.5 text-sm font-semibold text-[#07111F] hover:bg-[#49E3D0] transition-colors whitespace-nowrap"
              >
                <span>Explore Air Quality</span>
                <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </Link>
              <Link
                to="/ask"
                className="inline-flex items-center gap-2.5 rounded-xl border border-white/15 bg-[#102334]/90 px-6 py-3.5 text-sm font-semibold text-[#F2F7FA] hover:border-[#49E3D0]/50 transition-colors whitespace-nowrap"
              >
                <MessageSquareText className="w-4 h-4 text-[#49E3D0]" aria-hidden="true" />
                <span>Meet Your AI Assistant</span>
              </Link>
            </div>

            <div className="mt-8 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs text-[#9BB0C0]">
              <span>Open-Meteo CAMS Atmospheric Grid</span>
              <span aria-hidden="true">·</span>
              <span>5 Verified Specialist Agents</span>
              <span aria-hidden="true">·</span>
              <span>Transparent Scale & Timestamp Attribution</span>
            </div>
          </div>

          {/* Live Atmospheric Snapshot Panel */}
          <div className="lg:col-span-5">
            <div className="rounded-2xl border border-white/10 bg-[#0B1928]/90 p-6 shadow-2xl">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <span className="text-xs text-[#9BB0C0]">Active Forecast Node</span>
                  <h2 className="text-lg font-semibold text-[#F2F7FA]">
                    {location.name}
                    {location.country ? `, ${location.country}` : ''}
                  </h2>
                </div>
                <Compass className="w-5 h-5 text-[#55B8E8]" aria-hidden="true" />
              </div>

              <div className="mt-5 flex items-end justify-between gap-4 border-y border-white/10 py-5">
                <div>
                  <span className="block text-xs text-[#9BB0C0]">
                    Modelled {preferences.preferredScale === 'european_aqi' ? 'EU EAQI' : 'US AQI'}
                  </span>
                  <span className="font-mono text-4xl font-bold text-[#F2F7FA] tabular-nums">
                    {category.value ?? '—'}
                  </span>
                </div>
                <AqiScaleBadge category={category} />
              </div>

              <div className="mt-4 grid grid-cols-3 gap-3 text-xs">
                <div>
                  <span className="block text-[#9BB0C0]">PM2.5</span>
                  <span className="font-mono text-sm font-semibold text-[#F2F7FA] tabular-nums">
                    {dataset?.current.pm2_5 !== null && dataset?.current.pm2_5 !== undefined
                      ? `${dataset.current.pm2_5.toFixed(1)} µg/m³`
                      : '—'}
                  </span>
                </div>
                <div>
                  <span className="block text-[#9BB0C0]">Wind</span>
                  <span className="font-mono text-sm font-semibold text-[#F2F7FA] tabular-nums">
                    {dataset?.current.wind_speed_10m !== null && dataset?.current.wind_speed_10m !== undefined
                      ? `${dataset.current.wind_speed_10m.toFixed(1)} km/h`
                      : '—'}
                  </span>
                </div>
                <div>
                  <span className="block text-[#9BB0C0]">Dominant</span>
                  <span className="font-mono text-sm font-semibold text-[#49E3D0]">
                    {dataset?.dominantPollutant.symbol ?? '—'}
                  </span>
                </div>
              </div>

              <p className="mt-4 text-xs text-[#B5C7D4] leading-relaxed">
                Modelled atmospheric forecast via Open-Meteo CAMS ({dataset?.currentTimestamp ?? 'Loading...'}), not a physical ground monitoring station.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Section 1: Why Urban Air Quality Matters */}
      <section className="relative z-10 border-t border-white/10 bg-[#0B1928]/85 py-16">
        <div className="max-w-7xl mx-auto px-6">
          <div className="max-w-2xl">
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-[#F2F7FA]">
              01. Why Urban Air Quality Matters Every Day
            </h2>
            <p className="mt-3 text-sm sm:text-base text-[#9BB0C0] leading-relaxed">
              Urban pollutant exposure fluctuates sharply by hour, wind dispersion, and proximity to traffic. Knowing a single daily average hides morning inversion peaks, afternoon ozone spikes, and safer ventilation windows.
            </p>
          </div>

          <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="rounded-2xl border border-white/10 bg-[#102334]/90 p-6">
              <h3 className="text-base font-semibold text-[#F2F7FA]">Invisible Particulate Burden</h3>
              <p className="mt-2 text-sm text-[#9BB0C0] leading-relaxed">
                Fine PM2.5 particles penetrate deep into respiratory pathways, often remaining elevated even when skies appear clear.
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-[#102334]/90 p-6">
              <h3 className="text-base font-semibold text-[#F2F7FA]">Time-of-Day Variability</h3>
              <p className="mt-2 text-sm text-[#9BB0C0] leading-relaxed">
                Jogging at 06:30 versus 17:30 can mean markedly different inhaled doses depending on boundary-layer mixing and traffic exhaust.
              </p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-[#102334]/90 p-6">
              <h3 className="text-base font-semibold text-[#F2F7FA]">Household Vulnerability</h3>
              <p className="mt-2 text-sm text-[#9BB0C0] leading-relaxed">
                Children, older adults, and individuals with respiratory sensitivities experience higher relative impact at Moderate AQI bands.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* Section 2: How VAYU AI Works */}
      <section className="relative z-10 border-t border-white/10 bg-[#07111F]/90 py-16">
        <div className="max-w-7xl mx-auto px-6">
          <h2 className="font-display text-2xl sm:text-3xl font-bold text-[#F2F7FA]">
            02. How VAYU AI Turns Raw Forecasts into Verified Action
          </h2>
          <div className="mt-10 grid grid-cols-1 md:grid-cols-4 gap-6">
            {[
              {
                step: 'Step 1',
                title: 'Live Environmental Retrieval',
                desc: 'Pulls hourly PM2.5, PM10, NO₂, O₃, SO₂, CO, US/EU AQI, and meteorological dispersion from Open-Meteo.',
              },
              {
                step: 'Step 2',
                title: 'Deterministic Analysis',
                desc: 'Validates completeness, checks timestamp freshness, and compares concentrations against WHO 2021 reference thresholds.',
              },
              {
                step: 'Step 3',
                title: 'Multi-Agent Coordination',
                desc: 'Specialists evaluate family context, daily activity windows, and sustainable travel options in parallel.',
              },
              {
                step: 'Step 4',
                title: 'Verification & Grounded AI',
                desc: 'Gemini synthesizes plain-language guidance strictly from verified context, checked by the Verification Agent.',
              },
            ].map((item) => (
              <div key={item.step} className="rounded-2xl border border-white/10 bg-[#102334]/85 p-5">
                <span className="font-mono text-xs text-[#49E3D0]">{item.step}</span>
                <h3 className="mt-2 text-base font-semibold text-[#F2F7FA]">{item.title}</h3>
                <p className="mt-2 text-sm text-[#9BB0C0] leading-relaxed">{item.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Section 3: Intelligent Agent Ecosystem */}
      <section className="relative z-10 border-t border-white/10 bg-[#0B1928]/85 py-16">
        <div className="max-w-7xl mx-auto px-6">
          <div className="max-w-2xl">
            <h2 className="font-display text-2xl sm:text-3xl font-bold text-[#F2F7FA]">
              03. Five Specialized Agents Working in Concert
            </h2>
            <p className="mt-3 text-sm sm:text-base text-[#9BB0C0]">
              Every answer exposes which agents contributed, the exact evidence inspected, and explicit data limitations.
            </p>
          </div>

          <div className="mt-10 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
            {agents.map((ag) => {
              const Icon = ag.icon;
              return (
                <div key={ag.num} className="rounded-2xl border border-white/10 bg-[#102334]/90 p-6">
                  <div className="flex items-center justify-between">
                    <span className="font-mono text-xs text-[#55B8E8]">{ag.num}</span>
                    <Icon className="w-4 h-4 text-[#49E3D0]" aria-hidden="true" />
                  </div>
                  <h3 className="mt-3 text-base font-semibold text-[#F2F7FA]">{ag.name}</h3>
                  <p className="mt-2 text-sm text-[#9BB0C0] leading-relaxed">{ag.role}</p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Section 4 & 5: Personalized Recommendations & Environmental Awareness */}
      <section className="relative z-10 border-t border-white/10 bg-[#07111F]/90 py-16">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-1 lg:grid-cols-2 gap-8">
          <div className="rounded-2xl border border-white/10 bg-[#102334]/90 p-7">
            <h2 className="font-display text-xl sm:text-2xl font-bold text-[#F2F7FA]">
              04. Personalized Routine & Household Planning
            </h2>
            <p className="mt-3 text-sm text-[#9BB0C0] leading-relaxed">
              Plan jogging, cycling, school outdoor play, or natural window ventilation against hourly AQI and wind forecasts—while keeping sensitive household preferences private on your own device.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                to="/planner"
                className="rounded-xl bg-[#16C7B0]/15 border border-[#49E3D0]/35 px-4 py-2 text-xs font-semibold text-[#49E3D0] hover:bg-[#16C7B0]/25"
              >
                Open Routine Planner
              </Link>
              <Link
                to="/family"
                className="rounded-xl border border-white/15 px-4 py-2 text-xs font-semibold text-[#F2F7FA] hover:bg-white/5"
              >
                Configure Family Protection
              </Link>
            </div>
          </div>

          <div className="rounded-2xl border border-white/10 bg-[#102334]/90 p-7">
            <h2 className="font-display text-xl sm:text-2xl font-bold text-[#F2F7FA]">
              05. Radical Transparency & Community Awareness
            </h2>
            <p className="mt-3 text-sm text-[#9BB0C0] leading-relaxed">
              VAYU AI clearly distinguishes regional CAMS atmospheric forecasts from physical ground stations, never fabricates missing readings, and separates unverified community observations from modelled data.
            </p>
            <div className="mt-6 flex flex-wrap gap-3">
              <Link
                to="/community"
                className="rounded-xl bg-[#55B8E8]/15 border border-[#55B8E8]/35 px-4 py-2 text-xs font-semibold text-[#55B8E8] hover:bg-[#55B8E8]/25"
              >
                Sustainability & Community
              </Link>
              <Link
                to="/about"
                className="rounded-xl border border-white/15 px-4 py-2 text-xs font-semibold text-[#F2F7FA] hover:bg-white/5"
              >
                Read Methodology
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Section 6: Final Call to Action */}
      <section className="relative z-10 border-t border-white/10 bg-[#0B1928]/90 py-16">
        <div className="max-w-4xl mx-auto px-6 text-center">
          <Sparkles className="w-6 h-6 text-[#49E3D0] mx-auto mb-3" aria-hidden="true" />
          <h2 className="font-display text-2xl sm:text-3xl font-bold text-[#F2F7FA]">
            Ready to inspect today’s atmospheric intelligence?
          </h2>
          <p className="mt-3 text-sm sm:text-base text-[#9BB0C0]">
            Explore live Open-Meteo air quality metrics for Chennai or any city worldwide, or ask VAYU AI a question about your day.
          </p>
          <div className="mt-7 flex flex-wrap justify-center gap-4">
            <Link
              to="/dashboard"
              className="rounded-xl bg-[#16C7B0] px-6 py-3 text-sm font-semibold text-[#07111F] hover:bg-[#49E3D0] transition-colors"
            >
              Launch Air Dashboard
            </Link>
            <Link
              to="/ask"
              className="rounded-xl border border-white/15 bg-[#102334] px-6 py-3 text-sm font-semibold text-[#F2F7FA] hover:border-[#49E3D0]/40 transition-colors"
            >
              Ask VAYU AI
            </Link>
          </div>
        </div>
      </section>

      </main>

      <footer className="relative z-10 border-t border-white/10 bg-[#07111F] py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[#B5C7D4]">
          <span>VAYU AI · Urban Air Quality Intelligence Assistant</span>
          <div className="flex flex-wrap items-center gap-4">
            <Link to="/dashboard" className="hover:text-[#F2F7FA]">Dashboard</Link>
            <Link to="/map" className="hover:text-[#F2F7FA]">Map</Link>
            <Link to="/ask" className="hover:text-[#F2F7FA]">Ask VAYU</Link>
            <Link to="/planner" className="hover:text-[#F2F7FA]">Planner</Link>
            <Link to="/about" className="hover:text-[#F2F7FA]">Methodology</Link>
          </div>
          <span>Data: Open-Meteo CAMS & Weather · Maps: OpenStreetMap</span>
        </div>
      </footer>
    </div>
  );
};
