// Variables globales
let colorActual = '#ff0000';
let textoActual = '';

// --- Escena Three.js ---
const canvas = document.getElementById('canvas3d');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(canvas.clientWidth, canvas.clientHeight);
renderer.setClearColor(0xf0f0f0);

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  45,
  canvas.clientWidth / canvas.clientHeight,
  0.01,
  100
);
camera.position.set(0, 0.05, 0.2);

// Iluminación
scene.add(new THREE.AmbientLight(0xffffff, 0.8));
const dirLight = new THREE.DirectionalLight(0xffffff, 1.2);
dirLight.position.set(1, 2, 2);
scene.add(dirLight);

// OrbitControls
const controls = new THREE_ADDONS.OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;

// Carga del modelo GLTF
const loader = new THREE_ADDONS.GLTFLoader();
let modeloMesh = null; // referencia al mesh objetivo

loader.load(
  '/assets/modelo.gltf',
  (gltf) => {
    scene.add(gltf.scene);

    // Buscar mesh llamado "Bloque"; si no, usar el primero que se encuentre
    let primero = null;
    gltf.scene.traverse((obj) => {
      if (obj.isMesh) {
        if (!primero) primero = obj;
        if (obj.name === 'Bloque') modeloMesh = obj;
      }
    });
    if (!modeloMesh) modeloMesh = primero;

    // Aplicar color inicial
    aplicarColor(colorActual);
  },
  undefined,
  (err) => console.error('Error cargando modelo.gltf:', err)
);

// --- Funciones públicas ---

function aplicarColor(hex) {
  colorActual = hex;
  if (!modeloMesh) return;

  // Si hay múltiples meshes con nombre "Bloque", recorremos todos
  scene.traverse((obj) => {
    if (obj.isMesh && (obj.name === 'Bloque' || obj === modeloMesh)) {
      if (Array.isArray(obj.material)) {
        obj.material.forEach((m) => m.color.set(hex));
      } else {
        obj.material.color.set(hex);
      }
    }
  });
}

function actualizarTexto(texto, fuente, estilo) {
  textoActual = texto;
  const preview = document.getElementById('texto-preview');
  if (!preview) return;
  preview.textContent = texto || '';
  if (fuente)  preview.style.fontFamily = fuente;
  if (estilo)  preview.style.fontStyle  = estilo;
}

// --- Loop de renderizado ---
function animate() {
  requestAnimationFrame(animate);
  controls.update();
  renderer.render(scene, camera);
}
animate();

// --- Responsive ---
window.addEventListener('resize', () => {
  const w = canvas.clientWidth;
  const h = canvas.clientHeight;
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
  renderer.setSize(w, h);
});

// --- Eventos del formulario ---
document.getElementById('color-picker')?.addEventListener('input', (e) => {
  aplicarColor(e.target.value);
});

document.getElementById('texto-input')?.addEventListener('input', (e) => {
  const fuente = document.getElementById('fuente-select')?.value;
  const estilo = document.getElementById('estilo-select')?.value;
  actualizarTexto(e.target.value, fuente, estilo);
});

document.getElementById('fuente-select')?.addEventListener('change', (e) => {
  const texto = document.getElementById('texto-input')?.value;
  const estilo = document.getElementById('estilo-select')?.value;
  actualizarTexto(texto, e.target.value, estilo);
});

document.getElementById('estilo-select')?.addEventListener('change', (e) => {
  const texto = document.getElementById('texto-input')?.value;
  const fuente = document.getElementById('fuente-select')?.value;
  actualizarTexto(texto, fuente, e.target.value);
});
