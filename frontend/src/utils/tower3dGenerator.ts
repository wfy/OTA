import * as THREE from 'three';
import { TowerStructureType } from '../types';

/**
 * Creates a detailed 3D mesh for transmission towers:
 * - 'angle_steel': 角钢格构桁架塔 (Lattice Angle Steel Tower with X-bracing)
 * - 'steel_pipe': 钢管塔/钢管杆 (Tubular Steel Tower / Pipe Monopole with Flanges)
 */
export function create3DTowerMesh(
  structureType: TowerStructureType | undefined,
  heightM: number,
  voltageLevel: number = 220
): THREE.Group {
  const type = structureType || 'angle_steel';

  if (type === 'steel_pipe') {
    return buildSteelPipeTowerMesh(heightM, voltageLevel);
  } else {
    return buildAngleSteelTowerMesh(heightM, voltageLevel);
  }
}

/**
 * Returns the lateral offset (Z distance from center line) for crossarm insulator hanging points
 */
export function getTowerCrossarmHangOffset(
  structureType: TowerStructureType | undefined,
  voltageLevel: number = 220
): number {
  const type = structureType || 'angle_steel';
  if (type === 'steel_pipe') {
    const armSpan = voltageLevel >= 500 ? 15 : voltageLevel >= 220 ? 11 : 8.5;
    return armSpan / 2 - 0.5;
  } else {
    const armSpan = voltageLevel >= 500 ? 16 : voltageLevel >= 220 ? 12 : 9;
    return armSpan / 2 - 0.6;
  }
}

/**
 * 角钢塔 (Angle Steel Lattice Tower) 3D Model Generator
 */
