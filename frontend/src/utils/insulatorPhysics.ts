import {
  Conductor,
  Insulator,
  TowerParameters,
  WorkingCondition,
  InsulatorCalcResult,
  ComplianceCheck,
  InsulatorStringType,
} from '../types';
import { MIN_AIR_CLEARANCE_TABLE, MIN_GROUND_CLEARANCE_TABLE } from '../data/meteorology';
import { calculateSpecificLoads } from './conductorPhysics';

const G_ACCEL = 9.80665;

/**
 * Calculate required insulator units and string parameters according to DL/T 5582-2020
 */
export function calculateInsulatorUnits(
  insulator: Insulator,
  voltageLevel: number, // kV
  elevation: number = 0, // m
  crepageRatio: number = 31.5, // mm/kV (Unified creepage distance λ)
  efficiencyFactorKe: number = 0.95
): {
  creepageCount: number;
  altitudeCorrectedCount: number;
  finalCount: number;
  totalLength: number; // m
  totalWeight: number; // kg
  calculatedWindArea: number; // m²
} {
  const discDia = insulator.discDiameter || (insulator.material === 'composite' ? 120 : 255);
  if (insulator.material === 'composite') {
    // Composite insulator length is fixed by design height
    const totalLength = insulator.structureHeight / 1000;
    const totalWeight = insulator.unitMass;
    const calculatedWindArea = totalLength * (discDia / 1000);
    return {
      creepageCount: 1,
      altitudeCorrectedCount: 1,
      finalCount: 1,
      totalLength,
      totalWeight,
      calculatedWindArea,
    };
  }

  // Highest operational line-to-ground voltage U_ph-e [kV]
  const maxOperatingVoltage = voltageLevel * 1.05; // 1.05x system nominal
  const U_ph_e = maxOperatingVoltage / Math.sqrt(3);

  // Single unit creepage distance L01 [mm]
  const L01 = insulator.creepageDistance;

  // Clause 6.1.3-2: n >= (λ * U_ph-e) / (Ke * L01)
  const creepageCount = Math.ceil((crepageRatio * U_ph_e) / (efficiencyFactorKe * L01));

  // Clause 6.1.5: Altitude correction for elevation > 1000m
  let altitudeCorrectedCount = creepageCount;
  if (elevation > 1000) {
    const m1 = insulator.characteristicIndexM1 || 0.5;
    const factor = Math.exp((m1 * (elevation - 1000)) / 8150);
    altitudeCorrectedCount = Math.ceil(creepageCount * factor);
  }

  // Clause 6.2.2 Minimum units benchmark table
  const codeMinMap: Record<number, number> = {
    110: 7,
    220: 13,
    330: 17,
    500: 25,
    750: 32,
    1000: 43,
  };

  const codeMin = codeMinMap[voltageLevel] || 7;
  const finalCount = Math.max(altitudeCorrectedCount, codeMin);

  const totalLength = (finalCount * insulator.structureHeight) / 1000; // m
  const totalWeight = finalCount * insulator.unitMass; // kg
  // Formula 2-6-45 wind area baseline: single disc 0.02 m² (<=254mm) or 0.03 m² (large disc) + fittings 0.03 m²
  const discArea = discDia >= 300 ? 0.03 : 0.02;
  const calculatedWindArea = finalCount * discArea + 0.03; // m²

  return {
    creepageCount,
    altitudeCorrectedCount,
    finalCount,
    totalLength,
    totalWeight,
    calculatedWindArea,
  };
}

/**
 * Calculate Insulator Wind Swing Angle, Conductor Displacement & Tower Clearance (DL/T 5582 Clause 9.4)
 */
