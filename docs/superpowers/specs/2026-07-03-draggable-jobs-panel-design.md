# Bewegliches Jobs-Fenster — Design

**Datum:** 2026-07-03
**Status:** Genehmigt (Umfang: nur Jobs-Panel; Position wird beim Schließen zurückgesetzt)

## Ziel

Das Jobs-Panel (`JobProgress.tsx`) soll per Drag am Header frei verschiebbar sein,
damit es die darunterliegende Filterleiste und Dokumentliste nicht verdeckt.

## Entscheidungen

- **Umfang:** Nur das Jobs-Panel. Die Drag-Logik liegt in einem wiederverwendbaren
  Hook, sodass „Gespeicherte Suchen" und „Statistiken" später in je ~2 Zeilen
  nachziehen können.
- **Persistenz:** Keine. Das Panel unmountet beim Schließen (`activeDropdown`-State
  in AppShell), der Offset ist beim nächsten Öffnen automatisch zurückgesetzt.
- **Kein neues Package:** Eigenbau (~40 Zeilen) statt react-draggable/dnd-kit.

## Komponenten

### `frontend/src/hooks/useDraggable.ts` (neu)

Hook mit folgender Schnittstelle:

- `panelRef` — Ref für das zu verschiebende Element (zum Messen fürs Clamping).
- `handleProps` — Pointer-Event-Handler (`onPointerDown/Move/Up/Cancel`) für den Griff.
- `style` — `{ transform: translate(x, y) }` für das Panel.
- `dragging` — boolean für Cursor-Styling.

Verhalten:

- Pointer Events mit `setPointerCapture` auf dem Griff (deckt Maus, Touch, Stift ab;
  keine globalen Listener, kein Cleanup-Risiko).
- Drags, die auf interaktiven Elementen starten (`closest('button, a, input,
  select, textarea')`), werden ignoriert — Header-Buttons bleiben klickbar.
- **Clamping:** horizontal bleibt das Panel vollständig im Viewport (min. 8 px Rand);
  vertikal bleibt der Header greifbar: Oberkante ≥ 60 px (unterhalb der fixen
  Navbar, h-14 = 56 px) und ≤ Viewport-Höhe − 48 px.

### `frontend/src/components/JobProgress.tsx` (Änderung)

- Root-Div: `ref={panelRef}`, `style={style}`.
- Header-Zeile: `{...handleProps}`, `cursor-grab select-none touch-none`,
  während des Drags `cursor-grabbing`.

## Verifikation

Kein Frontend-Test-Framework vorhanden → End-to-End per Headless-Edge/CDP:

1. Panel öffnen, Drag am Header simulieren (`Input.dispatchMouseEvent`),
   Position vorher/nachher via `getBoundingClientRect` + Screenshot.
2. Gegenproben: Header-Buttons (Aktualisieren/Schließen) bleiben klickbar;
   Panel lässt sich nicht aus dem Viewport ziehen; nach Schließen/Öffnen
   steht es wieder an der Standardposition.