function buildAngleSteelTowerMesh(heightM: number, voltageLevel: number): THREE.Group {
  const towerGrp = new THREE.Group();

  // Galvanized Angle Steel Material
  const steelMat = new THREE.MeshStandardMaterial({
    color: 0x334155, // Slate steel gray
    roughness: 0.35,
    metalness: 0.85,
  });

  const concreteMat = new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    roughness: 0.9,
  });

  // Base dimensions based on voltage and height
  const baseWidth = Math.max(5.0, heightM * 0.22);
  const topWidth = Math.max(1.8, heightM * 0.07);

  // 1. Concrete Base Footings (4个基础混凝土墩)
  const footingGeo = new THREE.BoxGeometry(1.2, 1.2, 1.2);
  const footingOffsets = [
    [-baseWidth / 2, -baseWidth / 2],
    [baseWidth / 2, -baseWidth / 2],
    [-baseWidth / 2, baseWidth / 2],
    [baseWidth / 2, baseWidth / 2],
  ];

  footingOffsets.forEach(([fx, fz]) => {
    const footing = new THREE.Mesh(footingGeo, concreteMat);
    footing.position.set(fx, 0.6, fz);
    footing.castShadow = true;
    towerGrp.add(footing);
  });

  // 2. Main 4 Angle Steel Legs (4根渐变角钢主材)
  const legRadius = 0.18;
  footingOffsets.forEach(([fx, fz]) => {
    const tx = (fx / (baseWidth / 2)) * (topWidth / 2);
    const tz = (fz / (baseWidth / 2)) * (topWidth / 2);

    const start = new THREE.Vector3(fx, 1.2, fz);
    const end = new THREE.Vector3(tx, heightM, tz);
    const dir = new THREE.Vector3().subVectors(end, start);
    const len = dir.length();

    const legGeo = new THREE.CylinderGeometry(legRadius * 0.8, legRadius, len, 6);
    const leg = new THREE.Mesh(legGeo, steelMat);

    // Position & Orientation
    const mid = new THREE.Vector3().addVectors(start, end).multiplyScalar(0.5);
    leg.position.copy(mid);
    leg.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), dir.clone().normalize());
    leg.castShadow = true;
    towerGrp.add(leg);
  });

  // 3. Multi-tier Horizontal & X-Bracing Lattice (多层角钢横材与X型交叉斜材)
  const tierCount = Math.max(4, Math.floor(heightM / 4.5));
  const tierHeight = (heightM - 1.2) / tierCount;

  for (let t = 0; t <= tierCount; t++) {
    const curY = 1.2 + t * tierHeight;
    const ratio = t / tierCount;
    const curW = baseWidth * (1 - ratio) + topWidth * ratio;

    // Horizontal perimeter angle beams (四面横材)
    const horizGeo = new THREE.CylinderGeometry(0.08, 0.08, curW, 6);
    const edges = [
      { pos: [0, curY, -curW / 2], rotY: 0 },
      { pos: [0, curY, curW / 2], rotY: 0 },
      { pos: [-curW / 2, curY, 0], rotY: Math.PI / 2 },
      { pos: [curW / 2, curY, 0], rotY: Math.PI / 2 },
    ];

    edges.forEach(({ pos, rotY }) => {
      const hBeam = new THREE.Mesh(horizGeo, steelMat);
      hBeam.position.set(pos[0], pos[1], pos[2]);
      hBeam.rotation.y = rotY;
      hBeam.rotation.z = Math.PI / 2;
      hBeam.castShadow = true;
      towerGrp.add(hBeam);
    });

    // X-bracing diagonals between current tier and next tier
    if (t < tierCount) {
      const nextY = 1.2 + (t + 1) * tierHeight;
      const nextRatio = (t + 1) / tierCount;
      const nextW = baseWidth * (1 - nextRatio) + topWidth * nextRatio;

      // 4 outer faces
      const faces = [
        // Front face (Z = -w/2)
        {
          p1: new THREE.Vector3(-curW / 2, curY, -curW / 2),
          p2: new THREE.Vector3(nextW / 2, nextY, -nextW / 2),
          p3: new THREE.Vector3(curW / 2, curY, -curW / 2),
          p4: new THREE.Vector3(-nextW / 2, nextY, -nextW / 2),
        },
        // Back face (Z = w/2)
        {
          p1: new THREE.Vector3(-curW / 2, curY, curW / 2),
          p2: new THREE.Vector3(nextW / 2, nextY, nextW / 2),
          p3: new THREE.Vector3(curW / 2, curY, curW / 2),
          p4: new THREE.Vector3(-nextW / 2, nextY, nextW / 2),
        },
        // Left face (X = -w/2)
        {
          p1: new THREE.Vector3(-curW / 2, curY, -curW / 2),
          p2: new THREE.Vector3(-nextW / 2, nextY, nextW / 2),
          p3: new THREE.Vector3(-curW / 2, curY, curW / 2),
          p4: new THREE.Vector3(-nextW / 2, nextY, -nextW / 2),
        },
        // Right face (X = w/2)
        {
          p1: new THREE.Vector3(curW / 2, curY, -curW / 2),
          p2: new THREE.Vector3(nextW / 2, nextY, nextW / 2),
          p3: new THREE.Vector3(curW / 2, curY, curW / 2),
          p4: new THREE.Vector3(nextW / 2, nextY, -nextW / 2),
        },
      ];

      faces.forEach(({ p1, p2, p3, p4 }) => {
        // Diagonal 1
        const d1 = new THREE.Vector3().subVectors(p2, p1);
        const b1 = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, d1.length(), 6), steelMat);
        b1.position.copy(new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5));
        b1.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d1.clone().normalize());
        towerGrp.add(b1);

        // Diagonal 2
        const d2 = new THREE.Vector3().subVectors(p4, p3);
        const b2 = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, d2.length(), 6), steelMat);
        b2.position.copy(new THREE.Vector3().addVectors(p3, p4).multiplyScalar(0.5));
        b2.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d2.clone().normalize());
        towerGrp.add(b2);
      });
    }
  }

  // 4. Lattice Crossarm (角钢桁架横担)
  const armSpan = voltageLevel >= 500 ? 16 : voltageLevel >= 220 ? 12 : 9;
  const armHeight = 1.2;
  const armDepth = topWidth * 1.1;

  // Main Crossarm Upper & Lower Beams
  const mainArmUpper = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 0.3, armSpan),
    steelMat
  );
  mainArmUpper.position.set(0, heightM, 0);
  towerGrp.add(mainArmUpper);

  const mainArmLower = new THREE.Mesh(
    new THREE.BoxGeometry(0.3, 0.3, armSpan * 0.85),
    steelMat
  );
  mainArmLower.position.set(0, heightM - armHeight, 0);
  towerGrp.add(mainArmLower);

  // Crossarm Diagonal Struts (横担下斜支撑杆)
  const leftStrutStart = new THREE.Vector3(0, heightM - armHeight * 2, 0);
  const leftStrutEnd = new THREE.Vector3(0, heightM, -armSpan / 2);
  const leftStrutVec = new THREE.Vector3().subVectors(leftStrutEnd, leftStrutStart);
  const leftStrut = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1, 0.1, leftStrutVec.length(), 6),
    steelMat
  );
  leftStrut.position.copy(new THREE.Vector3().addVectors(leftStrutStart, leftStrutEnd).multiplyScalar(0.5));
  leftStrut.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), leftStrutVec.clone().normalize());
  towerGrp.add(leftStrut);

  const rightStrutEnd = new THREE.Vector3(0, heightM, armSpan / 2);
  const rightStrutVec = new THREE.Vector3().subVectors(rightStrutEnd, leftStrutStart);
  const rightStrut = new THREE.Mesh(
    new THREE.CylinderGeometry(0.1, 0.1, rightStrutVec.length(), 6),
    steelMat
  );
  rightStrut.position.copy(new THREE.Vector3().addVectors(leftStrutStart, rightStrutEnd).multiplyScalar(0.5));
  rightStrut.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), rightStrutVec.clone().normalize());
  towerGrp.add(rightStrut);

  // Insulator Hanging Rings / Plates at Crossarm Tips (左右横担绝缘子悬挂点加劲挂环)
  const hangZAngle = getTowerCrossarmHangOffset('angle_steel', voltageLevel);
  [-hangZAngle, hangZAngle].forEach((zPos) => {
    const hangHardware = new THREE.Mesh(
      new THREE.BoxGeometry(0.25, 0.35, 0.25),
      steelMat
    );
    hangHardware.position.set(0, heightM - 0.18, zPos);
    towerGrp.add(hangHardware);
  });

  // 5. Earthwire Peak (角钢塔顶/避雷线支架)
  const peakHeight = 4.5;
  const peakGeo = new THREE.ConeGeometry(topWidth * 0.7, peakHeight, 4);
  const peak = new THREE.Mesh(peakGeo, steelMat);
  peak.position.set(0, heightM + peakHeight / 2, 0);
  peak.rotation.y = Math.PI / 4;
  towerGrp.add(peak);

  return towerGrp;
}

