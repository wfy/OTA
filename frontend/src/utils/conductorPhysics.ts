import {
  Conductor,
  WorkingCondition,
  SpecificLoads,
  ConditionCalcResult,
  TowerParameters,
} from '../types';

const G_ACCEL = 9.81; // m/s²

/**
 * 表 9.3.1-1 风压高度变化系数 μ_z 查表/双向线性内插
 */
export function getMuZ(z: number, terrainCategory: 'A' | 'B' | 'C' | 'D' = 'B'): number {
  const tableHeight = [5, 10, 15, 20, 30, 40, 50, 60, 70, 80, 90, 100, 150, 200, 250, 300, 350, 400, 450, 500, 550];
  const tableValues: Record<'A' | 'B' | 'C' | 'D', number[]> = {
    A: [1.09, 1.28, 1.42, 1.52, 1.67, 1.79, 1.89, 1.97, 2.05, 2.12, 2.18, 2.23, 2.46, 2.64, 2.78, 2.91, 2.91, 2.91, 2.91, 2.91, 2.91],
    B: [1.00, 1.00, 1.13, 1.23, 1.39, 1.52, 1.62, 1.71, 1.79, 1.87, 1.93, 2.00, 2.25, 2.46, 2.63, 2.77, 2.91, 2.91, 2.91, 2.91, 2.91],
    C: [0.65, 0.65, 0.65, 0.74, 0.88, 1.00, 1.10, 1.20, 1.28, 1.36, 1.43, 1.50, 1.79, 2.03, 2.24, 2.43, 2.60, 2.76, 2.91, 2.91, 2.91],
    D: [0.51, 0.51, 0.51, 0.51, 0.51, 0.60, 0.69, 0.77, 0.84, 0.91, 0.98, 1.04, 1.33, 1.58, 1.81, 2.02, 2.22, 2.40, 2.58, 2.74, 2.91],
  };

  const vals = tableValues[terrainCategory] || tableValues.B;
  if (z <= tableHeight[0]) return vals[0];
  if (z >= tableHeight[tableHeight.length - 1]) return vals[vals.length - 1];

  for (let i = 0; i < tableHeight.length - 1; i++) {
    if (z >= tableHeight[i] && z <= tableHeight[i + 1]) {
      const h0 = tableHeight[i];
      const h1 = tableHeight[i + 1];
      const v0 = vals[i];
      const v1 = vals[i + 1];
      const ratio = (z - h0) / (h1 - h0);
      return v0 + ratio * (v1 - v0);
    }
  }
  return 1.0;
}

/**
 * 完整导地线风荷载及风压比载参数计算 (GB 50545 / DL/T 5092 规范 9.3 节)
 */
export function calculateWindLoadDetails(params: {
  windSpeed: number; // v0 (m/s)
  iceThickness: number; // b (mm)
  spanLength: number; // Lp (m)
  subDiameter: number; // d (mm)
  numSubConductors?: number; // n 分裂数 (默认1)
  subArea: number; // S (mm²) 单子导线截面积
  averageHeight?: number; // z (m) 导线平均高度
  terrainCategory?: 'A' | 'B' | 'C' | 'D'; // 地貌粗糙度类别
  windAngleDeg?: number; // θ (°)
  lineType?: 'general' | 'large_span'; // 一般线路 vs 大跨越
  forTensionCalc?: boolean; // 是否用于计算张力 (折减系数γ_c, ε_c取值差别)
  customWindShapeFactor?: number; // 自定义体型系数 μ_sc
  customIceWindCoeff?: number; // 自定义覆冰风荷载增大系数 B_1
}) {
  const {
    windSpeed,
    iceThickness,
    spanLength,
    subDiameter,
    numSubConductors = 1,
    subArea,
    averageHeight = 20,
    terrainCategory = 'B',
    windAngleDeg = 90,
    lineType = 'general',
    forTensionCalc = false,
    customWindShapeFactor,
    customIceWindCoeff,
  } = params;

  const v0 = windSpeed;
  const b = iceThickness;
  const Lp = Math.max(spanLength, 1);
  const d = subDiameter;
  const n = Math.max(numSubConductors, 1);
  const S_total = Math.max(n * subArea, 1);
  const z = Math.max(averageHeight, 5);

  // 1. 基准风压 W0 [kN/m²] (式 9.3.1-6)
  const W0 = (v0 * v0) / 1600;

  // 2. 地貌粗糙度参数 I10 与 α_rough
  const terrainParams = {
    A: { I10: 0.12, alpha: 0.12 },
    B: { I10: 0.14, alpha: 0.15 },
    C: { I10: 0.23, alpha: 0.22 },
    D: { I10: 0.39, alpha: 0.30 },
  }[terrainCategory] || { I10: 0.14, alpha: 0.15 };

  // 3. 湍流强度 Iz (式 9.3.1-3)
  const Iz = terrainParams.I10 * Math.pow(Math.max(z, 10) / 10, -terrainParams.alpha);

  // 4. 风荷载折减系数 γ_c (表 9.3.1-2)
  let gamma_c = 0.85;
  if (v0 < 20) {
    if (lineType === 'large_span') {
      gamma_c = 0.9;
    } else {
      gamma_c = forTensionCalc ? 0.9 : 0.85;
    }
  } else {
    // v0 >= 20 m/s
    if (lineType === 'large_span') {
      if (forTensionCalc) {
        gamma_c = -(1 / (5.42 + Math.exp(30.5 - v0))) + 0.88;
      } else {
        gamma_c = -(1 / (6.22 + Math.exp(30.4 - v0))) + 0.77;
      }
    } else {
      if (forTensionCalc) {
        gamma_c = -(1 / (5.97 + Math.exp(33.2 - 1.2 * v0))) + 0.83;
      } else {
        gamma_c = -(1 / (7.16 + Math.exp(32.5 - 1.2 * v0))) + 0.64;
      }
    }
  }

  // 5. 阵风系数 β_c (式 9.3.1-2)
  const g_peak = 3.6;
  const beta_c = gamma_c * (1 + 2 * g_peak * Iz);

  // 6. 档距相关性积分因子 δ_L (式 9.3.1-5)
  const Lx = 50; // 水平向相关函数积分长度
  const exp1 = Math.exp(-Lp / Lx);
  const exp2 = Math.exp((-2 * Lp) / Lx);
  const innerNumerator = 12 * Lx * Math.pow(Lp, 3) + 54 * Math.pow(Lx, 4) - 36 * Math.pow(Lx, 3) * Lp - 72 * Math.pow(Lx, 4) * exp1 + 18 * Math.pow(Lx, 4) * exp2;
  const delta_L = Math.sqrt(Math.max(innerNumerator, 0)) / (3 * Lp * Lp);

  // 7. 档距折减系数 α_L (式 9.3.1-4)
  const epsilon_c = forTensionCalc ? 0 : 1.0; // 脉动折减系数
  const alpha_L = (1 + 2 * g_peak * epsilon_c * Iz * delta_L) / (1 + 2 * g_peak * Iz);

  // 8. 风压高度变化系数 μ_z (表 9.3.1-1)
  const mu_z = getMuZ(z, terrainCategory);

  // 9. 导线体型系数 μ_sc
  let mu_sc = 1.0;
  if (customWindShapeFactor !== undefined && customWindShapeFactor > 0) {
    mu_sc = customWindShapeFactor;
  } else {
    mu_sc = b > 0 ? 1.2 : (d >= 17 ? 1.0 : 1.1);
  }

  // 10. 覆冰风荷载增大系数 B1
  let B1 = 1.0;
  if (customIceWindCoeff !== undefined && customIceWindCoeff > 0) {
    B1 = customIceWindCoeff;
  } else {
    if (forTensionCalc) {
      B1 = 1.0;
    } else {
      if (b >= 10) B1 = 1.2;
      else if (b >= 5) B1 = 1.1;
      else B1 = 1.0;
    }
  }

  // 11. 风向夹角 sin²θ
  const thetaRad = (windAngleDeg * Math.PI) / 180;
  const sin2Theta = Math.pow(Math.sin(thetaRad), 2);

  // 12. 导线计算受风外径 d_meter (m)
  const totalDiamMm = n * (d + 2 * b);
  const d_meter = totalDiamMm / 1000;

  // 13. 导线风荷载风偏设计值 W_x [kN] (式 9.3.1-1)
  const W_x = beta_c * alpha_L * W0 * mu_z * mu_sc * d_meter * Lp * B1 * sin2Theta;

  // 14. 换算单位长度风荷载 P_w [N/m]
  const P_w = (W_x * 1000) / Lp;

  // 15. 单位截面积水平风压比载 γ_wind [N/(m·mm²)]
  const gamma_wind = v0 > 0 ? P_w / S_total : 0;

  return {
    W0,
    Iz,
    gamma_c,
    beta_c,
    delta_L,
    alpha_L,
    mu_z,
    mu_sc,
    B1,
    sin2Theta,
    d_meter,
    totalDiamMm,
    W_x,
    P_w,
    gamma_wind,
  };
}

