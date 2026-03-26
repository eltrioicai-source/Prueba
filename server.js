require('dotenv').config();
const express    = require('express');
const nodemailer = require('nodemailer');
const fs         = require('fs');
const path       = require('path');

const app  = express();
const PORT = process.env.PORT || 3000;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// --- Utilidades ---

/** Convierte un color hex (#rrggbb) a array RGBA normalizado [0-1]. */
function hexToRgba(hex) {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16) / 255,
    parseInt(h.slice(2, 4), 16) / 255,
    parseInt(h.slice(4, 6), 16) / 255,
    1.0,
  ];
}

/** Cuerpo HTML del email. */
function buildHtml({ colorHex, texto, nombreCliente, emailCliente, fechaPedido }) {
  const fecha = new Date(fechaPedido).toLocaleString('es-ES', { timeZone: 'Europe/Madrid' });
  return `
    <h2 style="font-family:Arial,sans-serif">Nuevo pedido de personalización 3D</h2>
    <table style="font-family:Arial,sans-serif;border-collapse:collapse">
      <tr><td style="padding:6px 12px;font-weight:bold">Cliente</td><td style="padding:6px 12px">${nombreCliente}</td></tr>
      <tr><td style="padding:6px 12px;font-weight:bold">Email</td><td style="padding:6px 12px">${emailCliente}</td></tr>
      <tr><td style="padding:6px 12px;font-weight:bold">Color</td>
          <td style="padding:6px 12px">
            <span style="display:inline-block;width:16px;height:16px;background:${colorHex};border:1px solid #ccc;vertical-align:middle;margin-right:6px"></span>
            ${colorHex}
          </td>
      </tr>
      <tr><td style="padding:6px 12px;font-weight:bold">Texto</td><td style="padding:6px 12px">${texto || '(sin texto)'}</td></tr>
      <tr><td style="padding:6px 12px;font-weight:bold">Fecha</td><td style="padding:6px 12px">${fecha}</td></tr>
    </table>
    <p style="font-family:Arial,sans-serif;margin-top:16px;color:#555">
      El archivo .gltf modificado se adjunta a este correo.
    </p>
  `;
}

// --- Endpoint ---

app.post('/api/enviar-pedido', async (req, res) => {
  const { colorHex, texto, nombreCliente, emailCliente, fechaPedido } = req.body;

  if (!nombreCliente || !emailCliente || !colorHex) {
    return res.status(400).json({ ok: false, error: 'Faltan campos obligatorios.' });
  }

  const gltfPath = path.join(__dirname, 'public', 'assets', 'modelo.gltf');
  const tmpPath  = path.join('/tmp', `pedido_${Date.now()}.gltf`);

  try {
    // 1. Leer el GLTF
    const gltfRaw = fs.readFileSync(gltfPath, 'utf8');
    const gltf    = JSON.parse(gltfRaw);

    // 2. Cambiar el color del primer material
    if (gltf.materials && gltf.materials.length > 0) {
      if (!gltf.materials[0].pbrMetallicRoughness) {
        gltf.materials[0].pbrMetallicRoughness = {};
      }
      gltf.materials[0].pbrMetallicRoughness.baseColorFactor = hexToRgba(colorHex);
    }

    // 3. Guardar extras en gltf.asset
    if (!gltf.asset) gltf.asset = {};
    gltf.asset.extras = {
      textoPersonalizado: texto || '',
      cliente:            nombreCliente,
      fecha:              fechaPedido,
    };

    // 4. Escribir archivo temporal
    fs.writeFileSync(tmpPath, JSON.stringify(gltf, null, 2), 'utf8');

    // 5. Enviar email
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASS,
      },
    });

    await transporter.sendMail({
      from:    `"Pedidos 3D" <${process.env.GMAIL_USER}>`,
      to:      process.env.DESTINATARIO_EMAIL,
      subject: `Nuevo pedido de ${nombreCliente}`,
      html:    buildHtml({ colorHex, texto, nombreCliente, emailCliente, fechaPedido }),
      attachments: [
        {
          filename: `pedido_${nombreCliente.replace(/\s+/g, '_')}.gltf`,
          path:     tmpPath,
        },
      ],
    });

    // 6. Borrar archivo temporal
    fs.unlinkSync(tmpPath);

    // 7. Responder éxito
    res.json({ ok: true });

  } catch (err) {
    // Limpiar temporal si quedó a medias
    if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    console.error('Error en /api/enviar-pedido:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
