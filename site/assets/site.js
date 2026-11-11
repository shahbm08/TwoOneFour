// Small enhancements: header border on scroll, mobile menu, and the two forms.
(function () {
  "use strict";

  var header = document.querySelector(".top");
  function onScroll() { header.classList.toggle("scrolled", window.scrollY > 8); }
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();

  var toggle = document.querySelector(".menu-toggle");
  var nav = document.getElementById("nav");
  if (toggle && nav) {
    toggle.addEventListener("click", function () {
      var open = nav.classList.toggle("open");
      toggle.setAttribute("aria-expanded", String(open));
    });
    nav.addEventListener("click", function (e) {
      if (e.target.tagName === "A") {
        nav.classList.remove("open");
        toggle.setAttribute("aria-expanded", "false");
      }
    });
  }

  var year = document.querySelector("[data-year]");
  if (year) year.textContent = String(new Date().getFullYear());

  var EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

  function check(form) {
    var fields = form.querySelectorAll("[required]");
    for (var i = 0; i < fields.length; i++) {
      var f = fields[i];
      if (f.type === "checkbox" ? !f.checked : !f.value.trim()) return f;
      if (f.type === "email" && !EMAIL.test(f.value.trim())) return f;
    }
    return null;
  }

  function message(field) {
    if (field.type === "checkbox") return "Please tick the box to agree to the privacy notice.";
    if (field.type === "email" && field.value.trim()) return "Please enter a valid email address.";
    var label = field.form.querySelector('label[for="' + field.id + '"]');
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

      var bad = check(form);
      if (bad) {
        status.classList.add("err");
        status.textContent = message(bad);
        bad.focus();
        return;
      }

      var data = {};
      new FormData(form).forEach(function (v, k) { data[k] = typeof v === "string" ? v.trim() : v; });
      data.consent = data.consent === "on";

      button.disabled = true;
      status.textContent = "Sending…";

      fetch(form.getAttribute("data-endpoint"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data)
      })
        .then(function (res) { return res.json().catch(function () { return {}; }).then(function (body) { return { ok: res.ok, body: body }; }); })
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
})();
