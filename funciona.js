// =====================================================
// Escena Primaveral 3D - Three.js
// Elementos: árboles, flores, casa, lago, mariposas, abejas,
// pájaros, conejo, persona, clima, partículas y sonido.
// =====================================================
(function () {
  'use strict';

  // ---------- utilidades ----------
  const rand = (a, b) => a + Math.random() * (b - a);
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const smoothstep = (a, b, x) => {
    const t = clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };
  const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
  const easeOutBack = (t) => {
    const c1 = 1.70158;
    const c3 = c1 + 1;
    return 1 + c3 * Math.pow(t - 1, 3) + c1 * Math.pow(t - 1, 2);
  };

  // ---------- renderer, escena y cámara ----------
  const contenedor = document.getElementById('contenedor');
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  contenedor.appendChild(renderer.domElement);

  const scene = new THREE.Scene();
  scene.fog = new THREE.Fog(0xbfe0ff, 80, 260);

  const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 1000);

  // ---------- estado global ----------
  let viento = 1;
  let tiempo = 0;
  const dia = { t: 0.28, auto: true, dir: 1 };

  // ---------- terreno ----------
  const LAKE = { x: 24, z: 16 };
  const CASA = { x: -8, z: -10 };

  function alturaTerreno(x, z) {
    const base = 1.6 * Math.sin(x * 0.06) * Math.cos(z * 0.05) + 0.7 * Math.sin(x * 0.13 + z * 0.09);
    const plano = smoothstep(18, 42, Math.hypot(x, z));
    const dl = Math.hypot(x - LAKE.x, z - LAKE.z);
    const hundimiento = 2.4 * (1 - smoothstep(6, 15, dl));
    return base * plano - hundimiento;
  }

  function esAgua(x, z) {
    return alturaTerreno(x, z) < -0.2;
  }

  function cercaDeCasa(x, z, margen) {
    return Math.abs(x - CASA.x) < 3.5 + margen && Math.abs(z - CASA.z) < 3 + margen;
  }

  function posicionLibre(rMin, rMax, distLago) {
    for (let i = 0; i < 150; i++) {
      const ang = rand(0, Math.PI * 2);
      const r = rand(rMin, rMax);
      const x = Math.cos(ang) * r;
      const z = Math.sin(ang) * r;
      if (esAgua(x, z)) continue;
      if (Math.hypot(x - LAKE.x, z - LAKE.z) < (distLago || 14)) continue;
      if (cercaDeCasa(x, z, 5)) continue;
      return { x: x, z: z };
    }
    return null;
  }

  const geoSuelo = new THREE.PlaneGeometry(240, 240, 120, 120);
  geoSuelo.rotateX(-Math.PI / 2);
  const posSuelo = geoSuelo.attributes.position;
  const coloresSuelo = new Float32Array(posSuelo.count * 3);
  const cVerde1 = new THREE.Color(0x6bbf3a);
  const cVerde2 = new THREE.Color(0x4f9f2f);
  const cArena = new THREE.Color(0xc9b27a);
  const tmpColor = new THREE.Color();
  for (let i = 0; i < posSuelo.count; i++) {
    const x = posSuelo.getX(i);
    const z = posSuelo.getZ(i);
    const h = alturaTerreno(x, z);
    posSuelo.setY(i, h);
    const n = 0.5 + 0.5 * Math.sin(x * 0.21) * Math.cos(z * 0.17);
    tmpColor.copy(cVerde2).lerp(cVerde1, n);
    if (h < -0.1) tmpColor.lerp(cArena, clamp((-0.1 - h) / 0.6, 0, 1));
    coloresSuelo[i * 3] = tmpColor.r;
    coloresSuelo[i * 3 + 1] = tmpColor.g;
    coloresSuelo[i * 3 + 2] = tmpColor.b;
  }
  geoSuelo.setAttribute('color', new THREE.BufferAttribute(coloresSuelo, 3));
  geoSuelo.computeVertexNormals();
  const suelo = new THREE.Mesh(geoSuelo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 }));
  suelo.receiveShadow = true;
  scene.add(suelo);

  // ---------- lago ----------
  const geoAgua = new THREE.RingGeometry(0.01, 14, 48, 10);
  geoAgua.rotateX(-Math.PI / 2);
  const posAgua = geoAgua.attributes.position;
  const baseAguaXZ = [];
  for (let i = 0; i < posAgua.count; i++) {
    baseAguaXZ.push(posAgua.getX(i), posAgua.getZ(i));
  }
  const agua = new THREE.Mesh(
    geoAgua,
    new THREE.MeshStandardMaterial({ color: 0x2f9bd8, transparent: true, opacity: 0.92, roughness: 0.05, metalness: 0.55, envMapIntensity: 1.3 })
  );
  agua.position.set(LAKE.x, -0.6, LAKE.z);
  scene.add(agua);

  // ---------- cielo, sol y luces ----------
  const uniformsCielo = {
    cArriba: { value: new THREE.Color(0x2f8be8) },
    cAbajo: { value: new THREE.Color(0xcfeaff) }
  };
  const domo = new THREE.Mesh(
    new THREE.SphereGeometry(450, 32, 16),
    new THREE.ShaderMaterial({
      uniforms: uniformsCielo,
      side: THREE.BackSide,
      depthWrite: false,
      fog: false,
      vertexShader: 'varying vec3 vPos; void main() { vPos = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }',
      fragmentShader: [
        'uniform vec3 cArriba;',
        'uniform vec3 cAbajo;',
        'varying vec3 vPos;',
        'void main() {',
        '  float t = clamp(vPos.y * 1.6, 0.0, 1.0);',
        '  gl_FragColor = vec4(mix(cAbajo, cArriba, pow(t, 0.7)), 1.0);',
        '  #include <colorspace_fragment>',
        '}'
      ].join('\n')
    })
  );
  domo.renderOrder = -1;
  scene.add(domo);

  const solMesh = new THREE.Mesh(
    new THREE.SphereGeometry(12, 24, 16),
    new THREE.MeshBasicMaterial({ color: 0xfff2a0, fog: false })
  );
  scene.add(solMesh);

  const luzSol = new THREE.DirectionalLight(0xfff4e0, 3);
  luzSol.castShadow = true;
  luzSol.shadow.mapSize.set(2048, 2048);
  luzSol.shadow.camera.left = -70;
  luzSol.shadow.camera.right = 70;
  luzSol.shadow.camera.top = 70;
  luzSol.shadow.camera.bottom = -70;
  luzSol.shadow.camera.near = 10;
  luzSol.shadow.camera.far = 400;
  luzSol.shadow.bias = -0.0005;
  luzSol.shadow.normalBias = 0.05;
  scene.add(luzSol);
  scene.add(luzSol.target);

  const luzCielo = new THREE.HemisphereLight(0xbfe3ff, 0x7aa05a, 1);
  scene.add(luzCielo);

  const sunDir = new THREE.Vector3();
  const colSolBajo = new THREE.Color(0xffd9a8);
  const colSolAlto = new THREE.Color(0xfffaf0);
  const cieloArribaBajo = new THREE.Color(0x4f93e0);
  const cieloArribaAlto = new THREE.Color(0x1f7be6);
  const horizonteBajo = new THREE.Color(0xcfe4f7);
  const horizonteAlto = new THREE.Color(0xcfeaff);

  function actualizarDia(t) {
    const ang = Math.PI * t;
    const e = Math.sin(ang);
    sunDir.set(-Math.cos(ang) * 0.9, e * 0.95 + 0.1, 0.45).normalize();
    luzSol.position.copy(sunDir).multiplyScalar(150);
    luzSol.intensity = 1.9 + 1.6 * e;
    luzSol.color.copy(colSolBajo).lerp(colSolAlto, smoothstep(0, 0.6, e));
    luzCielo.intensity = 0.95 + 0.45 * e;
    uniformsCielo.cArriba.value.copy(cieloArribaBajo).lerp(cieloArribaAlto, smoothstep(0, 0.7, e));
    uniformsCielo.cAbajo.value.copy(horizonteBajo).lerp(horizonteAlto, smoothstep(0, 0.7, e));
    scene.fog.color.copy(uniformsCielo.cAbajo.value);
    solMesh.position.copy(sunDir).multiplyScalar(380);
    if (Math.abs(t - ultimoT) > 0.04) regenerarEntorno();
  }

  // ---------- reflejos: el cielo se refleja en el lago y las ventanas ----------
  const pmrem = new THREE.PMREMGenerator(renderer);
  const escenaEntorno = new THREE.Scene();
  escenaEntorno.add(new THREE.Mesh(domo.geometry, domo.material));
  const solEntorno = new THREE.Mesh(new THREE.SphereGeometry(18, 16, 12), new THREE.MeshBasicMaterial({ color: 0xffffff }));
  escenaEntorno.add(solEntorno);
  const materialesReflejo = [agua.material];
  let entornoRT = null;
  let ultimoT = -1;

  function regenerarEntorno() {
    ultimoT = dia.t;
    solEntorno.position.copy(sunDir).multiplyScalar(380);
    const nuevo = pmrem.fromScene(escenaEntorno, 0.04, 0.1, 1000);
    materialesReflejo.forEach((m) => {
      m.envMap = nuevo.texture;
    });
    if (entornoRT) entornoRT.dispose();
    entornoRT = nuevo;
  }

  // ---------- nubes (giran despacio alrededor de la escena) ----------
  const nubes = [];
  const matNube = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, flatShading: true, emissive: 0x8a8a8a });
  for (let i = 0; i < 14; i++) {
    const g = new THREE.Group();
    const n = 4 + Math.floor(Math.random() * 3);
    for (let j = 0; j < n; j++) {
      const esfera = new THREE.Mesh(new THREE.SphereGeometry(rand(4, 8), 8, 6), matNube);
      esfera.position.set(j * 5 + rand(-1, 1), rand(-1, 1.5), rand(-2.5, 2.5));
      esfera.scale.y = 0.6;
      g.add(esfera);
    }
    g.userData.ang = rand(0, Math.PI * 2);
    g.userData.rad = rand(75, 140);
    g.userData.vel = rand(1, 2.5);
    g.position.set(Math.cos(g.userData.ang) * g.userData.rad, rand(20, 34), Math.sin(g.userData.ang) * g.userData.rad);
    nubes.push(g);
    scene.add(g);
  }

  // ---------- casa ----------
  function crearCasa() {
    const g = new THREE.Group();
    g.position.set(CASA.x, 0, CASA.z);

    const cuerpo = new THREE.Mesh(new THREE.BoxGeometry(6, 4, 5), new THREE.MeshStandardMaterial({ color: 0xf7e7c6, roughness: 0.9 }));
    cuerpo.position.y = 2;

    const geoTecho = new THREE.ConeGeometry(4.525, 2.8, 4);
    geoTecho.rotateY(Math.PI / 4);
    const techo = new THREE.Mesh(geoTecho, new THREE.MeshStandardMaterial({ color: 0xb8452f, roughness: 0.8, flatShading: true }));
    techo.position.y = 5.4;
    techo.scale.z = 5.6 / 6.4;

    const puerta = new THREE.Mesh(new THREE.BoxGeometry(1.1, 2.2, 0.15), new THREE.MeshStandardMaterial({ color: 0x7b4a2d }));
    puerta.position.set(0, 1.1, 2.55);

    const matMarco = new THREE.MeshStandardMaterial({ color: 0xffffff });
    const matVidrio = new THREE.MeshStandardMaterial({ color: 0x9fd4f5, emissive: 0x1d3d55, roughness: 0.08, metalness: 0.5 });
    materialesReflejo.push(matVidrio);
    [-2, 2].forEach((vx) => {
      const marco = new THREE.Mesh(new THREE.BoxGeometry(1.25, 1.25, 0.1), matMarco);
      marco.position.set(vx, 2.4, 2.52);
      const vidrio = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 0.12), matVidrio);
      vidrio.position.set(vx, 2.4, 2.55);
      g.add(marco, vidrio);
    });

    const chimenea = new THREE.Mesh(new THREE.BoxGeometry(0.8, 1.8, 0.8), new THREE.MeshStandardMaterial({ color: 0x9a6b57 }));
    chimenea.position.set(1.8, 6, -1);

    g.add(cuerpo, techo, puerta, chimenea);
    g.traverse((o) => {
      if (o.isMesh) {
        o.castShadow = true;
        o.receiveShadow = true;
      }
    });
    scene.add(g);

    // camino de piedra hacia la puerta
    const camino = new THREE.Mesh(
      new THREE.PlaneGeometry(1.6, 6).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0xcdbb94, roughness: 1 })
    );
    camino.position.set(CASA.x, 0.03, CASA.z + 5.5);
    camino.receiveShadow = true;
    scene.add(camino);
  }
  crearCasa();

  // camino circular del parque
  const PARQUE = { x: 4, z: 6, r: 8 };
  const anilloParque = new THREE.Mesh(
    new THREE.RingGeometry(PARQUE.r - 0.7, PARQUE.r + 0.7, 64).rotateX(-Math.PI / 2),
    new THREE.MeshStandardMaterial({ color: 0xd9c59a, roughness: 1 })
  );
  anilloParque.position.set(PARQUE.x, 0.03, PARQUE.z);
  anilloParque.receiveShadow = true;
  scene.add(anilloParque);

  // ---------- árboles ----------
  const balanceos = [];
  const matTronco = new THREE.MeshStandardMaterial({ color: 0x7a5230, roughness: 1 });
  const paletaCerezo = [0xffb7c5, 0xff9fb5, 0xffcfdc];
  const paletaArbol = [0x4caf50, 0x3f9a43, 0x62c15a];
  const matsCerezo = paletaCerezo.map((c) => new THREE.MeshStandardMaterial({ color: c, flatShading: true, roughness: 0.9 }));
  const matsArbol = paletaArbol.map((c) => new THREE.MeshStandardMaterial({ color: c, flatShading: true, roughness: 0.9 }));

  function crearArbol(x, z, tipo, escala) {
    const g = new THREE.Group();
    g.position.set(x, alturaTerreno(x, z), z);
    const tronco = new THREE.Mesh(new THREE.CylinderGeometry(0.25 * escala, 0.4 * escala, 3 * escala, 7), matTronco);
    tronco.position.y = 1.5 * escala;
    tronco.castShadow = true;
    const copa = new THREE.Group();
    copa.position.y = 3 * escala;
    const mats = tipo === 'cerezo' ? matsCerezo : matsArbol;
    for (let k = 0; k < 6; k++) {
      const bola = new THREE.Mesh(new THREE.IcosahedronGeometry(rand(1.2, 1.8) * escala, 1), pick(mats));
      bola.position.set(rand(-1.3, 1.3) * escala, rand(-0.3, 1.4) * escala, rand(-1.3, 1.3) * escala);
      bola.castShadow = true;
      bola.receiveShadow = true;
      copa.add(bola);
    }
    g.add(tronco, copa);
    scene.add(g);
    balanceos.push({ obj: copa, fase: rand(0, 6.28), amp: rand(0.02, 0.04) });
  }

  for (let i = 0; i < 10; i++) {
    const p = posicionLibre(20, 70);
    if (p) crearArbol(p.x, p.z, 'cerezo', rand(1.1, 1.6));
  }
  for (let i = 0; i < 14; i++) {
    const p = posicionLibre(20, 75);
    if (p) crearArbol(p.x, p.z, 'verde', rand(1, 1.5));
  }
  // dos cerezos junto a la casa
  crearArbol(CASA.x - 6, CASA.z + 3, 'cerezo', 1.5);
  crearArbol(CASA.x + 7, CASA.z + 2, 'cerezo', 1.3);

  // ---------- flores ----------
  const flores = [];
  const TIPOS_FLOR = ['tulipan', 'girasol', 'margarita'];

  function geoEstrella(puntas, rExt, rInt) {
    const forma = new THREE.Shape();
    const n = puntas * 2;
    for (let i = 0; i < n; i++) {
      const r = i % 2 === 0 ? rExt : rInt;
      const a = (i / n) * Math.PI * 2;
      const px = Math.cos(a) * r;
      const py = Math.sin(a) * r;
      if (i === 0) forma.moveTo(px, py);
      else forma.lineTo(px, py);
    }
    forma.closePath();
    return new THREE.ShapeGeometry(forma);
  }

  const geoTallo = new THREE.CylinderGeometry(1, 1, 1, 5);
  geoTallo.translate(0, 0.5, 0);
  const matTallo = new THREE.MeshStandardMaterial({ color: 0x3f8f3a, roughness: 0.9 });

  const geoGirasol = geoEstrella(14, 0.55, 0.3);
  const geoMargarita = geoEstrella(10, 0.32, 0.14);
  const geoCentroGirasol = new THREE.CylinderGeometry(0.28, 0.28, 0.08, 16).rotateX(Math.PI / 2);
  const geoCentroMargarita = new THREE.CylinderGeometry(0.11, 0.11, 0.05, 12).rotateX(Math.PI / 2);
  const matPetaloGirasol = new THREE.MeshStandardMaterial({ color: 0xffc400, side: THREE.DoubleSide });
  const matCentroGirasol = new THREE.MeshStandardMaterial({ color: 0x5b3a1a });
  const matPetaloMargarita = new THREE.MeshStandardMaterial({ color: 0xffffff, side: THREE.DoubleSide });
  const matCentroMargarita = new THREE.MeshStandardMaterial({ color: 0xffd23f });

  const geoTulipan = new THREE.LatheGeometry([
    new THREE.Vector2(0.001, 0),
    new THREE.Vector2(0.12, 0.06),
    new THREE.Vector2(0.2, 0.24),
    new THREE.Vector2(0.17, 0.4),
    new THREE.Vector2(0.08, 0.44)
  ], 10);
  const matsTulipan = [0xff3b5c, 0xffd23f, 0xb44bd8, 0xff8a3d, 0xff6fa5].map(
    (c) => new THREE.MeshStandardMaterial({ color: c, side: THREE.DoubleSide, roughness: 0.6 })
  );

  function crearFlor(x, z, tipo, delay) {
    const g = new THREE.Group();
    g.position.set(x, alturaTerreno(x, z), z);

    let alto;
    let grosor;
    let escalaCabeza;
    if (tipo === 'girasol') {
      alto = rand(1.7, 2.4);
      grosor = 0.055;
      escalaCabeza = 1.25;
    } else if (tipo === 'tulipan') {
      alto = rand(0.95, 1.4);
      grosor = 0.04;
      escalaCabeza = 1.5;
    } else {
      alto = rand(0.65, 1.05);
      grosor = 0.03;
      escalaCabeza = 1.5;
    }

    const tallo = new THREE.Mesh(geoTallo, matTallo);
    tallo.scale.set(grosor, 0.001, grosor);

    const cabeza = new THREE.Group();
    if (tipo === 'tulipan') {
      cabeza.add(new THREE.Mesh(geoTulipan, pick(matsTulipan)));
    } else {
      const inclinacion = new THREE.Group();
      inclinacion.rotation.x = -Math.PI / 2 + 0.35;
      if (tipo === 'girasol') {
        const centro = new THREE.Mesh(geoCentroGirasol, matCentroGirasol);
        centro.position.z = 0.03;
        inclinacion.add(new THREE.Mesh(geoGirasol, matPetaloGirasol), centro);
      } else {
        const centro = new THREE.Mesh(geoCentroMargarita, matCentroMargarita);
        centro.position.z = 0.02;
        inclinacion.add(new THREE.Mesh(geoMargarita, matPetaloMargarita), centro);
      }
      cabeza.add(inclinacion);
    }
    cabeza.scale.setScalar(0.0001);

    g.add(tallo, cabeza);
    g.userData = {
      tipo: tipo,
      alto: alto,
      grosor: grosor,
      escalaCabeza: escalaCabeza,
      tallo: tallo,
      cabeza: cabeza,
      crec: 0,
      delay: delay,
      fase: rand(0, 6.28),
      shake: 0
    };
    scene.add(g);
    flores.push(g);
    return g;
  }

  function actualizarFlores(dt) {
    for (let i = 0; i < flores.length; i++) {
      const f = flores[i];
      const u = f.userData;
      if (u.delay > 0) {
        u.delay -= dt;
        continue;
      }
      if (u.crec < 1) u.crec = Math.min(1, u.crec + dt / 2.4);
      const s = easeOutCubic(clamp(u.crec / 0.65, 0, 1));
      u.tallo.scale.y = Math.max(0.001, u.alto * s);
      u.cabeza.position.y = u.alto * s;
      const a = clamp((u.crec - 0.5) / 0.5, 0, 1);
      u.cabeza.scale.setScalar(a <= 0 ? 0.0001 : Math.max(0.0001, easeOutBack(a) * u.escalaCabeza));
      u.shake = Math.max(0, u.shake - dt * 1.2);
      f.rotation.z = Math.sin(tiempo * 1.6 + u.fase) * 0.06 * viento + Math.sin(tiempo * 14) * 0.1 * u.shake;
      f.rotation.x = Math.cos(tiempo * 1.3 + u.fase) * 0.04 * viento;
    }
  }

  // flores iniciales en grupos
  for (let c = 0; c < 16; c++) {
    const centro = posicionLibre(6, 50, 12);
    if (!centro) continue;
    const cantidad = 14 + Math.floor(Math.random() * 7);
    for (let k = 0; k < cantidad; k++) {
      const x = centro.x + rand(-5, 5);
      const z = centro.z + rand(-5, 5);
      if (esAgua(x, z) || cercaDeCasa(x, z, 1)) continue;
      crearFlor(x, z, pick(TIPOS_FLOR), rand(0, 6));
    }
  }
  // jardín al frente de la casa
  for (let k = 0; k < 12; k++) {
    const x = CASA.x - 5 + k * 0.9;
    if (Math.abs(x - CASA.x) < 1.2) continue;
    crearFlor(x, CASA.z + 3.6 + rand(-0.2, 0.2), pick(TIPOS_FLOR), rand(0, 4));
  }
  // flores dentro y alrededor del parque (lo primero que se ve al abrir la página)
  for (let k = 0; k < 55; k++) {
    const ang = rand(0, Math.PI * 2);
    const dentro = Math.random() < 0.4;
    const r = dentro ? rand(1, PARQUE.r - 2) : rand(PARQUE.r + 2.2, PARQUE.r + 6);
    const x = PARQUE.x + Math.cos(ang) * r;
    const z = PARQUE.z + Math.sin(ang) * r;
    if (esAgua(x, z) || cercaDeCasa(x, z, 1.5)) continue;
    crearFlor(x, z, pick(TIPOS_FLOR), rand(0, 5));
  }

  // ---------- pasto (instancias) ----------
  const NUM_PASTO = 2600;
  const geoPasto = new THREE.ConeGeometry(0.07, 0.8, 3);
  geoPasto.translate(0, 0.4, 0);
  const pasto = new THREE.InstancedMesh(geoPasto, new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1 }), NUM_PASTO);
  pasto.receiveShadow = true;
  const datosPasto = [];
  const colorPasto = new THREE.Color();
  for (let i = 0; i < NUM_PASTO; i++) {
    let x;
    let z;
    let ok = false;
    for (let intento = 0; intento < 20 && !ok; intento++) {
      x = rand(-55, 55);
      z = rand(-55, 55);
      ok = !esAgua(x, z) && !cercaDeCasa(x, z, 1);
    }
    const y = alturaTerreno(x, z);
    datosPasto.push({ x: x, y: y, z: z, s: rand(0.7, 1.8), fase: rand(0, 6.28), ry: rand(0, 6.28) });
    colorPasto.setHSL(rand(0.22, 0.3), 0.6, rand(0.3, 0.45));
    pasto.setColorAt(i, colorPasto);
  }
  scene.add(pasto);
  const dummy = new THREE.Object3D();

  function actualizarPasto() {
    for (let i = 0; i < NUM_PASTO; i++) {
      const d = datosPasto[i];
      dummy.position.set(d.x, d.y, d.z);
      dummy.rotation.set(
        Math.sin(tiempo * 1.8 + d.fase) * 0.18 * viento,
        d.ry,
        Math.cos(tiempo * 1.4 + d.fase * 1.3) * 0.18 * viento
      );
      dummy.scale.set(1, d.s, 1);
      dummy.updateMatrix();
      pasto.setMatrixAt(i, dummy.matrix);
    }
    pasto.instanceMatrix.needsUpdate = true;
  }

  // ---------- mariposas ----------
  const mariposas = [];

  function floresCrecidas() {
    return flores.filter((f) => f.userData.crec > 0.9);
  }

  function puntoFlor(f, extra) {
    return new THREE.Vector3(f.position.x, f.position.y + f.userData.alto + (extra || 0), f.position.z);
  }

  function crearMariposa() {
    const g = new THREE.Group();
    const color = pick([0xff9f1c, 0xffd23f, 0x4ea8de, 0xff6fa5, 0xc77dff]);
    const mat = new THREE.MeshStandardMaterial({
      color: color,
      side: THREE.DoubleSide,
      roughness: 0.6,
      emissive: color,
      emissiveIntensity: 0.15
    });
    const geoD = new THREE.PlaneGeometry(0.5, 0.38).rotateX(-Math.PI / 2).translate(0.25, 0, 0);
    const geoI = new THREE.PlaneGeometry(0.5, 0.38).rotateX(-Math.PI / 2).translate(-0.25, 0, 0);
    const pivoteD = new THREE.Group();
    const pivoteI = new THREE.Group();
    pivoteD.add(new THREE.Mesh(geoD, mat));
    pivoteI.add(new THREE.Mesh(geoI, mat));
    const cuerpo = new THREE.Mesh(
      new THREE.CylinderGeometry(0.03, 0.03, 0.3, 6).rotateX(Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0x222222 })
    );
    g.add(pivoteD, pivoteI, cuerpo);
    g.userData = {
      pivoteD: pivoteD,
      pivoteI: pivoteI,
      fase: rand(0, 6.28),
      centro: new THREE.Vector3(rand(-10, 10), 2, rand(-10, 10)),
      objetivo: new THREE.Vector3(rand(-10, 10), 2, rand(-10, 10)),
      a: rand(0, 6.28),
      vel: rand(1.2, 2),
      r: rand(1.2, 2.5),
      cambio: rand(4, 10),
      prev: new THREE.Vector3()
    };
    g.position.copy(g.userData.centro);
    scene.add(g);
    mariposas.push(g);
  }
  for (let i = 0; i < 14; i++) crearMariposa();

  function actualizarMariposas(dt) {
    const crecidas = floresCrecidas();
    mariposas.forEach((m) => {
      const u = m.userData;
      u.cambio -= dt;
      if (u.cambio <= 0 && crecidas.length > 0) {
        u.objetivo.copy(puntoFlor(pick(crecidas), 0.9));
        u.cambio = rand(8, 14);
      }
      u.centro.lerp(u.objetivo, dt * 0.35);
      u.a += dt * u.vel;
      u.prev.copy(m.position);
      m.position.set(
        u.centro.x + Math.cos(u.a) * u.r,
        u.centro.y + Math.sin(u.a * 1.7) * 0.4,
        u.centro.z + Math.sin(u.a * 1.3) * u.r * 0.7
      );
      const dx = m.position.x - u.prev.x;
      const dz = m.position.z - u.prev.z;
      if (dx * dx + dz * dz > 1e-8) m.rotation.y = Math.atan2(dx, dz);
      const aleteo = 0.3 + Math.sin(tiempo * 16 + u.fase) * 0.9;
      u.pivoteD.rotation.z = aleteo;
      u.pivoteI.rotation.z = -aleteo;
    });
  }

  // ---------- abejas ----------
  const abejas = [];

  function crearAbeja() {
    const g = new THREE.Group();
    const matAmarillo = new THREE.MeshStandardMaterial({ color: 0xffd400, roughness: 0.6 });
    const matNegro = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.6 });
    const cuerpo = new THREE.Mesh(new THREE.SphereGeometry(0.14, 10, 8), matAmarillo);
    cuerpo.scale.set(0.8, 0.8, 1.3);
    const franja1 = new THREE.Mesh(new THREE.TorusGeometry(0.105, 0.025, 6, 12), matNegro);
    franja1.position.z = 0.03;
    const franja2 = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.025, 6, 12), matNegro);
    franja2.position.z = -0.08;
    const cabeza = new THREE.Mesh(new THREE.SphereGeometry(0.075, 8, 6), matNegro);
    cabeza.position.z = 0.2;
    const matAla = new THREE.MeshStandardMaterial({ color: 0xffffff, transparent: true, opacity: 0.6, side: THREE.DoubleSide });
    const geoAlaD = new THREE.PlaneGeometry(0.18, 0.1).rotateX(-Math.PI / 2).translate(0.09, 0, 0);
    const geoAlaI = new THREE.PlaneGeometry(0.18, 0.1).rotateX(-Math.PI / 2).translate(-0.09, 0, 0);
    const pivoteD = new THREE.Group();
    const pivoteI = new THREE.Group();
    pivoteD.position.set(0.05, 0.11, 0);
    pivoteI.position.set(-0.05, 0.11, 0);
    pivoteD.add(new THREE.Mesh(geoAlaD, matAla));
    pivoteI.add(new THREE.Mesh(geoAlaI, matAla));
    g.add(cuerpo, franja1, franja2, cabeza, pivoteD, pivoteI);
    g.position.set(rand(-8, 8), 3, rand(-8, 8));
    g.userData = {
      pivoteD: pivoteD,
      pivoteI: pivoteI,
      estado: 'ir',
      flor: null,
      timer: 0,
      shakeTimer: 0,
      vel: rand(3, 4.5),
      fase: rand(0, 6.28)
    };
    scene.add(g);
    abejas.push(g);
  }
  for (let i = 0; i < 6; i++) crearAbeja();

  const tmpV = new THREE.Vector3();

  function actualizarAbejas(dt) {
    const crecidas = floresCrecidas();
    abejas.forEach((b) => {
      const u = b.userData;
      if (!u.flor || u.flor.userData.crec < 0.9) {
        if (crecidas.length === 0) return;
        u.flor = pick(crecidas);
        u.estado = 'ir';
      }
      const objetivo = puntoFlor(u.flor, 0.25);
      if (u.estado === 'ir') {
        tmpV.copy(objetivo).sub(b.position);
        const dist = tmpV.length();
        if (dist < 0.2) {
          u.estado = 'polinizar';
          u.timer = rand(2, 3.5);
          u.shakeTimer = 0;
        } else {
          tmpV.normalize();
          b.position.addScaledVector(tmpV, Math.min(dist, u.vel * dt));
          b.position.y += Math.sin(tiempo * 8 + u.fase) * 0.02;
          b.rotation.y = Math.atan2(tmpV.x, tmpV.z);
        }
      } else {
        u.timer -= dt;
        u.shakeTimer -= dt;
        b.position.x = objetivo.x + Math.sin(tiempo * 3 + u.fase) * 0.05;
        b.position.y = objetivo.y + Math.sin(tiempo * 9 + u.fase) * 0.03;
        b.position.z = objetivo.z + Math.cos(tiempo * 3 + u.fase) * 0.05;
        if (u.shakeTimer <= 0) {
          u.flor.userData.shake = 0.6;
          u.shakeTimer = 0.6;
        }
        if (u.timer <= 0) {
          u.flor = pick(crecidas);
          u.estado = 'ir';
        }
      }
      const aleteo = Math.sin(tiempo * 70 + u.fase) * 0.8;
      u.pivoteD.rotation.z = aleteo;
      u.pivoteI.rotation.z = -aleteo;
    });
  }

  // ---------- pájaros ----------
  const pajaros = [];

  function crearPajaro() {
    const g = new THREE.Group();
    const color = pick([0x5b7db1, 0xd9534f, 0x8d6e63, 0x3a3a3a, 0xf4a259]);
    const mat = new THREE.MeshStandardMaterial({ color: color, roughness: 0.8 });
    const cuerpo = new THREE.Mesh(new THREE.SphereGeometry(0.25, 8, 6), mat);
    cuerpo.scale.set(0.8, 0.8, 1.5);
    const cabeza = new THREE.Mesh(new THREE.SphereGeometry(0.14, 8, 6), mat);
    cabeza.position.set(0, 0.05, 0.38);
    const pico = new THREE.Mesh(
      new THREE.ConeGeometry(0.05, 0.15, 5).rotateX(Math.PI / 2),
      new THREE.MeshStandardMaterial({ color: 0xff9800 })
    );
    pico.position.set(0, 0.04, 0.55);
    const cola = new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.03, 0.3), mat);
    cola.position.set(0, 0, -0.45);
    const geoAlaD = new THREE.BoxGeometry(0.7, 0.03, 0.3).translate(0.35, 0, 0);
    const geoAlaI = new THREE.BoxGeometry(0.7, 0.03, 0.3).translate(-0.35, 0, 0);
    const pivoteD = new THREE.Group();
    const pivoteI = new THREE.Group();
    pivoteD.position.x = 0.12;
    pivoteI.position.x = -0.12;
    pivoteD.add(new THREE.Mesh(geoAlaD, mat));
    pivoteI.add(new THREE.Mesh(geoAlaI, mat));
    g.add(cuerpo, cabeza, pico, cola, pivoteD, pivoteI);
    g.scale.setScalar(1.3);
    g.userData = {
      pivoteD: pivoteD,
      pivoteI: pivoteI,
      cx: rand(-15, 15),
      cz: rand(-15, 15),
      r: rand(25, 50),
      alt: rand(16, 28),
      a: rand(0, 6.28),
      vel: rand(7, 11),
      fase: rand(0, 6.28)
    };
    scene.add(g);
    pajaros.push(g);
  }
  for (let i = 0; i < 6; i++) crearPajaro();

  function actualizarPajaros(dt) {
    pajaros.forEach((p) => {
      const u = p.userData;
      u.a += (u.vel * dt) / u.r;
      p.position.set(
        u.cx + Math.cos(u.a) * u.r,
        u.alt + Math.sin(tiempo * 0.7 + u.fase) * 1.5,
        u.cz + Math.sin(u.a) * u.r
      );
      p.rotation.y = Math.atan2(-Math.sin(u.a), Math.cos(u.a));
      p.rotation.z = -0.2;
      const aleteo = Math.sin(tiempo * 9 + u.fase) * 0.6;
      u.pivoteD.rotation.z = aleteo;
      u.pivoteI.rotation.z = -aleteo;
    });
  }

  // ---------- conejo ----------
  const conejo = (function () {
    const g = new THREE.Group();
    const mat = new THREE.MeshStandardMaterial({ color: 0xe8e0d5, roughness: 1 });
    const cuerpo = new THREE.Mesh(new THREE.SphereGeometry(0.3, 10, 8), mat);
    cuerpo.scale.set(1, 0.8, 1.3);
    cuerpo.position.y = 0.3;
    const cabeza = new THREE.Mesh(new THREE.SphereGeometry(0.2, 10, 8), mat);
    cabeza.position.set(0, 0.5, 0.35);
    const geoOreja = new THREE.CapsuleGeometry(0.05, 0.25, 4, 8);
    const orejaD = new THREE.Mesh(geoOreja, mat);
    orejaD.position.set(0.08, 0.85, 0.32);
    orejaD.rotation.z = -0.15;
    const orejaI = new THREE.Mesh(geoOreja, mat);
    orejaI.position.set(-0.08, 0.85, 0.32);
    orejaI.rotation.z = 0.15;
    const cola = new THREE.Mesh(new THREE.SphereGeometry(0.1, 8, 6), new THREE.MeshStandardMaterial({ color: 0xffffff }));
    cola.position.set(0, 0.35, -0.4);
    g.add(cuerpo, cabeza, orejaD, orejaI, cola);
    g.traverse((o) => {
      if (o.isMesh) o.castShadow = true;
    });
    g.position.set(-3, 0, 12);
    g.userData = { estado: 'pausa', timer: 1, objetivo: new THREE.Vector3(-3, 0, 12), fase: 0, orejaD: orejaD, orejaI: orejaI };
    scene.add(g);
    return g;
  })();

  function actualizarConejo(dt) {
    const u = conejo.userData;
    if (u.estado === 'pausa') {
      u.timer -= dt;
      conejo.position.y = 0;
      u.orejaD.rotation.z = -0.15 + Math.sin(tiempo * 12) * 0.06 * (Math.sin(tiempo * 1.5) > 0.7 ? 1 : 0);
      if (u.timer <= 0) {
        for (let i = 0; i < 30; i++) {
          const ang = rand(0, Math.PI * 2);
          const r = rand(3, 14);
          const x = Math.cos(ang) * r;
          const z = Math.sin(ang) * r;
          if (!cercaDeCasa(x, z, 2)) {
            u.objetivo.set(x, 0, z);
            break;
          }
        }
        u.estado = 'salto';
      }
    } else {
      tmpV.copy(u.objetivo).sub(conejo.position);
      tmpV.y = 0;
      const dist = tmpV.length();
      if (dist < 0.3) {
        u.estado = 'pausa';
        u.timer = rand(1.5, 3);
      } else {
        tmpV.normalize();
        conejo.position.x += tmpV.x * 1.8 * dt;
        conejo.position.z += tmpV.z * 1.8 * dt;
        conejo.rotation.y = Math.atan2(tmpV.x, tmpV.z);
        u.fase += dt * 7;
        conejo.position.y = Math.abs(Math.sin(u.fase)) * 0.35;
      }
    }
  }

  // ---------- persona caminando ----------
  const persona = (function () {
    const g = new THREE.Group();
    const piel = new THREE.MeshStandardMaterial({ color: 0xf1c27d, roughness: 0.8 });
    const camisa = new THREE.MeshStandardMaterial({ color: 0x2e86de, roughness: 0.8 });
    const pantalon = new THREE.MeshStandardMaterial({ color: 0x264653, roughness: 0.8 });
    const paja = new THREE.MeshStandardMaterial({ color: 0xe9c46a, roughness: 1 });

    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.7, 0.28), camisa);
    torso.position.y = 1.15;
    const cabeza = new THREE.Mesh(new THREE.SphereGeometry(0.2, 12, 10), piel);
    cabeza.position.y = 1.72;
    const ala = new THREE.Mesh(new THREE.CylinderGeometry(0.34, 0.34, 0.03, 16), paja);
    ala.position.y = 1.86;
    const copa = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.2, 0.15, 12), paja);
    copa.position.y = 1.95;

    const geoPierna = new THREE.BoxGeometry(0.18, 0.8, 0.2).translate(0, -0.4, 0);
    const piernaD = new THREE.Group();
    const piernaI = new THREE.Group();
    piernaD.position.set(0.13, 0.8, 0);
    piernaI.position.set(-0.13, 0.8, 0);
    piernaD.add(new THREE.Mesh(geoPierna, pantalon));
    piernaI.add(new THREE.Mesh(geoPierna, pantalon));

    const geoBrazo = new THREE.BoxGeometry(0.14, 0.6, 0.14).translate(0, -0.3, 0);
    const brazoD = new THREE.Group();
    const brazoI = new THREE.Group();
    brazoD.position.set(0.34, 1.47, 0);
    brazoI.position.set(-0.34, 1.47, 0);
    brazoD.add(new THREE.Mesh(geoBrazo, piel));
    brazoI.add(new THREE.Mesh(geoBrazo, piel));

    // regadera en la mano derecha
    const regadera = new THREE.Group();
    const cuerpoRegadera = new THREE.Mesh(new THREE.BoxGeometry(0.25, 0.2, 0.2), new THREE.MeshStandardMaterial({ color: 0x3aa655 }));
    const piquito = new THREE.Mesh(
      new THREE.CylinderGeometry(0.025, 0.03, 0.3, 6).rotateX(Math.PI / 2.6),
      new THREE.MeshStandardMaterial({ color: 0x3aa655 })
    );
    piquito.position.set(0, 0.05, 0.22);
    regadera.add(cuerpoRegadera, piquito);
    regadera.position.set(0, -0.65, 0.05);
    brazoD.add(regadera);

    g.add(torso, cabeza, ala, copa, piernaD, piernaI, brazoD, brazoI);
    g.scale.setScalar(1.3);
    g.traverse((o) => {
      if (o.isMesh) o.castShadow = true;
    });
    g.userData = { a: 0, piernaD: piernaD, piernaI: piernaI, brazoD: brazoD, brazoI: brazoI };
    scene.add(g);
    return g;
  })();

  function actualizarPersona(dt) {
    const u = persona.userData;
    u.a += dt * 0.12;
    persona.position.set(PARQUE.x + Math.cos(u.a) * PARQUE.r, Math.abs(Math.sin(tiempo * 5)) * 0.04, PARQUE.z + Math.sin(u.a) * PARQUE.r);
    persona.rotation.y = Math.atan2(-Math.sin(u.a), Math.cos(u.a));
    const paso = Math.sin(tiempo * 5) * 0.6;
    u.piernaD.rotation.x = paso;
    u.piernaI.rotation.x = -paso;
    u.brazoD.rotation.x = -paso * 0.5 - 0.2;
    u.brazoI.rotation.x = paso * 0.7;
  }

  // ---------- partículas: pétalos y polen ----------
  function crearTextura(tipo) {
    const c = document.createElement('canvas');
    c.width = 64;
    c.height = 64;
    const ctx = c.getContext('2d');
    if (tipo === 'petalo') {
      ctx.translate(32, 32);
      ctx.rotate(-0.5);
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.ellipse(0, 0, 26, 13, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const grad = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
      grad.addColorStop(0, 'rgba(255,255,255,1)');
      grad.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 64, 64);
    }
    return new THREE.CanvasTexture(c);
  }

  const NUM_PETALOS = 260;
  const geoPetalos = new THREE.BufferGeometry();
  const posPetalos = new Float32Array(NUM_PETALOS * 3);
  const datosPetalos = [];
  for (let i = 0; i < NUM_PETALOS; i++) {
    posPetalos[i * 3] = rand(-60, 60);
    posPetalos[i * 3 + 1] = rand(0, 28);
    posPetalos[i * 3 + 2] = rand(-60, 60);
    datosPetalos.push({ vy: rand(0.6, 1.4), fase: rand(0, 6.28) });
  }
  geoPetalos.setAttribute('position', new THREE.BufferAttribute(posPetalos, 3));
  const petalos = new THREE.Points(
    geoPetalos,
    new THREE.PointsMaterial({
      color: 0xffc1d6,
      size: 0.55,
      map: crearTextura('petalo'),
      transparent: true,
      alphaTest: 0.1,
      depthWrite: false
    })
  );
  petalos.frustumCulled = false;
  scene.add(petalos);

  function actualizarPetalos(dt) {
    const p = geoPetalos.attributes.position;
    for (let i = 0; i < NUM_PETALOS; i++) {
      const d = datosPetalos[i];
      let x = p.getX(i);
      let y = p.getY(i);
      let z = p.getZ(i);
      y -= d.vy * dt;
      x += (Math.sin(tiempo * 0.8 + d.fase) * 0.8 + viento * 1.2) * dt;
      z += Math.cos(tiempo * 0.6 + d.fase) * 0.5 * dt;
      if (y < 0.1 || x > 62) {
        y = 28;
        x = rand(-60, 60);
        z = rand(-60, 60);
      }
      p.setXYZ(i, x, y, z);
    }
    p.needsUpdate = true;
  }

  const NUM_POLEN = 200;
  const geoPolen = new THREE.BufferGeometry();
  const posPolen = new Float32Array(NUM_POLEN * 3);
  const datosPolen = [];
  for (let i = 0; i < NUM_POLEN; i++) {
    posPolen[i * 3] = rand(-45, 45);
    posPolen[i * 3 + 1] = rand(0.3, 6);
    posPolen[i * 3 + 2] = rand(-45, 45);
    datosPolen.push({ fase: rand(0, 6.28) });
  }
  geoPolen.setAttribute('position', new THREE.BufferAttribute(posPolen, 3));
  const polen = new THREE.Points(
    geoPolen,
    new THREE.PointsMaterial({
      color: 0xfff3a0,
      size: 0.2,
      map: crearTextura('brillo'),
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
      blending: THREE.AdditiveBlending
    })
  );
  polen.frustumCulled = false;
  scene.add(polen);

  function actualizarPolen(dt) {
    const p = geoPolen.attributes.position;
    for (let i = 0; i < NUM_POLEN; i++) {
      const d = datosPolen[i];
      let x = p.getX(i);
      let y = p.getY(i);
      let z = p.getZ(i);
      x += (Math.sin(tiempo * 0.5 + d.fase) * 0.3 + viento * 0.4) * dt;
      y += Math.cos(tiempo * 0.7 + d.fase) * 0.2 * dt;
      z += Math.sin(tiempo * 0.4 + d.fase * 2) * 0.2 * dt;
      if (x > 48) x = -48;
      y = clamp(y, 0.3, 6);
      p.setXYZ(i, x, y, z);
    }
    p.needsUpdate = true;
  }

  // ---------- agua en movimiento ----------
  function actualizarAgua() {
    for (let i = 0; i < posAgua.count; i++) {
      const x = baseAguaXZ[i * 2];
      const z = baseAguaXZ[i * 2 + 1];
      posAgua.setY(i, Math.sin(x * 0.6 + tiempo * 1.5) * 0.05 + Math.cos(z * 0.5 + tiempo * 1.2) * 0.05);
    }
    posAgua.needsUpdate = true;
  }

  // ---------- cámara con el mouse ----------
  const cam = { theta: 0.6, phi: 1.3, radio: 40, objetivo: new THREE.Vector3(2, 2, 2), auto: true };

  function posicionarCamara() {
    camera.position.set(
      cam.objetivo.x + cam.radio * Math.sin(cam.phi) * Math.sin(cam.theta),
      cam.objetivo.y + cam.radio * Math.cos(cam.phi),
      cam.objetivo.z + cam.radio * Math.sin(cam.phi) * Math.cos(cam.theta)
    );
    camera.lookAt(cam.objetivo);
  }

  const mouse = { abajo: false, x: 0, y: 0, x0: 0, y0: 0, movio: false };
  const rayo = new THREE.Raycaster();
  const coordsRayo = new THREE.Vector2();

  function plantarFlores(ev) {
    const r = renderer.domElement.getBoundingClientRect();
    coordsRayo.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    rayo.setFromCamera(coordsRayo, camera);
    const hit = rayo.intersectObject(suelo)[0];
    if (!hit || esAgua(hit.point.x, hit.point.z) || flores.length > 800) return;
    for (let i = 0; i < 3; i++) {
      const x = hit.point.x + rand(-0.7, 0.7);
      const z = hit.point.z + rand(-0.7, 0.7);
      if (esAgua(x, z) || cercaDeCasa(x, z, 0.5)) continue;
      crearFlor(x, z, pick(TIPOS_FLOR), 0);
    }
  }

  const lienzo = renderer.domElement;
  lienzo.addEventListener('pointerdown', (ev) => {
    mouse.abajo = true;
    mouse.movio = false;
    mouse.x = mouse.x0 = ev.clientX;
    mouse.y = mouse.y0 = ev.clientY;
    cam.auto = false;
  });
  window.addEventListener('pointermove', (ev) => {
    if (!mouse.abajo) return;
    cam.theta -= (ev.clientX - mouse.x) * 0.006;
    cam.phi = clamp(cam.phi - (ev.clientY - mouse.y) * 0.006, 0.35, 1.5);
    mouse.x = ev.clientX;
    mouse.y = ev.clientY;
    if (Math.hypot(ev.clientX - mouse.x0, ev.clientY - mouse.y0) > 5) mouse.movio = true;
  });
  window.addEventListener('pointerup', (ev) => {
    if (mouse.abajo && !mouse.movio && ev.target === lienzo) plantarFlores(ev);
    mouse.abajo = false;
  });
  lienzo.addEventListener('wheel', (ev) => {
    ev.preventDefault();
    cam.radio = clamp(cam.radio * (1 + ev.deltaY * 0.001), 10, 110);
  }, { passive: false });

  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  // ---------- sonido (Web Audio, sin archivos externos) ----------
  const sonido = { ctx: null, activo: false };
  const ESCALA = [261.63, 293.66, 329.63, 392, 440, 523.25, 587.33];

  function crearAudio() {
    const AC = window.AudioContext || window.webkitAudioContext;
    const ctx = new AC();
    const master = ctx.createGain();
    master.gain.value = 0.7;
    master.connect(ctx.destination);

    // eco suave para que suene más "natural"
    const eco = ctx.createDelay();
    eco.delayTime.value = 0.38;
    const retro = ctx.createGain();
    retro.gain.value = 0.35;
    const ecoSalida = ctx.createGain();
    ecoSalida.gain.value = 0.4;
    eco.connect(retro);
    retro.connect(eco);
    eco.connect(ecoSalida);
    ecoSalida.connect(master);

    // ruido base
    const largo = ctx.sampleRate * 3;
    const buffer = ctx.createBuffer(1, largo, ctx.sampleRate);
    const datos = buffer.getChannelData(0);
    for (let i = 0; i < largo; i++) datos[i] = Math.random() * 2 - 1;
    function fuenteRuido() {
      const s = ctx.createBufferSource();
      s.buffer = buffer;
      s.loop = true;
      s.start();
      return s;
    }

    // viento
    const filtroViento = ctx.createBiquadFilter();
    filtroViento.type = 'lowpass';
    filtroViento.frequency.value = 420;
    const gananciaViento = ctx.createGain();
    gananciaViento.gain.value = 0.1;
    const lfoViento = ctx.createOscillator();
    lfoViento.frequency.value = 0.13;
    const lfoVientoG = ctx.createGain();
    lfoVientoG.gain.value = 0.07;
    lfoViento.connect(lfoVientoG);
    lfoVientoG.connect(gananciaViento.gain);
    lfoViento.start();
    fuenteRuido().connect(filtroViento);
    filtroViento.connect(gananciaViento);
    gananciaViento.connect(master);

    // agua del lago
    const filtroAgua = ctx.createBiquadFilter();
    filtroAgua.type = 'bandpass';
    filtroAgua.frequency.value = 900;
    filtroAgua.Q.value = 0.7;
    const gananciaAgua = ctx.createGain();
    gananciaAgua.gain.value = 0.035;
    const lfoAgua = ctx.createOscillator();
    lfoAgua.frequency.value = 0.5;
    const lfoAguaG = ctx.createGain();
    lfoAguaG.gain.value = 0.015;
    lfoAgua.connect(lfoAguaG);
    lfoAguaG.connect(gananciaAgua.gain);
    lfoAgua.start();
    fuenteRuido().connect(filtroAgua);
    filtroAgua.connect(gananciaAgua);
    gananciaAgua.connect(master);

    // pájaros
    function gorjeo() {
      if (sonido.activo) {
        const n = 2 + Math.floor(Math.random() * 3);
        const base = rand(2200, 3800);
        for (let i = 0; i < n; i++) {
          const t0 = ctx.currentTime + i * 0.14;
          const osc = ctx.createOscillator();
          osc.type = 'sine';
          osc.frequency.setValueAtTime(base, t0);
          osc.frequency.exponentialRampToValueAtTime(base * rand(1.3, 1.7), t0 + 0.08);
          osc.frequency.exponentialRampToValueAtTime(base * 0.9, t0 + 0.12);
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.0001, t0);
          g.gain.exponentialRampToValueAtTime(0.08, t0 + 0.02);
          g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.12);
          osc.connect(g);
          g.connect(master);
          g.connect(eco);
          osc.start(t0);
          osc.stop(t0 + 0.15);
        }
      }
      setTimeout(gorjeo, rand(1200, 3800));
    }
    gorjeo();

    // música relajante (escala pentatónica)
    let idx = 2;
    function nota() {
      if (sonido.activo && Math.random() < 0.75) {
        idx = clamp(idx + Math.floor(rand(-2, 3)), 0, ESCALA.length - 1);
        const t0 = ctx.currentTime;
        const osc = ctx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.value = ESCALA[idx];
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.06, t0 + 0.02);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 1.6);
        osc.connect(g);
        g.connect(master);
        g.connect(eco);
        osc.start(t0);
        osc.stop(t0 + 1.7);
      }
      setTimeout(nota, 450);
    }
    nota();

    function acorde() {
      if (sonido.activo) {
        const t0 = ctx.currentTime;
        [130.81, 164.81, 196].forEach((f) => {
          const osc = ctx.createOscillator();
          osc.type = 'sine';
          osc.frequency.value = f;
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.0001, t0);
          g.gain.linearRampToValueAtTime(0.03, t0 + 1);
          g.gain.linearRampToValueAtTime(0.0001, t0 + 3.4);
          osc.connect(g);
          g.connect(master);
          osc.start(t0);
          osc.stop(t0 + 3.5);
        });
      }
      setTimeout(acorde, 3400);
    }
    acorde();

    return ctx;
  }

  const btnSonido = document.getElementById('btnSonido');
  btnSonido.addEventListener('click', () => {
    if (!sonido.ctx) {
      sonido.ctx = crearAudio();
      sonido.activo = true;
    } else if (sonido.activo) {
      sonido.activo = false;
      sonido.ctx.suspend();
    } else {
      sonido.activo = true;
      sonido.ctx.resume();
    }
    btnSonido.textContent = sonido.activo ? '🔊 Sonido: encendido' : '🔇 Sonido: apagado';
  });

  // ---------- controles de la interfaz ----------
  const btnDia = document.getElementById('btnDia');
  const rangoHora = document.getElementById('rangoHora');
  const rangoViento = document.getElementById('rangoViento');
  const etiquetaHora = document.getElementById('etiquetaHora');

  function nombreHora(t) {
    if (t < 0.33) return 'Mañana';
    if (t < 0.66) return 'Mediodía';
    return 'Tarde';
  }

  btnDia.addEventListener('click', () => {
    dia.auto = !dia.auto;
    btnDia.textContent = dia.auto ? '⏸ Pausar el día' : '▶ Reanudar el día';
  });
  rangoHora.addEventListener('input', () => {
    dia.t = clamp(rangoHora.value / 100, 0.12, 0.88);
    dia.auto = false;
    btnDia.textContent = '▶ Reanudar el día';
  });
  rangoViento.addEventListener('input', () => {
    viento = rangoViento.value / 50;
  });

  // ---------- ciclo de animación ----------
  const reloj = new THREE.Clock();

  function animar() {
    requestAnimationFrame(animar);
    const dt = Math.min(reloj.getDelta(), 0.05);
    tiempo += dt;

    // día: de la mañana a la tarde (y de regreso)
    if (dia.auto) {
      dia.t += (dia.dir * dt) / 80;
      if (dia.t > 0.85) dia.dir = -1;
      if (dia.t < 0.15) dia.dir = 1;
      rangoHora.value = Math.round(dia.t * 100);
    }
    actualizarDia(dia.t);
    etiquetaHora.textContent = nombreHora(dia.t);

    // nubes
    nubes.forEach((n) => {
      n.userData.ang += n.userData.vel * dt * 0.004 * (0.5 + viento * 0.5);
      n.position.x = Math.cos(n.userData.ang) * n.userData.rad;
      n.position.z = Math.sin(n.userData.ang) * n.userData.rad;
    });

    // viento en árboles
    balanceos.forEach((b) => {
      b.obj.rotation.z = Math.sin(tiempo * 1.2 + b.fase) * b.amp * viento;
      b.obj.rotation.x = Math.cos(tiempo * 0.9 + b.fase) * b.amp * 0.7 * viento;
    });

    actualizarFlores(dt);
    actualizarPasto();
    actualizarMariposas(dt);
    actualizarAbejas(dt);
    actualizarPajaros(dt);
    actualizarConejo(dt);
    actualizarPersona(dt);
    actualizarPetalos(dt);
    actualizarPolen(dt);
    actualizarAgua();

    if (cam.auto) cam.theta += dt * 0.04;
    posicionarCamara();
    domo.position.copy(camera.position);

    renderer.render(scene, camera);
  }

  animar();
})();