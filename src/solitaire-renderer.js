import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

const TILE_W = .029;
const TILE_H = .040;
const TILE_D = .020;
const PITCH_X = .02935;
const PITCH_Y = .04035;
const PITCH_Z = .0202;
const SELECT_W = .0338;
const SELECT_H = .0448;
const SELECT_LIFT = .0007;
const THEMES = new Set(['ivory', 'bamboo', 'porcelain']);

function disposeLibrary(root) {
  if (!root) return;
  const geometries = new Set(), materials = new Set(), textures = new Set();
  root.traverse(object => {
    if (object.geometry) geometries.add(object.geometry);
    for (const material of Array.isArray(object.material) ? object.material : [object.material]) {
      if (!material) continue;
      materials.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) textures.add(value);
    }
  });
  geometries.forEach(value => value.dispose());
  materials.forEach(value => value.dispose());
  textures.forEach(value => value.dispose());
}

function roundedRect(path, width, height, radius) {
  const x = -width / 2, y = -height / 2;
  path.moveTo(x + radius, y);
  path.lineTo(x + width - radius, y);
  path.quadraticCurveTo(x + width, y, x + width, y + radius);
  path.lineTo(x + width, y + height - radius);
  path.quadraticCurveTo(x + width, y + height, x + width - radius, y + height);
  path.lineTo(x + radius, y + height);
  path.quadraticCurveTo(x, y + height, x, y + height - radius);
  path.lineTo(x, y + radius);
  path.quadraticCurveTo(x, y, x + radius, y);
  return path;
}

function outlineGeometry() {
  const shape = roundedRect(new THREE.Shape(), .0304, .0414, .0027);
  shape.holes.push(roundedRect(new THREE.Path(), .0282, .0392, .0021));
  return new THREE.ShapeGeometry(shape, 5);
}

function selectionGeometry() {
  const shape = roundedRect(new THREE.Shape(), SELECT_W, SELECT_H, .0032);
  shape.holes.push(roundedRect(new THREE.Path(), .0282, .0392, .0021));
  return new THREE.ShapeGeometry(shape, 6);
}

/** Dedicated board, with repeated faces instanced rather than duplicated.
 * Geometry, engraving and PBR textures are the same assets as the tile studio.
 * Rendering is event driven: a paused or untouched board consumes no frames. */
export class SolitaireRenderer {
  constructor({ canvas, onTileClick = () => {}, onHover = () => {}, onStatus = () => {}, onViewChange = () => {} }) {
    this.canvas = canvas;
    this.onTileClick = onTileClick;
    this.onHover = onHover;
    this.onStatus = onStatus;
    this.onViewChange = onViewChange;
    this.tiles = [];
    this.entries = new Map();
    this.library = null;
    this.sourceScene = null;
    this.batches = new Map();
    this.frame = 0;
    this.token = 0;
    this.disposed = false;
    this.paused = false;
    this.zoom = 1;
    this.azimuth = 0;
    this.polar = Math.atan(.31);
    this.pan = new THREE.Vector2();
    this.originalTouchAction = canvas.style.touchAction;
    this.hovered = null;
    this.selected = null;
    this.selectionOutline = null;
    this.selectionGeometry = null;
    this.selectionMaterial = null;
    this.hints = new Set();
    this.free = new Set();
    this.showFree = false;
    this.layoutSignature = '';
    this.tileContentSignature = '';
    this.tileIdSignature = '';
    this.frameRemaining = false;
    this.framingTiles = null;
    this.origin = new THREE.Vector2();
    this.raycaster = new THREE.Raycaster();
    this.pointer = new THREE.Vector2();
    this.translation = new THREE.Matrix4();
    this.matrix = new THREE.Matrix4();
    this.scene = new THREE.Scene();
    this.board = new THREE.Group();
    this.scene.add(this.board);
    this.camera = new THREE.OrthographicCamera(-.3, .3, .2, -.2, .001, 5);
    this.camera.up.set(0, 0, 1);

    try {
      // Retain event-driven frames for WKWebView's native compositor.
      this.renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'high-performance', preserveDrawingBuffer: globalThis.__dieyingNativeApp === true });
      this.renderer.setPixelRatio(Math.min(globalThis.devicePixelRatio || 1, 2));
      this.renderer.setClearColor(0x000000, 0);
      this.renderer.outputColorSpace = THREE.SRGBColorSpace;
      this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
      this.renderer.toneMappingExposure = 1;
      this.renderer.shadowMap.enabled = true;
      this.renderer.shadowMap.type = THREE.PCFShadowMap;
      this.renderer.shadowMap.autoUpdate = false;

