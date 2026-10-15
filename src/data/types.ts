// Datenformat des Bauplans. Die Daten selbst stehen in den JSON-Dateien.

export interface PaletteEintrag {
  block: string; // Minecraft-ID, z. B. "red_concrete"
  name: string; // Anzeigename
  farbe: string; // Farbe im Viewer, z. B. "#a02020"
  ohneMaterial?: boolean; // true = zählt nicht in die Materialliste (z. B. vorhandenes Gelände)
}

export interface Ebene {
  y: number; // Höhe relativ zum Teil (0 = unterste Ebene)
  raster: string[]; // Zeilen von Norden nach Süden, Zeichen von Westen nach Osten. "." = Luft
}

export interface Teil {
  id: string;
  name: string;
  phase: number; // Nummer der Bauphase
  beschreibung: string;
  // Obere linke (nordwestliche) Ecke des Rasters, relativ zum Ursprung der Zone
  position: { x: number; y: number; z: number };
  ebenen: Ebene[];
  schritte: string[];
}

export interface Phase {
  nr: number;
  name: string;
  beschreibung: string;
}

export interface Zone {
  id: string;
  name: string;
  beschreibung: string;
  // Rechteck der Zone: obere linke Ecke (x, z), Breite in x, Länge in z
  grenzen: { x: number; z: number; breite: number; laenge: number };
  phasen: Phase[];
  teile: Teil[];
}

export interface Projekt {
  name: string;
  palette: Record<string, PaletteEintrag>;
  zonen: Zone[];
}
