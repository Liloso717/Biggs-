'use strict';
/* ===================== IRON MERIDIAN · zero-HP ragdoll trigger & seamless collapse blending ===================== */
// Unified zero-HP ragdoll physics trigger for all combat units (infantry, Hero, Walkers, Shiftframes,
// Hover Tanks, Skyrunners, and Deep Titans). Captures each unit's exact active pose and momentum at
// the moment HP reaches zero and seamlessly blends into damped physical collapse or ballistic ragdoll.

const RAG = { blast: null };
const _rv1 = new V3(), _rv2 = new V3();

/* ---------- math & terrain helpers (zero per-frame allocation) ---------- */
function ragGroundY(x, z, y) {
  const sy = surfY(x, z, y + 0.5);
  return typeof roofUnder === 'function' ? Math.max(sy, roofUnder(_rv2.set(x, y + 0.5, z))) : sy;
}
function ragSlopePitch(x, z, y, yaw) {
  const h0 = H(x, z);
  if (Math.abs(y - h0) > 1.2 || h0 < -0.3) return 0; // elevated deck/roof or water: lie flat
  const d = 0.65, fx = Math.sin(yaw) * d, fz = Math.cos(yaw) * d;
  const dh = (H(x + fx, z + fz) - H(x - fx, z - fz)) / (d * 2);
  return clamp(-Math.atan(dh), -0.42, 0.42);
}
function ragEaseIn(t) { return t * t; }
function ragEaseOut(t) { const u = 1 - t; return 1 - u * u; }
function ragSmooth(t) { return t * t * (3 - 2 * t); }
function ragSpring(st, target, k, damp, dt) {
  // Semi-implicit Euler spring-damper for secondary joint inertia & organic settle
  const f = (target - st.p) * k - st.v * damp;
  st.v += f * dt;
  st.p += st.v * dt;
  return st.p;
}
function makeSpring(p, v) { return { p: p || 0, v: v || 0 }; }

/* ---------- active pose snapshot: captures exact live transforms before physical takeover ---------- */
function captureActivePose(e) {
  const o = e.obj;
  const snap = {
    rx: o ? o.rotation.x : 0,
    ry: e.yaw !== undefined ? e.yaw : (e.heading !== undefined ? e.heading : (o ? o.rotation.y : 0)),
    rz: o ? o.rotation.z : 0,
    posYOff: o && e.pos ? clamp(o.position.y - e.pos.y, -1.5, 1.5) : 0,
    vx: 0, vz: 0,
    wasCrouch: !!e.crouch,
    wasSwim: !!e.swim,
    wasMounted: !!e.mount,
    wasDowned: !!e.downPose,
  };

  // Capture live active horizontal velocity so sprinting/moving units carry momentum into collapse
  if (e.kind === 'soldier') {
    const sp = e.isPlayer && typeof MOB !== 'undefined' && MOB.v ? Math.hypot(MOB.v.x, MOB.v.z) : (e.moveSpeed || 0);
    if (e.isPlayer && typeof MOB !== 'undefined' && MOB.v) {
      snap.vx = clamp(MOB.v.x, -10, 10);
      snap.vz = clamp(MOB.v.z, -10, 10);
    } else if (sp > 0.1) {
      const a = e.faceYaw !== undefined ? e.faceYaw : (e.yaw || 0);
      snap.vx = Math.sin(a) * clamp(sp, 0, 9);
      snap.vz = Math.cos(a) * clamp(sp, 0, 9);
    }
    if (e.hero && e.heroParts) {
      const H0 = e.heroParts;
      snap.hero = {
        by: H0.body.position.y, brx: H0.body.rotation.x, brz: H0.body.rotation.z,
        hrx: H0.head.rotation.x, hry: H0.head.rotation.y, hrz: H0.head.rotation.z,
        l0x: H0.legs[0].thigh.rotation.x, l0z: H0.legs[0].thigh.rotation.z, s0x: H0.legs[0].shin.rotation.x,
        l1x: H0.legs[1].thigh.rotation.x, l1z: H0.legs[1].thigh.rotation.z, s1x: H0.legs[1].shin.rotation.x,
        a0x: H0.arms[0].sh.rotation.x, a0y: H0.arms[0].sh.rotation.y, a0z: H0.arms[0].sh.rotation.z, e0x: H0.arms[0].el.rotation.x,
        a1x: H0.arms[1].sh.rotation.x, a1y: H0.arms[1].sh.rotation.y, a1z: H0.arms[1].sh.rotation.z, e1x: H0.arms[1].el.rotation.x,
      };
    } else {
      snap.bodyY = e.body ? e.body.position.y : 0;
      snap.bodyRx = e.body ? e.body.rotation.x : 0;
      snap.bodyRz = e.body ? e.body.rotation.z : 0;
      snap.uX = e.upper ? e.upper.rotation.x : 0;
      snap.uY = e.upper ? e.upper.rotation.y : 0;
      snap.uZ = e.upper ? e.upper.rotation.z : 0;
      snap.hX = e.head ? e.head.rotation.x : 0;
      snap.hY = e.head ? e.head.rotation.y : 0;
      snap.hZ = e.head ? e.head.rotation.z : 0;
      snap.aX = e.arms ? e.arms.rotation.x : 0;
      snap.aZ = e.arms ? e.arms.rotation.z : 0;
      if (e.legs && e.legs.length >= 2) {
        snap.l0ThX = e.legs[0].th.rotation.x; snap.l0ThZ = e.legs[0].th.rotation.z; snap.l0ShX = e.legs[0].sh.rotation.x;
        snap.l1ThX = e.legs[1].th.rotation.x; snap.l1ThZ = e.legs[1].th.rotation.z; snap.l1ShX = e.legs[1].sh.rotation.x;
      } else {
        snap.l0ThX = snap.l0ThZ = snap.l0ShX = snap.l1ThX = snap.l1ThZ = snap.l1ShX = 0;
      }
    }
  } else if (e.kind === 'walker' && e.torso) {
    snap.torsoY = e.torso.position.y;
    snap.torsoRx = e.torso.rotation.x;
    snap.torsoRy = e.torso.rotation.y;
    snap.torsoRz = e.torso.rotation.z;
    snap.speed = e.speed || 0;
    snap.wLegs = (e.legs || []).map(L => ({
      hx: L.hip.rotation.x, hz: L.hip.rotation.z,
      kx: L.knee.rotation.x, ax: L.ankle.rotation.x,
    }));
  } else if (e.kind === 'shiftframe' && e.parts && e.legs && e.arms) {
    snap.t0y = e.parts[0].g.position.y; snap.t0rz = e.parts[0].g.rotation.z;
    snap.h0y = e.parts[1].g.position.y; snap.h0rx = e.parts[1].g.rotation.x; snap.h0ry = e.parts[1].g.rotation.y; snap.h0rz = e.parts[1].g.rotation.z;
    snap.p0y = e.parts[2].g.position.y;
    snap.speed = e.speed || 0;
    snap.sfLegs = e.legs.map(L => ({ thx: L.th.rotation.x, thz: L.th.rotation.z, shx: L.sh.rotation.x }));
    snap.sfArms = e.arms.map(A => ({ uax: A.ua.rotation.x, uaz: A.ua.rotation.z, fax: A.fa.rotation.x }));
  } else if (e.kind === 'tank') {
    snap.turY = e.tur ? e.tur.position.y : 2.9;
    snap.turRx = e.tur ? e.tur.rotation.x : 0;
    snap.turRy = e.tur ? e.tur.rotation.y : 0;
    snap.turRz = e.tur ? e.tur.rotation.z : 0;
  } else if (e.kind === 'bird') {
    snap.neckRx = e.neck ? e.neck.rotation.x : 0;
    snap.bLegs = (e.legs || []).map(L => ({ thx: L.th.rotation.x, shx: L.sh.rotation.x }));
    snap.wings = (e.wings || []).map(W => ({ wz: W.w.rotation.z, tz: W.tip.rotation.z }));
  } else if (e.kind === 'monster' && e.hips && e.torso) {
    snap.hipsY = e.hips.position.y;
    snap.hipsRz = e.hips.rotation.z;
    snap.torsoRx = e.torso.rotation.x;
    snap.neckRx = e.neck ? e.neck.rotation.x : 0;
    snap.headRx = e.head ? e.head.rotation.x : 0;
    snap.jawRx = e.jaw ? e.jaw.rotation.x : 0;
    snap.tLegs = (e.legs || []).map(L => ({ thx: L.th.rotation.x, knx: L.kn.rotation.x, anx: L.an.rotation.x }));
    snap.tArms = (e.arms || []).map(A => ({ shx: A.sh.rotation.x, elx: A.el.rotation.x }));
  }

  return snap;
}

/* ---------- unified zero-HP ragdoll physics trigger ---------- */
function triggerUnitRagdoll(e, src, type, snap) {
  if (!e || e._ragTriggered || e.hp > 0) return;
  e._ragTriggered = true;
  if (!e.lastHit && (src || type)) {
    e.lastHit = { src, type: type || 'bullet', a: 50, t: TIME, px: src && src.pos ? src.pos.x : null, pz: src && src.pos ? src.pos.z : null };
  }
  const S = snap || captureActivePose(e);
  if (e.kind === 'soldier') ragStartSoldier(e, S);
  else if (e.kind === 'walker') ragStartWalker(e, S);
  else if (e.kind === 'shiftframe') ragStartShiftframe(e, S);
  else if (e.kind === 'tank') ragStartTank(e, S);
  else if (e.kind === 'bird') ragStartBird(e, S);
  else if (e.kind === 'monster') ragStartTitan(e, S);
}

