// puzzles.js — curated, inverse-designed puzzle library for SHADOWCAST.
// Each puzzle is authored in WALL space then back-solved to occluder cards, so the
// target is GUARANTEED to render as a clean recognizable shape at its solution
// (verified via ASCII rendering in Python before integration). Occluders are vertical
// "cards" (footprint line in x at depth y, extruded z0..z1). Multiple depths make the
// union reshape — not just translate — as the light's azimuth changes.
// All solutions: azimuth 0°, distance 8, Lz 6, bounds x[-6,6] z[-3,7], grid 120x120.
(function (global) {
  'use strict';
  var BOUNDS = { xmin: -6, xmax: 6, zmin: -3, zmax: 7 };
  function P(id, name, occ, hints) {
    return { id: id, name: name, Lz: 6, cx: 0, bounds: BOUNDS, gridW: 120, gridH: 120,
      solution: { azimuth: 0.0, distance: 8 }, occluders: occ, hints: hints };
  }
  var H1 = "The light sits near the centre of its arc — try azimuth 0°.";
  var H2 = "The right distance is about 8 units from the scene.";

  var LIB = [
    P("T", "Letter T", [
      { footprint: [[-0.375, -3], [0.375, -3]], z0: 0.6875, z1: 5.6875 },
      { footprint: [[-1.1875, -4.2], [1.1875, -4.2]], z0: 5.3825, z1: 5.7625 }
    ], [H1, H2]),
    P("L", "Letter L", [
      { footprint: [[-1.5, -3], [-0.75, -3]], z0: 0.6875, z1: 5.6875 },
      { footprint: [[-0.855, -4.2], [1.045, -4.2]], z0: 1.9625, z1: 2.4375 }
    ], [H1, H2]),
    P("H", "Letter H", [
      { footprint: [[-1.5625, -3], [-0.9375, -3]], z0: 0.6875, z1: 5.6875 },
      { footprint: [[0.7125, -4.2], [1.1875, -4.2]], z0: 1.9625, z1: 5.7625 },
      { footprint: [[-1.1, -3.6], [1.1, -3.6]], z0: 3.25, z1: 3.745 }
    ], [H1, H2]),
    P("E", "Letter E", [
      { footprint: [[-1.5625, -3], [-0.9375, -3]], z0: 0.6875, z1: 5.6875 },
      { footprint: [[-0.95, -4.2], [0.76, -4.2]], z0: 5.3825, z1: 5.7625 },
      { footprint: [[-0.935, -3.6], [0.715, -3.6]], z0: 3.25, z1: 3.745 },
      { footprint: [[-0.95, -4.2], [0.76, -4.2]], z0: 1.9625, z1: 2.39 }
    ], [H1, H2]),
    P("I", "Letter I", [
      { footprint: [[-0.3125, -3], [0.3125, -3]], z0: 0.6875, z1: 5.6875 },
      { footprint: [[-0.7125, -4.2], [0.7125, -4.2]], z0: 5.3825, z1: 5.7625 },
      { footprint: [[-0.7125, -4.2], [0.7125, -4.2]], z0: 1.9625, z1: 2.39 }
    ], [H1, H2]),
    P("U", "Letter U", [
      { footprint: [[-1.5625, -3], [-0.9375, -3]], z0: 0.6875, z1: 5.6875 },
      { footprint: [[0.7125, -4.2], [1.1875, -4.2]], z0: 1.9625, z1: 5.7625 },
      { footprint: [[-1.1, -3.6], [1.1, -3.6]], z0: 1.325, z1: 1.875 }
    ], [H1, H2]),
    P("PLUS", "A Plus Sign", [
      { footprint: [[-0.3125, -3], [0.3125, -3]], z0: 0.6875, z1: 5.6875 },
      { footprint: [[-1.1875, -4.2], [1.1875, -4.2]], z0: 3.625, z1: 4.0525 }
    ], [H1, H2]),
    P("C", "Letter C", [
      { footprint: [[-1.5625, -3], [-0.9375, -3]], z0: 0.6875, z1: 5.6875 },
      { footprint: [[-0.95, -4.2], [0.76, -4.2]], z0: 5.3825, z1: 5.7625 },
      { footprint: [[-0.95, -4.2], [0.76, -4.2]], z0: 1.9625, z1: 2.39 }
    ], [H1, H2])
  ];
  global.PUZZLES = LIB;
})(typeof window !== 'undefined' ? window : globalThis);