/**
 * Calculate specific loads (比荷 γ_1 to γ_7) in N/(m·mm²)
 */
export function calculateSpecificLoads(
  conductor: Conductor,
  windSpeed: number,
  iceThickness: number,
  spanLength: number,
  elevation: number = 0,
  towerParams?: Partial<TowerParameters>
): SpecificLoads {
  const n = conductor.bundleNumber || towerParams?.numSubConductors || 1;
  const S_single = conductor.totalArea; // mm²
  const S = S_single * n; // 总截面积 mm²
  const d = conductor.outerDiameter; // mm
  const m_single = conductor.unitMass; // kg/m
  const m = m_single * n; // 总质量 kg/m
  const b = iceThickness; // mm

  // 1. Conductor weight specific load g1 [N/(m·mm²)]
  const g1 = (m * G_ACCEL) / S;

  // 2. Ice weight specific load g2 [N/(m·mm²)]
  // Ice density = 0.9 g/cm³ = 900 kg/m³
  const iceDensityKgM3 = 900;
  const iceVolumePerMeterM3 = Math.PI * (b / 1000) * (d / 1000 + b / 1000) * n;
  const iceMassPerMeter = iceDensityKgM3 * iceVolumePerMeterM3; // kg/m
  const g2 = b > 0 ? (iceMassPerMeter * G_ACCEL) / S : 0;

  // 精细风荷载计算 (GB 50545 规范 9.3 节)
  const windDetailsNoIce = calculateWindLoadDetails({
    windSpeed,
    iceThickness: 0,
    spanLength,
    subDiameter: d,
    numSubConductors: n,
    subArea: S_single,
    averageHeight: towerParams?.averageHeight || 20,
    terrainCategory: towerParams?.terrainCategory || 'B',
    windAngleDeg: towerParams?.windAngleDeg || 90,
    lineType: towerParams?.lineType || 'general',
    customWindShapeFactor: conductor.windShapeFactor,
  });

  const windDetailsIce = calculateWindLoadDetails({
    windSpeed,
    iceThickness: b,
    spanLength,
    subDiameter: d,
    numSubConductors: n,
    subArea: S_single,
    averageHeight: towerParams?.averageHeight || 20,
    terrainCategory: towerParams?.terrainCategory || 'B',
    windAngleDeg: towerParams?.windAngleDeg || 90,
    lineType: towerParams?.lineType || 'general',
    customWindShapeFactor: conductor.windShapeFactor,
    customIceWindCoeff: conductor.iceWindCoeff,
  });

  // 3. Wind specific load without ice g3 [N/(m·mm²)]
  const g3 = windSpeed > 0 ? windDetailsNoIce.gamma_wind : 0;

  // 4. Wind specific load with ice g4 [N/(m·mm²)]
  const g4 = windSpeed > 0 && b > 0 ? windDetailsIce.gamma_wind : 0;

  // 5. Vertical specific load with ice g5 [N/(m·mm²)]
  const g5 = g1 + g2;

  // 6. Combined specific load without ice g6 [N/(m·mm²)]
  const g6 = Math.sqrt(g1 * g1 + g3 * g3);

  // 7. Combined specific load with ice g7 [N/(m·mm²)]
  const g7 = Math.sqrt(g5 * g5 + g4 * g4);

  return { g1, g2, g3, g4, g5, g6, g7 };
}

/**
 * Get appropriate specific load (γ) for a specific working condition
 */
export function getConditionSpecificLoad(
  conductor: Conductor,
  cond: WorkingCondition,
  spanLength: number,
  elevation: number = 0,
  towerParams?: Partial<TowerParameters>
): { gamma: number; loads: SpecificLoads } {
  const loads = calculateSpecificLoads(
    conductor,
    cond.windSpeed,
    cond.iceThickness,
    spanLength,
    elevation,
    towerParams
  );

  let gamma = loads.g1;
  if (cond.iceThickness > 0 && cond.windSpeed > 0) {
    gamma = loads.g7; // Ice + Wind
  } else if (cond.iceThickness > 0) {
    gamma = loads.g5; // Vertical Ice + Self
  } else if (cond.windSpeed > 0) {
    gamma = loads.g6; // Wind + Self
  } else {
    gamma = loads.g1; // Self Weight
  }

  return { gamma, loads };
}