/* ---------- hooks: blast tracking, zero-HP detection on damage & killed ---------- */
{
  const _ed = explodeDamage;
  explodeDamage = function (p, radius, dmg, src, team, skip) {
    RAG.blast = { p: p.clone(), dmg, radius, t: TIME };
    return _ed(p, radius, dmg, src, team, skip);
  };

  // Base Ent.damage hook: records directional hit data for all unit types and catches zero-HP transitions
  const _edmg = Ent.prototype.damage;
  Ent.prototype.damage = function (a, src, type) {
    this.lastHit = { src, type, a, t: TIME, px: src && src.pos ? src.pos.x : null, pz: src && src.pos ? src.pos.z : null };
    const wasAlive = this.alive;
    const preSnap = (!this._preDeathSnap && wasAlive && !this.imp && this.hp - a * 2.25 <= 0) ? captureActivePose(this) : null;
    if (preSnap) this._preDeathSnap = preSnap;
    const res = _edmg.call(this, a, src, type);
    if (wasAlive && (this.hp <= 0 || !this.alive) && !this._ragTriggered) {
      triggerUnitRagdoll(this, src, type, this._preDeathSnap);
    }
    this._preDeathSnap = null;
    return res;
  };

  // Soldier.damage hook: subtle articulated flinch on non-lethal hits & pre-downed pose capture
  const _sdmg = Soldier.prototype.damage;
  Soldier.prototype.damage = function (a, src, type) {
    this.lastHit = { src, type, a, t: TIME, px: src && src.pos ? src.pos.x : null, pz: src && src.pos ? src.pos.z : null };
    const wasAlive = this.alive && !this.downed;
    const preSnap = wasAlive && !this.imp ? captureActivePose(this) : null;
    if (preSnap) this._preDeathSnap = preSnap;
    const res = _sdmg.call(this, a, src, type);
    // If soldier just transitioned into downed state, attach their exact active pose for seamless blend
    if (wasAlive && this.alive && this.downed && preSnap) {
      this._downSnap = preSnap;
    } else if (wasAlive && this.alive && !this.downed && this.upper && !this.imp && a >= 6) {
      // Subtle articulated recoil flinch on non-lethal hits
      let lx = 0, lz = 1;
      if (src && src.pos) {
        const ang = angDiff(this.yaw, Math.atan2(src.pos.x - this.pos.x, src.pos.z - this.pos.z));
        lx = Math.sin(ang); lz = Math.cos(ang);
      }
      const k = clamp(a / 45, 0.25, 1);
      this.flinchT = 0.22;
      this.flinchX = clamp(-lz * 0.28 * k, -0.32, 0.32);
      this.flinchZ = clamp(lx * 0.22 * k, -0.24, 0.24);
      this.flinchY = clamp(lx * 0.24 * k, -0.25, 0.25);
    }
    this._preDeathSnap = null;
    return res;
  };

  // Base Ent.killed hook: catches all direct zero-HP eliminations (bleedout, finishers, scripts)
  const _ekilled = Ent.prototype.killed;
  Ent.prototype.killed = function (src, type) {
    const snap = this._preDeathSnap || (!this.imp ? captureActivePose(this) : null);
    this._preDeathSnap = null;
    const res = _ekilled.call(this, src, type);
    if (this.hp <= 0 || !this.alive) triggerUnitRagdoll(this, src, type, snap);
    return res;
  };

  // Creatures overriding killed() without calling super.killed()
  if (typeof Bird !== 'undefined') {
    const _bkilled = Bird.prototype.killed;
    Bird.prototype.killed = function (src, type) {
      const snap = this._preDeathSnap || captureActivePose(this);
      this._preDeathSnap = null;
      const res = _bkilled.call(this, src, type);
      triggerUnitRagdoll(this, src, type, snap);
      return res;
    };
    const _bspawn = Bird.prototype.spawnAt;
    Bird.prototype.spawnAt = function (p) {
      this._ragTriggered = false; this.bdCol = null;
      return _bspawn.call(this, p);
    };
  }
  if (typeof Titan !== 'undefined') {
    const _tkilled = Titan.prototype.killed;
    Titan.prototype.killed = function (src, type) {
      const snap = this._preDeathSnap || captureActivePose(this);
      this._preDeathSnap = null;
      const res = _tkilled.call(this, src, type);
      triggerUnitRagdoll(this, src, type, snap);
      return res;
    };
  }

  // Clean reset when a downed soldier is revived
  const _srev = Soldier.prototype.revive;
  Soldier.prototype.revive = function (by) {
    this._ragTriggered = false;
    this.rag = null;
    this.downPose = null;
    this._downSnap = null;
    return _srev.call(this, by);
  };
}

