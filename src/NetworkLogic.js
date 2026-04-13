import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';

/**
 * NetworkLogic.js
 * Realistic ARP/RARP simulation engine with:
 *  - Switch forwarding (MAC table, flood unknown, unicast known)
 *  - Timeout + retry (3 attempts × 2 s)
 *  - ARP cache updated ONLY on sender & responder (not bystanders)
 *  - Simulation modes: normal | failure | attack
 */
export default class NetworkLogic {
    constructor(nodeManager, linkManager, packetAnimator, aiGuardian) {
        this.nodeManager    = nodeManager;
        this.linkManager    = linkManager;
        this.packetAnimator = packetAnimator;
        this.aiGuardian     = aiGuardian;
        this.logger         = null;

        // Feature toggles
        this.proxyArpEnabled  = false;
        this.passiveLearning  = false;   // intermediate nodes learn from overheard ARP
        this.simulationMode   = 'normal'; // 'normal' | 'failure' | 'attack'

        // For replay support
        this._lastCall = null;

        if (this.aiGuardian) this.aiGuardian.setLogicRef(this);
    }

    // ── Configuration ───────────────────────────────────────────────

    setLogger(fn)           { this.logger = fn; if (this.aiGuardian) this.aiGuardian.setLogger(fn); }
    setProxyArp(enabled)    { this.proxyArpEnabled = enabled; this.logger('System', `Proxy ARP ${enabled ? 'ENABLED' : 'DISABLED'}`, 'warn-msg'); }
    setSimulationMode(mode) {
        this.simulationMode = mode;
        const labels = { normal: '✅ Normal', failure: '⚠️ Failure (no-reply)', attack: '☠️ Attack' };
        this.logger('System', `Simulation Mode: ${labels[mode] ?? mode}`, 'warn-msg');
    }

    // ── Graph helpers ───────────────────────────────────────────────

    /** BFS over links. Returns all nodes reachable from startNodeId (not including itself). */
    getBroadcastDomain(startNodeId) {
        const visited = new Set();
        const queue   = [startNodeId];
        while (queue.length > 0) {
            const id = queue.shift();
            if (!visited.has(id)) {
                visited.add(id);
                const node = this.nodeManager.getNodeById(id);
                // 🛑 ARP Stop Condition: Enforce L2 Boundary
                // We stop propagation at Routers (but include them as potential GWs)
                if (node && (node.id === startNodeId || !node.isRouter)) {
                    node.links.forEach(nid => !visited.has(nid) && queue.push(nid));
                }
            }
        }
        visited.delete(startNodeId);
        return Array.from(visited).map(id => this.nodeManager.getNodeById(id)).filter(Boolean);
    }

    isSameSubnet(node, targetIp) {
        if (!node.ip || !targetIp || node.isSwitch) return true;
        
        // LAN match (e.g. 192.168.1.x)
        const netA = this.nodeManager.getNetworkAddress(node.ip, node.mask);
        const netB = this.nodeManager.getNetworkAddress(targetIp, node.mask);
        if (netA === netB) return true;

        // WAN match (Inter-router backbone: 10.0.0.x)
        if (node.isRouter && node.wanIp && targetIp.startsWith('10.0.0.')) {
             return true;
        }
        
        return false;
    }

    // ── Path-finding ────────────────────────────────────────────────

    /**
     * BFS: returns ordered array of node IDs from fromId → toId,
     * including intermediate hops (switches, routers). Returns [] if unreachable.
     */
    _findPath(fromId, toId) {
        const prev  = { [fromId]: null };
        const queue = [fromId];
        while (queue.length > 0) {
            const cur  = queue.shift();
            if (cur === toId) break;
            const node = this.nodeManager.getNodeById(cur);
            if (!node) continue;
            for (const nid of node.links) {
                if (!(nid in prev)) { prev[nid] = cur; queue.push(nid); }
            }
        }
        if (!(toId in prev)) return [];  // unreachable
        const path = [];
        let cur = toId;
        while (cur !== null) { path.unshift(cur); cur = prev[cur]; }
        return path.map(id => this.nodeManager.getNodeById(id)).filter(Boolean);
    }

