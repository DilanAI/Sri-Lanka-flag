import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { createFabricWeaveBumpTexture, createSriLankaFlagTexture } from './sriLankaFlagTexture';

export type SkyPreset = 'daylight' | 'golden' | 'night';
export type FabricPreset = 'silk' | 'cotton';
export type CameraPreset = 'hero' | 'hoist' | 'span';

export interface FlagSimulationState {
  windSpeed: number; // 0.1 to 2.5
  isPlaying: boolean;
  skyPreset: SkyPreset;
  fabricPreset: FabricPreset;
  reducedMotion: boolean;
}

interface SkyTheme {
  zenith: number;
  horizon: number;
  fog: number;
  fogDensity: number;
  keyColor: number;
  keyIntensity: number;
  keyPos: [number, number, number];
  hemiSky: number;
  hemiGround: number;
  hemiIntensity: number;
  rimColor: number;
  rimIntensity: number;
  exposure: number;
  groundColor: number;
}

const SKY_THEMES: Record<SkyPreset, SkyTheme> = {
  daylight: {
    zenith: 0x1557b0,
    horizon: 0x99d6f7,
    fog: 0x99d6f7,
    fogDensity: 0.012,
    keyColor: 0xfff8eb,
    keyIntensity: 2.75,
    keyPos: [6, 9, 7],
    hemiSky: 0xb5e2ff,
    hemiGround: 0x3b4854,
    hemiIntensity: 1.25,
    rimColor: 0xe6f4ff,
    rimIntensity: 0.8,
    exposure: 1.12,
    groundColor: 0x2f3b47,
  },
  golden: {
    zenith: 0x1b2042,
    horizon: 0xd98048,
    fog: 0xc27042,
    fogDensity: 0.018,
    keyColor: 0xffb36b,
    keyIntensity: 2.9,
    keyPos: [8, 5, 6],
    hemiSky: 0xffb07a,
    hemiGround: 0x231b24,
    hemiIntensity: 0.85,
    rimColor: 0xffd2a6,
    rimIntensity: 0.9,
    exposure: 1.05,
    groundColor: 0x241e22,
  },
  night: {
    zenith: 0x040710,
    horizon: 0x121f38,
    fog: 0x0e182c,
    fogDensity: 0.02,
    keyColor: 0xffe8c2,
    keyIntensity: 3.1,
    keyPos: [4.5, 6.5, 7.5],
    hemiSky: 0x3b588f,
    hemiGround: 0x090d14,
    hemiIntensity: 0.65,
    rimColor: 0x8cb8ff,
    rimIntensity: 1.15,
    exposure: 1.15,
    groundColor: 0x0f1520,
  },
};

const CAMERA_PRESETS: Record<CameraPreset, { pos: [number, number, number]; target: [number, number, number] }> = {
  hero: { pos: [-0.05, 1.28, 4.75], target: [-0.18, 1.25, 0] },
  hoist: { pos: [-3.3, 1.55, 3.65], target: [-1.4, 1.45, 0] },
  span: { pos: [0.0, 1.05, 6.95], target: [-0.2, 0.75, 0] },
};

// Reusable module-scope math helpers (zero GC inside animation loop)
const _tempColorA = new THREE.Color();
const _tempColorB = new THREE.Color();
const _targetCamPos = new THREE.Vector3();
const _targetCtrlTarget = new THREE.Vector3();

function detectSoftwareWebGL(): boolean {
  const probeCanvas = document.createElement('canvas');
  const gl = probeCanvas.getContext('webgl2') || probeCanvas.getContext('webgl');
  if (!gl) return true;
  const ext = gl.getExtension('WEBGL_debug_renderer_info');
  const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
  const gpu = String(gl.getParameter(param) || '');
  gl.getExtension('WEBGL_lose_context')?.loseContext();
  return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
}

export class FlagSceneController {
  private container: HTMLElement;
  private renderer: THREE.WebGLRenderer;
  private scene: THREE.Scene;
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private isSoftwareGl: boolean;

