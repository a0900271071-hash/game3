import React, { useState, useEffect, useRef, useCallback } from 'react';
import * as THREE from 'three';
import { Zap } from 'lucide-react';
import {
  Faction,
  MapType,
  HealthState,
  PlayerState,
  GeneratorState,
  ExitGateState,
  CageState,
  GameStats,
  CharacterInfo,
  KILLERS,
  SURVIVORS,
  LoudNoisePing,
  ScratchMark,
  BloodTrail,
} from './types';
import { TitleScreen } from './components/TitleScreen';
import { MainMenu } from './components/MainMenu';
import { HUD } from './components/HUD';
import { GameOverModal } from './components/GameOverModal';
import { buildXimendingMap, MapData } from './maps/ximending';
import { buildCathedralMap } from './maps/cathedral';
import { createCharacter3DMesh } from './game/createCharacterMesh';
import { sound } from './audio';
import { spawnIceAttackProjectile, updateIceProjectilesAndCheckHits, ActiveIceProjectile } from './game/iceProjectile';
import { castGourmetRageSkill, processGourmetHitOnSurvivor } from './game/gourmetCharacter';
import { castTariqBetrayalSkill, checkTariqSkillCondition } from './game/tariqCharacter';
import { castKentoSurgeSkill, checkKentoSkillCondition } from './game/kentoCharacter';
import { castJackSkill, checkJackSkillCondition } from './game/jackCharacter';
import { castErikSkill, checkErikSkillCondition } from './game/erikCharacter';
import {
  evaluateSurvivorRoles,
  updateSurvivorAI,
  updateKillerAI,
  AIGameContext,
} from './game/aiSystem';
import { IMAGE_ASSETS } from './game/imageAssets';
import { loadThreeTextureWithRetry, preloadAllGameImages } from './game/assetLoader';

// Generator & Gate 2D Sprite Textures loaded via central Asset Loader with retry & fallback
const unfixTexture = loadThreeTextureWithRetry(IMAGE_ASSETS.Objects.generatorUnfix);
const hasfixTexture = loadThreeTextureWithRetry(IMAGE_ASSETS.Objects.generatorHasfix);
const noopenTexture = loadThreeTextureWithRetry(IMAGE_ASSETS.Objects.gateNoopen);
const openTexture = loadThreeTextureWithRetry(IMAGE_ASSETS.Objects.gateOpen);

// 輔助函式：取得可用且未被佔用的監牢 (優先選擇離殺手最遠的未佔用監牢，嚴格執行 1 間監牢僅關 1 位逃生者)
function getAvailableCage(
  killerPos: { x: number; z: number },
  allPlayers: PlayerState[],
  cageList: { id: number; x: number; z: number; occupiedPlayerId?: string | null }[]
): { id: number; x: number; z: number } {
  const currentlyCaged = allPlayers.filter(p => p.faction === 'survivor' && p.health === 'caged');
  const unoccupied = cageList.filter(cage => {
    const isOccupiedByPlayerId = !!(cage.occupiedPlayerId && currentlyCaged.some(s => s.id === cage.occupiedPlayerId));
    const isOccupiedByAssignment = currentlyCaged.some(s => s.assignedCageId === cage.id);
    const isOccupiedByDistance = currentlyCaged.some(s => Math.hypot(s.x - cage.x, s.z - cage.z) < 4.0);
    return !isOccupiedByPlayerId && !isOccupiedByAssignment && !isOccupiedByDistance;
  });

  if (unoccupied.length > 0) {
    let best = unoccupied[0];
    let maxD = -1;
    unoccupied.forEach(c => {
      const d = Math.hypot(c.x - killerPos.x, c.z - killerPos.z);
      if (d > maxD) {
        maxD = d;
        best = c;
      }
    });
    return best;
  }
  

  let fallback = cageList[0] || { id: 0, x: 0, z: 0, occupiedPlayerId: null };
  let maxD = -1;
  cageList.forEach(c => {
    const d = Math.hypot(c.x - killerPos.x, c.z - killerPos.z);
    if (d > maxD) {
      maxD = d;
      fallback = c;
    }
  });
  return fallback;
}