/**
 * 钢管塔 (Tubular Steel Tower / Steel Pipe Monopole) 3D Model Generator
 */
function buildSteelPipeTowerMesh(heightM: number, voltageLevel: number): THREE.Group {
  const towerGrp = new THREE.Group();

  // Smooth Silver-Gray Galvanized Steel Tube Material
  const pipeSteelMat = new THREE.MeshStandardMaterial({
    color: 0x64748b, // High-sheen steel gray
    roughness: 0.22,
    metalness: 0.9,
  });

  const flangeMat = new THREE.MeshStandardMaterial({
    color: 0x334155, // Darker metallic flange ring
    roughness: 0.15,
    metalness: 0.95,
  });

  const concreteMat = new THREE.MeshStandardMaterial({
    color: 0x94a3b8,
    roughness: 0.9,
  });

  // Base Pedestal (钢管塔混凝土圆桩基础)
  const baseRadius = Math.max(1.5, heightM * 0.05);
  const pedestalGeo = new THREE.CylinderGeometry(baseRadius * 1.1, baseRadius * 1.2, 1.5, 24);
  const pedestal = new THREE.Mesh(pedestalGeo, concreteMat);
  pedestal.position.set(0, 0.75, 0);
  pedestal.castShadow = true;
  towerGrp.add(pedestal);

  // 1. Tapered Main Pipe Pole Shaft (高强圆钢管主杆)
  const bottomRadius = baseRadius;
  const topRadius = Math.max(0.6, heightM * 0.022);
  const mainPoleHeight = heightM - 1.5;

  const mainPoleGeo = new THREE.CylinderGeometry(topRadius, bottomRadius, mainPoleHeight, 24);
  const mainPole = new THREE.Mesh(mainPoleGeo, pipeSteelMat);
  mainPole.position.set(0, 1.5 + mainPoleHeight / 2, 0);
  mainPole.castShadow = true;
  towerGrp.add(mainPole);

  // 2. Bolted Flange Connection Rings (法兰盘加劲环) along the main pole height
  const flangeCount = Math.max(3, Math.floor(heightM / 6.0));
  for (let f = 1; f <= flangeCount; f++) {
    const ratio = f / (flangeCount + 1);
    const fY = 1.5 + mainPoleHeight * ratio;
    const curR = bottomRadius * (1 - ratio) + topRadius * ratio;

    const flangeGeo = new THREE.CylinderGeometry(curR * 1.25, curR * 1.25, 0.25, 24);
    const flange = new THREE.Mesh(flangeGeo, flangeMat);
    flange.position.set(0, fY, 0);
    flange.castShadow = true;
    towerGrp.add(flange);
  }

  // 3. Tubular Crossarms (圆钢管横担)
  const armSpan = voltageLevel >= 500 ? 15 : voltageLevel >= 220 ? 11 : 8.5;
  const armPipeRadius = 0.22;

  // Main Horizontal Tubular Beam
  const mainArmGeo = new THREE.CylinderGeometry(armPipeRadius * 0.8, armPipeRadius, armSpan, 20);
  const mainArm = new THREE.Mesh(mainArmGeo, pipeSteelMat);
  mainArm.position.set(0, heightM, 0);
  mainArm.rotation.x = Math.PI / 2; // Lie along Z axis
  mainArm.castShadow = true;
  towerGrp.add(mainArm);

  // Tubular Support Struts (圆钢管斜支撑)
  const strutRadius = 0.14;
  const leftStrutStart = new THREE.Vector3(0, heightM - 3.5, 0);
  const leftStrutEnd = new THREE.Vector3(0, heightM, -armSpan / 2 + 0.5);
  const leftVec = new THREE.Vector3().subVectors(leftStrutEnd, leftStrutStart);

  const leftStrut = new THREE.Mesh(
    new THREE.CylinderGeometry(strutRadius, strutRadius, leftVec.length(), 16),
    pipeSteelMat
  );
  leftStrut.position.copy(new THREE.Vector3().addVectors(leftStrutStart, leftStrutEnd).multiplyScalar(0.5));
  leftStrut.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), leftVec.clone().normalize());
  leftStrut.castShadow = true;
  towerGrp.add(leftStrut);

  const rightStrutEnd = new THREE.Vector3(0, heightM, armSpan / 2 - 0.5);
  const rightVec = new THREE.Vector3().subVectors(rightStrutEnd, leftStrutStart);

  const rightStrut = new THREE.Mesh(
    new THREE.CylinderGeometry(strutRadius, strutRadius, rightVec.length(), 16),
    pipeSteelMat
  );
  rightStrut.position.copy(new THREE.Vector3().addVectors(leftStrutStart, rightStrutEnd).multiplyScalar(0.5));
  rightStrut.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), rightVec.clone().normalize());
  rightStrut.castShadow = true;
  towerGrp.add(rightStrut);

  // Flange rings at crossarm tips
  [-armSpan / 2, armSpan / 2].forEach((zTip) => {
    const tipRing = new THREE.Mesh(
      new THREE.CylinderGeometry(armPipeRadius * 1.3, armPipeRadius * 1.3, 0.15, 16),
      flangeMat
    );
    tipRing.position.set(0, heightM, zTip);
    tipRing.rotation.x = Math.PI / 2;
    towerGrp.add(tipRing);
  });

  // 4. Smooth Tubular Earthwire Peak (钢管塔顶地线支架)
  const peakHeight = 4.0;
  const peakGeo = new THREE.CylinderGeometry(0.12, topRadius * 0.9, peakHeight, 20);
  const peak = new THREE.Mesh(peakGeo, pipeSteelMat);
  peak.position.set(0, heightM + peakHeight / 2, 0);
  peak.castShadow = true;
  towerGrp.add(peak);

  return towerGrp;
}