/* ---------- Soldier ragdoll & seamless collapse initialization ---------- */
function ragStartSoldier(s, snap) {
  if (s.imp || camera.position.distanceTo(s.pos) > 260) return; // distant units keep cheap fall
  const h = s.lastHit || {}, type = h.type || 'bullet';
  const fromX = h.px != null ? h.px : (h.src && h.src.pos ? h.src.pos.x : null);
  const fromZ = h.pz != null ? h.pz : (h.src && h.src.pos ? h.src.pos.z : null);
  if (snap.wasMounted) snap.posYOff = 0;

  // Bleed-out from downed state: smoothly relax from exact captured breathing pose into stillness
  if (s.downPose && !s.hero) {
    const dp = s.downPose;
    s.downPose = null;
    s.rag = {
      mode: 'bleedout',
      snap,
      t: 0, dur: 0.7,
      rest: dp.rest, restRoll: dp.side * rand(0.08, 0.22),
      side: dp.side,
      headRestY: dp.side * rand(0.35, 0.65),
      headRestZ: dp.side * rand(0.22, 0.42),
      legBend: rand(0.15, 0.45),
      slope: ragSlopePitch(s.pos.x, s.pos.z, s.pos.y, s.yaw),
      ground: true,
    };
    s.obj.rotation.order = 'YXZ';
    return;
  }

  // Hero rig collapse: seamlessly blends from active stride / crouch / slash / aim pose
  if (s.hero && s.heroParts) {
    const side = Math.random() < 0.5 ? 1 : -1;
    let back = true;
    if (fromX != null) {
      const hitYaw = Math.atan2(s.pos.x - fromX, s.pos.z - fromZ);
      back = Math.cos(hitYaw - s.yaw) < 0;
    }
    s.rag = {
      mode: 'hero',
      snap,
      t: 0, dur: 0.95, blendDur: 0.22,
      vx: snap.vx * 0.55, vz: snap.vz * 0.55,
      back, side,
      rest: back ? -1.5 : 1.46,
      slope: ragSlopePitch(s.pos.x, s.pos.z, s.pos.y, s.yaw),
      landed: false, impactT: 0,
      ground: true,
    };
    s.obj.rotation.order = 'YXZ';
    return;
  }

  // Compute hit direction & power
  let fx = 0, fz = 0, hasDir = false, power = 2.4;
  const blastFresh = RAG.blast && TIME - RAG.blast.t < 0.22;
  if ((type === 'splash' || type === 'burn') && blastFresh && RAG.blast.dmg >= 32) {
    fx = s.pos.x - RAG.blast.p.x; fz = s.pos.z - RAG.blast.p.z; hasDir = true;
    power = clamp(RAG.blast.dmg / 15, 6.2, 17);
  } else if (type === 'crash' || type === 'ram') {
    if (fromX != null) { fx = s.pos.x - fromX; fz = s.pos.z - fromZ; hasDir = true; }
    power = 11.5;
  } else if (type === 'blade' || type === 'melee') {
    if (fromX != null) { fx = s.pos.x - fromX; fz = s.pos.z - fromZ; hasDir = true; }
    power = h.a >= 150 ? 6.5 : 3.8;
  } else {
    if (fromX != null) { fx = s.pos.x - fromX; fz = s.pos.z - fromZ; hasDir = true; }
    power = h.a >= 140 ? 7.2 : h.a > 60 ? 3.8 : 2.2;
  }

  let dx = 0, dz = 0;
  if (hasDir) {
    const l = Math.hypot(fx, fz) || 1;
    dx = fx / l; dz = fz / l;
  } else {
    const a = Math.random() * Math.PI * 2;
    dx = Math.sin(a); dz = Math.cos(a);
  }

  const impYaw = Math.atan2(dx, dz);
  const relAng = angDiff(s.yaw, impYaw);
  const cosA = Math.cos(relAng);
  const sinA = Math.sin(relAng);
  const back = cosA < 0.05;
  const flank = Math.abs(sinA) > 0.62;
  const side = Math.abs(sinA) > 0.15 ? Math.sign(sinA) : (Math.random() < 0.5 ? 1 : -1);
  const lowG = s.pos.y > 1200;
  const isLaunch = lowG || power > 5.8 || type === 'crash' || type === 'ram';

  // Seed secondary joint springs directly from captured active pose + directional impact kick
  const hitKickX = (back ? -1 : 1) * clamp(power * 1.1, 1.8, 6.5);
  const hitKickZ = side * clamp(power * 0.7, 1.0, 4.5);
  const sp = {
    uX: makeSpring(snap.uX, hitKickX),
    uY: makeSpring(snap.uY, side * clamp(power * 0.85, 1.0, 5.0)),
    uZ: makeSpring(snap.uZ, hitKickZ),
    hX: makeSpring(snap.hX, hitKickX * 1.45),
    hY: makeSpring(snap.hY, side * rand(1.5, 3.8)),
    hZ: makeSpring(snap.hZ, hitKickZ * 1.3),
    aX: makeSpring(snap.aX, -hitKickX * 0.55),
    aZ: makeSpring(snap.aZ, hitKickZ * 0.9),
  };

  if (isLaunch) {
    // Inherit active running momentum + explosive launch impulse
    const v = new V3(snap.vx * 0.45 + dx * power, power * rand(0.45, 0.8), snap.vz * 0.45 + dz * power);
    s.rag = {
      mode: 'launch',
      snap, sp,
      v,
      rx: snap.rx, rz: snap.rz,
      ax: (back ? -1 : 1) * rand(3.6, 8.2),
      az: side * rand(1.8, 5.2),
      ay: side * rand(1.2, 3.6),
      ground: false, bounces: 0, impactT: 0,
      rest: back ? -1.52 : 1.48,
      restRoll: side * rand(0.08, 0.28),
      side, back,
      flail: [rand(0, 6), rand(0, 6)],
      headRestY: side * rand(0.25, 0.65),
      headRestZ: side * rand(0.18, 0.42),
      armDrop: rand(0.35, 0.72),
      legAsym: rand(0.25, 0.75),
      slope: 0,
      t: 0, blendDur: 0.18,
    };
    s.obj.rotation.order = 'YXZ';
    return;
  }

  // Swimming elimination: seamless transition into water float
  if (snap.wasSwim) {
    s.rag = {
      mode: 'swimdead',
      snap, sp,
      t: 0, dur: 0.85,
      vx: snap.vx * 0.4 + dx * 1.1, vz: snap.vz * 0.4 + dz * 1.1,
      side,
      headRestY: side * rand(0.3, 0.6),
      headRestZ: side * rand(0.2, 0.4),
      ground: true,
    };
    s.obj.rotation.order = 'YXZ';
    return;
  }

  // Grounded subtle collapse archetypes
  let mode = 'crumple';
  if (type === 'laser' || type === 'burn') {
    mode = Math.random() < 0.72 ? 'burn' : 'crumple';
  } else if (type === 'blade' || type === 'melee') {
    mode = 'spin';
  } else if (flank && Math.random() < 0.65) {
    mode = 'spin';
  } else if (back && !snap.wasCrouch && (power > 2.8 || Math.random() < 0.48)) {
    mode = 'stagger';
  } else {
    mode = Math.random() < 0.62 || snap.wasCrouch ? 'crumple' : (back ? 'stagger' : 'spin');
  }

  // Carry active running momentum smoothly into the stumble/collapse slide
  const slideSpd = mode === 'stagger' ? rand(2.0, 3.2) : mode === 'spin' ? rand(1.1, 2.2) : rand(0.5, 1.3);
  const vx = snap.vx * 0.58 + dx * slideSpd;
  const vz = snap.vz * 0.58 + dz * slideSpd;

  const movingFwd = (snap.vx * Math.sin(s.yaw) + snap.vz * Math.cos(s.yaw)) > 2.2;
  const fallForward = mode === 'crumple'
    ? (movingFwd || !back || Math.random() < 0.55)
    : mode === 'burn' ? Math.random() < 0.65 : !back;
  const rest = fallForward ? 1.48 : -1.52;
  const dur = snap.wasCrouch ? rand(0.52, 0.68)
    : mode === 'burn' ? rand(0.76, 0.96)
    : mode === 'stagger' ? rand(0.72, 0.9)
    : mode === 'spin' ? rand(0.68, 0.86)
    : rand(0.7, 0.92);

  s.rag = {
    mode,
    snap, sp,
    t: 0, dur, blendDur: 0.2,
    vx, vz,
    side, back, fallForward,
    yaw0: snap.ry,
    spinAmt: mode === 'spin' ? side * rand(0.95, 2.15) : side * rand(0.08, 0.34),
    rest,
    restRoll: side * (mode === 'spin' ? rand(0.22, 0.36) : rand(0.06, 0.24)),
    pelvisDrop: rand(0.46, 0.58),
    kneePeak: rand(1.35, 1.85),
    headRestY: side * rand(0.28, 0.68),
    headRestZ: side * rand(0.2, 0.44),
    armDrop: rand(0.42, 0.78),
    legPose: rand(0.2, 0.78),
    recoilDir: back ? -1 : 1,
    slope: ragSlopePitch(s.pos.x, s.pos.z, s.pos.y, s.yaw),
    landed: false, impactT: 0,
    ground: true,
    emberT: 0,
  };
  s.obj.rotation.order = 'YXZ';
}

/* ---------- Ground impact micro-feedback (dust + soft thud) ---------- */
function ragImpactFx(s, intensity) {
  const dist = camera.position.distanceTo(s.pos);
  if (dist < 90 && H(s.pos.x, s.pos.z) > -0.2) {
    fxDust(_rv1.copy(s.pos).setY(s.pos.y + 0.08), intensity > 1 ? 4 : 2, 1.3 * intensity, 2.4 * intensity);
  }
  if (dist < 42) snd('stomp', s.pos, 0.12 * intensity);
}

