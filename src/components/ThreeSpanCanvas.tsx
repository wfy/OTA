import React, { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  Maximize2,
  Minimize2,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Compass,
  Eye,
  Move,
  Sparkles,
  Activity,
  Box,
} from 'lucide-react';
import { create3DTowerMesh, getTowerCrossarmHangOffset } from '../utils/tower3dGenerator';
import {
  TowerParameters,
  Conductor,
  ConditionCalcResult,
  CrossingObstacle,
  Insulator,
  InsulatorCalcResult,
} from '../types';

interface ThreeSpanCanvasProps {
  tower: TowerParameters;
  conductor: Conductor;
  results: ConditionCalcResult[];
  obstacles: CrossingObstacle[];
  selectedConditionId: string;
  onConditionChange?: (conditionId: string) => void;
  viewDimension?: '3d' | '2d';
  onViewDimensionChange?: (dim: '3d' | '2d') => void;
  onTriggerIceJump?: () => void;
  isIceJumping?: boolean;
  insulator?: Insulator;
  rightInsulator?: Insulator;
  insulatorRes?: InsulatorCalcResult;
  rightInsulatorRes?: InsulatorCalcResult;
  render2DThumbnail?: () => React.ReactNode;
  onOpen2DModal?: () => void;
}

export interface Inspector3DData {
  title: string;
  subtitle: string;
  typeBadge: string;
  worldPos: THREE.Vector3;
  metrics: { label: string; value: string; highlight?: boolean }[];
}

