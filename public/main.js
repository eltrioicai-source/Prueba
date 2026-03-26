// Variables globales
let colorActual = '#e74c3c';
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
let modeloMesh = null;

loader.load(
  '/assets/modelo.glb',
  (gltf) => {
    scene.add(gltf.scene);

    let primero = null;
    gltf.scene.traverse((obj) => {
      if (obj.isMesh) {
        if (!primero) primero = obj;
        if (obj.name === 'Bloque') modeloMesh = obj;
      }
    });
    if (!modeloMesh) modeloMesh = primero;

    aplicarColor(colorActual);
  },
  undefined,
  (err) => console.error('Error cargando modelo.glb:', err)
);

// --- Funciones ---

function aplicarColor(hex) {
  colorActual = hex;

  // Sincronizar el input de color libre con el color activo
  const colorLibre = document.getElementById('color-libre');
  if (colorLibre) colorLibre.value = hex;

  // Marcar el botón activo
  document.querySelectorAll('.color-btn').forEach((btn) => {
    btn.classList.toggle('activo', btn.dataset.color === hex);
  });

  if (!modeloMesh) return;
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
  if (fuente) preview.style.fontFamily = fuente;
  if (estilo) preview.style.fontStyle  = estilo;
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

// --- Eventos: colores predefinidos ---
document.querySelectorAll('.color-btn').forEach((btn) => {
  btn.addEventListener('click', () => aplicarColor(btn.dataset.color));
});

document.getElementById('color-libre').addEventListener('input', (e) => {
  // Quitar activo de botones predefinidos al usar color libre
  document.querySelectorAll('.color-btn').forEach((b) => b.classList.remove('activo'));
  aplicarColor(e.target.value);
});

// Seleccionar el primer color por defecto
aplicarColor(colorActual);

// --- Eventos: texto ---
const textoInput   = document.getElementById('texto-input');
const charCount    = document.getElementById('char-count');
const fuenteSelect = document.getElementById('fuente-select');
const estiloSelect = document.getElementById('estilo-select');

textoInput.addEventListener('input', () => {
  charCount.textContent = textoInput.value.length;
  actualizarTexto(textoInput.value, fuenteSelect.value, estiloSelect.value);
});

fuenteSelect.addEventListener('change', () => {
  actualizarTexto(textoInput.value, fuenteSelect.value, estiloSelect.value);
});

estiloSelect.addEventListener('change', () => {
  actualizarTexto(textoInput.value, fuenteSelect.value, estiloSelect.value);
});

// --- Envío del pedido ---
document.getElementById('btn-enviar').addEventListener('click', async () => {
  const nombre = document.getElementById('nombre-cliente').value.trim();
  const email  = document.getElementById('email-cliente').value.trim();
  const feedback = document.getElementById('mensaje-feedback');
  const spinner  = document.getElementById('spinner');

  // Validación
  if (!nombre || !email) {
    mostrarFeedback('Por favor, rellena tu nombre y email.', 'error');
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    mostrarFeedback('El email no tiene un formato válido.', 'error');
    return;
  }

  // Mostrar spinner
  spinner.classList.remove('hidden');
  feedback.classList.add('hidden');
  document.getElementById('btn-enviar').disabled = true;

  try {
    const res = await fetch('/api/enviar-pedido', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        colorHex:      colorActual,
        texto:         textoActual,
        nombreCliente: nombre,
        emailCliente:  email,
        fechaPedido:   new Date().toISOString(),
      }),
    });

    if (res.ok) {
      mostrarFeedback('¡Pedido enviado con éxito! Revisa tu correo.', 'exito');
    } else {
      const data = await res.json().catch(() => ({}));
      mostrarFeedback(data.mensaje || 'Error del servidor. Inténtalo de nuevo.', 'error');
    }
  } catch {
    mostrarFeedback('No se pudo conectar con el servidor.', 'error');
  } finally {
    spinner.classList.add('hidden');
    document.getElementById('btn-enviar').disabled = false;
  }
});

function mostrarFeedback(texto, tipo) {
  const el = document.getElementById('mensaje-feedback');
  el.textContent = texto;
  el.className = `mensaje-feedback ${tipo}`;
}