    /**
     * Send a packet hop-by-hop from source → target following actual link path.
     * Intermediate switches animate their forwarding decision.
     */
    async _sendViaPath(sourceNode, targetNode, type) {
        const path = this._findPath(sourceNode.id, targetNode.id);
        if (path.length < 2) {
            // Fallback: no path found, direct animation
            await this.packetAnimator.animatePacket(sourceNode, targetNode, type);
            return;
        }

        for (let i = 0; i < path.length - 1; i++) {
            const from = path[i];
            const to   = path[i + 1];

            if (from.isSwitch) {
                // Switch forwarding from its perspective
                const known = !!from.macTable[to.mac];
                from.macTable[sourceNode.mac] = sourceNode.id;
                if (known) {
                    this.logger('Protocol', `[Switch ${from.name}] Known MAC → forwarding to ${to.name}`, 'system-msg');
                } else {
                    this.logger('Protocol', `[Switch ${from.name}] Unknown MAC → flooding all ports`, 'system-msg');
                }
                this.packetAnimator._highlightSwitch(from, known ? 0x64ffda : 0x4facfe);

                // Decision label on the switch
                const lbl = this.packetAnimator._createFloatingLabel(
                    known ? '🔀 Forwarding (Known MAC)' : '🔀 Flooding (Unknown MAC)',
                    known ? `Unicast → ${to.name}` : 'Broadcast → all ports',
                    from.group.position.clone().add({ x: 0, y: 5, z: 0 }),
                    known ? '#64ffda' : '#4facfe'
                );
                setTimeout(() => this.packetAnimator._removeFloatingLabel(lbl, 0),
                    this.packetAnimator._dur(0.8) * 1000);
            }

            await this.packetAnimator.animatePacket(from, to, type);

            // Switch learns source MAC on incoming frame
            if (to.isSwitch) {
                to.macTable[from.mac] = from.id;
            }
        }
    }

    /** Final Validation: Is there ANY physical path between these nodes? */
    _hasPhysicalPath(sourceId, targetId) {
        if (!sourceId || !targetId) return false;
        const path = this._findPath(sourceId, targetId);
        return path && path.length >= 2;
    }

    // ── Switch helpers ──────────────────────────────────────────────

    /** Flood from switch to all reachable non-source nodes */
    async _switchFlood(switchNode, sourceNode, allBroadcastNodes, type) {
        switchNode.macTable[sourceNode.mac] = sourceNode.id;
        const targets = allBroadcastNodes.filter(n => n.id !== sourceNode.id && n.id !== switchNode.id && !n.isSwitch);
        if (targets.length === 0) return;
        this.logger('Protocol', `[Switch ${switchNode.name}] Flooding frame on all ports (MAC unknown)`, 'system-msg');
        this.packetAnimator._highlightSwitch(switchNode, 0x4facfe);
        await Promise.all(targets.map(t => this.packetAnimator.animatePacket(switchNode, t, type)));
    }

    /** Unicast or flood from switch depending on MAC table */
    async _switchUnicast(switchNode, sourceNode, targetNode, type) {
        switchNode.macTable[sourceNode.mac] = sourceNode.id;
        const known = !!switchNode.macTable[targetNode.mac];
        this.packetAnimator._highlightSwitch(switchNode, known ? 0x64ffda : 0x4facfe);
        if (known) {
            this.logger('Protocol', `[Switch ${switchNode.name}] Known MAC — forwarding to ${targetNode.name}`, 'system-msg');
            await this.packetAnimator.animatePacket(switchNode, targetNode, type);
        } else {
            this.logger('Protocol', `[Switch ${switchNode.name}] Unknown MAC — flooding all ports`, 'system-msg');
            const others = this.getBroadcastDomain(switchNode.id).filter(n => n.id !== sourceNode.id && !n.isSwitch);
            await Promise.all(others.map(t => this.packetAnimator.animatePacket(switchNode, t, type)));
        }
    }