export const ThreeSpanCanvas: React.FC<ThreeSpanCanvasProps> = ({
  tower,
  conductor,
  results,
  obstacles,
  selectedConditionId,
  onConditionChange,
  viewDimension = '3d',
  onViewDimensionChange,
  onTriggerIceJump,
  isIceJumping = false,
  insulator,
  rightInsulator,
  insulatorRes,
  rightInsulatorRes,
  render2DThumbnail,
  onOpen2DModal,
}) => {
  const containerRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);

  // Persistent Camera state refs across re-renders
  const savedCameraPosRef = useRef<THREE.Vector3 | null>(null);
  const savedTargetRef = useRef<THREE.Vector3 | null>(null);

  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  // Selected 3D object state for high-visibility emissive glow highlighting
  const [selected3DKey, setSelected3DKey] = useState<'insulatorA' | 'insulatorB' | 'conductor' | null>(null);

  // Active 3D raycasted inspector object popover state
  const [inspector3D, setInspector3D] = useState<Inspector3DData | null>(null);
  const [inspectorScreenPos, setInspectorScreenPos] = useState<{ x: number; y: number } | null>(null);
  const inspector3DRef = useRef<Inspector3DData | null>(null);
  inspector3DRef.current = inspector3D;

  // 3D Screen Label Positions for Central Sag, Wind Angle, Horizontal Offset, Oblique Sag & Span/Height Diff
  const [sagScreenPos, setSagScreenPos] = useState<{ x: number; y: number; visible: boolean } | null>(null);
  const [angleScreenPos, setAngleScreenPos] = useState<{ x: number; y: number; visible: boolean } | null>(null);
  const [horizScreenPos, setHorizScreenPos] = useState<{ x: number; y: number; visible: boolean } | null>(null);
  const [obliqueScreenPos, setObliqueScreenPos] = useState<{ x: number; y: number; visible: boolean } | null>(null);
  const [spanScreenPos, setSpanScreenPos] = useState<{ x: number; y: number; visible: boolean } | null>(null);

  const sagWorldPosRef = useRef<THREE.Vector3>(new THREE.Vector3());
  const angleWorldPosRef = useRef<THREE.Vector3>(new THREE.Vector3());
  const horizWorldPosRef = useRef<THREE.Vector3>(new THREE.Vector3());
  const obliqueWorldPosRef = useRef<THREE.Vector3>(new THREE.Vector3());
  const spanWorldPosRef = useRef<THREE.Vector3>(new THREE.Vector3());
  const isWindSwingRef = useRef<boolean>(false);
  const blowoutZRef = useRef<number>(0);

  const selectedResult =
    results.find((r) => r.conditionId === selectedConditionId) || results[0];

  useEffect(() => {
    const container = containerRef.current;
    if (!container || !selectedResult) return;

    // 1. Light Scene Setup (亮色背景 3D 可视化)
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0xf1f5f9); // Slate-100 Clean CAD Bright Sky
    scene.fog = new THREE.FogExp2(0xf1f5f9, 0.0006);

    const aspect = container.clientWidth / container.clientHeight || 1.6;
    const camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 3000);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // OrbitControls Configuration for smooth Roaming, Pan & Zoom
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.rotateSpeed = 0.95;
    controls.zoomSpeed = 1.6;
    controls.panSpeed = 1.6;
    controls.enableZoom = false; // Use custom wheel handler for effortless close-up zoom
    controls.screenSpacePanning = true;
    controls.minDistance = 0.05; // Allow getting close without camera locking
    controls.maxDistance = 20000;
    controls.maxPolarAngle = Math.PI / 2 + 0.25;
    controls.listenToKeyEvents(container);
    controlsRef.current = controls;

    renderer.domElement.style.touchAction = 'none';
    const preventContextMenu = (e: MouseEvent) => e.preventDefault();
    renderer.domElement.addEventListener('contextmenu', preventContextMenu);

    // Custom high-responsiveness Wheel Zoom Handler (prevents tiny wheel steps when close to ground/towers)
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (!cameraRef.current || !controlsRef.current) return;
      const cam = cameraRef.current;
      const ctrl = controlsRef.current;

      cam.updateMatrixWorld();
      const fwd = new THREE.Vector3().setFromMatrixColumn(cam.matrix, 2).negate();
      const dist = cam.position.distanceTo(ctrl.target);

      // Generous zoom step with a 3.5m floor so close-up wheel zooming is fast, clear & effortless
      const step = Math.max(dist * 0.18, 3.5);

      if (e.deltaY < 0) {
        // Zooming IN
        if (dist <= step + 0.5) {
          // Near or past target point: advance both camera & target forward smoothly
          cam.position.addScaledVector(fwd, step);
          ctrl.target.addScaledVector(fwd, step);
        } else {
          cam.position.addScaledVector(fwd, step);
        }
      } else {
        // Zooming OUT
        cam.position.addScaledVector(fwd, -step);
      }

      ctrl.update();
    };

    renderer.domElement.addEventListener('wheel', handleWheel, { passive: false });

    // Save camera position/target on every controls change so re-renders preserve exact view
    controls.addEventListener('change', () => {
      if (!savedCameraPosRef.current) savedCameraPosRef.current = new THREE.Vector3();
      if (!savedTargetRef.current) savedTargetRef.current = new THREE.Vector3();
      savedCameraPosRef.current.copy(camera.position);
      savedTargetRef.current.copy(controls.target);
    });

    // Bright Environment Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.25);
    scene.add(ambientLight);

    const sun = new THREE.DirectionalLight(0xffffff, 1.5);
    sun.position.set(120, 220, 150);
    sun.castShadow = true;
    sun.shadow.mapSize.width = 2048;
    sun.shadow.mapSize.height = 2048;
    scene.add(sun);

    // Subtle Sky Fill Light
    const fillLight = new THREE.DirectionalLight(0xbae6fd, 0.7);
    fillLight.position.set(-100, 120, -100);
    scene.add(fillLight);

    // Scale factors
    const spanM = (tower.horizontalSpan && tower.horizontalSpan > 0) ? tower.horizontalSpan : tower.spanLength;
    const h = tower.heightDifference || 0;
    const leftAttachH = tower.leftAttachmentHeight || 35;
    const rightAttachH =
      tower.rightAttachmentHeight !== undefined
        ? tower.rightAttachmentHeight
        : leftAttachH + h;

    // Restore saved camera position & target if present, otherwise set default framing
    if (savedCameraPosRef.current && savedTargetRef.current) {
      camera.position.copy(savedCameraPosRef.current);
      controls.target.copy(savedTargetRef.current);
    } else {
      camera.position.set(spanM / 2, Math.max(leftAttachH, rightAttachH) + 25, spanM * 0.85);
      controls.target.set(spanM / 2, Math.max(leftAttachH, rightAttachH) / 2, 0);
    }
    controls.update();

    // High Contrast Steel Tower Material
    const steelMat = new THREE.MeshStandardMaterial({
      color: 0x1e293b, // Dark Metallic Steel for contrast against bright sky
      roughness: 0.25,
      metalness: 0.85,
    });

    // Default & Highlighted Insulator Materials
    const isHighlightInsA = selected3DKey === 'insulatorA';
    const isHighlightInsB = selected3DKey === 'insulatorB';
    const isHighlightCond = selected3DKey === 'conductor';

    const getInsulatorMat = (side: 'A' | 'B') => {
      const isSelected = side === 'A' ? isHighlightInsA : isHighlightInsB;
      if (isSelected) {
        // Highlighting Selected Insulator (Sky Blue Glow)
        return new THREE.MeshStandardMaterial({
          color: 0x38bdf8,
          emissive: 0x0284c7,
          emissiveIntensity: 1.8,
          roughness: 0.1,
          metalness: 0.2,
        });
      }
      return new THREE.MeshStandardMaterial({
        color: 0x0284c7,
        emissive: 0x0369a1,
        emissiveIntensity: 0.5,
        roughness: 0.15,
        metalness: 0.4,
      });
    };

    // Conductor Material
    const conductorMat = isHighlightCond
      ? new THREE.MeshStandardMaterial({
          color: 0x38bdf8, // Sky Blue Highlight
          emissive: 0x0284c7,
          emissiveIntensity: 2.0,
          roughness: 0.1,
          metalness: 0.8,
        })
      : new THREE.MeshStandardMaterial({
          color: 0x0284c7, // Metallic Electric Cyan
          emissive: 0x0369a1,
          emissiveIntensity: 0.4,
          roughness: 0.2,
          metalness: 0.9,
        });

    // Ground Plane & Blueprint Grid
    const groundGeo = new THREE.PlaneGeometry(spanM + 300, 300, 60, 20);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0xe2e8f0, // Light CAD ground
      roughness: 0.85,
      metalness: 0.05,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.set(spanM / 2, 0, 0);
    ground.receiveShadow = true;
    scene.add(ground);

    const grid = new THREE.GridHelper(spanM + 300, 60, 0x0284c7, 0xcbd5e1);
    grid.position.set(spanM / 2, 0.05, 0);
    scene.add(grid);

    // Tower A & Tower B
    const leftTowerType = tower.leftTowerStructureType || tower.towerStructureType || 'angle_steel';
    const rightTowerType = tower.rightTowerStructureType || tower.towerStructureType || 'angle_steel';

    const towerA = create3DTowerMesh(leftTowerType, leftAttachH, tower.voltageLevel);
    towerA.position.set(0, 0, 0);
    scene.add(towerA);

    const towerB = create3DTowerMesh(rightTowerType, rightAttachH, tower.voltageLevel);
    towerB.position.set(spanM, 0, 0);
    scene.add(towerB);

    // Insulators at Tower A & Tower B
    const stringLenA = insulatorRes?.stringLength || 2.5;
    const swingRadA = ((insulatorRes?.insulatorWindSwingAngle || 0) * Math.PI) / 180;

    const stringLenB = rightInsulatorRes?.stringLength || stringLenA;
    const swingRadB = ((rightInsulatorRes?.insulatorWindSwingAngle || insulatorRes?.insulatorWindSwingAngle || 0) * Math.PI) / 180;

    const typeA = insulator?.stringType || 'single_I';
    const typeB = rightInsulator?.stringType || typeA;
    const vAngleA = insulator?.vAngle || 90;
    const vAngleB = rightInsulator?.vAngle || vAngleA;

    const windAngleDeg = selectedResult?.windAngle ?? insulatorRes?.conductorWindAngle ?? 0;
    const windAngleRad = (windAngleDeg * Math.PI) / 180;

    // Helper to build realistic insulator string mesh
    const createDetailedInsulatorMesh = (
      len: number,
      matType?: string,
      side: 'A' | 'B' = 'A'
    ) => {
      const insGrp = new THREE.Group();
      insGrp.userData = { isInsulator: true, side };

      const activeInsMat = getInsulatorMat(side);
      const isSelected = side === 'A' ? isHighlightInsA : isHighlightInsB;

      // Core rod along -Y
      const core = new THREE.Mesh(
        new THREE.CylinderGeometry(isSelected ? 0.12 : 0.08, isSelected ? 0.12 : 0.08, len, 12),
        activeInsMat
      );
      core.position.y = -len / 2;
      core.userData = { isInsulator: true, side };
      insGrp.add(core);

      // Insulator disc sheds (伞裙) along -Y
      const numSheds = Math.max(5, Math.floor(len / 0.22));
      const shedMat = isSelected
        ? activeInsMat
        : new THREE.MeshStandardMaterial({
            color: matType === 'glass' ? 0x0284c7 : matType === 'composite' ? 0x94a3b8 : 0x475569,
            roughness: 0.2,
            metalness: 0.5,
          });

      for (let s = 1; s <= numSheds; s++) {
        const shedY = (s * len) / (numSheds + 1);
        const shed = new THREE.Mesh(
          new THREE.ConeGeometry(isSelected ? 0.35 : 0.28, 0.08, 14),
          shedMat
        );
        shed.position.y = -shedY;
        shed.userData = { isInsulator: true, side };
        insGrp.add(shed);
      }

      // Hardware end fittings
      const hardwareMat = new THREE.MeshStandardMaterial({
        color: isSelected ? 0x0284c7 : 0x334155,
        metalness: 0.85,
        roughness: 0.2,
      });
      const capTop = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.12, 0.25), hardwareMat);
      capTop.position.y = -0.06;
      capTop.userData = { isInsulator: true, side };
      insGrp.add(capTop);

      const capBot = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.12, 0.25), hardwareMat);
      capBot.position.y = -(len - 0.06);
      capBot.userData = { isInsulator: true, side };
      insGrp.add(capBot);

      // Corona / Grading Ring (220kV+ 均压防晕环)
      if (tower.voltageLevel >= 110) {
        const ringGeo = new THREE.TorusGeometry(0.38, 0.03, 12, 32);
        const ringMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.9, roughness: 0.1 });
        const ringMesh = new THREE.Mesh(ringGeo, ringMat);
        ringMesh.rotation.x = Math.PI / 2;
        ringMesh.position.y = -(len - 0.15);
        ringMesh.userData = { isInsulator: true, side };
        insGrp.add(ringMesh);
      }

      // Anti-wind Counter Weight (防风重锤, if counterweight > 0)
      const currentIns = side === 'A' ? insulator : (rightInsulator || insulator);
      const cwMass = currentIns?.counterWeightKg || 0;
      if (cwMass > 0) {
        const cwGeo = new THREE.CylinderGeometry(0.18, 0.22, 0.35, 16);
        const cwMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.8, roughness: 0.3 });
        const cwMesh = new THREE.Mesh(cwGeo, cwMat);
        cwMesh.position.y = -(len + 0.2);
        cwMesh.userData = { isInsulator: true, side };
        insGrp.add(cwMesh);
      }

      // Selection Halo Ring when selected
      if (isSelected) {
        const haloGeo = new THREE.TorusGeometry(0.5, 0.04, 12, 32);
        const haloMat = new THREE.MeshBasicMaterial({ color: 0x38bdf8 });
        const halo = new THREE.Mesh(haloGeo, haloMat);
        halo.rotation.x = Math.PI / 2;
        halo.position.y = -len / 2;
        insGrp.add(halo);
      }

      return insGrp;
    };

    // Calculate crossarm attachment Z offsets (lateral distance Z from tower center line)
    const hangOffsetA = getTowerCrossarmHangOffset(leftTowerType, tower.voltageLevel);
    const hangOffsetB = getTowerCrossarmHangOffset(rightTowerType, tower.voltageLevel);

    // Symmetric dual phase / crossarm Z positions (杆塔左右两边对称横担挂点)
    const crossarmZOffsetsA = [-hangOffsetA, hangOffsetA];
    const crossarmZOffsetsB = [-hangOffsetB, hangOffsetB];

    // Tower A Insulator assembly (Insulator attached at top Y = leftAttachH, Z = +-hangOffsetA)
    const attachPointsA: THREE.Vector3[] = [];

    crossarmZOffsetsA.forEach((zCrossarm) => {
      const topAttach = new THREE.Vector3(0, leftAttachH, zCrossarm);

      if (typeA === 'tension') {
        const insA = createDetailedInsulatorMesh(stringLenA, insulator?.material, 'A');
        insA.position.copy(topAttach);
        const dirAtoB = new THREE.Vector3(spanM, rightAttachH - leftAttachH, 0).normalize();
        insA.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dirAtoB);
        scene.add(insA);

        const bottomAttach = topAttach.clone().add(dirAtoB.clone().multiplyScalar(stringLenA));
        attachPointsA.push(bottomAttach);
      } else if (typeA === 'V_string') {
        const vHalfRad = ((vAngleA / 2) * Math.PI) / 180;
        const vSpanZ = stringLenA * Math.sin(vHalfRad);
        const vDrop = stringLenA * Math.cos(vHalfRad);

        const posLeg1 = new THREE.Vector3(0, leftAttachH, zCrossarm - vSpanZ);
        const posLeg2 = new THREE.Vector3(0, leftAttachH, zCrossarm + vSpanZ);

        const leg1 = createDetailedInsulatorMesh(stringLenA, insulator?.material, 'A');
        leg1.position.copy(posLeg1);
        leg1.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, -vDrop, vSpanZ).normalize());
        scene.add(leg1);

        const leg2 = createDetailedInsulatorMesh(stringLenA, insulator?.material, 'A');
        leg2.position.copy(posLeg2);
        leg2.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, -vDrop, -vSpanZ).normalize());
        scene.add(leg2);

        attachPointsA.push(new THREE.Vector3(0, leftAttachH - vDrop, zCrossarm));
      } else {
        // Single / Double I String (悬垂绝缘子串)
        const isDouble = typeA === 'double_I';
        const offsetZArr = isDouble ? [-0.2, 0.2] : [0];

        offsetZArr.forEach((offZ) => {
          const insGrp = createDetailedInsulatorMesh(stringLenA, insulator?.material, 'A');
          insGrp.position.set(0, leftAttachH, zCrossarm + offZ);
          insGrp.rotation.x = -swingRadA; // Swing in wind along transverse direction
          scene.add(insGrp);
        });

        // Exact bottom tip location where conductor attaches
        const yDrop = stringLenA * Math.cos(swingRadA);
        const zSwing = stringLenA * Math.sin(swingRadA);
        attachPointsA.push(new THREE.Vector3(0, leftAttachH - yDrop, zCrossarm + zSwing));
      }
    });

    // Tower B Insulator assembly
    const attachPointsB: THREE.Vector3[] = [];

    crossarmZOffsetsB.forEach((zCrossarm) => {
      const topAttach = new THREE.Vector3(spanM, rightAttachH, zCrossarm);

      if (typeB === 'tension') {
        const insB = createDetailedInsulatorMesh(stringLenB, rightInsulator?.material || insulator?.material, 'B');
        insB.position.copy(topAttach);
        const dirBtoA = new THREE.Vector3(-spanM, leftAttachH - rightAttachH, 0).normalize();
        insB.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), dirBtoA);
        scene.add(insB);

        const bottomAttach = topAttach.clone().add(dirBtoA.clone().multiplyScalar(stringLenB));
        attachPointsB.push(bottomAttach);
      } else if (typeB === 'V_string') {
        const vHalfRad = ((vAngleB / 2) * Math.PI) / 180;
        const vSpanZ = stringLenB * Math.sin(vHalfRad);
        const vDrop = stringLenB * Math.cos(vHalfRad);

        const posLeg1 = new THREE.Vector3(spanM, rightAttachH, zCrossarm - vSpanZ);
        const posLeg2 = new THREE.Vector3(spanM, rightAttachH, zCrossarm + vSpanZ);

        const leg1 = createDetailedInsulatorMesh(stringLenB, rightInsulator?.material || insulator?.material, 'B');
        leg1.position.copy(posLeg1);
        leg1.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, -vDrop, vSpanZ).normalize());
        scene.add(leg1);

        const leg2 = createDetailedInsulatorMesh(stringLenB, rightInsulator?.material || insulator?.material, 'B');
        leg2.position.copy(posLeg2);
        leg2.quaternion.setFromUnitVectors(new THREE.Vector3(0, -1, 0), new THREE.Vector3(0, -vDrop, -vSpanZ).normalize());
        scene.add(leg2);

        attachPointsB.push(new THREE.Vector3(spanM, rightAttachH - vDrop, zCrossarm));
      } else {
        const isDouble = typeB === 'double_I';
        const offsetZArr = isDouble ? [-0.2, 0.2] : [0];

        offsetZArr.forEach((offZ) => {
          const insGrp = createDetailedInsulatorMesh(stringLenB, rightInsulator?.material || insulator?.material, 'B');
          insGrp.position.set(spanM, rightAttachH, zCrossarm + offZ);
          insGrp.rotation.x = -swingRadB;
          scene.add(insGrp);
        });

        const yDrop = stringLenB * Math.cos(swingRadB);
        const zSwing = stringLenB * Math.sin(swingRadB);
        attachPointsB.push(new THREE.Vector3(spanM, rightAttachH - yDrop, zCrossarm + zSwing));
      }
    });

    // Conductors Catenary Cables
    const sagM = selectedResult?.sag || 0;
    const numSub = tower.numSubConductors || 1;
    const bundleDist = 0.4;

    for (let circuit = 0; circuit < attachPointsA.length; circuit++) {
      const attachA = attachPointsA[circuit];
      const attachB = attachPointsB[circuit];

      for (let sub = 0; sub < numSub; sub++) {
        const subAngle = (sub * 2 * Math.PI) / numSub;
        const offY = numSub > 1 ? bundleDist * Math.sin(subAngle) : 0;
        const offZ = numSub > 1 ? bundleDist * Math.cos(subAngle) : 0;

        const curvePoints: THREE.Vector3[] = [];
        const steps = 100;

        for (let i = 0; i <= steps; i++) {
          const t = i / steps;

          const baseX = attachA.x + t * (attachB.x - attachA.x);
          const baseY = attachA.y + t * (attachB.y - attachA.y);
          const baseZ = attachA.z + t * (attachB.z - attachA.z);

          const currentSag = 4 * sagM * t * (1 - t);

          const blowoutZ = currentSag * Math.sin(windAngleRad);
          const vertDropY = currentSag * Math.cos(windAngleRad);

          const x = baseX;
          const y = baseY - vertDropY + offY;
          const z = baseZ + blowoutZ + offZ;

          curvePoints.push(new THREE.Vector3(x, y, z));
        }

        const catenaryCurve = new THREE.CatmullRomCurve3(curvePoints);
        const tubeGeo = new THREE.TubeGeometry(catenaryCurve, 120, isHighlightCond ? 0.08 : 0.05, 8, false);
        const tubeMesh = new THREE.Mesh(tubeGeo, conductorMat);
        tubeMesh.castShadow = true;
        tubeMesh.userData = { isConductor: true };
        scene.add(tubeMesh);
      }
    }

    // 3D Crossing Obstacles
    (obstacles || []).forEach((obs) => {
      const distFromTowerA = obs.distanceFromLeftTower ?? 0;
      const obsHeight = obs.obstacleHeight ?? 0;
      if (distFromTowerA <= 0 || distFromTowerA >= spanM) return;

      const obsGroup = new THREE.Group();
      obsGroup.position.set(distFromTowerA, 0, 0);

      const boxGeo = new THREE.BoxGeometry(4, obsHeight, 12);
      const boxMat = new THREE.MeshStandardMaterial({
        color: 0xef4444,
        roughness: 0.4,
        metalness: 0.2,
      });
      const boxMesh = new THREE.Mesh(boxGeo, boxMat);
      boxMesh.position.y = obsHeight / 2;
      obsGroup.add(boxMesh);

      scene.add(obsGroup);
    });

    // 3D Visual Dimension Geometry (Central Sag & Representative Span)
    const pA = attachPointsA[0] || new THREE.Vector3(0, leftAttachH, 0);
    const pB = attachPointsB[0] || new THREE.Vector3(spanM, rightAttachH, 0);

    // Wind Angle calculation
    const isWindSwing = Math.abs(windAngleDeg) > 0.1;
    isWindSwingRef.current = isWindSwing;

    // 1. Dashed chord line connecting left and right insulator attachment points (前后端绝缘子挂点连线虚线)
    const chordMat = new THREE.LineDashedMaterial({
      color: 0x94a3b8,
      dashSize: 1.2,
      gapSize: 0.6,
    });
    const chordGeo = new THREE.BufferGeometry().setFromPoints([pA, pB]);
    const chordLine = new THREE.Line(chordGeo, chordMat);
    chordLine.computeLineDistances();
    scene.add(chordLine);

    // Midpoint of insulator attachment chord line
    const midChordPos = new THREE.Vector3().addVectors(pA, pB).multiplyScalar(0.5);

    // Offsets based on wind swing angle
    const blowoutZ = sagM * Math.sin(windAngleRad);
    const vertDropY = sagM * Math.cos(windAngleRad);

    // 3 Vertices for Sag & Wind Swing Right Triangle:
    // V_top: Chord midpoint
    const V_top = midChordPos.clone();
    // V_vert: Vertical drop directly below V_top
    const V_vert = new THREE.Vector3(midChordPos.x, midChordPos.y - vertDropY, midChordPos.z);
    // V_cond: Conductor curve midpoint
    const V_cond = new THREE.Vector3(midChordPos.x, midChordPos.y - vertDropY, midChordPos.z + blowoutZ);

    blowoutZRef.current = blowoutZ;

    if (isWindSwing) {
      // 1. 竖直虚线 (Vertical dashed line = vertical central sag f_v)
      const vertLineMat = new THREE.LineDashedMaterial({
        color: 0x0284c7,
        dashSize: 0.6,
        gapSize: 0.3,
      });
      const vertLineGeo = new THREE.BufferGeometry().setFromPoints([V_top, V_vert]);
      const vertLine = new THREE.Line(vertLineGeo, vertLineMat);
      vertLine.computeLineDistances();
      scene.add(vertLine);

      // 中央弧垂 (Sag label) 放在竖直虚线中心位置
      const vertMidPos = new THREE.Vector3().addVectors(V_top, V_vert).multiplyScalar(0.5);
      sagWorldPosRef.current.copy(vertMidPos);

      // 2. 水平虚线 (Horizontal dashed line = horizontal offset distance f_h)
      const horizLineMat = new THREE.LineDashedMaterial({
        color: 0x0284c7,
        dashSize: 0.6,
        gapSize: 0.3,
      });
      const horizLineGeo = new THREE.BufferGeometry().setFromPoints([V_vert, V_cond]);
      const horizLine = new THREE.Line(horizLineGeo, horizLineMat);
      horizLine.computeLineDistances();
      scene.add(horizLine);

      // 导线水平偏移 (Horizontal offset label) 放在横线虚线中心位置
      const horizMidPos = new THREE.Vector3().addVectors(V_vert, V_cond).multiplyScalar(0.5);
      horizWorldPosRef.current.copy(horizMidPos);

      // 3. 斜虚线 (Oblique dashed line = overall resultant offset/sag f)
      const obliqueLineMat = new THREE.LineDashedMaterial({
        color: 0x0284c7,
        dashSize: 0.8,
        gapSize: 0.4,
      });
      const obliqueLineGeo = new THREE.BufferGeometry().setFromPoints([V_top, V_cond]);
      const obliqueLine = new THREE.Line(obliqueLineGeo, obliqueLineMat);
      obliqueLine.computeLineDistances();
      scene.add(obliqueLine);

      // 整体偏移/弧垂 (Oblique sag label) 放在斜线虚线中心位置
      const obliqueMidPos = new THREE.Vector3().addVectors(V_top, V_cond).multiplyScalar(0.5);
      obliqueWorldPosRef.current.copy(obliqueMidPos);

      // Ticks at vertices
      const tickTop = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.06, 1.2),
        new THREE.MeshBasicMaterial({ color: 0x38bdf8 })
      );
      tickTop.rotation.z = Math.PI / 2;
      tickTop.position.copy(V_top);
      scene.add(tickTop);

      const tickVert = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.06, 1.2),
        new THREE.MeshBasicMaterial({ color: 0x38bdf8 })
      );
      tickVert.rotation.x = Math.PI / 2;
      tickVert.position.copy(V_vert);
      scene.add(tickVert);

      const tickCond = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.06, 1.2),
        new THREE.MeshBasicMaterial({ color: 0x38bdf8 })
      );
      tickCond.rotation.z = Math.PI / 2;
      tickCond.position.copy(V_cond);
      scene.add(tickCond);

      // 4. 3D Arc Sector at V_top showing wind swing angle (在竖直虚线和斜虚线夹角出做弧线)
      const arcRadius = Math.min(2.8, sagM * 0.3);
      const arcSegments = 24;
      const arcPoints: THREE.Vector3[] = [];
      const sign = Math.sign(windAngleRad || 1);
      for (let i = 0; i <= arcSegments; i++) {
        const stepAngle = (i / arcSegments) * Math.abs(windAngleRad);
        const ay = V_top.y - arcRadius * Math.cos(stepAngle);
        const az = V_top.z + arcRadius * Math.sin(stepAngle) * sign;
        arcPoints.push(new THREE.Vector3(V_top.x, ay, az));
      }
      const arcGeo = new THREE.BufferGeometry().setFromPoints(arcPoints);
      const arcMat = new THREE.LineBasicMaterial({ color: 0x38bdf8, linewidth: 2 });
      const arcLine = new THREE.Line(arcGeo, arcMat);
      scene.add(arcLine);

      // 风偏角标记放在弧线角平分线位置
      const bisectorAngle = Math.abs(windAngleRad) / 2;
      const bisectorY = V_top.y - (arcRadius + 0.6) * Math.cos(bisectorAngle);
      const bisectorZ = V_top.z + (arcRadius + 0.6) * Math.sin(bisectorAngle) * sign;
      angleWorldPosRef.current.set(V_top.x, bisectorY, bisectorZ);
    } else {
      // 没有风偏时：只显示竖直虚线
      const vertLineMat = new THREE.LineDashedMaterial({
        color: 0x0284c7,
        dashSize: 0.6,
        gapSize: 0.3,
      });
      const vertLineGeo = new THREE.BufferGeometry().setFromPoints([V_top, V_cond]);
      const vertLine = new THREE.Line(vertLineGeo, vertLineMat);
      vertLine.computeLineDistances();
      scene.add(vertLine);

      const vertMidPos = new THREE.Vector3().addVectors(V_top, V_cond).multiplyScalar(0.5);
      sagWorldPosRef.current.copy(vertMidPos);

      const tickTop = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.06, 1.2),
        new THREE.MeshBasicMaterial({ color: 0x38bdf8 })
      );
      tickTop.rotation.z = Math.PI / 2;
      tickTop.position.copy(V_top);
      scene.add(tickTop);

      const tickBot = new THREE.Mesh(
        new THREE.CylinderGeometry(0.06, 0.06, 1.2),
        new THREE.MeshBasicMaterial({ color: 0x38bdf8 })
      );
      tickBot.rotation.z = Math.PI / 2;
      tickBot.position.copy(V_cond);
      scene.add(tickBot);
    }

    // 3. Tower stake center line at ground level (前后端杆塔桩位中心连线)
    const stakeLineMat = new THREE.LineDashedMaterial({
      color: 0x06b6d4,
      dashSize: 1.5,
      gapSize: 0.8,
    });
    const stakeLineGeo = new THREE.BufferGeometry().setFromPoints([
      new THREE.Vector3(0, 0.3, 0),
      new THREE.Vector3(spanM, 0.3, 0),
    ]);
    const stakeLine = new THREE.Line(stakeLineGeo, stakeLineMat);
    stakeLine.computeLineDistances();
    scene.add(stakeLine);

    // End ticks at Tower A stake center and Tower B stake center
    const stakeTickA = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 1.5),
      new THREE.MeshBasicMaterial({ color: 0x06b6d4 })
    );
    stakeTickA.position.set(0, 0.3, 0);
    scene.add(stakeTickA);

    const stakeTickB = new THREE.Mesh(
      new THREE.CylinderGeometry(0.08, 0.08, 1.5),
      new THREE.MeshBasicMaterial({ color: 0x06b6d4 })
    );
    stakeTickB.position.set(spanM, 0.3, 0);
    scene.add(stakeTickB);

    // World Position for Representative Span & Tower Height Diff 3D Label Badge (at midpoint of front and rear tower stake line)
    const spanWorldPos = new THREE.Vector3(spanM / 2, 1.2, 0);
    spanWorldPosRef.current.copy(spanWorldPos);

    // 3D Raycaster Clicking for Interactive Inspection & Highlighting
    const raycaster = new THREE.Raycaster();
    const mouse = new THREE.Vector2();

    let pointerDownPos = { x: 0, y: 0 };
    const handlePointerDown = (event: MouseEvent) => {
      pointerDownPos = { x: event.clientX, y: event.clientY };
    };

    const handleCanvasClick = (event: MouseEvent) => {
      if (!container || !camera) return;
      const dx = event.clientX - pointerDownPos.x;
      const dy = event.clientY - pointerDownPos.y;
      // Skip raycast if pointer moved significantly (user was dragging to orbit or pan camera)
      if (Math.hypot(dx, dy) > 6) return;

      const rect = container.getBoundingClientRect();
      mouse.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      mouse.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;

      raycaster.setFromCamera(mouse, camera);
      const intersects = raycaster.intersectObjects(scene.children, true);

      let targetInsulator: { side: 'A' | 'B'; point: THREE.Vector3 } | null = null;
      let targetConductor: { point: THREE.Vector3 } | null = null;

      for (const hit of intersects) {
        let curr: THREE.Object3D | null = hit.object;
        while (curr) {
          if (curr.userData?.isInsulator) {
            targetInsulator = {
              side: curr.userData.side || (hit.point.x < spanM / 2 ? 'A' : 'B'),
              point: hit.point,
            };
            break;
          }
          if (curr.userData?.isConductor) {
            targetConductor = { point: hit.point };
            break;
          }
          curr = curr.parent;
        }
        if (targetInsulator || targetConductor) break;
      }

      if (targetInsulator) {
        const isTowerA = targetInsulator.side === 'A' || targetInsulator.point.x < spanM / 2;
        setSelected3DKey(isTowerA ? 'insulatorA' : 'insulatorB');

        const currentIns = isTowerA ? insulator : (rightInsulator || insulator);
        const currentRes = isTowerA ? insulatorRes : (rightInsulatorRes || insulatorRes);
        const sideName = isTowerA ? 'A 塔 (左侧杆塔)' : 'B 塔 (右侧杆塔)';
        const stringTypeStr =
          currentIns?.stringType === 'tension'
            ? '耐张绝缘子串'
            : currentIns?.stringType === 'V_string'
            ? 'V型绝缘子串'
            : '悬垂绝缘子串';

        setInspector3D({
          title: `${sideName} - ${stringTypeStr} (高亮选中)`,
          subtitle: `材质: ${
            currentIns?.material === 'composite'
              ? '硅橡胶复合'
              : currentIns?.material === 'glass'
              ? '钢化玻璃'
              : '瓷绝缘子'
          } | 串片数: ${currentRes?.finalCount || 14} 片`,
          typeBadge: '绝缘子串 (规范 2-6-44)',
          worldPos: targetInsulator.point.clone(),
          metrics: [
            { label: '规范风偏角 φ', value: `${(currentRes?.insulatorWindSwingAngle || 0).toFixed(1)}°`, highlight: true },
            { label: '绝缘子串压 P_I', value: `${((currentRes?.windLoadOnString || 0) * 1000).toFixed(0)} N` },
            { label: '绝缘子串重 G_I', value: `${((currentRes?.stringTotalWeightKg || 0) * 9.80665).toFixed(0)} N` },
            { label: '导线风荷载 P·l_H', value: `${((currentRes?.conductorWindLoadOnString || 0) * 1000).toFixed(0)} N` },
            { label: '导线重荷载 W₁·l_v', value: `${((currentRes?.conductorWeightOnString || 0) * 1000).toFixed(0)} N` },
            { label: '防风重锤 G_cw', value: `${((currentRes?.counterWeightMass || 0) * 9.80665).toFixed(0)} N` },
            { label: '横向风偏位移 Δx', value: `${(currentRes?.horizontalDisplacement || 0).toFixed(2)} m` },
            { label: '塔头电气安全净空', value: `${(currentRes?.actualClearanceToTower || 0).toFixed(2)} m (要求 ≥ ${(currentRes?.minAirClearanceRequired || 0).toFixed(2)}m)`, highlight: true },
          ],
        });
      } else if (targetConductor) {
        setSelected3DKey('conductor');

        const sagVal = selectedResult?.sag ?? 0;
        const tensVal = selectedResult?.tensionKn ?? 0;
        const stressVal = selectedResult?.stress ?? 0;
        setInspector3D({
          title: `220kV 高压导线组 (${conductor.name || 'LGJ-400/35'}) (高亮选中)`,
          subtitle: `运行工况: ${selectedResult?.conditionName || '基准工况'}`,
          typeBadge: '高压导线 (选中发光)',
          worldPos: targetConductor.point.clone(),
          metrics: [
            { label: '最大张力 T', value: `${tensVal.toFixed(2)} kN`, highlight: true },
            { label: '运行应力 σ', value: `${stressVal.toFixed(2)} N/mm²` },
            { label: '中央最大弧垂 f', value: `${sagVal.toFixed(2)} m`, highlight: true },
            { label: '分裂导线', value: `${tower.numSubConductors || 1} 分裂` },
            { label: '对地/跨越物净空', value: `${(selectedResult?.clearanceToGround ?? 0).toFixed(2)} m` },
          ],
        });
      } else {
        setSelected3DKey(null);
        setInspector3D(null);
      }
    };

    renderer.domElement.addEventListener('pointerdown', handlePointerDown);
    renderer.domElement.addEventListener('click', handleCanvasClick);

    // Animation Render Loop with Screen Projection
    let animationFrameId: number;

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);

      if (controlsRef.current) {
        const distToTarget = camera.position.distanceTo(controlsRef.current.target);

        // Dynamically scale panSpeed based on camera distance so dragging when close to ground/towers
        // moves the view smoothly by meters instead of millimeters (prevents sluggish pan)
        controlsRef.current.panSpeed = Math.max(1.6, 1.6 * (35.0 / Math.max(distToTarget, 1.0)));

        // Prevent camera & target singularity locking
        if (distToTarget < 0.05) {
          const fwd = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 2).negate();
          controlsRef.current.target.copy(camera.position).addScaledVector(fwd, 1.0);
        }

        controlsRef.current.update();

        // Save active camera position and orbit target
        if (cameraRef.current) {
          savedCameraPosRef.current = cameraRef.current.position.clone();
          savedTargetRef.current = controlsRef.current.target.clone();
        }
      }

      // Update Inspector 2D Screen Position
      if (inspector3DRef.current && cameraRef.current && containerRef.current) {
        const pos = inspector3DRef.current.worldPos.clone().project(cameraRef.current);

        const widthHalf = containerRef.current.clientWidth / 2;
        const heightHalf = containerRef.current.clientHeight / 2;

        const screenX = pos.x * widthHalf + widthHalf;
        const screenY = -(pos.y * heightHalf) + heightHalf;

        setInspectorScreenPos({ x: screenX, y: screenY });
      }

      // Update 3D Screen Labels for Central Sag, Wind Angle & Span/Height Diff
      if (cameraRef.current && containerRef.current) {
        const widthHalf = containerRef.current.clientWidth / 2;
        const heightHalf = containerRef.current.clientHeight / 2;

        // Project Wind Angle, Horizontal Offset & Oblique Sag
        if (isWindSwingRef.current) {
          const pAngle = angleWorldPosRef.current.clone().project(cameraRef.current);
          if (pAngle.z < 1) {
            setAngleScreenPos({
              x: pAngle.x * widthHalf + widthHalf,
              y: -(pAngle.y * heightHalf) + heightHalf,
              visible: true,
            });
          } else {
            setAngleScreenPos((prev) => (prev ? { ...prev, visible: false } : null));
          }

          const pHoriz = horizWorldPosRef.current.clone().project(cameraRef.current);
          if (pHoriz.z < 1) {
            setHorizScreenPos({
              x: pHoriz.x * widthHalf + widthHalf,
              y: -(pHoriz.y * heightHalf) + heightHalf,
              visible: true,
            });
          } else {
            setHorizScreenPos((prev) => (prev ? { ...prev, visible: false } : null));
          }

          const pOblique = obliqueWorldPosRef.current.clone().project(cameraRef.current);
          if (pOblique.z < 1) {
            setObliqueScreenPos({
              x: pOblique.x * widthHalf + widthHalf,
              y: -(pOblique.y * heightHalf) + heightHalf,
              visible: true,
            });
          } else {
            setObliqueScreenPos((prev) => (prev ? { ...prev, visible: false } : null));
          }
        } else {
          setAngleScreenPos(null);
          setHorizScreenPos(null);
          setObliqueScreenPos(null);
        }

        // Project Central Sag / Overall Sag (at V_cond)
        const pSag = sagWorldPosRef.current.clone().project(cameraRef.current);
        if (pSag.z < 1) {
          setSagScreenPos({
            x: pSag.x * widthHalf + widthHalf,
            y: -(pSag.y * heightHalf) + heightHalf,
            visible: true,
          });
        } else {
          setSagScreenPos((prev) => (prev ? { ...prev, visible: false } : null));
        }

        // Project Span & Height Diff (at stake center)
        const pSpan = spanWorldPosRef.current.clone().project(cameraRef.current);
        if (pSpan.z < 1) {
          setSpanScreenPos({
            x: pSpan.x * widthHalf + widthHalf,
            y: -(pSpan.y * heightHalf) + heightHalf,
            visible: true,
          });
        } else {
          setSpanScreenPos((prev) => (prev ? { ...prev, visible: false } : null));
        }
      }

      renderer.render(scene, camera);
    };

    animate();

    // Window Resize Handler
    const handleResize = () => {
      if (!container || !cameraRef.current) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      cameraRef.current.aspect = w / h;
      cameraRef.current.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    window.addEventListener('resize', handleResize);

    return () => {
      cancelAnimationFrame(animationFrameId);
      window.removeEventListener('resize', handleResize);
      renderer.domElement.removeEventListener('click', handleCanvasClick);
      renderer.domElement.removeEventListener('pointerdown', handlePointerDown);
      renderer.domElement.removeEventListener('contextmenu', preventContextMenu);
      renderer.domElement.removeEventListener('wheel', handleWheel);
      controls.dispose();
      renderer.dispose();
    };
  }, [
    tower,
    conductor,
    selectedResult,
    obstacles,
    insulator,
    rightInsulator,
    insulatorRes,
    rightInsulatorRes,
    selected3DKey,
  ]);

  // Camera Zoom Handler (smooth zoom relative to target point & view direction)
  const handleZoom = (direction: 'in' | 'out') => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;

    camera.updateMatrixWorld();
    const fwd = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 2).negate();
    const target = controls.target;
    const dist = camera.position.distanceTo(target);

    const step = Math.max(dist * 0.22, 4.5);

    if (direction === 'in') {
      if (dist <= step + 0.8) {
        camera.position.addScaledVector(fwd, step);
        target.addScaledVector(fwd, step);
      } else {
        camera.position.addScaledVector(fwd, step);
      }
    } else {
      camera.position.addScaledVector(fwd, -step);
    }

    if (!savedCameraPosRef.current) savedCameraPosRef.current = new THREE.Vector3();
    if (!savedTargetRef.current) savedTargetRef.current = new THREE.Vector3();
    savedCameraPosRef.current.copy(camera.position);
    savedTargetRef.current.copy(target);

    controls.update();
  };

  // Directional Pan Handler (smooth screen-space camera pan)
  const handlePan = (direction: 'up' | 'down' | 'left' | 'right') => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;

    camera.updateMatrixWorld();
    const right = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 0);
    const up = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 1);

    const distance = camera.position.distanceTo(controls.target);
    const step = Math.max(distance * 0.22, 4.5);

    const move = new THREE.Vector3();
    if (direction === 'up') move.addScaledVector(up, step);
    if (direction === 'down') move.addScaledVector(up, -step);
    if (direction === 'right') move.addScaledVector(right, step);
    if (direction === 'left') move.addScaledVector(right, -step);

    camera.position.add(move);
    controls.target.add(move);

    if (!savedCameraPosRef.current) savedCameraPosRef.current = new THREE.Vector3();
    if (!savedTargetRef.current) savedTargetRef.current = new THREE.Vector3();
    savedCameraPosRef.current.copy(camera.position);
    savedTargetRef.current.copy(controls.target);

    controls.update();
  };

  // View Preset Handler
  const setPresetView = (preset: 'side' | 'top' | 'towerA' | 'towerB' | 'reset') => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;

    const spanM = (tower.horizontalSpan && tower.horizontalSpan > 0) ? tower.horizontalSpan : tower.spanLength;
    const h = tower.heightDifference || 0;
    const attachHeightM = tower.leftAttachmentHeight || 35;

    if (preset === 'side') {
      camera.position.set(spanM / 2, attachHeightM, spanM * 1.1);
      controls.target.set(spanM / 2, attachHeightM / 2, 0);
    } else if (preset === 'top') {
      camera.position.set(spanM / 2, spanM * 0.9, 0.1);
      controls.target.set(spanM / 2, 0, 0);
    } else if (preset === 'towerA') {
      camera.position.set(-12, attachHeightM + 8, 22);
      controls.target.set(0, attachHeightM, 0);
    } else if (preset === 'towerB') {
      camera.position.set(spanM + 12, attachHeightM + h + 8, 22);
      controls.target.set(spanM, attachHeightM + h, 0);
    } else {
      camera.position.set(spanM / 2, attachHeightM + 25, spanM * 0.85);
      controls.target.set(spanM / 2, attachHeightM / 2, 0);
    }

    if (!savedCameraPosRef.current) savedCameraPosRef.current = new THREE.Vector3();
    if (!savedTargetRef.current) savedTargetRef.current = new THREE.Vector3();
    savedCameraPosRef.current.copy(camera.position);
    savedTargetRef.current.copy(controls.target);

    controls.update();
  };

  return (
    <div
      className={
        isFullscreen
          ? 'fixed inset-0 z-50 bg-slate-100 flex flex-col w-screen h-screen p-3 font-mono'
          : 'relative w-full h-full min-h-[520px] bg-slate-100 select-none font-mono transition-all overflow-hidden'
      }
    >
      <div
        ref={containerRef}
        className="w-full h-full cursor-grab active:cursor-grabbing touch-none"
      />

      {/* Floating 3D Raycasted Inspector Popover Card */}
      {inspector3D && inspectorScreenPos && (
        <div
          style={{
            left: `${Math.min(Math.max(inspectorScreenPos.x - 140, 20), window.innerWidth - 300)}px`,
            top: `${Math.min(Math.max(inspectorScreenPos.y - 180, 80), window.innerHeight - 260)}px`,
            backgroundColor: 'rgba(20, 24, 33, 0.7)',
          }}
          className="fixed z-50 w-72 p-3.5 backdrop-blur-md border border-sky-400/60 text-slate-100 rounded-2xl shadow-2xl shadow-slate-950/50 animate-fadeIn text-xs"
        >
          <div className="flex items-center justify-between pb-2 border-b border-slate-700/50 mb-2.5">
            <div className="flex items-center space-x-2">
              <span className="px-2 py-0.5 rounded-full bg-sky-500/20 text-white border border-sky-400/40 text-[10px] font-bold">
                {inspector3D.typeBadge}
              </span>
            </div>
            <button
              onClick={() => {
                setInspector3D(null);
                setSelected3DKey(null);
              }}
              className="text-slate-400 hover:text-white p-0.5 rounded-lg hover:bg-slate-800/50 transition-colors"
            >
              ✕
            </button>
          </div>

          <h4 className="font-bold text-sm text-white tracking-tight leading-snug">
            {inspector3D.title}
          </h4>
          <p className="text-[10px] text-slate-300 mb-3 font-mono">{inspector3D.subtitle}</p>

          <div className="space-y-1.5 font-mono text-[11px]">
            {inspector3D.metrics.map((m, idx) => (
              <div
                key={idx}
                className={`flex items-center justify-between p-1.5 rounded-xl border ${
                  m.highlight
                    ? 'bg-sky-500/20 border-sky-400/50 text-white font-bold'
                    : 'bg-slate-800/40 border-slate-700/50 text-slate-200'
                }`}
              >
                <span className="text-slate-200 font-medium">{m.label}:</span>
                <span className="text-white font-bold">
                  {m.value}
                </span>
              </div>
            ))}
          </div>

          <div className="mt-2.5 pt-2 border-t border-slate-800/50 flex items-center justify-between text-[10px] text-slate-300">
            <span className="flex items-center gap-1">
              <Sparkles className="w-3 h-3 text-cyan-300" /> 三维高亮发光节点
            </span>
            <span>高精物理反算</span>
          </div>
        </div>
      )}

      {/* RIGHT SIDE VERTICAL UI OVERLAY CONTROLS (右侧竖直排列) */}
      <div className="absolute top-14 right-3 z-30 flex flex-col items-end gap-2.5 pointer-events-auto">
        {/* Panel 1: Camera View Controls Toolbar */}
        <div className="glass-panel text-slate-100 rounded-2xl p-2.5 shadow-2xl flex flex-col gap-1.5 w-32 text-xs">
          <div className="text-[10px] text-cyan-400 font-bold px-1 uppercase flex items-center gap-1 font-mono border-b border-white/10 pb-1.5">
            <Eye className="w-3.5 h-3.5 text-cyan-400" /> 视角控制
          </div>
          <button
            onClick={() => setPresetView('side')}
            className="px-2.5 py-1.5 glass-button text-slate-200 hover:text-cyan-300 rounded-xl text-xs font-semibold transition-all text-left cursor-pointer"
          >
            侧视角
          </button>
          <button
            onClick={() => setPresetView('towerA')}
            className="px-2.5 py-1.5 glass-button text-slate-200 hover:text-cyan-300 rounded-xl text-xs font-semibold transition-all text-left cursor-pointer"
          >
            左塔(A)
          </button>
          <button
            onClick={() => setPresetView('towerB')}
            className="px-2.5 py-1.5 glass-button text-slate-200 hover:text-cyan-300 rounded-xl text-xs font-semibold transition-all text-left cursor-pointer"
          >
            右塔(B)
          </button>
          <button
            onClick={() => setPresetView('top')}
            className="px-2.5 py-1.5 glass-button text-slate-200 hover:text-cyan-300 rounded-xl text-xs font-semibold transition-all text-left cursor-pointer"
          >
            俯视角
          </button>
          <button
            onClick={() => setPresetView('reset')}
            className="px-2.5 py-1.5 glass-button text-slate-200 hover:text-cyan-300 rounded-xl text-xs font-semibold transition-all flex items-center justify-between cursor-pointer"
          >
            <span>复位</span>
            <RotateCcw className="w-3 h-3 text-sky-400" />
          </button>
          <button
            onClick={() => setIsFullscreen(!isFullscreen)}
            className="px-2.5 py-1.5 bg-cyan-500/25 hover:bg-cyan-500/40 text-cyan-200 rounded-xl text-xs font-bold border border-cyan-400/50 transition-all flex items-center justify-center gap-1.5 cursor-pointer mt-0.5"
          >
            {isFullscreen ? <Minimize2 className="w-3.5 h-3.5 text-cyan-400" /> : <Maximize2 className="w-3.5 h-3.5 text-cyan-400" />}
            <span>{isFullscreen ? '退出' : '全屏'}</span>
          </button>
        </div>

        {/* Panel 2: Roaming Controller D-Pad */}
        <div className="glass-panel text-slate-100 rounded-2xl p-2.5 shadow-2xl flex flex-col gap-1.5 w-32 text-xs">
          <div className="text-[10px] text-cyan-400 font-bold px-1 uppercase flex items-center gap-1 font-mono border-b border-white/10 pb-1.5">
            <Move className="w-3.5 h-3.5 text-cyan-400" /> 漫游控制
          </div>
          <div className="flex items-center justify-between gap-1">
            <button
              onClick={() => handleZoom('in')}
              className="p-1.5 flex-1 glass-button text-cyan-300 rounded-lg flex items-center justify-center transition-all cursor-pointer"
              title="放大 (Zoom In)"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => handleZoom('out')}
              className="p-1.5 flex-1 glass-button text-cyan-300 rounded-lg flex items-center justify-center transition-all cursor-pointer"
              title="缩小 (Zoom Out)"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="grid grid-cols-3 gap-1 items-center justify-center pt-1">
            <div />
            <button
              onClick={() => handlePan('up')}
              className="p-1.5 glass-button text-slate-200 hover:text-cyan-300 rounded-lg flex items-center justify-center transition-all cursor-pointer"
              title="向上平移"
            >
              <ChevronUp className="w-3.5 h-3.5" />
            </button>
            <div />
            <button
              onClick={() => handlePan('left')}
              className="p-1.5 glass-button text-slate-200 hover:text-cyan-300 rounded-lg flex items-center justify-center transition-all cursor-pointer"
              title="向左平移"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => setPresetView('reset')}
              className="p-1.5 glass-input text-sky-400 rounded-lg flex items-center justify-center text-[9px] font-bold cursor-pointer"
              title="复位"
            >
              <RotateCcw className="w-3 h-3" />
            </button>
            <button
              onClick={() => handlePan('right')}
              className="p-1.5 glass-button text-slate-200 hover:text-cyan-300 rounded-lg flex items-center justify-center transition-all cursor-pointer"
              title="向右平移"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
            <div />
            <button
              onClick={() => handlePan('down')}
              className="p-1.5 glass-button text-slate-200 hover:text-cyan-300 rounded-lg flex items-center justify-center transition-all cursor-pointer"
              title="向下平移"
            >
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
            <div />
          </div>
        </div>
      </div>

      {/* 3D Label Badge 1: Wind Swing Angle Badge (在竖直虚线和斜虚线夹角角平分线处显示风偏角度值) */}
      {isWindSwingRef.current && angleScreenPos && angleScreenPos.visible && (
        <div
          style={{
            left: `${angleScreenPos.x}px`,
            top: `${angleScreenPos.y}px`,
          }}
          className="fixed z-30 -translate-x-1/2 -translate-y-1/2 pointer-events-none transition-transform duration-75"
        >
          <div className="flex items-center space-x-1.5 px-2.5 py-1 bg-slate-950/80 text-white border border-sky-400 rounded-xl shadow-[0_0_15px_rgba(56,189,248,0.4)] backdrop-blur-xl text-xs font-mono font-extrabold">
            <Sparkles className="w-3.5 h-3.5 text-cyan-300" />
            <span>风偏角: γ = {Math.abs(selectedResult?.windAngle ?? 0).toFixed(1)}°</span>
          </div>
        </div>
      )}

      {/* 3D Label Badge 2: Central Sag (在竖直虚线中心位置显示中央弧垂) */}
      {sagScreenPos && sagScreenPos.visible && (
        <div
          style={{
            left: `${sagScreenPos.x}px`,
            top: `${sagScreenPos.y}px`,
          }}
          className="fixed z-30 -translate-x-1/2 -translate-y-1/2 pointer-events-none transition-transform duration-75"
        >
          <div className="flex items-center space-x-2 px-3 py-1.5 bg-slate-950/80 text-white border-2 border-sky-400 rounded-2xl shadow-[0_0_20px_rgba(56,189,248,0.45)] backdrop-blur-xl text-xs font-mono font-extrabold">
            <span className="w-2.5 h-2.5 rounded-full bg-cyan-300 animate-ping" />
            <span>
              中央弧垂: f = {(isWindSwingRef.current ? (selectedResult?.verticalSag ?? selectedResult?.sag ?? 0) : (selectedResult?.sag ?? 0)).toFixed(2)} m
            </span>
          </div>
        </div>
      )}

      {/* 3D Label Badge 3: Horizontal Offset (在横向虚线中心位置显示导线水平偏移距离) */}
      {isWindSwingRef.current && horizScreenPos && horizScreenPos.visible && (
        <div
          style={{
            left: `${horizScreenPos.x}px`,
            top: `${horizScreenPos.y}px`,
          }}
          className="fixed z-30 -translate-x-1/2 -translate-y-1/2 pointer-events-none transition-transform duration-75"
        >
          <div className="flex items-center space-x-1.5 px-2.5 py-1 bg-slate-950/80 text-white border border-sky-400 rounded-xl shadow-[0_0_15px_rgba(56,189,248,0.4)] backdrop-blur-xl text-xs font-mono font-extrabold">
            <Activity className="w-3.5 h-3.5 text-cyan-300" />
            <span>水平偏移: f_h = {(selectedResult?.horizontalSwing ?? Math.abs(blowoutZRef.current)).toFixed(2)} m</span>
          </div>
        </div>
      )}

      {/* 3D Label Badge 4: Oblique / Total Sag (在斜虚线中心位置显示整体偏移) */}
      {isWindSwingRef.current && obliqueScreenPos && obliqueScreenPos.visible && (
        <div
          style={{
            left: `${obliqueScreenPos.x}px`,
            top: `${obliqueScreenPos.y}px`,
          }}
          className="fixed z-30 -translate-x-1/2 -translate-y-1/2 pointer-events-none transition-transform duration-75"
        >
          <div className="flex items-center space-x-1.5 px-2.5 py-1 bg-slate-950/80 text-white border border-sky-400 rounded-xl shadow-[0_0_15px_rgba(56,189,248,0.4)] backdrop-blur-xl text-xs font-mono font-extrabold">
            <Compass className="w-3.5 h-3.5 text-cyan-300" />
            <span>整体偏移: f_t = {(selectedResult?.sag ?? 0).toFixed(2)} m</span>
          </div>
        </div>
      )}

      {/* 3D Label Badge 2: Representative Span & Height Diff (代表档距/塔高差) positioned between towers in 3D */}
      {spanScreenPos && spanScreenPos.visible && (
        <div
          style={{
            left: `${spanScreenPos.x}px`,
            top: `${spanScreenPos.y}px`,
          }}
          className="fixed z-30 -translate-x-1/2 -translate-y-1/2 pointer-events-none transition-transform duration-75"
        >
          <div className="flex items-center space-x-2 px-3.5 py-1.5 bg-slate-950/70 text-cyan-300 border-2 border-cyan-400 rounded-2xl shadow-[0_0_20px_rgba(6,182,212,0.45)] backdrop-blur-xl text-xs font-mono font-extrabold">
            <Compass className="w-4 h-4 text-cyan-400" />
            {(() => {
              const defaultL = (tower.horizontalSpan && tower.horizontalSpan > 0) ? tower.horizontalSpan : tower.spanLength;
              const lhA = tower.leftHorizontalSpan ?? defaultL;
              const lhB = tower.rightHorizontalSpan ?? defaultL;
              const lvA = tower.leftVerticalSpan ?? (tower.leftKvValue !== undefined ? Math.round(tower.leftKvValue * lhA) : lhA);
              const lvB = tower.rightVerticalSpan ?? (tower.rightKvValue !== undefined ? Math.round(tower.rightKvValue * lhB) : lhB);
              return (
                <>
                  <span>水平档距 l_hA/l_hB = {lhA}m / {lhB}m</span>
                  <span className="text-slate-500 font-normal">|</span>
                  <span>垂直档距 l_vA/l_vB = {lvA}m / {lvB}m</span>
                </>
              );
            })()}
            <span className="text-slate-500 font-normal">|</span>
            <span>代表档距 L_r = {tower.spanLength} m</span>
            <span className="text-slate-500 font-normal">|</span>
            <span>塔高差 h = {tower.heightDifference || 0} m</span>
          </div>
        </div>
      )}
    </div>
  );
};
