import * as THREE from 'three';

export default class LinkManager {
    constructor(sceneManager) {
        this.sceneManager = sceneManager;
        this.links = [];
        this.lineMaterial = new THREE.LineBasicMaterial({ 
            color: 0x8892b0,
            transparent: true,
            opacity: 0.4 
        });
    }

    createLink(nodeA, nodeB) {
        // Prevent duplicate links
        if (this.links.find(l => (l.nodeA === nodeA && l.nodeB === nodeB) || (l.nodeA === nodeB && l.nodeB === nodeA))) {
            return null;
        }

        const geometry = new THREE.BufferGeometry();
        const positions = new Float32Array(6); // 2 vertices * 3 coordinates
        
        this.updateGeometryPositions(geometry, nodeA.group.position, nodeB.group.position);
        
        const line = new THREE.Line(geometry, this.lineMaterial);
        this.sceneManager.scene.add(line);

        const link = {
            id: THREE.MathUtils.generateUUID(),
            nodeA,
            nodeB,
            line
        };

        this.links.push(link);

        // Update node link refs
        nodeA.links.push(nodeB.id);
        nodeB.links.push(nodeA.id);

        return link;
    }

    removeLinksForNode(node) {
        const linksToRemove = this.links.filter(l => l.nodeA.id === node.id || l.nodeB.id === node.id);
        linksToRemove.forEach(link => {
            this.sceneManager.scene.remove(link.line);
            // Link removal from the other node's array
            const otherNode = link.nodeA.id === node.id ? link.nodeB : link.nodeA;
            otherNode.links = otherNode.links.filter(id => id !== node.id);
        });
        
        this.links = this.links.filter(l => l.nodeA.id !== node.id && l.nodeB.id !== node.id);
    }

    updateGeometryPositions(geometry, posA, posB) {
        const positions = new Float32Array([
            posA.x, posA.y, posA.z,
            posB.x, posB.y, posB.z
        ]);
        geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
        geometry.attributes.position.needsUpdate = true;
    }

    // Since nodes might hover/move slightly, update lines
    updateLines() {
        this.links.forEach(link => {
            this.updateGeometryPositions(link.line.geometry, link.nodeA.group.position, link.nodeB.group.position);
        });
    }
}
