import React, { useState } from 'react';
import {
  Conductor,
  TowerParameters,
  WorkingCondition,
  ConditionCalcResult,
} from '../types';
import {
  calculateAllConditions,
  solveStateEquation,
  getConditionSpecificLoad,
} from '../utils/conductorPhysics';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ReferenceLine,
} from 'recharts';
import { TrendingUp, Layers, Thermometer } from 'lucide-react';

interface ChartsViewProps {
  conductor: Conductor;
  tower: TowerParameters;
  conditions: WorkingCondition[];
  govResult: ConditionCalcResult;
}

export const ChartsView: React.FC<ChartsViewProps> = ({
  conductor,
  tower,
  conditions,
  govResult,
}) => {
  const [chartMode, setChartMode] = useState<'temp' | 'span'>('temp');

  // 1. Generate Stress-Sag vs Temperature Data (-40°C to +80°C)
  const tempData = [];
  for (let t = -40; t <= 80; t += 5) {
    const { gamma } = getConditionSpecificLoad(
      conductor,
      { id: 't-scan', name: '温度扫描', temp: t, windSpeed: 0, iceThickness: 0, isControlCandidate: false },
      tower.spanLength,
      tower.elevation
    );

    const stress = solveStateEquation(
      govResult.stress,
      govResult.specificLoad,
      govResult.temp,
      gamma,
      t,
      tower.spanLength,
      conductor.elasticModulus,
      conductor.thermalExpansion
    );

    const tension = stress * conductor.totalArea; // N
    const sag = (gamma * Math.pow(tower.spanLength, 2)) / (8 * stress); // m

    tempData.push({
      temp: t,
      stress: Number(stress.toFixed(2)),
      tensionKN: Number((tension / 1000).toFixed(2)),
      sag: Number(sag.toFixed(2)),
    });
  }

  // 2. Generate Stress-Sag vs Span Length Data (L = 100m to 1000m)
  const spanData = [];
  for (let L = 100; L <= 1000; L += 50) {
    const tempTower = { ...tower, spanLength: L };
    const { results } = calculateAllConditions(conductor, conditions, tempTower);
    const gov = results.find((r) => r.isGoverningCondition) || results[0];
    const maxSagRes = results.find((r) => r.conditionId === 'max-temp') || results[0];

    spanData.push({
      span: L,
      govStress: Number(gov.stress.toFixed(2)),
      govSag: Number(gov.sag.toFixed(2)),
      maxTempSag: Number(maxSagRes.sag.toFixed(2)),
    });
  }

  return (
    <div className="glass-panel rounded-2xl p-4 shadow-2xl text-slate-100 font-sans space-y-4 max-w-7xl mx-auto">
      {/* View Switcher Header */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white/10 p-3 rounded-xl border border-white/10 text-xs">
        <div className="flex items-center space-x-2">
          <div className="p-1.5 rounded-lg bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
            <TrendingUp className="w-4 h-4" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-slate-100 uppercase tracking-wide">应力与弧垂力学特性曲线分析</h3>
            <p className="text-[10px] text-slate-400 font-mono">基于悬垂线状态方程 (Equation of State) 全程拟合解析</p>
          </div>
        </div>

        <div className="flex items-center space-x-1.5 bg-slate-950/80 p-1 rounded-xl border border-slate-800">
          <button
            id="btn-chart-mode-temp"
            onClick={() => setChartMode('temp')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              chartMode === 'temp'
                ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-md shadow-cyan-500/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Thermometer className="w-3.5 h-3.5" />
            <span>f-t, σ-t (温度扫描)</span>
          </button>

          <button
            id="btn-chart-mode-span"
            onClick={() => setChartMode('span')}
            className={`flex items-center space-x-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
              chartMode === 'span'
                ? 'bg-gradient-to-r from-cyan-600 to-blue-600 text-white shadow-md shadow-cyan-500/20'
                : 'text-slate-400 hover:text-slate-200 hover:bg-slate-800/60'
            }`}
          >
            <Layers className="w-3.5 h-3.5" />
            <span>f-L, σ-L (档距变化)</span>
          </button>
        </div>
      </div>

      {/* Recharts Render Container */}
      <div className="bg-slate-950/80 p-4 rounded-2xl border border-slate-800/80 h-[400px]">
        {chartMode === 'temp' ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={tempData} margin={{ top: 20, right: 30, left: 10, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.6} />
              <XAxis
                dataKey="temp"
                stroke="#94a3b8"
                fontSize={11}
                unit="°C"
                label={{ value: '环境气温 (°C)', position: 'insideBottom', offset: -10, fill: '#94a3b8', fontSize: 11 }}
              />
              <YAxis
                yAxisId="left"
                stroke="#38bdf8"
                fontSize={11}
                label={{ value: '导线应力 σ (N/mm²)', angle: -90, position: 'insideLeft', fill: '#38bdf8', fontSize: 11 }}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                stroke="#f59e0b"
                fontSize={11}
                label={{ value: '导线弧垂 f (m)', angle: 90, position: 'insideRight', fill: '#f59e0b', fontSize: 11 }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#0f172a',
                  borderColor: '#334155',
                  borderRadius: '12px',
                  color: '#f8fafc',
                  fontSize: '12px',
                  boxShadow: '0 10px 25px -5px rgba(0,0,0,0.5)',
                }}
              />
              <Legend verticalAlign="top" height={36} wrapperStyle={{ color: '#cbd5e1', fontSize: '12px' }} />
              <ReferenceLine yAxisId="left" x={govResult.temp} stroke="#ef4444" strokeDasharray="3 3" label={{ value: `控制工况气温 (${govResult.temp}°C)`, fill: '#ef4444', fontSize: 10 }} />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="stress"
                name="导线应力 σ (N/mm²)"
                stroke="#38bdf8"
                strokeWidth={2.5}
                dot={{ r: 3, fill: '#38bdf8' }}
                activeDot={{ r: 6 }}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="sag"
                name="最大弧垂 f (m)"
                stroke="#f59e0b"
                strokeWidth={2.5}
                dot={{ r: 3, fill: '#f59e0b' }}
                activeDot={{ r: 6 }}
              />
            </LineChart>
          </ResponsiveContainer>
        ) : (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={spanData} margin={{ top: 20, right: 30, left: 10, bottom: 20 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#334155" opacity={0.6} />
              <XAxis
                dataKey="span"
                stroke="#94a3b8"
                fontSize={11}
                unit="m"
                label={{ value: '代表档距 L (m)', position: 'insideBottom', offset: -10, fill: '#94a3b8', fontSize: 11 }}
              />
              <YAxis
                yAxisId="left"
                stroke="#38bdf8"
                fontSize={11}
                label={{ value: '控制应力 σ (N/mm²)', angle: -90, position: 'insideLeft', fill: '#38bdf8', fontSize: 11 }}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                stroke="#f59e0b"
                fontSize={11}
                label={{ value: '最大弧垂 f (m)', angle: 90, position: 'insideRight', fill: '#f59e0b', fontSize: 11 }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#0f172a',
                  borderColor: '#334155',
                  borderRadius: '12px',
                  color: '#f8fafc',
                  fontSize: '12px',
                  boxShadow: '0 10px 25px -5px rgba(0,0,0,0.5)',
                }}
              />
              <Legend verticalAlign="top" height={36} wrapperStyle={{ color: '#cbd5e1', fontSize: '12px' }} />
              <ReferenceLine yAxisId="left" x={tower.spanLength} stroke="#10b981" strokeDasharray="3 3" label={{ value: `当前代表档距 (${tower.spanLength}m)`, fill: '#10b981', fontSize: 10 }} />
              <Line
                yAxisId="left"
                type="monotone"
                dataKey="govStress"
                name="控制应力 (N/mm²)"
                stroke="#38bdf8"
                strokeWidth={2.5}
                dot={{ r: 3, fill: '#38bdf8' }}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="maxTempSag"
                name="最高温弧垂 (m)"
                stroke="#f59e0b"
                strokeWidth={2.5}
                dot={{ r: 3, fill: '#f59e0b' }}
              />
            </LineChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Physics Explanation Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800 space-y-1">
          <span className="text-[10px] text-slate-400 font-mono uppercase">控制工况与安全系数</span>
          <p className="text-xs font-bold text-cyan-300">{govResult.conditionName}</p>
          <p className="text-[11px] text-slate-300 font-mono">
            应力 σ = <strong className="text-white">{govResult.stress.toFixed(2)} N/mm²</strong> (K={govResult.safetyFactor.toFixed(2)})
          </p>
        </div>

        <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800 space-y-1">
          <span className="text-[10px] text-slate-400 font-mono uppercase">状态方程特征角</span>
          <p className="text-xs font-bold text-sky-300">导线弹性模量与线膨胀系数</p>
          <p className="text-[11px] text-slate-300 font-mono">
            E = {conductor.elasticModulus} N/mm², α = {(conductor.thermalExpansion * 1e6).toFixed(1)}×10⁻⁶/°C
          </p>
        </div>

        <div className="bg-slate-950/80 p-3 rounded-xl border border-slate-800 space-y-1">
          <span className="text-[10px] text-slate-400 font-mono uppercase">临界档距判定 (Critical Span)</span>
          <p className="text-xs font-bold text-emerald-300">DL/T 5582 规程判据</p>
          <p className="text-[11px] text-slate-300 font-mono">
            档距 L={tower.spanLength}m 处于典型气象安全控域内
          </p>
        </div>
      </div>
    </div>
  );
};
