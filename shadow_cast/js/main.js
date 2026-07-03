// main.js — SHADOWCAST UI: canvas renderer, input (drag/wheel/pinch/keyboard/slider),
// ghosting feedback, hints (max 2), magnetic snap, deterministic daily seed + archive.
(function () {
  'use strict';
  var S = window.SHADOW;
  var LIB = window.PUZZLES;
  var SOLVE = 0.82;          // IoU threshold to trigger the magnetic snap + solve
  var SNAP_MS = 360;         // snap animation duration

  // ---- DOM ----
  var canvas = document.getElementById('game');
  var ctx = canvas.getContext('2d');
  var dateLabel = document.getElementById('dateLabel');
  var dayLabel = document.getElementById('dayLabel');
  var statusPill = document.getElementById('statusPill');
  var meterFill = document.getElementById('meterFill');
  var meterVal = document.getElementById('meterVal');
  var distSlider = document.getElementById('distSlider');
  var distVal = document.getElementById('distVal');
  var hintBtn = document.getElementById('hintBtn');
  var hintCount = document.getElementById('hintCount');
  var hintText = document.getElementById('hintText');
  var archiveList = document.getElementById('archiveList');
  var solvedOverlay = document.getElementById('solvedOverlay');
  var solvedName = document.getElementById('solvedName');
  var nextPuzzleBtn = document.getElementById('nextPuzzleBtn');
  var prevDayBtn = document.getElementById('prevDay');
  var nextDayBtn = document.getElementById('nextDay');
  var todayBtn = document.getElementById('todayBtn');

  // ---- Offscreen mask canvases (120x120) ----
  var GW = 120, GH = 120;
  var targetEdgeCanvas = document.createElement('canvas');
  targetEdgeCanvas.width = GW; targetEdgeCanvas.height = GH;
  var targetEdgeCtx = targetEdgeCanvas.getContext('2d');
  var shadowCanvas = document.createElement('canvas');
  shadowCanvas.width = GW; shadowCanvas.height = GH;
  var shadowCtx = shadowCanvas.getContext('2d');

  // ---- Wall rect (inside the 640x720 canvas) ----
  var WALL = { x: 30, y: 24, w: 580, h: 540 };
  var ARC = { cx: 320, cy: 660, r: 64 };

  // ---- State ----
  var currentDate = todayUTC();
  var puzzle = null;
  var az = 0, dist = 8;
  var solved = false;
  var hintsUsed = 0;
  var snapStart = 0, snapFromAz = 0, snapFromDist = 0, snapping = false;
  var dragging = false, lastX = 0, lastY = 0;
  var pointers = new Map();        // active pointers (for pinch)
  var pinchDist = 0;

  function todayUTC() {
    var d = new Date();
    return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()));
  }
  function dateKey(d) { return S.utcDateStr(d); }
  function startOfDay(d) { return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate())); }
  function addDays(d, n) { var x = startOfDay(d); x.setUTCDate(x.getUTCDate() + n); return x; }

  // ---- localStorage helpers ----
  function lsGet(k, def) { try { var v = localStorage.getItem(k); return v === null ? def : v; } catch (e) { return def; } }
  function lsSet(k, v) { try { localStorage.setItem(k, v); } catch (e) {} }
  function hintsKey(d) { return 'sc_hints_' + dateKey(d); }
  function solvedKey(d) { return 'sc_solved_' + dateKey(d); }
  function loadHints(d) { return parseInt(lsGet(hintsKey(d), '0'), 10) || 0; }
  function saveHints(d, n) { lsSet(hintsKey(d), String(n)); }
  function isSolvedDate(d) { return lsGet(solvedKey(d), '0') === '1'; }
  function markSolved(d) { lsSet(solvedKey(d), '1'); }

  // ---- Load puzzle for a date (deterministic start position from date seed) ----
  function loadDate(d) {
    currentDate = startOfDay(d);
    var idx = S.dailyPuzzleIndex(LIB, currentDate);
    puzzle = S.buildPuzzle(LIB[idx]);
    var seed = S.dateSeed(dateKey(currentDate));
    // deterministic scrambled start: azimuth in [-70,70], distance near solution +/- jitter
    az = S.clampAzimuth(((seed % 1400) / 10 - 70) * Math.PI / 180);
    dist = puzzle.solution.distance + (((seed >> 8) % 5) - 2) * 0.7;
    dist = Math.max(4, Math.min(14, dist));
    solved = isSolvedDate(currentDate);
    hintsUsed = loadHints(currentDate);
    snapping = false; solved = false; // re-solve each visit; persist flag set on solve
    if (isSolvedDate(currentDate)) { /* allow replay */ }
    distSlider.value = dist;
    updateHeader();
    updateHintsUI();
    renderArchive();
    hideOverlay();
  }

  function updateHeader() {
    var opts = { weekday: 'long', year: 'numeric', month: 'short', day: 'numeric', timeZone: 'UTC' };
    dateLabel.textContent = currentDate.toLocaleDateString(undefined, opts);
    var idx = S.dailyPuzzleIndex(LIB, currentDate);
    dayLabel.textContent = 'Puzzle #' + (idx + 1) + ' · ' + dateKey(currentDate);
  }

  function updateHintsUI() {
    var left = 2 - hintsUsed;
    hintCount.textContent = left + ' left';
    hintBtn.disabled = left <= 0;
    hintText.textContent = hintsUsed > 0 ? puzzle.hints.slice(0, hintsUsed).join('\n') : '';
  }

  // ---- Rendering ----
  function fillMaskCanvas(c2, mask, edge, color) {
    // edge: if true, only draw edge pixels (for outline). Flips vertically so z is up.
    var img = c2.createImageData(GW, GH);
    var data = img.data;
    var r0 = color[0], g0 = color[1], b0 = color[2], a0 = color[3];
    for (var j = 0; j < GH; j++) {           // image row 0 = top = zmax
      var r = GH - 1 - j;                    // mask row from bottom
      for (var c = 0; c < GW; c++) {
        var v = mask[r * GW + c];
        if (v) {
          var o = (j * GW + c) * 4;
          data[o] = r0; data[o + 1] = g0; data[o + 2] = b0; data[o + 3] = a0;
        }
      }
    }
    c2.putImageData(img, 0, 0);
  }

  function hsl(h, s, l) { return 'hsl(' + h + ',' + s + '%,' + l + '%)'; }
  function glowColor(score) {
    // blue (210) far -> amber (38) mid -> green (140) solved
    var h;
    if (score < 0.5) h = 210 - (210 - 38) * (score / 0.5);
    else h = 38 + (140 - 38) * ((score - 0.5) / 0.5);
    return h;
  }

  function wallToScreen(wx, wz) {
    return [WALL.x + (wx - puzzle.bounds.xmin) / (puzzle.bounds.xmax - puzzle.bounds.xmin) * WALL.w,
            WALL.y + (puzzle.bounds.zmax - wz) / (puzzle.bounds.zmax - puzzle.bounds.zmin) * WALL.h];
  }

  function render(score, castMask) {
    var W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);

    // wall background (lit wall gradient)
    var wg = ctx.createLinearGradient(0, WALL.y, 0, WALL.y + WALL.h);
    wg.addColorStop(0, '#222a3d'); wg.addColorStop(1, '#161b29');
    ctx.fillStyle = wg;
    roundRect(ctx, WALL.x, WALL.y, WALL.w, WALL.h, 14); ctx.fill();
    // wall inner vignette
    ctx.save();
    roundRect(ctx, WALL.x, WALL.y, WALL.w, WALL.h, 14); ctx.clip();
    var vg = ctx.createRadialGradient(WALL.x + WALL.w / 2, WALL.y + WALL.h / 2, 60, WALL.x + WALL.w / 2, WALL.y + WALL.h / 2, WALL.w * 0.7);
    vg.addColorStop(0, 'rgba(255,255,255,0.05)'); vg.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = vg; ctx.fillRect(WALL.x, WALL.y, WALL.w, WALL.h);
    ctx.restore();

    // baseline (ground line on wall)
    var bl = wallToScreen(0, puzzle.bounds.zmin);
    ctx.strokeStyle = 'rgba(255,255,255,0.06)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(WALL.x + 6, bl[1]); ctx.lineTo(WALL.x + WALL.w - 6, bl[1]); ctx.stroke();

    // target outline (glowing ghost) — color shifts with score
    var hue = glowColor(score);
    var edge = S.edgeMask(puzzle.targetMask, GW, GH);
    fillMaskCanvas(targetEdgeCtx, edge, true, [255, 255, 255, 255]);
    ctx.save();
    roundRect(ctx, WALL.x, WALL.y, WALL.w, WALL.h, 14); ctx.clip();
    ctx.imageSmoothingEnabled = true;
    var pulse = 0.5 + 0.5 * Math.sin(performance.now() / 380);
    var glowAlpha = 0.35 + 0.5 * score;
    ctx.shadowColor = hsl(hue, 90, 60);
    ctx.shadowBlur = 10 + 26 * score + 8 * pulse * score;
    ctx.globalAlpha = glowAlpha;
    ctx.drawImage(targetEdgeCanvas, WALL.x, WALL.y, WALL.w, WALL.h);
    ctx.shadowBlur = 0; ctx.globalAlpha = 0.9;
    ctx.drawImage(targetEdgeCanvas, WALL.x, WALL.y, WALL.w, WALL.h);
    ctx.restore();

    // live cast shadow (dark silhouette, soft edge)
    fillMaskCanvas(shadowCtx, castMask, false, [8, 10, 18, 235]);
    ctx.save();
    roundRect(ctx, WALL.x, WALL.y, WALL.w, WALL.h, 14); ctx.clip();
    ctx.imageSmoothingEnabled = true;
    ctx.shadowColor = 'rgba(0,0,0,0.5)'; ctx.shadowBlur = 6;
    ctx.globalAlpha = 0.96;
    ctx.drawImage(shadowCanvas, WALL.x, WALL.y, WALL.w, WALL.h);
    ctx.restore();

    // azimuth arc (light position indicator) at bottom
    drawArc(score);

    // meter + status
    meterFill.style.width = (score * 100).toFixed(0) + '%';
    meterVal.textContent = (score * 100).toFixed(0) + '%';
    if (solved) {
      statusPill.textContent = 'Solved'; statusPill.classList.add('solved');
    } else if (score >= 0.6) {
      statusPill.textContent = 'Getting close'; statusPill.classList.remove('solved');
    } else if (score >= 0.3) {
      statusPill.textContent = 'Warmer'; statusPill.classList.remove('solved');
    } else {
      statusPill.textContent = 'In progress'; statusPill.classList.remove('solved');
    }
  }

  function drawArc(score) {
    var cx = ARC.cx, cy = ARC.cy, r = ARC.r;
    // track from -80° to +80° (screen: left to right). Map az in [-AZ_LIMIT, AZ_LIMIT].
    var a0 = -S.AZ_LIMIT, a1 = S.AZ_LIMIT;
    function azToScreen(a) {
      // a=-80 -> left, a=+80 -> right; angle measured from vertical
      var t = (a - a0) / (a1 - a0); // 0..1
      var ang = Math.PI * (1 - t);  // pi (left) .. 0 (right)
      return [cx + r * Math.cos(ang), cy - r * Math.sin(ang)];
    }
    // track
    ctx.strokeStyle = 'rgba(255,255,255,0.12)'; ctx.lineWidth = 4; ctx.lineCap = 'round';
    var p0 = azToScreen(a0), p1 = azToScreen(a1);
    ctx.beginPath(); ctx.moveTo(p0[0], p0[1]); ctx.lineTo(p1[0], p1[1]); ctx.stroke();
    // tick marks at center
    var pc = azToScreen(0);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.moveTo(pc[0], pc[1] - 8); ctx.lineTo(pc[0], pc[1] + 8); ctx.stroke();
    // handle
    var ph = azToScreen(az);
    var hue = glowColor(score);
    ctx.save();
    ctx.shadowColor = hsl(hue, 90, 60); ctx.shadowBlur = 16;
    ctx.fillStyle = hsl(hue, 90, 62);
    ctx.beginPath(); ctx.arc(ph[0], ph[1], 9, 0, Math.PI * 2); ctx.fill();
    ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath(); ctx.arc(ph[0], ph[1], 3.5, 0, Math.PI * 2); ctx.fill();
    // labels
    ctx.fillStyle = 'rgba(139,147,168,0.8)'; ctx.font = '10px JetBrains Mono, monospace';
    ctx.textAlign = 'center';
    ctx.fillText('−80°', p0[0], p0[1] + 18);
    ctx.fillText('0°', pc[0], pc[1] + 18);
    ctx.fillText('+80°', p1[0], p1[1] + 18);
    ctx.fillText('LIGHT ANGLE', cx, cy + 30);
  }

  function roundRect(c, x, y, w, h, r) {
    c.beginPath();
    c.moveTo(x + r, y);
    c.arcTo(x + w, y, x + w, y + h, r);
    c.arcTo(x + w, y + h, x, y + h, r);
    c.arcTo(x, y + h, x, y, r);
    c.arcTo(x, y, x + w, y, r);
    c.closePath();
  }

  // ---- Main loop ----
  function frame() {
    if (snapping) {
      var t = Math.min(1, (performance.now() - snapStart) / SNAP_MS);
      var e = 1 - Math.pow(1 - t, 3); // easeOutCubic
      az = snapFromAz + (puzzle.solution.azimuth - snapFromAz) * e;
      dist = snapFromDist + (puzzle.solution.distance - snapFromDist) * e;
      distSlider.value = dist;
      if (t >= 1) { snapping = false; if (!solved) doSolve(); }
    }
    var r = S.castMask(puzzle, az, dist);
    var score = S.iou(r.mask, puzzle.targetMask);
    distVal.textContent = dist.toFixed(1);
    render(score, r.mask);
    if (!solved && !snapping && score >= SOLVE) { beginSnap(); }
    requestAnimationFrame(frame);
  }

  function beginSnap() {
    snapping = true; snapStart = performance.now();
    snapFromAz = az; snapFromDist = dist;
  }
  function doSolve() {
    solved = true; markSolved(currentDate);
    solvedName.textContent = puzzle.name;
    solvedOverlay.classList.remove('hidden');
    renderArchive();
  }
  function hideOverlay() { solvedOverlay.classList.add('hidden'); }

  // ---- Input: pointer (drag azimuth on wall, drag handle on arc) ----
  function canvasPos(e) {
    var rect = canvas.getBoundingClientRect();
    var sx = (e.clientX - rect.left) * (canvas.width / rect.width);
    var sy = (e.clientY - rect.top) * (canvas.height / rect.height);
    return [sx, sy];
  }
  function onPointerDown(e) {
    canvas.setPointerCapture(e.pointerId);
    pointers.set(e.pointerId, [e.clientX, e.clientY]);
    if (pointers.size === 2) {
      var pts = Array.from(pointers.values());
      pinchDist = Math.hypot(pts[0][0] - pts[1][0], pts[0][1] - pts[1][1]);
      dragging = false;
      return;
    }
    var p = canvasPos(e);
    // if on arc handle area, allow drag; else drag wall for azimuth
    dragging = true; lastX = p[0]; lastY = p[1];
    e.preventDefault();
  }
  function onPointerMove(e) {
    if (pointers.has(e.pointerId)) pointers.set(e.pointerId, [e.clientX, e.clientY]);
    if (pointers.size === 2) {
      var pts = Array.from(pointers.values());
      var pd = Math.hypot(pts[0][0] - pts[1][0], pts[0][1] - pts[1][1]);
      if (pinchDist > 0) {
        var rect = canvas.getBoundingClientRect();
        var delta = (pd - pinchDist) / rect.height * 14;
        dist = Math.max(4, Math.min(14, dist + delta));
        distSlider.value = dist;
      }
      pinchDist = pd;
      return;
    }
    if (!dragging) return;
    var p = canvasPos(e);
    var dx = p[0] - lastX;
    // horizontal drag -> azimuth; full wall width ~ 160deg
    az = S.clampAzimuth(az + dx * (2 * S.AZ_LIMIT) / WALL.w);
    lastX = p[0]; lastY = p[1];
    e.preventDefault();
  }
  function onPointerUp(e) {
    pointers.delete(e.pointerId);
    if (pointers.size < 2) pinchDist = 0;
    if (pointers.size === 0) dragging = false;
  }

  // ---- Wheel: distance ----
  function onWheel(e) {
    e.preventDefault();
    dist = Math.max(4, Math.min(14, dist - e.deltaY * 0.01));
    distSlider.value = dist;
  }

  // ---- Keyboard: fine nudge ----
  function onKey(e) {
    var step = e.shiftKey ? 0.003 : 0.0015; // radians (~0.086° / 0.34° with shift)
    var dstep = e.shiftKey ? 0.2 : 0.08;
    if (e.key === 'ArrowLeft') { az = S.clampAzimuth(az - step); e.preventDefault(); }
    else if (e.key === 'ArrowRight') { az = S.clampAzimuth(az + step); e.preventDefault(); }
    else if (e.key === 'ArrowUp') { dist = Math.max(4, dist - dstep); distSlider.value = dist; e.preventDefault(); }
    else if (e.key === 'ArrowDown') { dist = Math.min(14, dist + dstep); distSlider.value = dist; e.preventDefault(); }
  }

  // ---- Slider ----
  function onSlider() { dist = parseFloat(distSlider.value); }

  // ---- Hints (max 2) ----
  function onHint() {
    if (hintsUsed >= 2 || !puzzle) return;
    hintsUsed++; saveHints(currentDate, hintsUsed); updateHintsUI();
  }

  // ---- Archive ----
  function renderArchive() {
    var today = todayUTC();
    var html = '';
    for (var i = 29; i >= 0; i--) {
      var d = addDays(today, -i);
      var key = dateKey(d);
      var isToday = i === 0;
      var isCur = dateKey(d) === dateKey(currentDate);
      var solvedD = isSolvedDate(d);
      var cls = 'day-cell' + (isCur ? ' current' : '') + (solvedD ? ' solved' : '') + (i < 0 ? ' future' : '');
      var label = key.slice(8); // DD
      html += '<button class="' + cls + '" data-date="' + key + '" title="' + key + '">' + label + '</button>';
    }
    archiveList.innerHTML = html;
    archiveList.querySelectorAll('.day-cell').forEach(function (b) {
      b.addEventListener('click', function () {
        var k = b.getAttribute('data-date');
        var parts = k.split('-');
        loadDate(new Date(Date.UTC(+parts[0], +parts[1] - 1, +parts[2])));
      });
    });
  }

  // ---- Nav buttons ----
  prevDayBtn.addEventListener('click', function () { loadDate(addDays(currentDate, -1)); });
  nextDayBtn.addEventListener('click', function () {
    var t = todayUTC();
    if (currentDate.getTime() < t.getTime()) loadDate(addDays(currentDate, 1));
  });
  todayBtn.addEventListener('click', function () { loadDate(todayUTC()); });
  nextPuzzleBtn.addEventListener('click', function () { loadDate(addDays(currentDate, 1)); hideOverlay(); });

  // ---- Wire events ----
  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointercancel', onPointerUp);
  canvas.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('keydown', onKey);
  distSlider.addEventListener('input', onSlider);
  hintBtn.addEventListener('click', onHint);

  // ---- Boot ----
  loadDate(todayUTC());
  requestAnimationFrame(frame);
})();