    /** Returns the first switch directly connected to node via links, or null. */
    _findNearestSwitch(node) {
        for (const nid of node.links) {
            const n = this.nodeManager.getNodeById(nid);
            if (n && n.isSwitch) return n;
        }
        return null;
    }

    // ── Core ARP resolution with timeout + retry ────────────────────

    // ── Cache Logic ────────────────────────────────────────────────

    _cleanCache(node) {
        const now = Date.now();
        const timeout = 30000; // 30s expiry
        Object.keys(node.arpCache).forEach(ip => {
            if (now - node.arpCache[ip].timestamp > timeout) {
                delete node.arpCache[ip];
                this.logger('System', `ARP Cache entry EXPIRED for ${ip} on ${node.name}`, 'warn-msg');
            }
        });
        if (this.onTableUpdated) this.onTableUpdated(node);
    }

    // ── Core ARP resolution with timeout + retry ────────────────────

    /**
     * Resolve an IP to a MAC using ARP.
     * maxRetries = 3, timeout per attempt = 2s.
     * Returns MAC string or null on failure.
     */
    async resolveArp(sourceNode, targetIp) {
        if (!sourceNode || !targetIp) return null;

        // 1. Check ARP cache and handle Hits
        this._cleanCache(sourceNode);
        if (sourceNode.arpCache[targetIp]) {
            const cached = sourceNode.arpCache[targetIp].mac;
            const targetNode = this.nodeManager.nodes.find(n => n.ip === targetIp);
            if (targetNode) {
                this.logger('Protocol', `[Cache HIT] ${sourceNode.name} skipping broadcast – entry for ${targetIp} still valid`, 'success-msg');
                await this.packetAnimator.animateCacheHit(sourceNode, targetNode, cached);
                return cached;
            }
        }

        // 2. Cache Miss - Animate & proceed to ARP Request
        this.logger('Protocol', `[Cache MISS] No valid entry for ${targetIp} found – initiating ARP Request flow…`, 'info');
        await this.packetAnimator.animateCacheMiss(sourceNode, targetIp);

        const maxRetries = 3;
        const timeoutMs  = 2000;

        for (let attempt = 1; attempt <= maxRetries; attempt++) {
            // Visualize retry label but only show 'Final Failure' after maxRetries
            if (attempt > 1) {
                this.logger('Warning', `[ARP] Retry ${attempt-1}/${maxRetries-1} retransmitting for ${targetIp}…`, 'warn-msg');
            }

            if (this.simulationMode === 'failure') {
                await this.packetAnimator.animateTimeout(sourceNode, attempt, attempt === maxRetries);
                continue;
            }

            const broadcastNodes = this.getBroadcastDomain(sourceNode.id);
            if (broadcastNodes.length === 0) return null;

            this.logger('Protocol', `[ARP] ${sourceNode.name} broadcasts: "Who has ${targetIp}?" (attempt ${attempt}/${maxRetries})`, 'info');

            const switches = broadcastNodes.filter(n => n.isSwitch);
            const nearestSwitch = this._findNearestSwitch(sourceNode);
            
            if (nearestSwitch) {
                await this.packetAnimator.animatePacket(sourceNode, nearestSwitch, 'arp_req');
                await this._switchFlood(nearestSwitch, sourceNode, broadcastNodes, 'arp_req');
            } else {
                await this.packetAnimator.animateBroadcast(sourceNode, broadcastNodes.filter(n => !n.isSwitch), 'arp_req');
            }

            // Find responders (direct match, WAN match, or Proxy ARP)
            const endNodes = broadcastNodes.filter(n => !n.isSwitch);
            let responders = endNodes.filter(n => n.ip === targetIp || (n.isRouter && n.wanIp === targetIp));

            // Proxy ARP (Only intercept if enabled AND no local node matched AND target is remote)
            if (this.proxyArpEnabled && responders.length === 0) {
                const proxyRouters = endNodes.filter(n => n.isRouter);
                if (proxyRouters.length > 0 && !this.isSameSubnet(sourceNode, targetIp)) {
                    this.logger('Warning', `[Proxy ARP] Router ${proxyRouters[0].name} intercepting request for ${targetIp}`, 'warn-msg');
                    responders = [proxyRouters[0]];
                }
            }

            // Attack mode: inject fake responder
            if (this.simulationMode === 'attack') {
                const attackers = endNodes.filter(n => !n.isRouter && n.ip !== targetIp);
                if (attackers.length > 0) {
                    this.logger('Warning', `[ATTACK] ${attackers[0].name} injecting fake ARP reply!`, 'error-msg');
                    responders = [attackers[0]];
                    if (this.aiGuardian) this.aiGuardian.reportAnomaly('spoofing', sourceNode, { attackerMac: attackers[0].mac, spoofedIp: targetIp });
                }
            }

            // Duplicate IP conflict
            if (responders.length > 1) {
                this.logger('Error', `[ARP Conflict] Multiple devices responded for ${targetIp}! Duplicate IP detected.`, 'error-msg');
                await Promise.all(responders.map(r => this.packetAnimator.animatePacket(r, sourceNode, 'error')));
                if (this.aiGuardian) this.aiGuardian.reportAnomaly('duplicate_ip', sourceNode);
                return null;
            }

            if (responders.length === 0) {
                // Wait for timeout before retrying
                await this._animateTimeout(sourceNode, attempt);
                continue;
            }

            // SUCCESS — unicast reply (travels back hop-by-hop through switches)
            const targetNode = responders[0];
            this.logger('Protocol', `[ARP] ${targetIp} is at ${targetNode.mac}`, 'success-msg');

            if (switches.length > 0) {
                // Switch now knows target MAC, so unicast reply
                const sw = this._findNearestSwitch(targetNode) || switches[0];
                sw.macTable[targetNode.mac] = targetNode.id;
                await this.packetAnimator.animatePacket(targetNode, sw, 'arp_rep');
                await this._switchUnicast(sw, targetNode, sourceNode, 'arp_rep');
            } else {
                // No switch — direct unicast reply
                await this._sendViaPath(targetNode, sourceNode, 'arp_rep');
            }

            // ARP cache update: ONLY requester updates after receiving the reply
            const entry = { mac: targetNode.mac, timestamp: Date.now() };
            sourceNode.arpCache[targetIp] = entry;

            this.logger('System', `${sourceNode.name} updated ARP cache for ${targetIp}.`, 'system-msg');

            if (this.onTableUpdated) this.onTableUpdated(sourceNode);
            return targetNode.mac;
        }

        // All retries exhausted
        this.logger('Error', `[ARP Failed] No response for ${targetIp} after ${maxRetries} attempts. Destination unreachable.`, 'error-msg');
        await this.packetAnimator.animateProtocolFailure(sourceNode, 'ARP', `${targetIp} unreachable`);
        return null;
    }

