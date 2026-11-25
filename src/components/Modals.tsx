import React, { useEffect, useMemo, useState } from 'react';
import { Download, Printer, ShieldCheck, Wifi, X } from 'lucide-react';
import { renderFloorplanToDataUrl } from '../lib/floorplanRenderer.ts';
import { computePointSignal } from '../lib/rfEngine.ts';
import type {
  AuthUser,
  CanvasViewMode,
  FloorData,
  ProjectData,
  WallMaterialRecord,
} from '../types/zignals.ts';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  onAuthSuccess: (token: string, user: AuthUser, projects: ProjectData[]) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  onAuthSuccess,
}) => {
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (!isOpen) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const endpoint = tab === 'login' ? '/api/auth/login' : '/api/auth/register';
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(
          tab === 'login' ? { email, password } : { name, email, password }
        ),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || 'Authentication failed.');
        setSubmitting(false);
        return;
      }
      onAuthSuccess(data.token, data.user, data.projects);
      onClose();
    } catch {
      setError('Unable to reach Zignals server.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
      <div className="bg-white border border-[#e2e8f0] rounded-2xl w-full max-w-md shadow-2xl overflow-hidden">
        <div className="px-6 py-4 border-b border-[#f1f5f9] flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-7 h-7 rounded-lg bg-[#2563eb] flex items-center justify-center text-white">
              <Wifi className="w-4 h-4" />
            </div>
            <h2 className="text-[16px] font-bold text-[#0f172a]">
              {tab === 'login' ? 'Sign in to Zignals' : 'Create Zignals Account'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-[#64748b] hover:text-[#0f172a] rounded-lg cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div className="grid grid-cols-2 bg-[#f1f5f9] p-1 rounded-lg">
            <button
              type="button"
              onClick={() => {
                setTab('login');
                setError(null);
              }}
              className={`py-1.5 text-[13px] font-semibold rounded-md transition-colors cursor-pointer ${
                tab === 'login' ? 'bg-white text-[#0f172a] shadow-xs' : 'text-[#64748b]'
              }`}
            >
              Sign in
            </button>
            <button
              type="button"
              onClick={() => {
                setTab('register');
                setError(null);
              }}
              className={`py-1.5 text-[13px] font-semibold rounded-md transition-colors cursor-pointer ${
                tab === 'register' ? 'bg-white text-[#0f172a] shadow-xs' : 'text-[#64748b]'
              }`}
            >
              Create account
            </button>
          </div>

          {error && (
            <div className="bg-[#fef2f2] border border-[#fecaca] text-[#b91c1c] text-[13px] rounded-lg px-3 py-2">
              {error}
            </div>
          )}

          {tab === 'register' && (
            <div>
              <label className="block text-[12px] font-semibold text-[#334155] mb-1">
                Full name
              </label>
              <input
                type="text"
                required
                minLength={2}
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Alex Morgan"
                className="w-full border border-[#cbd5e1] focus:border-[#2563eb] rounded-lg px-3 py-2 text-[14px] focus:outline-none"
              />
            </div>
          )}

          <div>
            <label className="block text-[12px] font-semibold text-[#334155] mb-1">
              Email address
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="engineer@company.com"
              className="w-full border border-[#cbd5e1] focus:border-[#2563eb] rounded-lg px-3 py-2 text-[14px] focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-[12px] font-semibold text-[#334155] mb-1">
              Password
            </label>
            <input
              type="password"
              required
              minLength={8}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Minimum 8 characters"
              className="w-full border border-[#cbd5e1] focus:border-[#2563eb] rounded-lg px-3 py-2 text-[14px] focus:outline-none"
            />
          </div>

          <div className="flex items-center gap-2 text-[12px] text-[#64748b] bg-[#f8fafc] border border-[#e2e8f0] rounded-lg px-3 py-2">
            <ShieldCheck className="w-4 h-4 text-[#059669] shrink-0" />
            <span>
              Your floorplans, multi-floor layouts, and router specs sync securely to PostgreSQL.
            </span>
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-[#2563eb] hover:bg-[#1d4ed8] text-white font-semibold text-[14px] py-2.5 rounded-lg transition-colors cursor-pointer disabled:opacity-60"
          >
            {submitting
              ? 'Authenticating…'
              : tab === 'login'
                ? 'Sign in & sync projects'
                : 'Create account & save floorplan'}
          </button>
        </form>
      </div>
    </div>
  );
};

interface MeasureModalProps {
  pixelDistance: number | null;
  onCancel: () => void;
  onConfirm: (meters: number) => void;
}

export const MeasureModal: React.FC<MeasureModalProps> = ({
  pixelDistance,
  onCancel,
  onConfirm,
}) => {
  const [meters, setMeters] = useState('0.8');

  if (pixelDistance === null) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(meters);
    if (Number.isFinite(val) && val > 0.05) {
      onConfirm(val);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs">
      <div className="bg-white border border-[#e2e8f0] rounded-2xl w-full max-w-sm shadow-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-[15px] font-bold text-[#0f172a]">Calibrate Floorplan Scale</h3>
          <button
            type="button"
            onClick={onCancel}
            className="p-1 text-[#64748b] hover:text-[#0f172a] cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <p className="text-[13px] text-[#64748b]">
          Measured segment length on canvas:{' '}
          <strong className="font-mono-tabular text-[#0f172a]">
            {Math.round(pixelDistance)} px
          </strong>
          . Enter its real-world length in metres.
        </p>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-[12px] font-semibold text-[#334155] mb-1">
              Real-world length (metres)
            </label>
            <input
              type="number"
              autoFocus
              step="0.1"
              min="0.1"
              max="500"
              value={meters}
              onChange={(e) => setMeters(e.target.value)}
              className="w-full border border-[#cbd5e1] rounded-lg px-3 py-2 text-[14px] font-mono-tabular focus:border-[#2563eb] focus:outline-none"
            />
          </div>
          <div className="flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onCancel}
              className="px-3 py-1.5 text-[13px] font-medium text-[#475569] hover:bg-[#f1f5f9] rounded-lg cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-1.5 text-[13px] font-semibold text-white bg-[#2563eb] hover:bg-[#1d4ed8] rounded-lg cursor-pointer"
            >
              Apply Scale
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

interface ClientReportModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: ProjectData;
  activeFloor: FloorData;
  coverageStats: {
    coveragePct: number;
    avgRssiDbm: number;
    excellentPct: number;
    deadZonePct: number;
  };
  materialMap: Map<string, WallMaterialRecord>;
  showHeatmap: boolean;
  heatmapOpacity: number;
  viewMode: CanvasViewMode;
  isolatedRouterId: string | number | null;
}

export const ClientReportModal: React.FC<ClientReportModalProps> = ({
  isOpen,
  onClose,
  project,
  activeFloor,
  coverageStats,
  materialMap,
  showHeatmap,
  heatmapOpacity,
  viewMode,
  isolatedRouterId,
}) => {
  const [heatmapPreviewUrl, setHeatmapPreviewUrl] = useState<string | null>(null);
  const [renderingMap, setRenderingMap] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setHeatmapPreviewUrl(null);
      return;
    }
    let cancelled = false;
    setRenderingMap(true);
    void renderFloorplanToDataUrl(
      {
        floor: activeFloor,
        allFloors: project.floors,
        environment: project.environment,
        mode: project.mode,
        materialMap,
        showHeatmap,
        heatmapOpacity,
        viewMode,
        selectedRouterId: null,
        isolatedRouterId,
      },
      2
    ).then((url) => {
      if (!cancelled) {
        setHeatmapPreviewUrl(url);
        setRenderingMap(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [
    isOpen,
    activeFloor,
    project.floors,
    project.environment,
    project.mode,
    materialMap,
    showHeatmap,
    heatmapOpacity,
    viewMode,
    isolatedRouterId,
  ]);

  const wallSummary = useMemo(() => {
    const scale = Math.max(0.2, activeFloor.scalePxPerMeter);
    const grouped = new Map<
      string,
      { slug: string; name: string; count: number; totalMeters: number; attenDb: number; color: string }
    >();
    for (const w of activeFloor.walls) {
      const mat = materialMap.get(w.materialSlug);
      const lenM = Math.hypot(w.x2 - w.x1, w.y2 - w.y1) / scale;
      const attenDb =
        project.mode === 'zigbee'
          ? (mat?.attenuation24GhzDb ?? 6)
          : (mat?.attenuation5GhzDb ?? 8);
      const existing = grouped.get(w.materialSlug);
      if (existing) {
        existing.count += 1;
        existing.totalMeters += lenM;
      } else {
        grouped.set(w.materialSlug, {
          slug: w.materialSlug,
          name: mat?.name ?? w.materialSlug,
          count: 1,
          totalMeters: lenM,
          attenDb,
          color: mat?.colorHex ?? '#7c3aed',
        });
      }
    }
    return Array.from(grouped.values());
  }, [activeFloor.walls, activeFloor.scalePxPerMeter, materialMap, project.mode]);

  if (!isOpen) return null;

  const handlePrint = () => {
    // Focus window before printing; CSS @media print isolates .print-report-card cleanly
    window.focus();
    window.print();
  };

  const handleDownloadPrintableHtml = () => {
    const esc = (s: string) =>
      s
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    const escapedTitle = esc(project.title);
    const escapedFloor = esc(activeFloor.name);
    const wallRows = wallSummary
      .map(
        (ws) =>
          `<tr><td><span style="display:inline-block;width:10px;height:10px;border-radius:99px;background:${esc(ws.color)};margin-right:6px"></span>${esc(ws.name)}</td><td>${ws.count}</td><td>${ws.totalMeters.toFixed(1)} m</td><td style="text-align:right">-${ws.attenDb} dB</td></tr>`
      )
      .join('');
    const routerRows = activeFloor.routers
      .map(
        (r) =>
          `<tr><td>${esc(r.name)}</td><td>${esc(r.role)}</td><td>${esc(r.band)}</td><td>Ch ${r.channel}</td><td style="text-align:right">${r.txPowerDbm} dBm</td></tr>`
      )
      .join('');
    const clientRows = activeFloor.testClients
      .map((c) => {
        const reading = computePointSignal(
          c.x,
          c.y,
          activeFloor,
          project.floors,
          project.environment,
          project.mode,
          materialMap
        );
        return `<tr><td>${esc(c.label)}</td><td>${esc(reading.servingRouter?.name ?? 'None')}</td><td>${reading.wallsCrossed} (-${reading.wallLossDb.toFixed(1)} dB)</td><td>${Math.round(reading.bestRssiDbm)} dBm</td><td style="text-align:right">${esc(reading.qualityLabel)}</td></tr>`;
      })
      .join('');

    const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8" /><title>Zignals Report - ${escapedTitle}</title>
<style>
  body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #0f172a; margin: 28px; }
  h1 { margin: 0 0 4px; font-size: 20px; }
  .sub { color: #64748b; font-size: 13px; margin-bottom: 18px; }
  .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 12px; margin-bottom: 20px; }
  .kpi { border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px; }
  .kpi-label { font-size: 11px; color: #64748b; text-transform: uppercase; font-weight: 600; }
  .kpi-val { font-size: 22px; font-weight: 700; margin-top: 4px; }
  .map-wrap { border: 1px solid #e2e8f0; border-radius: 12px; padding: 12px; margin-bottom: 20px; text-align: center; background: #f8fafc; }
  .map-wrap img { max-width: 100%; height: auto; border-radius: 8px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 18px; font-size: 12px; }
  th, td { border-bottom: 1px solid #e2e8f0; padding: 8px 10px; text-align: left; }
  th { background: #f8fafc; color: #64748b; font-weight: 600; }
  @media print { body { margin: 12px; } }
</style></head><body>
  <h1>Zignals RF Site Survey Report</h1>
  <div class="sub">${escapedTitle} · ${escapedFloor} · ${esc(project.mode.toUpperCase())} (${esc(project.environment)}) · Scale ${Number(activeFloor.scalePxPerMeter.toFixed(1))} px/m</div>
  <div class="kpis">
    <div class="kpi"><div class="kpi-label">Usable Coverage</div><div class="kpi-val">${coverageStats.coveragePct}%</div></div>
    <div class="kpi"><div class="kpi-label">Strong Zone</div><div class="kpi-val">${coverageStats.excellentPct}%</div></div>
    <div class="kpi"><div class="kpi-label">Mean RSSI</div><div class="kpi-val">${coverageStats.avgRssiDbm} dBm</div></div>
    <div class="kpi"><div class="kpi-label">Dead Zones</div><div class="kpi-val">${coverageStats.deadZonePct}%</div></div>
  </div>
  ${heatmapPreviewUrl ? `<div class="map-wrap"><img src="${heatmapPreviewUrl}" alt="Floorplan Heatmap" /></div>` : ''}
  ${wallSummary.length > 0 ? `<h3>Floorplan Walls &amp; Attenuation (${activeFloor.walls.length} segments)</h3><table><thead><tr><th>Material</th><th>Segments</th><th>Total Length</th><th style="text-align:right">Loss</th></tr></thead><tbody>${wallRows}</tbody></table>` : ''}
  <h3>Deployed Nodes (${activeFloor.routers.length})</h3>
  <table><thead><tr><th>Node</th><th>Role</th><th>Band</th><th>Channel</th><th style="text-align:right">TX Power</th></tr></thead><tbody>${routerRows || '<tr><td colspan="5">No nodes placed.</td></tr>'}</tbody></table>
  ${activeFloor.testClients.length > 0 ? `<h3>Test Client Measurements (${activeFloor.testClients.length})</h3><table><thead><tr><th>Client</th><th>Serving Node</th><th>Walls Crossed</th><th>RX Signal</th><th style="text-align:right">Grade</th></tr></thead><tbody>${clientRows}</tbody></table>` : ''}
</body></html>`;

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    const slug = project.title.toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'floorplan';
    a.href = url;
    a.download = `zignals-report-${slug}.html`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/60 backdrop-blur-xs print-report-overlay">
      <div className="bg-white border border-[#e2e8f0] rounded-2xl w-full max-w-4xl max-h-[90vh] flex flex-col shadow-2xl overflow-hidden print-report-card">
        <div className="px-6 py-4 border-b border-[#e2e8f0] flex items-center justify-between gap-3">
          <div>
            <h2 className="text-[16px] font-bold text-[#0f172a]">
              RF Site Survey &amp; Client Report
            </h2>
            <p className="text-[12px] text-[#64748b]">
              {project.title} · {activeFloor.name} · {project.mode.toUpperCase()} ({project.environment}) · Scale {Number(activeFloor.scalePxPerMeter.toFixed(1))} px/m
            </p>
          </div>
          <div className="flex items-center gap-2 no-print">
            <button
              type="button"
              onClick={handleDownloadPrintableHtml}
              className="flex items-center gap-1.5 border border-[#cbd5e1] bg-white hover:bg-[#f8fafc] text-[#0f172a] text-[12px] font-semibold px-3 py-1.5 rounded-lg cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Save Report</span>
            </button>
            <button
              type="button"
              onClick={handlePrint}
              className="flex items-center gap-1.5 bg-[#0f172a] hover:bg-[#1e293b] text-white text-[12px] font-semibold px-3 py-1.5 rounded-lg cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Print / PDF</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-[#64748b] hover:text-[#0f172a] rounded-lg cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="p-6 overflow-y-auto space-y-6 print-report-body">
          {/* Summary KPI Grid */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 print-avoid-break">
            <div className="border border-[#e2e8f0] rounded-xl p-3">
              <div className="text-[11px] font-semibold text-[#64748b] uppercase">
                Usable Coverage
              </div>
              <div className="mt-1 text-[22px] font-bold text-[#0f172a] font-mono-tabular">
                {coverageStats.coveragePct}%
              </div>
              <div className="text-[11px] text-[#64748b]">≥ -85 dBm threshold</div>
            </div>
            <div className="border border-[#e2e8f0] rounded-xl p-3">
              <div className="text-[11px] font-semibold text-[#64748b] uppercase">
                Strong Zone
              </div>
              <div className="mt-1 text-[22px] font-bold text-[#059669] font-mono-tabular">
                {coverageStats.excellentPct}%
              </div>
              <div className="text-[11px] text-[#64748b]">≥ -65 dBm</div>
            </div>
            <div className="border border-[#e2e8f0] rounded-xl p-3">
              <div className="text-[11px] font-semibold text-[#64748b] uppercase">
                Mean RSSI
              </div>
              <div className="mt-1 text-[22px] font-bold text-[#0284c7] font-mono-tabular">
                {coverageStats.avgRssiDbm} dBm
              </div>
              <div className="text-[11px] text-[#64748b]">Interior average</div>
            </div>
            <div className="border border-[#e2e8f0] rounded-xl p-3">
              <div className="text-[11px] font-semibold text-[#64748b] uppercase">
                Dead Zones
              </div>
              <div className="mt-1 text-[22px] font-bold text-[#dc2626] font-mono-tabular">
                {coverageStats.deadZonePct}%
              </div>
              <div className="text-[11px] text-[#64748b]">&lt; -92 dBm</div>
            </div>
          </div>

          {/* Floorplan Heatmap Snapshot */}
          <div className="print-avoid-break">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-[13px] font-bold text-[#0f172a]">
                Floorplan RF Signal Heatmap ({viewMode === 'serving' ? 'Serving Router Zones' : 'Signal RSSI'})
              </h3>
              <div className="flex items-center gap-2 text-[11px] text-[#64748b] font-mono-tabular">
                <span>-95 dBm</span>
                <span
                  className="inline-block w-24 h-2 rounded-full"
                  style={{
                    background:
                      'linear-gradient(90deg, #f43f5e 0%, #fb923c 30%, #facc15 50%, #34d399 72%, #06b6d4 88%, #2563eb 100%)',
                  }}
                />
                <span>-55 dBm</span>
              </div>
            </div>
            <div className="border border-[#e2e8f0] rounded-xl bg-[#f8fafc] p-3 flex items-center justify-center">
              {renderingMap ? (
                <div className="py-12 text-[12px] text-[#64748b]">
                  Rendering high-resolution floorplan heatmap…
                </div>
              ) : heatmapPreviewUrl ? (
                <img
                  src={heatmapPreviewUrl}
                  alt={`${project.title} ${activeFloor.name} RF Heatmap`}
                  className="max-h-[420px] w-auto rounded-lg border border-[#cbd5e1] shadow-xs"
                />
              ) : (
                <div className="py-10 text-[12px] text-[#64748b]">
                  Unable to render floorplan preview.
                </div>
              )}
            </div>
          </div>

          {/* Wall Attenuation Summary */}
          {wallSummary.length > 0 && (
            <div className="print-avoid-break">
              <h3 className="text-[13px] font-bold text-[#0f172a] mb-2">
                Floorplan Walls &amp; Attenuation ({activeFloor.walls.length} segments)
              </h3>
              <div className="border border-[#e2e8f0] rounded-xl overflow-hidden">
                <table className="w-full text-left text-[12px]">
                  <thead className="bg-[#f8fafc] border-b border-[#e2e8f0] text-[#64748b]">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Material</th>
                      <th className="px-3 py-2 font-semibold">Segments</th>
                      <th className="px-3 py-2 font-semibold">Total Length</th>
                      <th className="px-3 py-2 font-semibold text-right">
                        Loss ({project.mode === 'zigbee' ? '2.4 GHz' : '5 GHz'})
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f1f5f9]">
                    {wallSummary.map((ws) => (
                      <tr key={ws.slug}>
                        <td className="px-3 py-2 font-medium text-[#0f172a] flex items-center gap-2">
                          <span
                            className="w-2.5 h-2.5 rounded-full inline-block"
                            style={{ backgroundColor: ws.color }}
                          />
                          {ws.name}
                        </td>
                        <td className="px-3 py-2 font-mono-tabular text-[#475569]">{ws.count}</td>
                        <td className="px-3 py-2 font-mono-tabular text-[#475569]">
                          {ws.totalMeters.toFixed(1)} m
                        </td>
                        <td className="px-3 py-2 text-right font-mono-tabular font-semibold text-[#0f172a]">
                          -{ws.attenDb} dB
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Router Inventory Table */}
          <div className="print-avoid-break">
            <h3 className="text-[13px] font-bold text-[#0f172a] mb-2">
              Deployed Nodes ({activeFloor.routers.length})
            </h3>
            <div className="border border-[#e2e8f0] rounded-xl overflow-hidden">
              <table className="w-full text-left text-[12px]">
                <thead className="bg-[#f8fafc] border-b border-[#e2e8f0] text-[#64748b]">
                  <tr>
                    <th className="px-3 py-2 font-semibold">Node</th>
                    <th className="px-3 py-2 font-semibold">Role</th>
                    <th className="px-3 py-2 font-semibold">Band</th>
                    <th className="px-3 py-2 font-semibold">Channel</th>
                    <th className="px-3 py-2 font-semibold text-right">TX Power</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f1f5f9]">
                  {activeFloor.routers.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-3 py-3 text-[#64748b]">
                        No routers or coordinators placed on this floor yet.
                      </td>
                    </tr>
                  ) : (
                    activeFloor.routers.map((r) => (
                      <tr key={r.id}>
                        <td className="px-3 py-2 font-semibold text-[#0f172a]">{r.name}</td>
                        <td className="px-3 py-2 capitalize text-[#475569]">{r.role}</td>
                        <td className="px-3 py-2 text-[#475569]">{r.band}</td>
                        <td className="px-3 py-2 font-mono-tabular text-[#475569]">Ch {r.channel}</td>
                        <td className="px-3 py-2 text-right font-mono-tabular font-semibold text-[#0f172a]">
                          {r.txPowerDbm} dBm
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>

          {/* Test Client Probe Table */}
          <div className="print-avoid-break">
            <h3 className="text-[13px] font-bold text-[#0f172a] mb-2">
              Test Client Measurements ({activeFloor.testClients.length})
            </h3>
            {activeFloor.testClients.length === 0 ? (
              <div className="border border-dashed border-[#cbd5e1] rounded-xl p-4 text-[12px] text-[#64748b]">
                No test client probes placed yet. Activate &ldquo;Test client&rdquo; in the top toolbar and click anywhere on the floorplan to measure point-level RSSI, SNR, and wall losses.
              </div>
            ) : (
              <div className="border border-[#e2e8f0] rounded-xl overflow-hidden">
                <table className="w-full text-left text-[12px]">
                  <thead className="bg-[#f8fafc] border-b border-[#e2e8f0] text-[#64748b]">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Client</th>
                      <th className="px-3 py-2 font-semibold">Serving Node</th>
                      <th className="px-3 py-2 font-semibold">Walls Crossed</th>
                      <th className="px-3 py-2 font-semibold">RX Signal</th>
                      <th className="px-3 py-2 font-semibold text-right">Grade</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[#f1f5f9]">
                    {activeFloor.testClients.map((c) => {
                      const reading = computePointSignal(
                        c.x,
                        c.y,
                        activeFloor,
                        project.floors,
                        project.environment,
                        project.mode,
                        materialMap
                      );
                      return (
                        <tr key={c.id}>
                          <td className="px-3 py-2 font-semibold text-[#0f172a]">{c.label}</td>
                          <td className="px-3 py-2 text-[#475569]">
                            {reading.servingRouter?.name ?? 'None'}
                          </td>
                          <td className="px-3 py-2 font-mono-tabular text-[#475569]">
                            {reading.wallsCrossed} (-{reading.wallLossDb.toFixed(1)} dB)
                          </td>
                          <td className="px-3 py-2 font-mono-tabular font-semibold text-[#0f172a]">
                            {Math.round(reading.bestRssiDbm)} dBm
                          </td>
                          <td className="px-3 py-2 text-right font-semibold text-[#0284c7]">
                            {reading.qualityLabel}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
