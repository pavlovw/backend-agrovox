import { Router } from 'express';
import { prisma } from '../index'; // Importamos prisma para poder borrar la BD

const router = Router();

// NUEVO: Endpoint para destruir todo el hardware y las lecturas y empezar de 0
router.delete('/reset-db', async (req, res) => {
    try {
        // Borramos en orden para respetar las relaciones
        await prisma.lectura.deleteMany({});
        await prisma.nodo.deleteMany({});
        await prisma.gateway.deleteMany({});
        res.status(200).json({ mensaje: 'Base de datos en cero' });
    } catch (error) {
        console.error('Error reseteando BD:', error);
        res.status(500).json({ error: 'Error reseteando PostgreSQL' });
    }
});

router.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
        <meta charset="UTF-8">
        <title>Laboratorio IoT AgroVox - RF Realista</title>
        <script src="https://cdn.tailwindcss.com"></script>
    </head>
    <body class="bg-slate-950 text-slate-300 h-screen overflow-hidden font-mono flex flex-col" onload="cargarEstado()">
        
        <header class="bg-slate-900 border-b border-slate-800 p-6 flex justify-between items-center shrink-0 shadow-md">
            <h1 class="text-3xl font-bold text-white flex items-center gap-4">
                📡 Simulador de Hardware (Zero-Touch)
            </h1>
            <div class="flex gap-3 items-center">
                <button onclick="resetearBD()" class="bg-red-800 hover:bg-red-600 text-white px-4 py-3 rounded-lg transition-colors text-sm font-bold shadow-lg border border-red-500/50 flex items-center gap-2">
                    ⚠️ Resetear BD (PostgreSQL)
                </button>

                <button onclick="limpiarEstado()" class="bg-orange-600/80 hover:bg-orange-500 text-white px-4 py-3 rounded-lg transition-colors text-sm font-bold shadow-lg border border-orange-500/50">
                    🧹 Limpiar Pantalla
                </button>

                <label class="bg-blue-600 hover:bg-blue-500 text-white px-6 py-3 rounded-lg cursor-pointer transition-colors text-base font-bold shadow-lg ml-2">
                    📥 Importar Red Física (JSON)
                    <input type="file" id="fileInput" accept=".json" class="hidden" onchange="importarHardware(event)">
                </label>
            </div>
        </header>

        <div class="flex flex-1 overflow-hidden">
            
            <div class="w-1/2 bg-slate-900 border-r border-slate-800 flex flex-col overflow-hidden">
                <div class="flex-1 overflow-y-auto p-8 space-y-8">
                    
                    <div>
                        <div class="flex justify-between items-center mb-5">
                            <h2 class="text-lg font-bold text-slate-400 uppercase tracking-widest">Gateways de Enlace</h2>
                            <button onclick="toggleGlobal('gateways')" class="text-sm bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-lg border border-slate-700 transition-colors shadow-sm">
                                ON/OFF Todos
                            </button>
                        </div>
                        <div id="lista-gateways" class="space-y-4">
                            <p class="text-sm text-slate-600 italic">Sube un JSON para cargar gateways.</p>
                        </div>
                    </div>

                    <hr class="border-slate-800 my-8">

                    <div>
                        <div class="flex justify-between items-center mb-5">
                            <h2 class="text-lg font-bold text-slate-400 uppercase tracking-widest">Nodos (Sensores)</h2>
                            <button onclick="toggleGlobal('nodos')" class="text-sm bg-slate-800 hover:bg-slate-700 text-white px-4 py-2 rounded-lg border border-slate-700 transition-colors shadow-sm">
                                ON/OFF Todos
                            </button>
                        </div>
                        <div id="lista-nodos" class="space-y-4">
                            <p class="text-sm text-slate-600 italic">Sube un JSON para cargar nodos.</p>
                        </div>
                    </div>

                </div>
            </div>

            <div class="w-1/2 bg-black p-6 flex flex-col">
                <div class="flex justify-between items-center mb-4 shrink-0">
                    <h2 class="text-lg font-bold text-green-500 uppercase tracking-widest">Terminal de Tráfico LoRaWAN</h2>
                    <button onclick="document.getElementById('consola').innerHTML=''" class="text-sm text-slate-500 hover:text-white transition-colors bg-slate-900 px-4 py-2 rounded-lg border border-slate-800">Limpiar Log</button>
                </div>
                <div id="consola" class="flex-1 overflow-y-auto bg-slate-900/50 rounded-xl border border-slate-800 p-6 text-sm md:text-base font-mono space-y-2 shadow-inner">
                    <div class="text-slate-600">Esperando inicialización de dispositivos...</div>
                </div>
            </div>
        </div>

        <script>
            let hardware = {
                gateways: [],
                nodos: []
            };

            const INTERVALO_PING = 10000; 
            const DESGASTE_BATERIA = 0.5; 

            // --- LOCAL STORAGE Y RESET DE BD ---
            function guardarEstado() {
                const copia = JSON.parse(JSON.stringify(hardware));
                copia.gateways.forEach(g => delete g.timer);
                copia.nodos.forEach(n => delete n.timer);
                localStorage.setItem('agrovox_hardware', JSON.stringify(copia));
            }

            function cargarEstado() {
                const memoria = localStorage.getItem('agrovox_hardware');
                if (memoria) {
                    try {
                        hardware = JSON.parse(memoria);
                        hardware.gateways.forEach(gw => {
                            if (gw.encendido) gw.timer = setInterval(() => transmitirPaquete(gw), INTERVALO_PING);
                        });
                        hardware.nodos.forEach(nodo => {
                            if (nodo.encendido) nodo.timer = setInterval(() => transmitirPaquete(nodo), INTERVALO_PING);
                        });
                        logTerminal('Sistema', 'Estado recuperado de memoria.', 'text-green-400 font-bold');
                        renderUI();
                    } catch (e) {
                        console.error('Error cargando estado', e);
                    }
                }
            }

            function limpiarEstado() {
                localStorage.removeItem('agrovox_hardware');
                hardware.gateways.forEach(gw => clearInterval(gw.timer));
                hardware.nodos.forEach(n => clearInterval(n.timer));
                hardware = { gateways: [], nodos: [] };
                renderUI();
                logTerminal('Sistema', 'Memoria de pantalla borrada.', 'text-amber-500 font-bold');
            }

            async function resetearBD() {
                const confirmacion = confirm("⚠️ ATENCIÓN: Esto borrará TODOS los Nodos, Gateways y el Historial de Lecturas de PostgreSQL para empezar de cero.\\n\\n¿Deseas continuar?");
                if (!confirmacion) return;

                try {
                    // Calculamos la ruta relativa correctamente
                    const basePath = window.location.pathname.endsWith('/') ? window.location.pathname : window.location.pathname + '/';
                    const response = await fetch(basePath + 'reset-db', { method: 'DELETE' });
                    
                    if (response.ok) {
                        limpiarEstado(); // Limpiamos también la memoria visual
                        logTerminal('SISTEMA', 'BASE DE DATOS FORMATEADA CON ÉXITO. Sistema en 0.', 'text-red-500 font-bold text-lg');
                        alert("✅ Base de datos limpiada con éxito. Ya puedes subir tu JSON nuevamente.");
                    } else {
                        alert("❌ Error al borrar la base de datos.");
                    }
                } catch (error) {
                    console.error("Error de conexión:", error);
                    alert("❌ Error de red conectando con el backend.");
                }
            }
            // ------------------------------

            // IMPORTAR EL JSON
            function importarHardware(event) {
                const file = event.target.files[0];
                if (!file) return;

                const reader = new FileReader();
                reader.onload = (e) => {
                    try {
                        const data = JSON.parse(e.target.result);
                        
                        hardware.gateways = (data.gateways || []).map(gw => ({
                            ...gw, tipo: 'GATEWAY', encendido: false, senalDbm: -68, segundosMalaSenal: 0, timer: null 
                        }));
                        
                        hardware.nodos = (data.nodos || []).map(nodo => ({
                            ...nodo, tipo: 'NODO', encendido: false, bateria: 100, cavitacion: false, senalDbm: -70, segundosMalaSenal: 0, timer: null 
                        }));

                        logTerminal('Sistema', 'Inventario físico cargado. Equipos desconectados.', 'text-blue-400');
                        guardarEstado();
                        renderUI();
                    } catch (err) {
                        alert("Error leyendo JSON");
                    }
                };
                reader.readAsText(file);
                event.target.value = '';
            }

            // MOTOR DE SEÑAL DINÁMICA
            setInterval(() => {
                const dispositivosActivos = [...hardware.gateways, ...hardware.nodos].filter(d => d.encendido);
                
                dispositivosActivos.forEach(item => {
                    if (item.segundosMalaSenal > 0) {
                        item.segundosMalaSenal--;
                        item.senalDbm = -105 - Math.floor(Math.random() * 21);
                    } else {
                        if (Math.random() < 0.20) {
                            item.segundosMalaSenal = 3 + Math.floor(Math.random() * 3); 
                            item.senalDbm = -105 - Math.floor(Math.random() * 21);
                        } else {
                            item.senalDbm = -65 - Math.floor(Math.random() * 18);
                        }
                    }

                    const el = document.getElementById('signal-val-' + item.id);
                    if (el) {
                        const esCritica = item.senalDbm <= -100;
                        el.innerText = '📶 ' + item.senalDbm + ' dBm';
                        el.className = esCritica ? 'text-amber-400 font-bold animate-pulse' : 'text-slate-400 font-medium';
                    }
                });
            }, 1000);

            // MODIFICAR BATERÍA MANUALMENTE
            function setBateria(id, valor) {
                const nodo = hardware.nodos.find(x => x.id === id);
                if (nodo) {
                    nodo.bateria = parseFloat(valor);
                    document.getElementById('bat-val-' + id).innerText = nodo.bateria + '%';
                    guardarEstado();
                    if (nodo.encendido) transmitirPaquete(nodo);
                }
            }

            // INYECTAR EVENTO DE CAVITACIÓN
            function toggleCavitacion(id) {
                const nodo = hardware.nodos.find(x => x.id === id);
                if (nodo) {
                    nodo.cavitacion = !nodo.cavitacion;
                    guardarEstado();
                    renderUI();
                    if (nodo.encendido) transmitirPaquete(nodo);
                }
            }

            // DIBUJAR LA INTERFAZ
            function renderUI() {
                const drawItem = (d, type) => {
                    const isAlert = type === 'nodos' && d.cavitacion;
                    const borderColor = d.encendido ? (isAlert ? 'border-red-500/50' : 'border-green-500/50') : 'border-slate-700';
                    const textColor = d.encendido ? (isAlert ? 'text-red-400' : 'text-green-400') : 'text-slate-400';
                    const senalColor = d.senalDbm <= -100 ? 'text-amber-400 font-bold animate-pulse' : 'text-slate-400 font-medium';
                    
                    return \`
                        <div class="bg-slate-800/80 border-2 \${borderColor} rounded-xl p-5 flex flex-col transition-colors shadow-md">
                            <div class="flex justify-between items-center">
                                <div>
                                    <p class="font-bold text-xl \${textColor}">\${d.id}</p>
                                    <p class="text-sm text-slate-500 mt-1 flex items-center gap-2">
                                        <span>\${type === 'nodos' ? 'Activo' : 'Antena'}</span> • 
                                        <span id="signal-val-\${d.id}" class="\${senalColor}">📶 \${d.senalDbm} dBm</span>
                                    </p>
                                </div>
                                <button onclick="toggleDispositivo('\${type}', '\${d.id}')" 
                                        class="\${d.encendido ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30 border-red-500/30' : 'bg-green-500/20 text-green-400 hover:bg-green-500/30 border-green-500/30'} 
                                               px-5 py-2.5 rounded-lg text-sm font-bold transition-colors w-32 text-center border-2">
                                    \${d.encendido ? 'APAGAR' : 'ENCENDER'}
                                </button>
                            </div>

                            \${type === 'nodos' ? \`
                            <div class="mt-5 pt-5 border-t border-slate-700/50 flex flex-col gap-5">
                                <div class="flex items-center justify-between">
                                    <label class="text-sm text-slate-400 font-bold">Batería: <span id="bat-val-\${d.id}" class="text-white">\${d.bateria.toFixed(1)}%</span></label>
                                    <input type="range" min="0" max="100" value="\${d.bateria}" onchange="setBateria('\${d.id}', this.value)" class="w-48 h-2 bg-slate-700 rounded-lg appearance-none cursor-pointer">
                                </div>
                                <div class="flex items-center justify-between">
                                    <span class="text-sm text-slate-400 font-bold">Estrés Hídrico (Cavitación)</span>
                                    <button onclick="toggleCavitacion('\${d.id}')" class="text-sm px-4 py-1.5 rounded-lg border-2 transition-colors font-bold \${d.cavitacion ? 'bg-red-500/20 text-red-400 border-red-500/50' : 'bg-slate-700 text-slate-400 border-slate-600 hover:bg-slate-600'}">
                                        \${d.cavitacion ? 'DETECTADA' : 'NORMAL'}
                                    </button>
                                </div>
                            </div>
                            <div class="flex items-center justify-between mt-2 pt-2 border-t border-slate-700/30">
                                <span class="text-[11px] text-slate-400 font-bold">Respuesta Agricultor:</span>
                                <button onclick="simularRiego('\${d.id}')" class="text-xs bg-blue-600/30 hover:bg-blue-600/50 text-blue-400 border border-blue-500/40 px-3 py-1 rounded font-bold transition-colors">
                                    💧 Confirmar Riego
                                </button>
                            </div>                            
                            \` : ''}
                        </div>
                    \`;
                };

                document.getElementById('lista-gateways').innerHTML = hardware.gateways.map(gw => drawItem(gw, 'gateways')).join('') || '<p class="text-base text-slate-600 p-4 bg-slate-900 rounded-lg">Lista vacía. Importa un JSON.</p>';
                document.getElementById('lista-nodos').innerHTML = hardware.nodos.map(n => drawItem(n, 'nodos')).join('') || '<p class="text-base text-slate-600 p-4 bg-slate-900 rounded-lg">Lista vacía. Importa un JSON.</p>';
            }

            // ENCENDER / APAGAR INDIVIDUAL
            function toggleDispositivo(tipoLista, id) {
                const item = hardware[tipoLista].find(x => x.id === id);
                if (!item) return;

                item.encendido = !item.encendido;

                if (item.encendido) {
                    transmitirPaquete(item);
                    item.timer = setInterval(() => transmitirPaquete(item), INTERVALO_PING);
                    logTerminal(item.id, 'Dispositivo INICIADO (TX activo)', 'text-green-500');
                } else {
                    clearInterval(item.timer);
                    item.timer = null;
                    
                    if (item.tipo === 'NODO' && item.bateria > 0) {
                        transmitirPaquete(item, true); 
                    }
                    logTerminal(item.id, 'Dispositivo APAGADO', 'text-red-500');
                }
                guardarEstado();
                renderUI();
            }

            // ENCENDER / APAGAR TODOS
            function toggleGlobal(tipoLista) {
                const encendidos = hardware[tipoLista].filter(x => x.encendido).length;
                const turnOn = encendidos < (hardware[tipoLista].length / 2);

                hardware[tipoLista].forEach(item => {
                    if (item.encendido !== turnOn) toggleDispositivo(tipoLista, item.id);
                });
                guardarEstado();
            }

            // MOTOR DE TRANSMISIÓN
            async function transmitirPaquete(dispositivo, forzarApagado = false) {
                let payload = {
                    idNodo: dispositivo.id,
                    tipo: dispositivo.tipo,
                    latitud: dispositivo.latitud,
                    longitud: dispositivo.longitud,
                    senalDbm: dispositivo.senalDbm
                };

                if (dispositivo.tipo === 'NODO') {
                    if (forzarApagado) {
                        dispositivo.bateria = 0;
                    } else {
                        dispositivo.bateria = Math.max(0, dispositivo.bateria - DESGASTE_BATERIA);
                    }
                    payload.bateria = dispositivo.bateria;
                    payload.cavitacion = dispositivo.cavitacion; 
                }

                try {
                    const response = await fetch('/api/lora/uplink', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                    
                    if(response.ok) {
                        const statusColor = dispositivo.cavitacion ? 'text-red-400' : 'text-slate-300';
                        logTerminal(
                            dispositivo.id, 
                            \`TX OK ➔ \${dispositivo.tipo === 'NODO' ? 'Bat: ' + dispositivo.bateria.toFixed(1) + '% | RSSI: ' + dispositivo.senalDbm + ' dBm | Cav: ' + (dispositivo.cavitacion ? 'SI' : 'NO') : 'RSSI: ' + dispositivo.senalDbm + ' dBm'}\`, 
                            statusColor
                        );
                    }
                } catch (error) {
                    logTerminal(dispositivo.id, 'TX FALLIDA (Rechazo de Red)', 'text-red-500');
                }
                
                if (dispositivo.tipo === 'NODO' && dispositivo.bateria <= 0 && dispositivo.encendido) {
                    toggleDispositivo('nodos', dispositivo.id);
                    logTerminal(dispositivo.id, 'Batería agotada. Equipo inoperativo.', 'text-red-500 font-bold');
                }
                
                if(dispositivo.tipo === 'NODO') {
                    const batElement = document.getElementById('bat-val-' + dispositivo.id);
                    if(batElement) batElement.innerText = dispositivo.bateria.toFixed(1) + '%';
                    guardarEstado();
                }
            }

            function logTerminal(origen, mensaje, colorClass) {
                const consoleDiv = document.getElementById('consola');
                const time = new Date().toLocaleTimeString();
                consoleDiv.innerHTML = \`<div class="animate-pulse \${colorClass} py-0.5">[\${time}] <span class="font-bold text-white">\${origen}</span>: \${mensaje}</div>\` + consoleDiv.innerHTML;
            }

            async function simularRiego(idNodo) {
                await fetch('/api/whatsapp/simular-riego', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ idNodo })
                });
                logTerminal(idNodo, 'Respuesta WhatsApp: Agricultor activó riego.', 'text-blue-400 font-bold');
            }            
        </script>
    </body>
    </html>
  `);
});

export default router;