    /** Short async delay simulating a 2-second ARP timeout, with animation */
    async _animateTimeout(sourceNode, attempt) {
        const timeoutMs = 2000 / (this.packetAnimator.speed ?? 1);
        await this.packetAnimator.animateTimeout(sourceNode, attempt);
        await new Promise(r => setTimeout(r, Math.min(timeoutMs, 3000)));
    }

    // ── Public simulation entry points ──────────────────────────────

    async runARP(sourceNode, targetIp) {
        this._lastCall = () => this.runARP(sourceNode, targetIp);
        
        // 1. Initial State Checks
        if (!sourceNode.ip) {
            this.logger('Error', `[Rule Violation] Run RARP first! ${sourceNode.name} has no IP address.`, 'error-msg');
            return;
        }

        const targetNode = this.nodeManager.nodes.find(n => n.ip === targetIp);
        if (!targetNode) {
            this.logger('Error', `ARP Error: Destination IP ${targetIp} not found in current workspace.`, 'error-msg');
            return;
        }

        // 2. Connectivity Validation (Physical Layer Audit)
        if (!this._hasPhysicalPath(sourceNode.id, targetNode.id)) {
            this.logger('Error', `Network Unreachable: No physical link exists between ${sourceNode.name} and ${targetNode.name}.`, 'error-msg');
            await this.packetAnimator.animateProtocolFailure(sourceNode, 'Physical', 'No Link');
            return;
        }

        // 3. Routing Upgrade: If target is remote, use Routing Flow instead of local ARP
        if (!this.isSameSubnet(sourceNode, targetIp)) {
            this.logger('Warning', `[Subnet Bridge] ${targetIp} is on a different network. Upgrading to Routing Flow via Gateway…`, 'warn-msg');
            await this.runRoutingFlow(sourceNode, targetNode);
            return;
        }

        // 4. Local ARP handling
        const path = this._findPath(sourceNode.id, targetNode.id);
        await this.packetAnimator.highlightPath(path);
        await this.resolveArp(sourceNode, targetIp);
    }