/* ---------- Step grounded subtle collapse with seamless active-state blend ---------- */
function ragStepCollapse(s, R, dt) {
  R.t += dt;
  const S = R.snap, u = clamp(R.t / R.dur, 0, 1);
  // Seamless active-pose blend envelope (0 on death frame -> 1 over ~0.2s)
  const b = R.blendDur ? ragSmooth(clamp(R.t / R.blendDur, 0, 1)) : 1;

  if (R.mode === 'swimdead') {
    const fr = Math.exp(-dt * 3.2);
    R.vx *= fr; R.vz *= fr;
    s.pos.x += R.vx * dt; s.pos.z += R.vz * dt;
    s.pos.y = Math.max(ragGroundY(s.pos.x, s.pos.z, s.pos.y), -1.2);
    const k = ragSmooth(u);
    s.obj.position.set(s.pos.x, s.pos.y + lerp(S.posYOff, 0.62, k) + Math.sin(TIME * 2 + s.phase) * 0.03, s.pos.z);
    s.obj.rotation.set(lerp(S.rx, 1.54, k), s.yaw, lerp(S.rz, R.side * 0.2, k), 'YXZ');
    if (s.body) { s.body.position.y = lerp(S.bodyY, 0, k); s.body.rotation.x = lerp(S.bodyRx, 0, k); }
    if (s.upper) s.upper.rotation.set(ragSpring(R.sp.uX, 0.08, 22, 6, dt), ragSpring(R.sp.uY, R.side * 0.12, 20, 6, dt), ragSpring(R.sp.uZ, R.side * 0.14, 20, 6, dt));
    if (s.head) s.head.rotation.set(ragSpring(R.sp.hX, 0.22, 24, 6.5, dt), ragSpring(R.sp.hY, R.headRestY, 20, 6, dt), ragSpring(R.sp.hZ, R.headRestZ, 20, 6, dt));
    if (s.arms) s.arms.rotation.set(ragSpring(R.sp.aX, 0.45, 22, 6, dt), 0, ragSpring(R.sp.aZ, R.side * 0.2, 20, 6, dt));
    if (s.legs) {
      s.legs[0].th.rotation.set(lerp(S.l0ThX, 0.12, k), 0, lerp(S.l0ThZ, -0.18, k));
      s.legs[0].sh.rotation.x = lerp(S.l0ShX, 0.28, k);
      s.legs[1].th.rotation.set(lerp(S.l1ThX, -0.08, k), 0, lerp(S.l1ThZ, 0.22, k));
      s.legs[1].sh.rotation.x = lerp(S.l1ShX, 0.2, k);
    }
    return;
  }

  // Carry horizontal velocity & decay smoothly with ground friction
  if (Math.abs(R.vx) + Math.abs(R.vz) > 0.02) {
    const drag = Math.exp(-dt * (R.landed ? 12 : R.mode === 'stagger' ? 4.0 : 6.2));
    R.vx *= drag; R.vz *= drag;
    s.pos.x += R.vx * dt; s.pos.z += R.vz * dt;
    pushOut(s.pos, 0.4);
  }
  let fy = ragGroundY(s.pos.x, s.pos.z, s.pos.y);
  if (fy < -1.2 && H(s.pos.x, s.pos.z) < 0) fy = -1.2;
  s.pos.y = fy;

  if (!R.landed && u > 0.55) R.slope = ragSlopePitch(s.pos.x, s.pos.z, s.pos.y, s.yaw);

  if (u >= 0.84 && !R.landed && R.mode !== 'bleedout') {
    R.landed = true;
    R.impactT = 0;
    ragImpactFx(s, R.mode === 'stagger' ? 1.05 : 0.85);
  }
  if (R.landed) R.impactT += dt;
  const bounce = R.landed ? Math.exp(-R.impactT * 11) * Math.sin(R.impactT * 24) * 0.09 : 0;

  let rx = 0, rz = 0, bodyY = 0, liftY = 0.14;
  let uX = 0, uY = 0, uZ = 0;
  let hX = 0, hY = 0, hZ = 0;
  let aX = 0, aZ = 0;
  let l0ThX = 0, l0ThZ = 0, l0ShX = 0;
  let l1ThX = 0, l1ThZ = 0, l1ShX = 0;

  if (R.mode === 'crumple') {
    const kneel = S.wasCrouch ? 1 : ragSmooth(clamp(u / 0.36, 0, 1));
    const tip = ragEaseIn(clamp((u - (S.wasCrouch ? 0.08 : 0.24)) / (S.wasCrouch ? 0.78 : 0.62), 0, 1));
    const relax = ragSmooth(clamp((u - 0.72) / 0.28, 0, 1));
    const jolt = Math.sin(clamp(u / 0.26, 0, 1) * Math.PI);

    s.yaw = R.yaw0 + R.spinAmt * ragEaseOut(u);
    rx = lerp(S.rx, R.rest + R.slope, tip) + bounce * Math.sign(R.rest);
    rz = lerp(S.rz, R.restRoll, ragSmooth(clamp((u - 0.15) / 0.72, 0, 1))) + bounce * 0.4 * R.side;
    bodyY = -R.pelvisDrop * kneel * (1 - tip * 0.92);
    liftY = lerp(S.posYOff, 0.14, tip);

    uX = R.recoilDir * 0.24 * jolt + (R.fallForward ? 0.34 : -0.22) * kneel * (1 - relax * 0.55);
    uY = R.side * 0.22 * kneel * (1 - relax * 0.3);
    uZ = R.side * (0.16 * kneel + 0.12 * tip);

    hX = R.recoilDir * 0.32 * jolt + (R.fallForward ? 0.32 : -0.18) * tip;
    hY = R.headRestY * tip;
    hZ = R.headRestZ * tip;

    aX = R.armDrop * (0.5 * kneel + 0.5 * tip) - 0.16 * jolt;
    aZ = R.side * 0.18 * tip;

    const fold = kneel * (1 - relax * 0.65);
    l0ThX = -0.95 * fold + (R.fallForward ? 0.08 : -0.22) * relax;
    l1ThX = -0.58 * fold + (R.fallForward ? -0.14 : 0.18) * relax;
    l0ThZ = -0.12 * kneel - 0.18 * relax;
    l1ThZ = 0.16 * kneel + (0.22 + R.legPose * 0.16) * relax;
    l0ShX = R.kneePeak * fold + 0.22 * relax;
    l1ShX = (R.kneePeak * 0.82) * fold + (0.28 + R.legPose * 0.45) * relax;
  } else if (R.mode === 'stagger') {
    const rec = ragEaseOut(clamp(u / 0.28, 0, 1));
    const fall = ragEaseIn(clamp((u - 0.18) / 0.68, 0, 1));
    const relax = ragSmooth(clamp((u - 0.72) / 0.28, 0, 1));

    s.yaw = R.yaw0 + R.spinAmt * ragEaseOut(u);
    rx = lerp(S.rx, -0.22, rec) * (1 - fall) + (R.rest + R.slope) * fall - bounce;
    rz = lerp(S.rz, R.restRoll, fall) + bounce * 0.35 * R.side;
    bodyY = -0.28 * rec * (1 - fall);
    liftY = lerp(S.posYOff, 0.15, fall);

    uX = -0.34 * rec * (1 - relax * 0.78) + 0.06 * relax;
    uY = R.side * 0.16 * rec;
    uZ = R.side * 0.14 * fall;

    hX = -0.42 * rec * (1 - relax * 0.75) + 0.1 * relax;
    hY = R.headRestY * fall;
    hZ = R.headRestZ * fall;

    aX = -0.28 * rec * (1 - fall) + R.armDrop * 0.55 * fall;
    aZ = R.side * 0.22 * fall;

    l0ThX = -0.45 * rec - (0.28 + R.legPose * 0.25) * fall;
    l1ThX = 0.22 * rec + 0.12 * fall;
    l0ThZ = -0.14 - 0.12 * fall;
    l1ThZ = 0.18 + 0.2 * fall;
    l0ShX = 0.65 * rec + (0.45 + R.legPose * 0.4) * fall;
    l1ShX = 0.25 * rec + 0.18 * fall;
  } else if (R.mode === 'spin') {
    const tw = ragEaseOut(clamp(u / 0.45, 0, 1));
    const drop = ragEaseIn(clamp((u - 0.15) / 0.7, 0, 1));
    const relax = ragSmooth(clamp((u - 0.72) / 0.28, 0, 1));

    s.yaw = R.yaw0 + R.spinAmt * ragEaseOut(clamp(u / 0.82, 0, 1));
    rx = lerp(S.rx, R.rest + R.slope, drop) + bounce * Math.sign(R.rest);
    rz = lerp(S.rz, R.side * (0.28 * tw * (1 - drop) + Math.abs(R.restRoll) * drop), b) + bounce * 0.45 * R.side;
    bodyY = -R.pelvisDrop * 0.78 * tw * (1 - drop * 0.9);
    liftY = lerp(S.posYOff, 0.14, drop);

    uX = (R.fallForward ? 0.26 : -0.22) * tw * (1 - relax * 0.5);
    uY = R.side * (0.52 * tw * (1 - relax * 0.55));
    uZ = R.side * (0.28 * tw + 0.1 * relax);

    hX = (R.fallForward ? 0.25 : -0.2) * drop;
    hY = R.side * 0.45 * tw + R.headRestY * 0.5 * relax;
    hZ = R.headRestZ * drop;

    aX = R.armDrop * drop;
    aZ = R.side * 0.34 * tw;

    const fold = tw * (1 - relax * 0.55);
    l0ThX = -0.82 * fold + 0.1 * relax;
    l1ThX = -0.35 * fold - 0.25 * relax;
    l0ThZ = -0.22 * drop;
    l1ThZ = (0.24 + R.legPose * 0.2) * drop;
    l0ShX = 1.45 * fold + 0.35 * relax;
    l1ShX = 0.85 * fold + 0.52 * relax;
  } else if (R.mode === 'burn') {
    const jolt = clamp(u / 0.18, 0, 1);
    const slump = ragSmooth(clamp((u - 0.16) / 0.34, 0, 1));
    const tip = ragEaseIn(clamp((u - 0.32) / 0.54, 0, 1));
    const relax = ragSmooth(clamp((u - 0.76) / 0.24, 0, 1));

    if (R.t < 0.75 && (R.emberT -= dt) <= 0 && camera.position.distanceTo(s.pos) < 85) {
      R.emberT = 0.14;
      FXS.spawn(s.pos.x + rand(-0.2, 0.2), s.pos.y + (1 - tip) * 1.1 + 0.25, s.pos.z + rand(-0.2, 0.2), rand(-0.3, 0.3), rand(0.9, 1.8), rand(-0.3, 0.3), 0.7, 0.28, 0.85, 0.22, 0.18, 0.16, 0.1, 0.09, 0.08, 0.55, 0.5, 0.4);
    }

    s.yaw = R.yaw0 + R.spinAmt * 0.7 * tip;
    rx = lerp(S.rx, -0.14 * Math.sin(jolt * Math.PI), b) * (1 - tip) + (R.rest + R.slope) * tip + bounce * Math.sign(R.rest);
    rz = lerp(S.rz, R.restRoll, tip) + bounce * 0.35 * R.side;
    bodyY = -R.pelvisDrop * 1.05 * slump * (1 - tip * 0.9);
    liftY = lerp(S.posYOff, 0.14, tip);

    const arch = Math.sin(jolt * Math.PI);
    uX = -0.36 * arch + 0.36 * slump * (1 - relax * 0.55);
    uY = R.side * 0.15 * slump;
    uZ = R.side * 0.18 * tip;

    hX = -0.45 * arch + 0.35 * slump;
    hY = R.headRestY * tip;
    hZ = R.headRestZ * tip;

    aX = -0.25 * arch + R.armDrop * slump;
    aZ = R.side * 0.2 * tip;

    const fold = slump * (1 - relax * 0.55);
    l0ThX = -1.0 * fold - 0.1 * relax;
    l1ThX = -0.78 * fold + 0.15 * relax;
    l0ThZ = -0.18 * tip;
    l1ThZ = 0.22 * tip;
    l0ShX = 1.75 * fold + 0.32 * relax;
    l1ShX = 1.55 * fold + (0.25 + R.legPose * 0.35) * relax;
  } else if (R.mode === 'bleedout') {
    const k = ragSmooth(u);
    s.obj.position.set(s.pos.x, s.pos.y + lerp(S.posYOff, 0.14, k), s.pos.z);
    s.obj.rotation.set(lerp(S.rx, R.rest + R.slope, k), s.yaw, lerp(S.rz, R.restRoll, k), 'YXZ');
    if (s.body) { s.body.position.y = lerp(S.bodyY, 0, k); s.body.rotation.set(lerp(S.bodyRx, 0, k), 0, lerp(S.bodyRz, 0, k)); }
    if (s.upper) s.upper.rotation.set(lerp(S.uX, 0.02, k), lerp(S.uY, 0, k), lerp(S.uZ, 0, k));
    if (s.head) s.head.rotation.set(lerp(S.hX, 0.06, k), lerp(S.hY, R.headRestY, k), lerp(S.hZ, R.headRestZ, k));
    if (s.arms) s.arms.rotation.set(lerp(S.aX, 0.42, k), 0, lerp(S.aZ, 0, k));
    if (s.legs) {
      s.legs[0].th.rotation.set(lerp(S.l0ThX, -0.14, k), 0, lerp(S.l0ThZ, -0.16, k));
      s.legs[0].sh.rotation.x = lerp(S.l0ShX, R.legBend, k);
      s.legs[1].th.rotation.set(lerp(S.l1ThX, 0.18, k), 0, lerp(S.l1ThZ, 0.24, k));
      s.legs[1].sh.rotation.x = lerp(S.l1ShX, 0.2, k);
    }
    return;
  }

  // Apply seamless active-pose -> physical collapse blend + spring-damped upper body inertia
  s.obj.position.set(s.pos.x, s.pos.y + liftY, s.pos.z);
  s.obj.rotation.set(rx, s.yaw, rz, 'YXZ');
  if (s.body) {
    s.body.position.y = lerp(S.bodyY, bodyY, b);
    s.body.rotation.set(lerp(S.bodyRx, 0, b), 0, lerp(S.bodyRz, 0, b));
  }
  if (s.upper) {
    s.upper.rotation.set(
      ragSpring(R.sp.uX, uX, 42, 8.5, dt),
      ragSpring(R.sp.uY, uY, 38, 8.0, dt),
      ragSpring(R.sp.uZ, uZ, 38, 8.0, dt)
    );
  }
  if (s.head) {
    s.head.rotation.set(
      ragSpring(R.sp.hX, hX, 46, 8.2, dt),
      ragSpring(R.sp.hY, hY, 36, 7.5, dt),
      ragSpring(R.sp.hZ, hZ, 36, 7.5, dt)
    );
  }
  if (s.arms) {
    s.arms.rotation.set(
      ragSpring(R.sp.aX, aX, 40, 8.0, dt),
      0,
      ragSpring(R.sp.aZ, aZ, 36, 7.5, dt)
    );
  }
  if (s.legs) {
    s.legs[0].th.rotation.set(lerp(S.l0ThX, l0ThX, b), 0, lerp(S.l0ThZ, l0ThZ, b));
    s.legs[0].sh.rotation.x = lerp(S.l0ShX, l0ShX, b);
    s.legs[1].th.rotation.set(lerp(S.l1ThX, l1ThX, b), 0, lerp(S.l1ThZ, l1ThZ, b));
    s.legs[1].sh.rotation.x = lerp(S.l1ShX, l1ShX, b);
  }
}

