export interface Conductor {
  id: string;
  name: string; // e.g. "LGJ-240/30"
  type: 'ACSR' | 'AACSR' | 'JL/G1A' | 'JL/G3A' | 'Custom';
  totalArea: number; // mm²
  aluminumArea: number; // mm²
  steelArea: number; // mm²
  outerDiameter: number; // mm
  unitMass: number; // kg/m
  ratedStrength: number; // N (RTS / Tp)
  elasticModulus: number; // N/mm² (E)
  thermalExpansion: number; // 1/°C (α)
  maxAllowableTemp: number; // °C (e.g., 70 or 80)
  bundleNumber?: number; // 分裂根数 n (1, 2, 3, 4, 6, 8)
  windShapeFactor?: number; // 体型系数 μ_sc
  iceWindCoeff?: number; // 覆冰风荷载增大系数 B1
}

export type InsulatorStringType = 'single_I' | 'double_I' | 'V_string' | 'tension' | 'post';

export interface Insulator {
  id: string;
  name: string; // e.g. "XP-160"
  material: 'porcelain' | 'glass' | 'composite';
  stringType?: InsulatorStringType;
  vAngle?: number; // deg (e.g. 90° for V-string)
  structureHeight: number; // mm
  creepageDistance: number; // mm
  unitMass: number; // kg
  ratedLoad: number; // kN
  characteristicIndexM1: number; // m1 for altitude correction
  counterWeightKg?: number; // kg
  discDiameter?: number; // mm (盘径/结构结构外径, 默认盘形绝缘子 255mm)
  customTotalWeightKg?: number; // kg (绝缘子整串重量，0或未填时按片数自动计算)
  customWindAreaM2?: number; // m² (绝缘子受风面积，0或未填时按受风投影面积自动计算)
}

export interface MeteorologicalZone {
  id: string;
  name: string; // e.g. "典型气象区 I 区"
  maxTemp: number; // °C
  minTemp: number; // °C
  avgTemp: number; // °C
  maxWindSpeed: number; // m/s
  designIceThickness: number; // mm
  iceDensity: number; // g/cm³ (default 0.9)
  windWithIceSpeed: number; // m/s (default 10 or 15)
  iceTemp: number; // °C (default -5)
  windTemp: number; // °C
  installationTemp: number; // °C (default 15)
}

export interface WorkingCondition {
  id: string;
  name: string; // e.g. "最低气温", "大风", "覆冰", "年均温", "最高气温", "安装"
  temp: number; // °C
  windSpeed: number; // m/s
  iceThickness: number; // mm
  isControlCandidate: boolean; // Can be a governing control condition
  isMaxSagCandidate?: boolean;
}

export interface SpecificLoads {
  g1: number; // Conductor weight specific load [N/(m·mm²)]
  g2: number; // Ice weight specific load [N/(m·mm²)]
  g3: number; // Wind specific load without ice [N/(m·mm²)]
  g4: number; // Wind specific load with ice [N/(m·mm²)]
  g5: number; // Vertical specific load with ice g1 + g2 [N/(m·mm²)]
  g6: number; // Combined specific load without ice √(g1² + g3²) [N/(m·mm²)]
  g7: number; // Combined specific load with ice √(g5² + g4²) [N/(m·mm²)]
}

export interface ConditionCalcResult {
  conditionId: string;
  conditionName: string;
  temp: number;
  windSpeed: number;
  iceThickness: number;
  specificLoad: number; // γ_m [N/(m·mm²)]
  stress: number; // σ_m [N/mm²]
  tension: number; // T_m [N]
  safetyFactor: number; // K_c = T_p / T_m
  sag: number; // f [m]
  windAngle: number; // deg
  verticalSag: number; // f_v [m]
  horizontalSwing: number; // f_h [m]
  isGoverningCondition: boolean;
}

export type TowerStructureType = 'angle_steel' | 'steel_pipe';