  private flagGeometry: THREE.PlaneGeometry;
  private basePositions: Float32Array;
  private flagMaterial: THREE.MeshPhysicalMaterial;
  private flagTexture: THREE.CanvasTexture;
  private bumpTexture: THREE.CanvasTexture;
  private flagMesh: THREE.Mesh;

  private skyMaterial: THREE.ShaderMaterial;
  private keyLight: THREE.DirectionalLight;
  private hemiLight: THREE.HemisphereLight;
  private rimLight: THREE.DirectionalLight;
  private fog: THREE.FogExp2;
  private groundMaterial: THREE.MeshStandardMaterial;

  private disposables: Array<{ dispose: () => void }> = [];
  private state: FlagSimulationState;
  private elapsedTime = 0;
  private lastTimestamp = 0;
  private frameId = 0;
  private disposed = false;

  private cameraTransitionActive = false;
  private desiredCamPos = new THREE.Vector3(...CAMERA_PRESETS.hero.pos);
  private desiredCtrlTarget = new THREE.Vector3(...CAMERA_PRESETS.hero.target);
  private targetSkyPreset: SkyPreset;

  private onContextLostCb?: (lost: boolean) => void;

  constructor(
    container: HTMLElement,
    initialState: FlagSimulationState,
    onContextLost?: (lost: boolean) => void
  ) {
    this.container = container;
    this.state = { ...initialState };
    this.targetSkyPreset = initialState.skyPreset;
    this.onContextLostCb = onContextLost;
    this.isSoftwareGl = detectSoftwareWebGL();

    const width = container.clientWidth || window.innerWidth;
    const height = container.clientHeight || window.innerHeight;

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
      preserveDrawingBuffer: false,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NeutralToneMapping;
    this.renderer.toneMappingExposure = SKY_THEMES[initialState.skyPreset].exposure;
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(width, height);
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    container.appendChild(this.renderer.domElement);

    // WebGL context loss safety
    this.renderer.domElement.addEventListener('webglcontextlost', this.handleContextLost);
    this.renderer.domElement.addEventListener('webglcontextrestored', this.handleContextRestored);

    this.scene = new THREE.Scene();

    // Procedural studio environment map for metallic brass flagpole & finial reflections
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    const envTexture = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
    this.scene.environment = envTexture;
    this.disposables.push(envTexture);
    pmremGenerator.dispose();

    const initialTheme = SKY_THEMES[initialState.skyPreset];
    this.fog = new THREE.FogExp2(initialTheme.fog, initialTheme.fogDensity);
    this.scene.fog = this.fog;

    // Sky dome gradient shader
    const skyGeo = new THREE.SphereGeometry(65, 32, 20);
    this.skyMaterial = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uZenith: { value: new THREE.Color(initialTheme.zenith) },
        uHorizon: { value: new THREE.Color(initialTheme.horizon) },
      },
      vertexShader: `
        varying vec3 vWorldPos;
        void main() {
          vec4 wp = modelMatrix * vec4(position, 1.0);
          vWorldPos = wp.xyz;
          gl_Position = projectionMatrix * viewMatrix * wp;
        }
      `,
      fragmentShader: `
        varying vec3 vWorldPos;
        uniform vec3 uZenith;
        uniform vec3 uHorizon;
        void main() {
          float h = clamp((normalize(vWorldPos).y + 0.08) / 0.72, 0.0, 1.0);
          vec3 col = mix(uHorizon, uZenith, pow(h, 0.65));
          gl_FragColor = vec4(col, 1.0);
        }
      `,
    });
    const skyMesh = new THREE.Mesh(skyGeo, this.skyMaterial);
    skyMesh.frustumCulled = false;
    this.scene.add(skyMesh);
    this.disposables.push(skyGeo, this.skyMaterial);

    // Camera & OrbitControls
    this.camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 160);
    this.camera.position.set(...CAMERA_PRESETS.hero.pos);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.target.set(...CAMERA_PRESETS.hero.target);
    this.controls.enableDamping = !this.isSoftwareGl;
    this.controls.dampingFactor = 0.06;
    this.controls.minDistance = 2.4;
    this.controls.maxDistance = 11.5;
    this.controls.maxPolarAngle = Math.PI * 0.56;
    this.controls.minPolarAngle = Math.PI * 0.16;
    this.controls.addEventListener('start', () => {
      this.cameraTransitionActive = false;
    });

    // 3-Point Studio & Outdoor Lighting Rig
    this.hemiLight = new THREE.HemisphereLight(
      initialTheme.hemiSky,
      initialTheme.hemiGround,
      initialTheme.hemiIntensity
    );
    this.scene.add(this.hemiLight);

    this.keyLight = new THREE.DirectionalLight(initialTheme.keyColor, initialTheme.keyIntensity);
    this.keyLight.position.set(...initialTheme.keyPos);
    this.keyLight.castShadow = !this.isSoftwareGl;
    this.keyLight.shadow.mapSize.width = 2048;
    this.keyLight.shadow.mapSize.height = 2048;
    this.keyLight.shadow.camera.near = 1;
    this.keyLight.shadow.camera.far = 28;
    const d = 5.5;
    this.keyLight.shadow.camera.left = -d;
    this.keyLight.shadow.camera.right = d;
    this.keyLight.shadow.camera.top = d;
    this.keyLight.shadow.camera.bottom = -d;
    this.keyLight.shadow.bias = -0.0005;
    this.keyLight.shadow.normalBias = 0.02;
    this.scene.add(this.keyLight);

    this.rimLight = new THREE.DirectionalLight(initialTheme.rimColor, initialTheme.rimIntensity);
    this.rimLight.position.set(-5, 4, -7);
    this.scene.add(this.rimLight);

    // Architectural Stone Ground & Contact Shadow Grounding
    const groundY = -2.8;
    const groundGeo = new THREE.CircleGeometry(48, 64);
    this.groundMaterial = new THREE.MeshStandardMaterial({
      color: initialTheme.groundColor,
      roughness: 0.9,
      metalness: 0.05,
    });
    const ground = new THREE.Mesh(groundGeo, this.groundMaterial);
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = groundY;
    ground.receiveShadow = !this.isSoftwareGl;
    this.scene.add(ground);
    this.disposables.push(groundGeo, this.groundMaterial);

    // Soft radial contact shadow under pedestal
    const shadowTex = this.createContactShadowTexture();
    const shadowPlaneGeo = new THREE.PlaneGeometry(3.2, 3.2);
    const shadowPlaneMat = new THREE.MeshBasicMaterial({
      map: shadowTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.48,
    });
    const shadowPlane = new THREE.Mesh(shadowPlaneGeo, shadowPlaneMat);
    shadowPlane.rotation.x = -Math.PI / 2;
    shadowPlane.position.set(-2.065, groundY + 0.015, 0);
    this.scene.add(shadowPlane);
    this.disposables.push(shadowTex, shadowPlaneGeo, shadowPlaneMat);

    // Composite 8-Part Ceremonial Flagpole Assembly
    this.buildFlagpoleAssembly(groundY);

    // High-resolution Waving Sri Lanka Flag Cloth
    const maxAniso = this.renderer.capabilities.getMaxAnisotropy();
    this.flagTexture = createSriLankaFlagTexture(maxAniso);
    this.bumpTexture = createFabricWeaveBumpTexture(maxAniso);

    this.flagGeometry = new THREE.PlaneGeometry(4.0, 2.0, 96, 48);
    this.basePositions = new Float32Array(this.flagGeometry.attributes.position.array);

    const isSilk = initialState.fabricPreset === 'silk';
    this.flagMaterial = new THREE.MeshPhysicalMaterial({
      map: this.flagTexture,
      emissive: new THREE.Color(0xffffff),
      emissiveMap: this.flagTexture,
      emissiveIntensity: 0.28,
      bumpMap: this.bumpTexture,
      bumpScale: isSilk ? 0.007 : 0.02,
      roughness: isSilk ? 0.45 : 0.82,
      metalness: 0.0,
      sheen: isSilk ? 0.24 : 0.12,
      sheenRoughness: isSilk ? 0.52 : 0.8,
      sheenColor: new THREE.Color(0xffe7a8),
      side: THREE.DoubleSide,
    });

    this.flagMesh = new THREE.Mesh(this.flagGeometry, this.flagMaterial);
    this.flagMesh.position.set(0.0, 1.48, 0.0);
    this.flagMesh.castShadow = !this.isSoftwareGl;
    this.flagMesh.receiveShadow = !this.isSoftwareGl;
    this.scene.add(this.flagMesh);
    this.disposables.push(this.flagGeometry, this.flagMaterial, this.flagTexture, this.bumpTexture);

    // Apply initial gentle wave shape so even reduced-motion users see sculptural cloth folds
    this.updateClothGeometry(0.65);

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }

    window.addEventListener('resize', this.handleResize);
    this.lastTimestamp = performance.now();
    this.tick(this.lastTimestamp);
  }

  private createContactShadowTexture(): THREE.CanvasTexture {
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = size;
    canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const grad = ctx.createRadialGradient(size / 2, size / 2, 10, size / 2, size / 2, size / 2);
    grad.addColorStop(0, 'rgba(0,0,0,0.9)');
    grad.addColorStop(0.45, 'rgba(0,0,0,0.4)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    const tex = new THREE.CanvasTexture(canvas);
    tex.needsUpdate = true;
    return tex;
  }

  private buildFlagpoleAssembly(groundY: number): void {
    const poleGroup = new THREE.Group();
    const poleX = -2.065;

    const stoneMat = new THREE.MeshStandardMaterial({
      color: 0x3b4048,
      roughness: 0.78,
      metalness: 0.08,
    });
    const steelMat = new THREE.MeshStandardMaterial({
      color: 0xd9dde2,
      roughness: 0.28,
      metalness: 0.88,
    });
    const brassMat = new THREE.MeshStandardMaterial({
      color: 0xe2af46,
      roughness: 0.2,
      metalness: 0.94,
    });
    const ropeMat = new THREE.MeshStandardMaterial({
      color: 0xe6dec8,
      roughness: 0.9,
      metalness: 0.0,
    });
    this.disposables.push(stoneMat, steelMat, brassMat, ropeMat);

    // 1. Stepped Ceremonial Stone Pedestal (LatheGeometry grounded flush at groundY)
    const plinthPoints = [
      new THREE.Vector2(0, 0),
      new THREE.Vector2(0.72, 0),
      new THREE.Vector2(0.72, 0.14),
      new THREE.Vector2(0.66, 0.17),
      new THREE.Vector2(0.56, 0.17),
      new THREE.Vector2(0.56, 0.32),
      new THREE.Vector2(0.5, 0.35),
      new THREE.Vector2(0.24, 0.35),
      new THREE.Vector2(0.22, 0.45),
      new THREE.Vector2(0, 0.45),
    ];
    const plinthGeo = new THREE.LatheGeometry(plinthPoints, 32);
    const plinth = new THREE.Mesh(plinthGeo, stoneMat);
    plinth.position.set(poleX, groundY, 0);
    plinth.castShadow = !this.isSoftwareGl;
    plinth.receiveShadow = !this.isSoftwareGl;
    poleGroup.add(plinth);
    this.disposables.push(plinthGeo);

    // 2. Brass Base Collar Flange
    const collarGeo = new THREE.CylinderGeometry(0.088, 0.125, 0.18, 28);
    const collar = new THREE.Mesh(collarGeo, brassMat);
    collar.position.set(poleX, groundY + 0.54, 0);
    collar.castShadow = !this.isSoftwareGl;
    poleGroup.add(collar);
    this.disposables.push(collarGeo);

    // 3. Tapered Satin-Steel Flagpole Mast
    const mastBottomY = groundY + 0.45;
    const mastTopY = 2.74;
    const mastHeight = mastTopY - mastBottomY;
    const mastGeo = new THREE.CylinderGeometry(0.042, 0.064, mastHeight, 28);
    const mast = new THREE.Mesh(mastGeo, steelMat);
    mast.position.set(poleX, mastBottomY + mastHeight / 2, 0);
    mast.castShadow = !this.isSoftwareGl;
    mast.receiveShadow = !this.isSoftwareGl;
    poleGroup.add(mast);
    this.disposables.push(mastGeo);

    // 4. Ornamental Golden Lotus & Spear Finial at the Summit
    const finialPoints = [
      new THREE.Vector2(0, 0),
      new THREE.Vector2(0.068, 0),
      new THREE.Vector2(0.055, 0.045),
      new THREE.Vector2(0.11, 0.11),
      new THREE.Vector2(0.115, 0.17),
      new THREE.Vector2(0.05, 0.24),
      new THREE.Vector2(0.062, 0.27),
      new THREE.Vector2(0.026, 0.34),
      new THREE.Vector2(0.0, 0.46),
    ];
    const finialGeo = new THREE.LatheGeometry(finialPoints, 32);
    const finial = new THREE.Mesh(finialGeo, brassMat);
    finial.position.set(poleX, mastTopY, 0);
    finial.castShadow = !this.isSoftwareGl;
    poleGroup.add(finial);
    this.disposables.push(finialGeo);

    // 5. Upper & Lower Brass Mounting Rings + Grommet Clips anchoring hoist at x = -2.0
    const ringGeo = new THREE.TorusGeometry(0.058, 0.011, 14, 32);
    const clipGeo = new THREE.CylinderGeometry(0.011, 0.011, 0.04, 12);
    this.disposables.push(ringGeo, clipGeo);

    const ringHeights = [2.42, 0.54];
    for (const ry of ringHeights) {
      const ring = new THREE.Mesh(ringGeo, brassMat);
      ring.rotation.x = Math.PI / 2;
      ring.position.set(poleX, ry, 0);
      poleGroup.add(ring);

      const clip = new THREE.Mesh(clipGeo, brassMat);
      clip.rotation.z = Math.PI / 2;
      clip.position.set(poleX + 0.052, ry, 0);
      poleGroup.add(clip);
    }

    // 6. Halyard Cord running along hoist side & Brass Cleat
    const ropeHeight = mastTopY - (groundY + 1.15);
    const ropeGeo = new THREE.CylinderGeometry(0.007, 0.007, ropeHeight, 8);
    const rope = new THREE.Mesh(ropeGeo, ropeMat);
    rope.position.set(poleX + 0.056, groundY + 1.15 + ropeHeight / 2, 0.012);
    poleGroup.add(rope);

    const cleatGeo = new THREE.BoxGeometry(0.025, 0.14, 0.028);
    const cleat = new THREE.Mesh(cleatGeo, brassMat);
    cleat.position.set(poleX + 0.062, groundY + 1.15, 0.012);
    poleGroup.add(cleat);
    this.disposables.push(ropeGeo, cleatGeo);

    this.scene.add(poleGroup);
  }

  private updateClothGeometry(time: number): void {
    const pos = this.flagGeometry.attributes.position as THREE.BufferAttribute;
    const arr = pos.array as Float32Array;
    const base = this.basePositions;

    // Wind scaling affects wave amplitude, frequency, and fabric lift
    const wind = this.state.windSpeed;
    const ampScale = 0.16 + wind * 0.14;
    const droopAmount = Math.max(0.02, 0.26 - wind * 0.1);
    const speedFactor = 2.1 + wind * 1.45;

    for (let i = 0; i < pos.count; i++) {
      const idx = i * 3;
      const bx = base[idx]; // -2.0 to +2.0
      const by = base[idx + 1]; // -1.0 to +1.0

      // Normalized distance from anchored hoist edge (0 at pole, 1 at fly tip)
      const u = (bx + 2.0) * 0.25;
      const v = (by + 1.0) * 0.5;

      // Envelope smoothly clamps u=0 firmly to the flagpole rings
      const envelope = Math.pow(u, 1.15);

      // Multi-harmonic traveling cloth waves + diagonal cross-ripple + tail flutter
      const primaryWave = Math.sin(u * 6.4 - time * speedFactor + v * 1.15) * ampScale;
      const secondaryRipple = Math.sin(u * 12.2 - time * (speedFactor * 1.55) - v * 2.4) * (ampScale * 0.28);
      const tailFlutter =
        Math.sin(u * 19.0 - time * (speedFactor * 2.2) + v * 4.0) * (ampScale * 0.11 * u * u);

      const waveZ = (primaryWave + secondaryRipple + tailFlutter) * envelope;

      // Subtle vertical billowing & gravity droop (cloth hangs lower in calm wind)
      const verticalRipple = Math.cos(u * 5.2 - time * speedFactor * 0.9) * (0.035 * wind * envelope);
      const sagY = -droopAmount * Math.pow(u, 1.55);

      // Slight horizontal foreshortening when cloth waves deeply so fabric never stretches unnaturally
      const foreshortenX = -Math.abs(waveZ) * 0.11 * u;

      arr[idx] = bx + foreshortenX;
      arr[idx + 1] = by + sagY + verticalRipple;
      arr[idx + 2] = waveZ;
    }

    pos.needsUpdate = true;
    this.flagGeometry.computeVertexNormals();
  }

  public updateState(partial: Partial<FlagSimulationState>): void {
    const prevFabric = this.state.fabricPreset;
    const prevSky = this.state.skyPreset;
    Object.assign(this.state, partial);

    if (partial.fabricPreset && partial.fabricPreset !== prevFabric) {
      const isSilk = partial.fabricPreset === 'silk';
      this.flagMaterial.roughness = isSilk ? 0.42 : 0.84;
      this.flagMaterial.sheen = isSilk ? 0.85 : 0.35;
      this.flagMaterial.sheenRoughness = isSilk ? 0.42 : 0.78;
      this.flagMaterial.bumpScale = isSilk ? 0.008 : 0.022;
      this.flagMaterial.needsUpdate = true;
    }

    if (partial.skyPreset && partial.skyPreset !== prevSky) {
      this.targetSkyPreset = partial.skyPreset;
      const theme = SKY_THEMES[partial.skyPreset];
      this.keyLight.position.set(...theme.keyPos);
    }
  }

  public setCameraPreset(preset: CameraPreset): void {
    const target = CAMERA_PRESETS[preset];
    this.desiredCamPos.set(...target.pos);
    this.desiredCtrlTarget.set(...target.target);
    this.cameraTransitionActive = true;
  }

  private applySmoothEnvironmentTransition(dt: number): void {
    const target = SKY_THEMES[this.targetSkyPreset];
    const lambda = 4.5;
    const alpha = 1 - Math.exp(-lambda * dt);

    _tempColorA.setHex(target.zenith);
    (this.skyMaterial.uniforms.uZenith.value as THREE.Color).lerp(_tempColorA, alpha);

    _tempColorB.setHex(target.horizon);
    (this.skyMaterial.uniforms.uHorizon.value as THREE.Color).lerp(_tempColorB, alpha);

    _tempColorA.setHex(target.fog);
    this.fog.color.lerp(_tempColorA, alpha);
    this.fog.density = THREE.MathUtils.damp(this.fog.density, target.fogDensity, lambda, dt);

    _tempColorA.setHex(target.keyColor);
    this.keyLight.color.lerp(_tempColorA, alpha);
    this.keyLight.intensity = THREE.MathUtils.damp(this.keyLight.intensity, target.keyIntensity, lambda, dt);

    _tempColorA.setHex(target.hemiSky);
    this.hemiLight.color.lerp(_tempColorA, alpha);
    _tempColorB.setHex(target.hemiGround);
    this.hemiLight.groundColor.lerp(_tempColorB, alpha);
    this.hemiLight.intensity = THREE.MathUtils.damp(this.hemiLight.intensity, target.hemiIntensity, lambda, dt);

    _tempColorA.setHex(target.rimColor);
    this.rimLight.color.lerp(_tempColorA, alpha);
    this.rimLight.intensity = THREE.MathUtils.damp(this.rimLight.intensity, target.rimIntensity, lambda, dt);

    _tempColorA.setHex(target.groundColor);
    this.groundMaterial.color.lerp(_tempColorA, alpha);

    this.renderer.toneMappingExposure = THREE.MathUtils.damp(
      this.renderer.toneMappingExposure,
      target.exposure,
      lambda,
      dt
    );
  }

  private tick = (now: number): void => {
    if (this.disposed) return;

    const dt = Math.min((now - this.lastTimestamp) / 1000, 0.05);
    this.lastTimestamp = now;

    if (this.state.isPlaying && !this.state.reducedMotion) {
      this.elapsedTime += dt;
      this.updateClothGeometry(this.elapsedTime);
    }

    if (this.cameraTransitionActive) {
      const k = 6.0;
      this.camera.position.x = THREE.MathUtils.damp(this.camera.position.x, this.desiredCamPos.x, k, dt);
      this.camera.position.y = THREE.MathUtils.damp(this.camera.position.y, this.desiredCamPos.y, k, dt);
      this.camera.position.z = THREE.MathUtils.damp(this.camera.position.z, this.desiredCamPos.z, k, dt);

      this.controls.target.x = THREE.MathUtils.damp(this.controls.target.x, this.desiredCtrlTarget.x, k, dt);
      this.controls.target.y = THREE.MathUtils.damp(this.controls.target.y, this.desiredCtrlTarget.y, k, dt);
      this.controls.target.z = THREE.MathUtils.damp(this.controls.target.z, this.desiredCtrlTarget.z, k, dt);

      _targetCamPos.copy(this.desiredCamPos);
      _targetCtrlTarget.copy(this.desiredCtrlTarget);
      if (
        this.camera.position.distanceTo(_targetCamPos) < 0.01 &&
        this.controls.target.distanceTo(_targetCtrlTarget) < 0.01
      ) {
        this.cameraTransitionActive = false;
      }
    }

    this.applySmoothEnvironmentTransition(dt);
    this.controls.update();
    this.renderer.render(this.scene, this.camera);

    if (this.isSoftwareGl) {
      this.afterDraw(() => this.tick(performance.now()));
    } else {
      this.frameId = requestAnimationFrame(this.tick);
    }
  };

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (!gl || typeof gl.fenceSync !== 'function') {
      this.frameId = window.setTimeout(cb, 80);
      return;
    }
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (this.disposed) {
        if (sync) gl.deleteSync(sync);
        return;
      }
      const status = sync ? gl.getSyncParameter(sync, gl.SYNC_STATUS) : gl.SIGNALED;
      if (status === gl.UNSIGNALED) {
        this.frameId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        this.frameId = window.setTimeout(cb, 80);
      }
    };
    this.frameId = window.setTimeout(poll, 5);
  }

  private handleResize = (): void => {
    if (this.disposed) return;
    const width = this.container.clientWidth || window.innerWidth;
    const height = this.container.clientHeight || window.innerHeight;
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(width, height);
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
  };

  private handleContextLost = (e: Event): void => {
    e.preventDefault();
    this.onContextLostCb?.(true);
  };

  private handleContextRestored = (): void => {
    this.onContextLostCb?.(false);
  };

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    window.removeEventListener('resize', this.handleResize);
    this.renderer.domElement.removeEventListener('webglcontextlost', this.handleContextLost);
    this.renderer.domElement.removeEventListener('webglcontextrestored', this.handleContextRestored);
    this.controls.dispose();

    for (const item of this.disposables) {
      item.dispose();
    }
    this.disposables = [];

    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