/* ---------- Step ballistic ragdoll launch (explosions / shells / Force) ---------- */
function ragStepLaunch(s, R, dt) {
  R.t += dt;
  const S = R.snap;
  const b = ragSmooth(clamp(R.t / R.blendDur, 0, 1));
  const g = s.pos.y > 1200 ? 5.5 : 22;

  if (!R.ground) {
    R.v.y -= g * dt;
    s.pos.addScaledVector(R.v, dt);
    R.rx += R.ax * dt;
    R.rz += R.az * dt;
    s.yaw += R.ay * dt;
    const fy = ragGroundY(s.pos.x, s.pos.z, s.pos.y);
    pushOut(s.pos, 0.4);
    if (s.pos.y <= fy) {
      s.pos.y = fy;
      R.bounces++;
      if (R.v.y < -5.5 && R.bounces < 3) {
        R.v.y = -R.v.y * 0.26;
        R.v.x *= 0.52; R.v.z *= 0.52;
        R.ax *= 0.48; R.az *= 0.48; R.ay *= 0.5;
        ragImpactFx(s, 1.35);
      } else {
        R.ground = true;
        R.v.y = 0;
        R.impactT = 0;
        R.slope = ragSlopePitch(s.pos.x, s.pos.z, s.pos.y, s.yaw);
        ragImpactFx(s, 1.15);
      }
    }
  } else {
    R.impactT += dt;
    const fr = Math.exp(-dt * 6.5);
    R.v.x *= fr; R.v.z *= fr;
    s.pos.x += R.v.x * dt; s.pos.z += R.v.z * dt;
    pushOut(s.pos, 0.4);
    s.pos.y = ragGroundY(s.pos.x, s.pos.z, s.pos.y);
    const targetRx = R.rest + R.slope + Math.round((R.rx - (R.rest + R.slope)) / (Math.PI * 2)) * Math.PI * 2;
    const k = Math.min(1, dt * 7.5);
    R.rx = lerp(R.rx, targetRx, k);
    R.rz = lerp(R.rz, R.restRoll, k);
    if (R.v.lengthSq() > 4 && Math.random() < dt * 10 && camera.position.distanceTo(s.pos) < 85) {
      fxDust(_rv1.copy(s.pos), 1, 1.4, 2.2);
    }
  }

  if (s.pos.y < -1.2 && H(s.pos.x, s.pos.z) < 0) { s.pos.y = Math.max(s.pos.y, -1.2); R.ground = true; }
  const bounce = R.ground ? Math.exp(-R.impactT * 10) * Math.sin(R.impactT * 22) * 0.08 : 0;
  const liftY = R.ground ? 0.15 : lerp(S.posYOff, 0.52, b);
  s.obj.position.set(s.pos.x, s.pos.y + liftY, s.pos.z);
  s.obj.rotation.set(R.rx + bounce, s.yaw, R.rz, 'YXZ');
  if (s.body) {
    s.body.position.y = lerp(S.bodyY, 0, b);
    s.body.rotation.set(lerp(S.bodyRx, 0, b), 0, lerp(S.bodyRz, 0, b));
  }

  const air = !R.ground, kLimb = Math.min(1, dt * 6);
  if (s.upper) {
    s.upper.rotation.set(
      ragSpring(R.sp.uX, air ? Math.sin(R.t * 9) * 0.28 : 0.06, 36, 7.5, dt),
      ragSpring(R.sp.uY, air ? Math.cos(R.t * 7) * 0.25 : R.side * 0.14, 34, 7.5, dt),
      ragSpring(R.sp.uZ, air ? Math.sin(R.t * 8) * 0.22 : R.side * 0.1, 34, 7.5, dt)
    );
  }
  if (s.head) {
    s.head.rotation.set(
      ragSpring(R.sp.hX, air ? -Math.sin(R.t * 11) * 0.35 : 0.12, 40, 7.5, dt),
      ragSpring(R.sp.hY, air ? Math.cos(R.t * 8) * 0.4 : R.headRestY, 34, 7.0, dt),
      ragSpring(R.sp.hZ, air ? Math.sin(R.t * 10) * 0.35 : R.headRestZ, 34, 7.0, dt)
    );
  }
  if (s.arms) {
    s.arms.rotation.set(
      ragSpring(R.sp.aX, air ? -0.45 + Math.sin(R.t * 12) * 0.45 : R.armDrop, 36, 7.5, dt),
      0,
      ragSpring(R.sp.aZ, air ? Math.cos(R.t * 9) * 0.35 : R.side * 0.22, 34, 7.5, dt)
    );
  }
  if (s.legs) {
    const startThX = [S.l0ThX, S.l1ThX], startThZ = [S.l0ThZ, S.l1ThZ], startShX = [S.l0ShX, S.l1ShX];
    for (let i = 0; i < 2; i++) {
      const L = s.legs[i];
      R.flail[i] += dt * (air ? 13 : 0);
      const physThX = air ? Math.sin(R.flail[i]) * 0.85 : lerp(L.th.rotation.x, i ? 0.28 : -0.22 * R.legAsym, kLimb);
      const physThZ = air ? Math.cos(R.flail[i] * 0.7) * 0.38 : lerp(L.th.rotation.z, (i ? 1 : -1) * (0.22 + i * R.legAsym * 0.15), kLimb);
      const physShX = air ? 0.45 + Math.sin(R.flail[i] + 1) * 0.55 : lerp(L.sh.rotation.x, i ? 0.22 : 0.35 + R.legAsym * 0.4, kLimb);
      L.th.rotation.x = air ? lerp(startThX[i], physThX, b) : physThX;
      L.th.rotation.z = air ? lerp(startThZ[i], physThZ, b) : physThZ;
      L.sh.rotation.x = air ? lerp(startShX[i], physShX, b) : physShX;
    }
  }
}

