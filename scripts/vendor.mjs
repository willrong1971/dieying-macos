import { mkdir, copyFile } from 'node:fs/promises';
const files = ['build/three.module.js','build/three.core.js','examples/jsm/loaders/GLTFLoader.js','examples/jsm/controls/OrbitControls.js','examples/jsm/environments/RoomEnvironment.js','examples/jsm/utils/BufferGeometryUtils.js','examples/jsm/utils/SkeletonUtils.js','LICENSE'];
for (const file of files) {
  const dest = new URL('../vendor/three/'+file, import.meta.url);
  await mkdir(new URL('.',dest), {recursive:true});
  await copyFile(new URL('../node_modules/three/'+file,import.meta.url),dest);
}
console.log('Local Three.js runtime ready.');
