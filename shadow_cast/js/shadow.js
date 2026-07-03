// shadow.js — core 2.5D shadow projection engine for SHADOWCAST
// Pure 2D vector math. No 3D engine. Validated in Python: multi-depth vertical
// "cards" (footprint line in x at depth y, extruded z0..z1) cast clean quadrilateral
// shadows; the union genuinely RESHAPES (not just translates) with azimuth because
// cards at different depths shift by different amounts. IoU is smooth/discriminative
// (1.0 at solution, ~0.83 at 1deg, ~0.55 at 5deg for the T puzzle).
//
// Coordinate system:
//   Wall plane y=0, viewed face-on. Wall coords (wx horizontal, wz vertical, z up).
//   Light at (Lx, Ly, Lz), Ly<0 (front/viewer side). Azimuth theta swings the light in
//   the x-y plane around scene center (cx,0): Lx = cx + d*sin(theta); Ly = -d*cos(theta).
//   Distance d (pinch/scroll) controls magnification. Occluder = vertical card:
//   footprint = [[x,y]...] (>=2 pts), extruded from z0 up to z1.
//   Shadow of a card = convex hull of {project(footprint pt at z0), ...(at z1)}.
(function (global) {
  'use strict';

  // Project 3D point P=(px,py,pz) from light L=(Lx,Ly,Lz) onto wall plane y=0.
  // t = Ly/(Ly-py) > 1 since Ly<0 and py<0. Returns wall coords [wx, wz].
  function project(P, L) {
    var px = P[0], py = P[1], pz = P[2];
    var Lx = L[0], Ly = L[1], Lz = L[2];
    var t = Ly / (Ly - py);
    return [Lx + t * (px - Lx), Lz + t * (pz - Lz)];
  }

  // Convex hull (Andrew's monotone chain). Returns array of [x,z] points.
  function convexHull(pts) {
    pts = pts.slice().sort(function (a, b) { return (a[0] - b[0]) || (a[1] - b[1]); });
    var n = pts.length;
    if (n < 3) return pts;
    var cross = function (o, a, b) { return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]); };
    var lower = [];
    for (var i = 0; i < n; i++) {
      var p = pts[i];
      while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) lower.pop();
      lower.push(p);
    }
    var upper = [];
    for (var j = n - 1; j >= 0; j--) {
      var q = pts[j];
      while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], q) <= 0) upper.pop();
      upper.push(q);
    }
    upper.pop(); lower.pop();
    return lower.concat(upper);
  }

  // Shadow polygon of one vertical card: footprint (array of [x,y]) + z0..z1.
  function shadowPolygon(occluder, L) {
    var fp = occluder.footprint, z0 = occluder.z0, z1 = occluder.z1;
    var pts = [];
    for (var i = 0; i < fp.length; i++) {
      var x = fp[i][0], y = fp[i][1];
      pts.push(project([x, y, z0], L));
      pts.push(project([x, y, z1], L));
    }
    return convexHull(pts);
  }

  // Light position from controls. azimuth (rad), distance d, scene center cx, light height Lz.
  function lightFromControls(azimuth, distance, cx, Lz) {
    var d = Math.max(0.5, distance);
    return [cx + d * Math.sin(azimuth), -d * Math.cos(azimuth), Lz];
  }

  var AZ_LIMIT = (80 * Math.PI) / 180;
  function clampAzimuth(a) {
    while (a > Math.PI) a -= 2 * Math.PI;
    while (a < -Math.PI) a += 2 * Math.PI;
    return Math.max(-AZ_LIMIT, Math.min(AZ_LIMIT, a));
  }

  // Point-in-polygon (ray casting). poly = array of [x,z].
  function pointInPoly(x, z, poly) {
    var inside = false, n = poly.length, j = n - 1;
    for (var i = 0; i < n; i++) {
      var xi = poly[i][0], zi = poly[i][1];
      var xj = poly[j][0], zj = poly[j][1];
      if ((zi > z) !== (zj > z)) {
        var xint = ((xj - xi) * (z - zi)) / (zj - zi) + xi;
        if (x < xint) inside = !inside;
      }
      j = i;
    }
    return inside;
  }

  // Rasterize union of polygons to a binary mask (Uint8Array, row-major, row 0 = zmin).
  function rasterize(polys, gridW, gridH, bounds) {
    var mask = new Uint8Array(gridW * gridH);
    var xmin = bounds.xmin, xmax = bounds.xmax, zmin = bounds.zmin, zmax = bounds.zmax;
    var dx = (xmax - xmin) / gridW, dz = (zmax - zmin) / gridH;
    for (var r = 0; r < gridH; r++) {
      var wz = zmin + (r + 0.5) * dz;
      for (var c = 0; c < gridW; c++) {
        var wx = xmin + (c + 0.5) * dx;
        for (var p = 0; p < polys.length; p++) {
          if (pointInPoly(wx, wz, polys[p])) { mask[r * gridW + c] = 1; break; }
        }
      }
    }
    return mask;
  }

  // Intersection-over-Union of two binary masks.
  function iou(maskA, maskB) {
    var inter = 0, uni = 0, n = maskA.length;
    for (var i = 0; i < n; i++) {
      var a = maskA[i], b = maskB[i];
      if (a || b) uni++;
      if (a && b) inter++;
    }
    return uni === 0 ? 0 : inter / uni;
  }

  // Build a puzzle: precompute the target mask from the solution controls.
  function buildPuzzle(spec) {
    var Lz = spec.Lz, cx = spec.cx || 0, bounds = spec.bounds;
    var sol = spec.solution;
    var L = lightFromControls(sol.azimuth, sol.distance, cx, Lz);
    var polys = spec.occluders.map(function (o) { return shadowPolygon(o, L); });
    var targetMask = rasterize(polys, spec.gridW, spec.gridH, bounds);
    return {
      id: spec.id, name: spec.name, occluders: spec.occluders, bounds: bounds,
      gridW: spec.gridW, gridH: spec.gridH, Lz: Lz, cx: cx,
      solution: sol, targetMask: targetMask, hints: spec.hints || []
    };
  }

  // Live cast shadow for given controls. Returns {mask, polys, L}.
  function castMask(puzzle, azimuth, distance) {
    var a = clampAzimuth(azimuth);
    var L = lightFromControls(a, distance, puzzle.cx, puzzle.Lz);
    var polys = puzzle.occluders.map(function (o) { return shadowPolygon(o, L); });
    var mask = rasterize(polys, puzzle.gridW, puzzle.gridH, puzzle.bounds);
    return { mask: mask, polys: polys, L: L };
  }

  // Similarity (IoU) of current controls vs target.
  function similarity(puzzle, azimuth, distance) {
    var r = castMask(puzzle, azimuth, distance);
    return iou(r.mask, puzzle.targetMask);
  }

  // Edge mask: pixels in mask whose 4-neighbor is empty (for glowing outline).
  function edgeMask(mask, gridW, gridH) {
    var out = new Uint8Array(gridW * gridH);
    for (var r = 0; r < gridH; r++) {
      for (var c = 0; c < gridW; c++) {
        var idx = r * gridW + c;
        if (!mask[idx]) continue;
        var up = r > 0 ? mask[idx - gridW] : 0;
        var dn = r < gridH - 1 ? mask[idx + gridW] : 0;
        var lf = c > 0 ? mask[idx - 1] : 0;
        var rt = c < gridW - 1 ? mask[idx + 1] : 0;
        if (!up || !dn || !lf || !rt) out[idx] = 1;
      }
    }
    return out;
  }

  // FNV-1a date hash -> uint32. Deterministic per UTC date string.
  function dateSeed(dateStr) {
    var h = 2166136261 >>> 0;
    for (var i = 0; i < dateStr.length; i++) {
      h ^= dateStr.charCodeAt(i);
      h = Math.imul(h, 16777619);
    }
    return h >>> 0;
  }
  function utcDateStr(d) { return d.toISOString().slice(0, 10); }
  function dailyPuzzleIndex(library, date) { return dateSeed(utcDateStr(date)) % library.length; }

  global.SHADOW = {
    project: project, convexHull: convexHull, shadowPolygon: shadowPolygon,
    lightFromControls: lightFromControls, clampAzimuth: clampAzimuth, AZ_LIMIT: AZ_LIMIT,
    pointInPoly: pointInPoly, rasterize: rasterize, iou: iou, edgeMask: edgeMask,
    buildPuzzle: buildPuzzle, castMask: castMask, similarity: similarity,
    dateSeed: dateSeed, utcDateStr: utcDateStr, dailyPuzzleIndex: dailyPuzzleIndex
  };
})(typeof window !== 'undefined' ? window : globalThis);