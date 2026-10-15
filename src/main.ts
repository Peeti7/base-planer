import "./style.css";
import type { Projekt, Teil, Zone } from "./data/types";
import daten from "./data/innenhof.json";

const projekt = daten as Projekt;
const zone: Zone = projekt.zonen[0];
const LUFT = ".";
const STACK = 64;

interface Zelle {
  zeichen: string;
  teil: Teil | null;
  hoehe: number; // globale Ebene, auf der dieser Block liegt
}

// ---------- Zustand ----------
let teil: Teil | null = null; // null = Gesamtplan der Zone
let ebeneIndex = 0; // Ebene im Teil-Modus
const maxY = Math.max(...zone.teile.flatMap((t) => t.ebenen.map((e) => t.position.y + e.y)));
let globalY = maxY; // Ebene im Gesamtplan
let nurSchnitt = false; // Gesamtplan: nur diese Ebene zeigen
let auswahl: { spalte: number; reihe: number } | null = null;
let achseZeigen = true;
let zellenGroesse = 10;

// ---------- Hilfsfunktionen ----------
function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  klasse?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const e = document.createElement(tag);
  if (klasse) e.className = klasse;
  if (text !== undefined) e.textContent = text;
  return e;
}

function stacks(n: number): string {
  const voll = Math.floor(n / STACK);
  const rest = n % STACK;
  return voll > 0 ? `${voll} Stacks + ${rest}` : `${rest}`;
}

function zaehleRaster(raster: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const zeile of raster) {
    for (const z of zeile) {
      if (z === LUFT) continue;
      if (projekt.palette[z]?.ohneMaterial) continue;
      m.set(z, (m.get(z) ?? 0) + 1);
    }
  }
  return m;
}

function materialVon(t: Teil): Map<string, number> {
  const m = new Map<string, number>();
  for (const e of t.ebenen) {
    for (const [z, n] of zaehleRaster(e.raster)) m.set(z, (m.get(z) ?? 0) + n);
  }
  return m;
}

function summe(m: Map<string, number>): number {
  let s = 0;
  for (const n of m.values()) s += n;
  return s;
}

function ladeHaken(t: Teil): boolean[] {
  try {
    const roh = localStorage.getItem(`base-planer:${t.id}`);
    if (roh) {
      const a = JSON.parse(roh) as boolean[];
      return t.schritte.map((_, i) => a[i] === true);
    }
  } catch {
    // Speicher nicht verfügbar: ohne Speichern weitermachen
  }
  return t.schritte.map(() => false);
}

function speichereHaken(t: Teil, haken: boolean[]): void {
  try {
    localStorage.setItem(`base-planer:${t.id}`, JSON.stringify(haken));
  } catch {
    // ignorieren
  }
}

function oeffneTeil(t: Teil | null, hoehe?: number): void {
  teil = t;
  auswahl = null;
  ebeneIndex = 0;
  if (t && hoehe !== undefined) {
    const i = t.ebenen.findIndex((e) => t.position.y + e.y === hoehe);
    if (i >= 0) ebeneIndex = i;
  }
  alles();
}

// ---------- Gesamtplan zusammensetzen ----------
function komponiere(y: number, schnitt: boolean): Zelle[][] {
  const g = zone.grenzen;
  const gitter: Zelle[][] = Array.from({ length: g.laenge }, () =>
    Array.from({ length: g.breite }, () => ({ zeichen: LUFT, teil: null, hoehe: 0 })),
  );
  const von = schnitt ? y : 0;
  for (let ly = von; ly <= y; ly++) {
    for (const t of zone.teile) {
      for (const e of t.ebenen) {
        if (t.position.y + e.y !== ly) continue;
        e.raster.forEach((zeile, r) => {
          for (let c = 0; c < zeile.length; c++) {
            const zeichen = zeile[c];
            if (zeichen === LUFT) continue;
            const gx = t.position.x + c - g.x;
            const gz = t.position.z + r - g.z;
            if (gz < 0 || gz >= g.laenge || gx < 0 || gx >= g.breite) continue;
            gitter[gz][gx] = { zeichen, teil: t, hoehe: ly };
          }
        });
      }
    }
  }
  return gitter;
}

function aktuellesGitter(): Zelle[][] {
  if (teil === null) return komponiere(globalY, nurSchnitt);
  const t = teil;
  const hoehe = t.position.y + t.ebenen[ebeneIndex].y;
  return t.ebenen[ebeneIndex].raster.map((zeile) =>
    [...zeile].map((zeichen) => ({ zeichen, teil: t, hoehe })),
  );
}

// ---------- Grundgerüst ----------
const app = document.querySelector<HTMLDivElement>("#app");
if (!app) throw new Error("#app nicht gefunden");

