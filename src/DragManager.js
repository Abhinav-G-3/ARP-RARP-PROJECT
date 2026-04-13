import { DragControls } from 'three/examples/jsm/controls/DragControls.js';
import gsap from 'gsap';

export default class DragManager {
    /**
     * @param {import('./SceneManager.js').default} sceneManager
     * @param {import('./NodeManager.js').default} nodeManager
     */
    constructor(sceneManager, nodeManager) {
        this.sceneManager = sceneManager;
        this.nodeManager = nodeManager;

        // Store the original world position offset when drag starts
        // so we move the GROUP correctly (not just the core mesh)
        this._dragOffsetY = 0;
        this._dragging = false;

        // Keep a map: coreMesh.uuid -> nodeObj so we can find the node fast
        this._meshToNode = new Map();

        // We'll rebuild DragControls whenever a node is added/removed
        this._dragControls = null;
        this._rebuildControls();

        // NodeManager informs us anytime nodes change
        // We piggy-back on the existing onSelectionChanged hook
        // and also expose a public method for main.js to call after addNode
        this.nodeManager._onNodeListChanged = () => this._rebuildControls();
    }

    /** Call after any node is added or removed */
    _rebuildControls() {
        // Dispose old controls cleanly
        if (this._dragControls) {
            this._dragControls.dispose();
            this._dragControls = null;
        }

        // Rebuild mesh→node map
        this._meshToNode.clear();
        this.nodeManager.nodes.forEach(node => {
            this._meshToNode.set(node.core.uuid, node);
        });

        const draggableObjects = this.nodeManager.nodes.map(n => n.core);

        if (draggableObjects.length === 0) return;

        this._dragControls = new DragControls(
            draggableObjects,
            this.sceneManager.camera,
            this.sceneManager.renderer.domElement
        );

        // ── DRAG START ──────────────────────────────────────────────
        this._dragControls.addEventListener('dragstart', (event) => {
            const mesh = event.object;
            const node = this._meshToNode.get(mesh.uuid);
            if (!node) return;

            // Disable OrbitControls so camera doesn't rotate during drag
            this.sceneManager.controls.enabled = false;
            this._dragging = true;

            // Scale up for tactile "picked up" feel
            gsap.to(node.group.scale, {
                x: 1.25, y: 1.25, z: 1.25,
                duration: 0.2,
                ease: 'power2.out'
            });

            // Boost emissive glow while held
            node.core.material.emissiveIntensity = 1.5;
        });

        // ── DRAG (each frame) ────────────────────────────────────────
        this._dragControls.addEventListener('drag', (event) => {
            const mesh = event.object;
            const node = this._meshToNode.get(mesh.uuid);
            if (!node) return;

            // DragControls moves the mesh itself. We want the GROUP to follow instead.
            // Copy the new position to the group, then reset the core mesh local pos to (0,0,0).
            node.group.position.copy(mesh.position);
            mesh.position.set(0, 0, 0);   // keep core at group origin

            // Freeze Y-bobbing while dragging so it doesn't fight inertia
            node._draggedY = node.group.position.y;
        });

        // ── DRAG END ─────────────────────────────────────────────────
        this._dragControls.addEventListener('dragend', (event) => {
            const mesh = event.object;
            const node = this._meshToNode.get(mesh.uuid);
            if (!node) return;

            // Re-enable orbit after brief delay (prevents accidental click-orbit)
            setTimeout(() => {
                this.sceneManager.controls.enabled = true;
                this._dragging = false;
            }, 50);

            // Scale back to normal
            gsap.to(node.group.scale, {
                x: 1, y: 1, z: 1,
                duration: 0.3,
                ease: 'elastic.out(1, 0.5)'
            });

            // Return emissive to normal
            node.core.material.emissiveIntensity = 0.6;
            delete node._draggedY;
        });

        // ── HOVER ────────────────────────────────────────────────────
        this._dragControls.addEventListener('hoveron', (event) => {
            const node = this._meshToNode.get(event.object.uuid);
            if (node && !this._dragging) {
                gsap.to(node.core.material, { emissiveIntensity: 1.0, duration: 0.15 });
            }
        });

        this._dragControls.addEventListener('hoveroff', (event) => {
            const node = this._meshToNode.get(event.object.uuid);
            if (node && !this._dragging) {
                const isSelected = this.nodeManager.selectedNodes.some(s => s.id === node.id);
                gsap.to(node.core.material, {
                    emissiveIntensity: isSelected ? 1.0 : 0.6,
                    duration: 0.15
                });
            }
        });
    }

    /** Expose dragging state so NodeManager can skip bobbing while dragged */
    isDragging() {
        return this._dragging;
    }
}
