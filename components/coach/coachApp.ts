/* eslint-disable */
// @ts-nocheck
/*
 * Coach body panel — weight trend, muscle/fat composition estimate, and
 * progress photos. Ported from a standalone single-file app and kept as
 * imperative DOM logic so the camera and photo compare behave as designed.
 * Lifting signals come from the Hevy snapshot (lib/coach-bridge.ts); the old
 * split rotation / set tracker was removed (Oct 2026) in favor of Hevy.
 * Photos live in localStorage (po_coach_photos) with Supabase sync
 * (lib/client-sync.ts); weight entries sync via /api/weight/*.
 */

import { scheduleClientSyncPush } from "@/lib/client-sync";
import { loadLiftingSnapshot } from "@/lib/coach-bridge";
import {
  computeCompositionEstimate,
  computeWeightTrendFromEntries,
  liftSignalsFromSnapshot,
  rollingAverageWeight,
} from "@/lib/coach-composition";

export const COACH_CONFIG = {
  units: "lb",
  composition: { enabled: true, yearsTraining: 1, windowDays: 30 },
};

export const COACH_HTML = `
<div class="po-shell">
  <div class="wt-section">
    <div class="wt-divider"><span>WEIGHT</span></div>

    <div class="wt-card">
      <div class="wt-row">
        <span class="wt-num" id="wtNum">—</span>
        <span class="wt-unit" id="wtUnit">kg</span>
      </div>
      <div class="wt-avg-row hidden" id="wtAvgRow">
        <span class="wt-avg-label">7-day avg</span>
        <span class="wt-avg-val" id="wtAvgNum">—</span>
        <span class="wt-avg-unit" id="wtAvgUnit">kg</span>
      </div>
      <div class="wt-delta hidden" id="wtDelta"></div>
      <div class="wt-streak hidden" id="wtStreak">🔥<span id="wtStreakNum">0 day streak</span></div>

      <div class="wt-empty" id="wtEmpty">Log your first weight to start tracking.</div>

      <div class="wt-chart-wrap hidden" id="wtChartWrap">
        <div class="wt-chart-yaxis">
          <span id="wtYAxisMax">—</span>
          <span id="wtYAxisMin">—</span>
        </div>
        <svg class="wt-chart" viewBox="0 0 320 130" preserveAspectRatio="none">
          <defs>
            <linearGradient id="wtFill" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stop-color="#6ee7b7" stop-opacity="0.25"/>
              <stop offset="100%" stop-color="#6ee7b7" stop-opacity="0"/>
            </linearGradient>
            <filter id="wtGlow"><feGaussianBlur stdDeviation="1.5" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>
          </defs>
          <line class="wt-grid" x1="0" y1="20" x2="320" y2="20"></line>
          <line class="wt-grid" x1="0" y1="65" x2="320" y2="65"></line>
          <line class="wt-grid" x1="0" y1="110" x2="320" y2="110"></line>
          <g id="wtChartContent"></g>
        </svg>
        <div class="wt-meta" id="wtMeta">0 entries</div>
      </div>

      <div class="wt-legend hidden" id="wtLegend">
        <span class="wt-legend-item"><span class="wt-legend-dot"></span>DAILY</span>
        <span class="wt-legend-item"><span class="wt-legend-dot wt-legend-dot-avg"></span>7-DAY AVG</span>
      </div>

      <div class="wt-comp hidden" id="wtComp">
        <div class="wt-comp-h">
          <span class="wt-comp-label">Composition estimate</span>
          <span class="wt-comp-window" id="wtCompWindow">last 30d</span>
        </div>
        <div class="wt-comp-headline" id="wtCompHeadline">—</div>
        <div class="wt-comp-bars" id="wtCompBars"></div>
        <div class="wt-lifting hidden" id="wtLifting"></div>
        <div class="wt-comp-foot" id="wtCompFoot">—</div>
      </div>

      <div class="wt-locked hidden" id="wtLocked">
        <div class="wt-locked-info">
          <span class="wt-locked-check">✓</span>
          <div>
            <div class="wt-locked-label">LOGGED TODAY</div>
            <div class="wt-locked-value" id="wtLockedValue">— kg</div>
            <div class="wt-locked-avg hidden" id="wtLockedAvg">—</div>
          </div>
        </div>
        <button class="wt-edit-btn" id="wtEditBtn">Edit</button>
      </div>

      <div class="wt-input-row" id="wtInputRow">
        <div class="wt-input-top">
          <input type="number" step="0.1" class="wt-input" id="wtInput" placeholder="Enter weight" inputmode="decimal" aria-label="Today's weight">
          <span class="wt-unit-static" id="wtUnitStatic">kg</span>
          <button class="wt-save-btn" id="wtSaveBtn">Save</button>
        </div>
      </div>
    </div>

    <button class="wt-progress-link" id="wtProgressLink" type="button" aria-label="Open progress photos">
      <div>
        <div class="wt-progress-label">PROGRESS PHOTOS</div>
        <div class="wt-progress-count" id="wtProgressCount">0 photos</div>
      </div>
      <span class="wt-progress-arrow">→</span>
    </button>
  </div>

  <div class="wt-overlay" id="wtOverlay" aria-hidden="true">
    <div class="wt-overlay-inner">
      <div class="wt-overlay-h">
        <button class="wt-back" id="wtBack" aria-label="Back">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="15 18 9 12 15 6"></polyline></svg>
        </button>
        <div class="wt-overlay-title">Progress</div>
      </div>
      <div class="wt-overlay-actions">
        <button class="wt-overlay-action wt-overlay-primary" id="wtTakePhotoBtn">Take Photo</button>
        <button class="wt-overlay-action wt-overlay-secondary" id="wtFromLibraryBtn">From Library</button>
      </div>
      <input type="file" id="wtFileCamera" accept="image/*" capture="environment" style="display:none">
      <input type="file" id="wtFileLibrary" accept="image/*" style="display:none">
      <div class="wt-photo-grid" id="wtPhotoGrid">
        <div class="wt-photo-empty">No photos yet · tap Take Photo to start</div>
      </div>
    </div>
  </div>

  <div class="wt-cam" id="wtCam" aria-hidden="true">
    <div class="wt-cam-stage">
      <video class="wt-cam-video" id="wtCamVideo" autoplay playsinline muted></video>
      <canvas id="wtCamCanvas" style="display:none"></canvas>
    </div>
    <div class="wt-cam-actions">
      <button class="wt-cam-btn" id="wtCamCancel">Cancel</button>
      <button class="wt-cam-shutter" id="wtCamShutter" aria-label="Capture"></button>
      <button class="wt-cam-btn" id="wtCamFlip" aria-label="Flip camera">
        <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="23 4 23 10 17 10"></polyline><polyline points="1 20 1 14 7 14"></polyline><path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15"></path></svg>
      </button>
    </div>
  </div>

  <div class="wt-viewer" id="wtViewer" data-mode="single" aria-hidden="true">
    <div class="wt-viewer-single">
      <div class="wt-viewer-stage">
        <img id="wtViewerImg" alt="" style="max-width:100%; max-height:100%; object-fit:contain;">
      </div>
      <div class="wt-viewer-meta">
        <div class="wt-viewer-date" id="wtViewerDate">—</div>
        <div class="wt-viewer-weight" id="wtViewerWeight">—</div>
      </div>
      <div class="wt-viewer-actions">
        <button class="wt-viewer-btn wt-viewer-compare" id="wtViewerCompare">Compare</button>
        <button class="wt-viewer-btn wt-viewer-close" id="wtViewerClose">Close</button>
        <button class="wt-viewer-btn wt-viewer-delete" id="wtViewerDelete">Delete</button>
      </div>
    </div>

    <div class="wt-viewer-compare-view">
      <div class="wt-compare-stage">
        <div class="wt-compare-side" id="wtCmpSideA">
          <img id="wtCmpImgA" alt="">
          <div class="wt-compare-meta-line" id="wtCmpMetaA">—</div>
        </div>
        <button type="button" class="wt-compare-side wt-compare-other" id="wtCmpSideB" title="Tap to compare to a different photo" aria-label="Compare to a different photo">
          <img id="wtCmpImgB" alt="">
          <div class="wt-compare-meta-line" id="wtCmpMetaB">—</div>
        </button>
      </div>
      <div class="wt-compare-headline" id="wtCompareHeadline">—</div>
      <div class="wt-viewer-actions">
        <button class="wt-viewer-btn wt-viewer-back" id="wtCompareBack">← Back</button>
        <button class="wt-viewer-btn wt-viewer-close" id="wtCompareClose">Close</button>
        <button class="wt-viewer-btn wt-viewer-delete" id="wtCompareDelete">Delete</button>
      </div>
    </div>
  </div>
</div>
`;