export interface TowerParameters {
  towerType?: 'suspension' | 'tension'; // 悬垂塔 vs 耐张塔
  towerStructureType?: TowerStructureType; // 全局杆塔结构型式: 'angle_steel' (角钢塔) | 'steel_pipe' (钢管塔)
  leftTowerStructureType?: TowerStructureType; // 左塔型式
  rightTowerStructureType?: TowerStructureType; // 右塔型式
  leftTowerHeight: number; // m
  rightTowerHeight: number; // m
  leftAttachmentHeight: number; // m
  rightAttachmentHeight: number; // m
  spanLength: number; // L_r (m) 代表档距（用于工况/状态方程力学计算）
  horizontalSpan?: number; // l_h (m) 视图档距（控制 2D/3D 可视化窗口中两塔水平排列距离）
  leftHorizontalSpan?: number; // l_hA (m) 左塔/A塔 水平档距 (l_1 + l_2)/2
  rightHorizontalSpan?: number; // l_hB (m) 右塔/B塔 水平档距 (l_2 + l_3)/2
  kvValue?: number; // K_v = L_v / L_h 杆塔垂直档距与水平档距的比值 (默认 1.0)
  leftKvValue?: number; // 左塔/A塔 K_v (l_vA / l_hA)
  rightKvValue?: number; // 右塔/B塔 K_v (l_vB / l_hB)
  leftVerticalSpan?: number; // 左塔/A塔 垂直档距 l_vA (m)
  rightVerticalSpan?: number; // 右塔/B塔 垂直档距 l_vB (m)
  heightDifference: number; // h = right - left (m)
  elevation: number; // H (m)
  voltageLevel: number; // kV (110, 220, 330, 500, 750, 1000)
  numSubConductors: number; // 分裂根数 (1, 2, 4, 6, 8)
  subConductorSpacing: number; // 分裂间距 (mm, e.g. 400, 450, 500)
  landType: 'residential' | 'non_residential' | 'agricultural' | 'difficult_transport';
  averageHeight?: number; // z (m) 导线平均挂线高度
  terrainCategory?: 'A' | 'B' | 'C' | 'D'; // 地貌粗糙度类别
  windAngleDeg?: number; // θ (°) 风向与导线方向夹角
  lineType?: 'general' | 'large_span'; // 线路类型: 一般线路 vs 大跨越
}

export interface CrossingObstacle {
  id: string;
  name: string;
  type: 'road' | 'railway' | 'tree' | 'powerline' | 'river' | 'custom';
  distanceFromLeftTower: number; // x position in span (m)
  elevationOffset: number; // ground level elevation delta at this x (m)
  obstacleHeight: number; // obstacle top height above ground (m)
  requiredClearance: number; // required clearance from code DL/T 5582 (m)
}

export interface ComplianceCheck {
  item: string;
  codeReference: string; // e.g. "DL/T 5582-2020 5.1.15"
  standardRequirement: string;
  calculatedValue: string;
  passed: boolean;
  notes: string;
}

export interface InsulatorCalcResult {
  creepageRequiredCount: number;
  altitudeCorrectedCount: number;
  finalCount: number;
  stringLength: number; // m
  stringType: InsulatorStringType;
  counterWeightMass: number; // kg
  stringTotalWeightKg: number; // kg (绝缘子整串重量)
  stringWindAreaM2: number; // m² (绝缘子受风面积)
  windLoadOnString: number; // kN
  conductorWindLoadOnString: number; // kN
  conductorWeightOnString: number; // kN
  insulatorWindSwingAngle: number; // deg (φ_ins)
  conductorWindAngle: number; // deg (φ_cond)
  horizontalDisplacement: number; // m (Δx_ins)
  verticalDropDisplacement: number; // m (Δy_ins)
  minAirClearanceRequired: number; // m
  actualClearanceToTower: number; // m
  clearancePassed: boolean;
  vStringLiftOff?: boolean; // whether wind force causes liftoff in V-string
  horizontalSpan?: number; // m (l_h 水平档距)
  verticalSpan?: number; // m (l_v 垂直档距)
  kvValue?: number; // K_v = l_v / l_h 档距比
}
