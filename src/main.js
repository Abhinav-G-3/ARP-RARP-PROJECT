import SceneManager from './SceneManager.js';
import NodeManager from './NodeManager.js';
import LinkManager from './LinkManager.js';
import NetworkLogic from './NetworkLogic.js';
import UIController from './UIController.js';
import PacketAnimator from './PacketAnimator.js';
import AIGuardian from './AIGuardian.js';
import DragManager from './DragManager.js';
import * as THREE from 'three';

class App {
  constructor() {
    this.init();
  }

  init() {
    // 1. Initialize Three.js Scene
    this.sceneManager = new SceneManager('canvas-container');

    // 2. Initialize Core Managers
    this.nodeManager = new NodeManager(this.sceneManager);
    this.linkManager = new LinkManager(this.sceneManager);
    this.packetAnimator = new PacketAnimator(this.sceneManager);
    this.aiGuardian = new AIGuardian();

    // 3. Initialize Shared State Logic
    this.networkLogic = new NetworkLogic(this.nodeManager, this.linkManager, this.packetAnimator, this.aiGuardian);

    // 4. Connect UI
    this.uiController = new UIController(this.networkLogic, this.sceneManager, this.nodeManager, this.packetAnimator);
    this.uiController.log('System', 'Simulator initialized. Welcome to the Network Protocol Simulator.', 'system-msg');

    // 5. Drag Controls (after UI so nodes can be added first)
    this.dragManager = new DragManager(this.sceneManager, this.nodeManager);

    // Create Raycaster for interactions
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();
    window.addEventListener('pointerdown', this.onPointerDown.bind(this));

    // 5. Start Render Loop
    this.animate();
  }

  onPointerDown(event) {
    if (event.target !== this.sceneManager.renderer.domElement) return;

    this.mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
    this.mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;

    this.raycaster.setFromCamera(this.mouse, this.sceneManager.camera);
    const intersects = this.raycaster.intersectObjects(this.sceneManager.scene.children, true);

    if (intersects.length > 0) {
      this.nodeManager.handleInteraction(intersects[0]);
    } else {
        this.nodeManager.deselectAll();
    }
  }

  animate() {
    requestAnimationFrame(this.animate.bind(this));
    this.sceneManager.update();
    this.nodeManager.update();
    this.linkManager.updateLines();
  }
}

window.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
});
