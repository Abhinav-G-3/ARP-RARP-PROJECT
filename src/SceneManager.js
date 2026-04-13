import * as THREE from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { CSS2DRenderer } from 'three/examples/jsm/renderers/CSS2DRenderer.js';

export default class SceneManager {
  constructor(containerId) {
    this.container = document.getElementById(containerId);
    
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0b0c10);
    this.scene.fog = new THREE.FogExp2(0x0b0c10, 0.002);

    this.camera = new THREE.PerspectiveCamera(
      60,
      window.innerWidth / window.innerHeight,
      0.1,
      1000
    );
    this.camera.position.set(0, 30, 60);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.container.appendChild(this.renderer.domElement);

    this.labelRenderer = new CSS2DRenderer();
    this.labelRenderer.setSize(window.innerWidth, window.innerHeight);
    this.labelRenderer.domElement.style.position = 'absolute';
    this.labelRenderer.domElement.style.top = '0px';
    this.labelRenderer.domElement.style.pointerEvents = 'none';
    this.container.appendChild(this.labelRenderer.domElement);

    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.07;
    this.controls.screenSpacePanning = true;
    this.controls.minDistance = 10;
    this.controls.maxDistance = 200;
    // Right-click → rotate, Middle-click → pan, Left-click → reserved for DragControls
    this.controls.mouseButtons = {
      LEFT: null,           // Left-click: DragControls owns this
      MIDDLE: 2,            // THREE.MOUSE.DOLLY
      RIGHT: 0              // THREE.MOUSE.ROTATE
    };

    this.setupLighting();
    this.setupBackgroundParticles();

    this.bindEvents();
  }

  setupLighting() {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.4);
    this.scene.add(ambientLight);

    const dirLight = new THREE.DirectionalLight(0x64ffda, 0.8);
    dirLight.position.set(20, 50, 20);
    this.scene.add(dirLight);

    const pointLight = new THREE.PointLight(0x00d2ff, 1);
    pointLight.position.set(-20, 20, -20);
    this.scene.add(pointLight);
  }

  setupBackgroundParticles() {
    const geometry = new THREE.BufferGeometry();
    const count = 1000;
    const positions = new Float32Array(count * 3);

    for (let i = 0; i < count * 3; i++) {
        positions[i] = (Math.random() - 0.5) * 200;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    const material = new THREE.PointsMaterial({
        size: 0.2,
        color: 0x8892b0,
        transparent: true,
        opacity: 0.6,
        sizeAttenuation: true
    });

    this.particles = new THREE.Points(geometry, material);
    this.scene.add(this.particles);
  }

  bindEvents() {
    window.addEventListener('resize', this.onResize.bind(this));
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.labelRenderer.setSize(window.innerWidth, window.innerHeight);
  }

  update() {
    this.controls.update();

    // Slowly rotate particles
    if (this.particles) {
        this.particles.rotation.y += 0.0005;
        this.particles.rotation.x += 0.0002;
    }

    this.renderer.render(this.scene, this.camera);
    this.labelRenderer.render(this.scene, this.camera);
  }
}
