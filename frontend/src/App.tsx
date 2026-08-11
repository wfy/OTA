import React, { useState, useMemo } from 'react';
import {
  Conductor,
  Insulator,
  TowerParameters,
  WorkingCondition,
  CrossingObstacle,
  MeteorologicalZone,
} from './types';
import { PRESET_CONDUCTORS, PRESET_INSULATORS } from './data/conductors';
import { TYPICAL_METEOROLOGICAL_ZONES } from './data/meteorology';
import { calculateAllConditions } from './utils/conductorPhysics';
import { calculateInsulatorWindSwing } from './utils/insulatorPhysics';
import { Header } from './components/Header';
import { ParamInputs } from './components/ParamInputs';
import { ProfileViewer } from './components/ProfileViewer';
import { ChartsView } from './components/ChartsView';
import { WindSwingViewer } from './components/WindSwingViewer';
import { StringingTable } from './components/StringingTable';
import { ComplianceReport } from './components/ComplianceReport';
import { AiAssistant } from './components/AiAssistant';
import { FormulaModal } from './components/FormulaModal';
import { PointCloudCorridorViewer } from './components/PointCloudCorridorViewer';
import { Sliders, Table, ChevronDown, ChevronUp, X, Sparkles } from 'lucide-react';

export default function App() {
  const [voltageLevel, setVoltageLevel] = useState<number>(220);
  const [activeTab, setActiveTab] = useState<
    'profile' | 'charts' | 'stringing' | 'compliance' | 'windswing'
  >('profile');

  // Floating Overlay Panels Visibility State
  const [showSidebar, setShowSidebar] = useState<boolean>(true);
  const [showTable, setShowTable] = useState<boolean>(true);
  const [showHeader, setShowHeader] = useState<boolean>(true);
  const [uiMode, setUiMode] = useState<'pinned' | 'auto-hide'>('pinned');
  const [selectedConditionId, setSelectedConditionId] = useState<string>('max-wind');

  // Profile Simulation States
  const [viewDimension, setViewDimension] = useState<'3d' | '2d'>('3d');
  const [is2dModalOpen, setIs2dModalOpen] = useState<boolean>(false);
  const [isIceJumping, setIsIceJumping] = useState<boolean>(false);
  const [showAllOverlay, setShowAllOverlay] = useState<boolean>(true);
  const [isPointCloudModalOpen, setIsPointCloudModalOpen] = useState<boolean>(false);
  const [formulaModalState, setFormulaModalState] = useState<{
    isOpen: boolean;
    tab: 'conductor' | 'insulator';
  }>({ isOpen: false, tab: 'conductor' });

  const triggerIceJump = () => {
    setIsIceJumping(true);
    setTimeout(() => {
      setIsIceJumping(false);
    }, 1800);
  };

  // Parameters State
  const [selectedConductor, setSelectedConductor] = useState<Conductor>(
    PRESET_CONDUCTORS[1] // LGJ-240/30
  );
  const [selectedInsulator, setSelectedInsulator] = useState<Insulator>(
    PRESET_INSULATORS[1] // XP-160
  );
  const [selectedRightInsulator, setSelectedRightInsulator] = useState<Insulator>(
    PRESET_INSULATORS[1] // XP-160
  );
  const [selectedZone, setSelectedZone] = useState<MeteorologicalZone>(
    TYPICAL_METEOROLOGICAL_ZONES[0]
  );

  const [tower, setTower] = useState<TowerParameters>({
    towerStructureType: 'angle_steel',
    leftTowerStructureType: 'angle_steel',
    rightTowerStructureType: 'angle_steel',
    leftTowerHeight: 32,
    rightTowerHeight: 32,
    leftAttachmentHeight: 28,
    rightAttachmentHeight: 28,
    spanLength: 350,
    horizontalSpan: 350,
    leftHorizontalSpan: 350,
    rightHorizontalSpan: 350,
    leftVerticalSpan: 350,
    rightVerticalSpan: 350,
    kvValue: 1.0,
    leftKvValue: 1.0,
    rightKvValue: 1.0,
    heightDifference: 0,
    elevation: 200,
    voltageLevel: 220,
    numSubConductors: 2,
    subConductorSpacing: 400,
    landType: 'agricultural',
  });

  const [creepageRatio, setCreepageRatio] = useState<number>(25.2);

  const [conditions, setConditions] = useState<WorkingCondition[]>([
    { id: 'min-temp', name: '最低气温工况', temp: -10, windSpeed: 0, iceThickness: 0, isControlCandidate: true },
    { id: 'max-wind', name: '最大风速工况', temp: 10, windSpeed: 25, iceThickness: 0, isControlCandidate: true },
    { id: 'max-ice', name: '设计覆冰工况', temp: -5, windSpeed: 10, iceThickness: 5, isControlCandidate: true },
    { id: 'avg-temp', name: '年均气温工况', temp: 15, windSpeed: 0, iceThickness: 0, isControlCandidate: true },
    { id: 'max-temp', name: '最高气温工况', temp: 40, windSpeed: 0, iceThickness: 0, isControlCandidate: false },
    { id: 'install', name: '施工安装工况', temp: 15, windSpeed: 0, iceThickness: 0, isControlCandidate: false },
  ]);

  const [obstacles, setObstacles] = useState<CrossingObstacle[]>([
    {
      id: 'obs-1',
      name: '二级公路',
      type: 'road',
      distanceFromLeftTower: 175,
      elevationOffset: 0,
      obstacleHeight: 4.5,
      requiredClearance: 6.5,
    },
  ]);

  const [isAiOpen, setIsAiOpen] = useState<boolean>(false);

  // Sync Voltage Level with Tower state and presets
  const handleVoltageChange = (newVoltage: number) => {
    setVoltageLevel(newVoltage);
    setTower((prev) => ({
      ...prev,
      voltageLevel: newVoltage,
      numSubConductors: newVoltage >= 750 ? 6 : newVoltage >= 500 ? 4 : newVoltage >= 220 ? 2 : 1,
      leftAttachmentHeight: newVoltage >= 500 ? 38 : newVoltage >= 220 ? 28 : 22,
      rightAttachmentHeight: newVoltage >= 500 ? 38 : newVoltage >= 220 ? 28 : 22,
    }));
  };

  // Perform State Equation Mechanics Calculation
  const { results, governingConditionId } = useMemo(() => {
    return calculateAllConditions(selectedConductor, conditions, tower);
  }, [selectedConductor, conditions, tower]);

  const govResult = results.find((r) => r.isGoverningCondition) || results[0];
  const maxTension = Math.max(...results.map((r) => r.tension));
  const avgTempResult = results.find((r) => r.conditionId === 'avg-temp') || results[0];
  const maxSagResult = results.find((r) => r.conditionId === 'max-temp') || results[0];

  // Insulator Calculations
  const windCondition = conditions.find((c) => c.id === 'max-wind') || conditions[1];
  const insulatorRes = useMemo(() => {
    const lhA = tower.leftHorizontalSpan !== undefined && tower.leftHorizontalSpan > 0 
      ? tower.leftHorizontalSpan 
      : ((tower.horizontalSpan && tower.horizontalSpan > 0) ? tower.horizontalSpan : tower.spanLength);
    const leftLv = tower.leftVerticalSpan !== undefined ? tower.leftVerticalSpan : (tower.leftKvValue !== undefined ? tower.leftKvValue * lhA : lhA);
    const leftKv = lhA > 0 ? leftLv / lhA : 1.0;
    const towerA = { ...tower, horizontalSpan: lhA, leftHorizontalSpan: lhA };
    return calculateInsulatorWindSwing(
      selectedInsulator,
      selectedConductor,
      towerA,
      windCondition,
      selectedInsulator.material === 'composite' ? 1 : 13,
      undefined,
      selectedInsulator.counterWeightKg || 0,
      selectedInsulator.vAngle || 90,
      leftKv
    );
  }, [selectedInsulator, selectedConductor, tower, windCondition]);

  const rightInsulatorRes = useMemo(() => {
    const lhB = tower.rightHorizontalSpan !== undefined && tower.rightHorizontalSpan > 0 
      ? tower.rightHorizontalSpan 
      : ((tower.horizontalSpan && tower.horizontalSpan > 0) ? tower.horizontalSpan : tower.spanLength);
    const rightLv = tower.rightVerticalSpan !== undefined ? tower.rightVerticalSpan : (tower.rightKvValue !== undefined ? tower.rightKvValue * lhB : (tower.leftKvValue !== undefined ? tower.leftKvValue * lhB : lhB));
    const rightKv = lhB > 0 ? rightLv / lhB : 1.0;
    const towerB = { ...tower, horizontalSpan: lhB, rightHorizontalSpan: lhB };
    return calculateInsulatorWindSwing(
      selectedRightInsulator,
      selectedConductor,
      towerB,
      windCondition,
      selectedRightInsulator.material === 'composite' ? 1 : 13,
      undefined,
      selectedRightInsulator.counterWeightKg || 0,
      selectedRightInsulator.vAngle || 90,
      rightKv
    );
  }, [selectedRightInsulator, selectedConductor, tower, windCondition]);

  // Context bundle for AI assistant
  const aiContextData = {
    voltageLevel,
    conductor: selectedConductor,
    insulator: selectedInsulator,
    rightInsulator: selectedRightInsulator,
    tower,
    governingCondition: govResult,
    allConditionResults: results,
    insulatorAnalysis: insulatorRes,
    rightInsulatorAnalysis: rightInsulatorRes,
  };

  return (
    <div className="relative w-screen h-screen overflow-hidden bg-[#070a12] text-slate-100 font-sans selection:bg-cyan-500 selection:text-slate-950 transition-colors duration-300">
      {/* 1. Full-Screen Main Visualization Stage (Default Backdrop Canvas) */}
      <main className="absolute inset-0 z-0 w-full h-full overflow-hidden">
        {activeTab === 'profile' && (
          <div className="w-full h-full">
            <ProfileViewer
              tower={tower}
              results={results}
              obstacles={obstacles}
              conductor={selectedConductor}
              insulator={selectedInsulator}
              insulatorRes={insulatorRes}
              rightInsulator={selectedRightInsulator}
              rightInsulatorRes={rightInsulatorRes}
              selectedConditionId={selectedConditionId}
              setSelectedConditionId={setSelectedConditionId}
              viewDimension={viewDimension}
              setViewDimension={setViewDimension}
              is2dModalOpen={is2dModalOpen}
              setIs2dModalOpen={setIs2dModalOpen}
              isIceJumping={isIceJumping}
              triggerIceJump={triggerIceJump}
              showAllOverlay={showAllOverlay}
              setShowAllOverlay={setShowAllOverlay}
            />
          </div>
        )}

        {activeTab === 'charts' && (
          <div className="w-full h-full overflow-auto p-4 pb-28 bg-slate-950/75 text-slate-100 backdrop-blur-2xl">
            <ChartsView
              conductor={selectedConductor}
              tower={tower}
              conditions={conditions}
              govResult={govResult}
            />
          </div>
        )}

        {activeTab === 'windswing' && (
          <div className="w-full h-full overflow-auto p-4 pb-28 bg-slate-950/75 text-slate-100 backdrop-blur-2xl">
            <WindSwingViewer
              tower={tower}
              conductor={selectedConductor}
              insulator={selectedInsulator}
              windCondition={windCondition}
              insulatorCount={insulatorRes.finalCount}
            />
          </div>
        )}

        {activeTab === 'stringing' && (
          <div className="w-full h-full overflow-auto p-4 pb-28 bg-slate-950/75 text-slate-100 backdrop-blur-2xl">
            <StringingTable
              conductor={selectedConductor}
              tower={tower}
              conditions={conditions}
            />
          </div>
        )}

        {activeTab === 'compliance' && (
          <div className="w-full h-full overflow-auto p-4 pb-28 bg-slate-950/75 text-slate-100 backdrop-blur-2xl">
            <ComplianceReport
              conductor={selectedConductor}
              tower={tower}
              maxTension={maxTension}
              avgTension={avgTempResult.tension}
              maxSag={maxSagResult.sag}
              insulatorRes={insulatorRes}
            />
          </div>
        )}
      </main>

      {/* 2. Floating Top CAD Toolbar Header */}
      {showHeader ? (
        <div
          className={`fixed top-2 left-1/2 -translate-x-1/2 z-40 max-w-6xl w-[calc(100%-1rem)] transition-all duration-300 ease-in-out ${
            uiMode === 'auto-hide'
              ? '-translate-y-[calc(100%-16px)] opacity-60 hover:translate-y-0 hover:opacity-100'
              : 'translate-y-0 opacity-100'
          }`}
        >
          <Header
            voltageLevel={voltageLevel}
            onVoltageChange={handleVoltageChange}
            activeTab={activeTab}
            setActiveTab={setActiveTab}
            toggleAiAssistant={() => setIsAiOpen(!isAiOpen)}
            isAiOpen={isAiOpen}
            showSidebar={showSidebar}
            setShowSidebar={setShowSidebar}
            showTable={showTable}
            setShowTable={setShowTable}
            showHeader={showHeader}
            setShowHeader={setShowHeader}
            uiMode={uiMode}
            setUiMode={setUiMode}
            results={results}
            selectedConditionId={selectedConditionId}
            onConditionChange={setSelectedConditionId}
            viewDimension={viewDimension}
            onViewDimensionChange={setViewDimension}
            onOpen2DModal={() => setIs2dModalOpen(true)}
            onOpenFormulaModal={(tab) =>
              setFormulaModalState({ isOpen: true, tab: tab || 'conductor' })
            }
            onOpenPointCloudModal={() => setIsPointCloudModalOpen(true)}
            onTriggerIceJump={triggerIceJump}
            isIceJumping={isIceJumping}
            showAllOverlay={showAllOverlay}
            setShowAllOverlay={setShowAllOverlay}
          />
        </div>
      ) : (
        /* Minimized Floating Top CAD Toolbar Toggle Button */
        <button
          onClick={() => setShowHeader(true)}
          className="fixed top-2 left-1/2 -translate-x-1/2 z-40 px-4 py-1.5 text-xs font-semibold rounded-2xl glass-button text-cyan-300 shadow-2xl hover:bg-white/10 transition-all flex items-center gap-1.5 uppercase"
        >
          <ChevronDown className="w-4 h-4 text-cyan-400" />
          <span>展开 CAD 工具栏与切换选项</span>
        </button>
      )}

      {/* 3. Floating Left Parameter Sidebar */}
      {showSidebar ? (
        <div
          className={`fixed left-2 top-16 bottom-2 w-[310px] sm:w-[340px] z-30 flex flex-col glass-panel text-slate-100 rounded-2xl shadow-2xl overflow-hidden transition-all duration-300 ease-in-out ${
            uiMode === 'auto-hide'
              ? '-translate-x-[calc(100%-18px)] opacity-55 hover:translate-x-0 hover:opacity-100'
              : 'translate-x-0 opacity-100'
          }`}
        >
          {/* Sidebar Header */}
          <div className="bg-slate-900/30 border-b border-white/10 p-2.5 flex items-center justify-between text-xs font-semibold backdrop-blur-xl">
            <span className="flex items-center gap-2 uppercase tracking-wider text-[11px]">
              <Sliders className="w-3.5 h-3.5 text-cyan-400" />
              <span>工程物理参数控制面板</span>
            </span>
            <div className="flex items-center space-x-1">
              <button
                onClick={() => setUiMode((prev) => (prev === 'pinned' ? 'auto-hide' : 'pinned'))}
                className="p-1 hover:bg-slate-500/20 text-slate-400 hover:text-cyan-400 transition-colors rounded-lg border border-slate-700/30"
                title={uiMode === 'pinned' ? '固定常显示 (点击切换为边缘自动检测)' : '边缘自动检测 (点击固定常显示)'}
              >
                <span className="text-[10px] font-mono px-1">{uiMode === 'pinned' ? '📌' : '👁️'}</span>
              </button>
              <button
                onClick={() => setShowSidebar(false)}
                className="p-1 hover:bg-slate-500/20 text-slate-400 hover:text-slate-100 transition-colors rounded-lg border border-slate-700/30"
                title="折叠侧边栏"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Sidebar Body */}
          <div className="flex-1 overflow-y-auto p-2 scrollbar-thin scrollbar-thumb-slate-700/30">
            <ParamInputs
              selectedConductor={selectedConductor}
              setSelectedConductor={setSelectedConductor}
              selectedInsulator={selectedInsulator}
              setSelectedInsulator={setSelectedInsulator}
              selectedRightInsulator={selectedRightInsulator}
              setSelectedRightInsulator={setSelectedRightInsulator}
              selectedZone={selectedZone}
              setSelectedZone={setSelectedZone}
              tower={tower}
              setTower={setTower}
              conditions={conditions}
              setConditions={setConditions}
              creepageRatio={creepageRatio}
              setCreepageRatio={setCreepageRatio}
              obstacles={obstacles}
              setObstacles={setObstacles}
              results={results}
              selectedConditionId={selectedConditionId}
              setSelectedConditionId={setSelectedConditionId}
              onOpenFormulaModal={(tab) =>
                setFormulaModalState({ isOpen: true, tab: tab || 'conductor' })
              }
              insulatorRes={insulatorRes}
            />
          </div>
        </div>
      ) : (
        /* Floating Trigger Button when Sidebar is Hidden */
        <button
          onClick={() => setShowSidebar(true)}
          className="fixed left-2 top-16 z-30 px-3 py-2 rounded-xl text-xs font-semibold glass-button text-cyan-300 shadow-2xl flex items-center gap-2 transition-all cursor-pointer"
          title="展开工程参数侧边栏"
        >
          <Sliders className="w-4 h-4 text-cyan-400" />
          <span>展开参数侧栏</span>
        </button>
      )}

      {/* 5. Floating AI Assistant Drawer */}
      <AiAssistant
        isOpen={isAiOpen}
        onClose={() => setIsAiOpen(false)}
        contextData={aiContextData}
      />

      {/* 6. Formula & Physics Calculation Workflow Modal */}
      <FormulaModal
        isOpen={formulaModalState.isOpen}
        initialTab={formulaModalState.tab}
        onClose={() => setFormulaModalState((prev) => ({ ...prev, isOpen: false }))}
        insulatorRes={insulatorRes}
        conductor={selectedConductor}
        insulator={selectedInsulator}
        tower={tower}
        windCondition={conditions.find((c) => c.id === selectedConditionId)}
      />

      {/* 7. Corridor LiDAR Point Cloud & Google Earth 3D Engine Modal */}
      <PointCloudCorridorViewer
        isOpen={isPointCloudModalOpen}
        onClose={() => setIsPointCloudModalOpen(false)}
        tower={tower}
        conductor={selectedConductor}
        results={results}
        selectedConditionId={selectedConditionId}
      />
    </div>
  );
}
