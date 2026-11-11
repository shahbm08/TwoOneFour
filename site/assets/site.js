// TwoOneFour: header on scroll, mobile menu, scroll reveals, the hero network
// animation, and the two forms. No third-party code.
(function () {
  "use strict";

  var root = document.documentElement;
  root.classList.add("js");
  var reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  document.addEventListener("DOMContentLoaded", function () {
    header();
    menu();
    reveals();
    network();
    forms();
    var year = document.querySelector("[data-year]");
    if (year) year.textContent = String(new Date().getFullYear());
  });

  function header() {
    var el = document.querySelector(".top");
    if (!el) return;
    var on = function () { el.classList.toggle("scrolled", window.scrollY > 12); };
    window.addEventListener("scroll", on, { passive: true });
    on();
  }

  function menu() {
    var toggle = document.querySelector(".menu-toggle");
    var nav = document.getElementById("nav");
    if (!toggle || !nav) return;
    var close = function () { nav.classList.remove("open"); toggle.setAttribute("aria-expanded", "false"); };
    toggle.addEventListener("click", function () {
      var open = nav.classList.toggle("open");
      toggle.setAttribute("aria-expanded", String(open));
    });
    nav.addEventListener("click", function (e) { if (e.target.tagName === "A") close(); });
    document.addEventListener("keydown", function (e) { if (e.key === "Escape") close(); });
  }

  function reveals() {
    var items = document.querySelectorAll(".reveal, .steps li");
    if (reduceMotion || !("IntersectionObserver" in window)) {
      items.forEach(function (el) { el.classList.add("in"); });
      return;
    }
    var io = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        var el = entry.target;
        // Siblings appear one after another rather than all at once.
        var i = Array.prototype.indexOf.call(el.parentNode.children, el);
        el.style.transitionDelay = Math.min(i, 5) * 80 + "ms";
        el.classList.add("in");
        io.unobserve(el);
      });
    }, { rootMargin: "0px 0px -8% 0px", threshold: 0.12 });
    items.forEach(function (el) { io.observe(el); });
  }

  // Drifting points joined by faint lines, leaning gently toward the pointer.
  function network() {
    var canvas = document.querySelector(".network");
    if (!canvas || reduceMotion || !canvas.getContext) return;
    var ctx = canvas.getContext("2d");
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var w = 0, h = 0, points = [], running = false, visible = true;
    var pointer = { x: -9999, y: -9999 };
    var LINK = 140;

    function size() {
      var r = canvas.getBoundingClientRect();
      w = r.width; h = r.height;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      var n = Math.round(Math.min(90, (w * h) / 16000));
      points = [];
      for (var i = 0; i < n; i++) {
        points.push({
          x: Math.random() * w, y: Math.random() * h,
          vx: (Math.random() - 0.5) * 0.35, vy: (Math.random() - 0.5) * 0.35,
          r: 1 + Math.random() * 1.6
        });
      }
    }

    function frame() {
      if (!running) return;
      ctx.clearRect(0, 0, w, h);
      for (var i = 0; i < points.length; i++) {
        var p = points[i];
        p.x += p.vx; p.y += p.vy;
        if (p.x < 0 || p.x > w) p.vx *= -1;
        if (p.y < 0 || p.y > h) p.vy *= -1;
        var dx = pointer.x - p.x, dy = pointer.y - p.y, d = Math.sqrt(dx * dx + dy * dy);
        if (d < 180) { p.x += dx * 0.004; p.y += dy * 0.004; }
      }
      for (var a = 0; a < points.length; a++) {
        for (var b = a + 1; b < points.length; b++) {
          var ex = points[a].x - points[b].x, ey = points[a].y - points[b].y;
          var dist = Math.sqrt(ex * ex + ey * ey);
          if (dist < LINK) {
            ctx.strokeStyle = "rgba(79,70,229," + (0.22 * (1 - dist / LINK)).toFixed(3) + ")";
            ctx.lineWidth = 1;
            ctx.beginPath(); ctx.moveTo(points[a].x, points[a].y); ctx.lineTo(points[b].x, points[b].y); ctx.stroke();
          }
        }
      }
      for (var k = 0; k < points.length; k++) {
        ctx.fillStyle = k % 3 === 0 ? "rgba(6,182,212,.75)" : "rgba(79,70,229,.6)";
        ctx.beginPath(); ctx.arc(points[k].x, points[k].y, points[k].r, 0, Math.PI * 2); ctx.fill();
      }
      requestAnimationFrame(frame);
    }

    function update() {
      var should = visible && !document.hidden;
      if (should && !running) { running = true; requestAnimationFrame(frame); }
      else if (!should) running = false;
    }

    size();
    var t;
    window.addEventListener("resize", function () { clearTimeout(t); t = setTimeout(size, 150); });
    canvas.parentNode.addEventListener("pointermove", function (e) {
      var r = canvas.getBoundingClientRect();
      pointer.x = e.clientX - r.left; pointer.y = e.clientY - r.top;
    });
    canvas.parentNode.addEventListener("pointerleave", function () { pointer.x = pointer.y = -9999; });
    document.addEventListener("visibilitychange", update);
    // Stop drawing once the hero is scrolled away, to save battery.
    if ("IntersectionObserver" in window) {
      new IntersectionObserver(function (e) { visible = e[0].isIntersecting; update(); }).observe(canvas);
    }
    update();
  }

  function forms() {
    var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

    function firstProblem(form) {
      var fields = form.querySelectorAll("[required]");
      for (var i = 0; i < fields.length; i++) {
        var f = fields[i];
        if (f.type === "checkbox" ? !f.checked : !f.value.trim()) return f;
        if (f.type === "email" && !EMAIL.test(f.value.trim())) return f;
      }
      return null;
    }

    function explain(field) {
      if (field.type === "checkbox") return "Please tick the box to agree to the privacy notice.";
      if (field.type === "email" && field.value.trim()) return "Please enter a valid email address.";
      var label = field.id && field.form.querySelector('label[for="' + field.id + '"]');
      var name = label ? label.firstChild.textContent.trim().toLowerCase() : "this field";
      return "Please fill in " + name + ".";
    }

    document.querySelectorAll("form[data-endpoint]").forEach(function (form) {
      var status = form.querySelector(".status");
      var button = form.querySelector("button[type=submit]");

      form.addEventListener("submit", function (e) {
        e.preventDefault();
        status.className = "status";
        status.textContent = "";

        var bad = firstProblem(form);
        if (bad) {
          status.classList.add("err");
          status.textContent = explain(bad);
          bad.focus();
          return;
        }

        var data = {};
        new FormData(form).forEach(function (v, k) { data[k] = typeof v === "string" ? v.trim() : ""; });
        data.consent = data.consent === "on";

        button.disabled = true;
        status.textContent = "Sending…";

        fetch(form.getAttribute("data-endpoint"), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(data),
          credentials: "omit"
        })
          .then(function (res) {
            return res.json().catch(function () { return {}; }).then(function (body) { return { ok: res.ok, body: body }; });
          })
          .then(function (r) {
            if (!r.ok) throw new Error(r.body.error || "failed");
            status.classList.add("ok");
            status.textContent = r.body.message || "Thank you.";
            form.reset();
          })
          .catch(function (err) {
            status.classList.add("err");
            status.textContent = err.message && err.message !== "failed" && err.message !== "Failed to fetch"
              ? err.message
              : "Sorry, that didn't send. Please try again in a moment.";
          })
          .finally(function () { button.disabled = false; });
      });
    });
  }
})();