      const room = new RoomEnvironment(), pmrem = new THREE.PMREMGenerator(this.renderer);
      this.environment = pmrem.fromScene(room, .035, .1, 100);
      this.scene.environment = this.environment.texture;
      this.scene.environmentIntensity = .82;
      this.scene.environmentRotation.set(.12, .34, -.20);
      room.dispose();
      pmrem.dispose();
      this.scene.add(new THREE.HemisphereLight(0xfffcf5, 0x536d64, .30));
      const key = new THREE.DirectionalLight(0xfff5e7, 2);
      key.position.set(-.45, .65, 1.1);
      key.castShadow = true;
      key.shadow.mapSize.set(2048, 2048);
      Object.assign(key.shadow.camera, { left: -.55, right: .55, top: .55, bottom: -.55, near: .1, far: 3 });
      key.shadow.bias = -.00008;
      key.shadow.normalBias = .00013;
      key.shadow.radius = 2;
      this.scene.add(key);
      this.key = key;
      const fill = new THREE.DirectionalLight(0xe8f0ff, .48);
      fill.position.set(.6, -.3, .8);
      this.scene.add(fill);

      this.shadowGeometry = new THREE.PlaneGeometry(4, 4);
      this.shadowMaterial = new THREE.ShadowMaterial({ color: 0x071a13, opacity: .33 });
      this.shadowPlane = new THREE.Mesh(this.shadowGeometry, this.shadowMaterial);
      this.shadowPlane.position.z = -TILE_D / 2 - .00015;
      this.shadowPlane.receiveShadow = true;
      this.scene.add(this.shadowPlane);