    async runRARP(sourceNode, targetMac) {
        this._lastCall = () => this.runRARP(sourceNode, targetMac);
        const isUnknown = !sourceNode.ip;
        const currentIpText = isUnknown ? "Unknown" : sourceNode.ip;
        
        // Protocol Rule: Selection must be a device
        if (sourceNode.isSwitch || sourceNode.isRouter) {
            this.logger('Error', `[Rule Violation] Only end devices should request RARP configuration.`, 'error-msg');
            return;
        }

        // 🟢 Graph Check: Physical Path to ANY server (router or device)
        const domain = this.getBroadcastDomain(sourceNode.id);
        if (domain.length === 0) {
            this.logger('Error', `Physical Error: ${sourceNode.name} is isolated from the network. Connect a link first.`, 'error-msg');
            await this.packetAnimator.animateProtocolFailure(sourceNode, 'Physical', 'Isolated Node');
            return;
        }

        this.logger('Protocol', `[RARP] ${sourceNode.name} (${currentIpText}) broadcasting: "My MAC is ${targetMac}, what is my IP?"`, 'info');

        const broadcastNodes = this.getBroadcastDomain(sourceNode.id);
        if (broadcastNodes.length === 0) {
            this.logger('Error', `${sourceNode.name} has no connections!`, 'error-msg');
            return;
        }

        // Visualize broadcast through switches
        const switches = broadcastNodes.filter(n => n.isSwitch);
        const servers = broadcastNodes.filter(n => n.isRarpServer);

        if (switches.length > 0) {
            const sw = this._findNearestSwitch(sourceNode) || switches[0];
            await this.packetAnimator.animatePacket(sourceNode, sw, 'rarp_req');
            await this._switchFlood(sw, sourceNode, broadcastNodes, 'rarp_req');
        } else {
            await this.packetAnimator.animateBroadcast(sourceNode, broadcastNodes.filter(n => !n.isSwitch), 'rarp_req');
        }

        // Use the router as the implicit RARP server
        const implicitServer = broadcastNodes.find(n => n.isRouter) || broadcastNodes.find(n => n.id !== sourceNode.id);
        
        if (!implicitServer) {
            this.logger('Error', `[RARP] Cannot configure. ${sourceNode.name} is isolated.`, 'error-msg');
            return;
        }

        const server = implicitServer;
        await this.packetAnimator.animateServerLookup(server);
        
        // Subnet dynamic mapping
        let prefix = '192.168.1';
        if (server.isRouter && server.ip) {
            const parts = server.ip.split('.');
            prefix = `${parts[0]}.${parts[1]}.${parts[2]}`;
        }

        const targetIp = `${prefix}.${Math.floor(Math.random() * 253) + 2}`;
        const nodeIp = targetIp;
        this.logger('Protocol', `[RARP] ${server.name} replies: "MAC ${targetMac} is mapped to IP ${nodeIp}"`, 'success-msg');
        
        // Highlight reply path
        const path = this._findPath(server.id, sourceNode.id);
        await this.packetAnimator.highlightPath(path);

        // Unicast reply path (through switches)
        if (path.length > 2) {
            await this._sendViaPath(server, sourceNode, 'rarp_rep');
        } else {
            await this.packetAnimator.animatePacket(server, sourceNode, 'rarp_rep');
        }

        // Final state update: Assign IP and notify UI
        sourceNode.ip = nodeIp;
        this.logger('System', `${sourceNode.name} IP configured successfully: ${nodeIp}`, 'success-msg');
        
        // Update 3D label and UI panel
        if (sourceNode.group.children.find(c => c instanceof CSS2DObject)) {
            const labelObj = sourceNode.group.children.find(c => c instanceof CSS2DObject);
            const ipEl = labelObj.element.querySelector('.node-ip');
            if (ipEl) ipEl.textContent = nodeIp;
        }
        if (this.onTableUpdated) this.onTableUpdated(sourceNode);
    }

