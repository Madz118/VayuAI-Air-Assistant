import React from 'react';
import { CheckCircle2, Cpu, Database, Lock, ShieldCheck } from 'lucide-react';

export const AboutPage: React.FC = () => {
  return (
    <div className="space-y-6 max-w-4xl">
      <div>
        <h1 className="font-display text-2xl sm:text-3xl font-bold text-[#F2F7FA]">
          About & Methodology
        </h1>
        <p className="mt-1 text-sm text-[#9BB0C0]">
          How VAYU AI combines Open-Meteo atmospheric forecasts, deterministic pollutant rules, and verified multi-agent Gemini reasoning.
        </p>
      </div>

      <section className="rounded-2xl border border-white/10 bg-[#102334]/95 p-6 space-y-3">
        <div className="flex items-center gap-2 text-[#49E3D0]">
          <Database className="w-4 h-4" aria-hidden="true" />
          <h2 className="text-base font-semibold text-[#F2F7FA]">
            Environmental Data Sources & Scale Honesty
          </h2>
        </div>
        <p className="text-sm text-[#9BB0C0] leading-relaxed">
          VAYU AI retrieves hourly air quality parameters (PM2.5, PM10, NO₂, O₃, SO₂, CO, US AQI, and European EAQI) from the Open-Meteo Air Quality API powered by Copernicus Atmosphere Monitoring Service (CAMS) atmospheric models, paired with meteorology from the Open-Meteo Weather Forecast API.
        </p>
        <p className="text-sm text-[#9BB0C0] leading-relaxed">
          Because CAMS outputs are modelled grid forecasts rather than direct measurements from a physical monitoring station (such as CPCB or EPA reference analyzers), VAYU AI explicitly labels every reading with its model source, exact timestamp, and active AQI scale. US AQI is never presented as Indian CPCB AQI.
        </p>
      </section>

      <section className="rounded-2xl border border-white/10 bg-[#102334]/95 p-6 space-y-3">
        <div className="flex items-center gap-2 text-[#55B8E8]">
          <Cpu className="w-4 h-4" aria-hidden="true" />
          <h2 className="text-base font-semibold text-[#F2F7FA]">
            Five-Agent Orchestration & Verification
          </h2>
        </div>
        <ul className="space-y-2 text-sm text-[#9BB0C0]">
          <li>
            <strong className="text-[#F2F7FA]">1. Pollution Intelligence Agent:</strong> Computes AQI category, identifies dominant pollutant via WHO 2021 guideline ratios, evaluates 24-hour trends, and checks completeness.
          </li>
          <li>
            <strong className="text-[#F2F7FA]">2. Family Protection Agent:</strong> Adapts environmental exposure precautions for children, older adults, and respiratory sensitivities without offering clinical diagnosis.
          </li>
          <li>
            <strong className="text-[#F2F7FA]">3. Smart Routine Agent:</strong> Ranks 3-hour forecast windows against weather dispersion and recommends indoor alternatives without guaranteeing absolute safety.
          </li>
          <li>
            <strong className="text-[#F2F7FA]">4. Sustainability Agent:</strong> Gates active travel by air quality and calculates commute emission trade-offs using transparent DEFRA-aligned factors.
          </li>
          <li>
            <strong className="text-[#F2F7FA]">5. Verification Agent:</strong> Audits timestamp freshness, scale attribution, cross-agent consistency, and rejects fabricated or unsafe claims.
          </li>
        </ul>
      </section>

      <section className="rounded-2xl border border-white/10 bg-[#102334]/95 p-6 space-y-3">
        <div className="flex items-center gap-2 text-[#16C7B0]">
          <ShieldCheck className="w-4 h-4" aria-hidden="true" />
          <h2 className="text-base font-semibold text-[#F2F7FA]">
            Privacy & Security Principles
          </h2>
        </div>
        <ul className="space-y-1.5 text-sm text-[#9BB0C0]">
          <li className="flex items-start gap-2">
            <CheckCircle2 className="w-4 h-4 text-[#49E3D0] shrink-0 mt-0.5" aria-hidden="true" />
            <span>Gemini API requests run exclusively on the Node.js backend; API keys never reach browser code.</span>
          </li>
          <li className="flex items-start gap-2">
            <Lock className="w-4 h-4 text-[#49E3D0] shrink-0 mt-0.5" aria-hidden="true" />
            <span>Browser geolocation and community observations require explicit user consent.</span>
          </li>
          <li className="flex items-start gap-2">
            <Lock className="w-4 h-4 text-[#49E3D0] shrink-0 mt-0.5" aria-hidden="true" />
            <span>Household profile preferences stay private in local browser storage.</span>
          </li>
        </ul>
      </section>
    </div>
  );
};
