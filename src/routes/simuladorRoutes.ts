import { Router } from 'express';

const router = Router();

router.get('/', (req, res) => {
  res.send(`
    <!DOCTYPE html>
    <html lang="es">
    <head>
        <meta charset="UTF-8">
        <title>Laboratorio IoT AgroVox</title>
        <script src="https://cdn.tailwindcss.com"></script>
    </head>
    <body class="bg-slate-950 text-slate-300 h-screen overflow-hidden font-mono flex flex-col">
        
        <!-- HEADER -->
        <header class="bg-slate-900 border-b border-slate-800 p-4 flex justify-between items-center shrink-0">
            <h1 class="text-xl font-bold text-white flex items-center gap-3">
                📡 Simulador de Hardware (Zero-Touch)
            </h1>
            <div class="flex gap-4 items-center">
                <label class="bg-blue-600 hover:bg-blue-500 text-white px-4 py-2 rounded-md cursor-pointer transition-colors text-sm font-bold shadow-lg">
                    📥 Importar Red Física (JSON)
                    <input type="file" id="fileInput" accept=".json" class="hidden" onchange="importarHardware(event)">
                </label>
            </div>
        </header>

        <!-- MAIN LAYOUT -->
        <div class="flex flex-1 overflow-hidden">
            
            <!-- PANEL IZQUIERDO: Control de Dispositivos -->
            <div class="w-1/3 bg-slate-900 border-r border-slate-800 flex flex-col overflow-hidden">
                <div class="flex-1 overflow-y-auto p-4 space-y-6">
                    
                    <!-- SECCIÓN GATEWAYS -->
                    <div>
                        <div class="flex justify-between items-center mb-3">
                            <h2 class="text-sm font-bold text-slate-400 uppercase tracking-widest">Gateways de Enlace</h2>
                            <button onclick="toggleGlobal('gateways')" class="text-xs bg-slate-800 hover:bg-slate-700 text-white px-2 py-1 rounded border border-slate-700 transition-colors">
                                ON/OFF Todos
                            </button>
                        </div>
                        <div id="lista-gateways" class="space-y-2">
                            <p class="text-xs text-slate-600 italic">Sube un JSON para cargar gateways.</p>
                        </div>
                    </div>

                    <hr class="border-slate-800">

                    <!-- SECCIÓN NODOS -->
                    <div>
                        <div class="flex justify-between items-center mb-3">
                            <h2 class="text-sm font-bold text-slate-400 uppercase tracking-widest">Nodos (Sensores)</h2>
                            <button onclick="toggleGlobal('nodos')" class="text-xs bg-slate-800 hover:bg-slate-700 text-white px-2 py-1 rounded border border-slate-700 transition-colors">
                                ON/OFF Todos
                            </button>
                        </div>
                        <div id="lista-nodos" class="space-y-2">
                            <p class="text-xs text-slate-600 italic">Sube un JSON para cargar nodos.</p>
                        </div>
                    </div>

                </div>
            </div>

            <!-- PANEL DERECHO: Consola de Tráfico -->
            <div class="w-2/3 bg-black p-4 flex flex-col">
                <div class="flex justify-between items-center mb-2 shrink-0">
                    <h2 class="text-sm font-bold text-green-500 uppercase tracking-widest">Terminal de Tráfico LoRaWAN</h2>
                    <button onclick="document.getElementById('consola').innerHTML=''" class="text-xs text-slate-500 hover:text-white transition-colors">Limpiar Log</button>
                </div>
                <div id="consola" class="flex-1 overflow-y-auto bg-slate-900/50 rounded-lg border border-slate-800 p-4 text-xs font-mono space-y-1">
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

            // IMPORTAR EL JSON
            function importarHardware(event) {
                const file = event.target.files[0];
                if (!file) return;

                const reader = new FileReader();
                reader.onload = (e) => {
                    try {
                        const data = JSON.parse(e.target.result);
                        
                        hardware.gateways = (data.gateways || []).map(gw => ({
                            ...gw, tipo: 'GATEWAY', encendido: false, senalDbm: -65, timer: null 
                        }));
                        
                        hardware.nodos = (data.nodos || []).map(nodo => ({
                            ...nodo, tipo: 'NODO', encendido: false, bateria: 100, timer: null 
                        }));

                        logTerminal('Sistema', 'Inventario físico cargado. Equipos desconectados.', 'text-blue-400');
                        renderUI();
                    } catch (err) {
                        alert("Error leyendo JSON");
                    }
                };
                reader.readAsText(file);
                event.target.value = '';
            }

            // DIBUJAR LA INTERFAZ
            function renderUI() {
                const drawItem = (d, type) => \`
                    <div class="bg-slate-800/80 border \${d.encendido ? 'border-green-500/50' : 'border-slate-700'} rounded-lg p-3 flex justify-between items-center transition-colors">
                        <div>
                            <p class="font-bold \${d.encendido ? 'text-green-400' : 'text-slate-400'}">\${d.id}</p>
                            <p class="text-[10px] text-slate-500 mt-1">
                                \${type === 'nodos' ? '🔋 ' + d.bateria.toFixed(1) + '%' : '📶 ' + d.senalDbm + ' dBm'}
                            </p>
                        </div>
                        <button onclick="toggleDispositivo('\${type}', '\${d.id}')" 
                                class="\${d.encendido ? 'bg-red-500/20 text-red-400 hover:bg-red-500/30' : 'bg-green-500/20 text-green-400 hover:bg-green-500/30'} 
                                       px-3 py-1.5 rounded-md text-xs font-bold transition-colors w-20 text-center border \${d.encendido ? 'border-red-500/30' : 'border-green-500/30'}">
                            \${d.encendido ? 'APAGAR' : 'ENCENDER'}
                        </button>
                    </div>
                \`;

                document.getElementById('lista-gateways').innerHTML = hardware.gateways.map(gw => drawItem(gw, 'gateways')).join('') || '<p class="text-xs text-slate-600">Vacío</p>';
                document.getElementById('lista-nodos').innerHTML = hardware.nodos.map(n => drawItem(n, 'nodos')).join('') || '<p class="text-xs text-slate-600">Vacío</p>';
            }

            // ENCENDER / APAGAR INDIVIDUAL
            function toggleDispositivo(tipoLista, id) {
                const item = hardware[tipoLista].find(x => x.id === id);
                if (!item) return;

                item.encendido = !item.encendido;

                if (item.encendido) {
                    transmitirPaquete(item);
                    item.timer = setInterval(() => transmitirPaquete(item), INTERVALO_PING);
                    logTerminal(item.id, 'Dispositivo en red', 'text-green-500');
                } else {
                    clearInterval(item.timer);
                    item.timer = null;
                    logTerminal(item.id, 'Dispositivo apagado', 'text-red-500');
                }
                renderUI();
            }

            // ENCENDER / APAGAR TODOS
            function toggleGlobal(tipoLista) {
                const encendidos = hardware[tipoLista].filter(x => x.encendido).length;
                const turnOn = encendidos < (hardware[tipoLista].length / 2);

                hardware[tipoLista].forEach(item => {
                    if (item.encendido !== turnOn) toggleDispositivo(tipoLista, item.id);
                });
            }

            // MOTOR DE TRANSMISIÓN (SIN CLIENTE ASIGNADO)
            async function transmitirPaquete(dispositivo) {
                let payload = {
                    idNodo: dispositivo.id,
                    tipo: dispositivo.tipo,
                    latitud: dispositivo.latitud,
                    longitud: dispositivo.longitud
                };

                if (dispositivo.tipo === 'NODO') {
                    dispositivo.bateria = Math.max(0, dispositivo.bateria - DESGASTE_BATERIA);
                    payload.bateria = dispositivo.bateria;
                    if (dispositivo.bateria <= 0) {
                        toggleDispositivo('nodos', dispositivo.id);
                        logTerminal(dispositivo.id, 'Batería agotada.', 'text-red-500 font-bold');
                        return;
                    }
                }

                if (dispositivo.tipo === 'GATEWAY') {
                    dispositivo.senalDbm = -60 - Math.floor(Math.random() * 20);
                    payload.senalDbm = dispositivo.senalDbm;
                }

                try {
                    const response = await fetch('/api/lora/uplink', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify(payload)
                    });
                    
                    if(response.ok) {
                        logTerminal(dispositivo.id, \`TX OK ➔ \${dispositivo.tipo === 'NODO' ? 'Bat: '+dispositivo.bateria.toFixed(1)+'%' : 'Señal: '+dispositivo.senalDbm+' dBm'}\`, 'text-slate-300');
                    }
                } catch (error) {
                    logTerminal(dispositivo.id, 'TX FALLIDA', 'text-red-500');
                }
                
                renderUI();
            }

            function logTerminal(origen, mensaje, colorClass) {
                const consoleDiv = document.getElementById('consola');
                const time = new Date().toLocaleTimeString();
                consoleDiv.innerHTML = \`<div class="animate-pulse \${colorClass}">[\${time}] <span class="font-bold">\${origen}</span>: \${mensaje}</div>\` + consoleDiv.innerHTML;
            }
        </script>
    </body>
    </html>
  `);
});

export default router;