/* ---------- Hero articulated collapse with active-pose blend ---------- */
function ragStepHero(s, R, dt) {
  R.t += dt;
  const H0 = s.heroParts, S = R.snap, HS = S.hero;
  const u = clamp(R.t / R.dur, 0, 1);
  const b = ragSmooth(clamp(R.t / R.blendDur, 0, 1));
  const kneel = ragSmooth(clamp(u / 0.38, 0, 1));
  const tip = ragEaseIn(clamp((u - 0.26) / 0.62, 0, 1));
  const relax = ragSmooth(clamp((u - 0.74) / 0.26, 0, 1));

  if (Math.abs(R.vx) + Math.abs(R.vz) > 0.02) {
    const fr = Math.exp(-dt * 5.5);
    R.vx *= fr; R.vz *= fr;
    s.pos.x += R.vx * dt; s.pos.z += R.vz * dt;
    pushOut(s.pos, 0.5);
  }
  if (u >= 0.86 && !R.landed) { R.landed = true; R.impactT = 0; ragImpactFx(s, 1.0); }
  if (R.landed) R.impactT += dt;
  const bounce = R.landed ? Math.exp(-R.impactT * 10) * Math.sin(R.impactT * 20) * 0.07 : 0;

  s.pos.y = ragGroundY(s.pos.x, s.pos.z, s.pos.y);
  s.obj.position.set(s.pos.x, s.pos.y + lerp(S.posYOff, 0.16, tip), s.pos.z);
  s.obj.rotation.set(lerp(S.rx, R.rest + R.slope, tip) + bounce * Math.sign(R.rest), s.yaw, lerp(S.rz, R.side * 0.18, tip), 'YXZ');

  const fold = kneel * (1 - relax * 0.55);
  const by = -0.44 * kneel * (1 - tip * 0.9);
  const brx = (R.back ? -0.25 : 0.32) * kneel * (1 - relax * 0.6);
  H0.body.position.y = HS ? lerp(HS.by, by, b) : by;
  H0.body.rotation.x = HS ? lerp(HS.brx, brx, b) : brx;
  H0.body.rotation.z = HS ? lerp(HS.brz, 0, b) : 0;

  H0.head.rotation.set(
    HS ? lerp(HS.hrx, (R.back ? -0.28 : 0.35) * tip, b) : (R.back ? -0.28 : 0.35) * tip,
    HS ? lerp(HS.hry, R.side * 0.45 * tip, b) : R.side * 0.45 * tip,
    HS ? lerp(HS.hrz, R.side * 0.28 * tip, b) : R.side * 0.28 * tip
  );
  H0.legs[0].thigh.rotation.set(HS ? lerp(HS.l0x, -0.92 * fold, b) : -0.92 * fold, 0, HS ? lerp(HS.l0z, -0.15 * tip, b) : -0.15 * tip);
  H0.legs[1].thigh.rotation.set(HS ? lerp(HS.l1x, -0.52 * fold, b) : -0.52 * fold, 0, HS ? lerp(HS.l1z, 0.22 * tip, b) : 0.22 * tip);
  H0.legs[0].shin.rotation.x = HS ? lerp(HS.s0x, 1.65 * fold + 0.25 * relax, b) : 1.65 * fold + 0.25 * relax;
  H0.legs[1].shin.rotation.x = HS ? lerp(HS.s1x, 1.15 * fold + 0.38 * relax, b) : 1.15 * fold + 0.38 * relax;
  H0.arms[0].sh.rotation.set(HS ? lerp(HS.a0x, 0.42, tip) : lerp(-0.32, 0.42, tip), HS ? lerp(HS.a0y, 0.25, tip) : 0.25 * tip, HS ? lerp(HS.a0z, 0.35, tip) : 0.35 * tip);
  H0.arms[0].el.rotation.x = HS ? lerp(HS.e0x, -0.15, tip) : lerp(-0.35, -0.15, tip);
  H0.arms[1].sh.rotation.set(HS ? lerp(HS.a1x, 0.35, tip) : lerp(-0.05, 0.35, tip), HS ? lerp(HS.a1y, -0.2, tip) : -0.2 * tip, HS ? lerp(HS.a1z, -0.4, tip) : -0.4 * tip);
  H0.arms[1].el.rotation.x = HS ? lerp(HS.e1x, -0.12, tip) : lerp(-0.25, -0.12, tip);
  if (typeof updateCape === 'function') updateCape(H0, 0, dt);
}

/* ---------- Articulated downed-soldier collapse with seamless active-pose blend ---------- */
function ragStepDowned(s, dt) {
  s.downT += dt;
  if (!s.downPose) {
    const snap = s._downSnap || captureActivePose(s);
    s._downSnap = null;
    const side = Math.random() < 0.5 ? 1 : -1;
    s.downPose = {
      snap,
      side,
      vx: snap.vx * 0.42, vz: snap.vz * 0.42,
      rest: -1.46,
      slope: ragSlopePitch(s.pos.x, s.pos.z, s.pos.y, s.yaw),
      landed: false,
      impactT: 0,
      headYaw: side * rand(0.2, 0.45),
      kneeA: rand(0.75, 1.05),
      kneeB: rand(0.45, 0.72),
    };
    s.obj.rotation.order = 'YXZ';
  }
  const D = s.downPose, S = D.snap;
  const u = clamp(s.downT / 0.48, 0, 1);
  const b = ragSmooth(clamp(s.downT / 0.2, 0, 1));
  const kneel = ragSmooth(clamp(u / 0.42, 0, 1));
  const fall = ragEaseIn(clamp((u - 0.14) / 0.86, 0, 1));

  if (Math.abs(D.vx) + Math.abs(D.vz) > 0.02) {
    const fr = Math.exp(-dt * (D.landed ? 12 : 6));
    D.vx *= fr; D.vz *= fr;
    s.pos.x += D.vx * dt; s.pos.z += D.vz * dt;
    pushOut(s.pos, 0.4);
    s.pos.y = ragGroundY(s.pos.x, s.pos.z, s.pos.y);
  }
  if (u >= 0.9 && !D.landed) { D.landed = true; D.impactT = 0; ragImpactFx(s, 0.75); }
  if (D.landed) D.impactT += dt;
  const bounce = D.landed ? Math.exp(-D.impactT * 11) * Math.sin(D.impactT * 22) * 0.06 : 0;
  const breathe = D.landed ? Math.sin(s.downT * 2.8 + s.phase) : 0;

  s.obj.position.set(s.pos.x, s.pos.y + lerp(S.posYOff, 0.14, fall), s.pos.z);
  s.obj.rotation.set(lerp(S.rx, D.rest + D.slope, fall) - bounce, s.yaw, lerp(S.rz, D.side * 0.14, fall) + breathe * 0.035, 'YXZ');

  if (s.body) {
    s.body.position.y = lerp(S.bodyY, -0.34 * kneel * (1 - fall * 0.92), b);
    s.body.rotation.set(lerp(S.bodyRx, 0, b), 0, lerp(S.bodyRz, 0, b));
  }
  if (s.upper) s.upper.rotation.set(lerp(S.uX, 0.18 * fall + breathe * 0.05, b), lerp(S.uY, D.side * 0.1 * fall, b), lerp(S.uZ, D.side * 0.08 * fall, b));
  if (s.head) s.head.rotation.set(lerp(S.hX, 0.22 * fall + breathe * 0.04, b), lerp(S.hY, D.headYaw * fall + Math.sin(s.downT * 1.4) * 0.14 * fall, b), lerp(S.hZ, D.side * 0.16 * fall, b));
  if (s.arms) s.arms.rotation.set(lerp(S.aX, 0.28 * fall + breathe * 0.04, b), 0, lerp(S.aZ, D.side * 0.12 * fall, b));
  if (s.legs) {
    s.legs[0].th.rotation.set(lerp(S.l0ThX, -0.68 * fall, b), 0, lerp(S.l0ThZ, -0.18 * fall, b));
    s.legs[0].sh.rotation.x = lerp(S.l0ShX, D.kneeA * fall + breathe * 0.05, b);
    s.legs[1].th.rotation.set(lerp(S.l1ThX, -0.34 * fall, b), 0, lerp(S.l1ThZ, 0.24 * fall, b));
    s.legs[1].sh.rotation.x = lerp(S.l1ShX, D.kneeB * fall, b);
  }

  if (!s.beacon) { s.beacon = new T.Mesh(BEACON_G, BEACON_M); s.beacon.position.set(0, 0.35, 0); s.obj.add(s.beacon); }
  s.beacon.visible = !s.reviver && Math.sin(TIME * 8) > 0;
  if (s.reviver && (!s.reviver.alive || s.reviver.downed || s.reviver.revTgt !== s)) s.reviver = null;
  if (s.downT > 18 && !s.reviver) { s.downed = false; s.beacon.visible = false; s.hp = 0; s.alive = false; s.killed(s.downBy, s.downType || 'bullet'); }
}

/* ---------- Soldier update wrapper ---------- */
{
  const _upd = Soldier.prototype.update;
  Soldier.prototype.update = function (dt) {
    if (this.alive && this.downed && !this.imp && camera.position.distanceTo(this.pos) <= 260) {
      ragStepDowned(this, dt);
      return;
    }
    const R = this.rag;
    if (this.alive || !R) return _upd.call(this, dt);
    this.deadT += dt;
    if (R.mode === 'hero') ragStepHero(this, R, dt);
    else if (R.mode === 'launch') ragStepLaunch(this, R, dt);
    else ragStepCollapse(this, R, dt);
    if (this.deadT > 7) this.obj.position.y -= (this.deadT - 7) * 0.8;
    if (this.deadT > 9) this.remove = true;
  };
}

