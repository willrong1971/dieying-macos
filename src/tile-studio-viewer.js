import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
import {RoomEnvironment} from 'three/addons/environments/RoomEnvironment.js';

function disposeModels(root) {
  if (!root) return;
  const geometries = new Set();
  const materials = new Set();
  const textures = new Set();
  root.traverse(object => {
    if (!object.isMesh) return;
    geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    }
  });
  geometries.forEach(item => item.dispose());
  materials.forEach(item => item.dispose());
  textures.forEach(item => item.dispose());
}

const poses = {
  reset: [.3, .18, 1],
  front: [0, 0, 1],
  back: [-.22, .1, -1],
  relief: [.55, .25, 1],
};

// Inspection keeps the exported geometry at its original size in metres.
export class TileStudioViewer {
  constructor({canvas, stage, onState, onCustomView}) {
    this.canvas = canvas;
    this.stage = stage;
    this.onState = onState;
    this.onCustomView = onCustomView;
    this.frame = 0;
    this.generation = 0;
    this.state = 'idle';
    this.visible = false;
    this.ids = [];
    this.direction = 'reset';
    this.camera = new THREE.PerspectiveCamera(34, 1, .003, 2);
    this.scene = new THREE.Scene();
    this.models = new THREE.Group();
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      alpha: true,
      antialias: true,
      preserveDrawingBuffer: globalThis.__dieyingNativeApp === true,
    });
    this.renderer.setClearColor(0x000000, 0);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio || 1, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const room = new RoomEnvironment();
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.environment = pmrem.fromScene(room, .035, .1, 100);
    this.scene.environment = this.environment.texture;
    this.scene.environmentIntensity = .86;
    this.scene.environmentRotation.set(.12, .34, -.20);
    room.dispose();
    pmrem.dispose();

    const key = new THREE.DirectionalLight(0xffeed2, 2.1);
    key.position.set(-.12, .16, .19);
    key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048);
    Object.assign(key.shadow.camera, {left: -.085, right: .085, top: .07, bottom: -.07, near: .01, far: .6});
    key.shadow.bias = -.00002;
    key.shadow.normalBias = .000018;
    this.key = key;
    const fill = new THREE.DirectionalLight(0xe8f4ff, .38);
    fill.position.set(.16, .09, .12);
    this.fill = fill;
    const floor = new THREE.Mesh(new THREE.PlaneGeometry(.45, .45), new THREE.ShadowMaterial({opacity: .23, color: 0x081b15}));
    floor.rotation.x = -Math.PI / 2;
    floor.position.y = -.0203;
    floor.receiveShadow = true;
    this.floor = floor;
    this.scene.add(key, fill, floor, this.models);

    this.controls = new OrbitControls(this.camera, canvas);
    this.controls.enableDamping = false;
    this.controls.enablePan = false;
    this.controls.rotateSpeed = .65;
    this.controls.zoomSpeed = .72;
    this.controls.minPolarAngle = .1;
    this.controls.maxPolarAngle = Math.PI * .499;
    this.controls.addEventListener('change', () => this.requestRender());
    this.controls.addEventListener('start', () => this.onCustomView());
    this.observer = new ResizeObserver(() => this.resize());
    this.observer.observe(stage);
    this.onContextLost = event => {
      event.preventDefault();
      this.generation++;
      this.changeState('lost');
      this.canvas.hidden = true;
    };
    canvas.addEventListener('webglcontextlost', this.onContextLost);
  }

  changeState(state, progress) {
    this.state = state;
    this.onState(state, progress);
  }

  setVisible(visible) {
    this.visible = visible;
    this.canvas.hidden = !visible || !this.library || this.state === 'lost';
    if (visible) {
      this.resize();
      this.requestRender();
    }
  }

  resize() {
    if (!this.visible || this.state === 'lost') return;
    const {width, height} = this.stage.getBoundingClientRect();
    if (!width || !height || (width === this.width && height === this.height)) return;
    this.width = width;
    this.height = height;
    this.renderer.setSize(width, height, false);
    this.camera.aspect = width / height;
    this.camera.updateProjectionMatrix();
    this.setView(this.direction);
  }

  requestRender() {
    if (this.frame || !this.visible || !this.library || this.state === 'lost') return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      if (!this.visible || !this.library || this.state === 'lost') return;
      this.renderer.render(this.scene, this.camera);
      if (this.state !== 'ready') this.changeState('ready');
    });
  }

  setFaces(ids) {
    if (this.ids.length === ids.length && this.ids.every((id, index) => id === ids[index])) return;
    this.ids = ids;
    this.mountFaces();
  }

  mountFaces() {
    this.models.clear();
    if (!this.library) return;
    this.ids.forEach((id, index) => {
      const tile = this.library.get(id).clone(true);
      tile.position.set((index - (this.ids.length - 1) / 2) * .043, 0, 0);
      // glTF is Y-up. Rotate the face from +Y towards the viewer (+Z).
      tile.rotation.set(Math.PI / 2, 0, 0);
      tile.traverse(object => {
        if (object.isMesh) {
          object.castShadow = true;
          object.receiveShadow = true;
        }
      });
      this.models.add(tile);
    });
    this.setView(this.direction);
  }

  async loadTheme(theme, faceIds) {
    if (this.state === 'lost' || (this.theme === theme && ['loading', 'ready'].includes(this.state))) return;
    const token = ++this.generation;
    this.theme = theme;
    this.canvas.hidden = true;
    this.changeState('loading');
    this.models.clear();
    disposeModels(this.source);
    this.source = null;
    this.library = null;
    const url = new URL('../exports/v2/game/mahjong_42_' + theme + '_lod1.glb', import.meta.url);
    try {
      const gltf = await new GLTFLoader().loadAsync(url.href, event => {
        if (token === this.generation && event.total > 0) {
          this.onState('loading', Math.floor(event.loaded / event.total * 100));
        }
      });
      if (token !== this.generation) {
        disposeModels(gltf.scene);
        return;
      }
      const library = new Map();
      gltf.scene.traverse(object => {
        if (!object.isMesh && object.children.length && object.userData.tile_id) library.set(object.userData.tile_id, object);
      });
      if (faceIds.some(id => !library.has(id))) {
        disposeModels(gltf.scene);
        throw new Error('Incomplete tile library');
      }
      this.source = gltf.scene;
      this.library = library;
      this.canvas.hidden = !this.visible;
      this.mountFaces();
    } catch (error) {
      if (token !== this.generation) return;
      this.changeState('error');
      console.error('Tile studio models:', error);
    }
  }

  setView(direction) {
    this.direction = direction;
    const detail = direction === 'relief';
    const wide = this.ids.length > 1;
    this.scene.environmentIntensity = detail ? .23 : .86;
    this.fill.intensity = detail ? .14 : .38;
    this.key.intensity = detail ? 2.8 : 2.1;
    this.key.position.set(...(detail ? [-.16, .065, .074] : [-.12, .16, .19]));
    const span = detail && !wide ? .043 : wide ? .13 : .047;
    Object.assign(this.key.shadow.camera, {left: -span, right: span, top: span, bottom: -span});
    this.key.shadow.camera.updateProjectionMatrix();
    const halfAngle = THREE.MathUtils.degToRad(this.camera.fov / 2);
    const fitHeight = detail && !wide ? .052 : .062;
    const fitWidth = wide ? .136 : .041;
    const distance = Math.max(fitHeight, fitWidth / this.camera.aspect) / (2 * Math.tan(halfAngle));
    this.controls.target.set(0, 0, 0);
    this.controls.minDistance = wide ? .075 : .039;
    this.controls.maxDistance = .72;
    this.camera.position.set(...poses[direction]).normalize().multiplyScalar(distance);
    this.controls.update();
    this.requestRender();
  }

  zoom(factor) {
    const distance = THREE.MathUtils.clamp(this.camera.position.length() * factor, this.controls.minDistance, this.controls.maxDistance);
    this.camera.position.setLength(distance);
    this.controls.update();
    this.onCustomView();
    this.requestRender();
  }

  rotate(azimuth, elevation) {
    const position = new THREE.Spherical().setFromVector3(this.camera.position);
    position.theta += azimuth;
    position.phi = THREE.MathUtils.clamp(position.phi + elevation, this.controls.minPolarAngle, this.controls.maxPolarAngle);
    this.camera.position.setFromSpherical(position);
    this.controls.update();
    this.onCustomView();
    this.requestRender();
  }

  dispose() {
    this.generation++;
    this.visible = false;
    cancelAnimationFrame(this.frame);
    this.observer.disconnect();
    this.canvas.removeEventListener('webglcontextlost', this.onContextLost);
    this.controls.dispose();
    this.models.clear();
    disposeModels(this.source);
    this.environment.dispose();
    this.floor.geometry.dispose();
    this.floor.material.dispose();
    this.key.shadow.dispose();
    this.renderer.dispose();
  }
}
