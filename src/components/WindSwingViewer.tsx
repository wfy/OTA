import React, { useState, useMemo } from 'react';
import {
  InsulatorCalcResult,
  TowerParameters,
  Conductor,
  Insulator,
  WorkingCondition,
  InsulatorStringType,
} from '../types';
import { calculateInsulatorWindSwing } from '../utils/insulatorPhysics';
import { ThreeWindSwingCanvas } from './ThreeWindSwingCanvas';
import { ShieldCheck, ShieldAlert, Wind, Activity, Layers, Box, Compass } from 'lucide-react';

interface WindSwingViewerProps {
  tower: TowerParameters;
  conductor: Conductor;
  insulator: Insulator;
  windCondition: WorkingCondition;
  insulatorCount: number;
}

export const WindSwingViewer: React.FC<WindSwingViewerProps> = ({
  tower,
  conductor,
  insulator,
  windCondition,
  insulatorCount,
}) => {
  const [activeStringType, setActiveStringType] = useState<InsulatorStringType>(
    insulator.stringType || 'single_I'
  );
  const [counterWeightKg, setCounterWeightKg] = useState<number>(insulator.counterWeightKg || 0);
  const [windSpeed, setWindSpeed] = useState<number>(windCondition.windSpeed || 25);
  const [vAngleDeg, setVAngleDeg] = useState<number>(insulator.vAngle || 90);

  React.useEffect(() => {
    if (insulator.counterWeightKg !== undefined) {
      setCounterWeightKg(insulator.counterWeightKg);
    }
  }, [insulator.counterWeightKg]);

  React.useEffect(() => {
    if (insulator.stringType) {
      setActiveStringType(insulator.stringType);
    }
  }, [insulator.stringType]);
  const [renderDimension, setRenderDimension] = useState<'3d' | '2d'>('3d');
  const [cameraPreset, setCameraPreset] = useState<'front' | 'iso' | 'side' | 'top'>('front');
  const [activeViewMode, setActiveViewMode] = useState<'section' | 'profile_impact' | 'comparison'>(
    'section'
  );

  const activeWindCond = useMemo(
    () => ({
      ...windCondition,
      windSpeed: windSpeed,
    }),
    [windCondition, windSpeed]
  );

  const mainResult: InsulatorCalcResult = useMemo(
    () =>
      calculateInsulatorWindSwing(
        insulator,
        conductor,
        tower,
        activeWindCond,
        insulatorCount,
        activeStringType,
        counterWeightKg,
        vAngleDeg
      ),
    [insulator, conductor, tower, activeWindCond, insulatorCount, activeStringType, counterWeightKg, vAngleDeg]
  );

  const comparisonResults = useMemo(() => {
    const stringTypesList: { type: InsulatorStringType; label: string; desc: string }[] = [
      { type: 'single_I', label: '单I型悬垂串', desc: '标准自由摆动悬挂，受风偏影响最大' },
      { type: 'double_I', label: '双I型悬垂串', desc: '双串自重增加，抗风偏能力提升约15%' },
      { type: 'V_string', label: 'V型悬垂绝缘子串', desc: '双臂V字刚性约束，在额定风速下强效抑制摆动' },
      { type: 'tension', label: '耐张绝缘子串', desc: '沿导线方向张紧，塔头无横向风偏角' },
      { type: 'post', label: '柱式/防风偏绝缘子', desc: '刚性固定挂点，零风偏角' },
    ];

    return stringTypesList.map((st) => {
      const res = calculateInsulatorWindSwing(
        insulator,
        conductor,
        tower,
        activeWindCond,
        insulatorCount,
        st.type,
        counterWeightKg,
        vAngleDeg
      );
      return {
        ...st,
        result: res,
      };
    });
  }, [insulator, conductor, tower, activeWindCond, insulatorCount, counterWeightKg, vAngleDeg]);

  const swingAngleDeg = mainResult.insulatorWindSwingAngle;
  const swingAngleRad = (swingAngleDeg * Math.PI) / 180;
  const stringLengthM = mainResult.stringLength;

  const width = 640;
  const height = 420;
  const centerX = width / 2;
  const topY = 65;
  const scale = 22;

  const windowHalfWidthM = tower.voltageLevel >= 500 ? 6.5 : tower.voltageLevel >= 220 ? 4.5 : 3.0;
  const windowHalfWidthPx = windowHalfWidthM * scale;
  const windowHeightPx = 8.5 * scale;

  const attachX = centerX;
  const attachY = topY;

  const conductorX = attachX + mainResult.horizontalDisplacement * scale;
  const conductorY = attachY + (stringLengthM - mainResult.verticalDropDisplacement) * scale;

  const clearanceRadiusPx = mainResult.minAirClearanceRequired * scale;

  return (
    <div className="glass-panel rounded-2xl p-4 shadow-2xl text-slate-100 font-sans space-y-4 max-w-7xl mx-auto">
      {/* Header Banner */}
      <div className="flex flex-wrap items-center justify-between gap-3 bg-white/10 p-3 rounded-xl border border-white/10 text-xs">
        <div className="flex items-center space-x-3">
          <div className="p-1.5 rounded-lg bg-cyan-500/20 text-cyan-400 border border-cyan-500/30">
            <Wind className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-sm text-slate-100 flex items-center space-x-1.5 uppercase tracking-wide">
              <span>绝缘子串风偏三维仿真与电气间隙分析</span>
            </h3>
            <p className="text-[10px] text-slate-400 font-mono">
              根据 DL/T 5582 第9.4条 模拟不同串型风偏角、挂线点位移及导线弧垂降深
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          {mainResult.clearancePassed ? (
            <span className="flex items-center space-x-1 px-3 py-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 text-xs font-bold rounded-lg uppercase">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span>电气间隙合格</span>
            </span>
          ) : (
            <span className="flex items-center space-x-1 px-3 py-1 bg-red-500/20 text-red-300 border border-red-500/40 text-xs font-bold rounded-lg uppercase">
              <ShieldAlert className="w-4 h-4 text-red-400" />
              <span>电气间隙超限</span>
            </span>
          )}
        </div>
      </div>

      {/* Control Panel: Insulator Type Tabs & Interactive Sliders */}
      <div className="glass-card p-3 rounded-xl space-y-3 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-2">
          <span className="font-semibold text-slate-300 flex items-center gap-1.5 uppercase">
            <Layers className="w-4 h-4 text-cyan-400" />
            <span>绝缘子串型选型 (String Type)</span>
          </span>

          <div className="flex flex-wrap gap-1">
            {[
              { id: 'single_I', label: '单I型串' },
              { id: 'double_I', label: '双I型串' },
              { id: 'V_string', label: 'V型串' },
              { id: 'tension', label: '耐张串' },
              { id: 'post', label: '柱式/硬跳线' },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveStringType(tab.id as InsulatorStringType)}
                className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-all ${
                  activeStringType === tab.id
                    ? 'bg-cyan-600 text-white shadow-md shadow-cyan-500/20'
                    : 'glass-button text-slate-300 hover:text-slate-100'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>
        </div>

        {/* Dynamic Sliders */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-1">
          {/* Wind Speed Slider */}
          <div className="glass-inner p-2.5 rounded-xl">
            <div className="flex justify-between text-xs font-semibold mb-1">
              <span className="text-slate-300">横向风速 v_wind:</span>
              <span className="text-cyan-300 font-mono font-bold">{windSpeed} m/s</span>
            </div>
            <input
              type="range"
              min="0"
              max="45"
              step="1"
              value={windSpeed}
              onChange={(e) => setWindSpeed(Number(e.target.value))}
              className="w-full accent-cyan-500 h-1.5 bg-white/10 rounded-lg cursor-pointer"
            />
          </div>

          {/* Counter Weight Slider */}
          <div className="glass-inner p-2.5 rounded-xl">
            <div className="flex justify-between text-xs font-semibold mb-1">
              <span className="text-slate-300">加挂防风重锤:</span>
              <span className="text-sky-300 font-mono font-bold">{counterWeightKg} kg</span>
            </div>
            <input
              type="range"
              min="0"
              max="300"
              step="10"
              value={counterWeightKg}
              onChange={(e) => setCounterWeightKg(Number(e.target.value))}
              className="w-full accent-sky-500 h-1.5 bg-white/10 rounded-lg cursor-pointer"
            />
          </div>

          {/* V Angle Slider */}
          {activeStringType === 'V_string' ? (
            <div className="glass-inner p-2.5 rounded-xl">
              <div className="flex justify-between text-xs font-semibold mb-1">
                <span className="text-slate-300">V串夹角 θ_v:</span>
                <span className="text-cyan-300 font-mono font-bold">{vAngleDeg}°</span>
              </div>
              <input
                type="range"
                min="60"
                max="120"
                step="5"
                value={vAngleDeg}
                onChange={(e) => setVAngleDeg(Number(e.target.value))}
                className="w-full accent-cyan-500 h-1.5 bg-white/10 rounded-lg cursor-pointer"
              />
            </div>
          ) : (
            <div className="glass-inner p-2.5 rounded-xl flex items-center justify-between text-xs text-slate-300">
              <span>防风约束状态:</span>
              <span className="font-mono text-cyan-300 font-semibold">
                {activeStringType === 'tension' ? '耐张刚性张紧' : '自由摇摆悬挂'}
              </span>
            </div>
          )}
        </div>
      </div>

      {/* Main Interactive Stage */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Visual Canvas (2D / 3D) */}
        <div className="lg:col-span-2 glass-inner rounded-2xl overflow-hidden relative min-h-[420px] flex flex-col">
          {/* Viewport Control Toolbar */}
          <div className="bg-white/10 p-2.5 border-b border-white/10 flex flex-wrap items-center justify-between gap-2 z-10">
            <div className="flex items-center space-x-1.5">
              <button
                onClick={() => setRenderDimension('3d')}
                className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all flex items-center gap-1 ${
                  renderDimension === '3d'
                    ? 'bg-cyan-600 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Box className="w-3.5 h-3.5" />
                <span>3D CAD 三维试图</span>
              </button>
              <button
                onClick={() => setRenderDimension('2d')}
                className={`px-3 py-1 text-xs font-semibold rounded-lg transition-all flex items-center gap-1 ${
                  renderDimension === '2d'
                    ? 'bg-cyan-600 text-white'
                    : 'text-slate-400 hover:text-slate-200'
                }`}
              >
                <Compass className="w-3.5 h-3.5" />
                <span>2D 横截面剖视图</span>
              </button>
            </div>

            {renderDimension === '3d' && (
              <div className="flex items-center space-x-1">
                {(['front', 'iso', 'side', 'top'] as const).map((p) => (
                  <button
                    key={p}
                    onClick={() => setCameraPreset(p)}
                    className={`px-2 py-0.5 text-[10px] font-mono font-bold rounded uppercase transition-all ${
                      cameraPreset === p ? 'bg-cyan-500/30 text-cyan-300 border border-cyan-500/50' : 'text-slate-400 hover:text-slate-200'
                    }`}
                  >
                    {p === 'front' ? '正视' : p === 'iso' ? '等轴' : p === 'side' ? '侧视' : '俯视'}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Render Area */}
          <div className="flex-1 relative w-full h-full min-h-[360px] flex items-center justify-center p-2">
            {renderDimension === '3d' ? (
              <ThreeWindSwingCanvas
                tower={tower}
                conductor={conductor}
                insulator={insulator}
                calcResult={mainResult}
                stringType={activeStringType}
                swingAngleDeg={mainResult.insulatorWindSwingAngle}
                conductorWindAngleDeg={mainResult.conductorWindAngle}
                stringLengthM={mainResult.stringLength}
                horizDisplacement={mainResult.horizontalDisplacement}
                vertDropDisplacement={mainResult.verticalDropDisplacement}
                minClearanceReq={mainResult.minAirClearanceRequired}
                actualClearance={mainResult.actualClearanceToTower}
                clearancePassed={mainResult.clearancePassed}
                windSpeed={windSpeed}
                counterWeightKg={counterWeightKg}
                vAngleDeg={vAngleDeg}
                cameraPreset={cameraPreset}
              />
            ) : (
              <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full max-h-[400px]">
                {/* Background Grid */}
                <defs>
                  <pattern id="grid" width="20" height="20" patternUnits="userSpaceOnUse">
                    <path d="M 20 0 L 0 0 0 20" fill="none" stroke="#1e293b" strokeWidth="0.5" />
                  </pattern>
                </defs>
                <rect width="100%" height="100%" fill="url(#grid)" />

                {/* Tower Window Frame */}
                <rect
                  x={centerX - windowHalfWidthPx}
                  y={topY - 10}
                  width={windowHalfWidthPx * 2}
                  height={windowHeightPx}
                  fill="none"
                  stroke="#475569"
                  strokeWidth="2"
                  strokeDasharray="4 4"
                />

                {/* Hanging Attachment Center */}
                <circle cx={attachX} cy={attachY} r="5" fill="#38bdf8" />

                {/* Insulator String Line */}
                <line
                  x1={attachX}
                  y1={attachY}
                  x2={conductorX}
                  y2={conductorY}
                  stroke="#06b6d4"
                  strokeWidth="4"
                  strokeLinecap="round"
                />

                {/* Conductor Position & Clearance Circle */}
                <circle cx={conductorX} cy={conductorY} r={clearanceRadiusPx} fill="rgba(245, 158, 11, 0.15)" stroke="#f59e0b" strokeWidth="1.5" strokeDasharray="3 3" />
                <circle cx={conductorX} cy={conductorY} r="7" fill="#f59e0b" />

                {/* Swing Angle Arc Indicator */}
                <path
                  d={`M ${attachX} ${attachY + 40} A 40 40 0 0 ${conductorX > attachX ? 1 : 0} ${attachX + 40 * Math.sin(swingAngleRad)} ${attachY + 40 * Math.cos(swingAngleRad)}`}
                  fill="none"
                  stroke="#38bdf8"
                  strokeWidth="2"
                />
                <text x={attachX + 15} y={attachY + 60} fill="#38bdf8" fontSize="12" fontFamily="monospace" fontWeight="bold">
                  φ = {swingAngleDeg.toFixed(1)}°
                </text>
              </svg>
            )}
          </div>
        </div>

        {/* Physics Metrics Panel */}
        <div className="bg-slate-950/80 p-4 rounded-2xl border border-slate-800 space-y-3 font-mono text-xs">
          <h4 className="font-bold text-slate-100 flex items-center gap-2 uppercase tracking-wide border-b border-slate-800 pb-2">
            <Activity className="w-4 h-4 text-cyan-400" />
            <span>风偏计算物理指标 (Physics Metrics)</span>
          </h4>

          <div className="space-y-2">
            <div className="flex justify-between p-2 rounded-xl bg-slate-900 border border-slate-800">
              <span className="text-slate-400">绝缘子串风偏角 φ:</span>
              <strong className="text-cyan-300">{mainResult.insulatorWindSwingAngle.toFixed(2)}°</strong>
            </div>

            <div className="flex justify-between p-2 rounded-xl bg-slate-900 border border-slate-800">
              <span className="text-slate-400">导线横向风偏位移 Δx:</span>
              <strong className="text-cyan-300">{mainResult.horizontalDisplacement.toFixed(2)} m</strong>
            </div>

            <div className="flex justify-between p-2 rounded-xl bg-slate-900 border border-slate-800">
              <span className="text-slate-400">挂点垂直降深 Δy:</span>
              <strong className="text-sky-300">{mainResult.verticalDropDisplacement.toFixed(2)} m</strong>
            </div>

            <div className="flex justify-between p-2 rounded-xl bg-slate-900 border border-slate-800">
              <span className="text-slate-400">实际塔体最小间隙:</span>
              <strong className={mainResult.clearancePassed ? 'text-emerald-400' : 'text-red-400'}>
                {mainResult.actualClearanceToTower.toFixed(2)} m (需 ≥ {mainResult.minAirClearanceRequired.toFixed(2)}m)
              </strong>
            </div>

            <div className="flex justify-between p-2 rounded-xl bg-slate-900 border border-slate-800">
              <span className="text-slate-400">绝缘子串重力 G_I:</span>
              <strong className="text-emerald-400">
                {mainResult.stringTotalWeightKg.toFixed(1)} kg ({((mainResult.stringTotalWeightKg * 9.80665) / 1000).toFixed(2)} kN)
              </strong>
            </div>

            <div className="flex justify-between p-2 rounded-xl bg-slate-900 border border-slate-800">
              <span className="text-slate-400">绝缘子受风面积 A_ins:</span>
              <strong className="text-cyan-400">{mainResult.stringWindAreaM2.toFixed(2)} m²</strong>
            </div>

            <div className="flex justify-between p-2 rounded-xl bg-slate-900 border border-slate-800">
              <span className="text-slate-400">绝缘子串风压 P_I:</span>
              <strong className="text-slate-200">{mainResult.windLoadOnString.toFixed(2)} kN</strong>
            </div>

            <div className="flex justify-between p-2 rounded-xl bg-slate-900 border border-slate-800">
              <span className="text-slate-400">导线水平风荷载 P · l_H:</span>
              <strong className="text-slate-200">{mainResult.conductorWindLoadOnString.toFixed(2)} kN</strong>
            </div>

            <div className="flex justify-between p-2 rounded-xl bg-slate-900 border border-slate-800">
              <span className="text-slate-400">导线垂直荷载 W₁ · l_v:</span>
              <strong className="text-slate-200">{mainResult.conductorWeightOnString.toFixed(2)} kN</strong>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