const kopf = el("header", "kopf");
kopf.append(el("h1", undefined, projekt.name), el("p", undefined, "Bauplan-Viewer"));

const nav = el("nav", "nav");
const buehne = el("section", "buehne");
const seite = el("aside", "seite");
const haupt = el("main", "haupt");
haupt.append(nav, buehne, seite);
app.append(kopf, haupt);

const regler = el("div", "regler");
const canvas = el("canvas", "raster");
const infoBox = el("div", "info");
const legende = el("div", "legende");
buehne.append(regler, canvas, infoBox, legende);

const beschreibungBox = el("div", "beschreibung");
const materialBox = el("div", "material");
const schritteBox = el("div", "schritte");
seite.append(beschreibungBox, materialBox, schritteBox);

// ---------- Navigation ----------
function renderNav(): void {
  nav.replaceChildren();
  nav.append(el("h2", undefined, zone.name));

  const gesamt = el("button", teil === null ? "teil aktiv" : "teil");
  gesamt.append(
    el("span", "teil-name", "Gesamtplan"),
    el("span", "teil-fortschritt", `${zone.teile.length} Teile, ${zone.phasen.length} Phasen`),
  );
  gesamt.addEventListener("click", () => oeffneTeil(null));
  nav.append(gesamt);

  for (const p of zone.phasen) {
    nav.append(el("h3", "phasen-titel", `Phase ${p.nr}: ${p.name}`));
    for (const t of zone.teile.filter((x) => x.phase === p.nr)) {
      const fertig = ladeHaken(t).filter(Boolean).length;
      const knopf = el("button", t === teil ? "teil aktiv" : "teil");
      knopf.append(
        el("span", "teil-name", t.name),
        el("span", "teil-fortschritt", `${fertig}/${t.schritte.length} Schritte`),
      );
      knopf.addEventListener("click", () => oeffneTeil(t));
      nav.append(knopf);
    }
  }
}

// ---------- Bühne ----------
function checkbox(text: string, an: boolean, bei: (v: boolean) => void): HTMLLabelElement {
  const label = el("label", "achse");
  const box = el("input");
  box.type = "checkbox";
  box.checked = an;
  box.addEventListener("change", () => bei(box.checked));
  label.append(box, ` ${text}`);
  return label;
}

function renderRegler(): void {
  regler.replaceChildren();

  const achse = checkbox("Mittelachse zeigen", achseZeigen, (v) => {
    achseZeigen = v;
    zeichne();
  });

  if (teil === null) {
    const label = el("span", "ebenen-label");
    const slider = el("input");
    slider.type = "range";
    slider.min = "0";
    slider.max = String(maxY);
    slider.value = String(globalY);
    const aktualisiere = () => {
      label.textContent = nurSchnitt
        ? `Schnitt bei y = ${globalY}`
        : `Draufsicht bis Ebene y = ${globalY}`;
    };
    aktualisiere();
    slider.addEventListener("input", () => {
      globalY = Number(slider.value);
      auswahl = null;
      aktualisiere();
      zeichne();
      renderInfo();
      renderLegende();
    });
    const schnitt = checkbox("Nur diese Ebene (Schnitt)", nurSchnitt, (v) => {
      nurSchnitt = v;
      aktualisiere();
      zeichne();
      renderLegende();
    });
    regler.append(label, slider, schnitt, achse);
    return;
  }

  const anzahl = teil.ebenen.length;
  if (anzahl > 1) {
    const label = el("span", "ebenen-label");
    const slider = el("input");
    slider.type = "range";
    slider.min = "0";
    slider.max = String(anzahl - 1);
    slider.value = String(ebeneIndex);
    const aktualisiere = () => {
      if (!teil) return;
      label.textContent = `Ebene y = ${teil.position.y + teil.ebenen[ebeneIndex].y} (${ebeneIndex + 1} von ${anzahl})`;
    };
    aktualisiere();
    slider.addEventListener("input", () => {
      ebeneIndex = Number(slider.value);
      aktualisiere();
      zeichne();
      renderInfo();
      renderMaterial();
    });
    regler.append(label, slider, achse);
  } else {
    regler.append(
      el("span", "ebenen-label", `Ebene y = ${teil.position.y + teil.ebenen[0].y} (einzige Ebene)`),
      achse,
    );
  }
}

