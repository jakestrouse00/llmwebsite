/* ============================================================
   AQUARELLE — Canvas / Ink Lab Module
   Interactive watercolor splash & ink trail rendering.
   Capped stream (1,000 splashes), circular buffer,
   requestAnimationFrame throttling, touch support.
   ============================================================ */

(function () {
  'use strict';

  var MAX_SPLASHES = 1000;
  var canvas, ctx;
  var splashes = [];       // Circular buffer of splash objects
  var trails = [];          // Active ink trail points
  var isDrawing = false;
  var animFrameId = null;
  var currentTool = 'brush'; // 'brush' or 'splash'
  var currentColor = 'ink';  // 'ink', 'blue', 'sienna', 'sage'
  var brushSize = 8;

  var colorMap = {
    ink:    { r: 44,  g: 44,  b: 44  },
    blue:   { r: 162, g: 194, b: 212 },
    sienna: { r: 212, g: 180, b: 162 },
    sage:   { r: 178, g: 196, b: 180 }
  };

  document.addEventListener('DOMContentLoaded', init);

  function init() {
    canvas = document.getElementById('ink-canvas');
    if (!canvas) return; // Not on the canvas page

    ctx = canvas.getContext('2d');
    resizeCanvas();
    setupEventListeners();
    setupToolButtons();
    startRenderLoop();

    window.addEventListener('resize', debounce(resizeCanvas, 200));
  }

  /* --- Canvas Sizing (HiDPI-aware) --- */
  function resizeCanvas() {
    var container = canvas.parentElement;
    var dpr = window.devicePixelRatio || 1;
    var rect = container.getBoundingClientRect();

    // Save existing drawing before resize
    var imageData = null;
    if (canvas.width > 0 && canvas.height > 0) {
      try { imageData = ctx.getImageData(0, 0, canvas.width, canvas.height); } catch (e) {}
    }

    var displayWidth = Math.floor(rect.width - 32); // Account for padding
    var displayHeight = Math.floor(Math.min(rect.height - 32, 600));

    canvas.style.width = displayWidth + 'px';
    canvas.style.height = displayHeight + 'px';
    canvas.width = displayWidth * dpr;
    canvas.height = displayHeight * dpr;

    ctx.scale(dpr, dpr);

    // Fill with paper-white background
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, displayWidth, displayHeight);

    // Restore previous drawing if possible
    if (imageData) {
      try { ctx.putImageData(imageData, 0, 0); } catch (e) {}
    }
  }

  /* --- Event Listeners --- */
  function setupEventListeners() {
    // Mouse events
    canvas.addEventListener('mousedown', onPointerDown);
    canvas.addEventListener('mousemove', onPointerMove);
    canvas.addEventListener('mouseup', onPointerUp);
    canvas.addEventListener('mouseleave', onPointerUp);

    // Touch events
    canvas.addEventListener('touchstart', onTouchStart, { passive: false });
    canvas.addEventListener('touchmove', onTouchMove, { passive: false });
    canvas.addEventListener('touchend', onPointerUp);
    canvas.addEventListener('touchcancel', onPointerUp);

    // Clear button
    var clearBtn = document.getElementById('canvas-clear');
    if (clearBtn) {
      clearBtn.addEventListener('click', clearCanvas);
    }
  }

  function onTouchStart(e) {
    e.preventDefault();
    var touch = e.touches[0];
    var pos = getTouchPos(touch);
    onPointerDown({ clientX: touch.clientX, clientY: touch.clientY, _pos: pos });
  }

  function onTouchMove(e) {
    e.preventDefault();
    var touch = e.touches[0];
    var pos = getTouchPos(touch);
    onPointerMove({ clientX: touch.clientX, clientY: touch.clientY, _pos: pos });
  }

  function getTouchPos(touch) {
    var rect = canvas.getBoundingClientRect();
    return {
      x: touch.clientX - rect.left,
      y: touch.clientY - rect.top
    };
  }

  function getMousePos(e) {
    if (e._pos) return e._pos;
    var rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top
    };
  }

  function onPointerDown(e) {
    isDrawing = true;
    var pos = getMousePos(e);

    if (currentTool === 'splash') {
      addSplash(pos.x, pos.y);
    } else {
      // Start a new trail
      trails.push({
        points: [pos],
        color: currentColor,
        size: brushSize,
        alpha: 1.0
      });
    }
  }

  function onPointerMove(e) {
    if (!isDrawing) return;
    var pos = getMousePos(e);

    if (currentTool === 'brush' && trails.length > 0) {
      var currentTrail = trails[trails.length - 1];
      currentTrail.points.push(pos);

      // Add to splashes buffer for rendering
      if (splashes.length >= MAX_SPLASHES) {
        splashes.shift(); // Circular buffer: remove oldest
      }
      splashes.push({
        type: 'trail-point',
        x: pos.x,
        y: pos.y,
        prevX: currentTrail.points.length > 1 ? currentTrail.points[currentTrail.points.length - 2].x : pos.x,
        prevY: currentTrail.points.length > 1 ? currentTrail.points[currentTrail.points.length - 2].y : pos.y,
        color: currentColor,
        size: brushSize,
        alpha: 1.0,
        age: 0
      });
    }
  }

  function onPointerUp() {
    isDrawing = false;
    trails = [];
  }

  /* --- Splash Creation --- */
  function addSplash(x, y) {
    // A watercolor splash is a cluster of overlapping translucent circles
    var numDroplets = 8 + Math.floor(Math.random() * 12);
    var baseRadius = brushSize * 3;

    for (var i = 0; i < numDroplets; i++) {
      var angle = Math.random() * Math.PI * 2;
      var dist = Math.random() * baseRadius;
      var dx = x + Math.cos(angle) * dist;
      var dy = y + Math.sin(angle) * dist;
      var radius = Math.max(2, baseRadius * 0.3 + Math.random() * baseRadius * 0.5);
      var alpha = 0.1 + Math.random() * 0.25;

      if (splashes.length >= MAX_SPLASHES) {
        splashes.shift();
      }
      splashes.push({
        type: 'droplet',
        x: dx,
        y: dy,
        radius: radius,
        color: currentColor,
        alpha: alpha,
        age: 0
      });
    }

    // Central splash point
    if (splashes.length >= MAX_SPLASHES) {
      splashes.shift();
    }
    splashes.push({
      type: 'droplet',
      x: x,
      y: y,
      radius: baseRadius * 0.6,
      color: currentColor,
      alpha: 0.3,
      age: 0
    });
  }

  /* --- Render Loop --- */
  function startRenderLoop() {
    function render() {
      drawSplashes();
      animFrameId = requestAnimationFrame(render);
    }
    animFrameId = requestAnimationFrame(render);
  }

  function drawSplashes() {
    var displayWidth = parseInt(canvas.style.width, 10);
    var displayHeight = parseInt(canvas.style.height, 10);

    // Clear and redraw all splashes each frame
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, displayWidth, displayHeight);

    for (var i = 0; i < splashes.length; i++) {
      var s = splashes[i];
      var c = colorMap[s.color] || colorMap.ink;

      // Slow alpha fade for oldest elements (circular buffer cleanup)
      s.age++;
      var fadeAlpha = s.alpha;
      if (i < splashes.length * 0.2 && splashes.length > MAX_SPLASHES * 0.8) {
        var fadeProgress = (splashes.length * 0.2 - i) / (splashes.length * 0.2);
        fadeAlpha = s.alpha * (1 - fadeProgress * 0.7);
      }

      if (fadeAlpha <= 0.01) continue;

      if (s.type === 'droplet') {
        drawDroplet(s.x, s.y, s.radius, c, fadeAlpha);
      } else if (s.type === 'trail-point') {
        drawTrailSegment(s.prevX, s.prevY, s.x, s.y, s.size, c, fadeAlpha);
      }
    }
  }

  function drawDroplet(x, y, radius, color, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = 'rgb(' + color.r + ',' + color.g + ',' + color.b + ')';
    ctx.beginPath();
    ctx.arc(x, y, Math.max(1, radius), 0, Math.PI * 2);
    ctx.fill();

    // Soft edge: draw a larger, more transparent circle behind
    ctx.globalAlpha = alpha * 0.3;
    ctx.beginPath();
    ctx.arc(x, y, Math.max(1, radius * 1.5), 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function drawTrailSegment(x1, y1, x2, y2, size, color, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.strokeStyle = 'rgb(' + color.r + ',' + color.g + ',' + color.b + ')';
    ctx.lineWidth = Math.max(1, size);
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    // Soft bleed edge
    ctx.globalAlpha = alpha * 0.2;
    ctx.lineWidth = Math.max(1, size * 2);
    ctx.beginPath();
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
    ctx.stroke();

    ctx.restore();
  }

  /* --- Clear Canvas --- */
  function clearCanvas() {
    splashes = [];
    trails = [];
    var displayWidth = parseInt(canvas.style.width, 10);
    var displayHeight = parseInt(canvas.style.height, 10);
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, displayWidth, displayHeight);
  }

  /* --- Tool Buttons --- */
  function setupToolButtons() {
    // Tool selection (brush / splash)
    document.querySelectorAll('[data-tool]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        currentTool = btn.getAttribute('data-tool');
        document.querySelectorAll('[data-tool]').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
      });
    });

    // Color selection
    document.querySelectorAll('[data-color]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        currentColor = btn.getAttribute('data-color');
        document.querySelectorAll('[data-color]').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
      });
    });

    // Brush size
    document.querySelectorAll('[data-size]').forEach(function (btn) {
      btn.addEventListener('click', function () {
        brushSize = parseInt(btn.getAttribute('data-size'), 10) || 8;
        document.querySelectorAll('[data-size]').forEach(function (b) { b.classList.remove('active'); });
        btn.classList.add('active');
      });
    });
  }

  /* --- Utility: Debounce --- */
  function debounce(fn, delay) {
    var timer;
    return function () {
      var context = this;
      var args = arguments;
      clearTimeout(timer);
      timer = setTimeout(function () { fn.apply(context, args); }, delay);
    };
  }

})();