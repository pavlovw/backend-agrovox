import { Router } from 'express';
import { prisma, io } from '../index';
import { EstadoDispositivo } from '@prisma/client';
import { despacharAlertaWhatsApp } from '../services/whatsappService';
import { sincronizarAlertasDeRed } from './alertaRoutes';
import { obtenerConfiguracionActual } from './configuracionRoutes';

const router = Router();

router.post('/uplink', async (req, res) => {
  try {
    const { idNodo, tipo, bateria, senalDbm, latitud, longitud, cavitacion } = req.body;

    // LÓGICA PARA GATEWAYS
    if (tipo === 'GATEWAY') {
      let gw = await prisma.gateway.findUnique({ where: { id: idNodo } });
      if (!gw) {
        console.log(`📡 [NUEVO GATEWAY HUÉRFANO]: ${idNodo}`);
        gw = await prisma.gateway.create({
          data: { id: idNodo, estado: 'ACTIVO', latitud, longitud }
        });
        io.emit('nuevo-gateway-huerfano', gw);
      } else {
        console.log(`📶 [GATEWAY PING]: ${idNodo} | Señal: ${senalDbm}dBm`);
      }
    } 
    // LÓGICA PARA NODOS
    else if (tipo === 'NODO') {
      // Modificamos la búsqueda para traernos el teléfono del cliente
      let nodo = await prisma.nodo.findUnique({ 
        where: { id: idNodo },
        include: { sector: { include: { cliente: true } } } 
      });

      let nuevoEstado: EstadoDispositivo = 'ACTIVO';
      if (bateria <= 0) {
        nuevoEstado = 'INACTIVO';
      } else if (cavitacion) {
        nuevoEstado = 'ALERTA';
      }

      if (!nodo) {
        // ... (Lógica de creación de nodo huérfano intacta)
      } else {
        const esAlertaNueva = nuevoEstado === 'ALERTA' && nodo.estado !== 'ALERTA';
        const seApago = nuevoEstado === 'INACTIVO' && nodo.estado !== 'INACTIVO';
        
        await prisma.nodo.update({ 
          where: { id: idNodo }, 
          data: { bateria, estado: nuevoEstado } 
        });

        // Verificamos si es una alerta nueva y si el cliente tiene teléfono registrado
        let whatsappExitoso = false;
        if (esAlertaNueva && nodo.sector?.cliente?.telefono && nodo.latitud && nodo.longitud) {
          whatsappExitoso = await despacharAlertaWhatsApp(
            nodo.sector.cliente.telefono,
            nodo.id,
            nodo.sector.nombre,
            nodo.sector.cliente.nombre,
            nodo.latitud,
            nodo.longitud
          );
        }

        // GUARDAMOS EL HISTORIAL INCLUYENDO EL ESTADO DEL MENSAJE
        // GUARDAMOS EL HISTORIAL INCLUYENDO EL ESTADO DEL MENSAJE
        await prisma.lectura.create({
          data: {
            nodoId: idNodo,
            bateria: bateria,
            cavitacion: cavitacion || false,
            rssi: senalDbm !== undefined ? senalDbm : -65,
            whatsappEnviado: whatsappExitoso
          }
        });

        // NUEVO: Creamos un paquete de datos completo para el frontend
        const payloadSocket = {
          id: idNodo,
          bateria,
          estado: nuevoEstado,
          senalDbm: senalDbm !== undefined ? senalDbm : -65,
          cavitacion: cavitacion || false,
          whatsappEnviado: whatsappExitoso || false
        };

        if (seApago) {
          console.log(`⚠️ [NODO CAÍDO]: ${idNodo} sin energía. Estado inactivo.`);
          io.emit('nodo-ping', payloadSocket);
        } else if (esAlertaNueva) {
          console.log(`🚨 [NUEVA ALERTA]: Estrés hídrico en ${idNodo}. WhatsApp enviado: ${whatsappExitoso}`);
          io.emit('alerta_nodo', { nodoId: idNodo });
          // Ahora TAMBIÉN emitimos el ping normal para que se guarde en la bitácora
          io.emit('nodo-ping', payloadSocket);
        } else {
          console.log(`📶 [NODO PING]: ${idNodo} | Bat: ${bateria}% | Estado: ${nuevoEstado}`);
          io.emit('nodo-ping', payloadSocket);
        }
      }
    }

    res.status(200).json({ mensaje: 'Paquete procesado' });
    const nuevasAlertas = await sincronizarAlertasDeRed();
    if (nuevasAlertas.length > 0) {
      io.emit('nueva-alerta-sistema', nuevasAlertas[0]);
    }
  } catch (error) {
    console.error('Error procesando paquete LoRa:', error);
    res.status(500).json({ error: 'Error interno procesando uplink' });
  }
});



