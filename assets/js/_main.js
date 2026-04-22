/* ==========================================================================
   Various functions that we want to use within the template
   ========================================================================== */

// Determine the expected state of the theme toggle, which can be "dark", "light", or
// "system". Default is "system".
let determineThemeSetting = () => {
  let themeSetting = localStorage.getItem("theme");
  return (themeSetting != "dark" && themeSetting != "light" && themeSetting != "system") ? "system" : themeSetting;
};

// Determine the computed theme, which can be "dark" or "light". If the theme setting is
// "system", the computed theme is determined based on the user's system preference.
let determineComputedTheme = () => {
  let themeSetting = determineThemeSetting();
  if (themeSetting != "system") {
    return themeSetting;
  }
  return (userPref && userPref("(prefers-color-scheme: dark)").matches) ? "dark" : "light";
};

// detect OS/browser preference
const browserPref = window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';

// Set the theme on page load or when explicitly called
let setTheme = (theme) => {
  const use_theme =
    theme ||
    localStorage.getItem("theme") ||
    $("html").attr("data-theme") ||
    browserPref;

  if (use_theme === "dark") {
    $("html").attr("data-theme", "dark");
    $("#theme-icon").removeClass("fa-sun").addClass("fa-moon");
  } else if (use_theme === "light") {
    $("html").removeAttr("data-theme");
    $("#theme-icon").removeClass("fa-moon").addClass("fa-sun");
  }
};

// Toggle the theme manually
var toggleTheme = () => {
  const current_theme = $("html").attr("data-theme");
  const new_theme = current_theme === "dark" ? "light" : "dark";
  localStorage.setItem("theme", new_theme);
  setTheme(new_theme);
};

/* ==========================================================================
   Plotly integration script so that Markdown codeblocks will be rendered
   ========================================================================== */

// Read the Plotly data from the code block, hide it, and render the chart as new node. This allows for the 
// JSON data to be retrieve when the theme is switched. The listener should only be added if the data is 
// actually present on the page.
import { plotlyDarkLayout, plotlyLightLayout } from './theme.js';
let plotlyElements = document.querySelectorAll("pre>code.language-plotly");
if (plotlyElements.length > 0) {
  document.addEventListener("readystatechange", () => {
    if (document.readyState === "complete") {
      plotlyElements.forEach((elem) => {
        // Parse the Plotly JSON data and hide it
        var jsonData = JSON.parse(elem.textContent);
        elem.parentElement.classList.add("hidden");

        // Add the Plotly node
        let chartElement = document.createElement("div");
        elem.parentElement.after(chartElement);

        // Set the theme for the plot and render it
        const theme = (determineComputedTheme() === "dark") ? plotlyDarkLayout : plotlyLightLayout;
        if (jsonData.layout) {
          jsonData.layout.template = (jsonData.layout.template) ? { ...theme, ...jsonData.layout.template } : theme;
        } else {
          jsonData.layout = { template: theme };
        }
        Plotly.react(chartElement, jsonData.data, jsonData.layout);
      });
    }
  });
}

/* ==========================================================================
   Actions that should occur when the page has been fully loaded
   ========================================================================== */

