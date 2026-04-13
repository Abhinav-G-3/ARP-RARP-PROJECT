import * as THREE from 'three';
import gsap from 'gsap';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';

export default class PacketAnimator {
    constructor(sceneManager) {
        this.sceneManager = sceneManager;

        // ── Configurable state ──────────────────────────────────────
        this.speed = 0.4;      // multiplier: lower = slower (default: slow + easy to follow)
        this.stepMode = false;
        this._stepResolve = null;

        // Track live scene objects so we can clearAll()
        this._activeLabels = [];
        this._activeArrows = [];
        this._activeMeshes = [];

        // Geometry cache
        this._sphereGeo = new THREE.SphereGeometry(0.45, 16, 16);
    }

    // ── Public API ──────────────────────────────────────────────────

    setSpeed(multiplier) { this.speed = parseFloat(multiplier); }
    setStepMode(on)      { this.stepMode = !!on; }

    /** Called by UI "Next Step" button in step mode */
    triggerNextStep() {
        if (this._stepResolve) {
            this._stepResolve();
            this._stepResolve = null;
        }
    }

    /** Waits for user click in step mode, resolves instantly otherwise */
    _waitForStep() {
        if (!this.stepMode) return Promise.resolve();
        return new Promise(resolve => { this._stepResolve = resolve; });
    }

    /** How many seconds a "base-1.0" animation takes, adjusted for speed */
    _dur(base) { return base / this.speed; }

    // ── Floating CSS2D Label ────────────────────────────────────────

    _createFloatingLabel(mainText, subText, worldPos, hexColor = '#64ffda') {
        const div = document.createElement('div');
        div.className = 'packet-label';
        div.innerHTML = `
            <div class="pl-main" style="color:${hexColor}">${mainText}</div>
            <div class="pl-sub">${subText}</div>
        `;
        div.style.opacity = '0';
        div.style.pointerEvents = 'none';

        const obj = new CSS2DObject(div);
        obj.position.copy(worldPos);
        this.sceneManager.scene.add(obj);
        this._activeLabels.push(obj);

        gsap.to(div, { opacity: 1, duration: this._dur(0.3), ease: 'power2.out' });

        return { obj, div };
    }

    _removeFloatingLabel(label, delay = 0) {
        gsap.to(label.div, {
            opacity: 0,
            delay,
            duration: this._dur(0.35),
            onComplete: () => {
                this.sceneManager.scene.remove(label.obj);
                this._activeLabels = this._activeLabels.filter(l => l !== label.obj);
            }
        });
    }

    // ── Arrow Helper ────────────────────────────────────────────────

    _spawnArrow(from, to, color) {
        const dir = new THREE.Vector3().subVectors(to, from).normalize();
        const length = Math.max(from.distanceTo(to) * 0.28, 6);
        const arrow = new THREE.ArrowHelper(dir, from.clone(), length, color, 2.5, 1.2);
        // Make the shaft semi-transparent
        arrow.line.material.transparent = true;
        arrow.line.material.opacity = 0.75;
        arrow.cone.material.transparent = true;
        arrow.cone.material.opacity = 0.9;
        this.sceneManager.scene.add(arrow);
        this._activeArrows.push(arrow);
        return arrow;
    }

    _removeArrow(arrow, delay = 0) {
        setTimeout(() => {
            gsap.to([arrow.line.material, arrow.cone.material], {
                opacity: 0,
                duration: this._dur(0.3),
                onComplete: () => {
                    this.sceneManager.scene.remove(arrow);
                    this._activeArrows = this._activeArrows.filter(a => a !== arrow);
                }
            });
        }, delay * 1000);
    }

    // ── Core Packet Animation ───────────────────────────────────────