// ============================================================================
// 1. PÁGINA QUE SE ABRE EN EL CELULAR AL ESCANEAR EL QR:
//    Toma el ID del QR + Captura el GPS real del teléfono + Lo envía a la BD
// ============================================================================
router.get('/instalar-qr/:id', (req, res) => {
  const { id } = req.params;

  res.send(`
  <!DOCTYPE html>
  <html lang="es">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Instalación QR • ${id}</title>
    <script src="https://cdn.tailwindcss.com"></script>
  </head>
  <body class="bg-slate-950 text-white min-h-screen flex items-center justify-center p-6 font-sans">
    <div class="bg-slate-900 border border-slate-800 rounded-3xl p-7 w-full max-w-sm text-center shadow-2xl space-y-5">
      <div class="inline-flex items-center gap-2 bg-emerald-500/10 text-emerald-400 px-3 py-1 rounded-full text-xs font-bold uppercase tracking-wider">
        📡 Registro GPS por QR
      </div>

      <div>
        <p class="text-xs text-slate-400 uppercase">ID del Nodo</p>
        <h1 class="text-3xl font-black font-mono text-white mt-1">${id}</h1>
      </div>

      <div class="bg-slate-950 border border-slate-800 rounded-2xl p-4 text-left font-mono text-xs space-y-2">
        <div class="text-slate-400">ESTADO: <span id="estado-txt" class="text-yellow-400 font-bold">Obteniendo GPS del teléfono...</span></div>
        <div>LATITUD: <span id="lat-txt" class="text-emerald-400 font-bold">--</span></div>
        <div>LONGITUD: <span id="lng-txt" class="text-emerald-400 font-bold">--</span></div>
      </div>

      <div id="box-ok" class="hidden bg-emerald-950 border border-emerald-500/50 rounded-2xl p-4 text-emerald-300 text-xs font-medium">
        ✅ ¡Nodo <b>${id}</b> registrado en PostgreSQL con las coordenadas de tu teléfono!
      </div>
    </div>

    <script>
      if ("geolocation" in navigator) {
        navigator.geolocation.getCurrentPosition(
          async (pos) => {
            const latitud = pos.coords.latitude;
            const longitud = pos.coords.longitude;

            document.getElementById('lat-txt').innerText = latitud.toFixed(6);
            document.getElementById('lng-txt').innerText = longitud.toFixed(6);
            document.getElementById('estado-txt').innerText = 'Subiendo a PostgreSQL...';

            try {
              const res = await fetch('/api/lora/instalar-qr', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                  id: '${id}',
                  latitud: latitud,
                  longitud: longitud
                })
              });

              if (res.ok) {
                document.getElementById('estado-txt').innerText = '¡Ubicación Guardada!';
                document.getElementById('estado-txt').className = 'text-emerald-400 font-bold';
                document.getElementById('box-ok').classList.remove('hidden');
              } else {
                document.getElementById('estado-txt').innerText = 'Error al guardar en BD';
                document.getElementById('estado-txt').className = 'text-red-400 font-bold';
              }
            } catch (err) {
              document.getElementById('estado-txt').innerText = 'Error de conexión';
              document.getElementById('estado-txt').className = 'text-red-400 font-bold';
            }
          },
          (err) => {
            document.getElementById('estado-txt').innerText = 'Permiso de GPS denegado en el celular';
            document.getElementById('estado-txt').className = 'text-red-400 font-bold';
          },
          { enableHighAccuracy: true, timeout: 10000 }
        );
      } else {
        document.getElementById('estado-txt').innerText = 'GPS no disponible';
      }
    </script>
  </body>
  </html>
  `);
});

// ============================================================================
// 2. ENDPOINT POST QUE GUARDA EL NODO CON LAS COORDENADAS DEL TELÉFONO EN BD
// ============================================================================
router.post('/instalar-qr', async (req, res) => {
  try {
    const { id, latitud, longitud } = req.body;
    const lat = parseFloat(latitud);
    const lng = parseFloat(longitud);

    if (!id || isNaN(lat) || isNaN(lng)) {
      return res.status(400).json({ error: 'ID o coordenadas inválidas' });
    }

    const nodo = await prisma.nodo.upsert({
      where: { id },
      update: { latitud: lat, longitud: lng, estado: 'ACTIVO' },
      create: { id, bateria: 100, estado: 'ACTIVO', latitud: lat, longitud: lng }
    });

    console.log(`📲 [NODO CREADO POR QR]: ${id} en [${lat}, ${lng}]`);
    io.emit('nuevo-nodo-huerfano', nodo);

    return res.json({ ok: true, nodo });
  } catch (error) {
    console.error('Error guardando nodo por QR:', error);
    res.status(500).json({ error: 'Error guardando ubicación en BD' });
  }
});

export default router;