export function mountCoach(): () => void {
  const CONFIG = COACH_CONFIG;

  // ============================================================
  // STATE — only display units remain (saved by the old settings modal).
  // ============================================================
  function loadUnits() {
    try {
      const raw = localStorage.getItem("po_coach_v1");
      const units = raw ? JSON.parse(raw)?.units : null;
      if (units === "kg" || units === "lb") return units;
    } catch (e) {}
    return CONFIG.units;
  }
  const state = { units: loadUnits() };

  function $(id) {
    return document.getElementById(id);
  }

  // ============================================================
  // WEIGHT TRACKER + COMPOSITION + PROGRESS PHOTOS
  // ============================================================
  const WT_KEY = "po_coach_weights";
  const PHOTO_KEY = "po_coach_photos";

  function wtLoad() {
    try {
      const raw = localStorage.getItem(WT_KEY);
      const arr = raw ? JSON.parse(raw) : [];
      return Array.isArray(arr) ? arr.sort((a, b) => a.dateKey.localeCompare(b.dateKey)) : [];
    } catch (e) {
      return [];
    }
  }
  function wtSave(arr) {
    try {
      localStorage.setItem(WT_KEY, JSON.stringify(arr));
    } catch (e) {}
  }
  function wtDateKey(d) {
    return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
  }
  function wtParseKey(key) {
    const [y, m, d] = key.split("-").map(Number);
    return new Date(y, m - 1, d);
  }
  function wtSmoothPath(points) {
    if (!points.length) return "";
    if (points.length === 1) return "M " + points[0].x + " " + points[0].y;
    let d = "M " + points[0].x.toFixed(2) + " " + points[0].y.toFixed(2);
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1],
        curr = points[i];
      const cx = (prev.x + curr.x) / 2;
      d += " Q " + cx.toFixed(2) + " " + prev.y.toFixed(2) + ", " + cx.toFixed(2) + " " + ((prev.y + curr.y) / 2).toFixed(2);
      d += " T " + curr.x.toFixed(2) + " " + curr.y.toFixed(2);
    }
    return d;
  }

  let wtEntries = wtLoad();

  async function wtPushEntry(entry, opts) {
    try {
      const forToday = Boolean(opts && opts.forToday);
      await fetch("/api/weight/log", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          date: forToday ? undefined : String(entry.dateKey || "").slice(0, 10),
          forToday,
          weight: entry.weight,
          unit: state.units,
        }),
      });
    } catch (e) {}
  }

  async function wtMigrateLocalToServer() {
    if (!wtEntries.length) return;
    for (const entry of wtEntries) {
      await wtPushEntry(entry, { forToday: false });
    }
  }

  async function wtSyncFromServer() {
    try {
      const res = await fetch(
        "/api/weight/logs?unit=" + encodeURIComponent(state.units),
        { cache: "no-store" },
      );
      if (!res.ok) return;
      const data = await res.json();
      if (!Array.isArray(data.entries)) return;
      if (data.entries.length > 0) {
        wtEntries = data.entries.sort((a, b) => a.dateKey.localeCompare(b.dateKey));
        wtSave(wtEntries);
        wtRender();
      } else {
        await wtMigrateLocalToServer();
      }
    } catch (e) {}
  }

  async function wtServerTodayKey() {
    try {
      const res = await fetch("/api/today/summary", { cache: "no-store" });
      if (!res.ok) return wtDateKey(new Date());
      const json = await res.json();
      if (typeof json?.today === "string" && /^\d{4}-\d{2}-\d{2}$/.test(json.today)) {
        return json.today;
      }
    } catch (e) {}
    return wtDateKey(new Date());
  }

  async function wtSaveEntry(weight) {
    const key = await wtServerTodayKey();
    const existing = wtEntries.find((e) => e.dateKey === key);
    let entry;
    if (existing) {
      existing.weight = weight;
      entry = existing;
    } else {
      entry = { dateKey: key, weight };
      wtEntries.push(entry);
      wtEntries.sort((a, b) => a.dateKey.localeCompare(b.dateKey));
    }
    wtSave(wtEntries);
    wtRender();
    wtPushEntry(entry, { forToday: true });
  }

  function wtRender() {
    const last = wtEntries[wtEntries.length - 1] || null;
    const todayKey = wtDateKey(new Date());
    const todayEntry = wtEntries.find((e) => e.dateKey === todayKey);
    const u = state.units;
    const displayKey = todayEntry?.dateKey ?? last?.dateKey ?? null;
    const avg7 = displayKey
      ? rollingAverageWeight(
          wtEntries.map((e) => ({ dateKey: e.dateKey, weight: e.weight })),
          displayKey,
          7,
        )
      : null;

    $("wtUnit").textContent = u;
    $("wtUnitStatic").textContent = u;
    $("wtNum").textContent = todayEntry
      ? todayEntry.weight.toFixed(1)
      : last
        ? last.weight.toFixed(1)
        : "—";

    if (avg7 != null) {
      $("wtAvgNum").textContent = avg7.toFixed(1);
      $("wtAvgUnit").textContent = u;
      $("wtAvgRow").classList.remove("hidden");
    } else {
      $("wtAvgRow").classList.add("hidden");
    }

    if (todayEntry) {
      $("wtEmpty").classList.add("hidden");
      $("wtLockedValue").textContent = todayEntry.weight.toFixed(1) + " " + u;
      if (avg7 != null) {
        $("wtLockedAvg").textContent =
          "7-day avg " + avg7.toFixed(1) + " " + u;
        $("wtLockedAvg").classList.remove("hidden");
      } else {
        $("wtLockedAvg").classList.add("hidden");
      }
      $("wtLocked").classList.remove("hidden");
      $("wtInputRow").classList.add("hidden");
    } else {
      if (wtEntries.length === 0) $("wtEmpty").classList.remove("hidden");
      else $("wtEmpty").classList.add("hidden");
      $("wtLocked").classList.add("hidden");
      $("wtInputRow").classList.remove("hidden");
      if (last && !$("wtInput").value) $("wtInput").value = last.weight.toFixed(1);
    }

    if (wtEntries.length >= 2) {
      $("wtChartWrap").classList.remove("hidden");
      $("wtLegend").classList.remove("hidden");
      wtRenderChart();
      wtRenderDelta();
      wtRenderComposition();
    } else {
      $("wtChartWrap").classList.add("hidden");
      $("wtLegend").classList.add("hidden");
      $("wtDelta").classList.add("hidden");
      $("wtComp").classList.add("hidden");
    }
    wtRenderStreak();
  }

  function wtRenderStreak() {
    const el = $("wtStreak");
    let streak = 0;
    let cursor = new Date(new Date());
    if (!wtEntries.find((e) => e.dateKey === wtDateKey(cursor))) {
      cursor.setDate(cursor.getDate() - 1);
    }
    while (wtEntries.find((e) => e.dateKey === wtDateKey(cursor))) {
      streak++;
      cursor.setDate(cursor.getDate() - 1);
    }
    if (streak >= 2) {
      $("wtStreakNum").textContent = streak + " day streak";
      el.classList.remove("hidden");
    } else {
      el.classList.add("hidden");
    }
  }

  function wtRenderChart() {
    const recent = wtEntries.slice(-30);
    const weights = recent.map((e) => e.weight);
    const min = Math.min.apply(null, weights);
    const max = Math.max.apply(null, weights);
    const pad = Math.max((max - min) * 0.15, 0.5);
    const yMin = min - pad,
      yMax = max + pad;
    const xLeft = 8,
      xRight = 312,
      yTop = 20,
      yBot = 110;
    const xRange = xRight - xLeft,
      yRange = yBot - yTop;
    const xFor = (i) => (recent.length === 1 ? xRight : xLeft + (i / (recent.length - 1)) * xRange);
    const yFor = (w) => yBot - ((w - yMin) / (yMax - yMin)) * yRange;
    const points = recent.map((e, i) => ({ x: xFor(i), y: yFor(e.weight) }));
    const linePath = wtSmoothPath(points);
    const areaPath = linePath + " L " + points[points.length - 1].x.toFixed(2) + " " + yBot + " L " + points[0].x.toFixed(2) + " " + yBot + " Z";
    const avgPoints = recent.map((_, i) => {
      const start = Math.max(0, i - 6);
      const win = recent.slice(start, i + 1);
      const avg = win.reduce((s, p) => s + p.weight, 0) / win.length;
      return { x: xFor(i), y: yFor(avg) };
    });
    const avgPath = wtSmoothPath(avgPoints);
    let html =
      '<path class="wt-avg-line" d="' + avgPath + '"></path>' +
      '<path class="wt-area" d="' + areaPath + '"></path>' +
      '<path class="wt-line" filter="url(#wtGlow)" d="' + linePath + '"></path>';
    points.forEach((p, i) => {
      const cls = i === points.length - 1 ? "wt-dot-today" : "wt-dot";
      const r = i === points.length - 1 ? 5 : 3;
      html += '<circle class="' + cls + '" cx="' + p.x.toFixed(2) + '" cy="' + p.y.toFixed(2) + '" r="' + r + '"/>';
    });
    $("wtChartContent").innerHTML = html;
    $("wtYAxisMax").textContent = yMax.toFixed(1);
    $("wtYAxisMin").textContent = yMin.toFixed(1);
    $("wtMeta").textContent = wtEntries.length + " " + (wtEntries.length === 1 ? "entry" : "entries") + " · last " + recent.length + " days";
  }

  function wtRenderDelta() {
    const last = wtEntries[wtEntries.length - 1];
    const avg7 = rollingAverageWeight(
      wtEntries.map((e) => ({ dateKey: e.dateKey, weight: e.weight })),
      last.dateKey,
      7,
    );
    const el = $("wtDelta");
    if (avg7 == null) {
      el.classList.add("hidden");
      return;
    }
    const diff = last.weight - avg7;
    if (Math.abs(diff) < 0.05) {
      el.textContent = "On your 7-day avg";
      el.classList.remove("up", "down");
      el.classList.remove("hidden");
      return;
    }
    const arrow = diff > 0 ? "↑" : "↓";
    const sign = diff > 0 ? "+" : "−";
    el.textContent =
      arrow + " " + sign + Math.abs(diff).toFixed(1) + " " + state.units + " vs 7-day avg";
    el.classList.toggle("up", diff > 0);
    el.classList.toggle("down", diff < 0);
    el.classList.remove("hidden");
  }

  function wtRenderComposition() {
    const compEl = $("wtComp");
    const liftingEl = $("wtLifting");
    if (!CONFIG.composition || !CONFIG.composition.enabled) {
      compEl.classList.add("hidden");
      liftingEl.classList.add("hidden");
      return;
    }
    const window = CONFIG.composition.windowDays || 30;
    if (wtEntries.length < 2) {
      compEl.classList.add("hidden");
      liftingEl.classList.add("hidden");
      return;
    }

    const weightTrend = computeWeightTrendFromEntries(
      wtEntries.map((e) => ({ dateKey: e.dateKey, weight: e.weight })),
      window,
    );
    if (!weightTrend) {
      compEl.classList.add("hidden");
      liftingEl.classList.add("hidden");
      return;
    }

    const now = wtParseKey(wtEntries[wtEntries.length - 1].dateKey);
    const start = new Date(now);
    start.setDate(start.getDate() - window);

    const snapshot = loadLiftingSnapshot();
    const alignedSnapshot =
      snapshot && snapshot.windowDays === window ? snapshot : null;
    const lift = liftSignalsFromSnapshot(alignedSnapshot, weightTrend.actualDays);

    const result = computeCompositionEstimate({
      weightDelta: weightTrend.weightDelta,
      actualDays: weightTrend.actualDays,
      units: state.units,
      yearsTraining: CONFIG.composition.yearsTraining || 1,
      lift,
      usedRollingWeight: weightTrend.usedRollingWeight,
    });

    compEl.classList.remove("hidden");
    $("wtCompWindow").textContent = "last " + weightTrend.actualDays + "d";
    const headlineEl = $("wtCompHeadline");
    headlineEl.textContent = result.headline;
    headlineEl.className = "wt-comp-headline " + result.headlineCls;

    $("wtCompBars").innerHTML =
      '<div class="wt-comp-bar muscle" style="width:' +
      result.musclePct.toFixed(1) +
      '%"></div>' +
      '<div class="wt-comp-bar fat" style="width:' +
      result.fatPct.toFixed(1) +
      '%"></div>';

    if (result.hasLiftData) {
      liftingEl.textContent = result.liftingMeta;
      liftingEl.classList.remove("hidden");
    } else {
      liftingEl.classList.add("hidden");
    }

    $("wtCompFoot").textContent = result.footLine;
  }

  $("wtSaveBtn").addEventListener("click", () => {
    const v = parseFloat($("wtInput").value);
    if (isNaN(v) || v <= 0) return;
    wtSaveEntry(v);
  });
  $("wtInput").addEventListener("keydown", (e) => {
    if (e.key === "Enter") $("wtSaveBtn").click();
  });
  $("wtEditBtn").addEventListener("click", () => {
    $("wtLocked").classList.add("hidden");
    $("wtInputRow").classList.remove("hidden");
    const todayEntry = wtEntries.find((e) => e.dateKey === wtDateKey(new Date()));
    if (todayEntry) $("wtInput").value = todayEntry.weight.toFixed(1);
    $("wtInput").focus();
    $("wtInput").select();
  });

  // ============================================================
  // PROGRESS PHOTOS
  // ============================================================
  let photos = [];
  try {
    const raw = localStorage.getItem(PHOTO_KEY);
    if (raw) photos = JSON.parse(raw);
  } catch (e) {
    photos = [];
  }

  function photosSave() {
    try {
      localStorage.setItem(PHOTO_KEY, JSON.stringify(photos));
      scheduleClientSyncPush("coach");
      return true;
    } catch (e) {
      return false;
    }
  }
  function compressPhotoDataUrl(dataUrl, maxDim, quality) {
    maxDim = maxDim || 1080;
    quality = quality == null ? 0.75 : quality;
    return new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        let w = img.naturalWidth || img.width;
        let h = img.naturalHeight || img.height;
        if (w > maxDim || h > maxDim) {
          if (w >= h) {
            h = Math.round(h * (maxDim / w));
            w = maxDim;
          } else {
            w = Math.round(w * (maxDim / h));
            h = maxDim;
          }
        }
        const c = document.createElement("canvas");
        c.width = w;
        c.height = h;
        c.getContext("2d").drawImage(img, 0, 0, w, h);
        try {
          resolve(c.toDataURL("image/jpeg", quality));
        } catch {
          resolve(dataUrl);
        }
      };
      img.onerror = () => resolve(dataUrl);
      img.src = dataUrl;
    });
  }
  function photoFmtDate(key) {
    const d = wtParseKey(key);
    const mons = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    return mons[d.getMonth()] + " " + d.getDate();
  }
  function photoCurrentWeight() {
    const last = wtEntries[wtEntries.length - 1];
    return last ? last.weight.toFixed(1) + " " + state.units : "—";
  }
  function photosRender() {
    const grid = $("wtPhotoGrid");
    if (!photos.length) {
      grid.innerHTML = '<div class="wt-photo-empty">No photos yet · tap Take Photo to start</div>';
    } else {
      grid.innerHTML = photos
        .map(
          (p) =>
            '<button class="wt-photo-card" data-id="' + p.id + '" type="button"><img src="' + p.dataUrl + '" alt=""><div class="wt-photo-overlay"></div><div class="wt-photo-meta"><span class="wt-photo-date">' + photoFmtDate(p.dateKey) + '</span><span class="wt-photo-weight">' + (p.weight || "—") + "</span></div></button>",
        )
        .join("");
      grid.querySelectorAll(".wt-photo-card").forEach((card) => {
        card.addEventListener("click", () => openPhoto(card.dataset.id));
      });
    }
    if (!photos.length) $("wtProgressCount").textContent = "0 photos";
    else if (photos.length === 1) $("wtProgressCount").textContent = "1 photo · latest " + photoFmtDate(photos[0].dateKey);
    else $("wtProgressCount").textContent = photos.length + " photos · latest " + photoFmtDate(photos[0].dateKey);
  }
  async function photosAdd(dataUrl) {
    let compressed = dataUrl;
    try {
      compressed = await compressPhotoDataUrl(dataUrl);
    } catch {}
    const id = "p" + Date.now() + "_" + Math.floor(Math.random() * 999);
    const entry = { id, dataUrl: compressed, dateKey: wtDateKey(new Date()), weight: photoCurrentWeight() };
    photos.unshift(entry);
    if (!photosSave()) {
      try {
        entry.dataUrl = await compressPhotoDataUrl(dataUrl, 800, 0.6);
      } catch {}
      if (!photosSave()) {
        photos.shift();
        alert("Phone storage is full — delete some older progress photos before adding a new one.");
        return;
      }
    }
    photosRender();
  }
  function fileToPhoto(file) {
    const r = new FileReader();
    r.onload = (e) => photosAdd(e.target.result);
    r.readAsDataURL(file);
  }

  $("wtProgressLink").addEventListener("click", () => {
    photosRender();
    $("wtOverlay").classList.add("is-open");
    document.body.style.overflow = "hidden";
  });
  $("wtBack").addEventListener("click", () => {
    $("wtOverlay").classList.remove("is-open");
    document.body.style.overflow = "";
  });

  let camStream = null;
  let camFacing = "environment";
  async function openCam() {
    $("wtCam").classList.add("is-open");
    try {
      camStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: camFacing } }, audio: false });
      $("wtCamVideo").srcObject = camStream;
    } catch (e) {
      try {
        camStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        $("wtCamVideo").srcObject = camStream;
      } catch (e2) {
        closeCam();
        alert('Camera unavailable. Use "From Library" instead.');
        throw e2;
      }
    }
  }
  function closeCam() {
    if (camStream) {
      camStream.getTracks().forEach((t) => t.stop());
      camStream = null;
    }
    $("wtCamVideo").srcObject = null;
    $("wtCam").classList.remove("is-open");
  }
  $("wtTakePhotoBtn").addEventListener("click", async () => {
    if (navigator.mediaDevices && navigator.mediaDevices.getUserMedia) {
      try {
        await openCam();
        return;
      } catch (e) {}
    }
    $("wtFileCamera").click();
  });
  $("wtFileCamera").addEventListener("change", (e) => {
    const f = e.target.files && e.target.files[0];
    if (f) fileToPhoto(f);
    e.target.value = "";
  });
  $("wtFromLibraryBtn").addEventListener("click", () => $("wtFileLibrary").click());
  $("wtFileLibrary").addEventListener("change", (e) => {
    const f = e.target.files && e.target.files[0];
    if (f) fileToPhoto(f);
    e.target.value = "";
  });
  $("wtCamCancel").addEventListener("click", closeCam);
  $("wtCamFlip").addEventListener("click", async () => {
    camFacing = camFacing === "environment" ? "user" : "environment";
    if (camStream) camStream.getTracks().forEach((t) => t.stop());
    try {
      await openCam();
    } catch (e) {}
  });
  $("wtCamShutter").addEventListener("click", () => {
    const video = $("wtCamVideo"),
      canvas = $("wtCamCanvas");
    if (!video.videoWidth) return;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL("image/jpeg", 0.85);
    closeCam();
    photosAdd(dataUrl);
  });

  let activePhotoId = null;
  let comparePhotoId = null;
  let pvDeleteConfirm = false;
  function openPhoto(id) {
    const p = photos.find((x) => x.id === id);
    if (!p) return;
    activePhotoId = id;
    $("wtViewerImg").src = p.dataUrl;
    $("wtViewerDate").textContent = photoFmtDate(p.dateKey).toUpperCase();
    $("wtViewerWeight").textContent = p.weight || "—";
    $("wtViewer").dataset.mode = "single";
    $("wtViewer").classList.add("is-open");
    pvDeleteConfirm = false;
    $("wtViewerDelete").textContent = "Delete";
    $("wtViewerDelete").classList.remove("is-confirm");
    $("wtViewerCompare").disabled = photos.length < 2;
    $("wtViewerCompare").style.opacity = photos.length < 2 ? "0.4" : "";
  }
  function closePhoto() {
    $("wtViewer").classList.remove("is-open");
    $("wtViewer").dataset.mode = "single";
    activePhotoId = null;
    comparePhotoId = null;
  }

  function parseWeightStr(w) {
    if (!w) return null;
    const m = String(w).match(/-?\d+(\.\d+)?/);
    return m ? parseFloat(m[0]) : null;
  }
  function fmtDelta(diff, units) {
    if (diff == null) return "";
    if (Math.abs(diff) < 0.05) return "· no change";
    const sign = diff > 0 ? "+" : "−";
    return "· " + sign + Math.abs(diff).toFixed(1) + " " + units;
  }

  function defaultCompareFor(activeId) {
    const idx = photos.findIndex((p) => p.id === activeId);
    if (idx === -1) return null;
    if (photos[idx + 1]) return photos[idx + 1].id;
    if (photos[idx - 1]) return photos[idx - 1].id;
    return null;
  }

  function openCompare(activeId, otherId) {
    const A = photos.find((p) => p.id === activeId);
    const B = photos.find((p) => p.id === otherId);
    if (!A || !B) return;
    activePhotoId = activeId;
    comparePhotoId = otherId;
    $("wtCmpImgA").src = A.dataUrl;
    $("wtCmpImgB").src = B.dataUrl;
    $("wtCmpMetaA").textContent = photoFmtDate(A.dateKey) + " · " + (A.weight || "—");
    $("wtCmpMetaB").textContent = photoFmtDate(B.dateKey) + " · " + (B.weight || "—");
    const wA = parseWeightStr(A.weight);
    const wB = parseWeightStr(B.weight);
    const headEl = $("wtCompareHeadline");
    let cls = "flat",
      headline = photoFmtDate(A.dateKey) + " → " + photoFmtDate(B.dateKey);
    if (wA != null && wB != null) {
      const diff = wA - wB;
      headline += " " + fmtDelta(diff, state.units);
      if (Math.abs(diff) < 0.05) cls = "flat";
      else if (diff > 0) cls = "up";
      else cls = "down";
    }
    headEl.textContent = headline;
    headEl.className = "wt-compare-headline " + cls;
    $("wtViewer").dataset.mode = "compare";
    $("wtViewer").classList.add("is-open");
    pvDeleteConfirm = false;
    $("wtCompareDelete").textContent = "Delete";
    $("wtCompareDelete").classList.remove("is-confirm");
  }

  function cycleCompareTarget() {
    if (!activePhotoId) return;
    const others = photos.filter((p) => p.id !== activePhotoId);
    if (!others.length) return;
    const curIdx = others.findIndex((p) => p.id === comparePhotoId);
    const nextIdx = (curIdx + 1) % others.length;
    openCompare(activePhotoId, others[nextIdx].id);
  }

  function deleteActivePhoto(deleteBtn) {
    if (!activePhotoId) return;
    if (!pvDeleteConfirm) {
      pvDeleteConfirm = true;
      deleteBtn.textContent = "Confirm delete?";
      deleteBtn.classList.add("is-confirm");
      setTimeout(() => {
        pvDeleteConfirm = false;
        deleteBtn.textContent = "Delete";
        deleteBtn.classList.remove("is-confirm");
      }, 3000);
      return;
    }
    photos = photos.filter((p) => p.id !== activePhotoId);
    photosSave();
    photosRender();
    closePhoto();
  }

  $("wtViewerClose").addEventListener("click", closePhoto);
  $("wtCompareClose").addEventListener("click", closePhoto);
  $("wtViewerDelete").addEventListener("click", () => deleteActivePhoto($("wtViewerDelete")));
  $("wtCompareDelete").addEventListener("click", () => deleteActivePhoto($("wtCompareDelete")));
  $("wtViewerCompare").addEventListener("click", () => {
    if (!activePhotoId) return;
    const otherId = defaultCompareFor(activePhotoId);
    if (!otherId) {
      alert("Need at least one other photo to compare.");
      return;
    }
    openCompare(activePhotoId, otherId);
  });
  $("wtCompareBack").addEventListener("click", () => {
    if (activePhotoId) $("wtViewer").dataset.mode = "single";
    else closePhoto();
  });
  $("wtCmpSideB").addEventListener("click", cycleCompareTarget);

  // ============================================================
  // BOOT
  // ============================================================
  wtRender();
  wtSyncFromServer();
  photosRender();

  window.addEventListener("focus", wtSyncFromServer);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) wtSyncFromServer();
  });

  return function cleanup() {
    window.removeEventListener("focus", wtSyncFromServer);
    try {
      closeCam();
    } catch (e) {}
    document.body.style.overflow = "";
  };
}
