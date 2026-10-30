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
     2. Projects: filter by category
     ========================================================== */
  const cards = $$('.card');
  const chips = $$('.filters .chip');

  const inCategory = (card, value) => (card.dataset.cat || '').split(' ').includes(value);

  // counts on the filter chips
  chips.forEach((chip) => {
    const value = chip.dataset.filter;
    const n = value === 'all' ? cards.length : cards.filter((c) => inCategory(c, value)).length;
    const span = document.createElement('span');
    span.className = 'n';
    span.textContent = n;
    chip.append(span);
  });

  chips.forEach((chip) => {
    chip.addEventListener('click', () => {
      const value = chip.dataset.filter;

      cards.forEach((card) => {
        const show = value === 'all' || inCategory(card, value);
        const wasHidden = card.hidden;
        card.hidden = !show;

        if (show && wasHidden && !reduceMotion) {
          card.animate(
            [{ opacity: 0, transform: 'translateY(10px)' }, { opacity: 1, transform: 'none' }],
            { duration: 260, easing: 'ease-out' }
          );
        }
      });

      chips.forEach((c) => c.setAttribute('aria-pressed', String(c === chip)));
    });
  });

  /* ==========================================================
     3. Navigation: highlight the section you are reading
     ========================================================== */
  const links = $$('.nav .link');
  const navScroller = $('.nav nav');
  const sections = links.map((a) => $(a.getAttribute('href'))).filter(Boolean);

  // On phones the menu scrolls sideways. Move only the menu, never the page.
  const centerInMenu = (a) => {
    if (!navScroller || navScroller.scrollWidth <= navScroller.clientWidth) return;
    const link = a.getBoundingClientRect();
    const menu = navScroller.getBoundingClientRect();
    navScroller.scrollLeft += link.left - menu.left - (menu.width - link.width) / 2;
  };

  const spy = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) return;
        links.forEach((a) => {
          const active = a.getAttribute('href') === `#${entry.target.id}`;
          a.classList.toggle('active', active);
          if (active) centerInMenu(a);
        });
      });
    },
    { rootMargin: '-40% 0px -55% 0px' }
  );
  sections.forEach((section) => spy.observe(section));

  /* ==========================================================
     4. Contact: copy email address
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

  /* ==========================================================
     5. Custom cursor (mouse devices only)
        - a small dot that follows the pointer exactly
        - a ring that trails behind and grows over links and cards
        - a soft glow that drifts after the pointer
        Touch screens and "reduce motion" users keep the normal cursor.

        Built so it never gets in the way of scrolling:
        - nothing here scrolls the page or listens to wheel events
        - the animation loop sleeps when the ring has caught up
        - hover state is re-checked while the page scrolls under a
          still mouse, so the ring never shows a stale state
        - the custom cursor hides over the scrollbar and outside the window
     ========================================================== */
  const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;

  if (finePointer && !reduceMotion) {
    const root = document.documentElement;
    const INTERACTIVE = 'a, button, .chip, .card, .cert';

    const make = (name) => {
      const el = document.createElement('div');
      el.className = `cursor cursor-${name}`;
      el.setAttribute('aria-hidden', 'true');
      document.body.append(el);
      return el;
    };

    const glow = make('glow');
    const ring = make('ring');
    const dot = make('dot');

    let mx = -200, my = -200;   // pointer
    let rx = mx, ry = my;       // ring
    let gx = mx, gy = my;       // glow
    let awake = false;
    let running = false;
    let raf = 0;

    const place = (el, x, y) => { el.style.transform = `translate3d(${x}px, ${y}px, 0)`; };
    const show = () => root.classList.add('cursor-visible');
    const hide = () => {
      root.classList.remove('cursor-visible');
      ring.classList.remove('is-down');
    };

    const setHover = (el) => ring.classList.toggle('is-link', Boolean(el && el.closest && el.closest(INTERACTIVE)));

    const loop = () => {
      rx += (mx - rx) * 0.2;
      ry += (my - ry) * 0.2;
      gx += (mx - gx) * 0.08;
      gy += (my - gy) * 0.08;
      place(ring, rx, ry);
      place(glow, gx, gy);

      const settled =
        Math.abs(mx - rx) < 0.1 && Math.abs(my - ry) < 0.1 &&
        Math.abs(mx - gx) < 0.1 && Math.abs(my - gy) < 0.1;

      if (settled || document.hidden) {
        running = false;
        return;
      }
      raf = requestAnimationFrame(loop);
    };

    const wake = () => {
      if (running) return;
      running = true;
      raf = requestAnimationFrame(loop);
    };

    window.addEventListener('pointermove', (e) => {
      if (e.pointerType !== 'mouse') return;
      mx = e.clientX;
      my = e.clientY;

      // the page scrollbar belongs to the browser, so let the normal cursor show there
      if (mx >= root.clientWidth) {
        hide();
        return;
      }

      if (!awake) {
        awake = true;
        rx = gx = mx;
        ry = gy = my;
        root.classList.add('cursor-on');
      }

      place(dot, mx, my);   // the dot never lags
      setHover(e.target);
      show();
      wake();
    }, { passive: true });

    // When the page scrolls under a still mouse, no pointermove fires.
    // Re-check what is under the pointer, at most every 100 ms and once more when scrolling stops.
    let lastCheck = 0;
    let settleTimer = 0;
    const recheck = () => { if (awake) setHover(document.elementFromPoint(mx, my)); };

    window.addEventListener('scroll', () => {
      if (!awake) return;
      const now = performance.now();
      if (now - lastCheck > 100) {
        lastCheck = now;
        recheck();
      }
      clearTimeout(settleTimer);
      settleTimer = setTimeout(recheck, 120);
    }, { passive: true });

    // leaving the window, the tab or the page area hides the custom cursor
    root.addEventListener('mouseleave', hide);
    root.addEventListener('mouseenter', (e) => { if (e.clientX < root.clientWidth && awake) show(); });
    window.addEventListener('blur', hide);

    window.addEventListener('pointerdown', (e) => { if (e.pointerType === 'mouse') ring.classList.add('is-down'); });
    window.addEventListener('pointerup', () => ring.classList.remove('is-down'));
    window.addEventListener('pointercancel', () => ring.classList.remove('is-down'));

    document.addEventListener('visibilitychange', () => {
      if (document.hidden) hide();
      else if (awake) wake();
    });
  }
})();