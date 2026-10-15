import "./style.css";
import type { Projekt, Teil, Zone } from "./data/types";
import daten from "./data/innenhof.json";

const projekt = daten as Projekt;
const LUFT = ".";
const STACK = 64;

// ---------- Zustand ----------
let zone: Zone = projekt.zonen[0];
let teil: Teil = zone.teile[0];
let ebeneIndex = 0;
let auswahl: { spalte: number; reihe: number } | null = null;
let achseZeigen = true;
let zellenGroesse = 14;

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

function zaehle(raster: string[]): Map<string, number> {
  const m = new Map<string, number>();
  for (const zeile of raster) {
    for (const z of zeile) {
      if (z !== LUFT) m.set(z, (m.get(z) ?? 0) + 1);
    }
  }
  return m;
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

// Bühne: Regler, Canvas, Auswahl-Info, Legende
const regler = el("div", "regler");
const canvas = el("canvas", "raster");
const infoBox = el("div", "info");
const legende = el("div", "legende");
buehne.append(regler, canvas, infoBox, legende);

// ---------- Navigation ----------
function renderNav(): void {
  nav.replaceChildren();
  nav.append(el("h2", undefined, zone.name));
  for (const t of zone.teile) {
    const haken = ladeHaken(t);
    const fertig = haken.filter(Boolean).length;
    const knopf = el("button", t === teil ? "teil aktiv" : "teil");
    knopf.append(
      el("span", "teil-name", t.name),
      el("span", "teil-fortschritt", `${fertig}/${t.schritte.length} Schritte`),
    );
    knopf.addEventListener("click", () => {
      teil = t;
      ebeneIndex = 0;
      auswahl = null;
      alles();
    });
    nav.append(knopf);
  }
}

// ---------- Bühne ----------
function renderRegler(): void {
  regler.replaceChildren();
  const anzahl = teil.ebenen.length;

  const achse = el("label", "achse");
  const box = el("input");
  box.type = "checkbox";
  box.checked = achseZeigen;
  box.addEventListener("change", () => {
    achseZeigen = box.checked;
    zeichne();
  });
  achse.append(box, " Mittelachse zeigen");

  if (anzahl > 1) {
    const label = el("span", "ebenen-label");
    const slider = el("input");
    slider.type = "range";
    slider.min = "0";
    slider.max = String(anzahl - 1);
    slider.value = String(ebeneIndex);
    const aktualisiereLabel = () => {
      label.textContent = `Ebene y = ${teil.ebenen[ebeneIndex].y} (${ebeneIndex + 1} von ${anzahl})`;
    };
    aktualisiereLabel();
    slider.addEventListener("input", () => {
      ebeneIndex = Number(slider.value);
      aktualisiereLabel();
      zeichne();
      renderInfo();
      renderMaterial();
    });
    regler.append(label, slider, achse);
  } else {
    regler.append(el("span", "ebenen-label", `Ebene y = ${teil.ebenen[0].y} (einzige Ebene)`), achse);
  }
}

function zeichne(): void {
  const ebene = teil.ebenen[ebeneIndex];
  const zeilen = ebene.raster.length;
  const spalten = ebene.raster[0].length;
  zellenGroesse = Math.max(6, Math.min(28, Math.floor(640 / spalten)));
  const z = zellenGroesse;
  const dpr = window.devicePixelRatio || 1;

  canvas.width = spalten * z * dpr;
  canvas.height = zeilen * z * dpr;
  canvas.style.width = `${spalten * z}px`;
  canvas.style.height = `${zeilen * z}px`;

  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.scale(dpr, dpr);

  ctx.fillStyle = "#14161b";
  ctx.fillRect(0, 0, spalten * z, zeilen * z);

  for (let r = 0; r < zeilen; r++) {
    for (let s = 0; s < spalten; s++) {
      const zeichen = ebene.raster[r][s];
      if (zeichen === LUFT) continue;
      ctx.fillStyle = projekt.palette[zeichen]?.farbe ?? "#ff00ff";
      ctx.fillRect(s * z, r * z, z, z);
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

  if (achseZeigen && spalten % 2 === 1) {
    const mitte = ((spalten - 1) / 2) * z + z / 2;
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
  const ebene = teil.ebenen[ebeneIndex];
  const rechteck = canvas.getBoundingClientRect();
  const spalte = Math.floor((e.clientX - rechteck.left) / zellenGroesse);
  const reihe = Math.floor((e.clientY - rechteck.top) / zellenGroesse);
  if (reihe < 0 || reihe >= ebene.raster.length) return;
  if (spalte < 0 || spalte >= ebene.raster[0].length) return;
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
  const ebene = teil.ebenen[ebeneIndex];
  const zeichen = ebene.raster[auswahl.reihe][auswahl.spalte];
  const eintrag = zeichen === LUFT ? undefined : projekt.palette[zeichen];

  const titel = eintrag
    ? `${eintrag.name} (${eintrag.block})`
    : "Luft: hier bleibt es leer";
  const x = teil.position.x + auswahl.spalte;
  const y = teil.position.y + ebene.y;
  const zKoord = teil.position.z + auswahl.reihe;

  infoBox.append(
    el("h3", undefined, titel),
    el("p", undefined, `Position relativ zum Ursprung: x ${x}, y ${y}, z ${zKoord}`),
    el("p", undefined, `Im Raster: Reihe ${auswahl.reihe + 1} von Norden, Spalte ${auswahl.spalte + 1} von Westen`),
  );
}

function renderLegende(): void {
  legende.replaceChildren();
  const benutzt = new Set<string>();
  for (const e of teil.ebenen) for (const z of zaehle(e.raster).keys()) benutzt.add(z);
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
const beschreibungBox = el("div", "beschreibung");
const materialBox = el("div", "material");
const schritteBox = el("div", "schritte");
seite.append(beschreibungBox, materialBox, schritteBox);

function renderBeschreibung(): void {
  beschreibungBox.replaceChildren(
    el("h2", undefined, teil.name),
    el("p", undefined, teil.beschreibung),
    el("p", "klein", zone.beschreibung),
  );
}

function renderMaterial(): void {
  materialBox.replaceChildren(el("h3", undefined, "Materialliste"));
  const gesamt = new Map<string, number>();
  for (const e of teil.ebenen) {
    for (const [z, n] of zaehle(e.raster)) gesamt.set(z, (gesamt.get(z) ?? 0) + n);
  }
  const dieseEbene = zaehle(teil.ebenen[ebeneIndex].raster);

  const tabelle = el("table");
  const kopfZeile = el("tr");
  for (const t of ["Block", "Diese Ebene", "Gesamt"]) kopfZeile.append(el("th", undefined, t));
  tabelle.append(kopfZeile);

  const sortiert = [...gesamt.entries()].sort((a, b) => b[1] - a[1]);
  let summe = 0;
  for (const [zeichen, n] of sortiert) {
    summe += n;
    const zeile = el("tr");
    zeile.append(
      el("td", undefined, projekt.palette[zeichen]?.block ?? zeichen),
      el("td", undefined, String(dieseEbene.get(zeichen) ?? 0)),
      el("td", undefined, n >= STACK ? `${n} (${stacks(n)})` : String(n)),
    );
    tabelle.append(zeile);
  }
  const fuss = el("tr", "summe");
  fuss.append(el("td", undefined, "Summe"), el("td"), el("td", undefined, String(summe)));
  tabelle.append(fuss);
  materialBox.append(tabelle);
}

function renderSchritte(): void {
  schritteBox.replaceChildren(el("h3", undefined, "Bauanleitung"));
  const haken = ladeHaken(teil);
  const liste = el("ol");
  teil.schritte.forEach((text, i) => {
    const punkt = el("li");
    const label = el("label");
    const box = el("input");
    box.type = "checkbox";
    box.checked = haken[i];
    box.addEventListener("change", () => {
      haken[i] = box.checked;
      speichereHaken(teil, haken);
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