    animatePacket(sourceNode, targetNode, type) {
        return new Promise((resolve) => {
            const { color, hexColor, mainText } = this._packetMeta(type, sourceNode, targetNode);
            const baseDur = this._dur(2.2);
            const from = sourceNode.group.position.clone();
            const to = targetNode.group.position.clone();

            // 1. Mesh
            const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.95 });
            const sphere = new THREE.Mesh(this._sphereGeo, mat);
            sphere.position.copy(from);
            this.sceneManager.scene.add(sphere);
            this._activeMeshes.push(sphere);

            // 2. Info Card
            const card = this._createPacketInfoCard(sourceNode, targetNode, type, mainText);
            this.sceneManager.scene.add(card);
            this._activeLabels.push(card);

            // 3. Arrow
            const arrow = this._spawnArrow(from, to, color);

            // 4. Animate
            const progress = { t: 0 };
            gsap.to(progress, {
                t: 1,
                duration: baseDur,
                ease: 'power2.inOut',
                onUpdate: () => {
                    sphere.position.lerpVectors(from, to, progress.t);
                    card.position.copy(sphere.position).add(new THREE.Vector3(0, 4, 0));
                    arrow.position.copy(sphere.position);
                    mat.opacity = 0.6 + 0.4 * Math.sin(progress.t * Math.PI * 6);
                },
                onComplete: () => {
                    this.sceneManager.scene.remove(sphere);
                    this.sceneManager.scene.remove(card);
                    this._removeArrow(arrow, 0.4);
                    this._activeMeshes = this._activeMeshes.filter(m => m !== sphere);
                    this._activeLabels = this._activeLabels.filter(l => l !== card);
                    
                    if (this.stepMode) {
                        this._stepResolve = resolve;
                    } else {
                        resolve();
                    }
                }
            });
        });
    }

    // ── Broadcast Animation ─────────────────────────────────────────

    async animateBroadcast(sourceNode, connectedNodes, type) {
        const isRarp = type === 'rarp_req';
        const color = isRarp ? 0xfadb14 : 0x4facfe;
        const mainText = isRarp ? '📡 RARP Request' : '📡 ARP Request';

        const from = sourceNode.group.position.clone();
        const above = from.clone().add(new THREE.Vector3(0, 7, 0));

        // Use the new Packet Info Card (Broadcast type)
        const infoCard = this._createPacketInfoCard(sourceNode, { mac: 'FF:FF:FF:FF' }, type, mainText);
        infoCard.position.copy(above);
        this.sceneManager.scene.add(infoCard);
        this._activeLabels.push(infoCard);
        
        // Wait a small bit for users to see the broadcast card
        await new Promise(r => setTimeout(r, 600));

        // ── Expanding broadcast rings ───────────────────────────────
        const ringCount = 3;
        for (let i = 0; i < ringCount; i++) {
            setTimeout(() => this._spawnBroadcastRing(from, color), i * this._dur(0.18) * 1000);
        }

        // Spawn outward static arrows toward all connected nodes
        const staticArrows = connectedNodes.map(target => {
            const a = this._spawnArrow(from, target.group.position.clone(), color);
            a.line.material.opacity = 0.35;
            a.cone.material.opacity = 0.5;
            return a;
        });

        // ── Step pause before flying packets ───────────────────────
        await this._waitForStep();

        // ── Fly individual packets to each node ─────────────────────
        if (connectedNodes.length > 0) {
            await Promise.all(connectedNodes.map(target => this.animatePacket(sourceNode, target, type)));
        }

        // Cleanup static arrows and card
        staticArrows.forEach(a => this._removeArrow(a, 0.2));
        this.sceneManager.scene.remove(infoCard);
        this._activeLabels = this._activeLabels.filter(l => l !== infoCard);
    }

    // ── Helpers ─────────────────────────────────────────────────────

    _spawnBroadcastRing(position, color) {
        const ringGeo = new THREE.RingGeometry(0.15, 0.9, 48);
        const ringMat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, side: THREE.DoubleSide });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.position.copy(position);
        ring.lookAt(this.sceneManager.camera.position);
        this.sceneManager.scene.add(ring);

        const dur = this._dur(1.8);
        gsap.to(ring.scale, { x: 70, y: 70, z: 70, duration: dur, ease: 'power1.out' });
        gsap.to(ringMat, {
            opacity: 0, duration: dur, ease: 'power1.in',
            onComplete: () => this.sceneManager.scene.remove(ring)
        });
    }

    _createHitBurst(position, color) {
        const geo = new THREE.SphereGeometry(1, 16, 16);
        const mat = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, wireframe: true });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.copy(position);
        this.sceneManager.scene.add(mesh);

        const dur = this._dur(0.55);
        gsap.to(mesh.scale, { x: 4.5, y: 4.5, z: 4.5, duration: dur, ease: 'power2.out' });
        gsap.to(mat, {
            opacity: 0, duration: dur, ease: 'power2.out',
            onComplete: () => this.sceneManager.scene.remove(mesh)
        });
    }

    _packetMeta(type, src, tgt) {
        switch (type) {
            case 'arp_req':
                return { color: 0x4facfe, hexColor: '#4facfe', mainText: '📡 ARP Request' };
            case 'rarp_req':
                return { color: 0x4facfe, hexColor: '#4facfe', mainText: '📡 RARP Request (Broadcast)' };
            case 'arp_rep':
                return { color: 0x64ffda, hexColor: '#64ffda', mainText: '✅ ARP Reply' };
            case 'rarp_rep':
                return { color: 0x64ffda, hexColor: '#64ffda', mainText: '✅ RARP Reply (Unicast)' };
            case 'error':
                return { color: 0xff4d4f, hexColor: '#ff4d4f', mainText: '❌ Error' };
            default:
                return { color: 0xffffff, hexColor: '#ffffff', mainText: type };
        }
    }

    /** Fast green unicast for Cache Hit */
    async animateCacheHit(sourceNode, targetNode, targetMac) {
        const from = sourceNode.group.position.clone();
        const to   = targetNode.group.position.clone();
        const mid  = from.clone().lerp(to, 0.5).add(new THREE.Vector3(0, 5, 0));

        const hitLabel = this._createFloatingLabel(
            '✅ Cache Hit',
            'No ARP Broadcast required',
            mid,
            '#64ffda'
        );

        // Faster, green color for cache hit
        const originalSpeed = this.speed;
        this.speed *= 2.5; // Fast beam
        await this.animatePacket(sourceNode, targetNode, 'arp_rep'); 
        this.speed = originalSpeed;

        setTimeout(() => this._removeFloatingLabel(hitLabel, this._dur(0.5)), 1000);
    }

    /** Miss indicator and start of ARP request */
    async animateCacheMiss(sourceNode, targetIp) {
        const pos = sourceNode.group.position.clone().add(new THREE.Vector3(0, 5, 0));
        const missLabel = this._createFloatingLabel(
            '🔍 Cache Miss',
            `Searching for ${targetIp}…`,
            pos,
            '#4facfe'
        );

        // Flash blue pulse
        this._spawnBroadcastRing(sourceNode.group.position, 0x4facfe);

        await new Promise(r => setTimeout(r, this._dur(0.8) * 1000));
        this._removeFloatingLabel(missLabel, 0);
    }

    // ── Switch highlight ─────────────────────────────────────────────

    /** Briefly flares a switch node's emissive to show it's processing */
    _highlightSwitch(switchNode, color = 0x00ffe7) {
        const orig = switchNode.core.material.emissiveIntensity;
        gsap.to(switchNode.core.material, {
            emissiveIntensity: 2.5,
            duration: this._dur(0.2),
            yoyo: true,
            repeat: 3,
            onComplete: () => { switchNode.core.material.emissiveIntensity = orig; }
        });
        switchNode.core.material.emissive.setHex(color);
        setTimeout(() => switchNode.core.material.emissive.setHex(0x00ffe7),
            this._dur(0.8) * 1000);
    }

    /** Hop-by-hop packet: node → switch → node, highlighting switch */
    async animateHopPacket(sourceNode, switchNode, targetNode, type, decision = 'unicast') {
        // 1. Node → Switch
        await this.animatePacket(sourceNode, switchNode, type);

        // 2. Switch decision highlight
        const decisionColor = decision === 'broadcast' ? 0x4facfe : 0x64ffda;
        this._highlightSwitch(switchNode, decisionColor);

        const decLabel = this._createFloatingLabel(
            decision === 'broadcast' ? '🔀 Flooding (Unknown MAC)' : '🔀 Forwarding (Known MAC)',
            decision === 'broadcast' ? 'Broadcast → all ports' : `Unicast → ${targetNode.name}`,
            switchNode.group.position.clone().add(new THREE.Vector3(0, 5, 0)),
            decision === 'broadcast' ? '#4facfe' : '#64ffda'
        );

        await new Promise(r => setTimeout(r, this._dur(0.5) * 1000));
        this._removeFloatingLabel(decLabel, 0);

        // 3. Switch → Target
        if (decision === 'broadcast') {
            // animateBroadcast from switch to all except source & switch
            const targets = Array.isArray(targetNode) ? targetNode : [targetNode];
            await this.packetAnimator?.animateBroadcast(switchNode, targets, type)
                ?? await Promise.all(targets.map(t => this.animatePacket(switchNode, t, type)));
        } else {
            await this.animatePacket(switchNode, targetNode, type);
        }
    }

    // ── Timeout & Failure ────────────────────────────────────────────

    /** Pulsing orange rings + "Retry X/3" floating label */
    animateTimeout(sourceNode, attempt, isFinal = false) {
        return new Promise(resolve => {
            const pos   = sourceNode.group.position.clone().add(new THREE.Vector3(0, 5, 0));
            let mainText = `⏱ Retrying (${attempt}/3)`;
            let subText = 'No response received…';
            let color = '#faad14';

            if (isFinal) {
                mainText = '❌ Request Timed Out';
                subText = 'Final retry failed. Host unreachable.';
                color = '#ff4d4f';
            }

            const label = this._createFloatingLabel(mainText, subText, pos, color);

            const ringCount = 2;
            for (let i = 0; i < ringCount; i++) {
                setTimeout(() => {
                    this._spawnBroadcastRing(sourceNode.group.position, isFinal ? 0xff4d4f : 0xfaad14);
                }, i * 400);
            }

            setTimeout(() => {
                this._removeFloatingLabel(label, 0);
                resolve();
            }, this._dur(1.8) * 1000);
        });
    }

    /** Red X pulse + "ARP Failed" label — shown after all retries exhausted */
    animateProtocolFailure(sourceNode, label = 'Protocol', subtext = 'Resolution failed') {
        return new Promise(resolve => {
            const pos = sourceNode.group.position.clone().add(new THREE.Vector3(0, 6, 0));
            const floatLabel = this._createFloatingLabel(
                `❌ ${label} Failed`,
                subtext,
                pos,
                '#ff4d4f'
            );

            // Red burst
            this._createHitBurst(sourceNode.group.position.clone(), 0xff4d4f);

            // Flash the source node red
            const origEmissive = sourceNode.core.material.emissive.getHex();
            sourceNode.core.material.emissive.setHex(0xff4d4f);
            gsap.to(sourceNode.core.material, {
                emissiveIntensity: 2.0,
                duration: this._dur(0.15),
                yoyo: true,
                repeat: 5,
                onComplete: () => {
                    sourceNode.core.material.emissive.setHex(origEmissive);
                    sourceNode.core.material.emissiveIntensity = 0.6;
                }
            });

            setTimeout(() => {
                this._removeFloatingLabel(floatLabel, 0);
                resolve();
            }, this._dur(2.5) * 1000);
        });
    }

    async highlightPath(path) {
        if (!path || path.length < 2) return;
        const highlights = [];
        
        for (let i = 0; i < path.length - 1; i++) {
            const from = path[i].group.position;
            const to   = path[i+1].group.position;
            
            const points = [from, to];
            const geometry = new THREE.BufferGeometry().setFromPoints(points);
            const material = new THREE.LineBasicMaterial({ color: 0x64ffda, transparent: true, opacity: 0 });
            const line = new THREE.Line(geometry, material);
            
            this.sceneManager.scene.add(line);
            highlights.push({ line, material });
            
            gsap.to(material, { opacity: 0.8, duration: 0.4, yoyo: true, repeat: 1 });
        }
        
        await new Promise(r => setTimeout(r, 800));
        highlights.forEach(h => this.sceneManager.scene.remove(h.line));
    }

    async animateCacheHit(sourceNode, targetNode, mac) {
        const pos = sourceNode.group.position.clone().add(new THREE.Vector3(0, 5, 0));
        const label = this._createFloatingLabel('✅ ARP Cache HIT', `Found MAC ${mac} in local table`, pos, '#64ffda');
        
        // Fast green pulse
        const oldEmissive = sourceNode.core.material.emissive.getHex();
        sourceNode.core.material.emissive.setHex(0x64ffda);
        gsap.to(sourceNode.core.material, { emissiveIntensity: 2, duration: 0.2, yoyo: true, repeat: 1, 
            onComplete: () => { sourceNode.core.material.emissive.setHex(oldEmissive); sourceNode.core.material.emissiveIntensity = 0.6; }});
        
        await new Promise(r => setTimeout(r, 1200));
        this._removeFloatingLabel(label, 0.4);
    }

    async animateCacheMiss(sourceNode, targetIp) {
        const pos = sourceNode.group.position.clone().add(new THREE.Vector3(0, 5, 0));
        const label = this._createFloatingLabel('⚡ ARP Cache MISS', `Broadcasting to find MAC for ${targetIp}`, pos, '#faad14');
        
        // Quick slow orange pulse
        const oldEmissive = sourceNode.core.material.emissive.getHex();
        sourceNode.core.material.emissive.setHex(0xfaad14);
        gsap.to(sourceNode.core.material, { emissiveIntensity: 2, duration: 0.4, yoyo: true, repeat: 1,
            onComplete: () => { sourceNode.core.material.emissive.setHex(oldEmissive); sourceNode.core.material.emissiveIntensity = 0.6; }});

        await new Promise(r => setTimeout(r, 1500));
        this._removeFloatingLabel(label, 0.4);
    }

    async animateServerLookup(node) {
        const pos = node.group.position.clone().add(new THREE.Vector3(0, 4, 0));
        const label = this._createFloatingLabel('🔍 Server Lookup', 'Mapping MAC to IP address…', pos, '#fadb14');
        
        // Highlight server
        const mat = node.ring.material;
        const oldColor = mat.color.getHex();
        mat.color.set(0xfadb14);
        
        await new Promise(r => setTimeout(r, 1200));
        
        mat.color.set(oldColor);
        this._removeFloatingLabel(label, 0.4);
    }


    _createPacketInfoCard(src, dest, type, protoName) {
        const div = document.createElement('div');
        div.className = 'packet-info-card';
        // Broadcast check vs Unicast
        const isBroadcast = type.includes('req');
        const destMac = isBroadcast ? 'FF:FF:FF:FF:FF:FF' : dest.mac;
        
        let subtext = '';
        if (type === 'rarp_req') subtext = '<div class="pi-row"><span style="color:var(--text-muted)">"Who am I? (MAC &rarr; IP)"</span></div>';
        if (type === 'rarp_rep') subtext = '<div class="pi-row"><span style="color:var(--text-muted)">"Your IP is being assigned"</span></div>';

        div.innerHTML = `
            <span class="pi-proto">${protoName}</span>
            <div class="pi-row">
                <span>SRC MAC</span>
                <span class="pi-val">${src.mac}</span>
            </div>
            <div class="pi-row">
                <span>DST MAC</span>
                <span class="pi-val">${destMac}</span>
            </div>
            ${subtext}
        `;
        return new CSS2DObject(div);
    }

    clearAll() {
        this._activeLabels.forEach(l => this.sceneManager.scene.remove(l));
        this._activeLabels = [];
        this._activeArrows.forEach(a => this.sceneManager.scene.remove(a));
        this._activeArrows = [];
        this._activeMeshes.forEach(m => this.sceneManager.scene.remove(m));
        this._activeMeshes = [];
        if (this._stepResolve) { this._stepResolve(); this._stepResolve = null; }
    }
}
