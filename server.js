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

/**
 * Extrae el objeto JSON del chunk 0 de un archivo GLB.
 * Estructura GLB:
 *   Bytes  0-11 : header (magic 'glTF', version uint32, totalLength uint32)
 *   Bytes 12-15 : longitud del chunk JSON (uint32 LE)
 *   Bytes 16-19 : tipo del chunk (0x4E4F534A = 'JSON')
 *   Bytes 20... : contenido JSON (padded a múltiplo de 4 con espacios)
 */
function leerGlb(buffer) {
  const magic = buffer.readUInt32LE(0);
  if (magic !== 0x46546C67) throw new Error('El archivo no es un GLB válido.');
  const jsonLen = buffer.readUInt32LE(12);
  const json    = JSON.parse(buffer.slice(20, 20 + jsonLen).toString('utf8'));
  return { json };
}

/**
 * Reconstruye el GLB original con un JSON de chunk modificado.
 * Preserva intacto el chunk BIN (geometría binaria) si existe.
 */
function escribirGlb(glbOriginal, jsonModificado) {
  // Serializar y paddear el nuevo JSON a múltiplo de 4 (relleno con espacios 0x20)
  const jsonStr    = JSON.stringify(jsonModificado);
  const jsonBytes  = Buffer.from(jsonStr, 'utf8');
  const jsonPadded = Math.ceil(jsonBytes.length / 4) * 4;
  const jsonChunk  = Buffer.alloc(jsonPadded, 0x20); // 0x20 = espacio
  jsonBytes.copy(jsonChunk);

  // Longitud del chunk JSON original (para saber dónde empieza el chunk BIN)
  const jsonLenOrig = glbOriginal.readUInt32LE(12);
  const binStart    = 20 + jsonLenOrig;

  // Chunk BIN original (puede no existir)
  const binChunk = binStart < glbOriginal.length
    ? glbOriginal.slice(binStart)
    : Buffer.alloc(0);

  // Cabecera del chunk JSON (8 bytes: length + type)
  const jsonChunkHeader = Buffer.alloc(8);
  jsonChunkHeader.writeUInt32LE(jsonPadded, 0);
  jsonChunkHeader.writeUInt32LE(0x4E4F534A, 4); // 'JSON'

  // Nuevo header GLB (12 bytes)
  const totalLength = 12 + 8 + jsonPadded + binChunk.length;
  const header = Buffer.alloc(12);
  header.writeUInt32LE(0x46546C67, 0); // magic 'glTF'
  header.writeUInt32LE(2, 4);           // version 2
  header.writeUInt32LE(totalLength, 8);

  return Buffer.concat([header, jsonChunkHeader, jsonChunk, binChunk]);
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
      El archivo .glb modificado se adjunta a este correo.
    </p>
  `;
}

// --- Endpoint ---

app.post('/api/enviar-pedido', async (req, res) => {
  const { colorHex, texto, nombreCliente, emailCliente, fechaPedido } = req.body;

  if (!nombreCliente || !emailCliente || !colorHex) {
    return res.status(400).json({ ok: false, error: 'Faltan campos obligatorios.' });
  }

  const glbPath = path.join(__dirname, 'public', 'assets', 'modelo.glb');
  const tmpPath = path.join('/tmp', `pedido_${Date.now()}.glb`);

  try {
    // 1. Leer el GLB como Buffer binario y extraer su JSON
    const glbBuffer = fs.readFileSync(glbPath);
    const { json: gltf } = leerGlb(glbBuffer);

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

    // 4. Reconstruir el GLB con el JSON modificado y escribir temporal
    const glbModificado = escribirGlb(glbBuffer, gltf);
    fs.writeFileSync(tmpPath, glbModificado);

    // 5. Enviar email
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });

    await transporter.sendMail({
      from:    `"Pedidos 3D" <${process.env.EMAIL_USER}>`,
      to:      process.env.EMAIL_DESTINO,
      subject: `Nuevo pedido de ${nombreCliente}`,
      html:    buildHtml({ colorHex, texto, nombreCliente, emailCliente, fechaPedido }),
      attachments: [
        {
          filename: `pedido_${nombreCliente.replace(/\s+/g, '_')}.glb`,
          path:     tmpPath,
        },
      ],
    });

    // 6. Borrar archivo temporal
    fs.unlinkSync(tmpPath);

    // 7. Responder éxito
    res.json({ ok: true });

  } catch (err) {
    if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
    console.error('Error en /api/enviar-pedido:', err);
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.listen(PORT, () => {
  console.log(`Servidor corriendo en http://localhost:${PORT}`);
});
