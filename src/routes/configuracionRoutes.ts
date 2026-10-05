import { Router } from 'express';
import { prisma, io } from '../index';
import { sincronizarAlertasDeRed } from './alertaRoutes';

const router = Router();

// Helper para obtener o inicializar la fila única de configuración (ID = 1)
export const obtenerConfiguracionActual = async () => {
  let config = await prisma.configuracionSistema.findUnique({ where: { id: 1 } });
  if (!config) {
    config = await prisma.configuracionSistema.create({
      data: {
        id: 1,
        bateriaMinima: 20,
        voltajeReferenciaMv: 24,
        heartbeatTimeoutMin: 60,
        rssiMinimoDbm: -110,
        whatsappHabilitado: true,
        autoResolverAlertas: true,
      },
    });
  }
  return config;
};

// GET /api/configuracion -> Obtiene umbrales, directorio de contactos y lista de clientes/sectores
router.get('/', async (req, res) => {
  try {
    const umbrales = await obtenerConfiguracionActual();

    // Si el directorio está vacío pero existen clientes con teléfono, los importamos inicialmente
    const totalContactos = await prisma.contactoNotificacion.count();
    if (totalContactos === 0) {
      const clientesExistentes = await prisma.cliente.findMany({
        include: { sectores: true },
      });

      for (const cli of clientesExistentes) {
        if ((cli as any).telefono) {
          await prisma.contactoNotificacion.create({
            data: {
              clienteId: cli.id,
              ubicacionLabel: `${cli.nombre} — General (Todos los sectores)`,
              nombre: cli.nombre,
              rol: 'Administrador / Titular',
              telefono: (cli as any).telefono,
              activo: true,
            },
          });
        }
      }
    }

    const contactos = await prisma.contactoNotificacion.findMany({
      orderBy: { createdAt: 'desc' },
    });

    const clientes = await prisma.cliente.findMany({
      select: {
        id: true,
        nombre: true,
        sectores: {
          select: { id: true, nombre: true, cultivo: true },
        },
      },
      orderBy: { nombre: 'asc' },
    });

    res.json({ umbrales, contactos, clientes });
  } catch (error) {
    console.error('Error obteniendo configuración:', error);
    res.status(500).json({ error: 'Error interno obteniendo configuración' });
  }
});

// PUT /api/configuracion/umbrales -> Guarda nuevos umbrales y re-audita la red
router.put('/umbrales', async (req, res) => {
  try {
    const {
      bateriaMinima,
      voltajeReferenciaMv,
      heartbeatTimeoutMin,
      rssiMinimoDbm,
      whatsappHabilitado,
      autoResolverAlertas,
    } = req.body;

    const umbrales = await prisma.configuracionSistema.upsert({
      where: { id: 1 },
      update: {
        bateriaMinima: Number(bateriaMinima),
        voltajeReferenciaMv: Number(voltajeReferenciaMv),
        heartbeatTimeoutMin: Number(heartbeatTimeoutMin),
        rssiMinimoDbm: Number(rssiMinimoDbm ?? -110),
        whatsappHabilitado: Boolean(whatsappHabilitado),
        autoResolverAlertas: Boolean(autoResolverAlertas),
      },
      create: {
        id: 1,
        bateriaMinima: Number(bateriaMinima),
        voltajeReferenciaMv: Number(voltajeReferenciaMv),
        heartbeatTimeoutMin: Number(heartbeatTimeoutMin),
        rssiMinimoDbm: Number(rssiMinimoDbm ?? -110),
        whatsappHabilitado: Boolean(whatsappHabilitado),
        autoResolverAlertas: Boolean(autoResolverAlertas),
      },
    });

    // Re-evaluamos las alertas activas con el nuevo umbral inmediatamente
    await sincronizarAlertasDeRed();
    io.emit('alertas-actualizadas');
    io.emit('configuracion-actualizada', umbrales);

    res.json(umbrales);
  } catch (error) {
    console.error('Error actualizando umbrales:', error);
    res.status(500).json({ error: 'Error guardando umbrales en PostgreSQL' });
  }
});

// POST /api/configuracion/contactos -> Agrega un destinatario de WhatsApp
router.post('/contactos', async (req, res) => {
  try {
    const { clienteId, sectorId, ubicacionLabel, nombre, rol, telefono } = req.body;

    if (!ubicacionLabel || !telefono) {
      return res.status(400).json({ error: 'El sector/fundo y el teléfono son obligatorios' });
    }

    const nuevo = await prisma.contactoNotificacion.create({
      data: {
        clienteId: clienteId ? Number(clienteId) : null,
        sectorId: sectorId ? Number(sectorId) : null,
        ubicacionLabel,
        nombre: nombre || null,
        rol: rol || 'Encargado de Riego',
        telefono,
        activo: true,
      },
    });

    res.status(201).json(nuevo);
  } catch (error) {
    console.error('Error creando contacto:', error);
    res.status(500).json({ error: 'Error creando contacto de notificación' });
  }
});

// PATCH /api/configuracion/contactos/:id/estado -> Activa o pausa las alertas para un número
router.patch('/contactos/:id/estado', async (req, res) => {
  try {
    const { id } = req.params;
    const { activo } = req.body;

    const actualizado = await prisma.contactoNotificacion.update({
      where: { id: Number(id) },
      data: { activo: Boolean(activo) },
    });

    res.json(actualizado);
  } catch (error) {
    res.status(500).json({ error: 'Error actualizando estado del contacto' });
  }
});

// DELETE /api/configuracion/contactos/:id -> Elimina un número del directorio
router.delete('/contactos/:id', async (req, res) => {
  try {
    const { id } = req.params;
    await prisma.contactoNotificacion.delete({
      where: { id: Number(id) },
    });
    res.json({ mensaje: 'Contacto eliminado correctamente' });
  } catch (error) {
    res.status(500).json({ error: 'Error eliminando contacto' });
  }
});

// POST /api/configuracion/contactos/:id/probar -> Dispara una prueba de enlace a ese contacto
router.post('/contactos/:id/probar', async (req, res) => {
  try {
    const { id } = req.params;
    const contacto = await prisma.contactoNotificacion.findUnique({
      where: { id: Number(id) },
    });

    if (!contacto) {
      return res.status(404).json({ error: 'Contacto no encontrado' });
    }

    console.log(`📲 [TEST WHATSAPP]: Enviando mensaje de prueba a ${contacto.telefono} (${contacto.ubicacionLabel})`);

    res.json({
      ok: true,
      mensaje: `Mensaje de prueba despachado a ${contacto.telefono} (${contacto.rol})`,
    });
  } catch (error) {
    res.status(500).json({ error: 'Error enviando prueba de notificación' });
  }
});

export default router;