/* ---------- Walker asymmetric hydraulic collapse (blended from active stride) ---------- */
function ragStartWalker(w, snap) {
  const dir = w.fallDir || (Math.random() < 0.5 ? 1 : -1);
  w.wCol = {
    snap,
    failIdx: dir > 0 ? 1 : 0,
    dir,
    speed: snap.speed || 0,
    twistY: dir * rand(0.32, 0.62),
    pitchX: rand(0.32, 0.56),
    rollZ: dir * rand(0.48, 0.76),
    sparkT: 0,
    impactT: 0,
  };
}
if (typeof Walker !== 'undefined') {
  const _wUpd = Walker.prototype.update;
  Walker.prototype.update = function (dt) {
    if (this.alive || !this.wCol) return _wUpd.call(this, dt);
    const W = this.wCol, S = W.snap;
    this.deadT += dt;
    const t = clamp(this.deadT / 3.0, 0, 1);
    const b = ragSmooth(clamp(this.deadT / 0.35, 0, 1));
    const buckle = ragSmooth(clamp(t / 0.36, 0, 1));
    const drop = Math.pow(clamp((t - 0.14) / 0.86, 0, 1), 2.3);
    const shudder = t < 0.95 ? Math.sin(this.deadT * 34) * 0.045 * b * (1 - drop * 0.6) : 0;

    // Carry forward stride momentum briefly as legs give way
    if (Math.abs(W.speed) > 0.05 && t < 0.65) {
      W.speed *= Math.exp(-dt * 3.8);
      this.pos.x = clamp(this.pos.x + Math.sin(this.heading) * W.speed * dt, -BOUND, BOUND);
      this.pos.z = clamp(this.pos.z + Math.cos(this.heading) * W.speed * dt, -BOUND, BOUND);
      this.pos.y = lerp(this.pos.y, groundY(this.pos.x, this.pos.z), Math.min(1, dt * 4));
      this.obj.position.copy(this.pos);
    }

    if (t >= 1) W.impactT += dt;
    const reb = t >= 1 ? Math.exp(-W.impactT * 5.2) * Math.sin(W.impactT * 14) : 0;

    const ty0 = S.torsoY !== undefined ? S.torsoY : 17;
    this.torso.position.y = ty0 - 1.6 * buckle - (ty0 - 5.6) * drop + reb * 0.65;
    this.torso.rotation.z = lerp(S.torsoRz || 0, W.dir * 0.18 * buckle + (W.rollZ - W.dir * 0.18) * drop, b) + shudder + reb * 0.12 * W.dir;
    this.torso.rotation.x = lerp(S.torsoRx || 0, 0.08 * buckle + (W.pitchX - 0.08) * drop, b) + reb * 0.09;
    this.torso.rotation.y = (S.torsoRy !== undefined ? S.torsoRy : this.torsoYaw) + W.twistY * drop;

    for (let i = 0; i < this.legs.length; i++) {
      const L = this.legs[i], sl = S.wLegs && S.wLegs[i], lead = i === W.failIdx;
      const k = lead ? clamp(t / 0.72, 0, 1) : clamp((t - 0.24) / 0.76, 0, 1);
      const ks = ragSmooth(k);
      L.hip.rotation.x = lerp(sl ? sl.hx : -0.4, lead ? -1.48 : -0.92, ks);
      L.hip.rotation.z = lerp(sl ? sl.hz : 0, (i ? 1 : -1) * (lead ? 0.24 : 0.16), ks);
      L.knee.rotation.x = lerp(sl ? sl.kx : 0.86, lead ? 2.45 : 1.85, ks);
      L.ankle.rotation.x = lerp(sl ? sl.ax : 0, -(L.hip.rotation.x + L.knee.rotation.x) * 0.65, ks);
    }

    if (t < 0.92 && (W.sparkT -= dt) <= 0) {
      W.sparkT = 0.18;
      const fL = this.legs[W.failIdx];
      if (fL && fL.knee) {
        fL.knee.getWorldPosition(_rv1);
        fxSparks(_rv1, nfx(6), [3.2, 1.8, 0.7], 8);
      }
    }
    if (this.deadT < 3.4 && Math.random() < dt * 4.5) {
      fxExplosion(_rv1.set(this.pos.x + rand(-4, 4), this.pos.y + this.torso.position.y + rand(-1, 3), this.pos.z + rand(-4, 4)), rand(1.4, 2.3));
    }
    if (t >= 1 && !this.crashed) {
      this.crashed = true;
      _rv1.set(this.pos.x, this.pos.y + 4, this.pos.z);
      fxExplosion(_rv1, 5);
      explodeDamage(_rv1, 14, 400, null, 0);
      addEmitter(_rv1.clone(), 3, 70);
      fxDust(_rv2.set(this.pos.x, this.pos.y + 0.5, this.pos.z), 20, 7, 14);
      shockRing(_rv2, 26, 0.7, 0xd8c8b0);
      shake(1.4, _rv1);
    }
    if (this.deadT > 60) this.remove = true;
  };
}

/* ---------- Shiftframe articulated mech collapse (blended from active pose) ---------- */
function ragStartShiftframe(sf, snap) {
  if (sf.tumble) return;
  const side = Math.random() < 0.5 ? 1 : -1;
  sf.sfCol = {
    snap,
    side,
    speed: snap.speed || 0,
    yaw0: sf.yaw,
    dir: Math.random() < 0.68 ? 1 : -1,
    restX: rand(1.18, 1.38),
    restZ: side * rand(0.24, 0.45),
    impactT: 0, landed: false, sparkT: 0,
  };
  sf.obj.rotation.order = 'YXZ';
}
if (typeof Shiftframe !== 'undefined') {
  const _sfUpd = Shiftframe.prototype.update;
  Shiftframe.prototype.update = function (dt) {
    if (this.alive || !this.sfCol || this.tumble) return _sfUpd.call(this, dt);
    const C = this.sfCol, S = C.snap;
    this.deadT = (this.deadT || 0) + dt;
    const t = clamp(this.deadT / 1.35, 0, 1);
    const buckle = ragSmooth(clamp(t / 0.42, 0, 1));
    const fall = ragEaseIn(clamp((t - 0.16) / 0.84, 0, 1));

    if (Math.abs(C.speed) > 0.05 && !C.landed) {
      C.speed *= Math.exp(-dt * 4.5);
      this.pos.x = clamp(this.pos.x + Math.sin(this.yaw) * C.speed * dt, -BOUND, BOUND);
      this.pos.z = clamp(this.pos.z + Math.cos(this.yaw) * C.speed * dt, -BOUND, BOUND);
      pushOut(this.pos, 1.2);
      this.pos.y = lerp(this.pos.y, groundY(this.pos.x, this.pos.z), Math.min(1, dt * 8));
    }
    if (t >= 0.94 && !C.landed) {
      C.landed = true; C.impactT = 0;
      fxDust(_rv1.set(this.pos.x, this.pos.y + 0.3, this.pos.z), 12, 4, 8);
      if (camera.position.distanceTo(this.pos) < 90) snd('stomp', this.pos, 0.65);
    }
    if (C.landed) C.impactT += dt;
    const reb = C.landed ? Math.exp(-C.impactT * 7) * Math.sin(C.impactT * 18) * 0.08 : 0;

    // Seamless blend from captured mid-stride legs into asymmetric hydraulic buckle
    const sl0 = S.sfLegs && S.sfLegs[0], sl1 = S.sfLegs && S.sfLegs[1];
    this.legs[0].th.rotation.set(lerp(sl0 ? sl0.thx : 0, -0.95, buckle), 0, lerp(sl0 ? sl0.thz : 0, -0.14, fall));
    this.legs[0].sh.rotation.x = lerp(sl0 ? sl0.shx : 0.25, 1.8, buckle);
    this.legs[1].th.rotation.set(lerp(sl1 ? sl1.thx : 0, -0.52, buckle), 0, lerp(sl1 ? sl1.thz : 0, 0.22, fall));
    this.legs[1].sh.rotation.x = lerp(sl1 ? sl1.shx : 0.25, 1.3, buckle);

    const sink = 0.85 * buckle * (1 - fall * 0.4);
    this.parts[0].g.position.y = (S.t0y !== undefined ? S.t0y : 4.3) - sink;
    this.parts[1].g.position.y = (S.h0y !== undefined ? S.h0y : 5.75) - sink;
    this.parts[2].g.position.y = (S.p0y !== undefined ? S.p0y : 3.0) - sink * 0.85;
    this.parts[0].g.rotation.z = lerp(S.t0rz || 0, C.side * 0.22, buckle);
    this.parts[1].g.rotation.set(lerp(S.h0rx || 0, 0.45, buckle), lerp(S.h0ry || 0, C.side * 0.4, fall), lerp(S.h0rz || 0, C.side * 0.28, fall));

    for (let i = 0; i < this.arms.length; i++) {
      const A = this.arms[i], sa = S.sfArms && S.sfArms[i];
      A.ua.rotation.x = lerp(sa ? sa.uax : -0.65, 0.35 + i * 0.22, fall);
      A.ua.rotation.z = lerp(sa ? sa.uaz : (i ? 1 : -1) * 0.08, (i ? 1 : -1) * 0.4, fall);
      A.fa.rotation.x = lerp(sa ? sa.fax : -0.9, -0.22, fall);
    }

    this.obj.rotation.set(lerp(S.rx, C.dir * C.restX, fall) + reb, C.yaw0 + C.side * 0.28 * fall, lerp(S.rz, C.restZ, fall) + reb * 0.4 * C.side, 'YXZ');
    this.obj.position.set(this.pos.x, this.pos.y + lerp(S.posYOff, -0.45, fall), this.pos.z);

    if (t < 0.85 && (C.sparkT -= dt) <= 0) {
      C.sparkT = 0.16;
      fxSparks(_rv1.set(this.pos.x, this.pos.y + 2.2 * (1 - fall * 0.6), this.pos.z), nfx(5), [2.6, 1.8, 0.7], 7);
    }
    if (this.deadT > 1.05 && !this.boomed) {
      this.boomed = true;
      fxExplosion(_rv1.copy(this.pos).setY(this.pos.y + 2), 3.5);
      addEmitter(_rv1.clone(), 2, 30);
    }
    if (this.deadT > 30) this.remove = true;
  };
}