export function calculateInsulatorWindSwing(
  insulator: Insulator,
  conductor: Conductor,
  tower: TowerParameters,
  windCondition: WorkingCondition,
  insulatorUnitsCount: number,
  overrideStringType?: InsulatorStringType,
  counterWeightMassKg: number = 0,
  overrideVAngleDeg: number = 90,
  overrideKvValue?: number,
  conductorTensionN?: number
): InsulatorCalcResult {
  const stringType: InsulatorStringType = overrideStringType || insulator.stringType || 'single_I';
  const L_p = (tower.horizontalSpan && tower.horizontalSpan > 0) ? tower.horizontalSpan : tower.spanLength; // 水平档距 l_h (m)
  
  const windSpeed = windCondition.windSpeed;
  const ice = windCondition.iceThickness;

  // 1. Calculate loads on conductor
  const loads = calculateSpecificLoads(conductor, windSpeed, ice, L_p, tower.elevation, tower);
  const g_vert = ice > 0 ? loads.g5 : loads.g1; // 电线垂直比载 γ_v [N/(m·mm²)]

  // Conductor total area (S_total = S * n)
  const S_single = conductor.totalArea || 300; // mm²
  const numSub = tower.numSubConductors || 1;
  const totalArea = S_single * numSub; // mm²

  // Derive Vertical Span L_v according to DL/T 5092 & GB 50545 Formula (3-3-11 / 3-3-12):
  // l_v = l_H + (σ_0 / γ_v) * a
  // where a = (h_1 / l_1 + h_2 / l_2) is composite height difference ratio (a = h / l_H)
  let L_v = L_p;
  let kv = 1.0;

  if (overrideKvValue !== undefined) {
    kv = overrideKvValue;
    L_v = L_p * kv;
  } else if (tower.kvValue !== undefined && tower.kvValue !== 1.0) {
    kv = tower.kvValue;
    L_v = L_p * kv;
  } else {
    // Dynamic calculation per Formula (3-3-12)
    const h_diff = tower.heightDifference !== undefined
      ? tower.heightDifference
      : ((tower.rightAttachmentHeight || 35) - (tower.leftAttachmentHeight || 35));

    if (Math.abs(h_diff) > 0.01 && L_p > 0 && g_vert > 0) {
      const a_coeff = h_diff / L_p;
      const T_0 = conductorTensionN || (conductor.ratedStrength / 2.5); // N
      const sigma_0 = totalArea > 0 ? (T_0 / totalArea) : 90; // N/mm²
      const delta_lv = (sigma_0 / g_vert) * a_coeff; // (σ_0 / γ_v) * a
      L_v = L_p + delta_lv;
      // Safety bounds for realistic physical vertical span
      L_v = Math.max(0.1 * L_p, Math.min(L_v, 3.0 * L_p));
      kv = L_v / L_p;
    } else {
      L_v = L_p;
      kv = 1.0;
    }
  }

  // Conductor wind force P_x on insulator string (kN)
  const g_wind = ice > 0 ? loads.g4 : loads.g3;
  const conductorWindForceKN = (g_wind * totalArea * L_p) / 1000;

  // Conductor vertical gravity force G_y on insulator string (kN)
  const conductorWeightKN = (g_vert * totalArea * L_v) / 1000;

  // Conductor's own wind inclination angle (deg)
  const conductorWindAngleRad = Math.atan2(conductorWindForceKN, conductorWeightKN);
  const conductorWindAngleDeg = (conductorWindAngleRad * 180) / Math.PI;

  // 2. Insulator string dimensions, total mass & wind area
  const insulatorInfo = calculateInsulatorUnits(insulator, tower.voltageLevel, tower.elevation);
  const rawStringLength = insulatorInfo.totalLength; // m
  let stringLength = rawStringLength;

  const stringTypeMult = (stringType === 'double_I' || stringType === 'V_string') ? 2 : 1;
  const windAreaMult = (stringType === 'double_I' || stringType === 'V_string') ? 1.8 : 1.0;

  // Total weight (kg) & Wind area (m²)
  const singleStringWeightKg = (insulator.customTotalWeightKg && insulator.customTotalWeightKg > 0)
    ? insulator.customTotalWeightKg
    : insulatorInfo.totalWeight;

  // 3. Wind force P_I on insulator string (N/kN) according to Formula (2-6-45)
  // P_I = 9.81 * A_I * (V^2 / 16) [N]
  const subNum = tower.numSubConductors || 1;
  const fittingsArea = subNum >= 3 ? 0.05 : subNum === 2 ? 0.04 : 0.03;
  const discDia = insulator.discDiameter || (insulator.material === 'composite' ? 120 : 255);
  const discAreaPerUnit = discDia >= 300 ? 0.03 : 0.02;

  const singleStringWindAreaM2 = (insulator.customWindAreaM2 && insulator.customWindAreaM2 > 0)
    ? insulator.customWindAreaM2
    : (insulator.material === 'composite'
        ? (insulatorInfo.totalLength * (discDia / 1000) + fittingsArea)
        : (insulatorInfo.finalCount * discAreaPerUnit + fittingsArea));

  const finalTotalWeightKg = singleStringWeightKg * stringTypeMult;
  const finalWindAreaM2 = singleStringWindAreaM2 * windAreaMult;

  let stringWeightKN = (finalTotalWeightKg * G_ACCEL) / 1000; // G_I (kN)
  const counterWeightKN = (counterWeightMassKg * G_ACCEL) / 1000; // G_cw (kN)

  // Formula (2-6-45): P_I = 9.81 * A_I * (V^2 / 16) [N]
  const insulatorWindForceN = 9.81 * finalWindAreaM2 * ((windSpeed * windSpeed) / 16);
  let insulatorWindForceKN = insulatorWindForceN / 1000; // P_I (kN)

  // 4. Calculate Wind Swing Angle φ depending on String Type (Formula 2-6-44)
  // φ = tg⁻¹[ (P_I / 2 + P · l_H) / (G_I / 2 + W₁ · l_v + G_cw) ]
  let windSwingDeg = 0;
  let vStringLiftOff = false;

  if (stringType === 'single_I' || stringType === 'double_I') {
    // Formula 2-6-44:
    // Numerator = P_I / 2 + P · l_H (kN)
    // Denominator = G_I / 2 + W₁ · l_v + G_cw (kN)
    const totalHorizontalForce = 0.5 * insulatorWindForceKN + conductorWindForceKN;
    const totalVerticalForce = 0.5 * stringWeightKN + conductorWeightKN + counterWeightKN;

    const windSwingRad = Math.atan2(totalHorizontalForce, Math.max(totalVerticalForce, 0.001));
    windSwingDeg = (windSwingRad * 180) / Math.PI;
  } else if (stringType === 'V_string') {
    // V-String constraint geometry
    const halfVRad = ((overrideVAngleDeg / 2) * Math.PI) / 180;
    const totalHorizontalForce = conductorWindForceKN + 0.5 * insulatorWindForceKN;
    const totalVerticalForce = conductorWeightKN + 0.5 * stringWeightKN + counterWeightKN;

    const loadRatio = totalHorizontalForce / Math.max(totalVerticalForce, 0.001);
    const maxRatio = Math.tan(halfVRad);

    if (loadRatio < maxRatio) {
      // V-string holds conductor vertex firmly!
      // Only minor elastic deflection (~0° to 2°)
      windSwingDeg = loadRatio * 1.5; // Minimal constraint deflection
      vStringLiftOff = false;
    } else {
      // Wind exceeds V-string liftoff threshold
      vStringLiftOff = true;
      const unconstrainedRad = Math.atan2(totalHorizontalForce, totalVerticalForce);
      windSwingDeg = (unconstrainedRad * 180) / Math.PI - (overrideVAngleDeg / 4);
    }
  } else if (stringType === 'tension' || stringType === 'post') {
    // Tension string / Rigid post insulator stays zero transverse swing
    windSwingDeg = 0;
  }

  const windSwingRad = (windSwingDeg * Math.PI) / 180;

  // 5. Calculate Conductor Attachment Point Displacements
  // If post or tension string, attachment point doesn't swing transversely
  let horizDisplacement = 0;
  let vertDropDisplacement = 0;

  if (stringType === 'single_I' || stringType === 'double_I') {
    horizDisplacement = stringLength * Math.sin(windSwingRad);
    vertDropDisplacement = stringLength * (1 - Math.cos(windSwingRad));
  } else if (stringType === 'V_string') {
    horizDisplacement = stringLength * 0.15 * Math.sin(windSwingRad);
    vertDropDisplacement = stringLength * 0.05 * (1 - Math.cos(windSwingRad));
  }

  // 6. Check tower window clearance
  const towerWindowWidthMap: Record<number, number> = {
    110: 2.5,
    220: 3.5,
    330: 4.5,
    500: 6.5,
    750: 8.5,
    1000: 11.0,
  };
  const windowHalfWidth = towerWindowWidthMap[tower.voltageLevel] || 4.5;
  const minClearanceReq =
    MIN_AIR_CLEARANCE_TABLE[tower.voltageLevel]?.powerFreq || 1.3;

  const swingOffsetHorizontal = horizDisplacement;
  const actualClearance = Math.max(windowHalfWidth - swingOffsetHorizontal, 0);

  return {
    creepageRequiredCount: insulatorInfo.creepageCount,
    altitudeCorrectedCount: insulatorInfo.altitudeCorrectedCount,
    finalCount: insulatorInfo.finalCount,
    stringLength,
    stringType,
    counterWeightMass: counterWeightMassKg,
    stringTotalWeightKg: finalTotalWeightKg,
    stringWindAreaM2: finalWindAreaM2,
    windLoadOnString: insulatorWindForceKN,
    conductorWindLoadOnString: conductorWindForceKN,
    conductorWeightOnString: conductorWeightKN,
    insulatorWindSwingAngle: windSwingDeg,
    conductorWindAngle: conductorWindAngleDeg,
    horizontalDisplacement: horizDisplacement,
    verticalDropDisplacement: vertDropDisplacement,
    minAirClearanceRequired: minClearanceReq,
    actualClearanceToTower: actualClearance,
    clearancePassed: actualClearance >= minClearanceReq,
    vStringLiftOff,
    horizontalSpan: L_p,
    verticalSpan: L_v,
    kvValue: kv,
  };
}

