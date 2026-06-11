/* ═══════════════════════════════════════════════════════════════════
   THE GUARDIAN — production-ready Three.js NPC system
   ───────────────────────────────────────────────────────────────────
   • Loads guardian.glb if present (GLTFLoader + AnimationMixer)
   • Falls back to a fully procedural veiled guardian + auto-rig if not
   • States: IDLE · NAMASTE · CLAPPING
   • Interaction: hover bubble · click modal · mouse-follow (max 10°)
   • FX: soft glow, ambient + directional light, soft shadows, sparkles
   • Tech: Three.js · GLTFLoader · AnimationMixer · GSAP · vanilla JS
   • Works on GitHub Pages / static hosting. No React, no Node, no backend.
═══════════════════════════════════════════════════════════════════ */

(function () {
  'use strict';

  /* ─────────────────────────────────────────────
     0. SAFETY: ensure libraries are present
  ───────────────────────────────────────────── */
  if (typeof THREE === 'undefined') {
    document.getElementById('loader-sub').textContent =
      '3D engine failed to load — check connection';
    return;
  }
  var HAS_GSAP = typeof gsap !== 'undefined';

  /* ─────────────────────────────────────────────
     1. DOM refs
  ───────────────────────────────────────────── */
  var canvas    = document.getElementById('c');
  var loader    = document.getElementById('loader');
  var loaderBar = document.getElementById('loader-bar');
  var loaderSub = document.getElementById('loader-sub');
  var bubble    = document.getElementById('bubble');
  var hint      = document.getElementById('hint');
  var pCanvas   = document.getElementById('particles');
  var modalOv   = document.getElementById('modal-overlay');
  var btnAccept = document.getElementById('btn-accept');
  var btnDecline= document.getElementById('btn-decline');
  var btnClose  = document.getElementById('modal-close');

  var PI = Math.PI, DEG = PI / 180;

  /* ─────────────────────────────────────────────
     2. RENDERER · SCENE · CAMERA
  ───────────────────────────────────────────── */
  var renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  if (THREE.ACESFilmicToneMapping) renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  if ('outputEncoding' in renderer && THREE.sRGBEncoding) renderer.outputEncoding = THREE.sRGBEncoding;

  var scene = new THREE.Scene();
  scene.background = new THREE.Color(0x07030f);
  scene.fog = new THREE.FogExp2(0x07030f, 0.04);

  var camera = new THREE.PerspectiveCamera(40, window.innerWidth / window.innerHeight, 0.1, 100);
  camera.position.set(0, 1.55, 4.4);
  camera.lookAt(0, 1.25, 0);

  /* ─────────────────────────────────────────────
     3. LIGHTING (dark fantasy, soft shadows)
  ───────────────────────────────────────────── */
  scene.add(new THREE.AmbientLight(0x4a3a66, 1.15));

  var keyLight = new THREE.DirectionalLight(0xfff0d6, 2.6);
  keyLight.position.set(2.2, 4.2, 3.0);
  keyLight.castShadow = true;
  keyLight.shadow.mapSize.set(2048, 2048);
  keyLight.shadow.camera.near = 0.5;
  keyLight.shadow.camera.far = 20;
  keyLight.shadow.camera.left = -4; keyLight.shadow.camera.right = 4;
  keyLight.shadow.camera.top = 5;  keyLight.shadow.camera.bottom = -2;
  keyLight.shadow.bias = -0.0008;
  scene.add(keyLight);

  var fillLight = new THREE.DirectionalLight(0x7a52ff, 0.9);
  fillLight.position.set(-3, 2, -1);
  scene.add(fillLight);

  var rimLight = new THREE.DirectionalLight(0xff6a3a, 1.1);
  rimLight.position.set(0, 2.5, -3.5);
  scene.add(rimLight);

  // soft glow behind character (radial sprite)
  var glowSprite = makeGlowSprite();
  glowSprite.position.set(0, 1.5, -1.2);
  glowSprite.scale.set(6, 6, 1);
  scene.add(glowSprite);

  function makeGlowSprite() {
    var cv = document.createElement('canvas'); cv.width = cv.height = 256;
    var ctx = cv.getContext('2d');
    var g = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    g.addColorStop(0,   'rgba(180,70,40,0.55)');
    g.addColorStop(0.4, 'rgba(120,40,80,0.28)');
    g.addColorStop(1,   'rgba(0,0,0,0)');
    ctx.fillStyle = g; ctx.fillRect(0, 0, 256, 256);
    var tex = new THREE.CanvasTexture(cv);
    var mat = new THREE.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending });
    return new THREE.Sprite(mat);
  }

  /* ─────────────────────────────────────────────
     4. MATERIALS
  ───────────────────────────────────────────── */
  function phys(c, r, m, opt) {
    var o = new THREE.MeshStandardMaterial({ color: c, roughness: r == null ? 0.8 : r, metalness: m || 0 });
    if (opt) for (var k in opt) o[k] = opt[k];
    return o;
  }
  var MAT = {
    black:  phys(0x0a0608, 0.92),                 // veil + robe
    black2: phys(0x140a10, 0.85),                 // robe folds
    maroon: phys(0x6b0f1a, 0.72),                 // choli
    maroon2:phys(0x8b1a2a, 0.68),
    skin:   phys(0xb87a4a, 0.6),                  // hands
    gold:   phys(0xc9922a, 0.25, 0.9),
    gold2:  phys(0xe8b84b, 0.18, 0.95),
    gem:    phys(0x5a2a6a, 0.1, 0.3, { emissive: new THREE.Color(0x2a0a3a), emissiveIntensity: 0.4 }),
    pearl:  phys(0xf4ece0, 0.3, 0.2),
    cloth:  phys(0xf0ead8, 0.95),                 // crowd turbans/clothes
    cloth2: phys(0xd8cfba, 0.95),
    ground: phys(0x0c0518, 0.98)
  };

  function cyl(rt, rb, h, s) { return new THREE.CylinderGeometry(rt, rb, h, s || 20); }
  function sphere(r, w, h) { return new THREE.SphereGeometry(r, w || 18, h || 16); }

  function add(geo, mat, parent, x, y, z, rx, ry, rz, sx, sy, sz) {
    var m = new THREE.Mesh(geo, mat);
    m.position.set(x || 0, y || 0, z || 0);
    if (rx || ry || rz) m.rotation.set(rx || 0, ry || 0, rz || 0);
    if (sx != null) m.scale.set(sx, sy != null ? sy : sx, sz != null ? sz : sx);
    m.castShadow = true; m.receiveShadow = true;
    (parent || scene).add(m);
    return m;
  }

  /* ─────────────────────────────────────────────
     5. GROUND + CROWD (seated turbaned figures)
  ───────────────────────────────────────────── */
  add(cyl(7, 7, 0.1, 48), MAT.ground, null, 0, -0.06, 0);

  var crowd = new THREE.Group();
  scene.add(crowd);
  // rows of seated men (backs to camera), guardian elevated above them
  var crowdPositions = [
    [-1.05, 0.36, 1.05], [-0.35, 0.4, 1.18], [0.4, 0.4, 1.16], [1.1, 0.36, 1.02],
    [-0.72, 0.34, 1.5], [0.05, 0.36, 1.58], [0.78, 0.34, 1.5],
    [-1.5, 0.3, 1.45], [1.55, 0.3, 1.42]
  ];
  crowdPositions.forEach(function (p, i) {
    var g = new THREE.Group();
    g.position.set(p[0], p[1], p[2]);
    var s = 0.82 + (i % 3) * 0.06;
    g.scale.setScalar(s);
    // body (kurta, back view)
    add(cyl(0.2, 0.26, 0.5, 16), i % 2 ? MAT.cloth : MAT.cloth2, g, 0, 0, 0);
    // shoulders
    add(sphere(0.2, 16, 12), i % 2 ? MAT.cloth : MAT.cloth2, g, 0, 0.22, 0, 0, 0, 0, 1.1, 0.7, 0.9);
    // neck
    add(cyl(0.05, 0.06, 0.06, 10), MAT.skin, g, 0, 0.32, -0.02);
    // turban (pagdi) — layered torus stack
    var th = new THREE.Group(); th.position.set(0, 0.42, -0.02); g.add(th);
    add(sphere(0.16, 18, 14), i % 2 ? MAT.cloth2 : MAT.cloth, th, 0, 0, 0, 0, 0, 0, 1, 0.85, 1);
    for (var w = 0; w < 4; w++) {
      add(new THREE.TorusGeometry(0.15 - w * 0.012, 0.035, 8, 24), i % 2 ? MAT.cloth : MAT.cloth2, th, 0, -0.02 + w * 0.03, 0, PI / 2 + 0.1, 0, w * 0.3);
    }
    crowd.add(g);
  });

  /* ─────────────────────────────────────────────
     6. THE GUARDIAN  (procedural fallback)
     A fully veiled female figure — face entirely covered.
     One leg elevated, seated-above-crowd posture preserved.
     Bone-like groups expose: head, torso, both arms (shoulder→
     upper→elbow→forearm→wrist→hand) so we can rig namaste/clap.
  ───────────────────────────────────────────── */
  var guardian = new THREE.Group();
  guardian.position.set(0, 0, 0);
  scene.add(guardian);

  // rig references filled by builder (procedural) or mapped from GLB
  var rig = {
    root: guardian,         // whole-body float/sway
    upper: null,            // upper-body group (mouse rotate + bow)
    head: null,             // head group (mouse follow + bow)
    veil: [],               // cloth meshes for subtle movement
    armL: null, armR: null  // {sh, ua, fa, hnd}
  };

  function buildProceduralGuardian() {
    // ── seated/elevated platform implied: pelvis raised ~0.95 ──
    var ORIGIN_Y = 0.0;

    // ── Legs: one elevated (right), one folded down (left) ──
    // elevated leg (knee up, foot resting forward on a step)
    var legUp = new THREE.Group(); legUp.position.set(0.16, 0.95, 0.05); guardian.add(legUp);
    add(cyl(0.1, 0.09, 0.42, 14), MAT.black, legUp, 0, -0.1, 0.18, PI * 0.42, 0, 0);   // thigh forward
    add(sphere(0.1, 14, 12), MAT.black, legUp, 0, -0.22, 0.42);                          // knee
    add(cyl(0.085, 0.07, 0.4, 14), MAT.black, legUp, 0, -0.42, 0.36, -0.2, 0, 0);        // shin down
    add(cyl(0.07, 0.08, 0.16, 12), MAT.gold, legUp, 0, -0.62, 0.42, PI / 2.2, 0, 0);     // jutti (shoe)

    // folded/hanging leg (left) under skirt
    add(cyl(0.1, 0.09, 0.5, 14), MAT.black, guardian, -0.13, 0.72, 0.0);
    add(cyl(0.07, 0.08, 0.16, 12), MAT.gold, guardian, -0.13, 0.46, 0.12, PI / 2.2, 0, 0); // jutti

    // ── Pelvis / hips ──
    add(sphere(0.2, 18, 14), MAT.black, guardian, 0, 1.0, 0, 0, 0, 0, 1.3, 0.8, 1.05);

    // ── Black flowing skirt (ghagra/robe) cascading over the step ──
    var skirt = add(cyl(0.22, 0.62, 1.0, 36), MAT.black, guardian, 0, 0.5, 0);
    rig.veil.push(skirt);
    // outer drape with maroon underside peeking
    add(cyl(0.26, 0.66, 0.5, 36), MAT.black2, guardian, 0, 0.28, 0.04, 0, 0, 0);
    add(new THREE.TorusGeometry(0.6, 0.02, 8, 50), MAT.maroon, guardian, 0, 0.02, 0.04, PI / 2, 0, 0); // hem peek
    // gold gota border on hem
    for (var hp = 0; hp < 26; hp++) {
      var ha = hp / 26 * PI * 2;
      add(new THREE.BoxGeometry(0.03, 0.06, 0.01), MAT.gold, guardian, Math.sin(ha) * 0.6, 0.06, Math.cos(ha) * 0.6 + 0.04, 0, -ha, 0);
    }

    // ── UPPER BODY group (mouse rotation + namaste bow pivot at waist) ──
    var upper = new THREE.Group(); upper.position.set(0, 1.05, 0); guardian.add(upper);
    rig.upper = upper;

    // maroon choli (blouse) with gold work
    add(cyl(0.16, 0.18, 0.4, 22), MAT.maroon, upper, 0, 0.16, 0);
    add(sphere(0.19, 20, 16), MAT.maroon2, upper, 0, 0.34, 0, 0, 0, 0, 1.05, 0.8, 1);
    // gold embroidery bands
    add(new THREE.TorusGeometry(0.165, 0.012, 8, 40), MAT.gold, upper, 0, 0.06, 0, PI / 2, 0, 0);
    add(new THREE.TorusGeometry(0.17, 0.012, 8, 40), MAT.gold2, upper, 0, 0.5, 0, PI / 2, 0, 0);
    // mirror-work dots
    for (var mw = 0; mw < 10; mw++) {
      var mwa = mw / 10 * PI * 2;
      add(sphere(0.014, 8, 8), MAT.gem, upper, Math.sin(mwa) * 0.17, 0.28 + Math.sin(mwa * 2) * 0.05, Math.cos(mwa) * 0.13 + 0.05);
    }

    // kamarbandh (waist belt)
    add(new THREE.TorusGeometry(0.182, 0.016, 8, 40), MAT.gold, upper, 0, 0.0, 0, PI / 2, 0, 0);

    // necklaces (layered haar + pearl strands)
    for (var nl = 0; nl < 2; nl++) {
      var nr = 0.1 + nl * 0.03;
      for (var na = 0; na < 14; na++) {
        var a2 = ((na - 6.5) / 6.5) * 0.9;
        add(sphere(0.012 + nl * 0.003, 8, 8), nl ? MAT.pearl : MAT.gold, upper,
          Math.sin(a2) * nr, 0.46 - nl * 0.04 - Math.abs(a2) * 0.05, Math.cos(a2) * nr * 0.85 + 0.05);
      }
    }
    add(sphere(0.022, 10, 10), MAT.gem, upper, 0, 0.36, 0.16); // pendant

    // ── NECK + HEAD (face fully veiled) ──
    add(cyl(0.05, 0.06, 0.1, 14), MAT.black, upper, 0, 0.56, 0);
    var head = new THREE.Group(); head.position.set(0, 0.66, 0); upper.add(head);
    rig.head = head;
    // head form under veil
    add(sphere(0.13, 22, 18), MAT.black2, head, 0, 0.06, 0, 0, 0, 0, 0.95, 1.12, 1);
    // the VEIL — full drape covering face, falling to shoulders
    var veilFront = add(sphere(0.16, 24, 20), MAT.black, head, 0, 0.04, 0.01, 0, 0, 0, 1.05, 1.25, 1.1);
    rig.veil.push(veilFront);
    // veil falling down sides/back
    var veilBack = add(cyl(0.17, 0.22, 0.5, 20), MAT.black, head, 0, -0.2, -0.04);
    rig.veil.push(veilBack);
    add(cyl(0.18, 0.24, 0.4, 20), MAT.black2, head, 0, -0.26, -0.06);
    // faint gold border on veil edge (over forehead)
    add(new THREE.TorusGeometry(0.135, 0.01, 8, 30), MAT.gold, head, 0, 0.12, 0.06, PI / 2.3, 0, 0);
    // maang-tikka jewel resting on veil
    add(sphere(0.018, 10, 10), MAT.gold2, head, 0, 0.2, 0.08);
    add(sphere(0.013, 8, 8), MAT.gem, head, 0, 0.16, 0.11);
    // suggestion of shadowed face (very subtle, fully covered)
    add(sphere(0.1, 18, 14), phys(0x040204, 0.95), head, 0, 0.02, 0.1, 0, 0, 0, 0.85, 1, 0.4);

    // ── ARMS: jointed chain, built hanging; posed via groups ──
    function makeArm(side) {
      var sh = new THREE.Group(); sh.position.set(side * 0.17, 0.46, 0.0); upper.add(sh);
      add(sphere(0.07, 14, 12), MAT.maroon, sh, 0, 0, 0);                       // shoulder
      var ua = new THREE.Group(); sh.add(ua);
      add(cyl(0.055, 0.05, 0.3, 16), MAT.maroon2, ua, 0, -0.16, 0);             // upper arm sleeve
      // gold armband
      add(new THREE.TorusGeometry(0.057, 0.01, 8, 20), MAT.gold, ua, 0, -0.28, 0, PI / 2, 0, 0);
      add(sphere(0.05, 12, 10), MAT.skin, ua, 0, -0.32, 0);                     // elbow
      var fa = new THREE.Group(); fa.position.set(0, -0.32, 0); ua.add(fa);
      add(cyl(0.045, 0.04, 0.28, 14), MAT.skin, fa, 0, -0.15, 0);               // forearm
      // bangles (choodiyan)
      for (var b = 0; b < 5; b++) add(new THREE.TorusGeometry(0.046, 0.008, 8, 20), b % 2 ? MAT.gem : MAT.gold, fa, 0, -0.24 - b * 0.016, 0, PI / 2, 0, 0);
      add(sphere(0.04, 12, 10), MAT.skin, fa, 0, -0.31, 0);                     // wrist
      var hnd = new THREE.Group(); hnd.position.set(0, -0.31, 0); fa.add(hnd);
      add(sphere(0.045, 14, 12), MAT.skin, hnd, 0, -0.03, 0, 0, 0, 0, 1, 0.95, 0.6); // palm
      // fingers
      for (var f = -1.5; f <= 1.5; f++) {
        add(cyl(0.011, 0.009, 0.085, 8), MAT.skin, hnd, f * 0.018, -0.085, 0.005, 0.2, 0, 0);
        add(sphere(0.009, 8, 8), MAT.skin, hnd, f * 0.018, -0.13, 0.018);
      }
      // thumb
      add(cyl(0.012, 0.01, 0.05, 8), MAT.skin, hnd, side * -0.04, -0.05, 0.02, 0.3, 0, side * 0.6);
      // mehndi hint
      add(new THREE.CircleGeometry(0.02, 12), phys(0x6a1810, 0.7, 0, { transparent: true, opacity: 0.5 }), hnd, 0, -0.05, 0.04, -0.4, 0, 0);
      return { sh: sh, ua: ua, fa: fa, hnd: hnd };
    }
    rig.armL = makeArm(-1);
    rig.armR = makeArm(1);

    // store the ORIGINAL pose so we can always return to it
    captureOriginalPose();
  }

  /* ─────────────────────────────────────────────
     7. ORIGINAL POSE memory  (per spec: preserve default)
  ───────────────────────────────────────────── */
  var ORIGINAL = {
    // arm joint rotations that read as "hands resting, one on raised knee"
    armL: { shZ: 0.12, uaX: 0.15, faX: 0.55, faZ: 0.05 },
    armR: { shZ: 0.10, uaX: 0.55, faX: 0.85, faZ: 0.08 }, // right rests on elevated knee
    headX: 0.04, upperX: 0.0, upperY: 0.0
  };
  function captureOriginalPose() {
    applyArm(rig.armL, ORIGINAL.armL, -1);
    applyArm(rig.armR, ORIGINAL.armR, 1);
    if (rig.head) rig.head.rotation.x = ORIGINAL.headX;
  }
  // live pose values that the animator tweens
  var pose = {
    L: Object.assign({}, ORIGINAL.armL),
    R: Object.assign({}, ORIGINAL.armR),
    headX: ORIGINAL.headX, upperX: 0, upperY: 0
  };
  function applyArm(arm, v, side) {
    if (!arm) return;
    arm.sh.rotation.z = side * v.shZ;
    arm.ua.rotation.x = -v.uaX;
    arm.fa.rotation.x = -v.faX;
    arm.fa.rotation.z = side * v.faZ;
  }

  /* ─────────────────────────────────────────────
     8. STATE / ANIMATION CONTROLLER
  ───────────────────────────────────────────── */
  var STATE = 'IDLE';
  var stateLock = false; // true while a scripted (namaste/clap) sequence runs

  function tween(target, props, dur, ease, onComplete) {
    if (HAS_GSAP) {
      gsap.to(target, Object.assign({ duration: dur, ease: ease || 'power2.inOut', onComplete: onComplete }, props));
    } else {
      // minimal fallback: snap after dur
      for (var k in props) target[k] = props[k];
      if (onComplete) setTimeout(onComplete, dur * 1000);
    }
  }

  function goNamaste() {
    if (stateLock) return;
    stateLock = true; STATE = 'NAMASTE';
    // raise both hands to chest, palms together, slight bow
    var P = { shZ: 0.62, uaX: 0.45, faX: 1.78, faZ: 1.18 };
    tween(pose.L, P, 1.0, 'power3.inOut');
    tween(pose.R, P, 1.0, 'power3.inOut');
    tween(pose, { headX: 0.3, upperX: 0.14 }, 1.0, 'power2.inOut', function () {
      showBubble('Namaste 🙏\nWelcome.\nPlease read the disclaimer carefully.', 4500);
    });
    // hold longer, then return
    setTimeout(returnToOriginal, 5500);
  }

  function goClap() {
    // Accept → show darling line (no movement), then signal parent site to enter.
    showBubble('"darling — my whole work is to confuse you.\nand it seems to be working perfectly." 🙏', 6000);
    setTimeout(function () {
      try { if (window.parent && window.parent !== window) window.parent.postMessage('koordinates-enter', '*'); } catch (e) {}
    }, 3200);
  }

  function doClaps(n, done) {
    var i = 0;
    function clap() {
      if (i >= n) { if (done) done(); return; }
      i++;
      // OPEN: palms apart (faZ smaller = hands move apart)
      tween(pose.L, { faZ: 0.42 }, 0.10, 'power1.out');
      tween(pose.R, { faZ: 0.42 }, 0.10, 'power1.out', function () {
        // CLOSE: palms meet at centre (faZ bigger = hands swing inward and meet)
        tween(pose.L, { faZ: 0.88 }, 0.09, 'power2.in');
        tween(pose.R, { faZ: 0.88 }, 0.09, 'power2.in', function () {
          playClapSound();
          burstSparkles();
          setTimeout(clap, 120);
        });
      });
    }
    clap();
  }

  // "Not yet" → graceful pranaam (palms join at chest) + laadle dialogue + laugh → exit
  function goDecline() {
    if (stateLock) return;
    stateLock = true; STATE = 'PRANAAM';
    // PRANAAM posture: shoulders tucked toward centre (high shZ), upper arms slightly
    // forward, elbows sharply bent, forearms swung fully inward so palms PRESS together.
    var P = { shZ: 0.62, uaX: 0.45, faX: 1.78, faZ: 1.18 };
    tween(pose.L, P, 1.0, 'power3.inOut');
    tween(pose.R, P, 1.0, 'power3.inOut');
    // respectful deep head bow + slight upper-body lean
    tween(pose, { headX: 0.34, upperX: 0.16 }, 1.0, 'power2.inOut', function () {
      // hold the namaste a beat, then speak + soft laugh
      setTimeout(function () {
        showBubble('"chal laadle... 🙏\nbahut shukriya —\nwarna intelligent ho jaate."', 0);
        playLaugh();
        setTimeout(playLaugh, 1400); // second little giggle
      }, 500);
      // longer hold so the moment lands, then exit screen
      setTimeout(function () {
        hideBubble();
        var ex = document.getElementById('exit-screen');
        if (ex) ex.classList.add('open');
        returnToOriginal();
      }, 7000);
    });
  }

  function returnToOriginal() {
    STATE = 'IDLE';
    tween(pose.L, Object.assign({}, ORIGINAL.armL), 0.9, 'power2.inOut');
    tween(pose.R, Object.assign({}, ORIGINAL.armR), 0.9, 'power2.inOut');
    tween(pose, { headX: ORIGINAL.headX, upperX: 0 }, 0.9, 'power2.inOut', function () {
      stateLock = false;
    });
  }

  /* ─────────────────────────────────────────────
     9. SPEECH BUBBLE
  ───────────────────────────────────────────── */
  var bubbleTimer = null;
  function showBubble(text, ms) {
    bubble.textContent = text;
    bubble.classList.add('show');
    if (bubbleTimer) clearTimeout(bubbleTimer);
    if (ms) bubbleTimer = setTimeout(hideBubble, ms);
  }
  function hideBubble() { bubble.classList.remove('show'); }

  /* ─────────────────────────────────────────────
     10. CLAP SOUND (Web Audio, no files)
  ───────────────────────────────────────────── */
  var actx = null;
  function getCtx() {
    if (!actx) { try { actx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) {} }
    return actx;
  }
  window.addEventListener('pointerdown', function () {
    var c = getCtx(); if (c && c.state === 'suspended') c.resume();
  });
  function playClapSound() {
    var c = getCtx(); if (!c) return;
    var now = c.currentTime;
    var len = Math.floor(c.sampleRate * 0.12);
    var buf = c.createBuffer(1, len, c.sampleRate), d = buf.getChannelData(0);
    for (var i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.4);
    var src = c.createBufferSource(); src.buffer = buf;
    var bp = c.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = 1750; bp.Q.value = 0.8;
    var g = c.createGain(); g.gain.setValueAtTime(0.85, now); g.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    src.connect(bp); bp.connect(g); g.connect(c.destination); src.start(now);
    var o = c.createOscillator(); o.type = 'sine';
    o.frequency.setValueAtTime(300, now); o.frequency.exponentialRampToValueAtTime(110, now + 0.08);
    var g2 = c.createGain(); g2.gain.setValueAtTime(0.45, now); g2.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    o.connect(g2); g2.connect(c.destination); o.start(now); o.stop(now + 0.12);
  }

  // soft female giggle (formant-style synthesis, no files)
  function playLaugh() {
    var c = getCtx(); if (!c) return;
    var base = c.currentTime + 0.05;
    // a gentle "ha-ha-ha-ha" — pitched vowel blips with vibrato, falling pitch
    var notes = [0, 0.18, 0.36, 0.54, 0.72];
    var pitches = [440, 470, 430, 400, 360];
    notes.forEach(function (off, idx) {
      var tt = base + off;
      // two formants per blip to fake a vowel ("ah")
      [[700, 0.5], [1100, 0.32]].forEach(function (fm) {
        var o = c.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(pitches[idx], tt);
        o.frequency.linearRampToValueAtTime(pitches[idx] * 0.92, tt + 0.12);
        var bp = c.createBiquadFilter();
        bp.type = 'bandpass'; bp.frequency.value = fm[0]; bp.Q.value = 6;
        var g = c.createGain();
        g.gain.setValueAtTime(0.0001, tt);
        g.gain.exponentialRampToValueAtTime(fm[1] * 0.22, tt + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, tt + 0.14);
        // vibrato
        var lfo = c.createOscillator(); lfo.frequency.value = 6;
        var lfoG = c.createGain(); lfoG.gain.value = 12;
        lfo.connect(lfoG); lfoG.connect(o.frequency);
        o.connect(bp); bp.connect(g); g.connect(c.destination);
        o.start(tt); o.stop(tt + 0.16);
        lfo.start(tt); lfo.stop(tt + 0.16);
      });
    });
  }

  /* ─────────────────────────────────────────────
     11. SPARKLE PARTICLES (2D overlay canvas)
  ───────────────────────────────────────────── */
  var pctx = pCanvas.getContext('2d');
  var sparks = [];
  function resizeParticles() { pCanvas.width = window.innerWidth; pCanvas.height = window.innerHeight; }
  resizeParticles();
  function burstSparkles() {
    var cx = window.innerWidth * 0.5, cy = window.innerHeight * 0.42;
    for (var i = 0; i < 26; i++) {
      var a = Math.random() * PI * 2, sp = 1 + Math.random() * 4;
      sparks.push({ x: cx, y: cy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp - 1, life: 1, hue: 35 + Math.random() * 25 });
    }
  }
  function drawSparkles() {
    pctx.clearRect(0, 0, pCanvas.width, pCanvas.height);
    for (var i = sparks.length - 1; i >= 0; i--) {
      var s = sparks[i];
      s.x += s.vx; s.y += s.vy; s.vy += 0.08; s.life -= 0.02;
      if (s.life <= 0) { sparks.splice(i, 1); continue; }
      pctx.globalAlpha = Math.max(0, s.life);
      pctx.fillStyle = 'hsl(' + s.hue + ',90%,65%)';
      pctx.beginPath(); pctx.arc(s.x, s.y, 2.4 * s.life + 0.6, 0, PI * 2); pctx.fill();
    }
    pctx.globalAlpha = 1;
  }

  /* ─────────────────────────────────────────────
     12. INTERACTION CONTROLLER
  ───────────────────────────────────────────── */
  var mouse = { x: 0, y: 0 };       // -1..1
  var target = { x: 0, y: 0 };
  var raycaster = new THREE.Raycaster();
  var hovering = false;

  function ndc(e) {
    var r = renderer.domElement.getBoundingClientRect();
    return {
      x: ((e.clientX - r.left) / r.width) * 2 - 1,
      y: -((e.clientY - r.top) / r.height) * 2 + 1
    };
  }

  window.addEventListener('pointermove', function (e) {
    var n = ndc(e);
    target.x = n.x; target.y = n.y;
    // hover detection over guardian bounds
    raycaster.setFromCamera(n, camera);
    var hits = raycaster.intersectObject(guardian, true);
    var nowHover = hits.length > 0;
    if (nowHover && !hovering) {
      hovering = true;
      renderer.domElement.style.cursor = 'pointer';
      if (!stateLock) showBubble('Welcome.\nPlease read the disclaimer carefully.', 0);
    } else if (!nowHover && hovering) {
      hovering = false;
      renderer.domElement.style.cursor = 'default';
      if (!stateLock) hideBubble();
    }
  });

  renderer.domElement.addEventListener('click', function (e) {
    var n = ndc(e);
    raycaster.setFromCamera(n, camera);
    if (raycaster.intersectObject(guardian, true).length > 0) openModal();
  });

  /* ─────────────────────────────────────────────
     13. DISCLAIMER MODAL
  ───────────────────────────────────────────── */
  var visited = false;
  function openModal() {
    modalOv.classList.add('open');
    hideBubble();
    if (hint) hint.style.opacity = 0;
  }
  function closeModal() {
    modalOv.classList.remove('open');
    if (hint) hint.style.opacity = '';
  }
  btnClose.addEventListener('click', closeModal);
  modalOv.addEventListener('click', function (e) { if (e.target === modalOv) closeModal(); });

  btnAccept.addEventListener('click', function () {
    closeModal();
    goClap();  // accept → clapping animation + "Thank you"
  });

  btnDecline.addEventListener('click', function () {
    closeModal();
    goDecline(); // "not yet" → pranaam + laadle exit
  });

  var btnReturn = document.getElementById('btn-return');
  if (btnReturn) btnReturn.addEventListener('click', function () {
    var ex = document.getElementById('exit-screen');
    if (ex) ex.classList.remove('open');
    returnToOriginal();
  });

  /* ─────────────────────────────────────────────
     14. RESIZE
  ───────────────────────────────────────────── */
  window.addEventListener('resize', function () {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    resizeParticles();
  });

  /* ─────────────────────────────────────────────
     15. MAIN LOOP
  ───────────────────────────────────────────── */
  var clock = new THREE.Clock();
  var MAX_ROT = 10 * DEG;           // spec: max 10° mouse rotation

  function animate() {
    requestAnimationFrame(animate);
    var t = clock.getElapsedTime();

    // smooth mouse follow
    mouse.x += (target.x - mouse.x) * 0.06;
    mouse.y += (target.y - mouse.y) * 0.06;

    if (rig.head && rig.upper) {
      // head follows cursor (clamped to 10°), plus current bow
      rig.head.rotation.y = mouse.x * MAX_ROT;
      rig.head.rotation.x = pose.headX + (-mouse.y * MAX_ROT * 0.6);
      // upper body subtle rotation
      rig.upper.rotation.y = mouse.x * MAX_ROT * 0.5;
      rig.upper.rotation.x = pose.upperX + (-mouse.y * MAX_ROT * 0.25);
    }

    // apply live arm pose
    applyArm(rig.armL, pose.L, -1);
    applyArm(rig.armR, pose.R, 1);

    // IDLE secondary motion: breathing, float, sway, cloth
    var breathe = Math.sin(t * 1.4) * 0.012;
    var float = Math.sin(t * 0.7) * 0.02;
    guardian.position.y = float;
    guardian.rotation.z = Math.sin(t * 0.5) * 0.01;          // idle sway
    if (rig.upper) rig.upper.scale.y = 1 + breathe;          // breathing
    // subtle cloth/veil movement
    for (var i = 0; i < rig.veil.length; i++) {
      rig.veil[i].rotation.z = Math.sin(t * 0.9 + i) * 0.012;
    }
    // glow pulse
    glowSprite.material.opacity = 0.85 + Math.sin(t * 1.6) * 0.12;

    drawSparkles();
    renderer.render(scene, camera);
  }

  /* ─────────────────────────────────────────────
     16. LOAD guardian.glb  (rig fallback per spec)
  ───────────────────────────────────────────── */
  var mixer = null;

  function finishBoot() {
    loaderBar.style.width = '100%';
    setTimeout(function () {
      loader.classList.add('fade');
      animate();
      // STATE 2 trigger: first visit / disclaimer section → Namaste
      if (!visited) { visited = true; setTimeout(goNamaste, 700); }
    }, 300);
  }

  function buildAndBoot() {
    buildProceduralGuardian();
    finishBoot();
  }

  if (typeof THREE.GLTFLoader !== 'undefined') {
    loaderSub.textContent = 'loading guardian.glb…';
    loaderBar.style.width = '40%';
    var gl = new THREE.GLTFLoader();
    gl.load(
      'guardian.glb',
      function (gltf) {
        // ── GLB present: place it, preserve original pose, play clips ──
        var model = gltf.scene;
        model.traverse(function (o) { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
        // normalize scale/position into our scene
        var bbox = new THREE.Box3().setFromObject(model);
        var size = new THREE.Vector3(); bbox.getSize(size);
        var s = size.y > 0 ? (2.0 / size.y) : 1;
        model.scale.setScalar(s);
        bbox.setFromObject(model);
        model.position.y -= bbox.min.y;          // feet on floor
        guardian.add(model);

        // If the GLB has animation clips, wire an AnimationMixer
        if (gltf.animations && gltf.animations.length) {
          mixer = new THREE.AnimationMixer(model);
          // play first clip as idle if named generically
          gltf.animations.forEach(function (clip) {
            // keep paused; idle handled procedurally unless a clip is named
            var act = mixer.clipAction(clip);
            if (/idle/i.test(clip.name)) act.play();
          });
        }

        // Map a humanoid rig if bones exist; else auto-rig procedurally
        var hasBones = false;
        model.traverse(function (o) { if (o.isBone) hasBones = true; });
        if (!hasBones) {
          // ── auto-rig fallback: build procedural arms anchored to model ──
          buildProceduralGuardian();   // adds posable arms/head in front of static mesh
        } else {
          // minimal mapping: expose whole model as upper/head so mouse-follow works
          rig.upper = model; rig.head = model;
          // procedural arms still drive namaste/clap reliably
          buildProceduralGuardian();
        }
        finishBoot();
      },
      function (xhr) {
        if (xhr.total) loaderBar.style.width = (40 + (xhr.loaded / xhr.total) * 50) + '%';
      },
      function () {
        // ── GLB missing/failed → full procedural guardian ──
        loaderSub.textContent = 'guardian.glb not found — generating guardian…';
        buildAndBoot();
      }
    );
  } else {
    buildAndBoot();
  }

})();