/**
 * Solve State Equation for target stress σ_m:
 * σ_m³ + P * σ_m² = Q
 * where P = E * (γ_1 * L)² / (24 * σ_1²) + α * E * (t_m - t_1) - σ_1
 *       Q = E * (γ_m * L)² / 24
 */
export function solveStateEquation(
  sigma1: number,
  gamma1: number,
  t1: number,
  gammaM: number,
  tm: number,
  L: number,
  E: number,
  alpha: number
): number {
  const K1 = (E * Math.pow(gamma1 * L, 2)) / (24 * Math.pow(sigma1, 2));
  const P = K1 + alpha * E * (tm - t1) - sigma1;
  const Q = (E * Math.pow(gammaM * L, 2)) / 24;

  // Solve σ_m³ + P * σ_m² - Q = 0 using Newton-Raphson method
  let sigma = Math.max(sigma1, 10); // Initial guess
  for (let i = 0; i < 50; i++) {
    const f = Math.pow(sigma, 3) + P * Math.pow(sigma, 2) - Q;
    const fPrime = 3 * Math.pow(sigma, 2) + 2 * P * sigma;
    if (Math.abs(fPrime) < 1e-12) break;
    const delta = f / fPrime;
    sigma -= delta;
    if (Math.abs(delta) < 1e-6) break;
  }

  return Math.max(sigma, 0.1);
}

/**
 * Determine the controlling working condition (控制工况判别) and calculate state results across all conditions.
 * DL/T 5582 requires:
 * 1. Safety factor K_c >= 2.5 under maximum tension condition (Max Wind, Max Ice, Min Temp)
 * 2. Average tension under annual average temperature condition <= 16%~25% * Tp
 */
export function calculateAllConditions(
  conductor: Conductor,
  conditions: WorkingCondition[],
  tower: TowerParameters,
  safetyFactorTarget: number = 2.5, // Kc >= 2.5
  avgTensionRatioTarget: number = 0.20 // 20% default for EDT
): { results: ConditionCalcResult[]; governingConditionId: string } {
  const L = tower.spanLength;
  const E = conductor.elasticModulus;
  const alpha = conductor.thermalExpansion;
  const Tp = conductor.ratedStrength;
  const S = conductor.totalArea;

  const allowableMaxStress = (Tp / safetyFactorTarget) / S; // N/mm²
  const allowableAvgStress = (Tp * avgTensionRatioTarget) / S; // N/mm²

  // Evaluate candidate control conditions
  // Potential control candidates: Min Temp, Max Wind, Max Ice, Avg Temp
  let bestControlCondId = conditions[0].id;
  let highestRequiredControlStress = 0;

  // 1. Calculate trial mechanics assuming each candidate is at its exact allowable limit
  const candidateEvaluations: Array<{
    cond: WorkingCondition;
    limitStress: number;
    gamma: number;
  }> = [];

  for (const cond of conditions) {
    if (!cond.isControlCandidate) continue;

    const { gamma } = getConditionSpecificLoad(conductor, cond, L, tower.elevation, tower);
    const limitStress = cond.name.includes("年均") || cond.name.includes("常年")
      ? allowableAvgStress
      : allowableMaxStress;

    candidateEvaluations.push({ cond, limitStress, gamma });
  }

  // Find the candidate condition that gives the most restrictive (lowest) tension when projected to other conditions
  let maxResultingPeakStressRatio = -1;

  for (const candidate of candidateEvaluations) {
    let candidateViolates = false;
    let maxRatio = 0;

    for (const other of candidateEvaluations) {
      if (other.cond.id === candidate.cond.id) continue;

      const solvedStress = solveStateEquation(
        candidate.limitStress,
        candidate.gamma,
        candidate.cond.temp,
        other.gamma,
        other.cond.temp,
        L,
        E,
        alpha
      );

      const stressRatio = solvedStress / other.limitStress;
      if (stressRatio > maxRatio) {
        maxRatio = stressRatio;
      }
      if (solvedStress > other.limitStress + 1e-3) {
        candidateViolates = true;
      }
    }

    if (!candidateViolates || maxRatio > maxResultingPeakStressRatio) {
      maxResultingPeakStressRatio = maxRatio;
      bestControlCondId = candidate.cond.id;
    }
  }

  // Get the controlling condition parameters
  const controlCond = conditions.find((c) => c.id === bestControlCondId) || conditions[0];
  const { gamma: controlGamma } = getConditionSpecificLoad(conductor, controlCond, L, tower.elevation, tower);
  const controlLimitStress = controlCond.name.includes("年均") || controlCond.name.includes("常年")
    ? allowableAvgStress
    : allowableMaxStress;

  // Compute exact mechanics for all conditions based on the governing condition
  const results: ConditionCalcResult[] = conditions.map((cond) => {
    const { gamma, loads } = getConditionSpecificLoad(conductor, cond, L, tower.elevation, tower);

    let stress = 0;
    if (cond.id === bestControlCondId) {
      stress = controlLimitStress;
    } else {
      stress = solveStateEquation(
        controlLimitStress,
        controlGamma,
        controlCond.temp,
        gamma,
        cond.temp,
        L,
        E,
        alpha
      );
    }

    const tension = stress * S; // Total tension T_m [N]
    const safetyFactor = Tp / tension;

    // Mid-span maximum sag f = γ_m * L² / (8 * σ_m)
    const sag = (gamma * Math.pow(L, 2)) / (8 * stress);

    // Wind angle calculation φ = arctan(γ_wind / γ_vert)
    let vertGamma = loads.g1;
    let windGamma = loads.g3;
    if (cond.iceThickness > 0) {
      vertGamma = loads.g5;
      windGamma = loads.g4;
    }
    const windAngle = (Math.atan2(windGamma, vertGamma) * 180) / Math.PI;

    const verticalSag = sag * Math.cos((windAngle * Math.PI) / 180);
    const horizontalSwing = sag * Math.sin((windAngle * Math.PI) / 180);

    return {
      conditionId: cond.id,
      conditionName: cond.name,
      temp: cond.temp,
      windSpeed: cond.windSpeed,
      iceThickness: cond.iceThickness,
      specificLoad: gamma,
      stress,
      tension,
      safetyFactor,
      sag,
      windAngle,
      verticalSag,
      horizontalSwing,
      isGoverningCondition: cond.id === bestControlCondId,
    };
  });

  return { results, governingConditionId: bestControlCondId };
}