/**
 * Generate code compliance audit items based on DL/T 5582-2020
 */
export function generateCodeComplianceReport(
  conductor: Conductor,
  tower: TowerParameters,
  maxTension: number,
  avgTension: number,
  maxSag: number,
  insulatorRes: InsulatorCalcResult
): ComplianceCheck[] {
  const Tp = conductor.ratedStrength;
  const safetyFactor = Tp / maxTension;
  const avgTensionRatio = (avgTension / Tp) * 100;
  const maxTensionRatio = (maxTension / Tp) * 100;

  const minGroundClearanceReq =
    MIN_GROUND_CLEARANCE_TABLE[tower.voltageLevel]?.[tower.landType] || 6.0;

  const actualLowestConductorHeight =
    Math.min(tower.leftAttachmentHeight, tower.rightAttachmentHeight) - maxSag;

  return [
    {
      item: '导线设计最大张力安全系数 K_c',
      codeReference: 'DL/T 5582-2020 5.1.15',
      standardRequirement: 'K_c ≥ 2.50 (悬挂点 K_c ≥ 2.25)',
      calculatedValue: `K_c = ${safetyFactor.toFixed(2)}`,
      passed: safetyFactor >= 2.5,
      notes: safetyFactor >= 2.5 ? '满足导线强度机械安全裕度要求' : '警告: 安全系数低于2.50，需更换导线或降低张力',
    },
    {
      item: '弧垂最低点最大使用张力比例',
      codeReference: 'DL/T 5582-2020 5.1.16',
      standardRequirement: 'T_max / T_p ≤ 40.0%',
      calculatedValue: `${maxTensionRatio.toFixed(1)}%`,
      passed: maxTensionRatio <= 40.0,
      notes: maxTensionRatio <= 40.0 ? '最大使用张力符合限制' : '超标: 最大张力比例过高',
    },
    {
      item: '年平均运行张力比例 (EDT)',
      codeReference: 'DL/T 5582-2020 2.1.11 / 5.2.1',
      standardRequirement: 'T_avg / T_p ≤ 16.0% ~ 25.0%',
      calculatedValue: `${avgTensionRatio.toFixed(1)}%`,
      passed: avgTensionRatio <= 25.0,
      notes: avgTensionRatio <= 25.0 ? '符合防微风振动平均运行张力控制上限' : '警告: 年平均运行张力偏高，可能引发微风振动疲劳',
    },
    {
      item: '最大弧垂下对地距离校验',
      codeReference: 'DL/T 5582-2020 10.2.1',
      standardRequirement: `≥ ${minGroundClearanceReq.toFixed(1)} m (${
        tower.landType === 'residential'
          ? '居民区'
          : tower.landType === 'agricultural'
          ? '农业耕作区'
          : tower.landType === 'difficult_transport'
          ? '交通困难区'
          : '非居民区'
      })`,
      calculatedValue: `${actualLowestConductorHeight.toFixed(2)} m (最大弧垂 ${maxSag.toFixed(2)}m)`,
      passed: actualLowestConductorHeight >= minGroundClearanceReq,
      notes:
        actualLowestConductorHeight >= minGroundClearanceReq
          ? '对地安全距离完全符合规范限制'
          : '警告: 导线最低点高度低于规范对地净空要求，需提高呼高或缩短档距',
    },
    {
      item: '绝缘子串绝缘距离与塔头风偏间隙',
      codeReference: 'DL/T 5582-2020 6.2.5 & 9.4',
      standardRequirement: `风偏角 ${insulatorRes.insulatorWindSwingAngle.toFixed(1)}°, 最小间隙 ≥ ${insulatorRes.minAirClearanceRequired.toFixed(2)} m`,
      calculatedValue: `剩余间隙 = ${insulatorRes.actualClearanceToTower.toFixed(2)} m`,
      passed: insulatorRes.clearancePassed,
      notes: insulatorRes.clearancePassed
        ? '风偏后带电体与杆塔接地构件空气间隙满足要求'
        : '不合格: 风偏角过大导致塔头放电间隙不足，建议采用V型绝缘子串或加重重锤',
    },
  ];
}