/* ---------- Hover Tank power-down hull cant & turret jolt (blended from active pitch/roll) ---------- */
function ragStartTank(tk, snap) {
  if (tk.tumble) return;
  const side = Math.random() < 0.5 ? 1 : -1;
  tk.tkCol = {
    snap,
    cantX: rand(-0.14, 0.16),
    cantZ: side * rand(0.1, 0.22),
    turX: rand(0.08, 0.18),
    turZ: -side * rand(0.08, 0.18),
    turYawKick: side * rand(0.18, 0.42),
    dusted: false,
  };
  tk.obj.rotation.order = 'YXZ';
}
if (typeof Tank !== 'undefined') {
  const _tkUpd = Tank.prototype.update;
  Tank.prototype.update = function (dt) {
    if (this.alive || !this.tkCol || this.tumble) return _tkUpd.call(this, dt);
    const K = this.tkCol, S = K.snap;
    this.deadT += dt;
    const t = clamp(this.deadT / 0.52, 0, 1);
    const drop = ragEaseIn(t);
    const reb = t >= 1 ? Math.exp(-(this.deadT - 0.52) * 7.5) * Math.sin((this.deadT - 0.52) * 20) : 0;
    if (t >= 0.92 && !K.dusted) {
      K.dusted = true;
      fxDust(_rv1.set(this.pos.x, this.pos.y - 0.2, this.pos.z), 10, 3.5, 6);
    }
    this.obj.position.set(this.pos.x, this.pos.y + lerp(S.posYOff, -0.62, drop) + reb * 0.12, this.pos.z);
    this.obj.rotation.set(lerp(S.rx, K.cantX, drop) + reb * 0.05, this.yaw, lerp(S.rz, K.cantZ, drop) + reb * 0.06, 'YXZ');
    if (this.tur) {
      const pop = Math.sin(clamp(this.deadT / 0.35, 0, 1) * Math.PI) * 0.24;
      this.tur.position.y = (S.turY !== undefined ? S.turY : 2.9) + pop;
      this.tur.rotation.set(lerp(S.turRx || 0, K.turX, drop), (S.turRy || 0) + K.turYawKick * ragEaseOut(t), lerp(S.turRz || 0, K.turZ, drop));
    }
    if (this.deadT > 30) this.remove = true;
  };
}

/* ---------- Skyrunner mount limp collapse (blended from active wing/stride state) ---------- */
function ragStartBird(b, snap) {
  b.bdCol = { snap, side: Math.random() < 0.5 ? 1 : -1, landed: false, impactT: 0 };
  b.obj.rotation.order = 'YXZ';
}
if (typeof Bird !== 'undefined') {
  const _bUpd = Bird.prototype.update;
  Bird.prototype.update = function (dt) {
    if (this.alive) { this.bdCol = null; return _bUpd.call(this, dt); }
    if (!this.bdCol) ragStartBird(this, captureActivePose(this));
    const B = this.bdCol, S = B.snap;
    this.deadT += dt;
    const g = groundY(this.pos.x, this.pos.z);
    this.pos.y = lerp(this.pos.y, g, Math.min(1, dt * 4.5));
    if (this.pos.y <= g + 0.15 && !B.landed) {
      B.landed = true; B.impactT = 0;
      fxDust(_rv1.set(this.pos.x, g + 0.1, this.pos.z), 6, 2.2, 4);
    }
    if (B.landed) B.impactT += dt;
    const reb = B.landed ? Math.exp(-B.impactT * 8) * Math.sin(B.impactT * 18) * 0.08 : 0;
    const k = ragSmooth(clamp(this.deadT / 0.65, 0, 1));
    this.obj.position.set(this.pos.x, this.pos.y + lerp(S.posYOff, 0.25, k), this.pos.z);
    this.obj.rotation.set(lerp(S.rx, 0.18, k), this.yaw, lerp(S.rz, B.side * 1.48, k) + reb, 'YXZ');
    if (this.neck) this.neck.rotation.x = lerp(S.neckRx || 0, 0.75, k);
    if (this.wings) for (let i = 0; i < this.wings.length; i++) {
      const W = this.wings[i], sw = S.wings && S.wings[i];
      W.w.rotation.z = lerp(sw ? sw.wz : W.w.rotation.z, W.sx * -1.1, k);
      W.tip.rotation.z = lerp(sw ? sw.tz : W.tip.rotation.z, W.sx * -1.25, k);
    }
    if (this.legs) for (let i = 0; i < this.legs.length; i++) {
      const L = this.legs[i], sl = S.bLegs && S.bLegs[i];
      L.th.rotation.x = lerp(sl ? sl.thx : 0, i ? 0.35 : -0.5, k);
      L.sh.rotation.x = lerp(sl ? sl.shx : -0.3, i ? -0.45 : -0.95, k);
    }
    this.respawnT -= dt;
    if (this.deadT > 8) this.obj.visible = false;
    if (this.respawnT <= 0) {
      const h = [new V3(-255, 0, 375), new V3(-40, 0, -395)][this.idx];
      this.spawnAt(h); this.name = BIRD_COL[this.idx].name; this.bdCol = null;
    }
  };
}

/* ---------- Deep Titan articulated collapse (blended from active stride) ---------- */
function ragStartTitan(ti, snap) {
  ti.tiCol = { snap, side: Math.random() < 0.5 ? 1 : -1, impactT: 0 };
}
if (typeof Titan !== 'undefined') {
  const _tiUpd = Titan.prototype.update;
  Titan.prototype.update = function (dt) {
    if (this.alive || !this.tiCol) return _tiUpd.call(this, dt);
    const C = this.tiCol, S = C.snap, M = TITAN_MAT;
    this.deadT += dt;
    const t = clamp(this.deadT / 3.5, 0, 1);
    const kneel = ragSmooth(clamp(t / 0.42, 0, 1));
    const roll = ragEaseIn(clamp((t - 0.18) / 0.82, 0, 1));
    if (t >= 1) C.impactT += dt;
    const reb = t >= 1 ? Math.exp(-C.impactT * 4.5) * Math.sin(C.impactT * 10) * 0.06 : 0;

    this.obj.rotation.set(lerp(S.rx, 0.14, roll), this.heading, lerp(S.rz, C.side * 1.35, roll) + reb * C.side);
    this.obj.position.set(this.pos.x, this.pos.y - 6 * roll, this.pos.z);
    if (this.hips) {
      this.hips.position.y = lerp(S.hipsY || 22, 16.5, kneel);
      this.hips.rotation.z = lerp(S.hipsRz || 0, C.side * 0.18, kneel);
    }
    if (this.torso) this.torso.rotation.x = lerp(S.torsoRx || 0.38, 0.72, kneel);
    if (this.neck) this.neck.rotation.x = lerp(S.neckRx || 0, 0.48, roll);
    if (this.head) this.head.rotation.x = lerp(S.headRx || 0, 0.25, roll);
    if (this.jaw) this.jaw.rotation.x = lerp(S.jawRx || 0, 0.52, kneel);
    if (this.legs) for (let i = 0; i < this.legs.length; i++) {
      const L = this.legs[i], sl = S.tLegs && S.tLegs[i];
      L.th.rotation.x = lerp(sl ? sl.thx : -0.15, i ? -0.45 : -0.95, kneel);
      L.kn.rotation.x = lerp(sl ? sl.knx : 0.35, i ? 1.15 : 1.75, kneel);
      L.an.rotation.x = lerp(sl ? sl.anx : 0, -0.35, kneel);
    }
    if (this.arms) for (let i = 0; i < this.arms.length; i++) {
      const A = this.arms[i], sa = S.tArms && S.tArms[i];
      A.sh.rotation.x = lerp(sa ? sa.shx : -0.5, 0.25, roll);
      A.el.rotation.x = lerp(sa ? sa.elx : -1.1, -0.3, roll);
    }
    if (this.tail) for (let i = 0; i < this.tail.length; i++) {
      this.tail[i].rotation.y = lerp(this.tail[i].rotation.y, C.side * (0.04 + i * 0.012), Math.min(1, dt * 2.5));
    }
    if (t >= 1 && !this.landed) {
      this.landed = true;
      _rv1.set(this.pos.x + Math.cos(this.heading) * -30 * C.side, groundY(this.pos.x, this.pos.z), this.pos.z);
      fxExplosion(_rv1, 6); shockRing(_rv1, 200, 2); shake(2.5, _rv1); fxDust(_rv1, 30, 18, 20);
      explodeDamage(_rv1, 30, 900, this, 3);
      for (let i = 0; i < 4; i++) addEmitter(_rv1.clone().add(new V3(rand(-25, 25), 4, rand(-25, 25))), 3, 80);
    }
    M.skin.emissiveIntensity = Math.max(0, 0.9 - this.deadT * 0.05);
    M.spine.emissiveIntensity = Math.max(0, 0.6 - this.deadT * 0.05);
    if (this.deadT > 40) this.remove = true;
  };
}
