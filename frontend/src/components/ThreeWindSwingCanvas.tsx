import React, { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import {
  ZoomIn,
  ZoomOut,
  RotateCcw,
  ChevronUp,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Compass,
  Eye,
  Move,
} from 'lucide-react';
import { create3DTowerMesh, getTowerCrossarmHangOffset } from '../utils/tower3dGenerator';
import {
  TowerParameters,
  Conductor,
  Insulator,
  InsulatorStringType,
  InsulatorCalcResult,
} from '../types';

interface ThreeWindSwingCanvasProps {
  tower: TowerParameters;
  conductor: Conductor;
  insulator: Insulator;
  calcResult?: InsulatorCalcResult;
  stringType?: InsulatorStringType;
  swingAngleDeg?: number;
  conductorWindAngleDeg?: number;
  stringLengthM?: number;
  horizDisplacement?: number;
  vertDropDisplacement?: number;
  minClearanceReq?: number;
  actualClearance?: number;
  clearancePassed?: boolean;
  windSpeed?: number;
  counterWeightKg?: number;
  vAngleDeg?: number;
  cameraPreset?: 'front' | 'iso' | 'top' | 'side';
}

export const ThreeWindSwingCanvas: React.FC<ThreeWindSwingCanvasProps> = ({
  tower,
  conductor,
  insulator,
  calcResult,
  stringType: propStringType,
  swingAngleDeg: propSwingAngleDeg,
  conductorWindAngleDeg: propConductorWindAngleDeg,
  stringLengthM: propStringLengthM,
  horizDisplacement: propHorizDisplacement,
  vertDropDisplacement: propVertDropDisplacement,
  minClearanceReq: propMinClearanceReq,
  actualClearance: propActualClearance,
  clearancePassed: propClearancePassed,
  windSpeed = 25,
  counterWeightKg = 0,
  vAngleDeg = 90,
  cameraPreset = 'front',
}) => {
  const stringType = propStringType || insulator.stringType || 'single_I';
  const swingAngleDeg = propSwingAngleDeg ?? calcResult?.insulatorWindSwingAngle ?? 0;
  const conductorWindAngleDeg = propConductorWindAngleDeg ?? calcResult?.conductorWindAngle ?? 0;
  const stringLengthM = propStringLengthM ?? calcResult?.stringLength ?? 1.5;
  const horizDisplacement = propHorizDisplacement ?? calcResult?.horizontalDisplacement ?? 0;
  const vertDropDisplacement = propVertDropDisplacement ?? calcResult?.verticalDropDisplacement ?? 0;
  const minClearanceReq = propMinClearanceReq ?? calcResult?.minAirClearanceRequired ?? 2.5;
  const actualClearance = propActualClearance ?? calcResult?.actualClearanceToTower ?? 3.0;
  const clearancePassed = propClearancePassed ?? calcResult?.clearancePassed ?? true;
  const containerRef = useRef<HTMLDivElement>(null);
  const controlsRef = useRef<OrbitControls | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);

  // Persistent Camera state refs across re-renders
  const savedCameraPosRef = useRef<THREE.Vector3 | null>(null);
  const savedTargetRef = useRef<THREE.Vector3 | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    // Scene Setup
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0a0f1d);
    scene.fog = new THREE.FogExp2(0x0a0f1d, 0.002);

    // Camera Setup
    const aspect = container.clientWidth / container.clientHeight || 1.6;
    const camera = new THREE.PerspectiveCamera(45, aspect, 0.1, 1000);
    cameraRef.current = camera;

    // Renderer Setup
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    // Clear previous canvas
    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    // Orbit Controls
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.rotateSpeed = 0.95;
    controls.zoomSpeed = 1.6;
    controls.panSpeed = 1.6;
    controls.enableZoom = false; // Use custom wheel handler for effortless close-up zoom
    controls.screenSpacePanning = true; // Enables intuitive vertical & horizontal screen-relative panning
    controls.minDistance = 0.05; // Allow close-up inspection without locking
    controls.maxDistance = 20000;
    controls.maxPolarAngle = Math.PI / 2 + 0.25; // Allow viewing slightly below horizon
    controls.listenToKeyEvents(container); // Arrow key panning
    controlsRef.current = controls;

    renderer.domElement.style.touchAction = 'none';
    const preventContextMenu = (e: MouseEvent) => e.preventDefault();
    renderer.domElement.addEventListener('contextmenu', preventContextMenu);

    // Custom high-responsiveness Wheel Zoom Handler (prevents tiny wheel steps when close to insulator/tower/ground)
    const handleWheel = (e: WheelEvent) => {
      e.preventDefault();
      if (!cameraRef.current || !controlsRef.current) return;
      const cam = cameraRef.current;
      const ctrl = controlsRef.current;

      cam.updateMatrixWorld();
      const fwd = new THREE.Vector3().setFromMatrixColumn(cam.matrix, 2).negate();
      const dist = cam.position.distanceTo(ctrl.target);

      // Generous zoom step with a 2.5m floor so close-up wheel zooming is fast, clear & effortless
      const step = Math.max(dist * 0.18, 2.5);

      if (e.deltaY < 0) {
        // Zooming IN
        if (dist <= step + 0.5) {
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

    // Restore saved camera position & target if present, otherwise set default framing based on preset
    if (savedCameraPosRef.current && savedTargetRef.current) {
      camera.position.copy(savedCameraPosRef.current);
      controls.target.copy(savedTargetRef.current);
    } else {
      if (cameraPreset === 'front') {
        camera.position.set(0, -5, 38);
        controls.target.set(0, -stringLengthM, 0);
      } else if (cameraPreset === 'iso') {
        camera.position.set(25, 12, 32);
        controls.target.set(0, -stringLengthM / 2, 0);
      } else if (cameraPreset === 'side') {
        camera.position.set(40, -5, 0);
        controls.target.set(0, -stringLengthM, 0);
      } else if (cameraPreset === 'top') {
        camera.position.set(0, 35, 0.1);
        controls.target.set(0, 0, 0);
      } else {
        camera.position.set(0, -5, 38);
        controls.target.set(0, -stringLengthM, 0);
      }
    }
    controls.update();

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.8);
    scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
    dirLight.position.set(20, 40, 30);
    dirLight.castShadow = true;
    dirLight.shadow.mapSize.width = 2048;
    dirLight.shadow.mapSize.height = 2048;
    scene.add(dirLight);

    const fillLight = new THREE.DirectionalLight(0xb0c4de, 0.4);
    fillLight.position.set(-20, 20, -20);
    scene.add(fillLight);

    // Materials
    const steelMaterial = new THREE.MeshStandardMaterial({
      color: 0x334155,
      roughness: 0.3,
      metalness: 0.85,
    });

    const insulatorMaterial = new THREE.MeshStandardMaterial({
      color: 0x06b6d4,
      emissive: 0x0891b2,
      emissiveIntensity: 0.6,
      roughness: 0.1,
      metalness: 0.3,
    });

    const metalFittingMat = new THREE.MeshStandardMaterial({
      color: 0x94a3b8,
      roughness: 0.2,
      metalness: 0.9,
    });

    const conductorMat = new THREE.MeshStandardMaterial({
      color: 0x38bdf8,
      emissive: 0x0284c7,
      emissiveIntensity: 0.5,
      roughness: 0.15,
      metalness: 0.95,
    });

    const clearanceMat = new THREE.MeshStandardMaterial({
      color: clearancePassed ? 0x10b981 : 0xf59e0b,
      transparent: true,
      opacity: 0.25,
      wireframe: false,
    });

    const clearanceWireMat = new THREE.MeshBasicMaterial({
      color: clearancePassed ? 0x34d399 : 0xfbbf24,
      wireframe: true,
    });

    // 1. Ground Plane with Grid
    const groundGeo = new THREE.PlaneGeometry(150, 150);
    const groundMat = new THREE.MeshStandardMaterial({
      color: 0x0f172a,
      roughness: 0.95,
      metalness: 0.1,
    });
    const ground = new THREE.Mesh(groundGeo, groundMat);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = -22;
    ground.receiveShadow = true;
    scene.add(ground);

    const grid = new THREE.GridHelper(150, 30, 0x0284c7, 0x1e293b);
    grid.position.y = -21.9;
    scene.add(grid);

    // 2. Tower Steel Frame Geometry (Angle Steel Lattice or Tubular Steel Pipe Tower)
    const towerHeight = 22; // Height from ground to crossarm attachment
    const structType = tower.towerStructureType || 'angle_steel';
    const towerGroup = create3DTowerMesh(structType, towerHeight, tower.voltageLevel);
    towerGroup.position.set(0, -towerHeight, 0);
    scene.add(towerGroup);

    // 3. Insulator String & Conductor Group
    const stringGroup = new THREE.Group();
    const attachPointY = 0; // Crossarm level

    const swingRad = (swingAngleDeg * Math.PI) / 180;

    // Helper to build 3D Insulator Disc String Mesh
    const createInsulatorStringMesh = (lengthM: number) => {
      const stringObj = new THREE.Group();

      // Top fitting
      const topFitting = new THREE.Mesh(
        new THREE.CylinderGeometry(0.12, 0.12, 0.4, 8),
        metalFittingMat
      );
      topFitting.position.y = -0.2;
      stringObj.add(topFitting);

      // Discs along length
      const numDiscs = Math.max(Math.round(lengthM * 6), 6);
      const discSpacing = (lengthM - 0.6) / numDiscs;

      for (let i = 0; i < numDiscs; i++) {
        const discY = -0.4 - i * discSpacing;

        // Ceramic disc shed
        const discGeo = new THREE.CylinderGeometry(0.3, 0.08, 0.12, 16);
        const disc = new THREE.Mesh(discGeo, insulatorMaterial);
        disc.position.y = discY;
        disc.castShadow = true;
        stringObj.add(disc);

        // Pin fitting
        const pin = new THREE.Mesh(
          new THREE.CylinderGeometry(0.05, 0.05, discSpacing, 8),
          metalFittingMat
        );
        pin.position.y = discY - discSpacing / 2;
        stringObj.add(pin);
      }

      // Bottom yoke / clamp fitting
      const bottomFitting = new THREE.Mesh(
        new THREE.CylinderGeometry(0.15, 0.15, 0.4, 8),
        metalFittingMat
      );
      bottomFitting.position.y = -lengthM + 0.2;
      stringObj.add(bottomFitting);

      return stringObj;
    };

    // Lateral crossarm hanging offsets (Z distance for left & right crossarms)
    const hangOffset = getTowerCrossarmHangOffset(structType, tower.voltageLevel);
    const zSides = [-hangOffset, hangOffset];

    const conductorAttachPositions: THREE.Vector3[] = [];

    zSides.forEach((zSide) => {
      const sideGroup = new THREE.Group();
      sideGroup.position.set(0, 0, zSide);

      let attachPos = new THREE.Vector3(0, -stringLengthM, zSide);

      if (stringType === 'single_I') {
        const singleStr = createInsulatorStringMesh(stringLengthM);
        singleStr.rotation.z = swingRad;
        sideGroup.add(singleStr);

        attachPos.set(
          stringLengthM * Math.sin(swingRad),
          -stringLengthM * Math.cos(swingRad),
          zSide
        );
      } else if (stringType === 'double_I') {
        const str1 = createInsulatorStringMesh(stringLengthM);
        str1.position.z = -0.3;
        str1.rotation.z = swingRad;
        sideGroup.add(str1);

        const str2 = createInsulatorStringMesh(stringLengthM);
        str2.position.z = 0.3;
        str2.rotation.z = swingRad;
        sideGroup.add(str2);

        const yokeGeo = new THREE.BoxGeometry(0.2, 0.1, 0.8);
        const yoke = new THREE.Mesh(yokeGeo, metalFittingMat);
        yoke.position.set(
          stringLengthM * Math.sin(swingRad),
          -stringLengthM * Math.cos(swingRad),
          0
        );
        sideGroup.add(yoke);

        attachPos.set(
          stringLengthM * Math.sin(swingRad),
          -stringLengthM * Math.cos(swingRad),
          zSide
        );
      } else if (stringType === 'V_string') {
        const halfVRad = ((vAngleDeg / 2) * Math.PI) / 180;
        const armLength = stringLengthM;
        const vWidth = armLength * Math.sin(halfVRad);

        const vSwingOffset = horizDisplacement;

        const leftArm = createInsulatorStringMesh(armLength);
        leftArm.position.set(-vWidth, 0, 0);
        const leftDx = vSwingOffset - (-vWidth);
        const leftDy = -armLength * Math.cos(halfVRad) - vertDropDisplacement;
        leftArm.rotation.z = Math.atan2(leftDx, -leftDy);
        sideGroup.add(leftArm);

        const rightArm = createInsulatorStringMesh(armLength);
        rightArm.position.set(vWidth, 0, 0);
        const rightDx = vSwingOffset - vWidth;
        const rightDy = -armLength * Math.cos(halfVRad) - vertDropDisplacement;
        rightArm.rotation.z = Math.atan2(rightDx, -rightDy);
        sideGroup.add(rightArm);

        attachPos.set(
          horizDisplacement,
          -stringLengthM * Math.cos(halfVRad) - vertDropDisplacement,
          zSide
        );
      } else if (stringType === 'tension') {
        const tensionStr = createInsulatorStringMesh(stringLengthM);
        tensionStr.rotation.x = Math.PI / 2;
        sideGroup.add(tensionStr);

        attachPos.set(0, 0, zSide + stringLengthM);
      } else if (stringType === 'post') {
        const postMesh = new THREE.Mesh(
          new THREE.CylinderGeometry(0.25, 0.35, stringLengthM, 16),
          insulatorMaterial
        );
        postMesh.position.y = -stringLengthM / 2;
        sideGroup.add(postMesh);

        attachPos.set(0, -stringLengthM, zSide);
      }

      stringGroup.add(sideGroup);
      conductorAttachPositions.push(attachPos);
    });

    scene.add(stringGroup);

    // 4. Bundled Conductor Lines Extending along Span (Z-axis) for both crossarm circuits
    conductorAttachPositions.forEach((attachPos) => {
      const conductorGroup = new THREE.Group();
      conductorGroup.position.copy(attachPos);

      const numSub = tower.numSubConductors || 1;
      const bundleRadius = 0.25; // 400mm bundle diameter
      const spanLengthM = 120; // Visual span length rendered

      for (let i = 0; i < numSub; i++) {
        const angle = (i * 2 * Math.PI) / numSub;
        const offsetX = numSub > 1 ? bundleRadius * Math.cos(angle) : 0;
        const offsetY = numSub > 1 ? bundleRadius * Math.sin(angle) : 0;

        const points: THREE.Vector3[] = [];
        const steps = 40;
        for (let s = -steps; s <= steps; s++) {
          const z = (s / steps) * spanLengthM;
          const normZ = z / spanLengthM;
          const maxSagM = 6.0;
          const sag = maxSagM * (normZ * normZ);
          const windBlowout = sag * Math.sin((conductorWindAngleDeg * Math.PI) / 180);
          const vertDrop = sag * Math.cos((conductorWindAngleDeg * Math.PI) / 180);

          points.push(
            new THREE.Vector3(offsetX + windBlowout, offsetY - vertDrop, z)
          );
        }

        const curve = new THREE.CatmullRomCurve3(points);
        const tubeGeo = new THREE.TubeGeometry(curve, 60, 0.04, 8, false);
        const tubeMesh = new THREE.Mesh(tubeGeo, conductorMat);
        tubeMesh.castShadow = true;
        conductorGroup.add(tubeMesh);
      }

      // Conductor Clamp
      const clampMesh = new THREE.Mesh(
        new THREE.BoxGeometry(0.4, 0.3, 0.8),
        metalFittingMat
      );
      conductorGroup.add(clampMesh);

      // Counterweight
      if (counterWeightKg > 0) {
        const cwGroup = new THREE.Group();
        cwGroup.position.set(0, -0.6, 0);

        const rod = new THREE.Mesh(
          new THREE.CylinderGeometry(0.04, 0.04, 0.8, 8),
          metalFittingMat
        );
        cwGroup.add(rod);

        const weights = new THREE.Mesh(
          new THREE.CylinderGeometry(0.3, 0.3, 0.4, 12),
          new THREE.MeshStandardMaterial({ color: 0x333333, roughness: 0.5 })
        );
        weights.position.y = -0.4;
        cwGroup.add(weights);

        conductorGroup.add(cwGroup);
      }

      scene.add(conductorGroup);
    });

    // 5. Discharge Clearance Envelope Sphere
    const clearancePos = conductorAttachPositions[0] || new THREE.Vector3(0, -stringLengthM, 0);
    const clearanceSphereGeo = new THREE.SphereGeometry(minClearanceReq, 24, 24);
    const clearanceSphere = new THREE.Mesh(clearanceSphereGeo, clearanceMat);
    clearanceSphere.position.copy(clearancePos);
    scene.add(clearanceSphere);

    const clearanceWire = new THREE.Mesh(clearanceSphereGeo, clearanceWireMat);
    clearanceWire.position.copy(clearancePos);
    scene.add(clearanceWire);

    // 6. Wind Vectors (Flowing arrows)
    if (windSpeed > 0) {
      const windGroup = new THREE.Group();
      const numArrows = 12;
      for (let a = 0; a < numArrows; a++) {
        const arrowHead = new THREE.Mesh(
          new THREE.ConeGeometry(0.3, 0.8, 6),
          new THREE.MeshBasicMaterial({ color: 0x141414 })
        );
        arrowHead.rotation.z = -Math.PI / 2;
        arrowHead.position.set(
          -12 + (a % 4) * 6,
          -4 - Math.floor(a / 4) * 5,
          -15 + (a % 3) * 15
        );
        windGroup.add(arrowHead);
      }
      scene.add(windGroup);
    }

    // Animation Loop
    let animationFrameId: number;
    const clock = new THREE.Clock();

    const animate = () => {
      animationFrameId = requestAnimationFrame(animate);
      const elapsedTime = clock.getElapsedTime();

      // Subtle aerodynamic wind flutter
      if (windSpeed > 0) {
        const flutter = Math.sin(elapsedTime * 4) * 0.015 * (windSpeed / 20);
        stringGroup.rotation.z = flutter;
      }

      // Dynamically scale panSpeed based on camera distance so close-up mouse/touch drag moves smoothly
      const dist = camera.position.distanceTo(controls.target);
      controls.panSpeed = Math.max(1.6, 1.6 * (25.0 / Math.max(dist, 1.0)));

      // Prevent camera/target singularity locking when extremely close
      if (dist < 0.05) {
        const dir = new THREE.Vector3();
        camera.getWorldDirection(dir);
        controls.target.copy(camera.position).addScaledVector(dir, 1.0);
      }

      controls.update();
      renderer.render(scene, camera);
    };

    animate();

    // Resize Handler
    const handleResize = () => {
      if (!container) return;
      const w = container.clientWidth;
      const h = container.clientHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    };

    const resizeObserver = new ResizeObserver(() => handleResize());
    resizeObserver.observe(container);

    return () => {
      // Save camera state before cleanup
      if (cameraRef.current && controlsRef.current) {
        savedCameraPosRef.current = cameraRef.current.position.clone();
        savedTargetRef.current = controlsRef.current.target.clone();
      }
      cancelAnimationFrame(animationFrameId);
      resizeObserver.disconnect();
      renderer.domElement.removeEventListener('contextmenu', preventContextMenu);
      renderer.domElement.removeEventListener('wheel', handleWheel);
      controls.dispose();
      renderer.dispose();
      scene.clear();
    };
  }, [
    tower,
    conductor,
    insulator,
    stringType,
    swingAngleDeg,
    conductorWindAngleDeg,
    stringLengthM,
    horizDisplacement,
    vertDropDisplacement,
    minClearanceReq,
    actualClearance,
    clearancePassed,
    windSpeed,
    counterWeightKg,
    vAngleDeg,
    cameraPreset,
  ]);

  // Zoom Handler (smooth zoom relative to target point & view direction)
  const handleZoom = (direction: 'in' | 'out') => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;

    camera.updateMatrixWorld();
    const fwd = new THREE.Vector3().setFromMatrixColumn(camera.matrix, 2).negate();
    const target = controls.target;
    const dist = camera.position.distanceTo(target);

    const step = Math.max(dist * 0.22, 3.5);

    if (direction === 'in') {
      if (dist <= step + 0.5) {
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
    const step = Math.max(distance * 0.22, 3.5);

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

  // Reset Camera View
  const handleResetCamera = () => {
    const camera = cameraRef.current;
    const controls = controlsRef.current;
    if (!camera || !controls) return;

    if (cameraPreset === 'front') {
      camera.position.set(0, -5, 38);
      controls.target.set(0, -stringLengthM, 0);
    } else if (cameraPreset === 'iso') {
      camera.position.set(25, 12, 32);
      controls.target.set(0, -stringLengthM / 2, 0);
    } else if (cameraPreset === 'side') {
      camera.position.set(40, -5, 0);
      controls.target.set(0, -stringLengthM, 0);
    } else if (cameraPreset === 'top') {
      camera.position.set(0, 35, 0.1);
      controls.target.set(0, 0, 0);
    } else {
      camera.position.set(0, -5, 38);
      controls.target.set(0, -stringLengthM, 0);
    }

    if (!savedCameraPosRef.current) savedCameraPosRef.current = new THREE.Vector3();
    if (!savedTargetRef.current) savedTargetRef.current = new THREE.Vector3();
    savedCameraPosRef.current.copy(camera.position);
    savedTargetRef.current.copy(controls.target);

    controls.update();
  };

  return (
    <div className="relative w-full h-full min-h-[500px] bg-[#070b14] overflow-hidden select-none font-mono">
      <div ref={containerRef} className="w-full h-full cursor-grab active:cursor-grabbing touch-none" />

      {/* Top Left Title Overlay */}
      <div className="absolute top-3 left-3 glass-panel text-slate-100 p-3 text-[11px] rounded-2xl shadow-2xl">
        <div className="font-bold uppercase tracking-wider text-cyan-400 flex items-center gap-1.5">
          <Compass className="w-4 h-4 text-cyan-400" />
          3D 绝缘子风偏摇摆视口
        </div>
        <div className="mt-1 text-slate-300 font-mono">
          工况风速: <strong className="text-cyan-300">{windSpeed} m/s</strong> | 挂点: {tower.towerType === 'tension' ? '耐张塔头' : '直线悬垂塔头'}
        </div>
      </div>

      {/* Camera View Preset Toolbar - BOTTOM CENTER */}
      <div className="absolute bottom-3 left-1/2 -translate-x-1/2 z-30 flex items-center gap-1.5 glass-panel p-2 shadow-2xl rounded-2xl text-slate-100 text-xs">
        <span className="text-[10px] text-cyan-400 font-bold px-2 uppercase flex items-center gap-1 font-mono hidden sm:flex">
          <Eye className="w-3.5 h-3.5 text-cyan-400" /> 视角重置:
        </span>
        <button
          onClick={handleResetCamera}
          className="px-3 py-1.5 glass-button text-slate-200 hover:text-cyan-300 rounded-xl text-xs font-semibold transition-all flex items-center gap-1.5 shadow-sm cursor-pointer"
        >
          <RotateCcw className="w-3.5 h-3.5 text-sky-400" /> 复位 3D 视角
        </button>
      </div>

      {/* Floating Navigation Controls (Bottom Left) */}
      <div className="absolute bottom-4 left-3 glass-panel p-2.5 shadow-2xl rounded-2xl text-slate-100 text-xs flex flex-col gap-2">
        <div className="text-[10px] text-slate-300 font-bold uppercase tracking-wider flex items-center justify-between border-b border-white/10 pb-1.5">
          <span className="flex items-center gap-1">
            <Move className="w-3.5 h-3.5 text-cyan-400" /> 漫游控制器
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Zoom Buttons */}
          <div className="flex flex-col gap-1">
            <button
              onClick={() => handleZoom('in')}
              className="p-1.5 glass-button text-cyan-300 rounded-lg transition-all cursor-pointer"
              title="放大"
            >
              <ZoomIn className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => handleZoom('out')}
              className="p-1.5 glass-button text-cyan-300 rounded-lg transition-all cursor-pointer"
              title="缩小"
            >
              <ZoomOut className="w-3.5 h-3.5" />
            </button>
          </div>

          {/* D-Pad Pan Pad */}
          <div className="grid grid-cols-3 gap-1 w-16 h-16 items-center justify-center">
            <div />
            <button
              onClick={() => handlePan('up')}
              className="p-1 glass-button text-slate-200 hover:text-cyan-300 rounded-lg flex items-center justify-center transition-all cursor-pointer"
              title="向上平移"
            >
              <ChevronUp className="w-3.5 h-3.5" />
            </button>
            <div />
            <button
              onClick={() => handlePan('left')}
              className="p-1 glass-button text-slate-200 hover:text-cyan-300 rounded-lg flex items-center justify-center transition-all cursor-pointer"
              title="向左平移"
            >
              <ChevronLeft className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={handleResetCamera}
              className="p-1 glass-input text-sky-400 rounded-lg flex items-center justify-center text-[9px] font-bold cursor-pointer"
              title="复位中心"
            >
              <RotateCcw className="w-3 h-3" />
            </button>
            <button
              onClick={() => handlePan('right')}
              className="p-1 glass-button text-slate-200 hover:text-cyan-300 rounded-lg flex items-center justify-center transition-all cursor-pointer"
              title="向右平移"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </button>
            <div />
            <button
              onClick={() => handlePan('down')}
              className="p-1 glass-button text-slate-200 hover:text-cyan-300 rounded-lg flex items-center justify-center transition-all cursor-pointer"
              title="向下平移"
            >
              <ChevronDown className="w-3.5 h-3.5" />
            </button>
            <div />
          </div>
        </div>
      </div>

      {/* Bottom Right Clearance Summary */}
      <div className="absolute bottom-4 right-3 glass-panel text-slate-100 p-3 text-xs shadow-2xl rounded-2xl">
        <div className="font-bold text-[11px] uppercase text-cyan-300">
          风偏角 φ_ins: <span className="text-sky-400 font-mono">{(swingAngleDeg ?? 0).toFixed(1)}°</span>
        </div>
        <div className="text-[10px] opacity-90 mt-0.5 font-mono">
          剩余空气间隙: <strong className="text-emerald-400">{(actualClearance ?? 0).toFixed(2)} m</strong> (限值 {(minClearanceReq ?? 0).toFixed(2)}m)
        </div>
      </div>
    </div>
  );
};