function zeichne(): void {
  const gitter = aktuellesGitter();
  const zeilen = gitter.length;
  const spalten = gitter[0].length;
  const z = Math.max(6, Math.min(28, Math.floor(640 / spalten)));
  zellenGroesse = z;
  const dpr = window.devicePixelRatio || 1;

  canvas.width = spalten * z * dpr;
  canvas.height = zeilen * z * dpr;
  canvas.style.width = `${spalten * z}px`;
  canvas.style.height = `${zeilen * z}px`;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  ctx.fillStyle = "#14161b";
  ctx.fillRect(0, 0, spalten * z, zeilen * z);

  const gesamtplan = teil === null;
  for (let r = 0; r < zeilen; r++) {
    for (let s = 0; s < spalten; s++) {
      const zelle = gitter[r][s];
      if (zelle.zeichen === LUFT) continue;
      ctx.fillStyle = projekt.palette[zelle.zeichen]?.farbe ?? "#ff00ff";
      ctx.fillRect(s * z, r * z, z, z);
      if (gesamtplan && !nurSchnitt && zelle.hoehe > 0) {
        // Höhere Blöcke etwas heller, damit man Mauern und Türme erkennt
        ctx.fillStyle = `rgba(255, 255, 255, ${Math.min(0.35, zelle.hoehe * 0.04)})`;
        ctx.fillRect(s * z, r * z, z, z);
      }
    }
  }

  if (z >= 8) {
    ctx.strokeStyle = "rgba(0, 0, 0, 0.3)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let s = 0; s <= spalten; s++) {
      ctx.moveTo(s * z + 0.5, 0);
      ctx.lineTo(s * z + 0.5, zeilen * z);
    }
    for (let r = 0; r <= zeilen; r++) {
      ctx.moveTo(0, r * z + 0.5);
      ctx.lineTo(spalten * z, r * z + 0.5);
    }
    ctx.stroke();
  }

  // Mittelachse x = 0
  const achseSpalte = teil === null ? -zone.grenzen.x : -teil.position.x;
  if (achseZeigen && achseSpalte >= 0 && achseSpalte < spalten) {
    const mitte = achseSpalte * z + z / 2;
    ctx.strokeStyle = "#ffd34d";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.moveTo(mitte, 0);
    ctx.lineTo(mitte, zeilen * z);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  if (auswahl) {
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 2;
    ctx.strokeRect(auswahl.spalte * z + 1, auswahl.reihe * z + 1, z - 2, z - 2);
  }
}

canvas.addEventListener("click", (e) => {
  const gitter = aktuellesGitter();
  const rechteck = canvas.getBoundingClientRect();
  const spalte = Math.floor((e.clientX - rechteck.left) / zellenGroesse);
  const reihe = Math.floor((e.clientY - rechteck.top) / zellenGroesse);
  if (reihe < 0 || reihe >= gitter.length) return;
  if (spalte < 0 || spalte >= gitter[0].length) return;
  auswahl = { spalte, reihe };
  zeichne();
  renderInfo();
});

function renderInfo(): void {
  infoBox.replaceChildren();
  if (!auswahl) {
    infoBox.append(el("p", "hinweis", "Klicke auf ein Feld, um Details zu sehen."));
    return;
  }
  const gitter = aktuellesGitter();
  const zelle = gitter[auswahl.reihe][auswahl.spalte];
  const eintrag = zelle.zeichen === LUFT ? undefined : projekt.palette[zelle.zeichen];

  const ursprung = teil === null ? zone.grenzen : teil.position;
  const x = ursprung.x + auswahl.spalte;
  const zKoord = ursprung.z + auswahl.reihe;

  infoBox.append(
    el("h3", undefined, eintrag ? `${eintrag.name} (${eintrag.block})` : "Luft: hier bleibt es leer"),
    el("p", undefined, `Position relativ zum Ursprung: x ${x}, y ${zelle.hoehe}, z ${zKoord}`),
  );

  if (teil === null) {
    if (zelle.teil) {
      const t = zelle.teil;
      const knopf = el("button", "link", `Teil öffnen: ${t.name}`);
      knopf.addEventListener("click", () => oeffneTeil(t, zelle.hoehe));
      infoBox.append(el("p", undefined, `Gehört zu: ${t.name} (Phase ${t.phase})`), knopf);
    }
  } else {
    infoBox.append(
      el("p", undefined, `Im Raster: Reihe ${auswahl.reihe + 1} von Norden, Spalte ${auswahl.spalte + 1} von Westen`),
    );
  }
}

function renderLegende(): void {
  legende.replaceChildren();
  const benutzt = new Set<string>();
  for (const reihe of aktuellesGitter()) for (const z of reihe) if (z.zeichen !== LUFT) benutzt.add(z.zeichen);
  for (const zeichen of benutzt) {
    const eintrag = projekt.palette[zeichen];
    if (!eintrag) continue;
    const zeile = el("div", "legende-zeile");
    const farbe = el("span", "farbe");
    farbe.style.background = eintrag.farbe;
    zeile.append(farbe, el("span", undefined, `${zeichen} = ${eintrag.block}`));
    legende.append(zeile);
  }
}

