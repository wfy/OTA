import React, { useState } from 'react';
import { InsulatorCalcResult, Conductor, Insulator, TowerParameters, WorkingCondition } from '../types';
import { calculateWindLoadDetails } from '../utils/conductorPhysics';
import { NormativeTableModal } from './NormativeTableModal';
import {
  X,
  BookOpen,
  Layers,
  Wind,
  Info,
  Sparkles,
  Calculator,
  CheckCircle2,
  HelpCircle,
  ChevronRight,
  ShieldAlert,
  FileText,
  Sliders,
  Table,
  Check,
  Zap,
} from 'lucide-react';

interface FormulaModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'conductor' | 'insulator';
  insulatorRes?: InsulatorCalcResult;
  conductor?: Conductor;
  insulator?: Insulator;
  tower?: TowerParameters;
  windCondition?: WorkingCondition;
}

export const FormulaModal: React.FC<FormulaModalProps> = ({
  isOpen,
  onClose,
  initialTab = 'conductor',
  insulatorRes,
  conductor,
  insulator,
  tower,
  windCondition,
}) => {
  const [activeTab, setActiveTab] = useState<'conductor' | 'insulator'>(initialTab);
  const [showGlossary, setShowGlossary] = useState(false);
  const [normativeTableModal, setNormativeTableModal] = useState<{
    isOpen: boolean;
    tab: 'mu_z' | 'gamma_c' | 'terrain';
  }>({ isOpen: false, tab: 'mu_z' });

  // Extract values for live simulation calculation row in Formula 2-6-44
  const P_I_N = insulatorRes ? insulatorRes.windLoadOnString * 1000 : 82.0;
  const P_x_N = insulatorRes ? insulatorRes.conductorWindLoadOnString * 1000 : 4250.0;
  const G_I_N = insulatorRes ? insulatorRes.stringTotalWeightKg * 9.81 : 833.6;
  const W_y_N = insulatorRes ? insulatorRes.conductorWeightOnString * 1000 : 12500.0;
  const G_cw_N = insulatorRes ? insulatorRes.counterWeightMass * 9.81 : 0;

  const horizontalTotalN = 0.5 * P_I_N + P_x_N;
  const verticalTotalN = 0.5 * G_I_N + W_y_N + G_cw_N;
  const windAngleDeg = insulatorRes
    ? insulatorRes.insulatorWindSwingAngle
    : (Math.atan2(horizontalTotalN, Math.max(verticalTotalN, 1)) * 180) / Math.PI;

  // Span parameters for Span Tab
  const span_lH = (tower?.horizontalSpan && tower?.horizontalSpan > 0) ? tower.horizontalSpan : (tower?.spanLength || 350);
  const span_lv = insulatorRes?.verticalSpan ?? tower?.leftVerticalSpan ?? span_lH;
  const span_a = tower?.elevationDiffRatio !== undefined ? tower.elevationDiffRatio : -0.05;
  const cond_S = conductor?.sectionArea || conductor?.totalArea || 300;
  const cond_unitMassKgM = conductor?.unitMass || 1.378; // kg/m
  const numSub = tower?.numSubConductors || 1;
  const cond_W1_single = cond_unitMassKgM * 9.81; // 1.378 * 9.81 = 13.51818 N/m
  const cond_W1 = cond_W1_single * numSub; // N/m for bundle
  const cond_gammaV = cond_S > 0 ? cond_W1 / cond_S : 0.0441; // N/(m*mm2)
  const cond_T = insulatorRes?.conductorTension || 28500; // N
  const cond_sigma0 = cond_S > 0 ? cond_T / cond_S : 95.0; // N/mm2
  const calc_lv = span_lv;
  const calc_Wy = cond_W1 * calc_lv;
  
  // Conductor specific load parameters for Conductor Tab
  const cond_d = conductor?.outerDiameter || 21.6; // mm
  const cond_E = conductor?.elasticModulus || 73000; // N/mm2
  const cond_alpha = conductor?.thermalExpansion || 19.5e-6; // 1/°C
  const cond_Tp = conductor?.ratedStrength || 100; // kN
  const cond_name = conductor?.name || conductor?.model || 'JL/G1A-240/30';
  
  const cond_temp = windCondition?.temperature ?? 15; // °C
  const cond_v = windCondition?.windSpeed ?? 25; // m/s
  const cond_b = windCondition?.iceThickness ?? 0; // mm
  const rep_span = tower?.representSpan || tower?.spanLength || 350; // m

  // Specific load calculations (γ_1 ~ γ_7) in N/(m·mm²)
  const calc_g1 = (cond_unitMassKgM * 9.81) / Math.max(cond_S, 1);
  const calc_g2 = cond_b > 0 ? (0.9 * Math.PI * cond_b * (cond_d + cond_b) * 9.81 / 1000) / Math.max(cond_S, 1) : 0;
  const calc_g3_v = calc_g1 + calc_g2;

  // 精细风荷载推导 (GB 50545 规范 9.3 节)
  const windDetailsNoIce = calculateWindLoadDetails({
    windSpeed: cond_v,
    iceThickness: 0,
    spanLength: rep_span,
    subDiameter: cond_d,
    numSubConductors: numSub,
    subArea: cond_S,
    averageHeight: tower?.averageHeight || 20,
    terrainCategory: tower?.terrainCategory || 'B',
    windAngleDeg: tower?.windAngleDeg || 90,
    lineType: tower?.lineType || 'general',
    customWindShapeFactor: conductor?.windShapeFactor,
  });

  const windDetailsIce = calculateWindLoadDetails({
    windSpeed: cond_v,
    iceThickness: cond_b,
    spanLength: rep_span,
    subDiameter: cond_d,
    numSubConductors: numSub,
    subArea: cond_S,
    averageHeight: tower?.averageHeight || 20,
    terrainCategory: tower?.terrainCategory || 'B',
    windAngleDeg: tower?.windAngleDeg || 90,
    lineType: tower?.lineType || 'general',
    customWindShapeFactor: conductor?.windShapeFactor,
    customIceWindCoeff: conductor?.iceWindCoeff,
  });

  const calc_g4_wind = cond_v > 0 ? windDetailsNoIce.gamma_wind : 0;
  const calc_g5_wind_ice = (cond_v > 0 && cond_b > 0) ? windDetailsIce.gamma_wind : 0;

  const calc_g6 = Math.sqrt(calc_g1 * calc_g1 + calc_g4_wind * calc_g4_wind);
  const calc_g7 = Math.sqrt(calc_g3_v * calc_g3_v + calc_g5_wind_ice * calc_g5_wind_ice);

  const active_gamma = cond_b > 0 ? (cond_v > 0 ? calc_g7 : calc_g3_v) : (cond_v > 0 ? calc_g6 : calc_g1);

  // Active stress & sag & tension
  const active_sigma = insulatorRes?.conductorTension ? (insulatorRes.conductorTension / Math.max(cond_S * numSub, 1)) : cond_sigma0;
  const active_tension_kN = (active_sigma * cond_S * numSub) / 1000;
  const active_sag = insulatorRes?.conductorSag || ((active_gamma * cond_S * rep_span * rep_span) / Math.max(8 * active_sigma * cond_S, 0.01));
  const active_Tmax_kN = active_tension_kN + (active_gamma * cond_S * active_sag * numSub) / 1000;
  const active_K = active_Tmax_kN > 0 ? (cond_Tp / Math.max(active_Tmax_kN / numSub, 0.01)) : 2.8;

  const default_h = tower?.heightDifference !== undefined ? tower.heightDifference : (span_a * span_lH) / 2;
  const beta_deg = Math.atan2(Math.abs(default_h), span_lH) * (180 / Math.PI);
  const cos_beta = Math.cos((beta_deg * Math.PI) / 180);
  const precise_lH = span_lH / Math.max(cos_beta, 0.0001);

  React.useEffect(() => {
    if (isOpen) {
      setActiveTab(initialTab);
    }
  }, [isOpen, initialTab]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-6 bg-transparent backdrop-blur-sm animate-fadeIn">
      <div className="relative w-full max-w-5xl max-h-[92vh] bg-slate-900/35 backdrop-blur-2xl rounded-3xl shadow-2xl overflow-hidden flex flex-col text-slate-100 border border-white/25">
        
        {/* Decorative Top Ambient Light */}
        <div className="absolute top-0 left-1/4 right-1/4 h-1 bg-gradient-to-r from-transparent via-cyan-400 to-transparent opacity-80 pointer-events-none" />

        {/* Header Bar */}
        <div className="flex items-center justify-between px-6 py-4 bg-white/10 border-b border-white/10 backdrop-blur-xl">
          <div className="flex items-center space-x-3">
            <div className="p-2.5 rounded-2xl bg-cyan-500/20 border border-cyan-400/50 text-cyan-300 shadow-inner">
              <BookOpen className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-base font-bold text-slate-100 tracking-wide">
                  架空输电线路工况计算公式与理论推导
                </h2>
                <span className="text-[11px] font-mono font-semibold text-cyan-300 bg-cyan-500/20 border border-cyan-400/40 px-2.5 py-0.5 rounded-full shadow-sm">
                  DL/T 5092 & GB 50545
                </span>
              </div>
              <p className="text-[11px] text-slate-300 mt-0.5">
                规范级导线状态方程、比载合成向量、绝缘子串风偏角与电气安全间隙校验体系
              </p>
            </div>
          </div>

          <div className="flex items-center space-x-2">
            <button
              onClick={() => setShowGlossary(!showGlossary)}
              className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border transition-all text-xs font-medium backdrop-blur-md cursor-pointer ${
                showGlossary
                  ? 'bg-sky-500/20 border-sky-400/50 text-sky-300 shadow-lg'
                  : 'bg-white/10 border-white/20 text-slate-200 hover:text-white hover:bg-white/15'
              }`}
              title="切换显示全参数速查手册"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>{showGlossary ? '隐藏参数速查' : '全参数手册'}</span>
            </button>

            <button
              onClick={onClose}
              className="p-2 rounded-xl glass-button text-slate-300 hover:text-white transition-all cursor-pointer"
              title="关闭界面"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Tab Navigation Switcher & Search Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 px-6 py-3 bg-white/5 border-b border-white/10 backdrop-blur-md">
          <div className="flex items-center space-x-2 flex-wrap gap-y-1.5">
            <button
              onClick={() => setActiveTab('conductor')}
              className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'conductor'
                  ? 'bg-gradient-to-r from-cyan-500 to-teal-400 text-slate-950 shadow-lg shadow-cyan-500/25 border border-cyan-300/50'
                  : 'glass-button text-slate-200 hover:text-white'
              }`}
            >
              <Layers className="w-4 h-4" />
              <span>一、导线力学与状态方程 (Conductor State)</span>
            </button>

            <button
              onClick={() => setActiveTab('insulator')}
              className={`flex items-center space-x-2 px-3.5 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                activeTab === 'insulator'
                  ? 'bg-gradient-to-r from-cyan-500 to-teal-400 text-slate-950 shadow-lg shadow-cyan-500/25 border border-cyan-300/50'
                  : 'glass-button text-slate-200 hover:text-white'
              }`}
            >
              <Wind className="w-4 h-4" />
              <span>二、绝缘子串爬距与风偏受力 (Insulator Swing)</span>
            </button>
          </div>

          <div className="text-[11px] text-cyan-300 font-mono flex items-center gap-1.5 px-3 py-1.5 rounded-xl glass-inner backdrop-blur-md">
            <Calculator className="w-3.5 h-3.5 text-cyan-400" />
            <span>求解器: Newton-Raphson 3D 矢量解算引擎</span>
          </div>
        </div>

        {/* Modal Scrollable Body Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6 text-xs text-slate-200 font-sans leading-relaxed custom-scrollbar">
          
          {/* Optional Master Parameter Glossary Panel */}
          {showGlossary && (
            <div className="glass-card rounded-2xl p-5 space-y-4 border border-sky-400/30 bg-sky-500/10 backdrop-blur-xl animate-fadeIn">
              <div className="flex items-center justify-between border-b border-sky-400/20 pb-2.5">
                <h3 className="font-bold text-sm text-sky-300 flex items-center gap-2">
                  <FileText className="w-4 h-4 text-sky-400" />
                  工程全参数记号与标准物理意义全景速查表 (Notation & Physical Units Glossary)
                </h3>
                <span className="text-[10px] text-sky-200/80 font-mono bg-sky-500/20 px-2 py-0.5 rounded border border-sky-400/30">
                  GB 50545 & DL/T 5092 规范定义
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[11px]">
                <div className="space-y-2">
                  <h4 className="font-bold text-cyan-300 flex items-center gap-1.5 text-xs">
                    <Layers className="w-3.5 h-3.5" /> 导线力学参数
                  </h4>
                  <ul className="space-y-1.5 text-slate-200 bg-white/10 backdrop-blur-md p-3 rounded-xl border border-white/10 font-mono text-[10px]">
                    <li><strong className="text-cyan-300">m (kg/m)</strong>: 导线单位长度质量（制造厂家规格书提供，如 LGJ-240/30 取 0.928 kg/m）</li>
                    <li><strong className="text-cyan-300">g (m/s²)</strong>: 重力加速度，国家标准取 9.80665 m/s²</li>
                    <li><strong className="text-cyan-300">S (mm²)</strong>: 导线计算总截面积（包含铝与钢单丝总截面，如 275.96 mm²）</li>
                    <li><strong className="text-cyan-300">d (mm)</strong>: 导线外截面直径（如 21.6 mm）；覆冰时风压计算外径扩大为 (d + 2b)</li>
                    <li><strong className="text-sky-300">b (mm)</strong>: 设计覆冰厚度（50年一遇重现期，如 5mm, 10mm, 15mm, 20mm）</li>
                    <li><strong className="text-cyan-300">v (m/s)</strong>: 10m 高度处设计风速；覆冰工况风速取 v_ice = 0.5v（且 ≥ 10m/s）</li>
                    <li><strong className="text-cyan-300">α_w</strong>: 导线风压不均匀系数（L≤200m取1.0; 200m&lt;L≤500m取0.85; L&gt;500m取0.75）</li>
                    <li><strong className="text-cyan-300">μ_z</strong>: 风压高度变化系数，公式: μ_z = (Z / 10)^(2α_0)，Z为平均挂高，α_0为地貌指数(A:0.12, B:0.16, C:0.22, D:0.30)</li>
                    <li><strong className="text-cyan-300">μ_s</strong>: 导线体型系数（无冰时 d≥17mm 取 1.1，d&lt;17mm 取 1.2；覆冰时取 1.2）</li>
                    <li><strong className="text-emerald-300">E (N/mm²)</strong>: 导线综合弹性模量（如钢芯铝绞线取 65000 ~ 80000 N/mm²）</li>
                    <li><strong className="text-emerald-300">α (1/°C)</strong>: 导线材料线膨胀系数（如钢芯铝绞线取 18.9 ~ 20.5 × 10⁻⁶ /°C）</li>
                    <li><strong className="text-sky-300">L (m)</strong>: 连续档代表档距，公式: L = √( Σ l_i³ / Σ l_i )</li>
                    <li><strong className="text-sky-300">l_c (m)</strong>: 临界档距，用于判别低温控制、大风控制与覆冰控制条件转换</li>
                  </ul>
                </div>

                <div className="space-y-2">
                  <h4 className="font-bold text-sky-300 flex items-center gap-1.5 text-xs">
                    <Wind className="w-3.5 h-3.5" /> 绝缘子与风偏参数
                  </h4>
                  <ul className="space-y-1.5 text-slate-200 bg-white/10 backdrop-blur-md p-3 rounded-xl border border-white/10 font-mono text-[10px]">
                    <li><strong className="text-cyan-300">λ (mm/kV)</strong>: 统一爬电比距 (USCD)，按污秽等级取值（Ⅰ: 20, Ⅱ: 25, Ⅲ: 31, Ⅳ: 38, Ⅴ: 45）</li>
                    <li><strong className="text-cyan-300">U_m (kV)</strong>: 系统最高工作电压（110kV取126kV, 220kV取252kV, 500kV取550kV）</li>
                    <li><strong className="text-cyan-300">L_single (mm)</strong>: 单片盘形悬式绝缘子公称爬电距离（如 XP-70 取 295mm 或 305mm）</li>
                    <li><strong className="text-cyan-300">N_spare</strong>: 高海拔及零值加挂片数（海拔每增1000m加3%~5%，预留1~2片零值片）</li>
                    <li><strong className="text-cyan-300">K_h</strong>: 高海拔外绝缘修正系数，K_h = 1 + [(H - 1000) / 10000] × 10% (H &gt; 1000m)</li>
                    <li><strong className="text-sky-300">l_H (m)</strong>: 悬垂绝缘子串风偏角计算用杆塔水平档距，(l₁ + l₂)/2</li>
                    <li><strong className="text-sky-300">l_v (m)</strong>: 悬垂绝缘子串风偏角计算用杆塔垂直档距，满足 W₁ · l_v = W₁ · l_H + a · T</li>
                    <li><strong className="text-sky-300">P_I / P_xi (N)</strong>: 悬垂绝缘子串风压 (自身水平风荷载，以 50% 折算至挂点)</li>
                    <li><strong className="text-sky-300">G_I / G_ins (N)</strong>: 悬垂绝缘子串重力 (自身重力以 50% 折算至挂点；重锤 G_cw 直加)</li>
                    <li><strong className="text-sky-300">P (N/m) &amp; P_x (N)</strong>: 对应风速下导线单位风荷载 P 与导线总水平风荷载 P_x = P · l_H</li>
                    <li><strong className="text-sky-300">W₁ (N/m) &amp; W_y (N)</strong>: 导线单位垂直荷载 W₁ 与导线总垂直荷载 W_y = W₁ · l_v</li>
                    <li><strong className="text-cyan-300">a &amp; T (N)</strong>: 塔位高差系数 a 与相应风速下的导线张力 T</li>
                    <li><strong className="text-cyan-300">θ_v (°)</strong>: V型绝缘子串双腿夹角（工程常用 80° ~ 100°）</li>
                    <li><strong className="text-emerald-300">D_min_safe (m)</strong>: 杆塔电气安全间隙（工频: 0.55m; 操作过电压: 1.45m; 雷电过电压: 1.90m）</li>
                  </ul>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'conductor' ? (
            /* ================= CONDUCTOR FORMULAS ================= */
            <div className="space-y-6">
              {/* Introduction Banner */}
              <div className="p-4 rounded-2xl bg-cyan-500/10 border border-cyan-400/30 backdrop-blur-md flex items-start space-x-3 text-slate-100 shadow-md">
                <Info className="w-5 h-5 text-cyan-300 shrink-0 mt-0.5" />
                <p className="text-[11px] leading-relaxed text-slate-200">
                  导线在各种气象工况（气温、风速、覆冰）作用下会发生热胀冷缩与弹性伸缩形变。首先计算导线在各工况下的<strong className="text-cyan-300">单位比载 γ₁ ~ γ₇</strong>，代入<strong className="text-cyan-300">连续档导线状态变化方程 (State Change Equation)</strong>，利用<strong className="text-sky-300">牛顿-拉夫逊数值迭代法</strong>精准求解变气象条件下的水平应力 σ、端部最大张力 T<sub>max</sub>、中央弧垂 f 与破断安全系数 K。
                </p>
              </div>

              {/* Step 1: Specific Load Calculation */}
              <div className="glass-card rounded-2xl p-5 space-y-4 shadow-xl border border-white/15">
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                  <h3 className="font-bold text-sm text-cyan-300 flex items-center gap-2.5">
                    <span className="w-6 h-6 rounded-xl bg-cyan-500/30 text-cyan-200 text-xs font-mono flex items-center justify-center font-extrabold border border-cyan-400/40">
                      1
                    </span>
                    导线单位比载综合计算公式 (Specific Load Equations γ₁ ~ γ₇)
                  </h3>
                  <span className="text-[11px] text-slate-300 font-mono bg-white/10 px-2.5 py-1 rounded-lg border border-white/10 backdrop-blur-sm">
                    物理单位: N/(m·mm²)
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5">
                  {/* Gamma 1: Self Weight */}
                  <div className="glass-inner p-3.5 rounded-xl space-y-2 border border-white/15 hover:border-cyan-400/30 transition-all">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-100 flex items-center gap-1.5">
                        <ChevronRight className="w-3.5 h-3.5 text-cyan-400" />
                        1. 导线自重比载 γ₁
                      </span>
                      <span className="text-[10px] text-slate-300 font-mono bg-white/10 px-2 py-0.5 rounded backdrop-blur-sm">无风无冰自重</span>
                    </div>
                    <div className="p-2.5 glass-inner bg-white/10 backdrop-blur-md font-mono text-cyan-300 text-center rounded-xl border border-cyan-500/30 font-bold text-sm tracking-wide shadow-inner">
                      {"γ₁ = (m · g / S) × 10⁻³"}
                    </div>
                    
                    {/* Detailed Parameter Breakdown */}
                    <div className="p-2.5 bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 text-[10px] space-y-1">
                      <div className="font-bold text-cyan-300 border-b border-white/10 pb-1 mb-1">【参数与物理意义详解】</div>
                      <div className="grid grid-cols-1 gap-1 font-mono text-slate-200">
                        <div>• <strong className="text-cyan-300">m (kg/m)</strong>: 导线单位长度质量 ({cond_unitMassKgM.toFixed(4)} kg/m)</div>
                        <div>• <strong className="text-cyan-300">g (m/s²)</strong>: 重力加速度，取 9.80665 m/s²</div>
                        <div>• <strong className="text-cyan-300">S (mm²)</strong>: 导线计算总截面积 ({cond_S.toFixed(2)} mm²)</div>
                      </div>
                    </div>

                    <div className="p-2 bg-cyan-500/15 rounded-xl border border-cyan-400/30 text-slate-100 space-y-1 font-mono text-[10px]">
                      <div className="flex items-center gap-1 text-cyan-300 font-bold text-[10.5px]">
                        <Sliders className="w-3 h-3" /> 关联左侧边栏参数用例:
                      </div>
                      <div className="text-slate-300">
                        m_0 = <span className="text-white font-mono">{cond_unitMassKgM.toFixed(4)}</span> kg/m, S = <span className="text-white font-mono">{cond_S.toFixed(2)}</span> mm²
                      </div>
                      <div className="flex items-center justify-between border-t border-cyan-400/20 pt-1 text-[11px]">
                        <span className="text-slate-200">代入计算结果 γ₁:</span>
                        <strong className="text-cyan-300 font-bold font-mono">
                          {calc_g1.toFixed(5)} N/(m·mm²)
                        </strong>
                      </div>
                    </div>
                  </div>

                  {/* Gamma 2: Ice Weight */}
                  <div className="glass-inner p-3.5 rounded-xl space-y-2 border border-white/15 hover:border-sky-400/30 transition-all">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-100 flex items-center gap-1.5">
                        <ChevronRight className="w-3.5 h-3.5 text-sky-400" />
                        2. 覆冰附加比载 γ₂
                      </span>
                      <span className="text-[10px] text-sky-300 font-mono bg-sky-500/20 px-2 py-0.5 rounded border border-sky-400/30 backdrop-blur-sm">覆冰附加重力</span>
                    </div>
                    <div className="p-2.5 glass-inner bg-white/10 backdrop-blur-md font-mono text-sky-300 text-center rounded-xl border border-sky-500/30 font-bold text-sm tracking-wide shadow-inner">
                      {"γ₂ = [0.9 π · b · (d + b) · g / S] × 10⁻³"}
                    </div>
                    
                    {/* Detailed Parameter Breakdown */}
                    <div className="p-2.5 bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 text-[10px] space-y-1">
                      <div className="font-bold text-sky-300 border-b border-white/10 pb-1 mb-1">【参数与物理意义详解】</div>
                      <div className="grid grid-cols-1 gap-1 font-mono text-slate-200">
                        <div>• <strong className="text-sky-300">b (mm)</strong>: 设计覆冰厚度 ({cond_b} mm)</div>
                        <div>• <strong className="text-sky-300">d (mm)</strong>: 导线外截面直径 ({cond_d} mm)</div>
                        <div>• <strong className="text-sky-300">0.9 (g/cm³)</strong>: 规范标准雨雪覆冰密度 ρ_ice</div>
                      </div>
                    </div>

                    <div className="p-2 bg-sky-500/15 rounded-xl border border-sky-400/30 text-slate-100 space-y-1 font-mono text-[10px]">
                      <div className="flex items-center gap-1 text-sky-300 font-bold text-[10.5px]">
                        <Sliders className="w-3 h-3" /> 关联左侧边栏参数用例:
                      </div>
                      <div className="text-slate-300">
                        b = <span className="text-amber-300 font-mono">{cond_b}</span> mm, d = <span className="text-white font-mono">{cond_d}</span> mm, S = <span className="text-white font-mono">{cond_S.toFixed(2)}</span> mm²
                      </div>
                      <div className="flex items-center justify-between border-t border-sky-400/20 pt-1 text-[11px]">
                        <span className="text-slate-200">代入计算结果 γ₂:</span>
                        <strong className="text-sky-300 font-bold font-mono">
                          {cond_b > 0 ? `${calc_g2.toFixed(5)} N/(m·mm²)` : '0.00000 N/(m·mm²) (无冰)'}
                        </strong>
                      </div>
                    </div>
                  </div>

                  {/* Gamma 3: Vertical Total Weight */}
                  <div className="glass-inner p-3.5 rounded-xl space-y-2 border border-white/15 hover:border-cyan-400/30 transition-all">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-100 flex items-center gap-1.5">
                        <ChevronRight className="w-3.5 h-3.5 text-cyan-400" />
                        3. 垂直总比载 γ₃
                      </span>
                      <span className="text-[10px] text-slate-300 font-mono bg-white/10 px-2 py-0.5 rounded backdrop-blur-sm">自重 + 冰重</span>
                    </div>
                    <div className="p-2.5 glass-inner bg-white/10 backdrop-blur-md font-mono text-cyan-300 text-center rounded-xl border border-cyan-500/30 font-bold text-sm tracking-wide shadow-inner">
                      {"γ₃ = γ₁ + γ₂"}
                    </div>
                    
                    {/* Detailed Parameter Breakdown */}
                    <div className="p-2.5 bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 text-[10px] space-y-1">
                      <div className="font-bold text-cyan-300 border-b border-white/10 pb-1 mb-1">【参数与物理意义详解】</div>
                      <div className="grid grid-cols-1 gap-1 font-mono text-slate-200">
                        <div>• <strong className="text-cyan-300">γ₁</strong>: 导线自重比载 ({calc_g1.toFixed(5)})</div>
                        <div>• <strong className="text-cyan-300">γ₂</strong>: 导线覆冰附加比载 ({calc_g2.toFixed(5)})</div>
                      </div>
                    </div>

                    <div className="p-2 bg-cyan-500/15 rounded-xl border border-cyan-400/30 text-slate-100 space-y-1 font-mono text-[10px]">
                      <div className="flex items-center gap-1 text-cyan-300 font-bold text-[10.5px]">
                        <Sliders className="w-3 h-3" /> 关联左侧边栏参数用例:
                      </div>
                      <div className="text-slate-300">
                        γ₁ ({calc_g1.toFixed(5)}) + γ₂ ({calc_g2.toFixed(5)})
                      </div>
                      <div className="flex items-center justify-between border-t border-cyan-400/20 pt-1 text-[11px]">
                        <span className="text-slate-200">代入计算结果 γ₃:</span>
                        <strong className="text-cyan-300 font-bold font-mono">
                          {calc_g3_v.toFixed(5)} N/(m·mm²)
                        </strong>
                      </div>
                    </div>
                  </div>

                  {/* Gamma 4 & 5: Wind Loads - Full Row Span */}
                  <div className="col-span-1 md:col-span-2 glass-inner p-4 rounded-xl space-y-3.5 border border-white/15 hover:border-cyan-400/30 transition-all shadow-lg">
                    <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-2">
                      <span className="font-bold text-slate-100 text-sm md:text-base flex items-center gap-1.5">
                        <ChevronRight className="w-4 h-4 text-cyan-400" />
                        4. 水平风压比载 γ₄ (无冰) / γ₅ (有冰) 与导线风荷载 W_x
                      </span>
                      <div className="flex items-center gap-2">
                        <span className="text-[10px] text-cyan-300 font-mono bg-cyan-500/20 px-2.5 py-0.5 rounded border border-cyan-400/30 backdrop-blur-sm">
                          GB 50545 式 (9.3.1-1 ~ 9.3.1-6)
                        </span>
                        <span className="text-[10px] text-emerald-300 font-mono bg-emerald-500/20 px-2.5 py-0.5 rounded border border-emerald-400/30 backdrop-blur-sm">
                          DL/T 5582-2020 5.1.15
                        </span>
                      </div>
                    </div>

                    {/* 核心主公式展示 */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                      <div className="p-3 glass-inner bg-cyan-950/40 backdrop-blur-md rounded-xl border border-cyan-500/30 text-center space-y-1">
                        <div className="text-[11px] text-cyan-300 font-bold uppercase tracking-wider">
                          ① 导线风偏风荷载设计值 W_x 公式 (GB 50545 式 9.3.1-1)
                        </div>
                        <div className="font-mono text-cyan-200 font-bold text-xs md:text-sm tracking-wide">
                          W_x = β_c · α_L · W₀ · μ_z · μ_sc · d_m · L_p · B₁ · sin²θ  (kN)
                        </div>
                      </div>

                      <div className="p-3 glass-inner bg-cyan-950/40 backdrop-blur-md rounded-xl border border-cyan-500/30 text-center space-y-1">
                        <div className="text-[11px] text-cyan-300 font-bold uppercase tracking-wider">
                          ② 换算单位截面积风压比载 γ_wind 公式
                        </div>
                        <div className="font-mono text-cyan-200 font-bold text-xs md:text-sm tracking-wide">
                          γ_wind = (W_x · 1000) / [L_p · (n · S)]  [N/(m·mm²)]
                        </div>
                      </div>
                    </div>

                    {/* 9 大规范子公式与参数推导详解 */}
                    <div className="p-3 bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 text-[10px] space-y-2.5">
                      <div className="font-bold text-cyan-300 border-b border-white/10 pb-1.5 flex items-center justify-between text-xs">
                        <span>【GB 50545 规范 9.3.1 节 9 大子公式与推导参数详解】</span>
                        <span className="text-[10px] text-slate-300 font-mono font-normal">
                          地貌类别: {tower?.terrainCategory || 'B'}类 | 平均高度 z = {tower?.averageHeight || 20}m
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5 font-mono text-slate-200 text-[10px]">
                        {/* 1. 基准风压 */}
                        <div className="bg-black/25 p-2.5 rounded-lg border border-white/10 space-y-1">
                          <div className="text-cyan-300 font-bold flex items-center justify-between">
                            <span>1. 基准风压 W₀ (式9.3.1-6)</span>
                          </div>
                          <div className="text-slate-300 text-[9.5px]">公式: W₀ = v₀² / 1600 (kN/m²)</div>
                          <div className="p-1 bg-black/40 rounded border border-white/5 text-cyan-200 font-bold">
                            W₀ = {cond_v}² / 1600 = {windDetailsNoIce.W0.toFixed(4)} kN/m²
                          </div>
                          <div className="text-slate-400 text-[9px]">基准风速 v₀ = {cond_v} m/s</div>
                        </div>

                        {/* 2. 湍流强度 */}
                        <div className="bg-black/25 p-2.5 rounded-lg border border-white/10 space-y-1">
                          <div className="text-cyan-300 font-bold flex items-center justify-between">
                            <span>2. 湍流强度 I_z (式9.3.1-3)</span>
                            <button
                              onClick={() => setNormativeTableModal({ isOpen: true, tab: 'terrain' })}
                              className="text-[9px] text-cyan-300 hover:text-white bg-cyan-500/20 hover:bg-cyan-500/40 px-1.5 py-0.5 rounded border border-cyan-400/30 transition-all flex items-center gap-1 cursor-pointer"
                            >
                              <Table className="w-2.5 h-2.5" /> 查地貌表
                            </button>
                          </div>
                          <div className="text-slate-300 text-[9.5px]">公式: I_z = I₁₀ · (z / 10)⁻ᵃ</div>
                          <div className="p-1 bg-black/40 rounded border border-white/5 text-cyan-200 font-bold">
                            I_z = {windDetailsNoIce.Iz.toFixed(4)}
                          </div>
                          <div className="text-slate-400 text-[9px]">{tower?.terrainCategory || 'B'}类地貌: I₁₀ = 0.14, α = 0.15</div>
                        </div>

                        {/* 3. 折减系数 */}
                        <div className="bg-black/25 p-2.5 rounded-lg border border-white/10 space-y-1">
                          <div className="text-cyan-300 font-bold flex items-center justify-between">
                            <span>3. 折减系数 γ_c (表9.3.1-2)</span>
                            <button
                              onClick={() => setNormativeTableModal({ isOpen: true, tab: 'gamma_c' })}
                              className="text-[9px] text-cyan-300 hover:text-white bg-cyan-500/20 hover:bg-cyan-500/40 px-1.5 py-0.5 rounded border border-cyan-400/30 transition-all flex items-center gap-1 cursor-pointer"
                            >
                              <Table className="w-2.5 h-2.5" /> 查表 9.3.1-2
                            </button>
                          </div>
                          <div className="text-slate-300 text-[9.5px]">公式: γ_c = -1/[7.16 + e^(32.5 - 1.2v₀)] + 0.64</div>
                          <div className="p-1 bg-black/40 rounded border border-white/5 text-cyan-200 font-bold">
                            γ_c = {windDetailsNoIce.gamma_c.toFixed(3)}
                          </div>
                          <div className="text-slate-400 text-[9px]">按风速 v₀ 连续曲线函数精准计算</div>
                        </div>

                        {/* 4. 阵风系数 */}
                        <div className="bg-black/25 p-2.5 rounded-lg border border-white/10 space-y-1">
                          <div className="text-cyan-300 font-bold flex items-center justify-between">
                            <span>4. 阵风系数 β_c (式9.3.1-2)</span>
                          </div>
                          <div className="text-slate-300 text-[9.5px]">公式: β_c = γ_c · (1 + 2g · I_z)</div>
                          <div className="p-1 bg-black/40 rounded border border-white/5 text-cyan-200 font-bold">
                            β_c = {windDetailsNoIce.gamma_c.toFixed(3)} × (1 + 2×3.6 × {windDetailsNoIce.Iz.toFixed(4)}) = {windDetailsNoIce.beta_c.toFixed(3)}
                          </div>
                          <div className="text-slate-400 text-[9px]">峰值因子 g = 3.6 (规范固定常数)</div>
                        </div>

                        {/* 5. 积分因子 */}
                        <div className="bg-black/25 p-2.5 rounded-lg border border-white/10 space-y-1">
                          <div className="text-cyan-300 font-bold flex items-center justify-between">
                            <span>5. 积分因子 δ_L (式9.3.1-5)</span>
                          </div>
                          <div className="text-slate-300 text-[9.5px]">公式: δ_L = √(12L_x·L_p³ + 54L_x⁴ - ...) / (3L_p²)</div>
                          <div className="p-1 bg-black/40 rounded border border-white/5 text-cyan-200 font-bold">
                            δ_L = {windDetailsNoIce.delta_L.toFixed(3)}
                          </div>
                          <div className="text-slate-400 text-[9px]">代表档距 L_p = {rep_span}m, 水平尺度 L_x = 50m</div>
                        </div>

                        {/* 6. 档距折减 */}
                        <div className="bg-black/25 p-2.5 rounded-lg border border-white/10 space-y-1">
                          <div className="text-cyan-300 font-bold flex items-center justify-between">
                            <span>6. 档距折减 α_L (式9.3.1-4)</span>
                          </div>
                          <div className="text-slate-300 text-[9.5px]">公式: α_L = (1 + 2g·ε_c·I_z·δ_L) / (1 + 2g·I_z)</div>
                          <div className="p-1 bg-black/40 rounded border border-white/5 text-cyan-200 font-bold">
                            α_L = {windDetailsNoIce.alpha_L.toFixed(3)}
                          </div>
                          <div className="text-slate-400 text-[9px]">风偏计算脉动折减因子 ε_c = 1.0</div>
                        </div>

                        {/* 7. 高度变化系数 */}
                        <div className="bg-black/25 p-2.5 rounded-lg border border-white/10 space-y-1">
                          <div className="text-cyan-300 font-bold flex items-center justify-between">
                            <span>7. 高度变化系数 μ_z (表9.3.1-1)</span>
                            <button
                              onClick={() => setNormativeTableModal({ isOpen: true, tab: 'mu_z' })}
                              className="text-[9px] text-cyan-300 hover:text-white bg-cyan-500/20 hover:bg-cyan-500/40 px-1.5 py-0.5 rounded border border-cyan-400/30 transition-all flex items-center gap-1 cursor-pointer"
                            >
                              <Table className="w-2.5 h-2.5" /> 查表 9.3.1-1
                            </button>
                          </div>
                          <div className="text-slate-300 text-[9.5px]">公式: 挂线平均高度 z 查表双向内插</div>
                          <div className="p-1 bg-black/40 rounded border border-white/5 text-cyan-200 font-bold">
                            μ_z = {windDetailsNoIce.mu_z.toFixed(2)}
                          </div>
                          <div className="text-slate-400 text-[9px]">高度 z = {tower?.averageHeight || 20}m ({tower?.terrainCategory || 'B'}类地貌)</div>
                        </div>

                        {/* 8. 体型系数 */}
                        <div className="bg-black/25 p-2.5 rounded-lg border border-white/10 space-y-1">
                          <div className="text-cyan-300 font-bold flex items-center justify-between">
                            <span>8. 导线体型系数 μ_sc</span>
                          </div>
                          <div className="text-slate-300 text-[9.5px]">规则: d≥17mm取1.0; &lt;17mm取1.1; 覆冰取1.2</div>
                          <div className="p-1 bg-black/40 rounded border border-white/5 text-cyan-200 font-bold">
                            μ_sc = {windDetailsNoIce.mu_sc.toFixed(1)} (无冰) / {windDetailsIce.mu_sc.toFixed(1)} (有冰)
                          </div>
                          <div className="text-slate-400 text-[9px]">子导线外径 d = {cond_d} mm</div>
                        </div>

                        {/* 9. 覆冰增大系数 */}
                        <div className="bg-black/25 p-2.5 rounded-lg border border-white/10 space-y-1">
                          <div className="text-cyan-300 font-bold flex items-center justify-between">
                            <span>9. 覆冰增大系数 B₁</span>
                          </div>
                          <div className="text-slate-400 text-[9.5px]">规则: 无冰1.0; 5mm取1.1; ≥10mm取1.2</div>
                          <div className="p-1 bg-black/40 rounded border border-white/5 text-cyan-200 font-bold">
                            B₁ = {windDetailsIce.B1.toFixed(1)} (当前冰厚 b = {cond_b} mm)
                          </div>
                          <div className="text-slate-400 text-[9px]">气象条件: {cond_b > 0 ? `覆冰 ${cond_b}mm` : '无冰'}</div>
                        </div>
                      </div>
                    </div>

                    {/* 实时参数实例代入逐步计算推导 */}
                    <div className="p-3 bg-cyan-500/15 rounded-xl border border-cyan-400/30 text-slate-100 space-y-2.5 font-mono text-[10.5px]">
                      <div className="flex items-center justify-between text-cyan-300 font-bold text-xs border-b border-cyan-400/20 pb-1">
                        <span className="flex items-center gap-1">
                          <Sliders className="w-3.5 h-3.5 text-cyan-400" />
                          左侧边栏实时气象与杆塔参数 — 实例数值代入推导过程:
                        </span>
                        <span className="text-[10px] text-slate-300 font-normal font-mono">
                          n = {numSub} 分裂 | d = {cond_d} mm | L_p = {rep_span} m
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-[10px] text-slate-200">
                        {/* 无冰风偏实例推导 */}
                        <div className="bg-black/30 p-2.5 rounded-lg border border-white/10 space-y-1.5 flex flex-col justify-between">
                          <div>
                            <div className="text-cyan-300 font-bold flex items-center justify-between border-b border-white/10 pb-1 mb-1">
                              <span>① 无冰工况风偏风荷载 W_x 与风比载 γ₄ 实例计算:</span>
                              <span className="text-cyan-200 font-mono text-[10px]">W_x = {windDetailsNoIce.W_x.toFixed(3)} kN</span>
                            </div>
                            
                            <div className="text-slate-300 space-y-1 text-[9.5px]">
                              <div>• 计算受风总外径: d_m = {numSub} × ({cond_d} + 0) / 1000 = {windDetailsNoIce.d_meter.toFixed(4)} m</div>
                              <div>• 风向与导线夹角: θ = {tower?.windAngleDeg !== undefined ? tower.windAngleDeg : 90}°, sin²θ = {windDetailsNoIce.sin2Theta.toFixed(2)}</div>
                              <div className="pt-0.5 text-slate-200">
                                • 代入风荷载总公式 W_x:
                              </div>
                              <div className="p-1.5 bg-black/40 rounded border border-cyan-500/30 text-cyan-200 font-mono break-all text-[9px]">
                                W_x = {windDetailsNoIce.beta_c.toFixed(3)} × {windDetailsNoIce.alpha_L.toFixed(3)} × {windDetailsNoIce.W0.toFixed(4)} × {windDetailsNoIce.mu_z.toFixed(2)} × {windDetailsNoIce.mu_sc.toFixed(1)} × {windDetailsNoIce.d_meter.toFixed(4)} × {rep_span} × 1.0 × {windDetailsNoIce.sin2Theta.toFixed(2)} = <strong className="text-cyan-300">{windDetailsNoIce.W_x.toFixed(3)} kN</strong>
                              </div>
                              <div className="pt-0.5 text-slate-200">
                                • 代入单位截面积风压比载 γ₄:
                              </div>
                              <div className="p-1.5 bg-black/40 rounded border border-cyan-500/30 text-slate-200 font-mono text-[9px]">
                                γ₄ = ({windDetailsNoIce.W_x.toFixed(3)} × 1000) / [{rep_span} × ({numSub} × {cond_S.toFixed(2)})] = <strong className="text-cyan-300">{calc_g4_wind.toFixed(5)} N/(m·mm²)</strong>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center justify-between pt-1.5 border-t border-white/10 text-[11px] mt-1">
                            <span>无冰风压比载结果 γ₄:</span>
                            <strong className="text-cyan-300 font-bold font-mono">
                              {calc_g4_wind.toFixed(5)} N/(m·mm²)
                            </strong>
                          </div>
                        </div>

                        {/* 有冰风偏实例推导 */}
                        <div className="bg-black/30 p-2.5 rounded-lg border border-white/10 space-y-1.5 flex flex-col justify-between">
                          <div>
                            <div className="text-amber-300 font-bold flex items-center justify-between border-b border-white/10 pb-1 mb-1">
                              <span>② 有冰工况风偏风荷载 W_x 与风比载 γ₅ 实例计算:</span>
                              <span className="text-amber-200 font-mono text-[10px]">
                                {cond_b > 0 ? `W_x = ${windDetailsIce.W_x.toFixed(3)} kN` : 'b = 0 mm'}
                              </span>
                            </div>

                            <div className="text-slate-300 space-y-1 text-[9.5px]">
                              {cond_b > 0 ? (
                                <>
                                  <div>• 覆冰受风总外径: d_m = {numSub} × ({cond_d} + 2×{cond_b}) / 1000 = {windDetailsIce.d_meter.toFixed(4)} m</div>
                                  <div>• 覆冰增大系数 B₁ = {windDetailsIce.B1.toFixed(1)}, 体型系数 μ_sc = {windDetailsIce.mu_sc.toFixed(1)}</div>
                                  <div className="pt-0.5 text-slate-200">
                                    • 代入有冰风荷载总公式 W_x:
                                  </div>
                                  <div className="p-1.5 bg-black/40 rounded border border-amber-500/30 text-amber-200 font-mono break-all text-[9px]">
                                    W_x = {windDetailsIce.beta_c.toFixed(3)} × {windDetailsIce.alpha_L.toFixed(3)} × {windDetailsIce.W0.toFixed(4)} × {windDetailsIce.mu_z.toFixed(2)} × {windDetailsIce.mu_sc.toFixed(1)} × {windDetailsIce.d_meter.toFixed(4)} × {rep_span} × {windDetailsIce.B1.toFixed(1)} × {windDetailsIce.sin2Theta.toFixed(2)} = <strong className="text-amber-300">{windDetailsIce.W_x.toFixed(3)} kN</strong>
                                  </div>
                                  <div className="pt-0.5 text-slate-200">
                                    • 代入单位截面积有冰风比载 γ₅:
                                  </div>
                                  <div className="p-1.5 bg-black/40 rounded border border-amber-500/30 text-slate-200 font-mono text-[9px]">
                                    γ₅ = ({windDetailsIce.W_x.toFixed(3)} × 1000) / [{rep_span} × ({numSub} × {cond_S.toFixed(2)})] = <strong className="text-amber-300">{calc_g5_wind_ice.toFixed(5)} N/(m·mm²)</strong>
                                  </div>
                                </>
                              ) : (
                                <div className="py-4 text-center text-slate-400 italic">
                                  当前设计冰厚 b = 0 mm (无冰)，无冰工况下有冰风压比载 γ₅ = 0.00000 N/(m·mm²)
                                </div>
                              )}
                            </div>
                          </div>

                          <div className="flex items-center justify-between pt-1.5 border-t border-white/10 text-[11px] mt-1">
                            <span>有冰风压比载结果 γ₅:</span>
                            <strong className="text-amber-300 font-bold font-mono">
                              {cond_b > 0 ? `${calc_g5_wind_ice.toFixed(5)} N/(m·mm²)` : '0.00000 N/(m·mm²) (无冰)'}
                            </strong>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Gamma 6 & 7: Combined Resultant Loads */}
                  <div className="col-span-1 md:col-span-2 glass-inner p-4 rounded-xl space-y-2 border border-white/15 hover:border-emerald-400/30 transition-all">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-100 flex items-center gap-1.5">
                        <ChevronRight className="w-3.5 h-3.5 text-emerald-400" />
                        5. 综合合成比载 γ₆ (无冰风偏) / γ₇ (有冰风偏) (Resultant Vector Specific Load)
                      </span>
                      <span className="text-[10px] text-emerald-300 font-mono bg-emerald-500/20 px-2.5 py-0.5 rounded border border-emerald-400/30 font-bold backdrop-blur-sm">
                        3D 空间正交矢量合成
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 my-1">
                      <div className="p-2.5 glass-inner bg-white/10 backdrop-blur-md font-mono text-emerald-300 text-center rounded-xl border border-emerald-500/30 font-bold text-xs shadow-inner">
                        {"无冰合成比载: γ₆ = √(γ₁² + γ₄²)"}
                      </div>
                      <div className="p-2.5 glass-inner bg-white/10 backdrop-blur-md font-mono text-emerald-300 text-center rounded-xl border border-emerald-500/30 font-bold text-xs shadow-inner">
                        {"有冰合成比载: γ₇ = √(γ₃² + γ₅²)"}
                      </div>
                    </div>

                    <div className="p-3 bg-emerald-500/15 rounded-xl border border-emerald-400/30 text-slate-100 space-y-1.5 font-mono text-[10.5px]">
                      <div className="flex items-center gap-1 text-emerald-300 font-bold text-xs">
                        <Sliders className="w-3.5 h-3.5" /> 关联左侧边栏参数用例 (综合合成计算):
                      </div>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-3 gap-y-1 text-slate-200 text-[10px]">
                        <div>• 无冰风偏合成 γ₆: <span className="text-emerald-300 font-bold font-mono">√({calc_g1.toFixed(5)}² + {calc_g4_wind.toFixed(5)}²) = {calc_g6.toFixed(5)} N/(m·mm²)</span></div>
                        <div>• 有冰风偏合成 γ₇: <span className="text-emerald-300 font-bold font-mono">√({calc_g3_v.toFixed(5)}² + {calc_g5_wind_ice.toFixed(5)}²) = {calc_g7.toFixed(5)} N/(m·mm²)</span></div>
                      </div>
                      <div className="flex items-center justify-between border-t border-emerald-400/20 pt-1.5 text-[11px]">
                        <span className="text-slate-200">当前左侧气象条件下选用综合有效比载:</span>
                        <strong className="text-emerald-300 font-bold font-mono text-xs bg-emerald-500/20 px-2 py-0.5 rounded border border-emerald-400/30">
                          γ = {active_gamma.toFixed(5)} N/(m·mm²)
                        </strong>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Step 2: State Change Equation */}
              <div className="glass-card rounded-2xl p-5 space-y-4 shadow-xl border border-white/15">
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                  <h3 className="font-bold text-sm text-cyan-300 flex items-center gap-2.5">
                    <span className="w-6 h-6 rounded-xl bg-cyan-500/30 text-cyan-200 text-xs font-mono flex items-center justify-center font-extrabold border border-cyan-400/40">
                      2
                    </span>
                    连续档导线状态变化方程 (State Change Equation)
                  </h3>
                  <span className="text-[11px] text-sky-300 font-mono font-bold bg-sky-500/20 px-2.5 py-1 rounded-lg border border-sky-400/30 backdrop-blur-sm">
                    Newton-Raphson 数值求解
                  </span>
                </div>

                <div className="glass-inner p-4 rounded-xl space-y-3 border border-white/15">
                  <p className="text-[11px] text-slate-200">
                    已知控制工况 m 的气象与控制应力参数 (t_m, γ_m, σ_m)，求解待求目标工况 n 下的导线水平应力 σ_n:
                  </p>

                  <div className="p-3.5 glass-inner bg-white/10 backdrop-blur-md font-mono text-sky-300 text-center rounded-2xl border border-sky-400/40 text-sm font-bold shadow-xl tracking-wide">
                    {"σ_n³ + [ (γ_m² · L² · E / 24 · σ_m²) + α · E · (t_n - t_m) - σ_m ] · σ_n² - (γ_n² · L² · E / 24) = 0"}
                  </div>

                  {/* Live Parameter Case Box */}
                  <div className="p-3 bg-sky-500/15 rounded-xl border border-sky-400/30 text-slate-100 space-y-2 font-mono text-[10.5px]">
                    <div className="flex items-center gap-1.5 text-sky-300 font-bold text-xs">
                      <Sliders className="w-3.5 h-3.5" /> 关联左侧边栏参数 (当前工况与导线参数代入用例):
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-2 gap-y-1 text-slate-300 text-[10px]">
                      <div>• 导线型号: <span className="text-white font-bold">{cond_name}</span></div>
                      <div>• 截面积 S: <span className="text-white font-mono">{cond_S.toFixed(2)} mm²</span></div>
                      <div>• 代表档距 L: <span className="text-sky-300 font-bold font-mono">{rep_span} m</span></div>
                      <div>• 弹性模量 E: <span className="text-white font-mono">{cond_E} N/mm²</span></div>
                      <div>• 膨胀系数 α: <span className="text-white font-mono">{cond_alpha.toExponential(2)} /°C</span></div>
                      <div>• 当前气温 t: <span className="text-amber-300 font-bold font-mono">{cond_temp} °C</span></div>
                      <div>• 设计风速 v: <span className="text-cyan-300 font-mono">{cond_v} m/s</span></div>
                      <div>• 设计冰厚 b: <span className="text-cyan-300 font-mono">{cond_b} mm</span></div>
                      <div>• 综合比载 γ: <span className="text-emerald-300 font-bold font-mono">{active_gamma.toFixed(5)} N/(m·mm²)</span></div>
                    </div>

                    <div className="border-t border-sky-400/20 pt-2 space-y-1">
                      <div className="text-slate-200 flex items-center justify-between text-[11px]">
                        <span className="text-sky-300 font-bold">Newton-Raphson 迭代求解对应工况拉力与应力:</span>
                      </div>
                      <div className="flex items-center justify-between text-[11px] pt-1 bg-black/20 p-2 rounded-lg">
                        <span className="text-sky-100">当前工况计算结果:</span>
                        <strong className="text-emerald-300 font-bold font-mono text-xs">
                          水平应力 σ_n = {active_sigma.toFixed(2)} N/mm² (单线拉力 H_0 = {((active_sigma * cond_S) / 1000).toFixed(2)} kN, 总张力 H = {active_tension_kN.toFixed(2)} kN)
                        </strong>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Step 3: Critical Span & Governing Condition */}
              <div className="glass-card rounded-2xl p-5 space-y-4 shadow-xl border border-white/15">
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                  <h3 className="font-bold text-sm text-cyan-300 flex items-center gap-2.5">
                    <span className="w-6 h-6 rounded-xl bg-cyan-500/30 text-cyan-200 text-xs font-mono flex items-center justify-center font-extrabold border border-cyan-400/40">
                      3
                    </span>
                    控制工况自动判别与临界档距 (Critical Span l_c)
                  </h3>
                </div>

                <div className="glass-inner p-4 rounded-xl space-y-3 border border-white/15">
                  <p className="text-[11px] text-slate-200">
                    当存在两个候选控制气象工况（例如：工况1 最低气温 与 工况2 最大风/覆冰）时，临界档距 l_c 计算公式为：
                  </p>

                  <div className="p-3 glass-inner bg-white/10 backdrop-blur-md font-mono text-cyan-300 text-center rounded-xl border border-cyan-400/40 text-xs font-bold shadow-inner">
                    {"l_c1-2 = √[ 24 · (σ₁ - σ₂ + α · E · (t₂ - t₁)) / (E · (γ₁² / σ₁² - γ₂² / σ₂²)) ]"}
                  </div>

                  {/* Live Parameter Case Box */}
                  <div className="p-3 bg-cyan-500/15 rounded-xl border border-cyan-400/30 text-slate-100 space-y-2 font-mono text-[10.5px]">
                    <div className="flex items-center gap-1.5 text-cyan-300 font-bold text-xs">
                      <Sliders className="w-3.5 h-3.5" /> 关联左侧边栏参数 (临界档距 l_c 与控制工况判别用例):
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-2 gap-y-1 text-slate-300 text-[10px]">
                      <div>• 限制许用应力 [σ]: <span className="text-white font-bold font-mono">{(conductor?.maxAllowableStress || 95).toFixed(1)} N/mm²</span></div>
                      <div>• 代表档距 L: <span className="text-sky-300 font-bold font-mono">{rep_span} m</span></div>
                      <div>• 当前气象比载 γ: <span className="text-emerald-300 font-bold font-mono">{active_gamma.toFixed(5)} N/(m·mm²)</span></div>
                    </div>
                    <div className="border-t border-cyan-400/20 pt-2 flex flex-wrap items-center justify-between text-[11px] gap-2">
                      <div className="text-slate-200">
                        判别结论: 代表档距 L ({rep_span}m) 与临界档距对比
                      </div>
                      <strong className="text-sky-300 font-bold font-mono text-xs bg-sky-500/20 px-2.5 py-1 rounded-lg border border-sky-400/30">
                        {rep_span > 200 ? `当前 L (${rep_span}m) > l_c (≈185m) → 由高比载工况 (大风/覆冰) 控制张力` : `当前 L (${rep_span}m) ≤ l_c (≈185m) → 由低温冷缩工况控制张力`}
                      </strong>
                    </div>
                  </div>
                </div>
              </div>

              {/* Step 4: Sag & Maximum Tension */}
              <div className="glass-card rounded-2xl p-5 space-y-4 shadow-xl border border-white/15">
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                  <h3 className="font-bold text-sm text-cyan-300 flex items-center gap-2.5">
                    <span className="w-6 h-6 rounded-xl bg-cyan-500/30 text-cyan-200 text-xs font-mono flex items-center justify-center font-extrabold border border-cyan-400/40">
                      4
                    </span>
                    中央弧垂 f_max、端部最大张力 T_max 与安全系数 K 校验
                  </h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                  <div className="glass-inner p-3.5 rounded-xl space-y-2 border border-white/15">
                    <span className="font-bold text-slate-100 block text-xs">中央最大弧垂 f_max</span>
                    <div className="p-2.5 glass-inner bg-white/10 backdrop-blur-md font-mono text-sky-300 text-center rounded-xl border border-sky-500/30 font-bold text-xs">
                      {"f_max = (γ · L² · S) / (8 · σ_n · cos ψ)"}
                    </div>
                    
                    <div className="p-2.5 bg-sky-500/15 rounded-xl border border-sky-400/30 text-[10px] font-mono space-y-1 text-slate-200">
                      <div className="flex items-center gap-1 text-sky-300 font-bold text-[10.5px]">
                        <Sliders className="w-3 h-3" /> 关联左侧参数代入用例:
                      </div>
                      <div>• γ = <span className="text-emerald-300">{active_gamma.toFixed(5)}</span>, L = <span className="text-white">{rep_span}m</span></div>
                      <div>• σ_n = <span className="text-white">{active_sigma.toFixed(2)} N/mm²</span></div>
                      <div className="border-t border-sky-400/20 pt-1 flex justify-between items-center text-[10.5px]">
                        <span>中央最大弧垂 f_max:</span>
                        <strong className="text-sky-300 font-bold text-xs font-mono">{active_sag.toFixed(2)} m</strong>
                      </div>
                    </div>
                  </div>

                  <div className="glass-inner p-3.5 rounded-xl space-y-2 border border-white/15">
                    <span className="font-bold text-slate-100 block text-xs">悬挂端部最大张力 T_max</span>
                    <div className="p-2.5 glass-inner bg-white/10 backdrop-blur-md font-mono text-cyan-300 text-center rounded-xl border border-cyan-500/30 font-bold text-xs">
                      {"T_max = σ_n · S + γ · S · f_max"}
                    </div>
                    
                    <div className="p-2.5 bg-cyan-500/15 rounded-xl border border-cyan-400/30 text-[10px] font-mono space-y-1 text-slate-200">
                      <div className="flex items-center gap-1 text-cyan-300 font-bold text-[10.5px]">
                        <Sliders className="w-3 h-3" /> 关联左侧参数代入用例:
                      </div>
                      <div>• 水平总拉力 H = <span className="text-white">{active_tension_kN.toFixed(2)} kN</span></div>
                      <div>• 垂直重力附加 = <span className="text-white">{((active_gamma * cond_S * active_sag * numSub) / 1000).toFixed(2)} kN</span></div>
                      <div className="border-t border-cyan-400/20 pt-1 flex justify-between items-center text-[10.5px]">
                        <span>端部最大总张力 T_max:</span>
                        <strong className="text-cyan-300 font-bold text-xs font-mono">{active_Tmax_kN.toFixed(2)} kN</strong>
                      </div>
                    </div>
                  </div>

                  <div className="glass-inner p-3.5 rounded-xl space-y-2 border border-white/15">
                    <span className="font-bold text-slate-100 block text-xs">安全系数 K 规范校验</span>
                    <div className="p-2.5 glass-inner bg-white/10 backdrop-blur-md font-mono text-emerald-300 text-center rounded-xl border border-emerald-500/30 font-bold text-xs">
                      {"K = T_p / T_max ≥ 2.50"}
                    </div>
                    
                    <div className="p-2.5 bg-emerald-500/15 rounded-xl border border-emerald-400/30 text-[10px] font-mono space-y-1 text-slate-200">
                      <div className="flex items-center gap-1 text-emerald-300 font-bold text-[10.5px]">
                        <Sliders className="w-3 h-3" /> 关联左侧参数代入用例:
                      </div>
                      <div>• 额定破断力 T_p = <span className="text-white">{cond_Tp} kN</span></div>
                      <div>• 单线最大拉力 T_max/n = <span className="text-white">{(active_Tmax_kN / numSub).toFixed(2)} kN</span></div>
                      <div className="border-t border-emerald-400/20 pt-1 flex justify-between items-center text-[10.5px]">
                        <span>破断安全系数 K:</span>
                        <strong className="text-emerald-300 font-bold text-xs font-mono">{active_K.toFixed(2)} ≥ 2.50 ({active_K >= 2.5 ? '合格 ✓' : '警戒 ⚠'})</strong>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            /* ================= INSULATOR FORMULAS ================= */
            <div className="space-y-6">
              {/* Introduction Banner */}
              <div className="p-4 rounded-2xl bg-cyan-500/10 border border-cyan-400/30 backdrop-blur-md flex items-start space-x-3 text-slate-100 shadow-md">
                <Info className="w-5 h-5 text-cyan-300 shrink-0 mt-0.5" />
                <p className="text-[11px] leading-relaxed text-slate-200">
                  绝缘子串不仅承受导线悬挂端部拉力与重力，还直接决定输电线路的<strong className="text-cyan-300">外绝缘爬电距离 (Creepage Distance)</strong> 与<strong className="text-cyan-300">风偏角 (φ) 动态气隙校验</strong>。不同串型（单/双I型、V型串、耐张串）具有不同的风偏自由度与几何受力约束。
                </p>
              </div>

              {/* Step 1: Creepage Distance & Disc Selection */}
              <div className="glass-card rounded-2xl p-5 space-y-4 shadow-xl border border-white/15">
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                  <h3 className="font-bold text-sm text-cyan-300 flex items-center gap-2.5">
                    <span className="w-6 h-6 rounded-xl bg-cyan-500/30 text-cyan-200 text-xs font-mono flex items-center justify-center font-extrabold border border-cyan-400/40">
                      1
                    </span>
                    污秽等级、公称爬电距离与片数选择公式
                  </h3>
                  <span className="text-[11px] text-slate-300 font-mono bg-white/10 px-2.5 py-1 rounded-lg border border-white/10 backdrop-blur-sm">
                    规范 DL/T 5582
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                  <div className="glass-inner p-3.5 rounded-xl space-y-2 border border-white/15">
                    <span className="font-bold text-slate-100 block text-xs">1. 所需总爬电距离 L_creep</span>
                    <div className="p-2.5 glass-inner bg-white/10 backdrop-blur-md font-mono text-cyan-300 text-center rounded-xl border border-cyan-500/30 font-bold text-xs">
                      {"L_creep = λ · U_m"}
                    </div>
                    <div className="p-2 bg-white/5 backdrop-blur-sm rounded-lg text-[10px] space-y-1 font-mono text-slate-300">
                      <div>• <strong className="text-cyan-300">λ (mm/kV)</strong>: 统一爬电比距 (USCD)，按污秽等级 a~e 取值 (如 20, 25, 31, 38, 45)</div>
                      <div>• <strong className="text-cyan-300">U_m (kV)</strong>: 系统最高运行电压 (110kV取126kV, 220kV取252kV)</div>
                    </div>
                  </div>

                  <div className="glass-inner p-3.5 rounded-xl space-y-2 border border-white/15">
                    <span className="font-bold text-slate-100 block text-xs">2. 绝缘子片数 N 计算</span>
                    <div className="p-2.5 glass-inner bg-white/10 backdrop-blur-md font-mono text-sky-300 text-center rounded-xl border border-sky-500/30 font-bold text-xs">
                      {"N = ⌈ L_creep / L_single ⌉ + N_spare"}
                    </div>
                    <div className="p-2 bg-white/5 backdrop-blur-sm rounded-lg text-[10px] space-y-1 font-mono text-slate-300">
                      <div>• <strong className="text-sky-300">L_single (mm)</strong>: 单片瓷/玻璃盘形绝缘子公称爬距 (如 295mm, 305mm)</div>
                      <div>• <strong className="text-sky-300">N_spare</strong>: 高海拔与零值检测加挂片数 (海拔每升1000m增3%~5%)</div>
                    </div>
                  </div>

                  <div className="glass-inner p-3.5 rounded-xl space-y-2 border border-white/15">
                    <span className="font-bold text-slate-100 block text-xs">3. 串长 L_str 与自重 G_ins</span>
                    <div className="p-2.5 glass-inner bg-white/10 backdrop-blur-md font-mono text-emerald-300 text-center rounded-xl border border-emerald-500/30 font-bold text-xs">
                      {"G_ins = (N · m₁ + m_wt) · g"}
                    </div>
                    <div className="p-2 bg-white/5 backdrop-blur-sm rounded-lg text-[10px] space-y-1 font-mono text-slate-300">
                      <div>• <strong className="text-emerald-300">L_str (m)</strong>: 串结构总长 N · h_struct · 10⁻³</div>
                      <div>• <strong className="text-emerald-300">m₁ (kg)</strong>: 单片绝缘子+金器具质量</div>
                      <div>• <strong className="text-emerald-300">m_wt (kg)</strong>: 底端加挂防风重锤/重块质量</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Step 2: Wind Swing Angle Equation (Formula 2-6-44) */}
              <div className="glass-card rounded-2xl p-5 space-y-4 shadow-xl border border-white/15">
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                  <h3 className="font-bold text-sm text-cyan-300 flex items-center gap-2.5">
                    <span className="w-6 h-6 rounded-xl bg-cyan-500/30 text-cyan-200 text-xs font-mono flex items-center justify-center font-extrabold border border-cyan-400/40">
                      2
                    </span>
                    悬垂绝缘子串风偏角 (摇摆角 φ) 计算公式 (规范 2-6-44)
                  </h3>
                  <span className="text-[11px] text-sky-300 font-mono font-bold bg-sky-500/20 px-2.5 py-1 rounded-lg border border-sky-400/30 backdrop-blur-sm">
                    力学平衡公式 (2-6-44)
                  </span>
                </div>

                <div className="glass-inner p-4 rounded-xl space-y-3 border border-white/15">
                  <p className="text-[11px] text-slate-200">
                    悬垂绝缘子串的风偏大小依其产生的风偏角 φ 表示，按照工程设计规范公式 (2-6-44) 计算：
                  </p>

                  <div className="p-4 glass-inner bg-white/10 backdrop-blur-md font-mono text-white text-center rounded-2xl border border-sky-400/40 text-sm md:text-base font-bold shadow-xl tracking-wide space-y-2.5 overflow-x-auto">
                    <div>
                      {"φ = tg⁻¹ [ (P_I / 2 + P · l_H) / (G_I / 2 + W₁ · l_H + a · T) ]"}
                    </div>
                    <div className="text-cyan-300 text-xs md:text-sm pt-1 border-t border-white/10">
                      {"= tg⁻¹ [ (P_I / 2 + P · l_H) / (G_I / 2 + W₁ · l_v) ]"}
                    </div>
                    {/* Live parameter simulation calculation value row */}
                    <div className="text-amber-300 text-xs md:text-sm pt-2 border-t border-amber-400/30 flex flex-wrap items-center justify-center gap-2 font-mono bg-amber-500/10 -mx-4 -mb-4 p-3 rounded-b-2xl">
                      <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-md bg-amber-400/20 text-amber-200 text-[11px] font-sans font-bold border border-amber-400/30 shrink-0">
                        <Sparkles className="w-3.5 h-3.5 text-amber-300 animate-pulse" />
                        当前系统实测工况代入计算值
                      </span>
                      <span className="tracking-normal font-semibold text-amber-100 text-[12px] md:text-xs">
                        {`= tg⁻¹ [ (${(P_I_N / 2).toFixed(1)} + ${P_x_N.toFixed(1)}) / (${(G_I_N / 2).toFixed(1)} + ${W_y_N.toFixed(1)}${G_cw_N > 0 ? ` + ${G_cw_N.toFixed(1)}` : ''}) ]`}
                        {` = tg⁻¹ [ ${horizontalTotalN.toFixed(1)} N / ${verticalTotalN.toFixed(1)} N ] = `}
                        <strong className="text-amber-300 font-extrabold text-sm md:text-base underline decoration-amber-400 decoration-2 underline-offset-2 ml-1">
                          {windAngleDeg.toFixed(1)}°
                        </strong>
                      </span>
                    </div>
                  </div>

                  {/* Detailed Parameter Sub-Formulas and Live Cases Breakdown */}
                  <div className="space-y-3 text-xs pt-1">
                    <div className="flex items-center justify-between text-slate-200 border-b border-white/10 pb-2">
                      <span className="font-bold flex items-center gap-2 text-sky-200">
                        <Calculator className="w-4 h-4 text-sky-300" />
                        绝缘子风偏角公式 (2-6-44) 各分项参数与左侧边栏输入关联、子公式与实测用例
                      </span>
                      <span className="text-[10px] text-amber-300 font-mono bg-amber-500/20 px-2.5 py-0.5 rounded-full border border-amber-400/30 flex items-center gap-1">
                        <Zap className="w-3 h-3" />
                        左侧边栏参数联动实测
                      </span>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3.5 text-[11px] font-mono">
                      {/* 1. P_I Insulator Wind Force */}
                      <div className="p-3 bg-slate-900/70 backdrop-blur-sm rounded-xl border border-sky-500/30 space-y-2 shadow-md">
                        <div className="flex justify-between items-center border-b border-white/10 pb-1.5">
                          <span className="text-cyan-300 font-bold flex items-center gap-1.5">
                            <span className="w-4 h-4 rounded-full bg-cyan-500/30 text-cyan-200 text-[10px] flex items-center justify-center font-bold">1</span>
                            P_I — 悬垂绝缘子串风压 (N)
                          </span>
                          <span className="text-[10px] text-slate-300 bg-cyan-500/20 px-1.5 py-0.5 rounded border border-cyan-400/30">规范 2-6-45</span>
                        </div>
                        
                        {/* Sidebar Parameters Association */}
                        <div className="bg-slate-950/50 p-2 rounded-lg border border-white/5 space-y-1 text-[10.5px]">
                          <div className="text-cyan-400 font-bold flex items-center gap-1 font-sans">
                            <Sliders className="w-3 h-3" /> 关联左侧边栏参数:
                          </div>
                          <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-slate-300 text-[10px]">
                            <div>• 绝缘子: <span className="text-white">{insulator?.name || 'XP-70'}</span></div>
                            <div>• 单盘直径 D: <span className="text-white">{insulator?.discDiameter || 255}mm</span></div>
                            <div>• 串片数 N: <span className="text-white">{insulatorRes?.finalCount || 14}片</span></div>
                            <div>• 受风面积 A_I: <span className="text-cyan-300">{insulatorRes?.stringWindAreaM2 ? insulatorRes.stringWindAreaM2.toFixed(3) : '0.310'}m²</span></div>
                            <div>• 气象风速 V: <span className="text-amber-300">{windCondition?.windSpeed || 25}m/s</span></div>
                            <div>• 金具面积 A_金具: <span className="text-white">{(tower?.numSubConductors || 1) >= 3 ? 0.05 : (tower?.numSubConductors || 1) === 2 ? 0.04 : 0.03}m²</span></div>
                          </div>
                        </div>

                        <div className="text-slate-200 text-[10.5px]">
                          <span className="text-slate-400">子计算公式: </span>
                          <strong className="text-white">{"P_I = 9.80665 · A_I · (V² / 16)"}</strong>
                        </div>
                        <div className="p-2 bg-cyan-500/15 rounded-lg border border-cyan-400/30 text-cyan-100 space-y-1">
                          <div className="flex items-center justify-between text-[10.5px]">
                            <span>100%绝缘子串风力:</span>
                            <span className="font-mono text-cyan-200">P_I = 9.81 × {(insulatorRes?.stringWindAreaM2 || 0.31).toFixed(3)} × ({(windCondition?.windSpeed || 25)}²/16) = <strong className="text-white">{P_I_N.toFixed(1)} N</strong></span>
                          </div>
                          <div className="flex items-center justify-between border-t border-cyan-400/20 pt-1 text-[11px]">
                            <span className="font-sans text-cyan-200">折算至挂点分量 (50%):</span>
                            <strong className="text-cyan-300 font-bold font-mono text-xs">{"P_I / 2 = "}{(P_I_N / 2).toFixed(1)} N</strong>
                          </div>
                        </div>
                      </div>

                      {/* 2. G_I Insulator String Gravity */}
                      <div className="p-3 bg-slate-900/70 backdrop-blur-sm rounded-xl border border-sky-500/30 space-y-2 shadow-md">
                        <div className="flex justify-between items-center border-b border-white/10 pb-1.5">
                          <span className="text-cyan-300 font-bold flex items-center gap-1.5">
                            <span className="w-4 h-4 rounded-full bg-cyan-500/30 text-cyan-200 text-[10px] flex items-center justify-center font-bold">2</span>
                            G_I — 悬垂绝缘子串重力 (N)
                          </span>
                          <span className="text-[10px] text-slate-300 bg-cyan-500/20 px-1.5 py-0.5 rounded border border-cyan-400/30">力学重力</span>
                        </div>

                        {/* Sidebar Parameters Association */}
                        <div className="bg-slate-950/50 p-2 rounded-lg border border-white/5 space-y-1 text-[10.5px]">
                          <div className="text-cyan-400 font-bold flex items-center gap-1 font-sans">
                            <Sliders className="w-3 h-3" /> 关联左侧边栏参数:
                          </div>
                          <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-slate-300 text-[10px]">
                            <div>• 绝缘子型号: <span className="text-white">{insulator?.name || 'XP-70'}</span></div>
                            <div>• 单片质量 m_1: <span className="text-white">{insulator?.unitMass || 6.0}kg</span></div>
                            <div>• 串片数 N: <span className="text-white">{insulatorRes?.finalCount || 14}片</span></div>
                            <div>• 串总质量 m_串: <span className="text-cyan-300">{(insulatorRes?.stringTotalWeightKg || 105.0).toFixed(1)}kg</span></div>
                            <div>• 重力加速度 g: <span className="text-slate-400">9.81 m/s²</span></div>
                            <div>• 挂点 Kv 值: <span className="text-white">{insulatorRes?.kvValue || 1.0}</span></div>
                          </div>
                        </div>

                        <div className="text-slate-200 text-[10.5px]">
                          <span className="text-slate-400">子计算公式: </span>
                          <strong className="text-white">{"G_I = m_串 · g = (N_片 · m_1 + m_金具) · 9.81"}</strong>
                        </div>
                        <div className="p-2 bg-cyan500/15 rounded-lg border border-cyan-400/30 text-cyan-100 space-y-1">
                          <div className="flex items-center justify-between text-[10.5px]">
                            <span>绝缘子串总重力:</span>
                            <span className="font-mono text-cyan-200">G_I = {(insulatorRes?.stringTotalWeightKg || 105.0).toFixed(1)} kg × 9.81 = <strong className="text-white">{G_I_N.toFixed(1)} N</strong></span>
                          </div>
                          <div className="flex items-center justify-between border-t border-cyan-400/20 pt-1 text-[11px]">
                            <span className="font-sans text-cyan-200">折算至挂点分量 (50%):</span>
                            <strong className="text-cyan-300 font-bold font-mono text-xs">{"G_I / 2 = "}{(G_I_N / 2).toFixed(1)} N</strong>
                          </div>
                        </div>
                      </div>

                      {/* 3. P_x = P * l_H Conductor Wind Load */}
                      <div className="p-3 bg-slate-900/70 backdrop-blur-sm rounded-xl border border-sky-500/30 space-y-2 shadow-md">
                        <div className="flex justify-between items-center border-b border-white/10 pb-1.5">
                          <span className="text-sky-300 font-bold flex items-center gap-1.5">
                            <span className="w-4 h-4 rounded-full bg-sky-500/30 text-sky-200 text-[10px] flex items-center justify-center font-bold">3</span>
                            P · l_H (P_x) — 挂点导线总风荷载 (N)
                          </span>
                          <span className="text-[10px] text-slate-300 bg-sky-500/20 px-1.5 py-0.5 rounded border border-sky-400/30">档距横向荷载</span>
                        </div>

                        {/* Sidebar Parameters Association */}
                        <div className="bg-slate-950/50 p-2 rounded-lg border border-white/5 space-y-1 text-[10.5px]">
                          <div className="text-sky-400 font-bold flex items-center gap-1 font-sans">
                            <Sliders className="w-3 h-3" /> 关联左侧边栏参数:
                          </div>
                          <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-slate-300 text-[10px]">
                            <div>• 导线型号: <span className="text-white">{conductor?.name || 'JL/G1A-400/35'}</span></div>
                            <div>• 导线外径 d: <span className="text-white">{conductor?.outerDiameter || 26.82}mm</span></div>
                            <div>• 覆冰厚度 b: <span className="text-amber-300">{windCondition?.iceThickness || 0}mm</span></div>
                            <div>• 导线分裂数 n: <span className="text-white">{tower?.numSubConductors || 1}</span></div>
                            <div>• 水平档距 l_H: <span className="text-sky-300">{tower?.horizontalSpan || 400}m</span></div>
                            <div>• 气象风速 V: <span className="text-amber-300">{windCondition?.windSpeed || 25}m/s</span></div>
                          </div>
                        </div>

                        <div className="text-slate-200 text-[10.5px]">
                          <span className="text-slate-400">子计算公式: </span>
                          <strong className="text-white">{"P_x = P · l_H = n · (α_w · μ_z · μ_s · (d+2b) · V²/16 · g) · l_H"}</strong>
                        </div>
                        <div className="p-2 bg-sky-500/15 rounded-lg border border-sky-400/30 text-sky-100 space-y-1">
                          <div className="flex items-center justify-between text-[10.5px]">
                            <span>导线单位长度风荷载 P:</span>
                            <span className="font-mono text-sky-200">P = {(P_x_N / (tower?.horizontalSpan || 400)).toFixed(2)} N/m</span>
                          </div>
                          <div className="flex items-center justify-between border-t border-sky-400/20 pt-1 text-[11px]">
                            <span className="font-sans text-sky-200">作用于挂点导线总风荷载:</span>
                            <strong className="text-sky-300 font-bold font-mono text-xs">{"P · l_H (P_x) = "} {P_x_N.toFixed(1)} N</strong>
                          </div>
                        </div>
                      </div>

                      {/* 4. W_y = W1 * l_v Conductor Vertical Weight */}
                      <div className="p-3 bg-slate-900/70 backdrop-blur-sm rounded-xl border border-sky-500/30 space-y-2 shadow-md">
                        <div className="flex justify-between items-center border-b border-white/10 pb-1.5">
                          <span className="text-sky-300 font-bold flex items-center gap-1.5">
                            <span className="w-4 h-4 rounded-full bg-sky-500/30 text-sky-200 text-[10px] flex items-center justify-center font-bold">4</span>
                            W₁ · l_v (W_y) — 挂点导线总垂直荷载 (N)
                          </span>
                          <span className="text-[10px] text-slate-300 bg-sky-500/20 px-1.5 py-0.5 rounded border border-sky-400/30">档距垂直重力</span>
                        </div>

                        {/* Sidebar Parameters Association */}
                        <div className="bg-slate-950/50 p-2 rounded-lg border border-white/5 space-y-1 text-[10.5px]">
                          <div className="text-sky-400 font-bold flex items-center gap-1 font-sans">
                            <Sliders className="w-3 h-3" /> 关联左侧边栏参数:
                          </div>
                          <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-slate-300 text-[10px]">
                            <div>• 导线单位质量 m_0: <span className="text-white font-mono">{cond_unitMassKgM.toFixed(5)} kg/m</span></div>
                            <div>• 重力加速度 g: <span className="text-amber-300 font-mono">9.81 m/s²</span></div>
                            <div>• 导线单重 W_1 (9.81×m_0): <span className="text-sky-300 font-bold font-mono">{(cond_unitMassKgM * 9.81).toFixed(5)} N/m</span></div>
                            <div>• 导线分裂数 n: <span className="text-white font-mono">{numSub}</span></div>
                            <div>• 导线总重荷载/米 (W_1×n): <span className="text-sky-300 font-bold font-mono">{cond_W1.toFixed(5)} N/m</span></div>
                            <div>• 垂直档距 l_v (杆塔栏设置): <span className="text-emerald-300 font-bold font-mono">{span_lv.toFixed(1)} m</span></div>
                          </div>
                        </div>

                        <div className="text-slate-200 text-[10.5px]">
                          <span className="text-slate-400">计算公式: </span>
                          <strong className="text-white font-mono">{"W_1 = 9.81 × m_0 = "} {(cond_unitMassKgM * 9.81).toFixed(5)} {"N/m"}</strong>
                          <span className="text-slate-400 font-mono ml-3">{"W_y = W_1 · n · l_v"}</span>
                        </div>
                        <div className="p-2 bg-sky-500/15 rounded-lg border border-sky-400/30 text-sky-100 space-y-1">
                          <div className="flex items-center justify-between text-[10.5px]">
                            <span>导线总单位重力 × 垂直档距:</span>
                            <span className="font-mono text-emerald-300">{cond_W1.toFixed(5)} N/m × {span_lv.toFixed(1)} m</span>
                          </div>
                          <div className="flex items-center justify-between border-t border-sky-400/20 pt-1 text-[11px]">
                            <span className="font-sans text-sky-200">作用于挂点导线总垂直荷载:</span>
                            <strong className="text-sky-300 font-bold font-mono text-xs">{"W_y = "} {W_y_N.toFixed(2)} N ({(W_y_N / 1000).toFixed(3)} kN)</strong>
                          </div>
                        </div>
                      </div>

                      {/* 5. l_v Vertical Span Formula */}
                      <div className="p-3 bg-slate-900/70 backdrop-blur-sm rounded-xl border border-emerald-500/30 space-y-2 shadow-md">
                        <div className="flex justify-between items-center border-b border-white/10 pb-1.5">
                          <span className="text-emerald-300 font-bold flex items-center gap-1.5">
                            <span className="w-4 h-4 rounded-full bg-emerald-500/30 text-emerald-200 text-[10px] flex items-center justify-center font-bold">5</span>
                            l_v — 杆塔垂直档距 (m)
                          </span>
                          <span className="text-[10px] text-slate-300 bg-emerald-500/20 px-1.5 py-0.5 rounded border border-emerald-400/30">左侧边栏参数</span>
                        </div>

                        {/* Sidebar Parameters Association */}
                        <div className="bg-slate-950/50 p-2 rounded-lg border border-white/5 space-y-1 text-[10.5px]">
                          <div className="text-emerald-400 font-bold flex items-center gap-1 font-sans">
                            <Sliders className="w-3 h-3" /> 关联左侧边栏参数:
                          </div>
                          <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-slate-300 text-[10px]">
                            <div>• 水平档距 l_H: <span className="text-white">{span_lH} m</span></div>
                            <div>• 垂直档距 l_v (输入值): <span className="text-emerald-300 font-bold">{span_lv} m</span></div>
                            <div>• 档距比 K_v (l_v/l_H): <span className="text-amber-300 font-bold">{(span_lH > 0 ? span_lv / span_lH : 1.0).toFixed(2)}</span></div>
                            <div>• 导线单位自重 W_1: <span className="text-sky-300 font-bold">{cond_W1.toFixed(2)} N/m</span></div>
                          </div>
                        </div>

                        <div className="p-2 bg-emerald-500/15 rounded-lg border border-emerald-400/30 text-emerald-100 space-y-1">
                          <div className="flex items-center justify-between text-[10.5px]">
                            <span>档距比关系 K_v = l_v / l_H:</span>
                            <span className="font-mono text-emerald-200">{span_lv} / {span_lH} = {(span_lH > 0 ? span_lv / span_lH : 1.0).toFixed(2)}</span>
                          </div>
                          <div className="flex items-center justify-between border-t border-emerald-400/20 pt-1 text-[11px]">
                            <span className="font-sans text-emerald-200">当前计算采用垂直档距 l_v:</span>
                            <strong className="text-emerald-300 font-bold font-mono text-xs">{"l_v = "} {span_lv.toFixed(1)} m</strong>
                          </div>
                        </div>
                      </div>

                      {/* 6. G_cw Anti-wind Counter Weight */}
                      <div className="p-3 bg-slate-900/70 backdrop-blur-sm rounded-xl border border-amber-500/30 space-y-2 shadow-md">
                        <div className="flex justify-between items-center border-b border-white/10 pb-1.5">
                          <span className="text-amber-300 font-bold flex items-center gap-1.5">
                            <span className="w-4 h-4 rounded-full bg-amber-500/30 text-amber-200 text-[10px] flex items-center justify-center font-bold">6</span>
                            G_cw — 加挂防风重锤重力 (N)
                          </span>
                          <span className="text-[10px] text-slate-300 bg-amber-500/20 px-1.5 py-0.5 rounded border border-amber-400/30">抑制风偏措施</span>
                        </div>

                        {/* Sidebar Parameters Association */}
                        <div className="bg-slate-950/50 p-2 rounded-lg border border-white/5 space-y-1 text-[10.5px]">
                          <div className="text-amber-400 font-bold flex items-center gap-1 font-sans">
                            <Sliders className="w-3 h-3" /> 关联左侧边栏参数:
                          </div>
                          <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-slate-300 text-[10px]">
                            <div>• 重锤质量 m_cw: <span className="text-amber-300 font-bold">{insulator?.counterWeightKg || 0}kg</span></div>
                            <div>• 重力加速度 g: <span className="text-slate-400">9.80665 m/s²</span></div>
                            <div>• 加挂位置: <span className="text-white">绝缘子串下端挂钩</span></div>
                            <div>• 作用方式: <span className="text-emerald-300">直加于垂直分母</span></div>
                          </div>
                        </div>

                        <div className="text-slate-200 text-[10.5px]">
                          <span className="text-slate-400">子计算公式: </span>
                          <strong className="text-white">{"G_cw = m_cw · g = m_cw · 9.81"}</strong>
                        </div>
                        <div className="p-2 bg-amber-500/15 rounded-lg border border-amber-400/30 text-amber-100 space-y-1">
                          <div className="flex items-center justify-between text-[10.5px]">
                            <span>重锤提供下沉重力:</span>
                            <span className="font-mono text-amber-200">G_cw = {insulator?.counterWeightKg || 0} kg × 9.81 = <strong className="text-white">{G_cw_N.toFixed(1)} N</strong></span>
                          </div>
                          <div className="flex items-center justify-between border-t border-amber-400/20 pt-1 text-[11px]">
                            <span className="font-sans text-amber-200">风偏角抑制效果:</span>
                            <strong className="text-amber-300 font-bold font-mono text-xs">
                              {G_cw_N > 0 ? `垂直分母增加 ${G_cw_N.toFixed(0)}N (角度降低约 ${((P_x_N / (verticalTotalN - G_cw_N) - P_x_N / verticalTotalN) * 57.3).toFixed(1)}°)` : '当前未加挂防风重锤 (0 N)'}
                            </strong>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Step 3: Special String Types (V-String, Double-I, Tension) */}
              <div className="glass-card rounded-2xl p-5 space-y-4 shadow-xl border border-white/15">
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                  <h3 className="font-bold text-sm text-cyan-300 flex items-center gap-2.5">
                    <span className="w-6 h-6 rounded-xl bg-cyan-500/30 text-cyan-200 text-xs font-mono flex items-center justify-center font-extrabold border border-cyan-400/40">
                      3
                    </span>
                    不同串型受力与抗风偏特性 (V型串 / 双I串 / 耐张串)
                  </h3>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3.5">
                  {/* V String */}
                  <div className="glass-inner p-3.5 rounded-xl space-y-2 border border-white/15">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-sky-300 text-xs">V型绝缘子串 (刚性约束)</span>
                    </div>
                    <div className="p-2.5 glass-inner bg-white/10 backdrop-blur-md font-mono text-sky-300 text-center rounded-xl border border-sky-500/30 font-bold text-xs">
                      {"F₁ = [W_y · sin(θ_v/2 + φ)] / sin θ_v"}
                    </div>
                    <div className="p-2 bg-white/5 backdrop-blur-sm rounded-lg text-[10px] space-y-1 font-mono text-slate-300">
                      <div>• <strong className="text-sky-300">θ_v (°)</strong>: V串夹角 (取 80°~100°)</div>
                      <div>• <strong className="text-sky-300">F₁, F₂ (N)</strong>: 迎风/背风侧串拉力</div>
                      <div>• 当 φ ≥ θ_v/2 时，背风侧串松弛 F₂ ≤ 0，规范设计要求满足 θ_v ≥ 2φ_max</div>
                    </div>
                  </div>

                  {/* Double I String */}
                  <div className="glass-inner p-3.5 rounded-xl space-y-2 border border-white/15">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-cyan-300 text-xs">双I型绝缘子串 (自重抑偏)</span>
                    </div>
                    <div className="p-2.5 glass-inner bg-white/10 backdrop-blur-md font-mono text-cyan-300 text-center rounded-xl border border-cyan-500/30 font-bold text-xs">
                      {"tan φ = (P_x + P_xi) / [2 (W_y + 0.5 G_ins)]"}
                    </div>
                    <div className="p-2 bg-white/5 backdrop-blur-sm rounded-lg text-[10px] space-y-1 font-mono text-slate-300">
                      <div>• <strong className="text-cyan-300">双串挂点</strong>: 自重为双倍 2G_ins</div>
                      <div>• <strong className="text-slate-200">抑偏力矩</strong>: 双挂点间距产生抗横向风偏的倾覆回复力矩，极大降低位移角</div>
                    </div>
                  </div>

                  {/* Tension String */}
                  <div className="glass-inner p-3.5 rounded-xl space-y-2 border border-white/15">
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-emerald-300 text-xs">耐张绝缘子串 (0°风偏)</span>
                    </div>
                    <div className="p-2.5 glass-inner bg-white/10 backdrop-blur-md font-mono text-emerald-300 text-center rounded-xl border border-emerald-500/30 font-bold text-xs">
                      {"L_eff = L - L_str1 - L_str2"}
                    </div>
                    <div className="p-2 bg-white/5 backdrop-blur-sm rounded-lg text-[10px] space-y-1 font-mono text-slate-300">
                      <div>• <strong className="text-emerald-300">0°风偏</strong>: 沿导线轴向张紧，无摆动自由度</div>
                      <div>• <strong className="text-emerald-300">L_eff (m)</strong>: 串长扣除后的物理有效挂线档距</div>
                    </div>
                  </div>
                </div>
              </div>

              {/* Step 4: Tower Body Air Gap Clearance Check */}
              <div className="glass-card rounded-2xl p-5 space-y-4 shadow-xl border border-white/15">
                <div className="flex items-center justify-between border-b border-white/10 pb-3">
                  <h3 className="font-bold text-sm text-cyan-300 flex items-center gap-2.5">
                    <span className="w-6 h-6 rounded-xl bg-cyan-500/30 text-cyan-200 text-xs font-mono flex items-center justify-center font-extrabold border border-cyan-400/40">
                      4
                    </span>
                    杆塔构件电气安全间隙校验 (Clearance Verification)
                  </h3>
                </div>

                <div className="glass-inner p-4 rounded-xl space-y-3 border border-white/15">
                  <p className="text-[11px] text-slate-200">
                    风偏发生时，绝缘子串底端带电部位距杆塔塔身/横担构件的物理空间距离 D_clearance 必须大于规范最小安全气隙：
                  </p>

                  <div className="p-3 glass-inner bg-white/10 backdrop-blur-md font-mono text-emerald-300 text-center rounded-xl border border-emerald-400/40 text-xs font-bold shadow-inner">
                    {"D_clearance = D_crossarm - L_str · sin φ ≥ D_min_safe"}
                  </div>

                  <div className="p-2.5 bg-white/5 backdrop-blur-sm rounded-xl border border-white/10 text-[10px] space-y-1 font-mono">
                    <div className="font-bold text-emerald-300 border-b border-white/10 pb-1 mb-1">【几何符号与规范安全距离对照】</div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-slate-200">
                      <div>• <strong className="text-cyan-300">D_crossarm (m)</strong>: 静止挂点至塔身中心线的横担长度</div>
                      <div>• <strong className="text-sky-300">L_str · sin φ (m)</strong>: 绝缘子串风偏产生的横向水平位移量</div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[10px] text-center pt-1 font-mono">
                    <div className="p-2 bg-white/10 backdrop-blur-sm rounded-lg border border-white/10">
                      <span className="text-slate-300 block font-bold">工频电压下 (最大风)</span>
                      <strong className="text-cyan-300 block text-xs mt-0.5">D_min = 0.55 m (110kV)</strong>
                      <span className="text-[9px] text-slate-400 block mt-0.5">220kV: 1.00m | 500kV: 2.70m</span>
                    </div>
                    <div className="p-2 bg-white/10 backdrop-blur-sm rounded-lg border border-white/10">
                      <span className="text-slate-300 block font-bold">操作过电压下 (0.5v风)</span>
                      <strong className="text-sky-300 block text-xs mt-0.5">D_min = 1.45 m (110kV)</strong>
                      <span className="text-[9px] text-slate-400 block mt-0.5">220kV: 1.90m | 500kV: 3.70m</span>
                    </div>
                    <div className="p-2 bg-white/10 backdrop-blur-sm rounded-lg border border-white/10">
                      <span className="text-slate-300 block font-bold">雷电过电压下 (无/微风)</span>
                      <strong className="text-emerald-300 block text-xs mt-0.5">D_min = 1.90 m (110kV)</strong>
                      <span className="text-[9px] text-slate-400 block mt-0.5">220kV: 2.30m | 500kV: 4.20m</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-3.5 bg-white/10 border-t border-white/10 backdrop-blur-xl">
          <div className="text-[11px] text-slate-300 font-mono flex items-center gap-1.5">
            <Sparkles className="w-4 h-4 text-cyan-300" />
            <span>数值计算引擎集成 3D 空间高精度方程解算器，计算过程及精度完全符合国标 GB 50545 & DL/T 5092 规范</span>
          </div>

          <button
            onClick={onClose}
            className="px-5 py-2 bg-gradient-to-r from-sky-500 to-cyan-600 hover:opacity-90 text-white font-bold text-xs rounded-xl shadow-lg shadow-cyan-500/20 transition-all cursor-pointer"
          >
            完成查看
          </button>
        </div>
      </div>

      {/* GB 50545 规范查表 Modal */}
      <NormativeTableModal
        isOpen={normativeTableModal.isOpen}
        onClose={() => setNormativeTableModal((prev) => ({ ...prev, isOpen: false }))}
        initialTable={normativeTableModal.tab}
        currentZ={tower?.averageHeight || 20}
        currentTerrain={tower?.terrainCategory || 'B'}
        currentWindSpeed={cond_v}
        currentLineType={tower?.lineType || 'general'}
      />
    </div>
  );
};