/**
 * Generate 2D points along the span for catenary profile rendering
 * y(x) = (h/L)*x + (4*f_mid / L²) * x * (L - x)
 */
export function generateCatenaryCurve(
  spanLength: number,
  heightDifference: number,
  sag: number,
  numPoints: number = 100
): Array<{ x: number; y: number; sagOffset: number }> {
  const points = [];
  const L = spanLength;
  const h = heightDifference;

  for (let i = 0; i <= numPoints; i++) {
    const x = (i / numPoints) * L;
    const lineY = (h / L) * x; // Straight line between attachment points
    const sagOffset = (4 * sag * x * (L - x)) / (L * L); // Parabolic sag below straight line
    const y = lineY - sagOffset;

    points.push({ x, y, sagOffset });
  }

  return points;
}

/**
 * Generate Installation Stringing Table (架线安装张力弧垂表)
 * Rows: Temperatures (-10°C, 0°C, 10°C, 20°C, 30°C, 40°C)
 * Columns: Span lengths L (e.g. 100m, 200m, 300m, 400m, 500m, 600m)
 */
export function generateStringingChart(
  conductor: Conductor,
  baseConditions: WorkingCondition[],
  tower: TowerParameters,
  temperatures: number[] = [-10, 0, 10, 15, 20, 30, 40],
  spans: number[] = [100, 200, 300, 400, 500, 600, 700, 800]
): Array<{
  span: number;
  data: Array<{ temp: number; stress: number; tension: number; sag: number }>;
}> {
  return spans.map((L) => {
    const tempTower = { ...tower, spanLength: L };
    const { results } = calculateAllConditions(conductor, baseConditions, tempTower);
    const govResult = results.find((r) => r.isGoverningCondition) || results[0];

    const data = temperatures.map((tm) => {
      // Wind = 0, Ice = 0 for installation
      const { gamma } = getConditionSpecificLoad(
        conductor,
        { id: 'inst', name: '安装', temp: tm, windSpeed: 0, iceThickness: 0, isControlCandidate: false },
        L,
        tower.elevation
      );

      const stress = solveStateEquation(
        govResult.stress,
        govResult.specificLoad,
        govResult.temp,
        gamma,
        tm,
        L,
        conductor.elasticModulus,
        conductor.thermalExpansion
      );

      const tension = stress * conductor.totalArea;
      const sag = (gamma * L * L) / (8 * stress);

      return { temp: tm, stress, tension, sag };
    });

    return { span: L, data };
  });
}