$(document).ready(function () {
  // SCSS SETTINGS - These should be the same as the settings in the relevant files 
  const scssLarge = 925;          // pixels, from /_sass/_themes.scss
  const scssMastheadHeight = 70;  // pixels, from the current theme (e.g., /_sass/theme/_default.scss)

  // If the user hasn't chosen a theme, follow the OS preference
  setTheme();
  window.matchMedia('(prefers-color-scheme: dark)')
        .addEventListener("change", (e) => {
          if (!localStorage.getItem("theme")) {
            setTheme(e.matches ? "dark" : "light");
          }
        });

  // Enable the theme toggle
  $('#theme-toggle').on('click', toggleTheme);

  // Enable the sticky footer
  var bumpIt = function () {
    $("body").css("padding-bottom", "0");
    $("body").css("margin-bottom", $(".page__footer").outerHeight(true));
  }
  $(window).resize(function () {
    didResize = true;
  });
  setInterval(function () {
    if (didResize) {
      didResize = false;
      bumpIt();
    }}, 250);
  var didResize = false;
  bumpIt();

  // FitVids init
  fitvids();

  // Follow menu drop down
  $(".author__urls-wrapper button").on("click", function () {
    $(".author__urls").fadeToggle("fast", function () { });
    $(".author__urls-wrapper button").toggleClass("open");
  });

  // Restore the follow menu if toggled on a window resize
  jQuery(window).on('resize', function () {
    if ($('.author__urls.social-icons').css('display') == 'none' && $(window).width() >= scssLarge) {
      $(".author__urls").css('display', 'block')
    }
  });

  // Init smooth scroll, this needs to be slightly more than then fixed masthead height
  $("a").smoothScroll({
    offset: -scssMastheadHeight,
    preventDefault: false,
  });

});


/* ==========================================================================
   Custom script portolio page
   ========================================================================== */
//Script to inject id = header's text content, to allow for toc functionality, creates list elements, then orders the toc based on order of appearance in document
    // Run after DOM is ready (safe whether script is in <head> or end of <body>)
  (function ready(fn) {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", fn);
    else fn();
  })(function () {
    const archive = document.querySelector(".archive");
    if (!archive) return;

    // condenses header content
    function makeIdFromText(txt) {
      return txt
        .toLowerCase()
        .trim()
        .replace(/\s+/g, "")          // remove whitespace
        .replace(/[^a-z0-9_-]/g, ""); // remove non-id-friendly chars
    }

    // Create ids on all h2s inside .archive (in document order)
    const h2s = archive.querySelectorAll("h2"); 
    const used = new Set();
    const headers = [];

    h2s.forEach((h2) => {
      const title = (h2.textContent || "").trim();
      const base = makeIdFromText(title);
      let id = base || "h2";

      let n = 2;
      while (used.has(id) || document.getElementById(id)) {
        id = `${base || "h2"}${n++}`;
      }

      h2.id = id;
      used.add(id);
      headers.push({ id, title });
    });

    // 2) Reorder the TOC <li> items to match the h2 order
    const toc = document.querySelector('ul.toc__menu#markdown-toc');
    if (!toc) return;

    const norm = (s) => (s || "").trim().replace(/\s+/g, " ").toLowerCase();

    // Index existing <li> by href target and by link text
    const byHref = new Map();
    const byText = new Map();
    const allLis = Array.from(toc.querySelectorAll(":scope > li"));

    allLis.forEach((li) => {
      const a = li.querySelector("a");
      if (!a) return;
      const href = a.getAttribute("href") || "";
      const target = href.startsWith("#") ? href.slice(1) : "";
      if (target) byHref.set(target, li);
      byText.set(norm(a.textContent), li);
    });

    const usedLis = new Set();
    const frag = document.createDocumentFragment();

    headers.forEach(({ id, title }) => {
      let li = byHref.get(id) || byText.get(norm(title));

      if (!li) {
        // If a matching <li> doesn't exist, create it
        li = document.createElement("li");
        const a = document.createElement("a");
        a.textContent = title;
        a.href = `#${id}`;
        li.appendChild(a);
      } else {
        // Ensure the matching li points to the (possibly newly created) id
        const a = li.querySelector("a");
        if (a) {
          a.href = `#${id}`;
          // Optional: keep TOC text synced to the header text
          a.textContent = title;
        }
      }

      usedLis.add(li);
      frag.appendChild(li); // appending moves existing nodes into the new order
    });

    // Append any extra TOC <li> that didn't match a header (optional)
    allLis.forEach((li) => {
      if (!usedLis.has(li)) frag.appendChild(li);
    });

    toc.innerHTML = "";
    toc.appendChild(frag);
  });