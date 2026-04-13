export default class UIController {
    constructor(networkLogic, sceneManager, nodeManager, packetAnimator) {
        this.networkLogic = networkLogic;
        this.sceneManager = sceneManager;
        this.nodeManager = nodeManager;
        this.packetAnimator = packetAnimator;

        // --- UI REFS ---
        // Basic node ops
        this.btnAddNode     = document.getElementById('btn-add-node');
        this.btnConnect     = document.getElementById('btn-connect');
        this.btnDelete      = document.getElementById('btn-delete');
        this.btnSimulate    = document.getElementById('btn-simulate');
        
        // Sim Control buttons
        this.btnNextStep    = document.getElementById('btn-next-step');
        this.btnReplay      = document.getElementById('btn-replay');
        
        // Settings
        this.speedSlider    = document.getElementById('anim-speed');
        this.speedLabel     = document.getElementById('speed-label');
        this.stepModeToggle = document.getElementById('step-mode-toggle');
        this.proxyArpToggle = document.getElementById('proxy-arp-toggle');
        this.simModeSelect  = document.getElementById('simulation-mode');

        // Node Info
        this.infoPanel      = document.getElementById('node-info-panel');
        this.btnCloseInfo   = document.getElementById('btn-close-info');
        this.logsContainer  = document.getElementById('logs-container');

        // Initialize state
        this.networkLogic.setLogger(this.log.bind(this));
        this.nodeManager.onSelectionChanged = this.onSelectionChanged.bind(this);
        
        this.networkLogic.onTableUpdated = (node) => {
            if (this.nodeManager.selectedNodes.length === 1 && this.nodeManager.selectedNodes[0].id === node.id) {
                this.updateNodeInfoPanel(node);
            }
        };

        this.bindEvents();
    }

    bindEvents() {
        // --- ADD NODE ---
        this.btnAddNode.addEventListener('click', () => {
            const name = document.getElementById('node-name').value || `Node-${Math.floor(Math.random()*1000)}`;
            const isRouter = document.getElementById('node-is-router').checked;
            const isSwitch = document.getElementById('node-is-switch').checked;
            const mask = document.getElementById('node-mask').value || '255.255.255.0';
            const gw = document.getElementById('node-gateway').value || '192.168.1.1';
            const mac = document.getElementById('node-mac').value.trim() || 'AUTO';
            
            // Initialization Rules:
            // Devices start without IP (Unknown)
            // Routers have defaults (192.168.1.1)
            // Switches have management IP (192.168.1.254)
            let ip = document.getElementById('node-ip').value.trim();
            if (ip === "") ip = "Unknown";

            this.nodeManager.createNode(name, ip, mask, gw, mac, isRouter, isSwitch);
            this.log('System', `Created ${isSwitch ? 'Switch' : (isRouter ? 'Router' : 'Node')} ${name}`, 'system-msg');
        });

        // --- CONNECT ---
        this.btnConnect.addEventListener('click', () => {
            if (this.nodeManager.selectedNodes.length === 2) {
                const n1 = this.nodeManager.selectedNodes[0];
                const n2 = this.nodeManager.selectedNodes[1];
                window.app.linkManager.createLink(n1, n2);
                this.log('System', `Connected ${n1.name} ↔ ${n2.name}`, 'system-msg');
                this.nodeManager.deselectAll();
            }
        });

        // --- DELETE ---
        this.btnDelete.addEventListener('click', () => {
            const deleted = this.nodeManager.deleteSelected();
            deleted.forEach(node => {
                window.app.linkManager.removeLinksForNode(node);
                this.log('System', `Deleted ${node.name}`, 'warn-msg');
            });
            this.infoPanel.classList.add('hidden');
        });

        // --- RUN SIMULATION ---
        document.getElementById('simulate-type').addEventListener('change', () => {
            this.onSelectionChanged(this.nodeManager.selectedNodes);
        });

        this.btnSimulate.addEventListener('click', async () => {
            const proto = document.getElementById('simulate-type').value;
            const nodes = this.nodeManager.selectedNodes;

            this.btnSimulate.disabled = true;
            this.btnReplay.classList.add('hidden');

            try {
                if (proto === 'rarp') {
                    if (nodes.length !== 1) {
                        this.log('Warning', 'Select exactly 1 Device for RARP.', 'warn-msg');
                        return;
                    }
                    await this.networkLogic.runRARP(nodes[0], nodes[0].mac);
                } else {
                    if (nodes.length !== 2) {
                        this.log('Warning', 'Select Source & Target for ARP/PING.', 'warn-msg');
                        return;
                    }
                    if (proto === 'arp') {
                        await this.networkLogic.runARP(nodes[0], nodes[1].ip);
                    } else if (proto === 'ping') {
                        await this.networkLogic.runRoutingFlow(nodes[0], nodes[1]);
                    }
                }
                this.btnReplay.classList.remove('hidden');
            } catch (err) {
                this.log('Error', `Simulation failed: ${err.message}`, 'error-msg');
            } finally {
                this.btnSimulate.disabled = false;
                this.onSelectionChanged(this.nodeManager.selectedNodes);
            }
        });

        // --- NEXT STEP ---
        this.btnNextStep.addEventListener('click', () => {
            this.packetAnimator.nextStep();
        });

        // --- REPLAY ---
        this.btnReplay.addEventListener('click', () => {
            this.networkLogic.replay();
        });

        // --- ANIMATION SPEED ---
        this.speedSlider.addEventListener('input', (e) => {
            const speed = parseInt(e.target.value);
            const levels = ['Slow', 'Normal', 'Fast', 'Turbo'];
            this.speedLabel.textContent = levels[speed-1];
            this.packetAnimator.speed = speed;
        });

        // --- STEP MODE ---
        this.stepModeToggle.addEventListener('change', (e) => {
            this.packetAnimator.stepMode = e.target.checked;
            this.btnNextStep.classList.toggle('hidden', !e.target.checked);
        });

        // --- SIMULATION MODE ---
        this.simModeSelect.addEventListener('change', (e) => {
            this.networkLogic.setSimulationMode(e.target.value);
        });

        // --- SCENARIO BUTTONS ---
        ['arp-hit', 'arp-miss', 'rarp-ok', 'rarp-fail'].forEach(s => {
            document.getElementById(`btn-scen-${s}`).addEventListener('click', () => {
                this.networkLogic.setupScenario(s.replace('-', '_'));
            });
        });

        // --- PROXY ARP ---
        this.proxyArpToggle.addEventListener('change', (e) => {
            this.networkLogic.setProxyArp(e.target.checked);
        });

        // --- CLOSE INFO ---
        this.btnCloseInfo.addEventListener('click', () => {
            this.nodeManager.deselectAll();
        });
    }

    onSelectionChanged(selected) {
        this.btnConnect.disabled = selected.length !== 2;
        this.btnDelete.disabled  = selected.length === 0;
        
        const proto = document.getElementById('simulate-type').value;
        const ins = document.getElementById('sim-instructions');
        
        let canSim = false;
        if (proto === 'rarp') {
            if (selected.length === 1 && !selected[0].isSwitch && !selected[0].isRouter) {
                if (!selected[0].ip) {
                    ins.innerHTML = `<span style="color:var(--accent-primary)">✅ RARP Ready: ${selected[0].name}</span>`;
                    canSim = true;
                } else {
                    ins.innerHTML = `<span style="color:var(--warn-color)">⚠️ ${selected[0].name} already has an IP Address.</span>`;
                }
            } else {
                ins.textContent = "Select 1 Device with NO IP for RARP.";
            }
        } else {
            // ARP or PING
            if (selected.length === 2) {
                const s = selected[0];
                const t = selected[1];
                if (!s.ip) {
                    ins.innerHTML = `<span style="color:var(--error-color)">⚠️ Run RARP first! ${s.name} has no IP.</span>`;
                } else if (!t.ip) {
                    ins.innerHTML = `<span style="color:var(--error-color)">⚠️ Target ${t.name} has no IP.</span>`;
                } else {
                    ins.innerHTML = `<span style="color:var(--accent-primary)">✅ Protocol Ready.</span>`;
                    canSim = true;
                }
            } else {
                ins.textContent = "Select 2 Devices with valid IPs for ARP/PING.";
            }
        }
        
        this.btnSimulate.disabled = !canSim;

        if (selected.length === 1) {
            this.updateNodeInfoPanel(selected[0]);
            this.infoPanel.classList.remove('hidden');
        } else {
            this.infoPanel.classList.add('hidden');
        }
    }

    updateNodeInfoPanel(node) {
        document.getElementById('info-name').textContent = node.name;
        document.getElementById('info-ip').textContent   = node.ip || 'Unknown';
        document.getElementById('info-mac').textContent  = node.mac;
        document.getElementById('info-gw').textContent   = node.gateway || 'None';
        document.getElementById('info-mask').textContent = node.mask || 'None';

        // ARP Cache display
        const cacheList = document.getElementById('info-arp-cache');
        cacheList.innerHTML = '';
        if (Object.keys(node.arpCache).length === 0) {
            cacheList.innerHTML = '<li>Empty</li>';
        } else {
            Object.keys(node.arpCache).forEach(ip => {
                const entry = node.arpCache[ip];
                const li = document.createElement('li');
                li.innerHTML = `<span class="tag">IP</span> ${ip} &rarr; <span class="tag">MAC</span> ${entry.mac}`;
                cacheList.appendChild(li);
            });
        }

        // MAC Table display (only for switches)
        const macContainer = document.getElementById('mac-table-container');
        if (node.isSwitch) {
            macContainer.classList.remove('hidden');
            const macList = document.getElementById('info-mac-table');
            macList.innerHTML = '';
            if (Object.keys(node.macTable).length === 0) {
                macList.innerHTML = '<li>Empty</li>';
            } else {
                Object.keys(node.macTable).forEach(mac => {
                    const li = document.createElement('li');
                    li.innerHTML = `<span class="tag">MAC</span> ${mac} &rarr; Port ${node.macTable[mac]}`;
                    macList.appendChild(li);
                });
            }
        } else {
            macContainer.classList.add('hidden');
        }
    }

    log(type, msg, cssClass = '') {
        const entry = document.createElement('div');
        entry.className = `log-entry ${cssClass}`;
        entry.innerHTML = `<span class="log-timestamp">[${new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}]</span> <span class="log-type">${type}:</span> ${msg}`;
        this.logsContainer.appendChild(entry);
        this.logsContainer.scrollTop = this.logsContainer.scrollHeight;
    }
}
