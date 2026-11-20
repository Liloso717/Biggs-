'use strict';
/* ===================== IRON MERIDIAN · four realms of war: land, ocean, air, space ===================== */
// Seven districts of Aeris Island are on the ground. Three leave it:
//  Floating Marina · OCEAN · the floating city off the south-east shore, reached by the causeway from the beach; destroyers
//                            shell it, torpedoes run at it, landing craft storm the causeway
//  Skyport         · AIR   · a repulsor platform hovering over Apex Plaza; ziplines up from the plaza and across from
//                            the skyscraper roofs; flak fills the sky, AA turrets track every aircraft
//  Orbital Array   · SPACE · in orbit between the two fleets; fly up through the barrier, or ride a hull up, then the long
//                            ziplines across; turbolasers rake it, boarding pods slam into the deck
// Every district is labelled with its realm and colour in the world, on the markers and on the map, and the route line
// under the objective says how to get there. Soldiers travel the same routes: causeway, ziplines, elevators.
const REALM = {
  land: { label: 'LAND', col: '#ffb347', hex: 0xffb347, rgb: [3, 1.8, 0.5] },
  sea: { label: 'OCEAN', col: '#3fe0d0', hex: 0x3fe0d0, rgb: [0.4, 2.6, 2.4] },
  air: { label: 'AIR', col: '#7cc8ff', hex: 0x7cc8ff, rgb: [0.8, 2, 3.2] },
  space: { label: 'SPACE', col: '#c79bff', hex: 0xc79bff, rgb: [2.2, 1.4, 3.4] },
};
const RLM = { t: 0, tr: 0, theme: {}, torps: [], ready: false, turrets: [], czips: [], dzips: [], el: null };
const cpB = CPS.find(c => c.id === 'marina'), cpC = null, cpD = null;
/* ---------- relocation: B to sea ---------- */
function moveCP(cp, name, realm, x, y, z) {
  if (!cp) return;
  cp.name = name; cp.realm = realm; cp.x = x; cp.z = z; cp.pos.set(x, y, z); cp.y = y; cp.g.position.set(x, y, z);
}
const B_Z = 405, B_X = coastX(B_Z) + 92, /* off the south-east shore, below the port */ B_Y = 4.2, C_Y = MESA.top + 250, D_POS = new V3(206, 2030, 141);
moveCP(cpB, 'Floating Marina', 'sea', B_X, B_Y, B_Z);
const RDECK = { B: { x: B_X, z: B_Z, y: B_Y, r: 50 }, C: { x: 1e5, z: 1e5, y: -9999, r: 1 }, D: { x: 1e5, z: 1e5, y: -9999, r: 1 } };
DECKS.push(RDECK.B);
/* a collider for something standing on a platform (its gy/top are the platform's, not the ground's) */
function platBlock(x, z, w, d, y0, h) { const B = new Building(x, z, w, d, h, { mesh: new T.Group(), hp: 1e9 }); B.cover = true; B.realmBlock = true; B.gy = y0; B.top = y0 + h; BUILDINGS.push(B); return B; }
const glassM = std(0x7a98b8, 0.12, 0.85, { map: facadeTex, emissiveMap: facadeLit, emissive: 0xbfe6ff, emissiveIntensity: 0.9 }), whiteM = std(0xe8e6e0, 0.45, 0.2), darkM = MAT_GUN, deckM = std(0xb8b4aa, 0.85, 0.1, { normalMap: TEX.armor.normal });
const glow = rgb => basic(new T.Color(rgb[0], rgb[1], rgb[2]));
/* ---------- the Floating Marina, a city on the water ---------- */
(function novaMarina() {
  const g = new T.Group(); g.position.set(B_X, 0, B_Z); scene.add(g);
  const hull = new T.Mesh(new T.CylinderGeometry(52, 50, 9, 8).translate(0, B_Y - 4.5, 0), std(0x5a6066, 0.6, 0.6, { normalMap: TEX.armor.normal })); hull.receiveShadow = true; g.add(hull);
  const top = new T.Mesh(new T.CylinderGeometry(50.5, 50.5, 0.3, 8).translate(0, B_Y + 0.05, 0), deckM); top.receiveShadow = true; g.add(top);
  const paving = new T.Mesh(new T.RingGeometry(10, 22, 8).rotateX(-Math.PI / 2).translate(0, B_Y + 0.25, 0), std(0xd8c8a0, 0.7, 0.1)); g.add(paving);
  g.add(new T.Mesh(new T.TorusGeometry(51.2, 0.35, 4, 8).rotateX(Math.PI / 2).rotateY(Math.PI / 8).translate(0, B_Y - 0.4, 0), glow(REALM.sea.rgb)));
  for (let i = 0; i < 8; i++) { const a = i / 8 * Math.PI * 2 + Math.PI / 8; const p = new T.Mesh(new T.CylinderGeometry(3, 3.5, 14, 10).translate(0, -7, 0), darkM); p.position.set(Math.cos(a) * 46, B_Y - 6, Math.sin(a) * 46); g.add(p); } /* pontoons */
  /* towers: a sail hotel, a twisting tower and two needles */
  const tower = (x, z, w, d, h, build) => { const B = new Building(B_X + x, B_Z + z, w, d, 10, { mesh: new T.Group(), hp: 1e9 }); B.cover = true; B.gy = B_Y; B.top = B_Y + h; BUILDINGS.push(B); const m = build(); m.position.set(x, B_Y, z); g.add(m); };
  tower(-24, 16, 16, 14, 118, () => { const L = []; for (let i = 0; i < 24; i++) { const k = i / 24, dd = 16 * (1 - Math.pow(k, 1.7)) + 2.5; L.push(new T.BoxGeometry(12 * (1 - k * 0.5) + 2, 5, dd).translate(-5 * k * k, i * 5 + 2.5, 0)); } const geo = mergeGeos(L); boxProjUV(geo, 18, false); const m = new T.Group(); m.add(new T.Mesh(geo, glassM)); m.add(new T.Mesh(new T.BoxGeometry(1.2, 122, 1.2).translate(-7, 61, 8), whiteM)); m.add(new T.Mesh(new T.CylinderGeometry(6, 6, 0.6, 18).translate(9, 92, 0), whiteM)); return m; });
  tower(22, 20, 13, 13, 132, () => { const L = []; for (let i = 0; i < 28; i++) L.push(new T.BoxGeometry(12, 4.4, 12).rotateY(i * 0.055).translate(0, i * 4.7 + 2.2, 0)); const geo = mergeGeos(L); boxProjUV(geo, 18, false); const m = new T.Group(); m.add(new T.Mesh(geo, glassM)); m.add(new T.Mesh(new T.ConeGeometry(2.2, 16, 8).translate(0, 140, 0), whiteM)); return m; });
  for (const [x, z, h] of [[-8, -30, 84], [26, -22, 70]]) tower(x, z, 9, 9, h, () => { const m = new T.Group(); const geo = new T.CylinderGeometry(3.6, 4.4, h, 12).translate(0, h / 2, 0); boxProjUV(geo, 18, false); m.add(new T.Mesh(geo, glassM)); m.add(new T.Mesh(new T.TorusGeometry(4, 0.3, 6, 24).rotateX(Math.PI / 2).translate(0, h + 1, 0), glow(REALM.sea.rgb))); return m; });
  /* palm fronds of villas on the water, yachts in the marina */
  const fr = [], vil = [], yac = [];
  for (let i = 0; i < 7; i++) { const a = Math.PI * 0.15 + i / 7 * Math.PI * 1.1; for (let k = 0; k < 6; k++) { const r = 56 + k * 9; fr.push([Math.cos(a) * r, Math.sin(a) * r, a]); if (k % 2) vil.push([Math.cos(a + 0.05) * r, Math.sin(a + 0.05) * r, a]); } }
  for (let i = 0; i < 10; i++) { const a = rand(0, Math.PI * 2), r = rand(58, 85); yac.push([Math.cos(a) * r, Math.sin(a) * r, rand(0, 6)]); }
  const inst = (geo, mat, L, y) => { const im = new T.InstancedMesh(geo, mat, L.length); L.forEach((p, i) => { _m.compose(_v1.set(p[0], y, p[1]), _q.setFromAxisAngle(UP, -p[2]), _s.set(1, 1, 1)); im.setMatrixAt(i, _m); }); g.add(im); };
  inst(new T.BoxGeometry(9.5, 0.6, 3), deckM, fr, 1.2); inst(mergeGeos([new T.BoxGeometry(4, 3, 4).translate(0, 1.5, 0), new T.BoxGeometry(4.6, 0.3, 4.6).translate(0, 3.1, 0)]), whiteM, vil, 1.5);
  inst(mergeGeos([new T.BoxGeometry(2.6, 1.2, 9).translate(0, 0.6, 0), new T.BoxGeometry(2, 1, 4).translate(0, 1.6, -0.5)]), whiteM, yac, 0.2);
  /* the hull itself is solid to vehicles and ships, never to the people on top */
  const H0 = new Building(B_X, B_Z, 72, 72, 10, { mesh: new T.Group(), hp: 1e9 }); H0.cover = true; H0.realmBlock = true; H0.gy = -8; H0.top = B_Y - 0.2; BUILDINGS.push(H0);
  /* the causeway: from the beach west of the city straight out to its rim */
  let x0 = coastX(B_Z) - 10; for (let k = 0; k < 40 && H(x0, B_Z) < 2.6; k++) x0 -= 3; const x1 = B_X - 48;
  RLM.causeway = { x: x0, z: B_Z, x2: x1, z2: B_Z, y: B_Y, r: 5 }; DECKS.push(RLM.causeway); RLM.head = new V3(x0 - 6, groundY(x0 - 6, B_Z), B_Z);
  const len = x1 - x0, cw = new T.Group(); cw.position.set((x0 + x1) / 2, B_Y, B_Z); scene.add(cw);
  cw.add(new T.Mesh(new T.BoxGeometry(len, 0.8, 10).translate(0, -0.35, 0), deckM));
  for (const s of [-1, 1]) cw.add(new T.Mesh(new T.BoxGeometry(len, 1, 0.3).translate(0, 0.5, s * 5), whiteM));
  for (let k = 0; k <= len; k += 12) { cw.add(new T.Mesh(new T.CylinderGeometry(0.9, 1.1, 14, 8).translate(-len / 2 + k, -7.5, 0), darkM)); for (const s of [-1, 1]) cw.add(new T.Mesh(new T.BoxGeometry(0.3, 0.3, 0.3).translate(-len / 2 + k, 1.2, s * 5), glow(REALM.sea.rgb))); }
})();
/* ---------- realm signs over every post ---------- */
for (const c of CPS) {
  const R = REALM[c.realm], tex = canvasTex(512, 128, (x, w, h) => { if (x.clearRect) x.clearRect(0, 0, w, h); if (typeof x.fillText !== 'function') return; x.fillStyle = 'rgba(8,10,14,0.55)'; x.fillRect(0, 18, w, h - 36); x.strokeStyle = R.col; x.lineWidth = 6; x.strokeRect(4, 20, w - 8, h - 40); x.fillStyle = R.col; x.font = 'bold 54px sans-serif'; x.textAlign = 'center'; x.fillText(`${c.tag} · ${R.label}`, w / 2, 76); x.font = '24px sans-serif'; x.fillStyle = '#ffffff'; x.fillText(c.name.toUpperCase(), w / 2, 102); });
  const sp = new T.Sprite(new T.SpriteMaterial({ map: tex, transparent: true, depthWrite: false, fog: false })); sp.scale.set(48, 12, 1); sp.position.set(0, c.realm === 'land' ? 38 : 30, 0); c.g.add(sp); c.sign = sp;
}
/* ---------- deferred set-up: ziplines up to the sky base and out to the station, markers, route line ---------- */
function realmInit() {
  RLM.ready = true;
  /* (the ziplines up to the old sky platform are gone with it) */
  /* D: a long line from each fleet's ring to the station */
  for (const ring of ORBITAL_RINGS) { const p = ring.plats.slice().sort((a, b) => Math.hypot(a.x - D_POS.x, a.z - D_POS.z) - Math.hypot(b.x - D_POS.x, b.z - D_POS.z))[0]; if (!p) continue;
    const dx = D_POS.x - p.x, dz = D_POS.z - p.z, l = Math.hypot(dx, dz), ux = dx / l, uz = dz / l, a = new V3(p.x + ux * (p.r - 3), p.y + 3, p.z + uz * (p.r - 3)), b = new V3(D_POS.x - ux * 40, D_POS.y + 3, D_POS.z - uz * 40);
    const L = zipLine(a, b, new V3(p.x + ux * (p.r - 5), p.y, p.z + uz * (p.r - 5)), new V3(D_POS.x - ux * 36, D_POS.y, D_POS.z - uz * 36), [], 'h'); if (L) RLM.dzips.push(L); }
  RLM.el = document.createElement('div'); RLM.el.id = 'route'; document.body.appendChild(RLM.el);
}
/* how to get there, in one line */
function routeText(cp, pe) {
  const onIt = cp.realm === 'land' ? false : pe.pos.distanceTo(cp.pos) < 70;
  if (onIt) return 'You are on it · hold the flag';
  if (cp.realm === 'sea') return 'Fly out, or take a destroyer from the helm on the Marina pier';
  if (cp.realm === 'air') return 'Fly up · Space in the air, Shift to go faster';
  if (cp.realm === 'space') return pe.pos.y > 1200 ? 'The Leviathan is across the gangway · the barrier does not stop a Hero' : 'Fly straight up through the barrier · Space in the air, Shift to climb faster';
  return 'On foot, or fly: Space in the air, Shift to go faster';
}
/* ---------- soldiers take the same routes ---------- */
const onDeck = (s, d) => Math.abs(s.pos.y - d.y) < 3 && deckDist(d, s.pos.x, s.pos.z) < d.r + 2;
function realmTransit() {
  const cam = camera.position;
  for (const s of ENTS) {
    if (s.kind !== 'soldier' || !s.alive || s.isPlayer || s.downed || s.mount || s.para) continue;
    const cp = s.goalCP; if (!cp || !cp.realm || cp.realm !== 'sea' || s.deck) continue;
    if (onDeck(s, RDECK.B)) continue; if (onDeck(s, RLM.causeway)) { if (s.goal.x < s.pos.x + 5) { s.goal.set(B_X + rand(-18, 18), 0, B_Z + rand(-18, 18)); s.goalT = 8; } continue; } /* keep pushing across */
    const dh = s.pos.distanceTo(RLM.head);
    if (dh > 150 && cam.distanceTo(s.pos) > 200 && cam.distanceTo(RLM.head) > 200 && Math.random() < 0.05) s.pos.set(RLM.head.x + rand(-6, 6), RLM.head.y, RLM.head.z + rand(-6, 6)); /* off camera: they make the march in one go */
    else if (dh > 10) { s.goal.set(RLM.head.x + rand(-3, 3), 0, RLM.head.z + rand(-3, 3)); s.goalT = 4; }
    else { s.goal.set(B_X + rand(-18, 18), 0, B_Z + rand(-18, 18)); s.goalT = 12; s.pos.y = Math.max(s.pos.y, B_Y - 1); }
  }
}
/* ships keep clear of the floating city and its causeway */
function shipsClear() {
  for (const e of ENTS) { if (e.kind !== 'naval' || !e.alive) continue; const dx = e.pos.x - B_X, dz = e.pos.z - B_Z, d = Math.hypot(dx, dz), m = 52 + (e.radius || 18) + 12;
    if (d < m) { e.pos.x = B_X + dx / d * m; e.pos.z = B_Z + dz / d * m; } if (e.pos.x < B_X && Math.abs(e.pos.z - B_Z) < 30) e.pos.z = B_Z + (e.pos.z < B_Z ? -30 : 30); }
}
/* ---------- themed warfare ---------- */
function themeLand(dt, near) { /* rolling artillery across the lines, armour on the push */
  const T0 = RLM.theme; const A = THEATRES[0].cp, Z = THEATRE.cur && THEATRE.cur.key === 'land' && THEATRE.cur.at ? THEATRE.cur.at() : A;
  if (near && (T0.artT = (T0.artT || 6) - dt) <= 0) { T0.artT = rand(8, 14); const a = rand(0, 6.28), cx = Z.x + rand(-90, 90), cz = Z.z + rand(-90, 90), pe = PLAYER.ent; snd('missile', _v1.set(cx, 30, cz), 0.6);
    for (let i = 0; i < 6; i++) setTimeout(() => { const x = cx + Math.cos(a) * (i - 2.5) * 13 + rand(-3, 3), z = cz + Math.sin(a) * (i - 2.5) * 13 + rand(-3, 3); if (pe && pe.alive && Math.hypot(x - pe.pos.x, z - pe.pos.z) < 12) return; const p = new V3(x, groundY(x, z), z); fxExplosion(p, 1.8); fxDust(p, 12, 8, 10); explodeDamage(p, 5.5, 70, null, 0); snd('boom', p, 0.8); }, 400 + i * 380); }
  if (THEATRE.cur && THEATRE.cur.key === 'land' && (T0.armT = (T0.armT || 10) - dt) <= 0) { T0.armT = 25; let n = 0; for (const e of ENTS) if (e.alive && e.kind === 'tank' && isHostile(e.team) && Math.hypot(e.pos.x - Z.x, e.pos.z - Z.z) < 320) n++;
    if (n < 2) { const t = spawnUnit('tank', 2); if (t) { const a = rand(0, 6.28); t.spawnAt(new V3(Z.x + Math.cos(a) * 220, 0, Z.z + Math.sin(a) * 220)); } } }
}
function themeSea(dt, near) { /* destroyer shells, torpedo runs, landing craft at the causeway */
  const T0 = RLM.theme; if (near && (T0.shellT = (T0.shellT || 2) - dt) <= 0) { T0.shellT = rand(2.2, 3.8);
    const ships = ENTS.filter(e => e.kind === 'naval' && e.alive && Math.hypot(e.pos.x - B_X, e.pos.z - B_Z) < 1100); const sh = ships.length ? pick(ships) : null, pe = PLAYER.ent;
    const from = sh ? sh.pos.clone().setY(16) : new V3(B_X + rand(300, 500), 30, B_Z + rand(-400, 400)); let to = null;
    for (let k = 0; k < 6 && !to; k++) { const a = rand(0, 6.28), r = rand(10, 90), p = new V3(B_X + Math.cos(a) * r, 0, B_Z + Math.sin(a) * r); p.y = r < 50 ? B_Y : 0.3; if (!pe || p.distanceTo(pe.pos) > 14) to = p; }
    if (to) { fireProj({ from, to, speed: 240, kind: 'bolt', team: sh ? sh.team : 2, src: sh, dmg: 90, splash: 6, w: 0.5, len: 10, color: [3, 1.8, 0.8], fx: 1.6 }); snd('heavy', from, 0.6); if (to.y < 1) setTimeout(() => fxWaterSplash(to, 1.3), from.distanceTo(to) / 240 * 1000); } }
  if (near && (T0.torpT = (T0.torpT || 5) - dt) <= 0) { T0.torpT = rand(6, 10); const a = rand(-1.2, 1.2), p = new V3(B_X + Math.cos(a) * 320, 0.3, B_Z + Math.sin(a) * 320); const tgt = new V3(B_X + Math.cos(a) * 52, 0.3, B_Z + Math.sin(a) * 52); RLM.torps.push({ p, v: tgt.sub(p).normalize().multiplyScalar(34), t: 0 }); }
  for (let i = RLM.torps.length - 1; i >= 0; i--) { const tp = RLM.torps[i]; tp.t += dt; tp.p.addScaledVector(tp.v, dt); if (Math.random() < 0.8) FXS.spawn(tp.p.x, 0.4, tp.p.z, rand(-1, 1), rand(0.5, 2), rand(-1, 1), rand(1.5, 2.5), 1.2, 4, 0.9, 0.95, 0.97, 0.7, 0.75, 0.78, 0.6, 0.4, 0);
    const hitShip = ENTS.find(e => e.kind === 'naval' && e.alive && e.pos.distanceTo(tp.p) < (e.radius || 18));
    if (hitShip || Math.hypot(tp.p.x - B_X, tp.p.z - B_Z) < 53 || tp.t > 14) { fxWaterSplash(tp.p, 2.2); fxExplosion(tp.p.clone().setY(2), 1.6); explodeDamage(tp.p.clone().setY(B_Y), 9, 120, null, 0); if (hitShip) hitShip.damage(400, null, 'splash'); snd('boom', tp.p, 0.8); RLM.torps.splice(i, 1); } }
  if (THEATRE.cur && THEATRE.cur.key === 'sea' && (T0.lcT = (T0.lcT || 20) - dt) <= 0) { T0.lcT = rand(30, 45); const t = ELIM[2] ? 0 : 2, n = t ? warTake(t, 6) : 0; /* the Vanta navy runs the landing craft */
    if (n) { const from = new V3(Math.min(BOUND - 10, B_X + 220), 0, B_Z + rand(-260, 260)), tr = spawnTransport(30, t, from, -Math.PI / 2); tr.auto = { phase: 'go', from, to: new V3(RLM.head.x + 30, 0, RLM.head.z), n, beach: true }; comms(null, `${TEAM[t].short} landing craft heading for the marina causeway!`, 'cmd'); } }
}
function themeAir(dt, near) { /* flak, AA turrets, raids */
  if (!cpC) return;
  const T0 = RLM.theme, own = cpC.owner;
  if (near && (T0.flakT = (T0.flakT || 0) - dt) <= 0) { T0.flakT = LOW_END ? 0.6 : 0.32;
    const air = ENTS.filter(e => e.alive && (e.kind === 'fighter' || e.kind === 'gunship' || e.kind === 'dropship') && !e.orbital && e.pos.distanceTo(cpC.pos) < 500 && (!own || e.team !== own));
    let p; if (air.length && Math.random() < 0.55) { const t = pick(air); p = t.pos.clone().add(new V3(rand(-14, 14), rand(-8, 8), rand(-14, 14))); if (p.distanceTo(t.pos) < 7) t.damage(55, null, 'splash'); }
    else { const a = rand(0, 6.28), r = rand(70, 380); p = new V3(Math.cos(a) * r, rand(150, 420), Math.sin(a) * r); }
    FXS.spawn(p.x, p.y, p.z, rand(-1, 1), rand(0, 1), rand(-1, 1), rand(2.5, 4), 4, 12, 0.07, 0.065, 0.06, 0.2, 0.19, 0.18, 0.85, 0.5, 0); FXA.spawn(p.x, p.y, p.z, 0, 0, 0, 0.16, 5, 1, 4, 2.2, 0.8, 2, 0.5, 0.1, 1, 0, 0); if (Math.random() < 0.3) snd('boom', p, 0.3); }
  if (own) for (const tu of RLM.turrets) { if ((tu.cd -= dt) > 0) continue; tu.cd = 0.45; let best = null, bd = 520;
    for (const e of ENTS) { if (!e.alive || e.team === own || !ARMIES.includes(e.team) || !(e.kind === 'fighter' || e.kind === 'gunship' || e.kind === 'dropship' || e.kind === 'starship') || e.orbital) continue; const d = e.pos.distanceTo(tu.p); if (d < bd) { bd = d; best = e; } }
    if (!best) continue; const lead = best.aim(_v2).clone().addScaledVector(best.vel || _v3.set(0, 0, 0), bd / 700); tu.head.rotation.y = Math.atan2(lead.x - tu.p.x, lead.z - tu.p.z);
    fireProj({ from: tu.p, to: lead, speed: 700, kind: 'bolt', team: own, dmg: 30, splash: 2, w: 0.2, len: 8, color: TEAM[own] ? TEAM[own].laser : [3, 2, 1], fx: 0.6 }); if (camera.position.distanceTo(tu.p) < 200) snd('laser', tu.p, 0.3); }
  if (THEATRE.cur && THEATRE.cur.key === 'air' && (T0.raidT = (T0.raidT || 15) - dt) <= 0) { T0.raidT = rand(25, 35); const t = own && own !== 1 ? 1 : 2;
    for (let i = 0; i < 2; i++) { const f = spawnUnit('fighter', t); if (f) { f.pos.set(rand(-400, 400), rand(220, 320), t === 1 ? 600 : -600); const tg = ENTS.find(e => e.kind === 'soldier' && e.alive && e.team !== t && onDeck(e, RDECK.C)); if (tg) f.target = tg; } }
    comms(null, t === 1 ? 'Our fighters are making a run on the Skyport!' : 'Enemy fighters inbound on the Skyport!', 'cmd'); }
}
function themeSpace(dt, near) { /* Orbital Array removed */
  if (!cpD) return;
}
/* ---------- per frame ---------- */
function updateRealms(dt) {
  if (!RLM.ready) { if (typeof zipLine === 'function') realmInit(); else return; }
  shipsClear();
  const cam = camera.position, cur = THEATRE.cur ? THEATRE.cur.key : null, playing = GAME.state !== 'end';
  if (playing) {
    themeLand(dt, cur === 'land'); /* one big battle at a time: only the active theatre's war machine runs */
    themeSea(dt, cur === 'sea' && Math.hypot(cam.x - B_X, cam.z - B_Z) < 1100);
    themeAir(dt, cur === 'air' && cam.y > 40);
    themeSpace(dt, cur === 'space' && cam.y > 900);
  }
  for (const c of CPS) if (c.sign) { const near = clamp((cam.distanceTo(c.pos) - 45) / 70, 0, 1); c.sign.material.opacity = near * (THEATRE.cur && THEATRE.cur.cp === c ? 0.75 + 0.25 * Math.sin(TIME * 4) : 0.8); c.sign.visible = near > 0.01; } /* fades out up close so it never covers the fight */
  if ((RLM.tr -= dt) <= 0) { RLM.tr = 0.5; realmTransit(); }
  if ((RLM.t -= dt) > 0 || !RLM.el) return; RLM.t = 0.4;
  const pe = PLAYER.ent; if (GAME.state !== 'play' || !pe || !pe.alive) { RLM.el.style.display = 'none'; return; }
  const cp = THEATRE.cur && THEATRE.cur.cp ? THEATRE.cur.cp : CPS.reduce((b, c) => pe.pos.distanceTo(c.pos) < pe.pos.distanceTo(b.pos) ? c : b, CPS[0]), R = REALM[cp.realm];
  RLM.el.style.display = ''; RLM.el.style.borderColor = R.col;
  const html = `<b style="color:${R.col}">${R.label} · ${cp.name}</b> ${Math.round(pe.pos.distanceTo(cp.pos))} m · ${routeText(cp, pe)}`; if (RLM.el.innerHTML !== html) RLM.el.innerHTML = html;
}