export default function App() {
  const [gamePhase, setGamePhase] = useState<'title' | 'menu' | 'playing' | 'gameover'>('title');
  const [userFaction, setUserFaction] = useState<Faction>('survivor');
  const [userCharId, setUserCharId] = useState<string>('kento');
  const [selectedMap, setSelectedMap] = useState<'random' | MapType>('random');
  const [activeMap, setActiveMap] = useState<MapType>('ximending');

  // Preload all permanent game image assets on app startup
  useEffect(() => {
    preloadAllGameImages();
  }, []);

  // Match states
  const [humanPlayerId, setHumanPlayerId] = useState<string>('survivor_1');
  const [players, setPlayers] = useState<PlayerState[]>([]);
  const [generators, setGenerators] = useState<GeneratorState[]>([]);
  const [exitGates, setExitGates] = useState<ExitGateState[]>([]);
  const [cages, setCages] = useState<CageState[]>([]);
  const [matchTime, setMatchTime] = useState<number>(0);
  const [killerBreakCharges, setKillerBreakCharges] = useState<number>(0);
  const [noisePings, setNoisePings] = useState<LoudNoisePing[]>([]);
  const [actionPrompt, setActionPrompt] = useState<string | null>(null);
  const [escapeNotifications, setEscapeNotifications] = useState<{ id: string; text: string; expiresAt: number }[]>([]);
  const [gameStats, setGameStats] = useState<GameStats | null>(null);
  const [floatingGens, setFloatingGens] = useState<{
    id: number;
    screenX: number;
    screenY: number;
    progress: number;
    isCompleted: boolean;
    isTargetGen: boolean;
    repairingCount: number;
    distance: number;
  }[]>([]);

  // References
  const canvasContainerRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const mapDataRef = useRef<MapData | null>(null);
  const playerMeshesRef = useRef<Record<string, THREE.Group>>({});
  const generatorMeshesRef = useRef<Record<number, THREE.Group>>({});
  const gateMeshesRef = useRef<Record<number, THREE.Group>>({});
  const cageMeshesRef = useRef<Record<number, THREE.Group>>({});
  const scratchMarksRef = useRef<ScratchMark[]>([]);
  const bloodTrailsRef = useRef<BloodTrail[]>([]);
  const trailMeshesGroupRef = useRef<THREE.Group | null>(null);
  const pingBeaconsGroupRef = useRef<THREE.Group | null>(null);
  const iceProjectilesRef = useRef<ActiveIceProjectile[]>([]);
  const prevPlayerPosRef = useRef<Record<string, { x: number; z: number }>>({});
  const generatorsRef = useRef<GeneratorState[]>([]);
  generatorsRef.current = generators;
  const exitGatesRef = useRef<ExitGateState[]>([]);
  exitGatesRef.current = exitGates;
  const cagesRef = useRef<CageState[]>([]);
  cagesRef.current = cages;
  const killerBreakChargesRef = useRef<number>(0);
  killerBreakChargesRef.current = killerBreakCharges;
  const matchTimeRef = useRef<number>(0);
  matchTimeRef.current = matchTime;
  const endgameStallTimerRef = useRef<number>(0);

  // Inputs & Camera
  const keysPressed = useRef<Record<string, boolean>>({});
  const cameraYaw = useRef<number>(0);
  const cameraPitch = useRef<number>(0.28);
  const cameraDistance = useRef<number>(7.5);
  const isMouseDown = useRef<boolean>(false);
  const lastMousePos = useRef<{ x: number; y: number }>({ x: 0, y: 0 });

  const getRandomSafeSpawns = (mapType: MapType) => {
    const ximendingPool = [
      { x: 0, z: -35 }, { x: 0, z: 35 }, { x: 0, z: 0 }, { x: -28, z: 38 },
      { x: 28, z: 38 }, { x: -28, z: -38 }, { x: 28, z: -38 }, { x: -28, z: 0 },
      { x: 28, z: 0 }, { x: -19, z: -27 }, { x: 19, z: -27 }, { x: -19, z: 30 },
      { x: 19, z: 30 }, { x: 0, z: -48 }, { x: 0, z: 48 }, { x: -6, z: 20 },
      { x: 6, z: -20 }, { x: -6, z: -10 }, { x: 6, z: 10 },
    ];
    const cathedralPool = [
      { x: 0, z: -35 }, { x: 0, z: 35 }, { x: -25, z: 0 }, { x: 25, z: 0 },
      { x: -22, z: -30 }, { x: 22, z: -30 }, { x: -22, z: 30 }, { x: 22, z: 30 },
      { x: 0, z: -15 }, { x: 0, z: 45 }, { x: -25, z: -18 }, { x: 25, z: -18 },
      { x: -20, z: 15 }, { x: 20, z: 15 }, { x: 0, z: 20 }, { x: 0, z: -45 },
    ];

    const pool = [...(mapType === 'cathedral' ? cathedralPool : ximendingPool)];
    for (let i = pool.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [pool[i], pool[j]] = [pool[j], pool[i]];
    }

    const killerBase = pool.pop() || { x: 0, z: -20 };
    const killerSpawn = {
      x: killerBase.x + (Math.random() - 0.5) * 1.5,
      z: killerBase.z + (Math.random() - 0.5) * 1.5,
    };

    const farCandidates = pool.filter(pt => Math.hypot(pt.x - killerSpawn.x, pt.z - killerSpawn.z) >= 18);
    const survivorSpawns: { x: number; z: number }[] = [];

    for (let i = 0; i < 4; i++) {
      const candidate = farCandidates.pop() || pool.pop() || { x: (i % 2 === 0 ? -1 : 1) * 20, z: 25 };
      survivorSpawns.push({
        x: candidate.x + (Math.random() - 0.5) * 1.2,
        z: candidate.z + (Math.random() - 0.5) * 1.2,
      });
    }

    return { killerSpawn, survivorSpawns };
  };

  const characterMap: Record<string, CharacterInfo> = {};
  [...KILLERS, ...SURVIVORS].forEach(c => { characterMap[c.id] = c; });

  const handleStartGame = (config: {
    userFaction: Faction;
    userCharacterId: string;
    mapType: MapType;
    mapSelection?: 'random' | MapType;
  }) => {
    const effectiveSelection = config.mapSelection || selectedMap || 'random';
    const rolledMap: MapType =
      effectiveSelection === 'random'
        ? (Math.random() < 0.5 ? 'ximending' : 'cathedral')
        : config.mapType;

    setUserFaction(config.userFaction);
    setUserCharId(config.userCharacterId);
    setSelectedMap(effectiveSelection);
    setActiveMap(rolledMap);

    sound.init();

    let killerCharId = 'elena';
    let survivorCharIds = ['kento', 'jack', 'erik', 'tariq'];

    if (config.userFaction === 'survivor') {
      survivorCharIds = [
        config.userCharacterId,
        ...survivorCharIds.filter(id => id !== config.userCharacterId),
      ];
      killerCharId = Math.random() < 0.5 ? 'elena' : 'gourmet';
    } else {
      killerCharId = config.userCharacterId;
      if (killerCharId !== 'elena' && killerCharId !== 'gourmet') {
        killerCharId = 'elena';
      }
    }

    const { killerSpawn, survivorSpawns } = getRandomSafeSpawns(rolledMap);
    const initPlayers: PlayerState[] = [];
    const isHumanKiller = config.userFaction === 'killer';

    initPlayers.push({
      id: 'killer_1',
      characterId: killerCharId,
      name: characterMap[killerCharId]?.name || 'Killer',
      faction: 'killer',
      isHuman: isHumanKiller,
      x: killerSpawn.x,
      y: 0,
      z: killerSpawn.z,
      rotationY: 0,
      health: 'healthy',
      speed: 6.2,
      isSprinting: false,
      skillCooldown: 0,
      skillActiveTime: 0,
      cageTimer: 0,
      cageRemainingBefore: 90,
      cageCount: 0,
      hitBoostTime: 0,
      frostbiteTime: 0,
      elenaBuffTime: 0,
      deepInjury: false,
      berserkTime: 0,
      tariqStealthTime: 0,
      tariqSpeedBoostTime: 0,
      betrayedTeammateId: null,
      betrayedTeammateTime: 0,
      jackBuffTime: 0,
      jackRescuedWindow: 0,
      wasRescuedFromCage: false,
      vikingBuffTime: 0,
      erikSkillAvailable: true,
      satoBuffTime: 0,
      kentoFearScreamTime: 0,
    });

    if (isHumanKiller) setHumanPlayerId('killer_1');

    survivorCharIds.slice(0, 4).forEach((cId, idx) => {
      const isHumanSurv = config.userFaction === 'survivor' && idx === 0;
      const sId = `survivor_${idx + 1}`;
      const spawn = survivorSpawns[idx] || { x: 0, z: 20 };

      initPlayers.push({
        id: sId,
        characterId: cId,
        name: characterMap[cId]?.name || `Survivor ${idx + 1}`,
        faction: 'survivor',
        isHuman: isHumanSurv,
        x: spawn.x,
        y: 0,
        z: spawn.z,
        rotationY: Math.PI,
        health: 'healthy',
        speed: 5.0,
        isSprinting: false,
        skillCooldown: 0,
        skillActiveTime: 0,
        cageTimer: 90,
        cageRemainingBefore: 90,
        cageCount: 0,
        hitBoostTime: 0,
        frostbiteTime: 0,
        elenaBuffTime: 0,
        deepInjury: false,
        berserkTime: 0,
        tariqStealthTime: 0,
        tariqSpeedBoostTime: 0,
        betrayedTeammateId: null,
        betrayedTeammateTime: 0,
        jackBuffTime: 0,
        jackRescuedWindow: 0,
        wasRescuedFromCage: false,
        vikingBuffTime: 0,
        erikSkillAvailable: true,
        satoBuffTime: 0,
        kentoFearScreamTime: 0,
        nextFearScreamTimer: 30 + Math.random() * 30, // 30~60秒隨機恐懼尖叫
        fearScreamRevealedToKiller: false,
        fearScreamRevealTimer: 0,
        cagingProgress: 0,
        isBeingCaged: false,
      });

      if (isHumanSurv) setHumanPlayerId(sId);
    });

    setPlayers(initPlayers);
    setMatchTime(0);
    setKillerBreakCharges(0);
    setNoisePings([]);
    setActionPrompt(null);
    setGameStats(null);
    scratchMarksRef.current = [];
    bloodTrailsRef.current = [];
    prevPlayerPosRef.current = {};

    setGamePhase('playing');
  };

  // Three.js Scene Setup
  useEffect(() => {
    if (gamePhase !== 'playing' || !canvasContainerRef.current) return;

    const container = canvasContainerRef.current;
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x0f172a);
    scene.fog = new THREE.FogExp2(0x0f172a, 0.008);
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(55, container.clientWidth / container.clientHeight, 0.1, 500);
    cameraRef.current = camera;

    const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    renderer.setSize(container.clientWidth, container.clientHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    rendererRef.current = renderer;

    container.appendChild(renderer.domElement);

    const trailsGroup = new THREE.Group();
    scene.add(trailsGroup);
    trailMeshesGroupRef.current = trailsGroup;

    const pingsGroup = new THREE.Group();
    scene.add(pingsGroup);
    pingBeaconsGroupRef.current = pingsGroup;

    const mapData = activeMap === 'cathedral' ? buildCathedralMap(scene) : buildXimendingMap(scene);
    mapDataRef.current = mapData;

    // Generators Setup (隨機出現 10 個電箱，其中 5 個為需要修理的目標電箱)
    const genPositions = mapData.genPositions.slice(0, 10);
    const shuffledIndices = Array.from({ length: genPositions.length }, (_, i) => i);
    for (let i = shuffledIndices.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffledIndices[i], shuffledIndices[j]] = [shuffledIndices[j], shuffledIndices[i]];
    }
    const targetSet = new Set(shuffledIndices.slice(0, 5));

    const initGens: GeneratorState[] = genPositions.map((pos, idx) => {
      const isTarget = targetSet.has(idx);
      const genGroup = new THREE.Group();
      genGroup.position.set(pos.x, 0, pos.z);

      // 工業金屬與混凝土實體底座 (嚴禁穿模實體感)
      const baseGeo = new THREE.CylinderGeometry(1.2, 1.35, 0.25, 16);
      const baseMat = new THREE.MeshStandardMaterial({
        color: isTarget ? 0x1e293b : 0x0f172a,
        roughness: 0.8,
        metalness: 0.3,
      });
      const baseMesh = new THREE.Mesh(baseGeo, baseMat);
      baseMesh.position.y = 0.125;
      baseMesh.receiveShadow = true;
      genGroup.add(baseMesh);

      // 2D 電箱立牌 (0%~99% 使用 unfix.png, 100% 使用 hasfix.png)
      const planeGeo = new THREE.PlaneGeometry(3.6, 2.0);
      const planeMat = new THREE.MeshBasicMaterial({
        map: unfixTexture,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const spriteVisual = new THREE.Mesh(planeGeo, planeMat);
      spriteVisual.name = 'SpriteVisual';
      spriteVisual.position.set(0, 1.15, 0);
      spriteVisual.renderOrder = 5;
      genGroup.add(spriteVisual);

      // 目標電箱頂部微光指示天線
      if (isTarget) {
        const beaconGeo = new THREE.SphereGeometry(0.18, 8, 8);
        const beaconMat = new THREE.MeshBasicMaterial({ color: 0xf59e0b });
        const beaconMesh = new THREE.Mesh(beaconGeo, beaconMat);
        beaconMesh.position.set(0, 2.4, 0);
        beaconMesh.name = 'BeaconMesh';
        genGroup.add(beaconMesh);
      }

      genGroup.userData = { sprite: spriteVisual, spriteVisual, isTarget, id: idx };

      scene.add(genGroup);
      generatorMeshesRef.current[idx] = genGroup;

      return {
        id: idx,
        x: pos.x,
        z: pos.z,
        isTargetGen: isTarget,
        progress: 0,
        isCompleted: false,
        repairingCount: 0,
      };
    });
    setGenerators(initGens);

    // Gates Setup (1 Gate, 2D 貼牆立繪看板)
    const initGates: ExitGateState[] = mapData.gatePositions.slice(0, 1).map((pos, idx) => {
      const gateGroup = new THREE.Group();
      gateGroup.position.set(pos.x, 0, pos.z);
      gateGroup.rotation.y = (pos as any).rotationY || 0;

      // 2D 大門立繪 (0%~99% 使用 noopen.png, 100% 使用 open.png)
      const gatePlaneGeo = new THREE.PlaneGeometry(8.0, 8.0);
      const gateMat = new THREE.MeshBasicMaterial({
        map: noopenTexture,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false,
      });
      const gateSprite = new THREE.Mesh(gatePlaneGeo, gateMat);
      gateSprite.name = 'GateSpriteVisual';
      gateSprite.position.set(0, 4.0, 0);
      gateGroup.add(gateSprite);
      gateGroup.userData = { spriteVisual: gateSprite };

      scene.add(gateGroup);
      gateMeshesRef.current[idx] = gateGroup;

      return { id: idx, x: pos.x, z: pos.z, progress: 0, isOpen: false };
    });
    setExitGates(initGates);

    // Cages Setup (3D 實體重裝鐵牢籠，具備立體鋼鐵柵欄、厚重金屬底座與頂框、血紅符文指示燈)
    const initCages: CageState[] = mapData.cagePositions.map((pos, idx) => {
      const cageGroup = new THREE.Group();
      cageGroup.position.set(pos.x, 0, pos.z);

      const frameMat = new THREE.MeshStandardMaterial({
        color: 0x1e293b,
        metalness: 0.85,
        roughness: 0.35,
      });
      const barMat = new THREE.MeshStandardMaterial({
        color: 0x334155,
        metalness: 0.9,
        roughness: 0.25,
      });
      const floorMat = new THREE.MeshStandardMaterial({
        color: 0x0f172a,
        metalness: 0.5,
        roughness: 0.8,
      });
      const runeMat = new THREE.MeshStandardMaterial({
        color: 0xef4444,
        emissive: 0xdc2626,
        emissiveIntensity: 0.85,
      });

      // 1. 厚實金屬底座 (y: 0 ~ 0.15)
      const baseMesh = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.15, 3.6), floorMat);
      baseMesh.position.y = 0.075;
      baseMesh.receiveShadow = true;
      cageGroup.add(baseMesh);

      // 2. 牢籠頂部厚重鐵框 (y: 3.85 ~ 4.0)
      const roofMesh = new THREE.Mesh(new THREE.BoxGeometry(3.6, 0.15, 3.6), frameMat);
      roofMesh.position.y = 3.925;
      cageGroup.add(roofMesh);

      // 3. 四角主要支撐粗方柱
      const columnGeo = new THREE.BoxGeometry(0.24, 3.8, 0.24);
      const corners = [
        { x: -1.6, z: -1.6 },
        { x: 1.6, z: -1.6 },
        { x: -1.6, z: 1.6 },
        { x: 1.6, z: 1.6 },
      ];
      corners.forEach(c => {
        const col = new THREE.Mesh(columnGeo, frameMat);
        col.position.set(c.x, 2.0, c.z);
        col.castShadow = true;
        cageGroup.add(col);
      });

      // 4. 四面圓柱形鐵柵欄 (清晰可見牢籠內部與受困者)
      const barGeo = new THREE.CylinderGeometry(0.045, 0.045, 3.75, 8);
      // 北面與南面
      for (let i = -1.2; i <= 1.2; i += 0.6) {
        const barN = new THREE.Mesh(barGeo, barMat);
        barN.position.set(i, 2.0, -1.6);
        cageGroup.add(barN);

        const barS = new THREE.Mesh(barGeo, barMat);
        barS.position.set(i, 2.0, 1.6);
        cageGroup.add(barS);
      }
      // 西面與東面
      for (let i = -1.2; i <= 1.2; i += 0.6) {
        const barW = new THREE.Mesh(barGeo, barMat);
        barW.position.set(-1.6, 2.0, i);
        cageGroup.add(barW);

        const barE = new THREE.Mesh(barGeo, barMat);
        barE.position.set(1.6, 2.0, i);
        cageGroup.add(barE);
      }

      // 5. 中間橫向鋼鐵加固橫樑 (y = 1.95)
      const midRimGeoX = new THREE.BoxGeometry(3.4, 0.1, 0.1);
      const midRimGeoZ = new THREE.BoxGeometry(0.1, 0.1, 3.4);
      
      const midRimN = new THREE.Mesh(midRimGeoX, frameMat);
      midRimN.position.set(0, 1.95, -1.6);
      cageGroup.add(midRimN);
      const midRimS = new THREE.Mesh(midRimGeoX, frameMat);
      midRimS.position.set(0, 1.95, 1.6);
      cageGroup.add(midRimS);

      const midRimW = new THREE.Mesh(midRimGeoZ, frameMat);
      midRimW.position.set(-1.6, 1.95, 0);
      cageGroup.add(midRimW);
      const midRimE = new THREE.Mesh(midRimGeoZ, frameMat);
      midRimE.position.set(1.6, 1.95, 0);
      cageGroup.add(midRimE);

      // 6. 牢籠頂部血色符文信標與微弱環境光
      const runeGem = new THREE.Mesh(new THREE.OctahedronGeometry(0.32), runeMat);
      runeGem.position.set(0, 4.25, 0);
      cageGroup.add(runeGem);

      const cageLight = new THREE.PointLight(0xef4444, 2.0, 8.0);
      cageLight.position.set(0, 3.2, 0);
      cageGroup.add(cageLight);

      scene.add(cageGroup);
      cageMeshesRef.current[idx] = cageGroup;

      return { id: idx, x: pos.x, z: pos.z, occupiedPlayerId: null };
    });
    setCages(initCages);

    // Player Meshes
    players.forEach(p => {
      const pMesh = createCharacter3DMesh(p.characterId);
      pMesh.position.set(p.x, 0, p.z);
      scene.add(pMesh);
      playerMeshesRef.current[p.id] = pMesh;
    });

    // Listeners
    const handleKeyDown = (e: KeyboardEvent) => {
      keysPressed.current[e.code] = true;
      if (e.key) {
        keysPressed.current[e.key.toLowerCase()] = true;
        keysPressed.current[e.key] = true;
      }
      if (e.code === 'Space' || e.key === ' ' || e.key === 'Spacebar') {
        keysPressed.current['Space'] = true;
        keysPressed.current['space'] = true;
        keysPressed.current[' '] = true;
        keysPressed.current['primaryAction'] = true;
        e.preventDefault();
        triggerPrimaryAction(humanPlayerId);
      }
      if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) {
        e.preventDefault();
      }
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight') {
        e.preventDefault();
        triggerSkill(humanPlayerId);
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      keysPressed.current[e.code] = false;
      if (e.key) {
        keysPressed.current[e.key.toLowerCase()] = false;
        keysPressed.current[e.key] = false;
      }
      if (e.code === 'Space' || e.key === ' ' || e.key === 'Spacebar') {
        keysPressed.current['Space'] = false;
        keysPressed.current['space'] = false;
        keysPressed.current[' '] = false;
        keysPressed.current['primaryAction'] = false;
      }
    };

    const handleBlur = () => {
      keysPressed.current = {};
    };

    const handleMouseDown = (e: MouseEvent) => {
      isMouseDown.current = true;
      lastMousePos.current = { x: e.clientX, y: e.clientY };
    };

    const handleMouseUp = () => { isMouseDown.current = false; };

    const handleMouseMove = (e: MouseEvent) => {
      if (!isMouseDown.current) return;
      const dx = e.clientX - lastMousePos.current.x;
      const dy = e.clientY - lastMousePos.current.y;
      lastMousePos.current = { x: e.clientX, y: e.clientY };

      cameraYaw.current -= dx * 0.0055;
      cameraPitch.current = Math.max(0.08, Math.min(1.15, cameraPitch.current + dy * 0.0045));
    };

    const handleWheel = (e: WheelEvent) => {
      cameraDistance.current = Math.max(4.5, Math.min(18, cameraDistance.current + e.deltaY * 0.01));
    };

    window.addEventListener('keydown', handleKeyDown);
    window.addEventListener('keyup', handleKeyUp);
    window.addEventListener('blur', handleBlur);
    const domEl = renderer.domElement;
    domEl.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mouseup', handleMouseUp);
    window.addEventListener('mousemove', handleMouseMove);
    domEl.addEventListener('wheel', handleWheel);

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('keyup', handleKeyUp);
      window.removeEventListener('blur', handleBlur);
      domEl.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mouseup', handleMouseUp);
      window.removeEventListener('mousemove', handleMouseMove);
      domEl.removeEventListener('wheel', handleWheel);
      if (container.contains(renderer.domElement)) container.removeChild(renderer.domElement);
      renderer.dispose();
    };
  }, [gamePhase, activeMap]);

  // Primary Space Action Trigger (Killer: Attack / Cage / Break Gen, Survivor: Repair / Rescue)
  const triggerPrimaryAction = useCallback((pId: string) => {
    setPlayers(prevPlayers => {
      const actor = prevPlayers.find(p => p.id === pId);
      if (!actor || actor.health === 'caged' || actor.health === 'dead' || actor.health === 'downed') return prevPlayers;

      if (actor.faction === 'killer') {
        if ((actor.attackCooldown || 0) > 0) return prevPlayers;

        const nx = actor.x;
        const nz = actor.z;

        // 1. 檢查範圍內的逃生者 (3.2m 判定範圍)
        const targetSurv = prevPlayers.find(
          s => s.faction === 'survivor' &&
               (s.health === 'healthy' || s.health === 'injured') &&
               (!s.hitBoostTime || s.hitBoostTime <= 0) &&
               Math.hypot(s.x - nx, s.z - nz) <= 3.2
        );

        // 2. 檢查範圍內瀕死倒地的逃生者 (3.2m 判定範圍)
        const downedSurv = prevPlayers.find(
          s => s.faction === 'survivor' &&
               s.health === 'downed' &&
               Math.hypot(s.x - nx, s.z - nz) <= 3.2
        );

        // 3. 檢查範圍內有修理進度的發電機 (3.2m 判定範圍)
        const targetGen = generators.find(
          g => !g.isCompleted && g.progress > 0 && Math.hypot(g.x - nx, g.z - nz) <= 3.2
        );

        if (targetSurv) {
          // 1. 觸發普通攻擊
          sound.playHitSound();
          sound.playScreamSound();
          let newH: HealthState;
          let deepInjury = targetSurv.deepInjury || false;

          if (actor.characterId === 'gourmet') {
            const hitResult = processGourmetHitOnSurvivor(actor, targetSurv);
            newH = hitResult.nextHealth;
            deepInjury = hitResult.deepInjury;
            setActionPrompt(hitResult.message);
          } else {
            const prevH = targetSurv.health;
            newH = prevH === 'healthy' ? 'injured' : 'downed';
            setActionPrompt(
              newH === 'downed'
                ? `⚔️ 重擊命中！${targetSurv.name} 瀕死倒地！`
                : `⚔️ 揮擊命中！${targetSurv.name} 受到傷害！`
            );
          }

          return prevPlayers.map(p => {
            if (p.id === actor.id) {
              return { ...p, attackCooldown: 1.5 };
            }
            if (p.id === targetSurv.id) {
              return {
                ...p,
                health: newH,
                deepInjury,
                hitBoostTime: newH === 'injured' ? 2.0 : 0,
                healProgress: 0,
                cagingProgress: 0,
              };
            }
            return p;
          });
        } else if (downedSurv) {
          // 2. 提示需按住 Space 5 秒以押送至監牢 (由每幀迴圈進行 5 秒引導)
          setActionPrompt(`⛓️ 請持續按住 [空白鍵 Space] 5 秒以將 ${downedSurv.name} 押送至監牢！`);
          return prevPlayers;
        } else if (targetGen) {
          // 3. 執行破壞電箱動作 (扣除當前進度的 10%，不可連續破壞，消耗 1 次機會)
          if (killerBreakCharges <= 0) {
            setActionPrompt('⚠️ 無破壞電箱機會：需將逃生者傳送至監牢後，方可獲得一次破壞電箱機會！');
            return prevPlayers;
          }

          sound.playSkillSound();
          const deduction = targetGen.progress * 0.10;
          const newProg = Math.max(0, targetGen.progress - deduction);
          setGenerators(prevGens =>
            prevGens.map(g => (g.id === targetGen.id ? { ...g, progress: newProg } : g))
          );
          setKillerBreakCharges(c => Math.max(0, c - 1));
          setActionPrompt(`🔨 成功破壞電箱！扣除當前進度 10% (剩餘: ${Math.floor(newProg)}%)`);
          return prevPlayers.map(p => (p.id === actor.id ? { ...p, attackCooldown: 1.8 } : p));
        }
      }
      return prevPlayers;
    });
  }, [cages, generators, killerBreakCharges]);

  // Skill Trigger
  const triggerSkill = useCallback((pId: string) => {
    setPlayers(prev => {
      const caster = prev.find(p => p.id === pId);
      if (!caster || caster.skillCooldown > 0 || caster.health === 'caged' || caster.health === 'dead' || caster.health === 'downed') return prev;

      if (caster.characterId === 'elena') {
        if (sceneRef.current) {
          const proj = spawnIceAttackProjectile(
            sceneRef.current,
            caster.id,
            caster.x,
            caster.y || 0,
            caster.z,
            caster.rotationY,
            26,
            35
          );
          iceProjectilesRef.current.push(proj);
        }
        sound.playSkillSound();
        setActionPrompt('❄️【凍原祭司】艾琳娜 施放技能！擲出【冰封詛咒】特殊攻擊判定物件！');
        return prev.map(p => p.id === pId ? { ...p, skillCooldown: 12, skillActiveTime: 10 } : p);
      } else if (caster.characterId === 'gourmet') {
        const res = castGourmetRageSkill(caster, prev);
        setActionPrompt(res.result.message);
        return res.updatedPlayers;
      } else if (caster.characterId === 'tariq') {
        const res = castTariqBetrayalSkill(caster, prev);
        setActionPrompt(res.message);
        return res.updatedPlayers;
      } else if (caster.characterId === 'kento') {
        const res = castKentoSurgeSkill(caster, prev, caster.kentoFearScreamTime || 0);
        setActionPrompt(res.message);
        return res.updatedPlayers;
      } else if (caster.characterId === 'jack') {
        const res = castJackSkill(caster, prev);
        setActionPrompt(res.message);
        return res.updatedPlayers;
      } else if (caster.characterId === 'erik') {
        const res = castErikSkill(caster, prev);
        setActionPrompt(res.message);
        return res.updatedPlayers;
      }

      sound.playSkillSound();
      return prev.map(p => p.id === pId ? { ...p, skillCooldown: 15, skillActiveTime: 10 } : p);
    });
  }, []);

  // Precise Collision with Wall Sliding & Solid Generator Obstacles (Radius = 0.75m, Generator obstacle = 1.35m)
  const checkCollision = (testX: number, testZ: number, radius = 0.75): boolean => {
    if (!mapDataRef.current) return false;
    // 1. Check wall colliders
    for (const c of (mapDataRef.current.colliders || [])) {
      if (
        testX + radius > c.minX &&
        testX - radius < c.maxX &&
        testZ + radius > c.minZ &&
        testZ - radius < c.maxZ
      ) {
        return true;
      }
    }
    // 2. Check 10 Generator Solid Collision (半徑 1.35m 實體障礙物，防止穿模)
    const genPositions = mapDataRef.current.genPositions || [];
    for (let i = 0; i < Math.min(10, genPositions.length); i++) {
      const g = genPositions[i];
      const distSq = (testX - g.x) * (testX - g.x) + (testZ - g.z) * (testZ - g.z);
      const minDistance = radius + 1.35;
      if (distSq < minDistance * minDistance) {
        return true;
      }
    }

    const maxBound = 60;
    if (Math.abs(testX) > maxBound || Math.abs(testZ) > maxBound) {
      return true;
    }
    return false;
  };

  const moveWithCollision = (currX: number, currZ: number, targetX: number, targetZ: number, radius = 0.75) => {
    let finalX = currX;
    let finalZ = currZ;

    // Safety unstick from colliders
    if (mapDataRef.current && mapDataRef.current.colliders) {
      for (const c of mapDataRef.current.colliders) {
        if (
          currX + radius > c.minX &&
          currX - radius < c.maxX &&
          currZ + radius > c.minZ &&
          currZ - radius < c.maxZ
        ) {
          const distLeft = Math.abs(currX - (c.minX - radius - 0.2));
          const distRight = Math.abs(currX - (c.maxX + radius + 0.2));
          const distTop = Math.abs(currZ - (c.minZ - radius - 0.2));
          const distBottom = Math.abs(currZ - (c.maxZ + radius + 0.2));
          const minDist = Math.min(distLeft, distRight, distTop, distBottom);
          if (minDist === distLeft) finalX = c.minX - radius - 0.2;
          else if (minDist === distRight) finalX = c.maxX + radius + 0.2;
          else if (minDist === distTop) finalZ = c.minZ - radius - 0.2;
          else finalZ = c.maxZ + radius + 0.2;
          return { x: finalX, z: finalZ };
        }
      }
    }

    // Generator safety unstick
    if (mapDataRef.current && mapDataRef.current.genPositions) {
      for (let i = 0; i < Math.min(10, mapDataRef.current.genPositions.length); i++) {
        const pos = mapDataRef.current.genPositions[i];
        const dist = Math.hypot(currX - pos.x, currZ - pos.z);
        const minSafeDist = radius + 1.35;
        if (dist < minSafeDist && dist > 0.001) {
          finalX = pos.x + ((currX - pos.x) / dist) * (minSafeDist + 0.15);
          finalZ = pos.z + ((currZ - pos.z) / dist) * (minSafeDist + 0.15);
          return { x: finalX, z: finalZ };
        }
      }
    }

    // Independent X movement test
    if (!checkCollision(targetX, currZ, radius)) {
      finalX = targetX;
    }
    // Independent Z movement test
    if (!checkCollision(finalX, targetZ, radius)) {
      finalZ = targetZ;
    }

    // Post-movement Generator solid push-out
    if (mapDataRef.current && mapDataRef.current.genPositions) {
      for (let i = 0; i < Math.min(10, mapDataRef.current.genPositions.length); i++) {
        const pos = mapDataRef.current.genPositions[i];
        const dist = Math.hypot(finalX - pos.x, finalZ - pos.z);
        const minSafeDist = radius + 1.35;
        if (dist < minSafeDist) {
          if (dist > 0.0001) {
            finalX = pos.x + ((finalX - pos.x) / dist) * minSafeDist;
            finalZ = pos.z + ((finalZ - pos.z) / dist) * minSafeDist;
          } else {
            finalX = pos.x + minSafeDist;
          }
        }
      }
    }

    return { x: finalX, z: finalZ };
  };

  // Frame Rendering Loop (讓 2D 電箱與角色立繪面向攝影機 Billboard Effect)
  useEffect(() => {
    if (gamePhase !== 'playing') return;

    let animId: number;
    const renderLoop = () => {
      animId = requestAnimationFrame(renderLoop);

      if (cameraRef.current && sceneRef.current && rendererRef.current) {
        // 更新所有電箱 2D 立繪朝向攝影機 (Upright Billboard)
        Object.values(generatorMeshesRef.current).forEach((group: any) => {
          const sprite = group?.userData?.spriteVisual as THREE.Mesh;
          if (sprite && cameraRef.current) {
            const worldPos = new THREE.Vector3();
            sprite.getWorldPosition(worldPos);
            const dx = cameraRef.current.position.x - worldPos.x;
            const dz = cameraRef.current.position.z - worldPos.z;
            const angle = Math.atan2(dx, dz);
            sprite.rotation.set(0, angle - (group.rotation?.y || 0), 0);
          }
        });

        // 更新 3D 玩家網格位置、旋轉與 Billboard 動作
        players.forEach(p => {
          const pMesh = playerMeshesRef.current[p.id];
          if (pMesh) {
            pMesh.visible = p.health !== 'escaped';
            let targetX = p.x;
            let targetY = p.y || 0;
            let targetZ = p.z;

            // 確保被關入監牢的逃生者 100% 準確鎖定在監牢中心，絕不出現在牢籠外
            if (p.health === 'caged') {
              const assignedCage = cages.find(c => c.id === p.assignedCageId) || cages.find(c => c.occupiedPlayerId === p.id);
              if (assignedCage) {
                targetX = assignedCage.x;
                targetZ = assignedCage.z;
              }
            }

            pMesh.position.set(targetX, targetY, targetZ);
            pMesh.rotation.y = p.rotationY;

            // 當逃生者處於倒地、監牢中或死亡狀態時，強制切換至 ko.png 立繪
            if (p.faction === 'survivor' && (p.health === 'downed' || p.health === 'caged' || p.health === 'dead')) {
              if (pMesh.userData && typeof pMesh.userData.setPose === 'function') {
                pMesh.userData.setPose('ko');
              }
            }

            if (pMesh.userData && typeof pMesh.userData.billboard === 'function') {
              pMesh.userData.billboard(cameraRef.current!);
            }
          }
        });

        // 相機跟隨主角 (Over-the-shoulder / Third Person)
        const human = players.find(p => p.id === humanPlayerId);
        if (human) {
          const cam = cameraRef.current;
          const dist = cameraDistance.current;
          const pitch = cameraPitch.current;
          const yaw = cameraYaw.current;

          const cx = human.x - Math.sin(yaw) * dist * Math.cos(pitch);
          const cy = human.y + 1.8 + Math.sin(pitch) * dist;
          const cz = human.z - Math.cos(yaw) * dist * Math.cos(pitch);

          cam.position.set(cx, cy, cz);
          cam.lookAt(human.x, human.y + 1.2, human.z);
        }

        rendererRef.current.render(sceneRef.current, cameraRef.current);
      }
    };

    renderLoop();
    return () => cancelAnimationFrame(animId);
  }, [gamePhase, players, humanPlayerId]);

  // Main Logic Game Interval (50ms Tick / 20 FPS Physics & AI)
  useEffect(() => {
    if (gamePhase !== 'playing') return;

    const delta = 0.05;
    const interval = setInterval(() => {
      setMatchTime(t => t + delta);

      setPlayers(prevPlayers => {
        const human = prevPlayers.find(p => p.id === humanPlayerId);
        if (!human) return prevPlayers;

        let promptMessage: string | null = null;
        const isSpacePressed = !!(
          keysPressed.current['Space'] ||
          keysPressed.current['space'] ||
          keysPressed.current[' '] ||
          keysPressed.current['Spacebar'] ||
          keysPressed.current['primaryAction']
        );

        // 0. 更新【凍原祭司】艾琳娜【冰封詛咒】特殊攻擊判定物件 (specialattack.png)
        if (iceProjectilesRef.current.length > 0 && sceneRef.current) {
          const { aliveProjectiles, updatedPlayers: projdPlayers, impacts } = updateIceProjectilesAndCheckHits(
            iceProjectilesRef.current,
            delta,
            cameraRef.current,
            sceneRef.current,
            prevPlayers
          );
          iceProjectilesRef.current = aliveProjectiles;
          prevPlayers = projdPlayers;
          if (impacts.length > 0) {
            promptMessage = impacts[0].message;
          }
        }

        // 1. 發電機修復狀態與多人加成統計
        const genRepairers: Record<number, number> = {};
        const genRepairMultiplier: Record<number, number> = {};
        const currentGens = generatorsRef.current;
        currentGens.forEach(g => {
          genRepairers[g.id] = 0;
          genRepairMultiplier[g.id] = 1.0;
        });

        // 2. 統計修機/救人/攻擊/互動
        prevPlayers.forEach(p => {
          if (p.faction === 'survivor' && (p.health === 'healthy' || p.health === 'injured')) {
            currentGens.forEach(gen => {
              if (!gen.isCompleted && gen.isTargetGen) {
                const dist = Math.hypot(gen.x - p.x, gen.z - p.z);
                if (dist <= 3.2) {
                  const isRepairing = (p.id === humanPlayerId && isSpacePressed) || (p.id !== humanPlayerId);
                  if (isRepairing) {
                    genRepairers[gen.id] = (genRepairers[gen.id] || 0) + 1;
                    if (p.satoBuffTime && p.satoBuffTime > 0) {
                      genRepairMultiplier[gen.id] = (genRepairMultiplier[gen.id] || 1.0) * 1.10;
                    }
                    if (p.jackBuffTime && p.jackBuffTime > 0) {
                      genRepairMultiplier[gen.id] = (genRepairMultiplier[gen.id] || 1.0) * 1.10;
                    }
                  }
                }
              }
            });
          }
        });

        // 更新發電機進度
        const nextGens = currentGens.map(gen => {
          if (gen.isCompleted || !gen.isTargetGen) return gen;
          const count = genRepairers[gen.id] || 0;
          if (count > 0) {
            const multiFactor = Math.pow(1.25, count - 1);
            const skillBonus = genRepairMultiplier[gen.id] || 1.0;
            const ratePerSec = (100 / 90) * multiFactor * skillBonus;
            const newProg = Math.min(100, gen.progress + ratePerSec * delta);
            const isNowDone = newProg >= 100;
            if (isNowDone && !gen.isCompleted) {
              sound.playGenCompleteSound();
            }

            // 更新 2D 貼圖
            const gMesh = generatorMeshesRef.current?.[gen.id];
            if (gMesh && gMesh.userData?.spriteVisual?.material) {
              const targetMap = isNowDone ? hasfixTexture : unfixTexture;
              if (gMesh.userData.spriteVisual.material.map !== targetMap) {
                gMesh.userData.spriteVisual.material.map = targetMap;
                gMesh.userData.spriteVisual.material.needsUpdate = true;
              }
            }

            return { ...gen, progress: newProg, isCompleted: isNowDone, repairingCount: count };
          }
          return { ...gen, repairingCount: 0 };
        });
        generatorsRef.current = nextGens;
        setGenerators(nextGens);

        // 3. 逃生大門進度 (5 台目標電箱全部修理完畢方可互動，完整開啟需 30 秒，僅限 1 人開啟，嚴禁複數人加速)
        const completedGensCount = nextGens.filter(g => g.isCompleted && g.isTargetGen).length;
        const gatesArePowered = completedGensCount >= 5;

        // 逃生者大門接觸判定（大門為 8m 寬大型立繪，寬度範圍 +-6.0m，深度距離 <= 6.0m）
        const isNearExitGate = (px: number, pz: number, gate: ExitGateState) => {
          const dx = Math.abs(px - gate.x);
          const dz = Math.abs(pz - gate.z);
          return (dx <= 6.0 && dz <= 6.0) || Math.hypot(gate.x - px, gate.z - pz) <= 7.0;
        };

        const nextGates = exitGatesRef.current.map(gate => {
          if (!gatesArePowered) {
            return { ...gate, progress: 0, isOpen: false };
          }
          if (gate.isOpen) {
            return gate;
          }

          let newProgress = gate.progress;
          let isBeingOpened = false;

          // 判定人類逃生者是否在開門 (接觸大門範圍且按住 Space 鍵)
          if (
            human.faction === 'survivor' &&
            human.health !== 'caged' &&
            human.health !== 'dead' &&
            human.health !== 'escaped' &&
            human.health !== 'downed'
          ) {
            if (isNearExitGate(human.x, human.z, gate) && isSpacePressed) {
              isBeingOpened = true;
              // 開門需 30 秒 (100 / 30 = 3.333% / sec)，僅限 1 人，離開保留進度
              newProgress = Math.min(100, gate.progress + (100 / 30.0) * delta);
            }
          }

          // 若人類未在開門，則允許最多 1 名 AI 逃生者開門 (僅限 1 人，嚴禁複數加速)
          if (!isBeingOpened) {
            const aiOpener = prevPlayers.find(
              s =>
                s.faction === 'survivor' &&
                s.id !== humanPlayerId &&
                s.health !== 'caged' &&
                s.health !== 'dead' &&
                s.health !== 'escaped' &&
                s.health !== 'downed' &&
                isNearExitGate(s.x, s.z, gate)
            );
            if (aiOpener) {
              isBeingOpened = true;
              newProgress = Math.min(100, gate.progress + (100 / 30.0) * delta);
            }
          }

          const isNowOpen = newProgress >= 100;
          if (isNowOpen && !gate.isOpen) {
            sound.playEscapeSound();
          }

          // 更新 2D 大門立繪貼圖 (0~99% noopen.png, 100% open.png)
          const gateMesh = gateMeshesRef.current[gate.id];
          if (gateMesh?.userData?.spriteVisual?.material) {
            const targetMap = isNowOpen ? openTexture : noopenTexture;
            if (gateMesh.userData.spriteVisual.material.map !== targetMap) {
              gateMesh.userData.spriteVisual.material.map = targetMap;
              gateMesh.userData.spriteVisual.material.needsUpdate = true;
            }
          }

          return { ...gate, progress: newProgress, isOpen: isNowOpen };
        });
        exitGatesRef.current = nextGates;
        setExitGates(nextGates);

        // 定期清除過期的大門逃生提示
        setEscapeNotifications(prev => prev.filter(n => n.expiresAt > Date.now()));

        // 4. 計算每個玩家的移動、AI 行為與狀態變更
        const hitMap: Record<string, { newHealth: HealthState; deepInjury: boolean; message?: string }> = {};
        let cagedSurvivorId: string | null = null;
        let cagedPos: { x: number; z: number } | null = null;
        let humanKillerAttackCD: number | null = null;
        let aiKillerPositionUpdate: { x: number; z: number; rotationY: number } | null = null;
        let aiKillerAttackCD: number | null = null;
        let aiKillerSkillCD: number | null = null;
        let aiKillerBerserkTime: number | null = null;

        // E13: Track Endgame Stall Timer to prevent infinite stalemates when gates are powered
        if (gatesArePowered && !exitGatesRef.current[0]?.isOpen) {
          endgameStallTimerRef.current += delta;
        } else {
          endgameStallTimerRef.current = 0;
        }

        const killerPlayer = prevPlayers.find(p => p.faction === 'killer') || human;
        const survivorPlayers = prevPlayers.filter(p => p.faction === 'survivor');
        const roleAssignment = evaluateSurvivorRoles(
          survivorPlayers,
          killerPlayer,
          currentGens,
          exitGatesRef.current,
          gatesArePowered,
          endgameStallTimerRef.current
        );

        const aiCtx: AIGameContext = {
          delta,
          mapColliders: mapDataRef.current?.colliders || [],
          genPositions: mapDataRef.current?.genPositions || [],
          generators: currentGens,
          exitGates: exitGatesRef.current,
          cages: cages.length > 0 ? cages : (mapDataRef.current?.cagePositions || []).map((pos, idx) => ({ id: idx, x: pos.x, z: pos.z, occupiedPlayerId: null })),
          allPlayers: prevPlayers,
          humanPlayerId,
          killerBreakCharges,
          noisePings,
          scratchMarks: scratchMarksRef.current,
          scene: sceneRef.current,
          camera: cameraRef.current,
          playerMeshes: playerMeshesRef.current,
          iceProjectiles: iceProjectilesRef.current,
          endgameStallTimer: endgameStallTimerRef.current,
          onAddNoisePing: (ping) => setNoisePings(prev => [...prev.slice(-4), ping]),
          onSetKillerBreakCharges: setKillerBreakCharges,
          onEscapeNotification: (text) => setEscapeNotifications(prev => [
            ...prev.filter(n => n.expiresAt > Date.now()),
            { id: `${Date.now()}`, text, expiresAt: Date.now() + 5000 }
          ]),
        };

        // 殺手【普通互動/攻擊 (Space 鍵)】判定規格 (若為人類殺手)：
        let isHumanCaging = false;
        if (human.faction === 'killer' && (human.health === 'healthy' || human.health === 'injured')) {
          const kx = human.x;
          const kz = human.z;
          const kAttackCD = human.attackCooldown || 0;

          const downedSurv = prevPlayers.find(
            s => s.faction === 'survivor' &&
                 s.health === 'downed' &&
                 Math.hypot(s.x - kx, s.z - kz) <= 3.5
          );

          const targetSurv = prevPlayers.find(
            s => s.faction === 'survivor' &&
                 (s.health === 'healthy' || s.health === 'injured') &&
                 (!s.hitBoostTime || s.hitBoostTime <= 0) &&
                 Math.hypot(s.x - kx, s.z - kz) <= 3.2
          );

          const targetGen = currentGens.find(
            g => !g.isCompleted && g.progress > 0 && Math.hypot(g.x - kx, g.z - kz) <= 3.2
          );

          // 優先判定附近瀕死倒地的逃生者押送
          if (downedSurv) {
            // 需持續按住 5 秒傳送至監牢，中斷則進度歸零重頭開始
            if (isSpacePressed) {
              isHumanCaging = true;
              const nextProg = Math.min(100, (downedSurv.cagingProgress || 0) + (delta / 5.0) * 100);
              downedSurv.cagingProgress = nextProg;
              downedSurv.isBeingCaged = true;
              promptMessage = `⛓️ 正在押送 ${downedSurv.name} 至監牢中... [ ${Math.floor(nextProg)}% ] (請持續按住 Space 5 秒)`;

              if (nextProg >= 100) {
                const cageList = cages.length > 0 ? cages : (mapDataRef.current?.cagePositions || []).map((pos, idx) => ({ id: idx, x: pos.x, z: pos.z, occupiedPlayerId: null }));
                const bestCage = getAvailableCage({ x: kx, z: kz }, prevPlayers, cageList);
                cagedSurvivorId = downedSurv.id;
                cagedPos = { x: bestCage.x, z: bestCage.z };
                downedSurv.health = 'caged';
                downedSurv.cageTimer = downedSurv.cageTimer !== undefined ? downedSurv.cageTimer : 90;
                downedSurv.cageCount = (downedSurv.cageCount || 0) + 1;
                downedSurv.assignedCageId = bestCage.id;
                downedSurv.x = bestCage.x;
                downedSurv.z = bestCage.z;
                downedSurv.cagingProgress = 0;
                downedSurv.isBeingCaged = false;
                downedSurv.healProgress = 0;

                setCages(prevCages => prevCages.map(c => c.id === bestCage.id ? { ...c, occupiedPlayerId: downedSurv.id } : c));

                // 即時同步 3D 角色立繪與網格位置至新監牢
                const mesh = playerMeshesRef.current[downedSurv.id];
                if (mesh) {
                  mesh.position.set(bestCage.x, 0, bestCage.z);
                  if (mesh.userData?.setPose) mesh.userData.setPose('ko');
                }

                // 嚴格保證：僅在 100% 成功押送入獄時，才精確增加 1 次破壞電箱充能
                setKillerBreakCharges(c => c + 1);
                sound.playScreamSound();
                promptMessage = `⛓️ 成功將倒地的 ${downedSurv.name} 押送關進監牢！獲得 1 次破壞電箱充能！`;
              }
            } else {
              // 釋放按鍵或中斷：進度歸零重頭開始，絕不增加充能
              if ((downedSurv.cagingProgress || 0) > 0) {
                downedSurv.cagingProgress = 0;
                downedSurv.isBeingCaged = false;
                promptMessage = `⚠️ 押送中斷！進度已重頭開始！`;
              } else {
                promptMessage = `長按 [空白鍵 Space] 5 秒將倒地的 ${downedSurv.name} 押送進監牢 (獲 1 次破壞電箱充能)！`;
              }
            }
          } else {
            // 重設所有遠離殺手的倒地逃生者押送狀態
            prevPlayers.forEach(s => {
              if (s.faction === 'survivor' && s.health === 'downed' && s.isBeingCaged && Math.hypot(s.x - kx, s.z - kz) > 3.5) {
                s.cagingProgress = 0;
                s.isBeingCaged = false;
              }
            });

            if (targetSurv) {
              if (isSpacePressed && kAttackCD <= 0) {
                // 玩家殺手普攻命中判定
                sound.playHitSound();
                sound.playScreamSound();
                humanKillerAttackCD = 1.5;
                let newH: HealthState;
                let deepInjury = targetSurv.deepInjury || false;
                let msg = '';

                if (human.characterId === 'gourmet') {
                  const gHit = processGourmetHitOnSurvivor(human, targetSurv);
                  newH = gHit.nextHealth;
                  deepInjury = gHit.deepInjury;
                  msg = gHit.message;
                } else {
                  newH = targetSurv.health === 'healthy' ? 'injured' : 'downed';
                  msg = newH === 'downed'
                    ? `⚔️ 重擊命中！已將受傷的 ${targetSurv.name} 擊倒瀕死 (Downed)！`
                    : `⚔️ 揮擊命中！${targetSurv.name} 受到傷害！`;
                }
                hitMap[targetSurv.id] = { newHealth: newH, deepInjury, message: msg };
                promptMessage = msg;
              } else {
                promptMessage = kAttackCD <= 0 
                  ? `按下 [空白鍵 Space] 近戰揮擊攻擊 ${targetSurv.name}！`
                  : `攻擊冷卻中 (${kAttackCD.toFixed(1)}s)...`;
              }
            } else if (targetGen) {
              if (isSpacePressed && kAttackCD <= 0 && killerBreakCharges > 0) {
                sound.playSkillSound();
                humanKillerAttackCD = 1.8;
                const deduction = targetGen.progress * 0.10;
                const newProg = Math.max(0, targetGen.progress - deduction);
                setGenerators(prevGens =>
                  prevGens.map(g => (g.id === targetGen.id ? { ...g, progress: newProg } : g))
                );
                setKillerBreakCharges(c => Math.max(0, c - 1));
                promptMessage = `🔨 成功破壞電箱！扣除當前進度 10% (充能剩餘: ${killerBreakCharges - 1}次)`;
              } else if (killerBreakCharges <= 0) {
                promptMessage = `⚠️ 無破壞電箱機會：需將逃生者送入監牢後獲 1 次破壞機會 (${Math.floor(targetGen.progress)}%)`;
              } else {
                promptMessage = `按下 [空白鍵 Space] 破壞電箱 (扣除當前進度 10%，充能剩餘 ${killerBreakCharges} 次)！`;
              }
            }
          }
        }

        // --- AI 殺手決策與攻擊結算 (在更新逃生者前先計算，確保命中與擊倒即時套用) ---
        if (killerPlayer.id !== humanPlayerId && killerPlayer.faction === 'killer') {
          const killerRes = updateKillerAI(killerPlayer, aiCtx);
          aiKillerPositionUpdate = {
            x: killerRes.updatedKiller.x,
            z: killerRes.updatedKiller.z,
            rotationY: killerRes.updatedKiller.rotationY,
          };
          aiKillerAttackCD = killerRes.updatedKiller.attackCooldown || 0;
          aiKillerSkillCD = killerRes.updatedKiller.skillCooldown;
          aiKillerBerserkTime = killerRes.updatedKiller.berserkTime || 0;

          if (killerRes.hitResult) {
            hitMap[killerRes.hitResult.survivorId] = {
              newHealth: killerRes.hitResult.newHealth,
              deepInjury: killerRes.hitResult.deepInjury,
              message: killerRes.hitResult.message,
            };
            if (killerRes.hitResult.message) {
              promptMessage = killerRes.hitResult.message;
            }
          } else if (killerRes.hitSurvivorId) {
            const s = prevPlayers.find(p => p.id === killerRes.hitSurvivorId);
            if (s) {
              const newH = s.health === 'healthy' ? 'injured' : 'downed';
              hitMap[s.id] = { newHealth: newH, deepInjury: false };
            }
          }

          if (killerRes.cagedSurvivorId) {
            cagedSurvivorId = killerRes.cagedSurvivorId;
            const cagePos = killerRes.decision.targetPos;
            if (cagePos) {
              cagedPos = { x: cagePos.x, z: cagePos.z };
            }
          }
        }

        const updatedPlayers = prevPlayers.map(p => {
          let nx = p.x;
          let nz = p.z;
          let rot = p.rotationY;
          let health = p.health;
          let cageTimer = p.cageTimer;
          let deepInjury = p.deepInjury || false;
          let healProgress = p.healProgress || 0;
          let cagingProgress = p.cagingProgress || 0;
          let isBeingCaged = p.isBeingCaged || false;
          let skillCD = Math.max(0, p.skillCooldown - delta);
          let attackCD = Math.max(0, (p.attackCooldown || 0) - delta);
          let skillActive = Math.max(0, p.skillActiveTime - delta);
          let hitBoostTime = Math.max(0, (p.hitBoostTime || 0) - delta);
          let frostbiteTime = Math.max(0, (p.frostbiteTime || 0) - delta);
          let elenaBuffTime = Math.max(0, (p.elenaBuffTime || 0) - delta);
          let berserkTime = Math.max(0, (p.berserkTime || 0) - delta);
          let tariqStealthTime = Math.max(0, (p.tariqStealthTime || 0) - delta);
          let tariqSpeedBoostTime = Math.max(0, (p.tariqSpeedBoostTime || 0) - delta);
          let betrayedTeammateTime = Math.max(0, (p.betrayedTeammateTime || 0) - delta);
          let jackBuffTime = Math.max(0, (p.jackBuffTime || 0) - delta);
          let vikingBuffTime = Math.max(0, (p.vikingBuffTime || 0) - delta);
          let satoBuffTime = Math.max(0, (p.satoBuffTime || 0) - delta);

          // 應用擊中或押送狀態
          if (hitMap[p.id]) {
            const hitInfo = hitMap[p.id];
            health = hitInfo.newHealth;
            deepInjury = hitInfo.deepInjury;
            hitBoostTime = hitInfo.newHealth === 'injured' ? 2.0 : 0;
            healProgress = 0;
            cagingProgress = 0;
            if (hitInfo.newHealth === 'downed') {
              const pMesh = playerMeshesRef.current[p.id];
              if (pMesh?.userData?.setPose) {
                pMesh.userData.setPose('ko');
              }
            }
          }

          let assignedCageId = p.assignedCageId;

          if (p.id === cagedSurvivorId && cagedPos) {
            health = 'caged';
            cageTimer = p.cageTimer !== undefined ? p.cageTimer : 90;
            nx = cagedPos.x;
            nz = cagedPos.z;
            healProgress = 0;
            cagingProgress = 0;
            isBeingCaged = false;
            const matchedCage = cages.find(c => Math.hypot(c.x - cagedPos.x, c.z - cagedPos.z) < 2.0);
            if (matchedCage) {
              assignedCageId = matchedCage.id;
              setCages(prevCages => prevCages.map(c => c.id === matchedCage.id ? { ...c, occupiedPlayerId: p.id } : c));
            }
            const pMesh = playerMeshesRef.current[p.id];
            if (pMesh) {
              pMesh.position.set(cagedPos.x, 0, cagedPos.z);
              if (pMesh?.userData?.setPose) {
                pMesh.userData.setPose('ko');
              }
            }
          }

          // 當處於監牢狀態時，強制將座標牢牢鎖定在對應監牢中心
          if (health === 'caged') {
            const myCage = cages.find(c => c.id === assignedCageId) || (cagedPos ? { x: cagedPos.x, z: cagedPos.z } : null);
            if (myCage) {
              nx = myCage.x;
              nz = myCage.z;
            }
          }

          // 計算移動速度
          let speed = p.speed;
          if (p.faction === 'killer') {
            if (isHumanCaging && p.id === humanPlayerId) {
              speed = 0; // 押送中原地蓄力引導
            } else {
              const baseKiller = 6.2;
              if (p.characterId === 'elena' && elenaBuffTime > 0) speed = baseKiller * 1.25;
              else if (p.characterId === 'gourmet' && berserkTime > 0) speed = baseKiller * 1.15;
              else speed = baseKiller;
            }
          } else {
            if (health === 'downed' || health === 'caged' || health === 'dead' || health === 'escaped') {
              speed = 0;
            } else if (hitBoostTime > 0) {
              speed = 8.0;
            } else {
              let survBase = 5.0;
              if (frostbiteTime > 0) survBase *= 0.85;
              if (vikingBuffTime > 0) survBase *= 1.5;
              if (tariqSpeedBoostTime > 0) survBase *= 1.35;
              speed = survBase;
            }
          }

          // 恐懼尖叫隨機判定 (30~60 秒，嚴禁小於 30 秒或大於 60 秒，50% 機率暴露位置給殺手)
          let screamTimer = p.nextFearScreamTimer !== undefined ? p.nextFearScreamTimer - delta : (30 + Math.random() * 30);
          let screamRevealTimer = Math.max(0, (p.fearScreamRevealTimer || 0) - delta);
          let fearRevealed = screamRevealTimer > 0;
          let kentoFearScreamTime = Math.max(0, (p.kentoFearScreamTime || 0) - delta);

          if (p.faction === 'survivor' && health !== 'dead' && health !== 'escaped') {
            if (screamTimer <= 0) {
              screamTimer = 30 + Math.random() * 30;
              sound.playScreamSound();
              kentoFearScreamTime = 5.0;
              const exposed = Math.random() < 0.5; // 50% 機率暴露氣場/位置
              if (exposed) {
                screamRevealTimer = 6.0;
                fearRevealed = true;
                setNoisePings(prev => [
                  ...prev.slice(-4),
                  { id: 'scream_' + Date.now() + '_' + p.id, x: p.x, z: p.z, label: `逃生者 [${p.name}] 尖叫並暴露位置 (50%機率觸發)！`, createdAt: Date.now() },
                ]);
                if (human.faction === 'killer') {
                  promptMessage = `🚨 聽見【${p.name}】因恐懼失聲尖叫！其位置已暴露 6 秒 (50% 機率)！`;
                }
              } else {
                screamRevealTimer = 0;
                fearRevealed = false;
                setNoisePings(prev => [
                  ...prev.slice(-4),
                  { id: 'scream_' + Date.now() + '_' + p.id, x: p.x, z: p.z, label: `逃生者 [${p.name}] 因恐懼尖叫 (未暴露位置)`, createdAt: Date.now() },
                ]);
              }
            }
          }

          // 關押倒數計時
          if (health === 'caged') {
            cageTimer -= delta;
            if (cageTimer <= 0) {
              health = 'dead';
              sound.playScreamSound();
              if (assignedCageId !== undefined && assignedCageId !== null) {
                const freedId = assignedCageId;
                assignedCageId = null;
                setCages(prevCages => prevCages.map(c => c.id === freedId ? { ...c, occupiedPlayerId: null } : c));
              }
              const pMesh = playerMeshesRef.current[p.id];
              if (pMesh?.userData?.setPose) {
                pMesh.userData.setPose('ko');
              }
              setEscapeNotifications(prev => [
                ...prev.filter(n => n.expiresAt > Date.now()),
                { id: `${p.id}_dead_${Date.now()}`, text: `💀 ${p.name} 獻祭時間結束，已遭到獻祭！`, expiresAt: Date.now() + 5000 }
              ]);
            }
          }

          // --- 人類玩家輸入與移動 ---
          if (p.id === humanPlayerId) {
            // 互動提示
            if (health === 'caged') {
              promptMessage = `你已被關進監牢！等待隊友前來解救 (剩餘 ${Math.max(0, Math.ceil(cageTimer))}s)...`;
            } else if (health === 'downed') {
              promptMessage = '你已瀕死倒地，原地無法移動，請等待隊友前來急救...';
            } else if (p.faction === 'survivor') {
              // 逃生者互動
              let foundAction = false;
              prevPlayers.forEach(other => {
                if (other.id !== p.id && other.faction === 'survivor') {
                  const dist = Math.hypot(other.x - nx, other.z - nz);
                  if (other.health === 'caged' && dist < 3.2) {
                    const currentProg = other.rescueProgress || 0;
                    if (isSpacePressed) {
                      const nextProg = Math.min(100, currentProg + (delta / 1.5) * 100);
                      other.rescueProgress = nextProg;
                      promptMessage = `🔓 正在解救隊友 ${other.name}... [ ${Math.floor(nextProg)}% ] (請持續按住空白鍵 1.5 秒)`;
                      if (nextProg >= 100) {
                        other.health = 'injured';
                        // 保留上一次在監牢被救出時的剩餘獻祭時間 (不重置為 90 秒)
                        other.rescueProgress = 0;
                        other.healProgress = 0;
                        other.wasRescuedFromCage = true;
                        other.hitBoostTime = 2.0;
                        if (other.assignedCageId !== undefined && other.assignedCageId !== null) {
                          const freedCageId = other.assignedCageId;
                          other.assignedCageId = null;
                          setCages(prevCages => prevCages.map(c => c.id === freedCageId ? { ...c, occupiedPlayerId: null } : c));
                        }
                        if (other.characterId === 'jack') other.jackRescuedWindow = 30;
                        const oMesh = playerMeshesRef.current[other.id];
                        if (oMesh?.userData?.setPose) oMesh.userData.setPose('front');
                        sound.playSkillSound();
                        promptMessage = `🎉 成功將 ${other.name} 從監牢中解救出來！`;
                      }
                    } else {
                      other.rescueProgress = 0;
                      promptMessage = `長按 [空白鍵] 解救隊友 ${other.name} (剩餘 ${Math.max(0, Math.ceil(other.cageTimer))}s 被獻祭)！`;
                    }
                    foundAction = true;
                  } else if ((other.health === 'downed' || other.health === 'injured') && dist < 3.0) {
                    const actionName = other.health === 'downed' ? '急救復甦' : '包紮治療';
                    const deepText = other.deepInjury ? ' [深度受傷 - 治療耗時增加]' : '';
                    promptMessage = `長按 [空白鍵] ${actionName} ${other.name}${deepText} (${Math.floor(other.healProgress || 0)}%)`;
                    foundAction = true;
                    if (isSpacePressed) {
                      const healRate = other.deepInjury ? (100 / 24) : (100 / 16);
                      other.healProgress = Math.min(100, (other.healProgress || 0) + healRate * delta);
                      if (other.healProgress >= 100) {
                        if (other.health === 'downed') {
                          other.health = 'injured';
                          other.healProgress = 0;
                        } else if (other.health === 'injured') {
                          other.health = 'healthy';
                          other.healProgress = 0;
                          other.deepInjury = false;
                          other.erikSkillAvailable = true; // 艾瑞克被重新治療至健康狀態，恢復技能使用資格
                        }
                      }
                    }
                  }
                }
              });

              if (!foundAction) {
                currentGens.forEach(gen => {
                  const dist = Math.hypot(gen.x - nx, gen.z - nz);
                  if (dist <= 3.2) {
                    if (gen.isCompleted) {
                      promptMessage = `✅ 此電箱已完成修復 (100%)`;
                    } else if (gen.isTargetGen) {
                      if (isSpacePressed) {
                        promptMessage = `⚡ 正在修復目標電箱中... [ ${Math.floor(gen.progress)}% ] (請持續按住空白鍵修復)`;
                      } else {
                        promptMessage = `長按 [空白鍵] 修理目標電箱 (${Math.floor(gen.progress)}%) [需修好 5 個目標電箱]`;
                      }
                    } else {
                      promptMessage = `⚠️ 非目標電箱 (無須修理，請尋找地圖上的目標電箱)`;
                    }
                    foundAction = true;
                  }
                });
              }

              if (!foundAction && gatesArePowered) {
                exitGatesRef.current.forEach(gate => {
                  if (isNearExitGate(nx, nz, gate)) {
                    if (gate.isOpen) {
                      // 需求 3: 大門 100% open.png 狀態，接觸大門觸發提示「你已經可進行逃離」
                      promptMessage = '🚪 你已經可進行逃離！(按下 [空白鍵] 逃離)';
                      foundAction = true;
                      if (isSpacePressed) {
                        health = 'escaped';
                        const mesh = playerMeshesRef.current[p.id];
                        if (mesh) mesh.visible = false;
                        sound.playEscapeSound();
                        setEscapeNotifications(prev => [
                          ...prev.filter(n => n.expiresAt > Date.now()),
                          { id: `${p.id}_${Date.now()}`, text: `${p.name}已逃離遊戲`, expiresAt: Date.now() + 5000 }
                        ]);
                      }
                    } else {
                      // 需求 2: 0~99% 進度，耗時 30 秒，僅限 1 人開啟
                      if (isSpacePressed) {
                        promptMessage = `⚡ 正在開啟逃生大門... [ ${Math.floor(gate.progress)}% ] (耗時30秒/限1人，請持續按住空白鍵)`;
                      } else {
                        promptMessage = `長按 [空白鍵] 開啟逃生大門 (${Math.floor(gate.progress)}%) [耗時30秒/限1人，鬆開保留進度]`;
                      }
                      foundAction = true;
                    }
                  }
                });
              }
            }

            // WASD 移動控制與動畫更新
            if (health !== 'caged' && health !== 'dead' && health !== 'escaped' && health !== 'downed') {
              const isW = !!(keysPressed.current['KeyW'] || keysPressed.current['w'] || keysPressed.current['ArrowUp']);
              const isS = !!(keysPressed.current['KeyS'] || keysPressed.current['s'] || keysPressed.current['ArrowDown']);
              const isA = !!(keysPressed.current['KeyA'] || keysPressed.current['a'] || keysPressed.current['ArrowLeft']);
              const isD = !!(keysPressed.current['KeyD'] || keysPressed.current['d'] || keysPressed.current['ArrowRight']);

              let moveForward = 0;
              let moveRight = 0;
              if (isW) moveForward += 1;
              if (isS) moveForward -= 1;
              if (isA) moveRight -= 1;
              if (isD) moveRight += 1;

              const isMoving = isW || isS || isA || isD;
              const pMesh = playerMeshesRef.current[p.id];

              if (isMoving) {
                const moveAngle = Math.atan2(-moveRight, moveForward);
                const finalAngle = cameraYaw.current + moveAngle;

                rot = finalAngle;
                const targetX = nx + Math.sin(finalAngle) * speed * delta;
                const targetZ = nz + Math.cos(finalAngle) * speed * delta;

                const moved = moveWithCollision(nx, nz, targetX, targetZ, 0.75);
                nx = moved.x;
                nz = moved.z;

                if (pMesh?.userData?.updateMovementPose) {
                  if (p.characterId === 'elena' || p.characterId === 'kento' || p.characterId === 'jack' || p.characterId === 'tariq' || p.characterId === 'gourmet' || p.characterId === 'erik') {
                    const dir = (isW || isA) ? 'left_or_forward' : 'right_or_backward';
                    pMesh.userData.updateMovementPose(delta, true, dir, p.health);
                  } else {
                    pMesh.userData.updateMovementPose(delta, true, moveRight, p.health);
                  }
                }
              } else {
                if (pMesh?.userData?.updateMovementPose) {
                  pMesh.userData.updateMovementPose(delta, false, 'idle', p.health);
                } else if (pMesh?.userData?.setPose) {
                  pMesh.userData.setPose('front');
                }
              }
            }
          } else {
            // --- AI NPC 決策系統 (遵守全局 G1-G5 與嚴格優先權樹) ---
            if (p.faction === 'killer') {
              if (aiKillerPositionUpdate) {
                nx = aiKillerPositionUpdate.x;
                nz = aiKillerPositionUpdate.z;
                rot = aiKillerPositionUpdate.rotationY;
                attackCD = aiKillerAttackCD !== null ? aiKillerAttackCD : attackCD;
                skillCD = aiKillerSkillCD !== null ? aiKillerSkillCD : skillCD;
                berserkTime = aiKillerBerserkTime !== null ? aiKillerBerserkTime : berserkTime;
              }
            } else {
              const survRes = updateSurvivorAI(
                {
                  ...p,
                  x: nx,
                  z: nz,
                  rotationY: rot,
                  health,
                  cageTimer,
                  deepInjury,
                  healProgress,
                  hitBoostTime,
                  frostbiteTime,
                  elenaBuffTime,
                  tariqStealthTime,
                  tariqSpeedBoostTime,
                  betrayedTeammateTime,
                  jackBuffTime,
                  vikingBuffTime,
                  satoBuffTime,
                  rescueProgress: p.rescueProgress || 0,
                  cagingProgress: p.cagingProgress || 0,
                  isBeingCaged: p.isBeingCaged || false,
                  skillCooldown: skillCD,
                  attackCooldown: attackCD,
                  skillActiveTime: skillActive,
                },
                aiCtx,
                roleAssignment
              );
              nx = survRes.updatedSurvivor.x;
              nz = survRes.updatedSurvivor.z;
              rot = survRes.updatedSurvivor.rotationY;
              health = survRes.updatedSurvivor.health;
              cageTimer = survRes.updatedSurvivor.cageTimer;
              deepInjury = survRes.updatedSurvivor.deepInjury || deepInjury;
              healProgress = survRes.updatedSurvivor.healProgress || 0;
              skillCD = survRes.updatedSurvivor.skillCooldown;
              skillActive = survRes.updatedSurvivor.skillActiveTime;
              hitBoostTime = survRes.updatedSurvivor.hitBoostTime || 0;
              frostbiteTime = survRes.updatedSurvivor.frostbiteTime || 0;
              elenaBuffTime = survRes.updatedSurvivor.elenaBuffTime || 0;
              tariqStealthTime = survRes.updatedSurvivor.tariqStealthTime || 0;
              tariqSpeedBoostTime = survRes.updatedSurvivor.tariqSpeedBoostTime || 0;
              betrayedTeammateTime = survRes.updatedSurvivor.betrayedTeammateTime || 0;
              jackBuffTime = survRes.updatedSurvivor.jackBuffTime || 0;
              vikingBuffTime = survRes.updatedSurvivor.vikingBuffTime || 0;
              satoBuffTime = survRes.updatedSurvivor.satoBuffTime || 0;
            }
          }

          return {
            ...p,
            x: nx,
            z: nz,
            rotationY: rot,
            health,
            cageTimer,
            assignedCageId,
            deepInjury,
            healProgress,
            rescueProgress: p.rescueProgress || 0,
            cagingProgress: p.cagingProgress || 0,
            isBeingCaged: p.isBeingCaged || false,
            wasRescuedFromCage: p.wasRescuedFromCage || false,
            jackRescuedWindow: p.jackRescuedWindow,
            erikSkillAvailable: p.erikSkillAvailable,
            nextFearScreamTimer: screamTimer,
            fearScreamRevealTimer: screamRevealTimer,
            fearScreamRevealedToKiller: fearRevealed,
            kentoFearScreamTime,
            skillCooldown: skillCD,
            attackCooldown: attackCD,
            skillActiveTime: skillActive,
            hitBoostTime,
            frostbiteTime,
            elenaBuffTime,
            berserkTime,
            tariqStealthTime,
            tariqSpeedBoostTime,
            betrayedTeammateTime,
            betrayedTeammateId: p.betrayedTeammateId,
            jackBuffTime,
            vikingBuffTime,
            satoBuffTime,
          };
        });

        if (promptMessage) setActionPrompt(promptMessage);

        // 5. 遊戲勝負判定與 10 分鐘 (600 秒) 結算檢查
        const survivors = updatedPlayers.filter(p => p.faction === 'survivor');
        const escapedCount = survivors.filter(s => s.health === 'escaped').length;
        const deadCount = survivors.filter(s => s.health === 'dead').length;
        const cagedCount = survivors.filter(s => s.health === 'caged').length;
        const completedCount = escapedCount + deadCount;
        const gensDone = generators.filter(g => g.isCompleted).length;

        // 判定時間 (最多 10 分鐘) 或全部逃生者皆已完成對局 (全部逃出/獻祭死亡)
        const isTimeout = matchTime >= 600;
        const isAllFinished = completedCount >= 4 || deadCount === 4 || escapedCount === 4;

        if (isTimeout || isAllFinished) {
          let winner: 'killer' | 'survivor' | 'draw' = 'draw';
          let winReason = '';
          const killerSecured = deadCount + cagedCount;

          if (escapedCount >= 3) {
            winner = 'survivor';
            winReason = isTimeout
              ? `【10分鐘時間到】逃生者成功逃離 ${escapedCount} 人 (>=3人)，逃生者陣營獲勝！`
              : `逃生者成功逃離 ${escapedCount} 人，逃生者陣營大獲全勝！`;
          } else if (killerSecured >= 3) {
            winner = 'killer';
            winReason = isTimeout
              ? `【10分鐘時間到】殺手已獻祭 ${deadCount} 人、關押 ${cagedCount} 人 (共 >=3人)，殺手陣營獲勝！`
              : `殺手成功獻祭 ${deadCount} 名逃生者，殺手陣營壓倒性勝利！`;
          } else if (escapedCount === 2) {
            winner = 'draw';
            winReason = isTimeout
              ? `【10分鐘時間到】2 人成功逃離 (其餘 2 人被獻祭/關押/未逃出)，雙方勢均力敵判定為平局！`
              : `【特殊結算：平局】2 名逃生者成功逃脫，2 名逃生者遭到獻祭。`;
          } else if (killerSecured >= 2 && escapedCount < 2) {
            winner = 'killer';
            winReason = isTimeout
              ? `【10分鐘時間到】殺手掌控了整場局勢 (獻祭/關押共 ${killerSecured} 人)，殺手獲勝！`
              : `殺手掌控了整場局勢，殺手獲勝！`;
          } else {
            winner = 'draw';
            winReason = `【10分鐘時間到】雙方未分勝負，判定為平局！`;
          }

          setGameStats({
            gensCompleted: gensDone,
            survivorsEscaped: escapedCount,
            survivorsKilled: deadCount,
            survivorsCaged: cagedCount,
            killerBreakCharges: killerBreakChargesRef.current,
            matchTime: Math.min(600, matchTimeRef.current),
            winner,
            winReason,
          });
          setGamePhase('gameover');
        }

        return updatedPlayers;
      });
    }, 50);

    return () => clearInterval(interval);
  }, [gamePhase, humanPlayerId, userFaction, userCharId, activeMap]);

  return (
    <div className="relative w-full h-screen bg-slate-950 text-white overflow-hidden select-none">
      {gamePhase === 'title' && (
        <TitleScreen
          onEnterGame={() => setGamePhase('menu')}
          onStartGame={() => setGamePhase('menu')}
        />
      )}
      {gamePhase === 'menu' && (
        <MainMenu
          onStartGame={handleStartGame}
          selectedFaction={userFaction}
          selectedCharId={userCharId}
          selectedMap={selectedMap}
        />
      )}
      {gamePhase === 'playing' && (
        <>
          <div ref={canvasContainerRef} className="w-full h-full" />
          {(() => {
            const humanPlayer = players.find(p => p.id === humanPlayerId) || players[0];
            if (!humanPlayer) return null;
            return (
              <HUD
                humanPlayer={humanPlayer}
                allPlayers={players}
                characterMap={characterMap}
                generators={generators}
                exitGates={exitGates}
                killerBreakCharges={killerBreakCharges}
                matchTime={matchTime}
                noisePings={noisePings}
                actionPrompt={actionPrompt}
                escapeNotifications={escapeNotifications}
                mapType={activeMap}
                onPrimaryActionPress={() => triggerPrimaryAction(humanPlayerId)}
                onPrimaryActionStart={() => {
                  keysPressed.current['Space'] = true;
                  keysPressed.current['space'] = true;
                  keysPressed.current[' '] = true;
                  keysPressed.current['primaryAction'] = true;
                }}
                onPrimaryActionEnd={() => {
                  keysPressed.current['Space'] = false;
                  keysPressed.current['space'] = false;
                  keysPressed.current[' '] = false;
                  keysPressed.current['primaryAction'] = false;
                }}
                onSkillPress={() => triggerSkill(humanPlayerId)}
                onExitMatch={() => setGamePhase('menu')}
              />
            );
          })()}
        </>
      )}
      {gamePhase === 'gameover' && gameStats && (
        <GameOverModal
          stats={gameStats}
          onRestart={() =>
            handleStartGame({
              userFaction,
              userCharacterId: userCharId,
              mapType: activeMap,
              mapSelection: selectedMap,
            })
          }
          onHome={() => setGamePhase('menu')}
          onReturnMenu={() => setGamePhase('menu')}
        />
      )}
    </div>
  );
}