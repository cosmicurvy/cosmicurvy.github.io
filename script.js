(() => {
  'use strict';

  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const $ = (selector, root = document) => root.querySelector(selector);
  const $$ = (selector, root = document) => [...root.querySelectorAll(selector)];

  /* ==========================================================
     1. Hero: a scatter plot with a fitted curve
        - dots fade in, then the amber "model" curve draws itself
        - move the cursor over the plot: dots move away and the
          thin residual lines (distance from each dot to the
          curve) light up near the cursor
     ========================================================== */
  const canvas = $('#field');

  if (canvas) {
    const ctx = canvas.getContext('2d');
    const POINT = '169,139,255';
    const CURVE = '255,180,84';
    const INK = '238,234,251';
    const COUNT = 150;
    const PAD = 28;
    const RADIUS = 110;

    let w = 0;
    let h = 0;
    let start = null;
    let frame = 0;
    const mouse = { x: -9999, y: -9999 };

    // Seeded random numbers, so the plot looks the same on every load
    let seed = 7;
    const rand = () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const gauss = () => Math.sqrt(-2 * Math.log(1 - rand())) * Math.cos(2 * Math.PI * rand());

    const points = Array.from({ length: COUNT }, (_, i) => ({
      u: 0.03 + (0.94 * (i + rand() * 0.8)) / COUNT, // position along the x axis (0 to 1)
      noise: gauss() * 0.055,                         // how far the dot sits from the curve
      phase: rand() * Math.PI * 2,
      r: 2 + rand() * 1.6,
      dx: 0, dy: 0, vx: 0, vy: 0
    }));

    const curveAt = (u) => 0.5 - 0.2 * Math.sin(u * Math.PI * 2.1 + 0.5) - 0.12 * (u - 0.5);
    const xOf = (u) => PAD + u * (w - 2 * PAD);
    const yOf = (u) => PAD + curveAt(u) * (h - 2 * PAD);

    function draw(now) {
      const t = reduceMotion ? 1e9 : now - start;
      const dotsAlpha = Math.min(1, t / 900);
      const curveProgress = Math.min(1, Math.max(0, (t - 700) / 2200));
      const reveal = 1 - Math.pow(1 - curveProgress, 3);

      ctx.clearRect(0, 0, w, h);

      // grid and axes
      ctx.lineWidth = 1;
      ctx.strokeStyle = `rgba(${INK},.05)`;
      for (let i = 1; i < 5; i++) {
        const y = PAD + ((h - 2 * PAD) * i) / 5;
        ctx.beginPath();
        ctx.moveTo(PAD, y);
        ctx.lineTo(w - PAD, y);
        ctx.stroke();
      }
      ctx.strokeStyle = `rgba(${INK},.18)`;
      ctx.beginPath();
      ctx.moveTo(PAD, PAD * 0.5);
      ctx.lineTo(PAD, h - PAD);
      ctx.lineTo(w - PAD * 0.5, h - PAD);
      ctx.stroke();

      // move the dots
      for (const p of points) {
        const baseX = xOf(p.u);
        const baseY = yOf(p.u) + p.noise * h + (reduceMotion ? 0 : Math.sin(now * 0.0008 + p.phase) * 3);

        if (!reduceMotion) {
          const ox = baseX + p.dx - mouse.x;
          const oy = baseY + p.dy - mouse.y;
          const d2 = ox * ox + oy * oy;
          if (d2 < RADIUS * RADIUS && d2 > 0.01) {
            const d = Math.sqrt(d2);
            const push = (1 - d / RADIUS) * 1.6;
            p.vx += (ox / d) * push;
            p.vy += (oy / d) * push;
          }
          p.vx += -p.dx * 0.04;
          p.vy += -p.dy * 0.04;
          p.vx *= 0.88;
          p.vy *= 0.88;
          p.dx += p.vx;
          p.dy += p.vy;
        }

        p.x = baseX + p.dx;
        p.y = baseY + p.dy;
      }

      // residual lines: each dot to the curve
      if (reveal > 0) {
        for (const p of points) {
          const cu = (p.x - PAD) / (w - 2 * PAD);
          if (cu < 0 || cu > reveal) continue;
          const near = Math.max(0, 1 - Math.hypot(p.x - mouse.x, p.y - mouse.y) / 170);
          ctx.strokeStyle = `rgba(${POINT},${(0.07 + near * 0.55) * dotsAlpha})`;
          ctx.beginPath();
          ctx.moveTo(p.x, p.y);
          ctx.lineTo(p.x, yOf(cu));
          ctx.stroke();
        }

        // the fitted curve
        const steps = 160;
        const trace = () => {
          ctx.beginPath();
          for (let i = 0; i <= steps * reveal; i++) {
            const u = i / steps;
            if (i) ctx.lineTo(xOf(u), yOf(u));
            else ctx.moveTo(xOf(u), yOf(u));
          }
        };
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        trace();
        ctx.strokeStyle = `rgba(${CURVE},.16)`;
        ctx.lineWidth = 10;
        ctx.stroke();
        trace();
        ctx.strokeStyle = `rgb(${CURVE})`;
        ctx.lineWidth = 2.5;
        ctx.stroke();
      }

      // dots on top
      for (const p of points) {
        const near = Math.max(0, 1 - Math.hypot(p.x - mouse.x, p.y - mouse.y) / 170);
        ctx.fillStyle = `rgba(${POINT},${(0.75 + near * 0.25) * dotsAlpha})`;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.r + near * 1.5, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    const tick = (now) => {
      if (start === null) start = now;
      draw(now);
      frame = requestAnimationFrame(tick);
    };
    const play = () => { if (!frame && !reduceMotion) frame = requestAnimationFrame(tick); };
    const stop = () => { cancelAnimationFrame(frame); frame = 0; };

    const fit = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = rect.width;
      h = rect.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (reduceMotion) draw(0);
    };

    canvas.addEventListener('pointermove', (e) => {
      const rect = canvas.getBoundingClientRect();
      mouse.x = e.clientX - rect.left;
      mouse.y = e.clientY - rect.top;
    });
    canvas.addEventListener('pointerleave', () => { mouse.x = mouse.y = -9999; });

    new ResizeObserver(fit).observe(canvas);
    fit();

    // only animate while the plot is on screen
    new IntersectionObserver(([entry]) => (entry.isIntersecting ? play() : stop())).observe(canvas);
  }

  /* ==========================================================
     2. Projects: filter by category or by skill
     ========================================================== */
  const cards = $$('.card');
  const chips = $$('.filters .chip');
  const note = $('#filter-note');
  const noteText = $('#filter-text');
  const state = { type: 'all', value: 'all', label: '' };

  const has = (card, key, value) => (card.dataset[key] || '').split(' ').includes(value);

  // counts on the category chips
  chips.forEach((chip) => {
    const value = chip.dataset.filter;
    const n = value === 'all' ? cards.length : cards.filter((c) => has(c, 'cat', value)).length;
    const span = document.createElement('span');
    span.className = 'n';
    span.textContent = n;
    chip.append(span);
  });

  function applyFilter() {
    let visible = 0;

    cards.forEach((card) => {
      const show =
        state.type === 'all' ||
        (state.type === 'cat' && has(card, 'cat', state.value)) ||
        (state.type === 'skill' && has(card, 'skills', state.value));

      const wasHidden = card.hidden;
      card.hidden = !show;
      if (show) visible += 1;

      if (show && wasHidden && !reduceMotion) {
        card.animate(
          [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }],
          { duration: 260, easing: 'ease-out' }
        );
      }
    });

    chips.forEach((chip) => {
      const on = state.type === 'all'
        ? chip.dataset.filter === 'all'
        : state.type === 'cat' && chip.dataset.filter === state.value;
      chip.setAttribute('aria-pressed', String(on));
    });

    if (state.type === 'skill') {
      noteText.textContent = `Showing ${visible} ${visible === 1 ? 'project' : 'projects'} that use ${state.label}.`;
      note.hidden = false;
    } else {
      note.hidden = true;
    }
  }

  chips.forEach((chip) => {
    chip.addEventListener('click', () => {
      state.type = chip.dataset.filter === 'all' ? 'all' : 'cat';
      state.value = chip.dataset.filter;
      applyFilter();
    });
  });

  $('#filter-clear').addEventListener('click', () => {
    state.type = 'all';
    state.value = 'all';
    applyFilter();
  });

  /* ==========================================================
     3. Skills: show project counts, click to filter projects
     ========================================================== */
  $$('.skill').forEach((button) => {
    const id = button.dataset.skill;
    const label = button.textContent.trim();
    const n = cards.filter((c) => has(c, 'skills', id)).length;

    if (!n) {
      button.disabled = true;
      return;
    }

    const span = document.createElement('span');
    span.className = 'n';
    span.textContent = n;
    button.append(span);
    button.setAttribute('aria-label', `${label}, used in ${n} ${n === 1 ? 'project' : 'projects'}. Show them.`);

    button.addEventListener('click', () => {
      state.type = 'skill';
      state.value = id;
      state.label = label;
      applyFilter();
      $('#projects').scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth' });
    });
  });

  /* ==========================================================
     4. Navigation: highlight the section you are reading
     ========================================================== */
  const links = $$('.nav .link');
  const sections = links.map((a) => $(a.getAttribute('href'))).filter(Boolean);

  const spy = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        links.forEach((a) => a.classList.toggle('active', a.getAttribute('href') === `#${entry.target.id}`));
      });
    },
    { rootMargin: '-40% 0px -55% 0px' }
  );
  sections.forEach((section) => spy.observe(section));

  /* ==========================================================
     5. Contact: copy email address
     ========================================================== */
  const copyButton = $('#copy-email');
  const toast = $('#toast');
  let toastTimer;

  const showToast = (message) => {
    toast.textContent = message;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 2200);
  };

  const fallbackCopy = (text) => {
    const area = document.createElement('textarea');
    area.value = text;
    area.setAttribute('readonly', '');
    area.style.position = 'fixed';
    area.style.opacity = '0';
    document.body.append(area);
    area.select();
    const ok = document.execCommand('copy');
    area.remove();
    return ok;
  };

  copyButton.addEventListener('click', async () => {
    const address = copyButton.dataset.email;
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(address);
      } else if (!fallbackCopy(address)) {
        throw new Error('copy failed');
      }
      showToast('Email copied');
    } catch (err) {
      showToast('Could not copy. Select the address and copy it instead.');
    }
  });
})();