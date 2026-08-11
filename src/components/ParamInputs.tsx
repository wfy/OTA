import React, { useState } from 'react';
import {
  Conductor,
  Insulator,
  TowerParameters,
  WorkingCondition,
  CrossingObstacle,
  MeteorologicalZone,
  ConditionCalcResult,
  InsulatorCalcResult,
} from '../types';
import { PRESET_CONDUCTORS, PRESET_INSULATORS } from '../data/conductors';
import { TYPICAL_METEOROLOGICAL_ZONES } from '../data/meteorology';
import { FormulaModal } from './FormulaModal';
import { NormativeTableModal } from './NormativeTableModal';
import { calculateInsulatorUnits } from '../utils/insulatorPhysics';
import {
  CloudSnow,
  Wind,
  Compass,
  Layers,
  Plus,
  Trash2,
  ShieldAlert,
  ChevronDown,
  ChevronUp,
  Sparkles,
  BookOpen,
  Table,
} from 'lucide-react';

interface ParamInputsProps {
  selectedConductor: Conductor;
  setSelectedConductor: (c: Conductor) => void;
  selectedInsulator: Insulator;
  setSelectedInsulator: (i: Insulator) => void;
  selectedRightInsulator?: Insulator;
  setSelectedRightInsulator?: (i: Insulator) => void;
  selectedZone: MeteorologicalZone;
  setSelectedZone: (z: MeteorologicalZone) => void;
  tower: TowerParameters;
  setTower: React.Dispatch<React.SetStateAction<TowerParameters>>;
  conditions: WorkingCondition[];
  setConditions: React.Dispatch<React.SetStateAction<WorkingCondition[]>>;
  creepageRatio: number;
  setCreepageRatio: (val: number) => void;
  obstacles: CrossingObstacle[];
  setObstacles: React.Dispatch<React.SetStateAction<CrossingObstacle[]>>;
  results?: ConditionCalcResult[];
  selectedConditionId?: string;
  setSelectedConditionId?: (id: string) => void;
  onOpenFormulaModal?: (tab: 'conductor' | 'insulator') => void;
  insulatorRes?: InsulatorCalcResult;
}

