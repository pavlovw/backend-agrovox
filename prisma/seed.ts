import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

async function main() {
  console.log('🧹 Limpiando base de datos (evitando duplicados)...');
  
  // Limpiamos en orden inverso a las relaciones para no romper llaves foráneas
  await prisma.lectura.deleteMany();
  await prisma.nodo.deleteMany();
  await prisma.sector.deleteMany();
  await prisma.gateway.deleteMany();
  await prisma.infraestructura.deleteMany();
  await prisma.cliente.deleteMany();

  console.log('🌱 Iniciando la siembra de datos (Seeding)...');

  // 1. Crear el Cliente de prueba
  const cliente = await prisma.cliente.create({
    data: {
      nombre: 'Agrícola Los Encinos',
      email: 'contacto@losencinos.cl',
    },
  });
  console.log(`✅ Cliente creado: ${cliente.nombre}`);

  // 2. Crear la Infraestructura (Caseta / Centro de Control)
  const caseta = await prisma.infraestructura.create({
    data: {
      clienteId: cliente.id,
      nombre: 'Centro de Control Principal',
      tipo: 'CASETA',
      coordenadas: [
        [-33.74617362598498, -70.76402814204377], [-33.74631190290851, -70.76326639466235],
        [-33.74347049037455, -70.76249391844622], [-33.743193927142194, -70.76356680208201],
        [-33.74362661438611, -70.76372773462738], [-33.743590928922806, -70.7639744978636],
        [-33.744652565106435, -70.76423198993618], [-33.74478638386084, -70.76372773462738],
        [-33.7461736259799, -70.76402277762722]
      ],
      color: '#0284c7'
    }
  });

  // 3. Crear un Gateway Central en la caseta
  const gateway = await prisma.gateway.create({
    data: {
      id: 'GW-CEN-01',
      clienteId: cliente.id,
      tipo: 'CENTRAL',
      nombre: 'Gateway LoRa Central',
      latitud: -33.74409052405791,
      longitud: -70.763057182355,
      estado: 'ACTIVO'
    }
  });

  // 4. Crear un par de Sectores
  const sector1 = await prisma.sector.create({
    data: {
      clienteId: cliente.id,
      nombre: 'Sector 1',
      cultivo: 'Cerezos',
      coordenadas: [[-33.73466944, -70.76784296], [-33.73550766, -70.76508068], [-33.73479676, -70.76478085], [-33.73412830, -70.76727520]],
    }
  });

  const sector2 = await prisma.sector.create({
    data: {
      clienteId: cliente.id,
      nombre: 'Sector 2',
      cultivo: 'Cerezos',
      coordenadas: [[-33.73510334, -70.76683838], [-33.73683674, -70.76728284], [-33.73674306, -70.76652645], [-33.73573486, -70.76464891]],
    }
  });

  // 5. Crear Nodos asociados a los sectores y al Gateway
  await prisma.nodo.createMany({
    data: [
      { id: 'AGV-010', sectorId: sector1.id, gatewayId: gateway.id, latitud: -33.73456864, longitud: -70.76694347, estado: 'ACTIVO' },
      { id: 'AGV-011', sectorId: sector1.id, gatewayId: gateway.id, latitud: -33.73496653, longitud: -70.76564845, estado: 'ACTIVO' },
      { id: 'AGV-020', sectorId: sector2.id, gatewayId: gateway.id, latitud: -33.73602756, longitud: -70.76667553, estado: 'ACTIVO' },
    ]
  });
  
  console.log('✅ Polígonos, Gateways y Nodos insertados correctamente.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });