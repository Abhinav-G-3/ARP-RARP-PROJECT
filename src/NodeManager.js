import * as THREE from 'three';
import { CSS2DObject } from 'three/examples/jsm/renderers/CSS2DRenderer.js';

export default class NodeManager {
  constructor(sceneManager) {
    this.sceneManager = sceneManager;
    this.nodes = [];
    this.selectedNodes = [];
    this.subnets = {}; // Subnet String -> Group Mesh
    this.edges = []; // Array of { from, to, line }
    
    // Core visual assets
    this.computerGeometry = new THREE.SphereGeometry(1.5, 32, 32);
    this.routerGeometry = new THREE.OctahedronGeometry(2.0, 0);
    this.switchGeometry = new THREE.CylinderGeometry(1.6, 1.6, 0.7, 6); // Hexagonal disc for switch
    this.ringGeometry = new THREE.TorusGeometry(2.5, 0.1, 16, 100);

    this.onSelectionChanged = null; // Callback for UI
    this._onNodeListChanged = null; // Callback for DragManager
    this._usedMacs = new Set();
    this._usedIps = new Set();
    this._subnetCounter = 1;
    this._wanCounter = 1;
  }

  generateUniqueIp(isRouter, isSwitch) {
      if (isRouter) {
          const lanIp = `192.168.${this._subnetCounter++}.1`;
          const wanIp = `10.0.0.${this._wanCounter++}`;
          this._usedIps.add(lanIp);
          this._usedIps.add(wanIp);
          return { ip: lanIp, wanIp: wanIp };
      }
      return null;
  }

  generateUniqueMac() {
      let mac;
      do {
          mac = Array(6).fill(0).map(() => 
              Math.floor(Math.random() * 256).toString(16).padStart(2, '0')
          ).join(':').toUpperCase();
      } while (this._usedMacs.has(mac));
      
      return mac;
  }

  // helper to get network address
  getNetworkAddress(ip, mask) {
      if (!ip || !mask) return null;
      const ipParts = ip.split('.').map(Number);
      const maskParts = mask.split('.').map(Number);
      if (ipParts.length !== 4 || maskParts.length !== 4) return null;
      return ipParts.map((part, i) => part & maskParts[i]).join('.');
  }

  createNode(name, ip, mask, gateway, mac, isRouter = false, isSwitch = false) {
    const group = new THREE.Group();
    
    // 1. GENERATE REQUIRED PROPERTIES (Before Visuals)
    // Handle MAC generation if not provided or duplicate
    if (!mac || mac === 'AUTO' || this._usedMacs.has(mac)) {
        mac = this.generateUniqueMac();
    }
    this._usedMacs.has(mac) || this._usedMacs.add(mac);

    // Handle IP generation for Infrastructure (Routers/Switches)
    let wanIp = null;
    if (isSwitch) {
        ip = null;
    } else if (ip === "" || ip === "Unknown") {
        if (isRouter) {
            const res = this.generateUniqueIp(true, false);
            ip = res.ip;
            wanIp = res.wanIp;
        } else {
            ip = "Unknown"; // Device starts empty for RARP
        }
    } else {
        this._usedIps.add(ip);
    }
    const finalIpStr = (ip === "Unknown" || !ip) ? "Unknown" : ip;
    const wanIpStr = (isRouter && wanIp) ? ` | WAN: ${wanIp}` : '';
    const ipDisplay = isSwitch ? '' : `<div class="node-ip">${finalIpStr}${wanIpStr}</div>`;

    // 2. CORE MESH SELECTION
    let geometry = this.computerGeometry;
    if (isSwitch) geometry = this.switchGeometry;
    if (isRouter) geometry = this.routerGeometry;

    // Visual differentiation (Standardized)
    let color = 0x4facfe; // Device
    let icon = '💻';
    let typeName = 'Device';
    
    if (isRouter) { 
        color = 0xfadb14; 
        icon = '📡'; 
        typeName = 'Router'; 
        if (name.includes('Node-')) name = `Router-${name.split('-')[1]}`;
    } else if (isSwitch) { 
        color = 0x64ffda; 
        icon = '🔀'; 
        typeName = 'Switch'; 
        if (name.includes('Node-')) name = `Switch-${name.split('-')[1]}`;
    }

    const material = new THREE.MeshPhongMaterial({
      color,
      emissive: color,
      emissiveIntensity: 0.8,
      shininess: 100
    });
    const core = new THREE.Mesh(geometry, material);

    // Ring mesh
    const ringMat = new THREE.MeshBasicMaterial({ 
        color, 
        transparent: true, 
        opacity: 0.6,
        side: THREE.DoubleSide
    });
    const ring = new THREE.Mesh(this.ringGeometry, ringMat);
    ring.rotation.x = Math.PI / 2;

    group.add(core);
    group.add(ring);

    // Enhanced Labels (Using FINAL generated IP)
    const nodeDiv = document.createElement('div');
    nodeDiv.className = 'node-label';
    nodeDiv.innerHTML = `
        <div class="node-type" style="color:${isRouter ? '#fadb14' : (isSwitch ? '#64ffda' : '#4facfe')}">${icon} ${typeName}</div>
        <div class="node-details">
            <div class="node-name">${name}</div>
            ${ipDisplay}
        </div>
    `;
    const labelObject = new CSS2DObject(nodeDiv);
    labelObject.position.set(0, 4.5, 0); 
    group.add(labelObject);
    
    // Positioning logic (keep existing)
    const subnetId = this.getNetworkAddress(ip, mask);
    
    if (subnetId && ip !== 'Unknown' && !isSwitch) {
        if (!this.subnets[subnetId]) {
            this.subnets[subnetId] = {
                basePosition: new THREE.Vector3(
                    (Math.random() - 0.5) * 80,
                    (Math.random() - 0.5) * 30,
                    (Math.random() - 0.5) * 80
                ),
                nodes: []
            };
            const zoneGeometry = new THREE.SphereGeometry(20, 32, 32);
            const zoneMaterial = new THREE.MeshBasicMaterial({ color, wireframe: true, transparent: true, opacity: 0.03 });
            const zoneMesh = new THREE.Mesh(zoneGeometry, zoneMaterial);
            zoneMesh.position.copy(this.subnets[subnetId].basePosition);
            this.sceneManager.scene.add(zoneMesh);
        }
        const spread = 12;
        group.position.set(
             this.subnets[subnetId].basePosition.x + (Math.random() - 0.5) * spread,
             this.subnets[subnetId].basePosition.y + (Math.random() - 0.5) * spread,
             this.subnets[subnetId].basePosition.z + (Math.random() - 0.5) * spread
        );
    } else {
        group.position.set(
            (Math.random() - 0.5) * 50,
            (Math.random() - 0.5) * 50,
            (Math.random() - 0.5) * 50
        );
    }

    // Node State
    const nodeObj = {
      id: THREE.MathUtils.generateUUID(),
      name,
      ip: ip === 'Unknown' ? null : ip,
      wanIp,
      mask,
      gateway,
      mac,
      isRouter,
      isSwitch,
      subnetId,
      group: group,
      core: core,
      ring: ring,
      arpCache: {},   // IP -> { mac, timestamp }
      macTable: {},   // Switch MAC table: MAC -> nodeId
      links: [],
      isRarpServer: name.toLowerCase().includes('server')
    };

    core.userData = { isNode: true, id: nodeObj.id };

    this.nodes.push(nodeObj);
    this.sceneManager.scene.add(group);

    if (this._onNodeListChanged) this._onNodeListChanged();

    return nodeObj;
  }

  addLink(nodeA, nodeB) {
      if (!nodeA || !nodeB || nodeA.id === nodeB.id) return null;
      
      // Prevent duplicates
      const exists = this.edges.some(e => 
          (e.from === nodeA.id && e.to === nodeB.id) || 
          (e.from === nodeB.id && e.to === nodeA.id)
      );
      if (exists) return null;

      // 1. Physical Adjacency (Graph Logic)
      nodeA.links.push(nodeB.id);
      nodeB.links.push(nodeA.id);

      // 2. Visual Representation (3D Line)
      const points = [nodeA.group.position, nodeB.group.position];
      const geometry = new THREE.BufferGeometry().setFromPoints(points);
      const material = new THREE.LineBasicMaterial({
          color: 0x64ffda,
          transparent: true,
          opacity: 0.2
      });
      const line = new THREE.Line(geometry, material);
      this.sceneManager.scene.add(line);

      const edgeObj = { from: nodeA.id, to: nodeB.id, line };
      this.edges.push(edgeObj);
      
      return edgeObj;
  }

  removeLink(nodeA, nodeB) {
      const edgeIdx = this.edges.findIndex(e => 
          (e.from === nodeA.id && e.to === nodeB.id) || 
          (e.from === nodeB.id && e.to === nodeA.id)
      );
      if (edgeIdx === -1) return;

      const edge = this.edges[edgeIdx];
      this.sceneManager.scene.remove(edge.line);
      this.edges.splice(edgeIdx, 1);

      nodeA.links = nodeA.links.filter(id => id !== nodeB.id);
      nodeB.links = nodeB.links.filter(id => id !== nodeA.id);
  }

  deleteSelected() {
      const nodesToDelete = [...this.selectedNodes];
      this.selectedNodes = [];
      
      nodesToDelete.forEach(node => {
          this.sceneManager.scene.remove(node.group);
          this.nodes = this.nodes.filter(n => n.id !== node.id);
          
          // Automatic Edge Cleanup
          const brokenEdges = this.edges.filter(e => e.from === node.id || e.to === node.id);
          brokenEdges.forEach(e => {
              this.sceneManager.scene.remove(e.line);
              // Update neighbor nodes to remove this node from their links
              const otherId = (e.from === node.id) ? e.to : e.from;
              const otherNode = this.getNodeById(otherId);
              if (otherNode) otherNode.links = otherNode.links.filter(id => id !== node.id);
          });
          this.edges = this.edges.filter(e => e.from !== node.id && e.to !== node.id);
      });
      
      if(this.onSelectionChanged) this.onSelectionChanged(this.selectedNodes);
      if(this._onNodeListChanged) this._onNodeListChanged();
      return nodesToDelete;
  }

  handleInteraction(intersect) {
    const object = intersect.object;
    if (object.userData && object.userData.isNode) {
      const node = this.getNodeById(object.userData.id);
      this.toggleSelection(node);
    }
  }

  toggleSelection(node) {
    const idx = this.selectedNodes.findIndex(n => n.id === node.id);
    if (idx > -1) {
      this.selectedNodes.splice(idx, 1);
      node.core.material.emissiveIntensity = 0.6;
    } else {
      this.selectedNodes.push(node);
      node.core.material.emissiveIntensity = 1.0;
    }

    if (this.onSelectionChanged) {
        this.onSelectionChanged(this.selectedNodes);
    }
  }

  deselectAll() {
      this.selectedNodes.forEach(node => {
        node.core.material.emissiveIntensity = 0.6;
      });
      this.selectedNodes = [];
      if(this.onSelectionChanged) this.onSelectionChanged(this.selectedNodes);
  }

  getNodeById(id) {
    return this.nodes.find(n => n.id === id);
  }

  update() {
    this.nodes.forEach(node => {
      node.ring.rotation.x += node.isRouter ? 0.02 : 0.01;
      node.ring.rotation.y += node.isRouter ? 0.01 : 0.005;
      // Skip Y-bobbing while the node is actively being dragged
      if (node._draggedY === undefined) {
        node.group.position.y += Math.sin(Date.now() * 0.001 + node.group.position.x) * 0.005;
      }
    });
  }
}