export const ParamInputs: React.FC<ParamInputsProps> = ({
  selectedConductor,
  setSelectedConductor,
  selectedInsulator,
  setSelectedInsulator,
  selectedRightInsulator,
  setSelectedRightInsulator,
  selectedZone,
  setSelectedZone,
  tower,
  setTower,
  conditions,
  setConditions,
  creepageRatio,
  setCreepageRatio,
  obstacles,
  setObstacles,
  results,
  selectedConditionId,
  setSelectedConditionId,
  onOpenFormulaModal,
  insulatorRes,
}) => {
  const cardBg = 'glass-panel text-slate-100 rounded-2xl shadow-2xl';
  const headerBtnBg = 'bg-slate-900/40 hover:bg-slate-800/60 text-slate-100 border-b border-white/10 backdrop-blur-md';
  const subCardBg = 'glass-card text-slate-100 rounded-xl';
  const inputBg = 'glass-input text-slate-100 focus:bg-slate-950/80 focus:border-cyan-400 rounded-lg';
  const selectOptionBg = 'bg-slate-950 text-slate-100';
  const labelText = 'text-slate-400 font-semibold';

  const [openSections, setOpenSections] = useState({
    weather: true,
    conductor: true,
    tower: true,
    insulator: false,
    obstacles: false,
  });

  const [syncRightInsulator, setSyncRightInsulator] = useState(true);
  const [activeInsulatorTab, setActiveInsulatorTab] = useState<'left' | 'right'>('left');

  const [localFormulaModalState, setLocalFormulaModalState] = useState<{
    isOpen: boolean;
    tab: 'conductor' | 'insulator';
  }>({ isOpen: false, tab: 'conductor' });

  const [normativeTableModal, setNormativeTableModal] = useState<{
    isOpen: boolean;
    tab: 'mu_z' | 'gamma_c' | 'terrain';
  }>({ isOpen: false, tab: 'mu_z' });

  const openFormulaModal = (tab: 'conductor' | 'insulator') => {
    if (onOpenFormulaModal) {
      onOpenFormulaModal(tab);
    } else {
      setLocalFormulaModalState({ isOpen: true, tab });
    }
  };

  const toggleSection = (key: keyof typeof openSections) => {
    setOpenSections((prev) => ({ ...prev, [key]: !prev[key] }));
  };

  const handleZoneChange = (zoneId: string) => {
    const zone = TYPICAL_METEOROLOGICAL_ZONES.find((z) => z.id === zoneId);
    if (!zone) return;
    setSelectedZone(zone);

    setConditions((prev) =>
      prev.map((c) => {
        if (c.id === 'min-temp') return { ...c, temp: zone.minTemp, windSpeed: 0, iceThickness: 0 };
        if (c.id === 'max-wind') return { ...c, temp: zone.windTemp, windSpeed: zone.maxWindSpeed, iceThickness: 0 };
        if (c.id === 'max-ice')
          return {
            ...c,
            temp: zone.iceTemp,
            windSpeed: zone.windWithIceSpeed,
            iceThickness: zone.designIceThickness,
          };
        if (c.id === 'avg-temp') return { ...c, temp: zone.avgTemp, windSpeed: 0, iceThickness: 0 };
        if (c.id === 'max-temp') return { ...c, temp: zone.maxTemp, windSpeed: 0, iceThickness: 0 };
        if (c.id === 'install') return { ...c, temp: zone.installationTemp, windSpeed: 0, iceThickness: 0 };
        return c;
      })
    );
  };

  const addCustomCondition = () => {
    const newCond: WorkingCondition = {
      id: `custom-${Date.now()}`,
      name: `自定义工况-${conditions.length + 1}`,
      temp: 20,
      windSpeed: 10,
      iceThickness: 0,
      isControlCandidate: true,
    };
    setConditions([...conditions, newCond]);
  };

  const removeCondition = (id: string) => {
    if (conditions.length <= 1) return;
    setConditions(conditions.filter((c) => c.id !== id));
  };

  const addObstacle = () => {
    const newObs: CrossingObstacle = {
      id: `obs-${Date.now()}`,
      name: '交叉跨越物',
      type: 'road',
      distanceFromLeftTower: Math.round(tower.spanLength / 2),
      elevationOffset: 0,
      obstacleHeight: 5.0,
      requiredClearance: 7.0,
    };
    setObstacles([...obstacles, newObs]);
  };

  const removeObstacle = (id: string) => {
    setObstacles(obstacles.filter((o) => o.id !== id));
  };

  const updateObstacle = (id: string, key: keyof CrossingObstacle, value: any) => {
    setObstacles(
      obstacles.map((o) => (o.id === id ? { ...o, [key]: value } : o))
    );
  };

  const handleLeftInsulatorChange = (ins: Insulator) => {
    setSelectedInsulator(ins);
    if (syncRightInsulator && setSelectedRightInsulator) {
      setSelectedRightInsulator(ins);
    }
  };

  const handleRightInsulatorChange = (ins: Insulator) => {
    if (syncRightInsulator) {
      setSyncRightInsulator(false);
    }
    if (setSelectedRightInsulator) {
      setSelectedRightInsulator(ins);
    }
  };

  return (
    <div className="space-y-3 font-sans text-xs text-slate-200">
      {/* 1. Meteorological Working Conditions Section */}
      <div className={`${cardBg} rounded-2xl overflow-hidden`}>
        <button
          onClick={() => toggleSection('weather')}
          className={`w-full flex items-center justify-between p-3 ${headerBtnBg} font-semibold text-xs tracking-wide transition-all`}
        >
          <span className="flex items-center gap-2">
            <CloudSnow className="w-4 h-4 text-cyan-400" />
            <span>工况预设与气象参数调节</span>
          </span>
          {openSections.weather ? (
            <ChevronUp className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-400" />
          )}
        </button>

        {openSections.weather && (
          <div className="p-3 space-y-3">
            {/* Weather Zone Selector */}
            <div>
              <label className={`block text-[10px] ${labelText} uppercase tracking-wider mb-1`}>
                典型气象区一键预设 (DL/T 5582)
              </label>
              <select
                id="select-weather-zone"
                value={selectedZone.id}
                onChange={(e) => handleZoneChange(e.target.value)}
                className={`w-full ${inputBg} rounded-xl p-2 font-mono text-xs focus:ring-2 focus:ring-cyan-500/50 transition-all outline-none backdrop-blur-sm`}
              >
                {TYPICAL_METEOROLOGICAL_ZONES.map((z) => (
                  <option key={z.id} value={z.id} className={selectOptionBg}>
                    {z.name} (风速:{z.maxWindSpeed}m/s, 冰厚:{z.designIceThickness}mm)
                  </option>
                ))}
              </select>
            </div>

            {/* Active Working Condition Selection Header */}
            {(() => {
              const activeCondId =
                selectedConditionId && conditions.some((c) => c.id === selectedConditionId)
                  ? selectedConditionId
                  : conditions[0]?.id;
              const activeCondIdx = Math.max(
                0,
                conditions.findIndex((c) => c.id === activeCondId)
              );
              const activeCond = conditions[activeCondIdx] || conditions[0];
              const res = results?.find((r) => r.conditionId === activeCond.id);
              const isGoverning = res?.isGoverningCondition;

              return (
                <div className="space-y-3">
                  {/* Selector & Add button */}
                  <div className="flex items-center justify-between gap-2 pt-1">
                    <div className={`flex-1 flex items-center space-x-1.5 ${subCardBg} rounded-xl p-1.5 backdrop-blur-sm`}>
                      <Sparkles className="w-3.5 h-3.5 text-cyan-400 shrink-0 ml-1" />
                      <span className={`text-[10px] ${labelText} uppercase shrink-0`}>当前工况:</span>
                      <select
                        value={activeCond.id}
                        onChange={(e) => setSelectedConditionId && setSelectedConditionId(e.target.value)}
                        className="w-full bg-transparent text-cyan-400 font-mono font-bold text-xs outline-none cursor-pointer"
                      >
                        {conditions.map((c) => {
                          const cRes = results?.find((r) => r.conditionId === c.id);
                          return (
                            <option key={c.id} value={c.id} className={selectOptionBg}>
                              {c.name} {cRes?.isGoverningCondition ? '★ (控制工况)' : ''}
                            </option>
                          );
                        })}
                      </select>
                    </div>

                    <button
                      onClick={addCustomCondition}
                      className="flex items-center space-x-1 px-2.5 py-2 bg-cyan-600/20 hover:bg-cyan-600/40 text-cyan-400 rounded-xl text-[10px] font-semibold uppercase border border-cyan-500/40 transition-all shrink-0 cursor-pointer"
                      title="新增自定义设计工况"
                    >
                      <Plus className="w-3.5 h-3.5" />
                      <span>新增工况</span>
                    </button>
                  </div>

                  {/* Active Condition Single Details Card */}
                  <div className={`p-3 rounded-xl border ${subCardBg} border-cyan-500/50 space-y-2.5 backdrop-blur-sm`}>
                    {/* Header: Name, Control Candidate Checkbox, Badges, Delete */}
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center space-x-1.5 flex-1 flex-wrap gap-y-1">
                        <input
                          type="text"
                          value={activeCond.name}
                          onChange={(e) => {
                            const nameVal = e.target.value;
                            setConditions((prev) =>
                              prev.map((c, i) => (i === activeCondIdx ? { ...c, name: nameVal } : c))
                            );
                          }}
                          className="bg-transparent font-semibold text-slate-100 border-slate-700/70 border-b hover:border-slate-500 focus:border-cyan-400 px-1 py-0.5 text-xs w-32 outline-none font-mono"
                        />

                        <label
                          className="flex items-center space-x-1 cursor-pointer text-[10px] text-slate-300 bg-slate-900/40 border-slate-700/60 px-1.5 py-0.5 rounded-md border transition-colors"
                          title="勾选是否参与导线控制应力计算 (控制候选工况)"
                        >
                          <input
                            type="checkbox"
                            checked={activeCond.isControlCandidate ?? true}
                            onChange={(e) => {
                              const checked = e.target.checked;
                              setConditions((prev) =>
                                prev.map((c, i) =>
                                  i === activeCondIdx ? { ...c, isControlCandidate: checked } : c
                                )
                              );
                            }}
                            className="rounded bg-slate-900 border-slate-700 text-cyan-500 focus:ring-0 accent-cyan-500"
                          />
                          <span>控制候选</span>
                        </label>

                        {isGoverning && (
                          <span className="bg-sky-500/20 text-sky-400 border border-sky-400/40 font-bold px-1.5 py-0.5 text-[9px] rounded-md uppercase tracking-tight flex items-center gap-1">
                            ★ 控制工况
                          </span>
                        )}
                      </div>

                      {conditions.length > 1 && (
                        <button
                          onClick={() => removeCondition(activeCond.id)}
                          className="text-red-400 hover:text-red-300 p-1 rounded-lg hover:bg-red-950/40 transition-colors shrink-0"
                          title="删除当前工况"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>

                    {/* Climate Parameters for Current Condition */}
                    <div className="grid grid-cols-3 gap-1.5">
                      <div className={`p-2 rounded-lg border ${inputBg}`}>
                        <span className={`text-[9px] ${labelText} uppercase block font-mono`}>气温 t (°C)</span>
                        <input
                          type="number"
                          value={activeCond.temp}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setConditions((prev) =>
                              prev.map((c, i) => (i === activeCondIdx ? { ...c, temp: val } : c))
                            );
                          }}
                          className="w-full bg-transparent text-cyan-500 font-mono font-bold text-xs text-center outline-none"
                        />
                      </div>

                      <div className={`p-2 rounded-lg border ${inputBg}`}>
                        <span className={`text-[9px] ${labelText} uppercase block font-mono`}>风速 v (m/s)</span>
                        <input
                          type="number"
                          value={activeCond.windSpeed}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setConditions((prev) =>
                              prev.map((c, i) => (i === activeCondIdx ? { ...c, windSpeed: val } : c))
                            );
                          }}
                          className="w-full bg-transparent text-cyan-500 font-mono font-bold text-xs text-center outline-none"
                        />
                      </div>

                      <div className={`p-2 rounded-lg border ${inputBg}`}>
                        <span className={`text-[9px] ${labelText} uppercase block font-mono`}>覆冰 b (mm)</span>
                        <input
                          type="number"
                          value={activeCond.iceThickness}
                          onChange={(e) => {
                            const val = Number(e.target.value);
                            setConditions((prev) =>
                              prev.map((c, i) => (i === activeCondIdx ? { ...c, iceThickness: val } : c))
                            );
                          }}
                          className="w-full bg-transparent text-white font-mono font-bold text-xs text-center outline-none"
                        />
                      </div>
                    </div>

                    {/* Physics Calculation Result Preview for Current Condition */}
                    {res && (
                      <div className={`p-2 rounded-lg border ${subCardBg} text-[10px] font-mono flex items-center justify-between backdrop-blur-sm`}>
                        <span>
                          弧垂: <strong className="text-white font-bold">{res.sag.toFixed(2)}m</strong>
                        </span>
                        <span>
                          张力: <strong className="text-white font-bold">{(res.tension / 1000).toFixed(2)}kN</strong>
                        </span>
                        <span>
                          应力: <strong className="text-slate-100">{res.stress.toFixed(1)}N/mm²</strong>
                        </span>
                        <span>
                          K: <strong className={res.safetyFactor >= 2.5 ? 'text-emerald-500' : 'text-red-500'}>{res.safetyFactor.toFixed(2)}</strong>
                        </span>
                      </div>
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        )}
      </div>

      {/* 2. Conductor Section */}
      <div className={`${cardBg} rounded-2xl overflow-hidden`}>
        <div className={`w-full flex items-center justify-between p-3 ${headerBtnBg} font-semibold text-xs tracking-wide transition-all`}>
          <div
            className="flex items-center gap-2 cursor-pointer flex-1"
            onClick={() => toggleSection('conductor')}
          >
            <Layers className="w-4 h-4 text-cyan-400" />
            <span>导线规格与物理力学参数</span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              id="btn-conductor-formula"
              onClick={(e) => {
                e.stopPropagation();
                openFormulaModal('conductor');
              }}
              className="flex items-center space-x-1 px-2.5 py-1 bg-cyan-500/20 hover:bg-cyan-500/35 text-cyan-300 border border-cyan-500/40 rounded-xl text-[10px] font-bold transition-all shadow-sm cursor-pointer hover:border-cyan-400"
              title="查看导线工况计算公式与求解流程"
            >
              <BookOpen className="w-3.5 h-3.5 text-cyan-400" />
              <span>计算公式</span>
            </button>

            <button
              type="button"
              onClick={() => toggleSection('conductor')}
              className="text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-800/50"
            >
              {openSections.conductor ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>

        {openSections.conductor && (
          <div className="p-3 space-y-3">
            <div>
              <label className={`block text-[10px] ${labelText} uppercase tracking-wider mb-1`}>
                选择常用规格导线 (国标 Preset)
              </label>
              <select
                id="select-conductor"
                value={selectedConductor.id}
                onChange={(e) => {
                  const found = PRESET_CONDUCTORS.find((c) => c.id === e.target.value);
                  if (found) setSelectedConductor(found);
                }}
                className={`w-full ${inputBg} rounded-xl p-2 font-mono text-xs focus:ring-2 focus:ring-cyan-500/50 transition-all outline-none backdrop-blur-sm cursor-pointer`}
              >
                {PRESET_CONDUCTORS.map((c) => (
                  <option key={c.id} value={c.id} className={selectOptionBg}>
                    {c.name} ({c.totalArea}mm², d={c.outerDiameter}mm, Tp={(c.ratedStrength / 1000).toFixed(0)}kN)
                  </option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-800/60">
              <div className={`${subCardBg} p-2 rounded-xl backdrop-blur-sm`}>
                <span className={`text-[9px] ${labelText} uppercase block mb-0.5`}>截面积 S (mm²)</span>
                <input
                  type="number"
                  value={selectedConductor.totalArea}
                  onChange={(e) =>
                    setSelectedConductor({ ...selectedConductor, totalArea: Number(e.target.value) })
                  }
                  className="w-full bg-transparent font-mono text-xs outline-none font-bold"
                />
              </div>

              <div className={`${subCardBg} p-2 rounded-xl backdrop-blur-sm`}>
                <span className={`text-[9px] ${labelText} uppercase block mb-0.5`}>外径 d (mm)</span>
                <input
                  type="number"
                  step="0.01"
                  value={selectedConductor.outerDiameter}
                  onChange={(e) =>
                    setSelectedConductor({ ...selectedConductor, outerDiameter: Number(e.target.value) })
                  }
                  className="w-full bg-transparent font-mono text-xs outline-none font-bold"
                />
              </div>

              <div className={`${subCardBg} p-2 rounded-xl backdrop-blur-sm`}>
                <span className={`text-[9px] ${labelText} uppercase block mb-0.5`}>单位质量 m (kg/m)</span>
                <input
                  type="number"
                  step="0.0001"
                  value={selectedConductor.unitMass}
                  onChange={(e) =>
                    setSelectedConductor({ ...selectedConductor, unitMass: Number(e.target.value) })
                  }
                  className="w-full bg-transparent font-mono text-xs outline-none font-bold"
                />
              </div>

              <div className={`${subCardBg} p-2 rounded-xl backdrop-blur-sm`}>
                <span className={`text-[9px] ${labelText} uppercase block mb-0.5`}>额定拉断力 T_p (kN)</span>
                <input
                  type="number"
                  value={selectedConductor.ratedStrength / 1000}
                  onChange={(e) =>
                    setSelectedConductor({
                      ...selectedConductor,
                      ratedStrength: Number(e.target.value) * 1000,
                    })
                  }
                  className="w-full bg-transparent font-mono text-xs outline-none font-bold text-white"
                />
              </div>

              <div className={`${subCardBg} p-2 rounded-xl backdrop-blur-sm`}>
                <span className={`text-[9px] ${labelText} uppercase block mb-0.5`}>弹性模量 E (N/mm²)</span>
                <input
                  type="number"
                  value={selectedConductor.elasticModulus}
                  onChange={(e) =>
                    setSelectedConductor({ ...selectedConductor, elasticModulus: Number(e.target.value) })
                  }
                  className="w-full bg-transparent font-mono text-xs outline-none font-bold"
                />
              </div>

              <div className={`${subCardBg} p-2 rounded-xl backdrop-blur-sm`}>
                <span className={`text-[9px] ${labelText} uppercase block mb-0.5`}>膨胀系数 α (10⁻⁶/°C)</span>
                <input
                  type="number"
                  step="0.1"
                  value={(selectedConductor.thermalExpansion * 1e6).toFixed(1)}
                  onChange={(e) =>
                    setSelectedConductor({
                      ...selectedConductor,
                      thermalExpansion: Number(e.target.value) * 1e-6,
                    })
                  }
                  className="w-full bg-transparent font-mono text-xs outline-none font-bold"
                />
              </div>
            </div>

            {/* 精细风荷载参数 (GB 50545 9.3节) */}
            <div className={`${subCardBg} p-2.5 rounded-xl space-y-2 backdrop-blur-sm border border-cyan-500/20`}>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-cyan-400 font-bold uppercase tracking-wider flex items-center gap-1">
                  <Wind className="w-3 h-3" />
                  <span>导线风荷载比载参数 (GB 50545 9.3)</span>
                </span>
                <button
                  type="button"
                  onClick={() => openFormulaModal('conductor')}
                  className="text-[9px] text-cyan-300 hover:underline flex items-center gap-0.5"
                >
                  <BookOpen className="w-2.5 h-2.5" />
                  <span>计算公式推导</span>
                </button>
              </div>

              <div className="grid grid-cols-3 gap-2">
                <div>
                  <label className={`text-[9px] ${labelText} block mb-1`}>分裂根数 n</label>
                  <select
                    value={selectedConductor.bundleNumber || tower.numSubConductors || 1}
                    onChange={(e) => {
                      const val = Number(e.target.value);
                      setSelectedConductor({ ...selectedConductor, bundleNumber: val });
                      setTower({ ...tower, numSubConductors: val });
                    }}
                    className={`w-full ${inputBg} rounded-lg p-1 text-xs font-mono font-bold outline-none cursor-pointer`}
                  >
                    <option value={1} className={selectOptionBg}>单导线 (1)</option>
                    <option value={2} className={selectOptionBg}>双分裂 (2)</option>
                    <option value={3} className={selectOptionBg}>三分裂 (3)</option>
                    <option value={4} className={selectOptionBg}>四分裂 (4)</option>
                    <option value={6} className={selectOptionBg}>六分裂 (6)</option>
                    <option value={8} className={selectOptionBg}>八分裂 (8)</option>
                  </select>
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <label className={`text-[9px] ${labelText} block mb-1`}>体型系数 μ_sc</label>
                    <span className="text-[8px] text-slate-400 font-mono">
                      {selectedConductor.outerDiameter >= 17 ? 'd≥17mm(1.0)' : 'd<17mm(1.1)'}
                    </span>
                  </div>
                  <input
                    type="number"
                    step="0.05"
                    placeholder={selectedConductor.outerDiameter >= 17 ? "1.0" : "1.1"}
                    value={selectedConductor.windShapeFactor || ''}
                    onChange={(e) => {
                      const val = e.target.value === '' ? undefined : Number(e.target.value);
                      setSelectedConductor({ ...selectedConductor, windShapeFactor: val });
                    }}
                    className={`w-full ${inputBg} rounded-lg p-1 font-mono text-xs outline-none font-bold`}
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <label className={`text-[9px] ${labelText} block mb-1`}>覆冰增大系数 B₁</label>
                    <span className="text-[8px] text-slate-400 font-mono">无冰1.0/有冰1.1~1.2</span>
                  </div>
                  <input
                    type="number"
                    step="0.05"
                    placeholder="1.0 (自动)"
                    value={selectedConductor.iceWindCoeff || ''}
                    onChange={(e) => {
                      const val = e.target.value === '' ? undefined : Number(e.target.value);
                      setSelectedConductor({ ...selectedConductor, iceWindCoeff: val });
                    }}
                    className={`w-full ${inputBg} rounded-lg p-1 font-mono text-xs outline-none font-bold`}
                  />
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 3. Tower & Span Section */}
      <div className={`${cardBg} rounded-2xl overflow-hidden`}>
        <button
          onClick={() => toggleSection('tower')}
          className={`w-full flex items-center justify-between p-3 ${headerBtnBg} font-semibold text-xs tracking-wide transition-all`}
        >
          <span className="flex items-center gap-2">
            <Compass className="w-4 h-4 text-cyan-400" />
            <span>杆塔结构型式 (角钢塔/钢管塔) 与档距参数</span>
          </span>
          {openSections.tower ? (
            <ChevronUp className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-400" />
          )}
        </button>

        {openSections.tower && (
          <div className="p-3 space-y-3">
            {/* Tower Structure Type Selector */}
            <div className={`${subCardBg} p-2.5 rounded-xl space-y-2 backdrop-blur-sm`}>
              <span className="text-[10px] text-cyan-400 font-bold uppercase tracking-wider block">
                杆塔结构材质型式 (Tower Structure)
              </span>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={`text-[9px] ${labelText} block mb-1`}>左塔 (A) 结构型式</label>
                  <select
                    value={tower.leftTowerStructureType || tower.towerStructureType || 'angle_steel'}
                    onChange={(e) => {
                      const val = e.target.value as 'angle_steel' | 'steel_pipe';
                      setTower({
                        ...tower,
                        leftTowerStructureType: val,
                        towerStructureType: val,
                      });
                    }}
                    className={`w-full ${inputBg} rounded-lg p-1.5 text-xs font-mono font-semibold outline-none focus:border-cyan-500 cursor-pointer`}
                  >
                    <option value="angle_steel" className={selectOptionBg}>角钢塔 (Lattice Angle)</option>
                    <option value="steel_pipe" className={selectOptionBg}>钢管塔 (Tubular Steel)</option>
                  </select>
                </div>

                <div>
                  <label className={`text-[9px] ${labelText} block mb-1`}>右塔 (B) 结构型式</label>
                  <select
                    value={tower.rightTowerStructureType || tower.towerStructureType || 'angle_steel'}
                    onChange={(e) => {
                      const val = e.target.value as 'angle_steel' | 'steel_pipe';
                      setTower({
                        ...tower,
                        rightTowerStructureType: val,
                      });
                    }}
                    className={`w-full ${inputBg} rounded-lg p-1.5 text-xs font-mono font-semibold outline-none focus:border-cyan-500 cursor-pointer`}
                  >
                    <option value="angle_steel" className={selectOptionBg}>角钢塔 (Lattice Angle)</option>
                    <option value="steel_pipe" className={selectOptionBg}>钢管塔 (Tubular Steel)</option>
                  </select>
                </div>
              </div>

              {/* Quick Preset Buttons */}
              <div className="flex items-center gap-1.5 pt-1 border-t border-slate-800/60">
                <span className={`text-[9px] ${labelText}`}>一键统设:</span>
                <button
                  type="button"
                  onClick={() =>
                    setTower({
                      ...tower,
                      towerStructureType: 'angle_steel',
                      leftTowerStructureType: 'angle_steel',
                      rightTowerStructureType: 'angle_steel',
                    })
                  }
                  className={`px-2 py-0.5 text-[10px] rounded font-semibold transition-all cursor-pointer ${
                    (tower.leftTowerStructureType || 'angle_steel') === 'angle_steel' &&
                    (tower.rightTowerStructureType || 'angle_steel') === 'angle_steel'
                      ? 'bg-sky-500/20 text-sky-400 border border-sky-500/50'
                      : `${subCardBg} border`
                  }`}
                >
                  两端均设为【角钢塔】
                </button>
                <button
                  type="button"
                  onClick={() =>
                    setTower({
                      ...tower,
                      towerStructureType: 'steel_pipe',
                      leftTowerStructureType: 'steel_pipe',
                      rightTowerStructureType: 'steel_pipe',
                    })
                  }
                  className={`px-2 py-0.5 text-[10px] rounded font-semibold transition-all cursor-pointer ${
                    (tower.leftTowerStructureType || 'angle_steel') === 'steel_pipe' &&
                    (tower.rightTowerStructureType || 'angle_steel') === 'steel_pipe'
                      ? 'bg-cyan-500/20 text-cyan-400 border border-cyan-500/50'
                      : `${subCardBg} border`
                  }`}
                >
                  两端均设为【钢管塔】
                </button>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className={`${subCardBg} p-2 rounded-xl backdrop-blur-sm`}>
                <div className="flex items-center justify-between mb-0.5">
                  <span className={`text-[9px] ${labelText} uppercase font-bold text-slate-200`}>视图档距 L (m)</span>
                  <span className="text-[8px] text-slate-400 font-mono">2D/3D视角距离</span>
                </div>
                <input
                  type="number"
                  value={tower.horizontalSpan !== undefined ? tower.horizontalSpan : tower.spanLength}
                  onChange={(e) => {
                    const newL = Number(e.target.value);
                    const oldL = tower.horizontalSpan !== undefined ? tower.horizontalSpan : tower.spanLength;
                    const syncLeftH = tower.leftHorizontalSpan === undefined || tower.leftHorizontalSpan === oldL;
                    const syncRightH = tower.rightHorizontalSpan === undefined || tower.rightHorizontalSpan === oldL;
                    const newLhA = syncLeftH ? newL : (tower.leftHorizontalSpan || newL);
                    const newLhB = syncRightH ? newL : (tower.rightHorizontalSpan || newL);
                    const newLeftLv = (tower.leftVerticalSpan === undefined || tower.leftVerticalSpan === oldL) ? newL : tower.leftVerticalSpan;
                    const newRightLv = (tower.rightVerticalSpan === undefined || tower.rightVerticalSpan === oldL) ? newL : tower.rightVerticalSpan;
                    setTower({
                      ...tower,
                      horizontalSpan: newL,
                      leftHorizontalSpan: newLhA,
                      rightHorizontalSpan: newLhB,
                      leftVerticalSpan: newLeftLv,
                      rightVerticalSpan: newRightLv,
                      leftKvValue: newLhA > 0 ? newLeftLv / newLhA : 1.0,
                      rightKvValue: newLhB > 0 ? newRightLv / newLhB : 1.0,
                    });
                  }}
                  className="w-full bg-transparent text-white font-mono text-xs outline-none font-bold"
                  placeholder="350"
                />
              </div>

              <div className={`${subCardBg} p-2 rounded-xl backdrop-blur-sm`}>
                <div className="flex items-center justify-between mb-0.5">
                  <span className={`text-[9px] ${labelText} uppercase font-bold text-slate-200`}>代表档距 L_r (m)</span>
                  <span className="text-[8px] text-slate-400 font-mono">工况力学计算</span>
                </div>
                <input
                  type="number"
                  value={tower.spanLength}
                  onChange={(e) => setTower({ ...tower, spanLength: Number(e.target.value) })}
                  className="w-full bg-transparent text-white font-mono text-xs outline-none font-bold"
                />
              </div>
            </div>

            {/* Sub-card for Front & Back Tower Horizontal and Vertical Spans */}
            <div className={`${subCardBg} p-2.5 rounded-xl space-y-2 backdrop-blur-sm`}>
              <div className="flex items-center justify-between">
                <span className="text-[10px] text-cyan-400 font-bold uppercase tracking-wider">
                  前后杆塔水平/垂直档距 (l_h & l_v)
                </span>
                <button
                  type="button"
                  onClick={() => {
                    const viewL = tower.horizontalSpan || tower.spanLength;
                    setTower({
                      ...tower,
                      leftHorizontalSpan: viewL,
                      rightHorizontalSpan: viewL,
                      leftVerticalSpan: viewL,
                      rightVerticalSpan: viewL,
                      leftKvValue: 1.0,
                      rightKvValue: 1.0,
                    });
                  }}
                  className="text-[9px] text-cyan-400 hover:text-cyan-300 font-mono underline cursor-pointer"
                >
                  [一键按视图档距同步]
                </button>
              </div>

              {(() => {
                const defaultL = tower.horizontalSpan || tower.spanLength || 350;
                const leftLh = tower.leftHorizontalSpan !== undefined ? tower.leftHorizontalSpan : defaultL;
                const rightLh = tower.rightHorizontalSpan !== undefined ? tower.rightHorizontalSpan : defaultL;
                const leftLv = tower.leftVerticalSpan !== undefined ? tower.leftVerticalSpan : (tower.leftKvValue !== undefined ? Math.round(tower.leftKvValue * leftLh) : defaultL);
                const rightLv = tower.rightVerticalSpan !== undefined ? tower.rightVerticalSpan : (tower.rightKvValue !== undefined ? Math.round(tower.rightKvValue * rightLh) : defaultL);

                return (
                  <div className="grid grid-cols-2 gap-2">
                    {/* Left Tower Horizontal Span l_hA */}
                    <div className={`${inputBg} p-2 rounded-lg border border-slate-700/50`}>
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-[9px] text-cyan-300 font-bold">左塔 (A) 水平档距 l_hA (m)</span>
                      </div>
                      <input
                        type="number"
                        min="0"
                        value={leftLh}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          const kv = val > 0 ? leftLv / val : 1.0;
                          setTower({
                            ...tower,
                            leftHorizontalSpan: val,
                            leftKvValue: kv,
                          });
                        }}
                        className="w-full bg-transparent text-white font-mono text-xs outline-none font-bold"
                        placeholder={String(defaultL)}
                      />
                    </div>

                    {/* Right Tower Horizontal Span l_hB */}
                    <div className={`${inputBg} p-2 rounded-lg border border-slate-700/50`}>
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-[9px] text-amber-300 font-bold">右塔 (B) 水平档距 l_hB (m)</span>
                      </div>
                      <input
                        type="number"
                        min="0"
                        value={rightLh}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          const kv = val > 0 ? rightLv / val : 1.0;
                          setTower({
                            ...tower,
                            rightHorizontalSpan: val,
                            rightKvValue: kv,
                          });
                        }}
                        className="w-full bg-transparent text-white font-mono text-xs outline-none font-bold"
                        placeholder={String(defaultL)}
                      />
                    </div>

                    {/* Left Tower Vertical Span l_vA */}
                    <div className={`${inputBg} p-2 rounded-lg border border-slate-700/50`}>
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-[9px] text-cyan-300 font-bold">左塔 (A) 垂直档距 l_vA (m)</span>
                        <span className="text-[8px] text-slate-400 font-mono">
                          K_vA={(leftLh > 0 ? leftLv / leftLh : 1.0).toFixed(2)}
                        </span>
                      </div>
                      <input
                        type="number"
                        step="5"
                        min="0"
                        value={leftLv}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          const kv = leftLh > 0 ? val / leftLh : 1.0;
                          setTower({
                            ...tower,
                            leftVerticalSpan: val,
                            leftKvValue: kv,
                          });
                        }}
                        className="w-full bg-transparent text-white font-mono text-xs outline-none font-bold"
                        placeholder={String(leftLh)}
                      />
                    </div>

                    {/* Right Tower Vertical Span l_vB */}
                    <div className={`${inputBg} p-2 rounded-lg border border-slate-700/50`}>
                      <div className="flex items-center justify-between mb-0.5">
                        <span className="text-[9px] text-amber-300 font-bold">右塔 (B) 垂直档距 l_vB (m)</span>
                        <span className="text-[8px] text-slate-400 font-mono">
                          K_vB={(rightLh > 0 ? rightLv / rightLh : 1.0).toFixed(2)}
                        </span>
                      </div>
                      <input
                        type="number"
                        step="5"
                        min="0"
                        value={rightLv}
                        onChange={(e) => {
                          const val = Number(e.target.value);
                          const kv = rightLh > 0 ? val / rightLh : 1.0;
                          setTower({
                            ...tower,
                            rightVerticalSpan: val,
                            rightKvValue: kv,
                          });
                        }}
                        className="w-full bg-transparent text-white font-mono text-xs outline-none font-bold"
                        placeholder={String(rightLh)}
                      />
                    </div>
                  </div>
                );
              })()}
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div className={`${subCardBg} p-2 rounded-xl backdrop-blur-sm`}>
                <span className={`text-[9px] ${labelText} uppercase block mb-0.5`}>左右高差 h (m)</span>
                <input
                  type="number"
                  value={tower.heightDifference}
                  onChange={(e) => {
                    const newH = Number(e.target.value);
                    const leftH = tower.leftAttachmentHeight || 35;
                    setTower({
                      ...tower,
                      heightDifference: newH,
                      rightAttachmentHeight: leftH + newH,
                    });
                  }}
                  className="w-full bg-transparent font-mono text-xs outline-none font-bold"
                />
              </div>

              <div className={`${subCardBg} p-2 rounded-xl backdrop-blur-sm`}>
                <span className={`text-[9px] ${labelText} uppercase block mb-0.5`}>左塔挂线高 H_A (m)</span>
                <input
                  type="number"
                  value={tower.leftAttachmentHeight}
                  onChange={(e) => {
                    const newLeftH = Number(e.target.value);
                    const hDiff = tower.heightDifference || 0;
                    setTower({
                      ...tower,
                      leftAttachmentHeight: newLeftH,
                      rightAttachmentHeight: newLeftH + hDiff,
                    });
                  }}
                  className="w-full bg-transparent font-mono text-xs outline-none font-bold"
                />
              </div>

              <div className={`${subCardBg} p-2 rounded-xl backdrop-blur-sm`}>
                <span className={`text-[9px] ${labelText} uppercase block mb-0.5`}>右塔挂线高 H_B (m)</span>
                <input
                  type="number"
                  value={
                    tower.rightAttachmentHeight !== undefined
                      ? tower.rightAttachmentHeight
                      : (tower.leftAttachmentHeight || 35) + (tower.heightDifference || 0)
                  }
                  onChange={(e) => {
                    const newRightH = Number(e.target.value);
                    const leftH = tower.leftAttachmentHeight || 35;
                    setTower({
                      ...tower,
                      rightAttachmentHeight: newRightH,
                      heightDifference: newRightH - leftH,
                    });
                  }}
                  className="w-full bg-transparent text-cyan-400 font-mono text-xs outline-none font-bold"
                />
              </div>

              <div className={`col-span-2 ${subCardBg} p-2 rounded-xl backdrop-blur-sm`}>
                <span className={`text-[9px] ${labelText} uppercase block mb-0.5`}>导线分裂数 n</span>
                <select
                  value={tower.numSubConductors}
                  onChange={(e) => {
                    const num = Number(e.target.value);
                    setTower({ ...tower, numSubConductors: num });
                    setSelectedConductor({ ...selectedConductor, bundleNumber: num });
                  }}
                  className="w-full bg-transparent font-mono text-xs outline-none font-bold cursor-pointer"
                >
                  <option value={1} className={selectOptionBg}>1 (单导线)</option>
                  <option value={2} className={selectOptionBg}>2 (双分裂 220kV)</option>
                  <option value={4} className={selectOptionBg}>4 (四分裂 500kV)</option>
                  <option value={6} className={selectOptionBg}>6 (六分裂 750kV)</option>
                  <option value={8} className={selectOptionBg}>8 (八分裂 1000kV)</option>
                </select>
              </div>
            </div>

            {/* 地形环境与风压比载参数 (GB 50545 9.3 节) */}
            <div className={`${subCardBg} p-2.5 rounded-xl space-y-2 backdrop-blur-sm border border-cyan-500/20`}>
              <div className="flex flex-wrap items-center justify-between gap-1">
                <span className="text-[10px] text-cyan-400 font-bold uppercase tracking-wider flex items-center gap-1">
                  <Compass className="w-3 h-3" />
                  <span>风偏气象与地形环境参量 (GB 50545 9.3)</span>
                </span>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setNormativeTableModal({ isOpen: true, tab: 'mu_z' })}
                    className="text-[9px] text-cyan-300 hover:text-white bg-cyan-500/20 hover:bg-cyan-500/40 px-1.5 py-0.5 rounded border border-cyan-400/30 transition-all flex items-center gap-1 cursor-pointer"
                    title="查看表 9.3.1-1 风压高度变化系数 μ_z"
                  >
                    <Table className="w-2.5 h-2.5 text-cyan-400" />
                    <span>查看表 9.3.1-1</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setNormativeTableModal({ isOpen: true, tab: 'gamma_c' })}
                    className="text-[9px] text-cyan-300 hover:text-white bg-cyan-500/20 hover:bg-cyan-500/40 px-1.5 py-0.5 rounded border border-cyan-400/30 transition-all flex items-center gap-1 cursor-pointer"
                    title="查看表 9.3.1-2 导地线风荷载折减系数 γ_c"
                  >
                    <Table className="w-2.5 h-2.5 text-cyan-400" />
                    <span>查看表 9.3.1-2</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => openFormulaModal('conductor')}
                    className="text-[9px] text-cyan-300 hover:underline flex items-center gap-0.5"
                  >
                    <BookOpen className="w-2.5 h-2.5" />
                    <span>公式推导</span>
                  </button>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className={`text-[9px] ${labelText} block mb-1`}>地貌粗糙度类别</label>
                  <select
                    value={tower.terrainCategory || 'B'}
                    onChange={(e) =>
                      setTower({
                        ...tower,
                        terrainCategory: e.target.value as 'A' | 'B' | 'C' | 'D',
                      })
                    }
                    className={`w-full ${inputBg} rounded-lg p-1.5 text-xs font-mono font-bold outline-none cursor-pointer`}
                  >
                    <option value="A" className={selectOptionBg}>A类 (海面/海岛 I₁₀=0.12)</option>
                    <option value="B" className={selectOptionBg}>B类 (田野/乡村 默认 I₁₀=0.14)</option>
                    <option value="C" className={selectOptionBg}>C类 (城镇/密集建筑 I₁₀=0.23)</option>
                    <option value="D" className={selectOptionBg}>D类 (城市高楼 I₁₀=0.39)</option>
                  </select>
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <label className={`text-[9px] ${labelText} block mb-1`}>导线平均高度 z (m)</label>
                    <button
                      type="button"
                      onClick={() => {
                        const hA = tower.leftAttachmentHeight || 35;
                        const hB = tower.rightAttachmentHeight || (hA + (tower.heightDifference || 0));
                        const avgH = Math.max(10, Math.round(((hA + hB) / 2) * 0.75));
                        setTower({ ...tower, averageHeight: avgH });
                      }}
                      className="text-[8px] text-cyan-300 hover:underline"
                    >
                      [自动估算]
                    </button>
                  </div>
                  <input
                    type="number"
                    min="5"
                    max="500"
                    value={tower.averageHeight || 20}
                    onChange={(e) => setTower({ ...tower, averageHeight: Number(e.target.value) })}
                    className={`w-full ${inputBg} rounded-lg p-1.5 font-mono text-xs outline-none font-bold`}
                    placeholder="20"
                  />
                </div>

                <div>
                  <label className={`text-[9px] ${labelText} block mb-1`}>风向与导线夹角 θ (°)</label>
                  <select
                    value={tower.windAngleDeg !== undefined ? tower.windAngleDeg : 90}
                    onChange={(e) => setTower({ ...tower, windAngleDeg: Number(e.target.value) })}
                    className={`w-full ${inputBg} rounded-lg p-1.5 text-xs font-mono font-bold outline-none cursor-pointer`}
                  >
                    <option value={90} className={selectOptionBg}>90° (垂直主风向 sin²θ=1.0)</option>
                    <option value={75} className={selectOptionBg}>75° (斜向风 sin²θ=0.93)</option>
                    <option value={60} className={selectOptionBg}>60° (斜向风 sin²θ=0.75)</option>
                    <option value={45} className={selectOptionBg}>45° (斜向风 sin²θ=0.50)</option>
                    <option value={30} className={selectOptionBg}>30° (斜向风 sin²θ=0.25)</option>
                  </select>
                </div>

                <div>
                  <label className={`text-[9px] ${labelText} block mb-1`}>线路工程类型</label>
                  <select
                    value={tower.lineType || 'general'}
                    onChange={(e) =>
                      setTower({
                        ...tower,
                        lineType: e.target.value as 'general' | 'large_span',
                      })
                    }
                    className={`w-full ${inputBg} rounded-lg p-1.5 text-xs font-mono font-bold outline-none cursor-pointer`}
                  >
                    <option value="general" className={selectOptionBg}>一般输电线路 (表9.3.1-2)</option>
                    <option value="large_span" className={selectOptionBg}>大跨越工程 (表9.3.1-2)</option>
                  </select>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 4. Insulators Section */}
      <div className={`${cardBg} rounded-2xl overflow-hidden`}>
        <div className={`w-full flex items-center justify-between p-3 ${headerBtnBg} font-semibold text-xs tracking-wide transition-all`}>
          <div
            className="flex items-center gap-2 cursor-pointer flex-1"
            onClick={() => toggleSection('insulator')}
          >
            <Wind className="w-4 h-4 text-cyan-400" />
            <span>两端杆塔绝缘子串选型与风偏</span>
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              id="btn-insulator-formula"
              onClick={(e) => {
                e.stopPropagation();
                openFormulaModal('insulator');
              }}
              className="flex items-center space-x-1 px-2.5 py-1 bg-cyan-500/20 hover:bg-cyan-500/35 text-cyan-300 border border-cyan-500/40 rounded-xl text-[10px] font-bold transition-all shadow-sm cursor-pointer hover:border-cyan-400"
              title="查看绝缘子串计算公式与风偏受力流程"
            >
              <BookOpen className="w-3.5 h-3.5 text-cyan-400" />
              <span>计算公式</span>
            </button>

            <button
              type="button"
              onClick={() => toggleSection('insulator')}
              className="text-slate-400 hover:text-slate-200 p-1 rounded-lg hover:bg-slate-800/50"
            >
              {openSections.insulator ? (
                <ChevronUp className="w-4 h-4" />
              ) : (
                <ChevronDown className="w-4 h-4" />
              )}
            </button>
          </div>
        </div>

        {openSections.insulator && (() => {
          const leftInsInfo = calculateInsulatorUnits(selectedInsulator, tower.voltageLevel, tower.elevation, creepageRatio);
          const leftTypeMult = (selectedInsulator.stringType === 'double_I' || selectedInsulator.stringType === 'V_string') ? 2 : 1;
          const leftAreaMult = (selectedInsulator.stringType === 'double_I' || selectedInsulator.stringType === 'V_string') ? 1.8 : 1.0;
          const autoLeftWeight = leftInsInfo.totalWeight * leftTypeMult;
          const autoLeftArea = leftInsInfo.calculatedWindArea * leftAreaMult;

          const currentRightIns = selectedRightInsulator || selectedInsulator;
          const rightInsInfo = calculateInsulatorUnits(currentRightIns, tower.voltageLevel, tower.elevation, creepageRatio);
          const rightTypeMult = (currentRightIns.stringType === 'double_I' || currentRightIns.stringType === 'V_string') ? 2 : 1;
          const rightAreaMult = (currentRightIns.stringType === 'double_I' || currentRightIns.stringType === 'V_string') ? 1.8 : 1.0;
          const autoRightWeight = rightInsInfo.totalWeight * rightTypeMult;
          const autoRightArea = rightInsInfo.calculatedWindArea * rightAreaMult;

          return (
          <div className="p-3 space-y-3">
            {/* Left / Right Insulator Tab Switcher */}
            <div className={`flex items-center justify-between ${subCardBg} p-1.5 rounded-xl border text-xs backdrop-blur-sm`}>
              <div className="flex items-center space-x-1">
                <button
                  type="button"
                  onClick={() => setActiveInsulatorTab('left')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    activeInsulatorTab === 'left'
                      ? 'bg-cyan-600 text-white shadow-md'
                      : `${labelText} hover:text-cyan-400`
                  }`}
                >
                  左塔 (A端) 绝缘子
                </button>
                <button
                  type="button"
                  onClick={() => setActiveInsulatorTab('right')}
                  className={`px-2.5 py-1 rounded-lg text-xs font-semibold transition-all cursor-pointer ${
                    activeInsulatorTab === 'right'
                      ? 'bg-cyan-600 text-white shadow-md'
                      : `${labelText} hover:text-cyan-400`
                  }`}
                >
                  右塔 (B端) 绝缘子
                </button>
              </div>

              <label className="flex items-center space-x-1 cursor-pointer text-[11px]">
                <input
                  type="checkbox"
                  checked={syncRightInsulator}
                  onChange={(e) => {
                    const checked = e.target.checked;
                    setSyncRightInsulator(checked);
                    if (checked && setSelectedRightInsulator) {
                      setSelectedRightInsulator(selectedInsulator);
                    }
                  }}
                  className="rounded bg-slate-900 border-slate-700 text-cyan-500 accent-cyan-500"
                />
                <span className={labelText}>左右对称</span>
              </label>
            </div>

            {/* Left Insulator Form */}
            {activeInsulatorTab === 'left' && (
              <div className="space-y-2">
                <span className="text-[10px] font-semibold uppercase text-cyan-400 tracking-wider block">
                  左侧杆塔 (A) 绝缘子型式
                </span>

                <select
                  id="select-insulator-left"
                  value={selectedInsulator.id}
                  onChange={(e) => {
                    const found = PRESET_INSULATORS.find((i) => i.id === e.target.value);
                    if (found) handleLeftInsulatorChange(found);
                  }}
                  className={`w-full ${inputBg} rounded-xl p-2 font-mono text-xs focus:ring-2 focus:ring-cyan-500/50 outline-none cursor-pointer backdrop-blur-sm`}
                >
                  {PRESET_INSULATORS.map((i) => (
                    <option key={i.id} value={i.id} className={selectOptionBg}>
                      {i.name} ({i.material}, 爬距:{i.creepageDistance}mm)
                    </option>
                  ))}
                </select>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div className={`col-span-2 ${subCardBg} p-2 rounded-xl backdrop-blur-sm`}>
                    <span className={`text-[9px] ${labelText} uppercase block mb-1`}>串型结构 (String Type)</span>
                    <select
                      value={selectedInsulator.stringType || 'single_I'}
                      onChange={(e) =>
                        handleLeftInsulatorChange({
                          ...selectedInsulator,
                          stringType: e.target.value as any,
                        })
                      }
                      className="w-full bg-transparent font-mono text-xs outline-none cursor-pointer"
                    >
                      <option value="single_I" className={selectOptionBg}>单I型悬垂绝缘子串 (自由风偏)</option>
                      <option value="double_I" className={selectOptionBg}>双I型悬垂绝缘子串 (自重抑偏)</option>
                      <option value="V_string" className={selectOptionBg}>V型悬垂绝缘子串 (刚性抗风偏)</option>
                      <option value="tension" className={selectOptionBg}>耐张绝缘子串 (沿导线拉紧, 0°风偏)</option>
                    </select>
                  </div>

                  {selectedInsulator.stringType === 'V_string' && (
                    <div className={`col-span-2 ${subCardBg} p-2 rounded-xl backdrop-blur-sm`}>
                      <span className={`text-[9px] ${labelText} uppercase block mb-0.5`}>V型串夹角 θ_v (°)</span>
                      <input
                        type="number"
                        value={selectedInsulator.vAngle || 90}
                        onChange={(e) =>
                          handleLeftInsulatorChange({ ...selectedInsulator, vAngle: Number(e.target.value) })
                        }
                        className="w-full bg-transparent text-cyan-400 font-mono text-xs outline-none font-bold"
                      />
                    </div>
                  )}

                  <div className={`${subCardBg} p-2 rounded-xl backdrop-blur-sm`}>
                    <span className={`text-[9px] ${labelText} uppercase block mb-0.5`}>单片结构高度 (mm)</span>
                    <input
                      type="number"
                      value={selectedInsulator.structureHeight}
                      onChange={(e) =>
                        handleLeftInsulatorChange({ ...selectedInsulator, structureHeight: Number(e.target.value) })
                      }
                      className="w-full bg-transparent font-mono text-xs outline-none font-bold"
                    />
                  </div>

                  <div className={`${subCardBg} p-2 rounded-xl backdrop-blur-sm`}>
                    <span className={`text-[9px] ${labelText} uppercase block mb-0.5`}>单片质量 (kg)</span>
                    <input
                      type="number"
                      step="0.1"
                      value={selectedInsulator.unitMass}
                      onChange={(e) =>
                        handleLeftInsulatorChange({ ...selectedInsulator, unitMass: Number(e.target.value) })
                      }
                      className="w-full bg-transparent font-mono text-xs outline-none font-bold"
                    />
                  </div>

                  <div className={`${subCardBg} p-2 rounded-xl backdrop-blur-sm`}>
                    <span className={`text-[9px] ${labelText} uppercase block mb-0.5`}>加挂重锤 (kg)</span>
                    <input
                      type="number"
                      value={selectedInsulator.counterWeightKg || 0}
                      onChange={(e) =>
                        handleLeftInsulatorChange({ ...selectedInsulator, counterWeightKg: Number(e.target.value) })
                      }
                      className="w-full bg-transparent text-white font-mono text-xs outline-none font-bold"
                    />
                  </div>

                  <div className={`${subCardBg} p-2 rounded-xl backdrop-blur-sm`}>
                    <span className={`text-[9px] ${labelText} uppercase block mb-0.5`}>统一爬比距 (mm/kV)</span>
                    <input
                      type="number"
                      step="0.1"
                      value={creepageRatio}
                      onChange={(e) => setCreepageRatio(Number(e.target.value))}
                      className="w-full bg-transparent font-mono text-xs outline-none font-bold"
                    />
                  </div>

                  <div className={`${subCardBg} p-2 rounded-xl backdrop-blur-sm`}>
                    <span className={`text-[9px] ${labelText} uppercase block mb-0.5 flex justify-between`}>
                      <span>整串重量 G_ins (kg)</span>
                    </span>
                    <input
                      type="number"
                      step="0.5"
                      placeholder={`自动 (${autoLeftWeight.toFixed(1)} kg)`}
                      value={selectedInsulator.customTotalWeightKg ?? ''}
                      onChange={(e) =>
                        handleLeftInsulatorChange({
                          ...selectedInsulator,
                          customTotalWeightKg: e.target.value !== '' ? Number(e.target.value) : undefined,
                        })
                      }
                      className="w-full bg-transparent text-emerald-400 font-mono text-xs outline-none font-bold"
                    />
                  </div>

                  <div className={`${subCardBg} p-2 rounded-xl backdrop-blur-sm`}>
                    <span className={`text-[9px] ${labelText} uppercase block mb-0.5 flex justify-between`}>
                      <span>受风面积 A_ins (m²)</span>
                    </span>
                    <input
                      type="number"
                      step="0.05"
                      placeholder={`自动 (${autoLeftArea.toFixed(2)} m²)`}
                      value={selectedInsulator.customWindAreaM2 ?? ''}
                      onChange={(e) =>
                        handleLeftInsulatorChange({
                          ...selectedInsulator,
                          customWindAreaM2: e.target.value !== '' ? Number(e.target.value) : undefined,
                        })
                      }
                      className="w-full bg-transparent text-cyan-400 font-mono text-xs outline-none font-bold"
                    />
                  </div>
                </div>
              </div>
            )}

            {/* Right Insulator Form */}
            {activeInsulatorTab === 'right' && (
              <div className="space-y-2">
                <span className="text-[10px] font-semibold uppercase text-cyan-400 tracking-wider block">
                  右侧杆塔 (B) 绝缘子型式
                </span>

                {syncRightInsulator && (
                  <div className="p-2 rounded-lg bg-cyan-950/30 border border-cyan-800/50 text-[11px] text-cyan-200 flex items-center justify-between backdrop-blur-sm">
                    <span>当前已开启“左右对称”，改变右侧将自动取消对称镜像。</span>
                    <button
                      type="button"
                      onClick={() => setSyncRightInsulator(false)}
                      className="text-cyan-400 font-bold hover:underline shrink-0 cursor-pointer"
                    >
                      转为独立配置
                    </button>
                  </div>
                )}

                <select
                  id="select-insulator-right"
                  value={selectedRightInsulator?.id || PRESET_INSULATORS[0].id}
                  onChange={(e) => {
                    const found = PRESET_INSULATORS.find((i) => i.id === e.target.value);
                    if (found) handleRightInsulatorChange(found);
                  }}
                  className={`w-full ${inputBg} rounded-xl p-2 font-mono text-xs focus:ring-2 focus:ring-cyan-500/50 outline-none cursor-pointer backdrop-blur-sm`}
                >
                  {PRESET_INSULATORS.map((i) => (
                    <option key={i.id} value={i.id} className={selectOptionBg}>
                      {i.name} ({i.material}, 爬距:{i.creepageDistance}mm)
                    </option>
                  ))}
                </select>

                <div className="grid grid-cols-2 gap-2 pt-1">
                  <div className={`col-span-2 ${subCardBg} p-2 rounded-xl backdrop-blur-sm`}>
                    <span className={`text-[9px] ${labelText} uppercase block mb-1`}>串型结构 (String Type)</span>
                    <select
                      value={selectedRightInsulator?.stringType || 'single_I'}
                      onChange={(e) =>
                        handleRightInsulatorChange({
                          ...(selectedRightInsulator || selectedInsulator),
                          stringType: e.target.value as any,
                        })
                      }
                      className="w-full bg-transparent font-mono text-xs outline-none cursor-pointer"
                    >
                      <option value="single_I" className={selectOptionBg}>单I型悬垂绝缘子串 (自由风偏)</option>
                      <option value="double_I" className={selectOptionBg}>双I型悬垂绝缘子串 (自重抑偏)</option>
                      <option value="V_string" className={selectOptionBg}>V型悬垂绝缘子串 (刚性抗风偏)</option>
                      <option value="tension" className={selectOptionBg}>耐张绝缘子串 (沿导线拉紧, 0°风偏)</option>
                    </select>
                  </div>

                  {selectedRightInsulator?.stringType === 'V_string' && (
                    <div className={`col-span-2 ${subCardBg} p-2 rounded-xl backdrop-blur-sm`}>
                      <span className={`text-[9px] ${labelText} uppercase block mb-0.5`}>V型串夹角 θ_v (°)</span>
                      <input
                        type="number"
                        value={selectedRightInsulator.vAngle || 90}
                        onChange={(e) =>
                          handleRightInsulatorChange({
                            ...(selectedRightInsulator || selectedInsulator),
                            vAngle: Number(e.target.value),
                          })
                        }
                        className="w-full bg-transparent text-cyan-400 font-mono text-xs outline-none font-bold"
                      />
                    </div>
                  )}

                  <div className={`${subCardBg} p-2 rounded-xl backdrop-blur-sm`}>
                    <span className={`text-[9px] ${labelText} uppercase block mb-0.5`}>单片结构高度 (mm)</span>
                    <input
                      type="number"
                      value={selectedRightInsulator?.structureHeight || 146}
                      onChange={(e) =>
                        handleRightInsulatorChange({
                          ...(selectedRightInsulator || selectedInsulator),
                          structureHeight: Number(e.target.value),
                        })
                      }
                      className="w-full bg-transparent font-mono text-xs outline-none font-bold"
                    />
                  </div>

                  <div className={`${subCardBg} p-2 rounded-xl backdrop-blur-sm`}>
                    <span className={`text-[9px] ${labelText} uppercase block mb-0.5`}>单片质量 (kg)</span>
                    <input
                      type="number"
                      step="0.1"
                      value={selectedRightInsulator?.unitMass || 6.0}
                      onChange={(e) =>
                        handleRightInsulatorChange({
                          ...(selectedRightInsulator || selectedInsulator),
                          unitMass: Number(e.target.value),
                        })
                      }
                      className="w-full bg-transparent font-mono text-xs outline-none font-bold"
                    />
                  </div>

                  <div className={`${subCardBg} p-2 rounded-xl backdrop-blur-sm`}>
                    <span className={`text-[9px] ${labelText} uppercase block mb-0.5`}>加挂重锤 (kg)</span>
                    <input
                      type="number"
                      value={selectedRightInsulator?.counterWeightKg || 0}
                      onChange={(e) =>
                        handleRightInsulatorChange({
                          ...(selectedRightInsulator || selectedInsulator),
                          counterWeightKg: Number(e.target.value),
                        })
                      }
                      className="w-full bg-transparent text-white font-mono text-xs outline-none font-bold"
                    />
                  </div>

                  <div className={`${subCardBg} p-2 rounded-xl backdrop-blur-sm`}>
                    <span className={`text-[9px] ${labelText} uppercase block mb-0.5`}>统一爬比距 (mm/kV)</span>
                    <input
                      type="number"
                      step="0.1"
                      value={creepageRatio}
                      onChange={(e) => setCreepageRatio(Number(e.target.value))}
                      className="w-full bg-transparent font-mono text-xs outline-none font-bold"
                    />
                  </div>

                  <div className={`${subCardBg} p-2 rounded-xl backdrop-blur-sm`}>
                    <span className={`text-[9px] ${labelText} uppercase block mb-0.5 flex justify-between`}>
                      <span>整串重量 G_ins (kg)</span>
                    </span>
                    <input
                      type="number"
                      step="0.5"
                      placeholder={`自动 (${autoRightWeight.toFixed(1)} kg)`}
                      value={selectedRightInsulator?.customTotalWeightKg ?? ''}
                      onChange={(e) =>
                        handleRightInsulatorChange({
                          ...(selectedRightInsulator || selectedInsulator),
                          customTotalWeightKg: e.target.value !== '' ? Number(e.target.value) : undefined,
                        })
                      }
                      className="w-full bg-transparent text-emerald-400 font-mono text-xs outline-none font-bold"
                    />
                  </div>

                  <div className={`${subCardBg} p-2 rounded-xl backdrop-blur-sm`}>
                    <span className={`text-[9px] ${labelText} uppercase block mb-0.5 flex justify-between`}>
                      <span>受风面积 A_ins (m²)</span>
                    </span>
                    <input
                      type="number"
                      step="0.05"
                      placeholder={`自动 (${autoRightArea.toFixed(2)} m²)`}
                      value={selectedRightInsulator?.customWindAreaM2 ?? ''}
                      onChange={(e) =>
                        handleRightInsulatorChange({
                          ...(selectedRightInsulator || selectedInsulator),
                          customWindAreaM2: e.target.value !== '' ? Number(e.target.value) : undefined,
                        })
                      }
                      className="w-full bg-transparent text-cyan-400 font-mono text-xs outline-none font-bold"
                    />
                  </div>
                </div>
              </div>
            )}
          </div>
          );
        })()}
      </div>

      {/* 5. Crossing Obstacles Section */}
      <div className={`${cardBg} rounded-2xl overflow-hidden`}>
        <button
          onClick={() => toggleSection('obstacles')}
          className={`w-full flex items-center justify-between p-3 ${headerBtnBg} font-semibold text-xs tracking-wide transition-all`}
        >
          <span className="flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-sky-400" />
            <span>交叉跨越物净空距离校验 ({obstacles.length})</span>
          </span>
          {openSections.obstacles ? (
            <ChevronUp className="w-4 h-4 text-slate-400" />
          ) : (
            <ChevronDown className="w-4 h-4 text-slate-400" />
          )}
        </button>

        {openSections.obstacles && (
          <div className="p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-200 text-[11px]">跨越物清单</span>
              <button
                id="btn-add-obstacle"
                onClick={addObstacle}
                className="flex items-center space-x-1 px-2.5 py-1 bg-sky-500/20 hover:bg-sky-500/30 text-sky-400 rounded-lg text-[10px] font-semibold uppercase border border-sky-500/40 transition-all cursor-pointer"
              >
                <Plus className="w-3 h-3" />
                <span>添加跨越物</span>
              </button>
            </div>

            {obstacles.length === 0 ? (
              <p className="text-slate-400 italic py-2 text-center text-[10px]">点击上方按钮可新增道路/树木/交叉线路跨越。</p>
            ) : (
              <div className="space-y-2">
                {obstacles.map((obs) => (
                  <div key={obs.id} className={`${subCardBg} p-2.5 rounded-xl space-y-1.5 backdrop-blur-sm`}>
                    <div className="flex items-center justify-between">
                      <input
                        type="text"
                        value={obs.name}
                        onChange={(e) => updateObstacle(obs.id, 'name', e.target.value)}
                        className="bg-transparent font-semibold border-b border-slate-700 focus:border-sky-400 px-1 py-0.5 w-28 text-xs font-mono outline-none"
                      />
                      <button
                        onClick={() => removeObstacle(obs.id)}
                        className="text-red-400 hover:text-red-300 p-1 rounded-lg hover:bg-red-950/40 transition-colors cursor-pointer"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="grid grid-cols-3 gap-1.5 text-[10px]">
                      <div className={`${subCardBg} p-1.5 rounded-lg`}>
                        <span className={`text-[8px] ${labelText} block font-mono`}>距左塔(m)</span>
                        <input
                          type="number"
                          value={obs.distanceFromLeftTower}
                          onChange={(e) => updateObstacle(obs.id, 'distanceFromLeftTower', Number(e.target.value))}
                          className="w-full bg-transparent text-white font-mono font-bold text-xs outline-none"
                        />
                      </div>

                      <div className={`${subCardBg} p-1.5 rounded-lg`}>
                        <span className={`text-[8px] ${labelText} block font-mono`}>障碍高(m)</span>
                        <input
                          type="number"
                          value={obs.obstacleHeight}
                          onChange={(e) => updateObstacle(obs.id, 'obstacleHeight', Number(e.target.value))}
                          className="w-full bg-transparent text-white font-mono font-bold text-xs outline-none"
                        />
                      </div>

                      <div className={`${subCardBg} p-1.5 rounded-lg`}>
                        <span className={`text-[8px] ${labelText} block font-mono`}>要求净空(m)</span>
                        <input
                          type="number"
                          value={obs.requiredClearance}
                          onChange={(e) => updateObstacle(obs.id, 'requiredClearance', Number(e.target.value))}
                          className="w-full bg-transparent text-white font-mono font-bold text-xs outline-none"
                        />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Formula Calculation Modal (Fallback if not handled by root level) */}
      {!onOpenFormulaModal && (
        <FormulaModal
          isOpen={localFormulaModalState.isOpen}
          onClose={() => setLocalFormulaModalState((prev) => ({ ...prev, isOpen: false }))}
          initialTab={localFormulaModalState.tab}
          insulatorRes={insulatorRes}
          conductor={selectedConductor}
          insulator={selectedInsulator}
          tower={tower}
          windCondition={conditions.find((c) => c.id === selectedConditionId)}
        />
      )}

      {/* Normative Table Lookup Modal */}
      <NormativeTableModal
        isOpen={normativeTableModal.isOpen}
        onClose={() => setNormativeTableModal((prev) => ({ ...prev, isOpen: false }))}
        initialTable={normativeTableModal.tab}
        currentZ={tower?.averageHeight || 20}
        currentTerrain={tower?.terrainCategory || 'B'}
        currentWindSpeed={conditions.find((c) => c.id === selectedConditionId)?.windSpeed || 25}
        currentLineType={tower?.lineType || 'general'}
      />
    </div>
  );
};