    async runRoutingFlow(sourceNode, targetNode) {
        this._lastCall = () => this.runRoutingFlow(sourceNode, targetNode);
        const targetIp = targetNode.ip;
        
        // 1. Determine if Target is Local (Same Subnet) or Remote (Different Subnet)
        const isLocal = this.isSameSubnet(sourceNode, targetIp);
        
        if (isLocal) {
            this.logger('Protocol', `[LOCAL] Target ${targetIp} in same subnet. Checking ARP Cache…`, 'info');
            const mac = await this.resolveArp(sourceNode, targetIp);
            if (mac) {
                this.logger('Success', `[ARP] Resolved ${targetIp} → ${mac}. Sending ICMP Echo…`, 'success-msg');
                await this._sendViaPath(sourceNode, targetNode, 'rarp_rep'); 
                this.logger('Success', `Delivery Successful from ${sourceNode.name} to ${targetNode.name}`, 'success-msg');
            }
        } else {
            // 2. REMOTE Routing (Multi-Hop Supported)
            this.logger('Protocol', `[REMOTE] Target ${targetIp} is in a different subnet. Routing multi-hop…`, 'warn-msg');
            
            // 🛑 NEW: Auto-Gateway Discovery Logic
            if (!sourceNode.gateway) {
                this.logger('System', `No Gateway configured on ${sourceNode.name}. Searching local subnet for routers…`, 'info');
                const localNodes = this.getBroadcastDomain(sourceNode.id);
                const localRouter = localNodes.find(n => n.isRouter && this.isSameSubnet(sourceNode, n.ip));
                if (localRouter) {
                    sourceNode.gateway = localRouter.ip;
                    this.logger('System', `Auto-assigned Default Gateway: ${sourceNode.gateway} (via ${localRouter.name})`, 'success-msg');
                } else {
                    this.logger('Error', `Routing Error: No Default Gateway found on local subnet.`, 'error-msg');
                    await this.packetAnimator.animateProtocolFailure(sourceNode, 'Routing', 'No Path');
                    return;
                }
            }

            // A: Final Connectivity Validation (Physical Layer Audit)
            if (!this._hasPhysicalPath(sourceNode.id, targetNode.id)) {
                this.logger('Error', `Physical Error: No link path exists between ${sourceNode.name} and ${targetNode.name}.`, 'error-msg');
                await this.packetAnimator.animateProtocolFailure(sourceNode, 'Path', 'No Connection');
                return;
            }

            // A: Find the logical path of routers (L3 Hops)
            const physicalPath = this._findPath(sourceNode.id, targetNode.id);
            if (physicalPath.length < 2) {
                this.logger('Error', `Routing Error: Destination ${targetNode.name} unreachable in logical graph.`, 'error-msg');
                return;
            }

            const routersOnPath = physicalPath.filter(n => n.isRouter);
            if (routersOnPath.length === 0) {
                 this.logger('Error', `Routing Error: Destination is remote but no router bridges the networks.`, 'error-msg');
                 return;
            }

            // Sequential Hops
            let currentHop = sourceNode;
            let nextHop   = null;

            // Step-by-step resolution from current toward the target
            for (let i = 0; i < routersOnPath.length; i++) {
                nextHop = routersOnPath[i];
                
                // If the nextHop is in a different broadcast domain, we must resolve it
                this.logger('Protocol', `Forwarding to Router Hop ${i+1}: ${nextHop.name}…`, 'info');
                
                // ARP for next hop's interface
                // Devices use their Gateway IP (LAN); Routers use the neighbor's WAN IP (Interconnect)
                const resolveIp = (currentHop === sourceNode) ? sourceNode.gateway : (nextHop.wanIp || nextHop.ip);
                const mac = await this.resolveArp(currentHop, resolveIp);
                
                if (!mac) {
                    this.logger('Error', `Routing Timeout: Gateway ${resolveIp} is unreachable from ${currentHop.name}.`, 'error-msg');
                    return;
                }

                await this._sendViaPath(currentHop, nextHop, 'rarp_rep');
                currentHop = nextHop; // Update current position to router
            }

            // Final Hop: Last Router resolves the Target Device
            this.logger('Protocol', `[Final Hop] ${currentHop.name} resolving ${targetIp} on target subnet…`, 'info');
            const targetMac = await this.resolveArp(currentHop, targetIp);
            if (targetMac) {
                this.logger('Success', `Routed! Final delivery to ${targetNode.name}.`, 'success-msg');
                await this._sendViaPath(currentHop, targetNode, 'rarp_rep');
                this.logger('Success', `ICMP Echo Response: End-to-End Success (${sourceNode.ip} ↔ ${targetIp})`, 'success-msg');
            } else {
                this.logger('Error', `Router ${currentHop.name} failed to resolve ${targetIp} locally.`, 'error-msg');
            }
        }
    }