// ---------- Seitenleiste ----------
function renderBeschreibung(): void {
  if (teil === null) {
    beschreibungBox.replaceChildren(el("h2", undefined, `${zone.name}: Gesamtplan`), el("p", undefined, zone.beschreibung));
    return;
  }
  const phase = zone.phasen.find((p) => p.nr === teil?.phase);
  beschreibungBox.replaceChildren(
    el("h2", undefined, teil.name),
    el("p", "klein", phase ? `Phase ${phase.nr}: ${phase.name}` : ""),
    el("p", undefined, teil.beschreibung),
    el("p", "klein", zone.beschreibung),
  );
}

function tabelle(kopfTexte: string[], zeilen: string[][], fussZeile?: string[]): HTMLTableElement {
  const t = el("table");
  const kopfZeile = el("tr");
  for (const k of kopfTexte) kopfZeile.append(el("th", undefined, k));
  t.append(kopfZeile);
  for (const z of zeilen) {
    const tr = el("tr");
    for (const zelle of z) tr.append(el("td", undefined, zelle));
    t.append(tr);
  }
  if (fussZeile) {
    const tr = el("tr", "summe");
    for (const zelle of fussZeile) tr.append(el("td", undefined, zelle));
    t.append(tr);
  }
  return t;
}

function mengeText(n: number): string {
  return n >= STACK ? `${n} (${stacks(n)})` : String(n);
}

function renderMaterial(): void {
  materialBox.replaceChildren(el("h3", undefined, teil === null ? "Gesamt-Materialliste" : "Materialliste"));

  if (teil === null) {
    const gesamt = new Map<string, number>();
    for (const t of zone.teile) {
      for (const [z, n] of materialVon(t)) gesamt.set(z, (gesamt.get(z) ?? 0) + n);
    }
    const sortiert = [...gesamt.entries()].sort((a, b) => b[1] - a[1]);
    materialBox.append(
      tabelle(
        ["Block", "Gesamt"],
        sortiert.map(([z, n]) => [projekt.palette[z]?.block ?? z, mengeText(n)]),
        ["Summe", String(summe(gesamt))],
      ),
    );
    return;
  }

  const gesamt = materialVon(teil);
  const dieseEbene = zaehleRaster(teil.ebenen[ebeneIndex].raster);
  const sortiert = [...gesamt.entries()].sort((a, b) => b[1] - a[1]);
  materialBox.append(
    tabelle(
      ["Block", "Diese Ebene", "Gesamt"],
      sortiert.map(([z, n]) => [projekt.palette[z]?.block ?? z, String(dieseEbene.get(z) ?? 0), mengeText(n)]),
      ["Summe", "", String(summe(gesamt))],
    ),
  );
}

function renderSchritte(): void {
  if (teil === null) {
    schritteBox.replaceChildren(el("h3", undefined, "Bauphasen"));
    for (const p of zone.phasen) {
      const block = el("div", "phase");
      block.append(el("h4", undefined, `Phase ${p.nr}: ${p.name}`), el("p", "klein", p.beschreibung));
      const liste = el("ul");
      for (const t of zone.teile.filter((x) => x.phase === p.nr)) {
        const punkt = el("li");
        const knopf = el("button", "link", t.name);
        knopf.addEventListener("click", () => oeffneTeil(t));
        const fertig = ladeHaken(t).filter(Boolean).length;
        punkt.append(knopf, el("span", "klein", ` ${summe(materialVon(t))} Blöcke, ${fertig}/${t.schritte.length} Schritte`));
        liste.append(punkt);
      }
      block.append(liste);
      schritteBox.append(block);
    }
    return;
  }

  const t = teil;
  schritteBox.replaceChildren(el("h3", undefined, "Bauanleitung"));
  const haken = ladeHaken(t);
  const liste = el("ol");
  t.schritte.forEach((text, i) => {
    const punkt = el("li");
    const label = el("label");
    const box = el("input");
    box.type = "checkbox";
    box.checked = haken[i];
    box.addEventListener("change", () => {
      haken[i] = box.checked;
      speichereHaken(t, haken);
      renderNav();
      punkt.classList.toggle("fertig", box.checked);
    });
    punkt.classList.toggle("fertig", haken[i]);
    label.append(box, " ", text);
    punkt.append(label);
    liste.append(punkt);
  });
  schritteBox.append(liste);
}

// ---------- Alles neu zeichnen ----------
function alles(): void {
  renderNav();
  renderRegler();
  zeichne();
  renderInfo();
  renderLegende();
  renderBeschreibung();
  renderMaterial();
  renderSchritte();
}

alles();