      this.haloGeometry = outlineGeometry();
      this.haloMaterial = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: .90, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
      this.pickGeometry = new THREE.BoxGeometry(TILE_W, TILE_H, TILE_D);
      this.pickMaterial = new THREE.MeshBasicMaterial();
      this.bindEvents();
      this.observer = new ResizeObserver(() => this.resize());
      this.observer.observe(canvas.parentElement || canvas);
      this.resize();
    } catch (error) {
      this.renderer?.dispose();
      this.renderer = null;
      this.onStatus({ state: 'fallback', error });
    }
  }

  bindEvents() {
    this.handlers = {
      pointerdown: event => {
        if (![0, 1, 2].includes(event.button) || this.paused || this.down || event.isPrimary === false) return;
        const mode = event.shiftKey || event.button !== 0 ? 'pan' : 'orbit';
        const hitId = mode === 'orbit' ? this.pick(event.clientX, event.clientY) : null;
        // Selecting a tile tolerates natural click wobble; empty-table drags
        // remain responsive. Keep the press target even if release slips off it.
        const threshold = hitId !== null ? (event.pointerType === 'touch' ? 22 : 16) : 8;
        this.down = { x: event.clientX, y: event.clientY, lastX: event.clientX, lastY: event.clientY, id: event.pointerId, button: event.button, mode, hitId, threshold, dragging: false };
        if (mode === 'pan') event.preventDefault();
        this.canvas.setPointerCapture(event.pointerId);
      },
      pointerup: event => {
        const down = this.down;
        if (!down || event.pointerId !== down.id || (Number.isInteger(event.button) && event.button !== down.button)) return;
        this.releasePointer();
        if (down.mode !== 'orbit' || down.dragging || this.paused || Math.hypot(event.clientX - down.x, event.clientY - down.y) > down.threshold) return;
        const id = down.hitId ?? this.pick(event.clientX, event.clientY);
        // A genuine empty-table click clears selection; orbit/pan gestures
        // returned above and must never be mistaken for that cancellation.
        this.onTileClick(id);
      },
      pointermove: event => {
        const down = this.down;
        if (down?.id === event.pointerId && !this.paused) {
          const dxFromPress = event.clientX - down.x, dyFromPress = event.clientY - down.y;
          const distance = Math.hypot(dxFromPress, dyFromPress);
          if (!down.dragging && distance > down.threshold) {
            down.dragging = true;
            // Consume the dead zone once, instead of jumping the camera by
            // the entire tolerated click movement when rotation begins.
            down.lastX = down.x + dxFromPress / distance * down.threshold;
            down.lastY = down.y + dyFromPress / distance * down.threshold;
            this.setHover(null);
          }
          if (down.dragging) {
            event.preventDefault();
            const dx = event.clientX - down.lastX, dy = event.clientY - down.lastY;
            if (down.mode === 'pan') this.panBy(dx, dy);
            else this.orbitBy(dx, dy);
            down.lastX = event.clientX;
            down.lastY = event.clientY;
            this.updatePointerStyle();
            return;
          }
          // Leave the starting coordinates intact until the drag threshold.
          return;
        }
        if (event.pointerType === 'touch') return;
        this.setHover(this.paused ? null : this.pick(event.clientX, event.clientY));
      },
      pointerleave: () => {
        if (!this.down || !this.canvas.hasPointerCapture(this.down.id)) this.releasePointer();
        this.setHover(null);
      },
      pointercancel: event => {
        if (this.down?.id !== event.pointerId) return;
        this.releasePointer();this.setHover(null);
      },
      lostpointercapture: event => {
        if (this.down?.id !== event.pointerId || this.canvas.hasPointerCapture(event.pointerId)) return;
        this.down = null;this.updatePointerStyle();
      },
      contextmenu: event => event.preventDefault(),
      wheel: event => {
        if (this.paused) return;
        event.preventDefault();
        const modeScale = event.deltaMode === 1 ? 16 : event.deltaMode === 2 ? this.canvas.clientHeight : 1;
        const delta = THREE.MathUtils.clamp(event.deltaY * modeScale, -180, 180);
        this.zoomBy(Math.exp(-delta * .0016));
      },
      webglcontextlost: event => {
        event.preventDefault();
        this.onStatus({ state: 'fallback', error: new Error('WebGL context lost') });
      },
      webglcontextrestored: () => {
        if (this.library) this.onStatus({ state: 'ready', count: this.library.size });
        this.requestRender(true);
      },
    };
    for (const [event, handler] of Object.entries(this.handlers)) this.canvas.addEventListener(event, handler, event === 'wheel' ? { passive: false } : undefined);
    this.updatePointerStyle();
  }

  releasePointer() {
    const down = this.down;
    this.down = null;
    if (down && this.canvas.hasPointerCapture(down.id)) this.canvas.releasePointerCapture(down.id);
    this.updatePointerStyle();
  }

  updatePointerStyle() {
    this.canvas.style.touchAction = this.paused ? 'auto' : 'none';
    this.canvas.style.cursor = this.paused ? 'default' : this.down?.dragging ? 'grabbing' : this.hovered !== null && this.free.has(this.hovered) ? 'pointer' : 'grab';
  }

  async setMaterial(theme) {
    if (!THEMES.has(theme)) theme = 'ivory';
    if (!this.renderer || this.disposed) {
      this.onStatus({ state: 'fallback' });
      return;
    }
    if (this.theme === theme && this.library) {
      this.onStatus({ state: 'ready', count: this.library.size });
      return;
    }
    const token = ++this.token;
    this.onStatus({ state: 'loading', percent: 0 });
    try {
      const revision = theme === 'ivory' ? '20261027e' : '20261027d';
      const gltf = await new GLTFLoader().loadAsync(`/exports/v2/game/mahjong_42_${theme}_lod1.glb?art=${revision}`, event => {
        if (token === this.token && !this.disposed) this.onStatus({ state: 'loading', percent: event.total ? Math.round(event.loaded / event.total * 100) : 0 });
      });
      if (token !== this.token || this.disposed) { disposeLibrary(gltf.scene); return; }
      const library = new Map();
      gltf.scene.traverse(root => {
        if (!root.userData.tile_id || root.isMesh || !root.children.length) return;
        // Blender: face +Z, long axis +Y. glTF: face +Y, long axis -Z.
        // Rotate to our board: face +Z, long axis +Y; retain metres throughout.
        root.position.set(0, 0, 0);
        root.rotation.set(Math.PI / 2, 0, 0);
        root.scale.set(1, 1, 1);
        root.updateMatrixWorld(true);
        const meshes = [];
        root.traverse(mesh => {
          if (mesh.isMesh) meshes.push({ geometry: mesh.geometry, material: mesh.material, matrix: mesh.matrixWorld.clone() });
        });
        library.set(root.userData.tile_id, meshes);
      });
      if (library.size !== 42) { disposeLibrary(gltf.scene); throw new Error('Expected 42 complete traditional tile faces'); }
      this.clearBatches();
      disposeLibrary(this.sourceScene);
      this.sourceScene = gltf.scene;
      this.library = library;
      this.theme = theme;
      this.syncTiles();
      this.onStatus({ state: 'ready', count: library.size });
    } catch (error) {
      if (token !== this.token || this.disposed) return;
      this.onStatus({ state: 'fallback', error });
      console.error('Solitaire tile models:', error);
    }
  }

  setTiles(tiles, { frameRemaining = false } = {}) {
    const content = tiles.map(tile => `${tile.id}:${tile.face}:${tile.removed}:${tile.x},${tile.y},${tile.z}`).join('|');
    if (content === this.tileContentSignature && this.frameRemaining === !!frameRemaining) return;
    this.tileContentSignature = content;
    this.tiles = tiles.map(tile => ({ ...tile }));
    this.entries = new Map(this.tiles.map(tile => [tile.id, tile]));
    const signature = this.tiles.map(tile => `${tile.id}:${tile.x},${tile.y},${tile.z}`).join('|');
    const ids = this.tiles.map(tile => tile.id).join('|');
    const differentLayout = ids !== this.tileIdSignature;
    const reframe = signature !== this.layoutSignature || this.frameRemaining !== !!frameRemaining;
    if (reframe) {
      this.layoutSignature = signature;
      this.tileIdSignature = ids;
      this.frameRemaining = !!frameRemaining;
      // Recovered boards keep removed records for undo and inventory checks.
      // Only the surviving arrangement should determine its camera frame.
      // Cache this frame so later pair removals do not make the camera jump.
      this.framingTiles = this.tiles.filter(tile => !this.frameRemaining || !tile.removed).map(tile => ({ ...tile }));
      const xs = this.framingTiles.map(tile => tile.x), ys = this.framingTiles.map(tile => tile.y);
      this.origin.set(xs.length ? (Math.min(...xs) + Math.max(...xs)) / 2 : 0, ys.length ? (Math.min(...ys) + Math.max(...ys)) / 2 : 0);
      this.zoom = 1;
      if (differentLayout) {
        this.azimuth = 0;
        this.polar = Math.atan(.31);
      }
      this.pan.set(0, 0);
      this.updatePointerStyle();
    }
    this.syncTiles();
    if (reframe) this.fitView();
  }

  position(tile, vector = new THREE.Vector3()) {
    return vector.set((tile.x - this.origin.x) * PITCH_X, -(tile.y - this.origin.y) * PITCH_Y, tile.z * PITCH_Z);
  }

  clearBatches() {
    for (const meshes of this.batches.values()) for (const mesh of meshes) { this.board.remove(mesh); mesh.dispose(); }
    this.batches.clear();
  }

  syncTiles() {
    if (!this.renderer || !this.library || this.disposed) return;
    const byFace = new Map();
    for (const tile of this.tiles) {
      if (tile.removed) continue;
      if (!byFace.has(tile.face)) byFace.set(tile.face, []);
      byFace.get(tile.face).push(tile);
    }
    for (const [face, meshes] of this.batches) {
      if (!byFace.has(face)) for (const mesh of meshes) { mesh.count = 0; mesh.userData.solitaireIds = []; }
    }
    for (const [face, tiles] of byFace) {
      const descriptions = this.library.get(face);
      if (!descriptions) continue;
      let meshes = this.batches.get(face);
      if (!meshes || meshes[0].instanceMatrix.count < tiles.length) {
        if (meshes) for (const mesh of meshes) { this.board.remove(mesh); mesh.dispose(); }
        meshes = descriptions.map(description => {
          const mesh = new THREE.InstancedMesh(description.geometry, description.material, Math.max(4, tiles.length));
          mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
          mesh.castShadow = true;
          mesh.receiveShadow = true;
          mesh.userData.sourceTransform = description.matrix;
          this.board.add(mesh);
          return mesh;
        });
        this.batches.set(face, meshes);
      }
      for (const mesh of meshes) {
        mesh.count = tiles.length;
        mesh.userData.solitaireIds = tiles.map(tile => tile.id);
        tiles.forEach((tile, index) => {
          const position = this.position(tile);
          this.translation.makeTranslation(position.x, position.y, position.z);
          this.matrix.multiplyMatrices(this.translation, mesh.userData.sourceTransform);
          mesh.setMatrixAt(index, this.matrix);
        });
        mesh.instanceMatrix.needsUpdate = true;
        mesh.boundingSphere = null;
        mesh.boundingBox = null;
      }
    }
    const active = this.tiles.filter(tile => !tile.removed);
    if (!this.picking || this.picking.instanceMatrix.count < active.length) {
      this.picking?.dispose();
      this.picking = new THREE.InstancedMesh(this.pickGeometry, this.pickMaterial, Math.max(144, active.length));
    }
    this.picking.count = active.length;
    this.picking.userData.solitaireIds = active.map(tile => tile.id);
    active.forEach((tile, index) => {
      const position = this.position(tile);
      this.picking.setMatrixAt(index, this.translation.makeTranslation(position.x, position.y, position.z));
    });
    this.picking.instanceMatrix.needsUpdate = true;
    this.picking.boundingSphere = null;
    this.picking.boundingBox = null;
    this.picking.updateMatrixWorld(true);
    this.updateHighlights();
    this.requestRender(true);
  }

  setHighlights({ selected = null, hint = [], free = [], showFree = false } = {}) {
    this.selected = selected;
    this.hints = new Set(hint);
    this.free = new Set(free);
    this.showFree = showFree;
    this.updateHighlights();
  }

  updateHighlights() {
    if (!this.renderer) return;
    this.updateSelectedOutline();
    const highlighted = this.tiles.filter(tile => !tile.removed && (tile.id === this.selected || this.hints.has(tile.id) || tile.id === this.hovered || (this.showFree && this.free.has(tile.id))));
    if (!this.halos || this.halos.instanceMatrix.count < highlighted.length) {
      if (this.halos) { this.board.remove(this.halos); this.halos.dispose(); }
      this.halos = new THREE.InstancedMesh(this.haloGeometry, this.haloMaterial, Math.max(144, highlighted.length));
      this.halos.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      this.halos.renderOrder = 4;
      this.board.add(this.halos);
    }
    this.halos.count = highlighted.length;
    highlighted.forEach((tile, index) => {
      const position = this.position(tile);
      this.halos.setMatrixAt(index, this.translation.makeTranslation(position.x, position.y, position.z + TILE_D / 2 + .00035));
      const color = tile.id === this.selected ? 0xffd477 : this.hints.has(tile.id) ? 0x8fd3ff : tile.id === this.hovered ? (this.free.has(tile.id) ? 0xc3e0ed : 0xa6b8c2) : 0x84ae93;
      this.halos.setColorAt(index, new THREE.Color(color));
    });
    this.halos.instanceMatrix.needsUpdate = true;
    if (this.halos.instanceColor) this.halos.instanceColor.needsUpdate = true;
    this.halos.boundingSphere = null;
    this.halos.boundingBox = null;
    this.updatePointerStyle();
    this.requestRender();
  }

  updateSelectedOutline() {
    const tile = this.paused ? null : this.entries.get(this.selected);
    if (!tile || tile.removed) {
      if (this.selectionOutline) this.selectionOutline.visible = false;
      return;
    }
    if (!this.selectionOutline) {
      this.selectionGeometry = selectionGeometry();
      this.selectionMaterial = new THREE.MeshBasicMaterial({ color: 0xffd34f, transparent: false, opacity: 1, depthWrite: false, depthTest: false, side: THREE.DoubleSide, toneMapped: false });
      this.selectionOutline = new THREE.Mesh(this.selectionGeometry, this.selectionMaterial);
      this.selectionOutline.castShadow = false;
      this.selectionOutline.receiveShadow = false;
      this.selectionOutline.renderOrder = 7;
      this.board.add(this.selectionOutline);
    }
    this.selectionOutline.position.copy(this.position(tile));
    this.selectionOutline.position.z += TILE_D / 2 + SELECT_LIFT;
    this.selectionOutline.visible = true;
  }

  setHover(id) {
    if (id === this.hovered) return;
    this.hovered = id;
    this.onHover(id);
    this.updateHighlights();
  }

  pick(clientX, clientY) {
    if (!this.renderer || !this.picking || this.paused || !this.library) return null;
    const bounds = this.canvas.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return null;
    this.pointer.set((clientX - bounds.left) / bounds.width * 2 - 1, -(clientY - bounds.top) / bounds.height * 2 + 1);
    this.camera.updateMatrixWorld();
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObject(this.picking, false)[0];
    if (hit) return this.picking.userData.solitaireIds[hit.instanceId] ?? null;
    // The visible gold rim extends beyond the tile body. A press there is
    // still on the selected tile, rather than an empty-table orbit gesture.
    // Keep precise tile hits first so the rim never steals a neighbouring tile.
    const chosen = this.entries.get(this.selected);
    if (chosen && !chosen.removed && this.selectionOutline?.visible) {
      this.selectionOutline.updateMatrixWorld(true);
      if (this.raycaster.intersectObject(this.selectionOutline, false).length) return this.selected;
    }
    return null;
  }

  getTileScreenPosition(id) {
    const tile = this.entries.get(id);
    if (!tile || tile.removed) return null;
    const point = this.position(tile);
    point.z += TILE_D / 2;
    this.camera.updateMatrixWorld();
    point.project(this.camera);
    const bounds = this.canvas.getBoundingClientRect();
    return { x: bounds.left + (point.x + 1) * bounds.width / 2, y: bounds.top + (1 - point.y) * bounds.height / 2 };
  }

  getTileScreenBounds(id) {
    const tile = this.entries.get(id);
    if (!tile || tile.removed || this.paused || this.disposed) return null;
    const bounds = this.canvas.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return null;
    this.camera.updateMatrixWorld(true);
    const center = this.position(tile);
    let left = Infinity, top = Infinity, right = -Infinity, bottom = -Infinity;
    for (const x of [-SELECT_W / 2, SELECT_W / 2]) for (const y of [-SELECT_H / 2, SELECT_H / 2]) for (const z of [-TILE_D / 2, TILE_D / 2 + SELECT_LIFT]) {
      const point = center.clone().add(new THREE.Vector3(x, y, z)).project(this.camera);
      const clientX = bounds.left + (point.x + 1) * bounds.width / 2;
      const clientY = bounds.top + (1 - point.y) * bounds.height / 2;
      left = Math.min(left, clientX); right = Math.max(right, clientX);
      top = Math.min(top, clientY); bottom = Math.max(bottom, clientY);
    }
    return { x: left, y: top, left, top, right, bottom, width: right - left, height: bottom - top };
  }

  fitView() {
    if (!this.renderer) return;
    const bounds = this.canvas.getBoundingClientRect();
    if (bounds.width < 1 || bounds.height < 1) return;
    const box = new THREE.Box3();
    for (const tile of this.framingTiles ?? this.tiles) {
      const position = this.position(tile);
      box.expandByPoint(position.clone().add(new THREE.Vector3(-TILE_W / 2, -TILE_H / 2, -TILE_D / 2)));
      box.expandByPoint(position.clone().add(new THREE.Vector3(TILE_W / 2, TILE_H / 2, TILE_D / 2)));
    }
    if (box.isEmpty()) box.set(new THREE.Vector3(-.17, -.12, -.01), new THREE.Vector3(.17, .12, .01));
    const target = box.getCenter(new THREE.Vector3());
    const sinPolar = Math.sin(this.polar);
    this.camera.position.copy(target).add(new THREE.Vector3(
      sinPolar * Math.sin(this.azimuth), -sinPolar * Math.cos(this.azimuth), Math.cos(this.polar),
    ));
    this.camera.lookAt(target);
    this.camera.updateMatrixWorld(true);
    const view = this.camera.matrixWorldInverse;
    let halfWidth = .01, halfHeight = .01;
    for (const x of [box.min.x, box.max.x]) for (const y of [box.min.y, box.max.y]) for (const z of [box.min.z, box.max.z]) {
      const point = new THREE.Vector3(x, y, z).applyMatrix4(view);
      halfWidth = Math.max(halfWidth, Math.abs(point.x));
      halfHeight = Math.max(halfHeight, Math.abs(point.y));
    }
    const aspect = bounds.width / bounds.height;
    const height = Math.max(halfHeight, halfWidth / aspect) * 1.10 / this.zoom;
    Object.assign(this.camera, { left: -height * aspect, right: height * aspect, top: height, bottom: -height });
    this.camera.updateProjectionMatrix();
    const offset = new THREE.Vector3(this.pan.x, this.pan.y, 0).applyQuaternion(this.camera.quaternion);
    this.camera.position.add(offset);
    this.camera.updateMatrixWorld(true);
    this.onViewChange?.({ azimuth: this.azimuth, polar: this.polar, zoom: this.zoom });
    this.requestRender();
  }

  resize() {
    if (!this.renderer || this.disposed) return;
    const bounds = this.canvas.getBoundingClientRect();
    if (bounds.width < 1 || bounds.height < 1) return;
    this.renderer.setSize(bounds.width, bounds.height, false);
    this.fitView();
  }

  resetView() {
    this.releasePointer();
    this.zoom = 1;
    this.azimuth = 0;
    this.polar = Math.atan(.31);
    this.pan.set(0, 0);
    this.updatePointerStyle();
    this.fitView();
  }

  zoomBy(factor) {
    if (!Number.isFinite(factor) || factor <= 0) return;
    this.releasePointer();
    this.zoom = THREE.MathUtils.clamp(this.zoom * factor, .72, 3.25);
    if (this.zoom <= 1) this.pan.set(0, 0);
    this.updatePointerStyle();
    this.fitView();
  }

  orbitBy(dx, dy) {
    if (this.paused || !Number.isFinite(dx) || !Number.isFinite(dy)) return;
    const height = this.canvas.getBoundingClientRect().height;
    if (!height) return;
    const sensitivity = Math.PI * 2 * .65 / height;
    this.azimuth = THREE.MathUtils.euclideanModulo(this.azimuth - dx * sensitivity + Math.PI, Math.PI * 2) - Math.PI;
    this.polar = THREE.MathUtils.clamp(this.polar + dy * sensitivity, .08, 1.18);
    this.fitView();
  }

  panBy(dx, dy) {
    if (this.paused || !Number.isFinite(dx) || !Number.isFinite(dy)) return;
    const bounds = this.canvas.getBoundingClientRect();
    if (!bounds.width || !bounds.height) return;
    this.pan.x -= dx / bounds.width * (this.camera.right - this.camera.left);
    this.pan.y += dy / bounds.height * (this.camera.top - this.camera.bottom);
    this.fitView();
  }

  setPaused(paused) {
    const next = Boolean(paused);
    if (this.paused === next) return;
    this.paused = next;
    this.releasePointer();
    this.board.visible = !this.paused;
    this.shadowPlane && (this.shadowPlane.visible = !this.paused);
    this.updateSelectedOutline();
    if (this.paused) this.setHover(null);
    this.requestRender(true);
  }

  requestRender(shadows = false) {
    if (!this.renderer || this.disposed) return;
    if (shadows) this.renderer.shadowMap.needsUpdate = true;
    if (this.frame) return;
    this.frame = requestAnimationFrame(() => {
      this.frame = 0;
      if (!this.disposed) {
        this.renderer.render(this.scene, this.camera);
        if (globalThis.__dieyingNativeDiagnostics === true) this.reportNativeFrame();
      }
    });
  }

  // Native-only diagnostics read the default framebuffer before WebKit may
  // discard it after presentation. Ordinary browser builds never enter here.
  reportNativeFrame() {
    if (globalThis.__dieyingNativeDiagnostics !== true || !this.theme || !this.library) return;
    const send = value => globalThis.webkit?.messageHandlers?.gameLog?.postMessage(JSON.stringify(value));
    try {
      const gl = this.renderer.getContext();
      const bounds = this.canvas.getBoundingClientRect();
      const width = gl.drawingBufferWidth, height = gl.drawingBufferHeight;
      if (!width || !height || !bounds.width || !bounds.height) return;
      const key = `${this.theme}:${width}x${height}`;
      this.nativeFrameDiagnostics ||= new Set();
      if (this.nativeFrameDiagnostics.has(key)) return;
      this.nativeFrameDiagnostics.add(key);
      const drawError = gl.getError();
      const live = this.tiles.filter(tile => !tile.removed);
      const free = live.filter(tile => this.free.has(tile.id));
      const samples = (free.length ? free : live).slice(0, 5).map(tile => {
        const point = this.getTileScreenPosition(tile.id);
        if (!point) return { id: tile.id, error: 'no projected point' };
        const x = Math.max(0, Math.min(width - 1, Math.floor((point.x - bounds.left) / bounds.width * width)));
        const y = Math.max(0, Math.min(height - 1, Math.floor((bounds.bottom - point.y) / bounds.height * height)));
        const pixel = new Uint8Array(4);
        gl.readPixels(x, y, 1, 1, gl.RGBA, gl.UNSIGNED_BYTE, pixel);
        return { id: tile.id, x, y, rgba: [...pixel], error: gl.getError() };
      });
      send({
        type: 'native-render-frame', key, theme: this.theme,
        calls: this.renderer.info.render.calls, triangles: this.renderer.info.render.triangles,
        canvas: { width: this.canvas.width, height: this.canvas.height, cssWidth: bounds.width, cssHeight: bounds.height },
        drawingBuffer: { width, height }, contextLost: gl.isContextLost(), drawError,
        contextAttributes: gl.getContextAttributes(),
        paused: this.paused, boardVisible: this.board.visible, liveTiles: live.length,
        batches: this.batches.size, samples,
      });
    } catch (error) {
      send({ type: 'native-render-diagnostic-error', message: String(error?.message || error) });
    }
  }

  dispose() {
    if (this.disposed) return;
    this.disposed = true;
    this.token++;
    if (this.frame) cancelAnimationFrame(this.frame);
    this.observer?.disconnect();
    this.releasePointer();
    for (const [event, handler] of Object.entries(this.handlers || {})) this.canvas.removeEventListener(event, handler);
    this.canvas.style.touchAction = this.originalTouchAction;
    this.clearBatches();
    this.halos?.dispose();
    this.selectionOutline?.removeFromParent();
    this.selectionGeometry?.dispose();
    this.selectionMaterial?.dispose();
    this.picking?.dispose();
    disposeLibrary(this.sourceScene);
    this.haloGeometry?.dispose();
    this.haloMaterial?.dispose();
    this.pickGeometry?.dispose();
    this.pickMaterial?.dispose();
    this.shadowGeometry?.dispose();
    this.shadowMaterial?.dispose();
    this.environment?.dispose();
    this.renderer?.dispose();
  }
}