    async simulateSpoofing(attackerNode, victimNode, targetIpToSpoof) {
        this._lastCall = () => this.simulateSpoofing(attackerNode, victimNode, targetIpToSpoof);
        this.logger('Warning', `[SPOOF] ${attackerNode.name} sends unsolicited ARP reply to ${victimNode.name}…`, 'warn-msg');
        await this.packetAnimator.animatePacket(attackerNode, victimNode, 'error');
        victimNode.arpCache[targetIpToSpoof] = attackerNode.mac;
        this.logger('Error', `${victimNode.name} ARP table poisoned! ${targetIpToSpoof} → ${attackerNode.mac}`, 'error-msg');
        if (this.aiGuardian) this.aiGuardian.reportAnomaly('spoofing', victimNode, { attackerMac: attackerNode.mac, spoofedIp: targetIpToSpoof });
        if (this.onTableUpdated) this.onTableUpdated(victimNode);
    }

    replay() {
        if (this._lastCall) {
            this.packetAnimator.clearAll();
            this._lastCall();
        }
    }

    // ── Prebuilt Scenarios ──────────────────────────────────────────

    async setupScenario(type) {
        this.nodeManager.nodes.forEach(n => { n.arpCache = {}; n.macTable = {}; });
        this.packetAnimator.clearAll();

        const nodes = this.nodeManager.nodes;
        if (nodes.length < 2) {
            this.logger('Error', 'Please add at least 2 nodes and a switch first.', 'error-msg');
            return;
        }

        const source = nodes[0];
        const target = nodes[1];

        if (type === 'arp_hit') {
            source.arpCache[target.ip] = { mac: target.mac, timestamp: Date.now() };
            this.logger('System', '[Scenario] ARP Cache Hit: Entry pre-loaded into cache.', 'system-msg');
            this.runARP(source, target.ip);
        } else if (type === 'arp_miss') {
            source.arpCache = {};
            this.logger('System', '[Scenario] ARP Cache Miss: Cache cleared for source.', 'system-msg');
            this.runARP(source, target.ip);
        } else if (type === 'rarp_ok') {
            source.ip = null;
            target.isRarpServer = true;
            this.logger('System', '[Scenario] RARP Success: Device IP reset, Server enabled.', 'system-msg');
            this.runRARP(source, source.mac);
        } else if (type === 'rarp_fail') {
            source.ip = null;
            nodes.forEach(n => n.isRarpServer = false);
            this.logger('System', '[Scenario] RARP Failure: No server in domain.', 'system-msg');
            this.runRARP(source, source.mac);
        }
    }
}
