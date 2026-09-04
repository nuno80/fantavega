import fs from "node:fs";
import path from "node:path";
import * as XLSX from "xlsx";

const source = process.argv[2];
const destination =
  process.argv[3] ?? "public/fantacalcio-statistico-2027.html";

if (!source) {
  throw new Error(
    "Uso: node scripts/generate-fantacalcio-dashboard.mjs <file.xlsx> [output.html]"
  );
}

const stripSymbols = (value) =>
  String(value ?? "")
    .replace(/[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\uFE0F]/gu, "")
    .replace(/\s+/g, " ")
    .trim();

const strategyLabels = new Map([
  ["\u2B50", "Stella"],
  ["\uD83E\uDE99", "Moneta"],
  ["\uD83D\uDD0D", "Osservato"],
  ["\u267E\uFE0F", "Continuità"],
  ["\u267E\uFE0F\uD83E\uDE99", "Continuità / Moneta"],
  ["\u267E\uFE0F\u2B50", "Continuità / Stella"],
]);

const shortLabels = {
  A: "Giocatore",
  B: "Mantra",
  C: "Valore 10",
  D: "Valore Mantra",
  E: "Bonus doppio ruolo",
  F: "Prezzo Mantra 10",
  G: "Offerta 8 · No MOD",
  H: "Offerta 8 · MOD 3F",
  I: "Offerta 8 · MOD 6F",
  J: "Valore 8",
  K: "Offerta 10 · No MOD",
  L: "Offerta 10 · MOD 3F",
  M: "Offerta 10 · MOD 6F",
  N: "Valore 10",
  O: "Offerta 12 · No MOD",
  P: "Offerta 12 · MOD 3F",
  Q: "Offerta 12 · MOD 6F",
  R: "Valore 12",
  S: "Squadra",
  T: "Squadra 25/26",
  U: "Ruolo",
  V: "Profilo",
  W: "Strategia",
  X: "Tag",
  Y: "Note squadra",
  Z: "Condizione",
  AA: "Note giocatore",
  AB: "Commento creator",
  AC: "Hype",
  AD: "Offerta min",
  AE: "Offerta max",
  AF: "Rischio rendimento",
  AG: "Rischio titolarità",
  AH: "Rischio infortuni",
  AI: "Svalutazione 8",
  AJ: "Svalutazione 10",
  AK: "Svalutazione 12",
  AL: "Bonus/Malus Z · 8",
  AM: "Bonus/Malus Z · 10",
  AN: "Bonus/Malus Z · Mantra",
  AO: "Bonus/Malus Z · 12",
  AP: "Accentramento 8",
  AQ: "Accentramento 10",
  AR: "Accentramento Mantra",
  AS: "Accentramento 12",
  AT: "Rischio titolarità FL",
  AU: "Rischio rendimento FL",
  AV: "Voto atteso %",
  AW: "Infortunio %",
  AX: "Partite in rosa",
  AY: "Presenze",
  AZ: "Da titolare",
  BA: "Minuti",
  BB: "Partite con voto %",
  BC: "Titolarità %",
  BD: "Ammonizioni",
  BE: "Espulsioni",
  BF: "FM attesa · min",
  BG: "FM attesa",
  BH: "FM attesa · max",
  BI: "FM Galton",
  BJ: "FM 25/26",
  BK: "Gol",
  BL: "xG",
  BM: "Assist",
  BN: "xA",
  BO: "Bonus %",
  BP: "Bonus-malus",
  BQ: "Bonus MOD · 6F",
  BR: "Bonus MOD · 3F",
  BS: "D Factor",
  BT: "MVA 2027",
  BU: "MV 25/26",
  BV: "Voti ≥ 6 %",
  BW: "Tiri in porta/p",
  BX: "Occasioni create/p",
  BY: "Passaggi chiave/p",
  BZ: "Cross riusciti %",
  CA: "Dribbling riusciti %",
  CB: "Passaggi riusciti %",
  CC: "Palle perse/p",
  CD: "Errori da gol",
  CE: "Contrasti vinti",
  CF: "Intercetti",
  CG: "Recuperi/p",
  CH: "Spazzate/p",
  CI: "Duelli vinti/p",
  CJ: "Duelli aerei/p",
  CK: "Bonus clean sheet",
  CL: "Clean sheet attesi",
  CM: "Parate",
  CN: "Salvataggi/p",
  CO: "Gol subiti",
  CP: "Clean sheet",
  CQ: "Valore 10 · MOD 6F",
  CR: "Valore 10 · MOD 3F",
  CS: "Offerta 10 · MOD 6F",
  CT: "Offerta 10 · MOD 3F",
};

const workbook = XLSX.read(fs.readFileSync(source), {
  type: "buffer",
  cellDates: true,
  cellFormula: true,
  cellNF: true,
});
const sheet = workbook.Sheets.Tutti;
if (!sheet) throw new Error('Il workbook non contiene il foglio "Tutti".');

let currentGroup = "Anagrafica e valori principali";
const columns = [];
for (let columnIndex = 0; columnIndex < 98; columnIndex += 1) {
  const letter = XLSX.utils.encode_col(columnIndex);
  const groupValue = sheet[letter + "2"]?.v;
  if (groupValue) currentGroup = stripSymbols(groupValue);
  const label = stripSymbols(sheet[letter + "3"]?.v || letter);
  let numberFormat = "";
  for (let row = 4; row <= 526 && !numberFormat; row += 1) {
    const cell = sheet[letter + row];
    if (cell?.t === "n" && cell.z) numberFormat = cell.z;
  }
  columns.push({
    id: letter,
    index: columnIndex,
    label,
    shortLabel: shortLabels[letter] ?? label,
    group: currentGroup,
    percentFormat: numberFormat.includes("%"),
    percentLabel: label.includes("%"),
  });
}

const conditionFrom = (value) => {
  const text = String(value ?? "");
  if (text.includes("\uD83D\uDFE9")) return "verde";
  if (text.includes("\uD83D\uDFE8")) return "gialla";
  if (text.includes("\uD83D\uDFE7")) return "arancione";
  if (text.includes("\uD83D\uDFE5")) return "rossa";
  return "non disponibile";
};

const normalizeCell = (cell, columnIndex) => {
  if (!cell || cell.t === "e" || cell.v === undefined || cell.v === null) {
    return null;
  }
  if (cell.v instanceof Date) return cell.v.toISOString().slice(0, 10);
  if (typeof cell.v === "number" || typeof cell.v === "boolean") return cell.v;
  const original = String(cell.v).trim();
  if (columnIndex === 22 && strategyLabels.has(original)) {
    return strategyLabels.get(original);
  }
  return stripSymbols(original);
};

const players = [];
for (let row = 4; row <= 526; row += 1) {
  if (!sheet["A" + row]?.v) continue;
  players.push({
    row,
    condition: conditionFrom(sheet["Z" + row]?.v),
    values: columns.map((column) =>
      normalizeCell(sheet[column.id + row], column.index)
    ),
  });
}

const teams = [
  ...new Set(players.map((player) => player.values[18]).filter(Boolean)),
].sort((a, b) => String(a).localeCompare(String(b), "it"));
const mantraRoles = [
  ...new Set(players.map((player) => player.values[1]).filter(Boolean)),
].sort((a, b) => String(a).localeCompare(String(b), "it"));

const payload = JSON.stringify({ columns, players, teams, mantraRoles })
  .replaceAll("<", "\\u003c")
  .replaceAll("\u2028", "\\u2028")
  .replaceAll("\u2029", "\\u2029");

const html = `<!doctype html>
<html lang="it">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta name="description" content="Dashboard interattiva delle statistiche Fantacalcio 2027">
  <title>Fantacalcio Statistico 2027</title>
  <style>
    :root {
      color-scheme: light;
      --bg:#f3f4f0;--surface:#fbfcf8;--surface-2:#e9ece6;--text:#20251f;
      --muted:#667066;--line:#d4d9d1;--accent:#247153;--accent-2:#18553e;
      --accent-soft:#dcece4;--warning:#9b651f;--danger:#a7463d;
      --shadow:0 18px 50px rgba(38,48,39,.12);
      font-family:Geist,"Segoe UI",Arial,sans-serif;
    }
    :root[data-theme="dark"] {
      color-scheme:dark;--bg:#181c19;--surface:#202622;--surface-2:#29312b;
      --text:#edf1ec;--muted:#a8b2aa;--line:#39423b;--accent:#62b18e;
      --accent-2:#7dc4a5;--accent-soft:#243e32;--warning:#d5a45d;
      --danger:#e08478;--shadow:0 18px 50px rgba(7,10,8,.32);
    }
    *{box-sizing:border-box}html{scroll-behavior:smooth}
    body{margin:0;background:var(--bg);color:var(--text);min-width:320px}
    button,input,select{font:inherit;color:inherit}button{cursor:pointer}
    button:active{transform:translateY(1px)}
    :focus-visible{outline:3px solid color-mix(in srgb,var(--accent),transparent 55%);outline-offset:2px}
    .shell{max-width:1600px;margin:auto;padding:0 28px 64px}
    .topbar{position:sticky;top:0;z-index:20;backdrop-filter:blur(18px);background:color-mix(in srgb,var(--bg),transparent 10%);border-bottom:1px solid var(--line)}
    .topbar-inner{max-width:1600px;margin:auto;padding:14px 28px;display:flex;align-items:center;justify-content:space-between;gap:16px}
    .brand{display:flex;align-items:center;gap:12px;min-width:0}.brand-mark{width:34px;height:34px;border-radius:10px;display:grid;place-items:center;background:var(--accent);color:var(--surface);box-shadow:inset 0 1px rgba(255,255,255,.2)}
    .brand-mark svg{width:18px}.brand-name{font-weight:700;letter-spacing:-.03em}.source-note{color:var(--muted);font-size:12px}
    .icon-button{width:38px;height:38px;border:1px solid var(--line);border-radius:11px;background:var(--surface);display:grid;place-items:center;transition:.18s ease}
    .icon-button svg{width:17px;height:17px}.icon-button:hover{border-color:var(--accent);background:var(--accent-soft)}
    .hero{display:grid;grid-template-columns:minmax(0,1.5fr) minmax(240px,.5fr);gap:48px;align-items:end;padding:62px 0 34px;border-bottom:1px solid var(--line)}
    .eyebrow{color:var(--accent);font-size:12px;font-weight:700;letter-spacing:.15em;text-transform:uppercase}
    h1{margin:12px 0 14px;max-width:780px;font-size:clamp(34px,5vw,64px);line-height:.98;letter-spacing:-.055em;font-weight:650}
    .hero p{margin:0;max-width:700px;color:var(--muted);font-size:16px;line-height:1.6}
    .hero-meta{display:grid;grid-template-columns:1fr 1fr;border-top:1px solid var(--line)}
    .hero-stat{padding:16px 0 0}.hero-stat+ .hero-stat{padding-left:22px;border-left:1px solid var(--line)}
    .hero-stat strong{display:block;font:600 27px "Geist Mono",Consolas,monospace;letter-spacing:-.04em}.hero-stat span{color:var(--muted);font-size:12px}
    .workspace{display:grid;grid-template-columns:270px minmax(0,1fr);gap:34px;padding-top:30px;align-items:start}
    .filters{position:sticky;top:82px;border-top:3px solid var(--text)}
    .filter-heading{display:flex;justify-content:space-between;align-items:center;padding:14px 0 10px}.filter-heading h2{margin:0;font-size:15px}
    .text-button{border:0;background:transparent;color:var(--accent);padding:6px 0;font-size:12px;font-weight:700}
    .filter-group{padding:14px 0;border-top:1px solid var(--line)}
    .filter-group label,.filter-label{display:block;margin-bottom:7px;font-size:12px;color:var(--muted);font-weight:650}
    .field,.select{width:100%;border:1px solid var(--line);background:var(--surface);border-radius:10px;padding:10px 11px;min-height:42px}
    .field::placeholder{color:var(--muted)}.field-row{display:grid;grid-template-columns:1fr 1fr;gap:8px}
    .role-options{display:grid;grid-template-columns:repeat(4,1fr);gap:6px}.role-option input{position:absolute;opacity:0;pointer-events:none}
    .role-option span{min-height:39px;display:grid;place-items:center;border:1px solid var(--line);border-radius:10px;background:var(--surface);font:650 12px "Geist Mono",Consolas,monospace}
    .role-option input:checked+span{color:var(--surface);background:var(--text);border-color:var(--text)}
    .check-row{display:flex!important;gap:10px;align-items:flex-start;font-size:13px!important;line-height:1.35;color:var(--text)!important}.check-row input{margin:2px 0 0;accent-color:var(--accent)}
    .advanced-builder{display:grid;gap:8px}.advanced-list{display:grid;gap:6px;margin-top:10px}.advanced-chip{display:grid;grid-template-columns:1fr auto;gap:8px;align-items:center;padding:8px 9px;border-left:3px solid var(--accent);background:var(--accent-soft);font-size:11px;line-height:1.35}.advanced-chip button{border:0;background:transparent;color:var(--accent-2);font-weight:700;padding:3px}
    .content{min-width:0}.metric-strip{display:grid;grid-template-columns:1fr 1fr 1.4fr;border-top:3px solid var(--text);border-bottom:1px solid var(--line)}
    .metric{padding:15px 18px 16px 0}.metric+.metric{padding-left:18px;border-left:1px solid var(--line)}
    .metric-label{display:block;color:var(--muted);font-size:11px;text-transform:uppercase;letter-spacing:.08em}
    .metric-value{display:block;margin-top:7px;font:600 23px "Geist Mono",Consolas,monospace;letter-spacing:-.04em;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .metric-detail{display:block;color:var(--muted);font-size:11px;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .toolbar{display:flex;align-items:center;justify-content:space-between;gap:12px;flex-wrap:wrap;padding:20px 0 14px}
    .result-copy{color:var(--muted);font-size:13px}.result-copy strong{color:var(--text)}.actions{display:flex;gap:8px;flex-wrap:wrap}
    .button{display:inline-flex;align-items:center;justify-content:center;gap:8px;min-height:39px;border:1px solid var(--line);border-radius:10px;padding:8px 12px;background:var(--surface);font-size:12px;font-weight:700;transition:.18s ease}
    .button:hover{border-color:var(--accent);background:var(--accent-soft)}.button svg{width:15px}.button.primary{background:var(--accent);border-color:var(--accent);color:#f7fbf8}
    .table-wrap{overflow-x:auto;border-block:1px solid var(--line);background:var(--surface)}
    table{width:100%;border-collapse:collapse;font-size:12px}th,td{padding:12px 13px;border-bottom:1px solid var(--line);text-align:left;vertical-align:middle}
    th{background:var(--surface-2);color:var(--muted);font-size:10px;letter-spacing:.07em;text-transform:uppercase;white-space:nowrap}
    th button{border:0;background:transparent;color:inherit;padding:0;text-transform:inherit;font:inherit;letter-spacing:inherit}
    tbody tr{transition:background .16s ease}tbody tr:hover{background:var(--accent-soft)}tbody tr:last-child td{border-bottom:0}
    td:first-child{font-weight:700;min-width:155px}td.numeric{font-family:"Geist Mono",Consolas,monospace;font-variant-numeric:tabular-nums;text-align:right;white-space:nowrap}
    .player-link{border:0;background:transparent;padding:0;color:var(--text);font-weight:700;text-align:left}.player-link:hover{color:var(--accent);text-decoration:underline;text-underline-offset:3px}
    .tag{display:inline-flex;align-items:center;min-height:24px;padding:3px 8px;border-radius:999px;background:var(--surface-2);white-space:nowrap}
    .pagination{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:15px 0;color:var(--muted);font-size:12px}.page-controls{display:flex;align-items:center;gap:8px}
    .page-button{width:36px;height:36px;display:grid;place-items:center;border:1px solid var(--line);border-radius:10px;background:var(--surface)}.page-button:disabled{opacity:.4;cursor:not-allowed}
    .empty,.error,.loading{min-height:320px;display:none;place-items:center;text-align:center;border-block:1px solid var(--line)}
    .empty-inner{max-width:390px;padding:48px 24px}.empty h3,.error h3{margin:0 0 9px;font-size:20px;letter-spacing:-.03em}.empty p,.error p{margin:0 0 18px;color:var(--muted);line-height:1.5}
    .is-empty .empty{display:grid}.is-empty .table-wrap,.is-empty .pagination{display:none}.has-error .error{display:grid}.has-error .dashboard-ready{display:none}.is-loading .loading{display:grid}.is-loading .dashboard-ready{display:none}
    .skeleton{width:min(100%,640px);padding:24px}.skeleton-line{height:14px;margin:12px 0;border-radius:5px;background:linear-gradient(90deg,var(--surface-2),var(--line),var(--surface-2));background-size:200%;animation:shimmer 1.3s infinite}.skeleton-line:nth-child(2){width:72%}.skeleton-line:nth-child(3){width:88%}@keyframes shimmer{to{background-position:-200%}}
    dialog{width:min(920px,calc(100% - 28px));max-height:min(86dvh,900px);padding:0;border:1px solid var(--line);border-radius:18px;background:var(--surface);color:var(--text);box-shadow:var(--shadow)}
    dialog::backdrop{background:rgba(18,23,19,.54);backdrop-filter:blur(3px)}.dialog-head{position:sticky;top:0;z-index:2;display:flex;align-items:flex-start;justify-content:space-between;gap:20px;padding:22px 24px;border-bottom:1px solid var(--line);background:var(--surface)}
    .dialog-head h2{margin:0;font-size:25px;letter-spacing:-.04em}.dialog-head p{margin:5px 0 0;color:var(--muted);font-size:12px}.dialog-body{padding:22px 24px 30px}
    .dialog-tools{display:flex;gap:12px;align-items:end;flex-wrap:wrap;margin-bottom:22px}.search-block{flex:1 1 250px}
    .detail-group{margin-bottom:28px}.detail-group h3{margin:0;padding-bottom:9px;border-bottom:2px solid var(--text);font-size:13px}.detail-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr))}
    .detail-item{min-width:0;padding:11px 12px 11px 0;border-bottom:1px solid var(--line)}.detail-item:nth-child(even){padding-left:12px;border-left:1px solid var(--line)}
    .detail-label{display:block;color:var(--muted);font-size:10px;letter-spacing:.04em;text-transform:uppercase}.detail-value{display:block;margin-top:5px;line-height:1.45;overflow-wrap:anywhere}.detail-value.numeric{font-family:"Geist Mono",Consolas,monospace}
    .column-groups{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:24px 34px}.column-group h3{margin:0 0 10px;font-size:13px}.column-list{display:grid;gap:8px}.column-option{display:grid;grid-template-columns:auto 1fr;gap:9px;align-items:start;font-size:12px;line-height:1.35}.column-option input{margin-top:2px;accent-color:var(--accent)}
    @media(max-width:950px){.hero{grid-template-columns:1fr;gap:28px}.hero-meta{max-width:440px}.workspace{grid-template-columns:1fr}.filters{position:static}.filters-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:0 18px}.filter-heading{grid-column:1/-1}}
    @media(max-width:680px){.shell{padding:0 16px 42px}.topbar-inner{padding:11px 16px}.source-note{display:none}.hero{padding:38px 0 26px}h1{font-size:40px}.filters-grid{grid-template-columns:1fr}.metric-strip{grid-template-columns:1fr 1fr}.metric:nth-child(3){grid-column:1/-1;padding-left:0;border-left:0;border-top:1px solid var(--line)}.actions{width:100%}.actions .button{flex:1}.pagination{align-items:flex-start;flex-direction:column}.detail-grid,.column-groups{grid-template-columns:1fr}.detail-item:nth-child(even){padding-left:0;border-left:0}.dialog-head,.dialog-body{padding-left:17px;padding-right:17px}}
    @media(prefers-reduced-motion:reduce){*{scroll-behavior:auto!important;animation:none!important;transition:none!important}}
  </style>
</head>
<body class="is-loading">
  <header class="topbar"><div class="topbar-inner">
    <div class="brand"><span class="brand-mark" aria-hidden="true"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 19V9m5 10V5m5 14v-7m5 7V3"/><path d="M2 19h20"/></svg></span><div><div class="brand-name">Fantacalcio Statistico</div><div class="source-note">Stagione 2026/27 · aggiornamento 2 settembre</div></div></div>
    <button class="icon-button" id="theme-toggle" type="button" aria-label="Cambia tema"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M4.9 4.9l1.4 1.4m11.4 11.4 1.4 1.4M2 12h2m16 0h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg></button>
  </div></header>
  <main class="shell">
    <section class="hero" aria-labelledby="page-title"><div><div class="eyebrow">Scouting e strategia d’asta</div><h1 id="page-title">Trova il profilo giusto, non solo il nome più noto.</h1><p>Incrocia prezzo, ruolo, titolarità, rischio infortuni e rendimento atteso. Ogni riga apre la scheda completa con tutte le statistiche disponibili nel workbook.</p></div><div class="hero-meta" aria-label="Riepilogo archivio"><div class="hero-stat"><strong>${players.length}</strong><span>calciatori</span></div><div class="hero-stat"><strong>${columns.length}</strong><span>campi disponibili</span></div></div></section>
    <div class="loading" aria-live="polite"><div class="skeleton"><div class="skeleton-line"></div><div class="skeleton-line"></div><div class="skeleton-line"></div></div></div>
    <div class="error" role="alert"><div class="empty-inner"><h3>Il dashboard non può essere caricato</h3><p id="error-copy">Si è verificato un errore durante l’inizializzazione.</p></div></div>
    <div class="workspace dashboard-ready">
      <aside class="filters" aria-label="Filtri giocatori"><div class="filters-grid">
        <div class="filter-heading"><h2>Filtra la rosa</h2><button class="text-button" id="reset-filters" type="button">Azzera</button></div>
        <div class="filter-group"><label for="search">Nome o parola chiave</label><input class="field" id="search" type="search" placeholder="Es. Malen, rigorista, mercato"></div>
        <div class="filter-group"><label for="team">Squadra 2026/27</label><select class="select" id="team"><option value="">Tutte le squadre</option></select></div>
        <div class="filter-group"><span class="filter-label">Ruolo classico</span><div class="role-options" id="roles">
          <label class="role-option"><input type="checkbox" value="P"><span>P</span></label><label class="role-option"><input type="checkbox" value="D"><span>D</span></label><label class="role-option"><input type="checkbox" value="C"><span>C</span></label><label class="role-option"><input type="checkbox" value="A"><span>A</span></label>
        </div></div>
        <div class="filter-group"><label for="mantra">Ruolo Mantra</label><select class="select" id="mantra"><option value="">Tutti i ruoli</option></select></div>
        <div class="filter-group"><label for="condition">Condizione fisica</label><select class="select" id="condition"><option value="">Qualsiasi condizione</option><option value="verde">Verde</option><option value="gialla">Gialla</option><option value="arancione">Arancione</option><option value="rossa">Rossa</option><option value="non disponibile">Non disponibile</option></select></div>
        <div class="filter-group"><label for="league-size">Formato lega</label><div class="field-row"><select class="select" id="league-size"><option value="8">8 squadre</option><option value="10" selected>10 squadre</option><option value="12">12 squadre</option></select><select class="select" id="modifier" aria-label="Modificatore"><option value="no">No MOD</option><option value="3">MOD 3F</option><option value="6">MOD 6F</option></select></div></div>
        <div class="filter-group"><span class="filter-label">Offerta suggerita (%)</span><div class="field-row"><input class="field" id="offer-min" type="number" step="0.1" placeholder="Min" aria-label="Offerta minima percentuale"><input class="field" id="offer-max" type="number" step="0.1" placeholder="Max" aria-label="Offerta massima percentuale"></div></div>
        <div class="filter-group"><label for="fm-min">Fantamedia attesa minima</label><input class="field" id="fm-min" type="number" min="0" max="10" step="0.05" placeholder="Es. 6.5"></div>
        <div class="filter-group"><label for="injury-max">Infortunio atteso massimo (%)</label><input class="field" id="injury-max" type="number" min="0" max="100" step="1" placeholder="Es. 15"></div>
        <div class="filter-group"><label class="check-row"><input id="forecast-only" type="checkbox"><span>Solo profili con fantamedia attesa 2027</span></label></div>
        <div class="filter-group"><span class="filter-label">Filtro su qualsiasi campo</span><div class="advanced-builder"><select class="select" id="advanced-column" aria-label="Campo da filtrare"></select><div class="field-row"><select class="select" id="advanced-operator" aria-label="Operatore"><option value="contains">Contiene</option><option value="equals">Uguale a</option><option value="gte">Maggiore o uguale</option><option value="lte">Minore o uguale</option><option value="not-empty">Non vuoto</option></select><input class="field" id="advanced-value" type="text" placeholder="Valore" aria-label="Valore del filtro"></div><button class="button" id="advanced-add" type="button">Aggiungi filtro</button></div><div class="advanced-list" id="advanced-list" aria-live="polite"></div></div>
      </div></aside>
      <section class="content" aria-label="Risultati">
        <div class="metric-strip" aria-live="polite"><div class="metric"><span class="metric-label">Offerta media</span><strong class="metric-value" id="metric-offer">—</strong><span class="metric-detail" id="metric-offer-detail"></span></div><div class="metric"><span class="metric-label">Disponibilità media</span><strong class="metric-value" id="metric-availability">—</strong><span class="metric-detail">partite a voto attese</span></div><div class="metric"><span class="metric-label">Fantamedia attesa più alta</span><strong class="metric-value" id="metric-fm">—</strong><span class="metric-detail" id="metric-fm-player">nessun dato</span></div></div>
        <div class="toolbar"><div class="result-copy" id="result-copy" aria-live="polite"></div><div class="actions"><button class="button" id="columns-open" type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 5h16M4 12h16M4 19h16M8 3v4m8 3v4m-5 3v4"/></svg><span id="column-count">Colonne</span></button><button class="button primary" id="export-csv" type="button"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M12 3v12m0 0 4-4m-4 4-4-4M4 19h16"/></svg>Esporta CSV</button></div></div>
        <div id="results-state"><div class="table-wrap"><table><thead><tr id="table-head"></tr></thead><tbody id="table-body"></tbody></table></div><div class="pagination"><label>Righe <select class="select" id="page-size" style="width:auto;min-height:36px;padding:6px 28px 6px 9px"><option>20</option><option>50</option><option>100</option></select></label><div class="page-controls"><button class="page-button" id="page-prev" type="button" aria-label="Pagina precedente">‹</button><span id="page-copy"></span><button class="page-button" id="page-next" type="button" aria-label="Pagina successiva">›</button></div></div><div class="empty"><div class="empty-inner"><h3>Nessun calciatore corrisponde</h3><p>Allarga una soglia oppure azzera i filtri per tornare all’elenco completo.</p><button class="button primary" id="empty-reset" type="button">Azzera filtri</button></div></div></div>
      </section>
    </div>
  </main>
  <dialog id="player-dialog" aria-labelledby="player-title"><div class="dialog-head"><div><h2 id="player-title"></h2><p id="player-subtitle"></p></div><button class="icon-button" data-close="player-dialog" type="button" aria-label="Chiudi scheda">×</button></div><div class="dialog-body"><div class="dialog-tools"><div class="search-block"><label class="filter-label" for="detail-search">Cerca nella scheda</label><input class="field" id="detail-search" type="search" placeholder="Es. gol, rischio, voto"></div><label class="check-row"><input id="show-empty" type="checkbox"><span>Mostra campi vuoti</span></label></div><div id="player-details"></div></div></dialog>
  <dialog id="columns-dialog" aria-labelledby="columns-title"><div class="dialog-head"><div><h2 id="columns-title">Colonne della tabella</h2><p>La scheda calciatore conserva sempre tutti i 98 campi del foglio principale.</p></div><button class="icon-button" data-close="columns-dialog" type="button" aria-label="Chiudi selezione colonne">×</button></div><div class="dialog-body"><div class="dialog-tools"><div class="search-block"><label class="filter-label" for="column-search">Cerca una statistica</label><input class="field" id="column-search" type="search" placeholder="Es. assist, tiri, passaggi"></div><button class="button" id="columns-default" type="button">Ripristina essenziali</button></div><div class="column-groups" id="column-groups"></div></div></dialog>
  <script id="dashboard-data" type="application/json">${payload}</script>
  <script>
  (() => {
    "use strict";
    const $ = (selector) => {const element=document.querySelector(selector);if(!element)throw new Error("Elemento mancante: "+selector);return element};
    const queryAll = (selector) => [...document.querySelectorAll(selector)];
    const data = JSON.parse($("#dashboard-data").textContent);
    const columnIndex = (id) => {const column=data.columns.find((item)=>item.id===id);if(!column)throw new Error("Colonna mancante: "+id);return column.index};
    const FIELD = Object.freeze({name:columnIndex("A"),mantra:columnIndex("B"),offer8No:columnIndex("G"),offer8Mod3:columnIndex("H"),offer8Mod6:columnIndex("I"),offer10No:columnIndex("K"),offer10Mod3:columnIndex("L"),offer10Mod6:columnIndex("M"),offer12No:columnIndex("O"),offer12Mod3:columnIndex("P"),offer12Mod6:columnIndex("Q"),team:columnIndex("S"),previousTeam:columnIndex("T"),role:columnIndex("U"),profileFlag:columnIndex("V"),strategy:columnIndex("W"),tag:columnIndex("X"),teamComment:columnIndex("Y"),conditionText:columnIndex("Z"),playerComment:columnIndex("AA"),creatorComment:columnIndex("AB"),hype:columnIndex("AC"),availability:columnIndex("AV"),injury:columnIndex("AW"),expectedFm:columnIndex("BG")});
    const essentials = [FIELD.team,FIELD.role,FIELD.mantra,FIELD.expectedFm,FIELD.availability,FIELD.injury,FIELD.hype,FIELD.tag];
    const state = {filtered:data.players,page:1,pageSize:20,sortIndex:"offer",sortDirection:"desc",selectedColumns:new Set(essentials),selectedPlayer:null,advancedFilters:[]};
    const collator = new Intl.Collator("it",{numeric:true,sensitivity:"base"});
    const offerMap = {"8-no":FIELD.offer8No,"8-3":FIELD.offer8Mod3,"8-6":FIELD.offer8Mod6,"10-no":FIELD.offer10No,"10-3":FIELD.offer10Mod3,"10-6":FIELD.offer10Mod6,"12-no":FIELD.offer12No,"12-3":FIELD.offer12Mod3,"12-6":FIELD.offer12Mod6};
    const escapeHtml = (value) => String(value ?? "").replace(/[&<>"']/g,(char)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[char]));
    const rawNumber = (value) => typeof value === "number" && Number.isFinite(value) ? value : null;
    const parseItalianNumber = (input) => {const compact=String(input).trim().replace(/\\s/g,"");const grouped=/^[+-]?\\d{1,3}(?:\\.\\d{3})+(?:,\\d+)?$/.test(compact);return Number(grouped?compact.replaceAll(".","").replace(",","."):compact.replace(",","."))};
    const currentOfferIndex = () => offerMap[$("#league-size").value+"-"+$("#modifier").value];
    const formatNumber = (value,meta) => {
      if(value===null||value===undefined||value==="") return "—";
      if(typeof value!=="number") return String(value);
      if(meta.percentFormat) return new Intl.NumberFormat("it-IT",{maximumFractionDigits:2}).format(value*100)+"%";
      if(meta.percentLabel) return new Intl.NumberFormat("it-IT",{maximumFractionDigits:2}).format(value)+"%";
      return new Intl.NumberFormat("it-IT",{maximumFractionDigits:3}).format(value);
    };
    const offerPercent = (player) => {const value=rawNumber(player.values[currentOfferIndex()]);return value===null?null:value*100};
    const checkedRoles = () => new Set(queryAll("#roles input:checked").map((input)=>input.value));
    const searchable = (player) => [FIELD.name,FIELD.team,FIELD.previousTeam,FIELD.mantra,FIELD.role,FIELD.tag,FIELD.teamComment,FIELD.conditionText,FIELD.playerComment,FIELD.creatorComment].map((index)=>player.values[index]).filter(Boolean).join(" ").toLocaleLowerCase("it");
    const operators = {contains:"contiene",equals:"uguale a",gte:"maggiore o uguale",lte:"minore o uguale","not-empty":"non vuoto"};
    function matchesAdvanced(player){return state.advancedFilters.every((rule)=>{const value=player.values[rule.index],meta=data.columns[rule.index];if(rule.operator==="not-empty")return value!==null&&value!=="";if(rule.operator==="contains")return String(value??"").toLocaleLowerCase("it").includes(rule.value.toLocaleLowerCase("it"));const numeric=rawNumber(value),typed=parseItalianNumber(rule.value),target=meta.percentFormat?typed/100:typed;if(rule.operator==="equals")return numeric!==null&&Number.isFinite(target)?Math.abs(numeric-target)<1e-9:String(value??"").localeCompare(rule.value,"it",{sensitivity:"base"})===0;if(numeric===null||!Number.isFinite(target))return false;return rule.operator==="gte"?numeric>=target:numeric<=target})}
    function renderAdvancedFilters(){$("#advanced-list").innerHTML=state.advancedFilters.map((rule,index)=>'<div class="advanced-chip"><span><strong>'+escapeHtml(data.columns[rule.index].shortLabel)+'</strong> '+escapeHtml(operators[rule.operator])+(rule.operator==="not-empty"?"":" "+escapeHtml(rule.value))+'</span><button type="button" data-remove-filter="'+index+'" aria-label="Rimuovi filtro">Rimuovi</button></div>').join("")}
    function addAdvancedFilter(){const index=Number($("#advanced-column").value),operator=$("#advanced-operator").value,value=$("#advanced-value").value.trim();if(operator!=="not-empty"&&!value){$("#advanced-value").setCustomValidity("Inserisci un valore");$("#advanced-value").reportValidity();return}$("#advanced-value").setCustomValidity("");state.advancedFilters.push({index,operator,value});$("#advanced-value").value="";renderAdvancedFilters();filterPlayers()}
    function populateSelects(){
      $("#team").insertAdjacentHTML("beforeend",data.teams.map((team)=>'<option value="'+escapeHtml(team)+'">'+escapeHtml(team)+"</option>").join(""));
      $("#mantra").insertAdjacentHTML("beforeend",data.mantraRoles.map((role)=>'<option value="'+escapeHtml(role)+'">'+escapeHtml(role)+"</option>").join(""));
      $("#advanced-column").innerHTML=data.columns.map((meta)=>'<option value="'+meta.index+'">'+escapeHtml(meta.group+" — "+meta.shortLabel)+"</option>").join("");
    }
    function filterPlayers(){
      const query=$("#search").value.trim().toLocaleLowerCase("it"),team=$("#team").value,mantra=$("#mantra").value,condition=$("#condition").value,roles=checkedRoles();
      const offerMin=$("#offer-min").value===""?null:Number($("#offer-min").value),offerMax=$("#offer-max").value===""?null:Number($("#offer-max").value);
      const fmMin=$("#fm-min").value===""?null:Number($("#fm-min").value),injuryMax=$("#injury-max").value===""?null:Number($("#injury-max").value)/100,forecastOnly=$("#forecast-only").checked;
      state.filtered=data.players.filter((player)=>{
        const offer=offerPercent(player),fm=rawNumber(player.values[FIELD.expectedFm]),injury=rawNumber(player.values[FIELD.injury]);
        return (!query||searchable(player).includes(query))&&(!team||player.values[FIELD.team]===team)&&(!mantra||player.values[FIELD.mantra]===mantra)&&(!condition||player.condition===condition)&&(!roles.size||roles.has(player.values[FIELD.role]))&&(offerMin===null||(offer!==null&&offer>=offerMin))&&(offerMax===null||(offer!==null&&offer<=offerMax))&&(fmMin===null||(fm!==null&&fm>=fmMin))&&(injuryMax===null||(injury!==null&&injury<=injuryMax))&&(!forecastOnly||fm!==null)&&matchesAdvanced(player);
      });
      state.page=1;render();
    }
    function sortedPlayers(){
      const index=state.sortIndex,direction=state.sortDirection==="asc"?1:-1;
      return [...state.filtered].sort((a,b)=>{
        const av=index==="offer"?offerPercent(a):a.values[index],bv=index==="offer"?offerPercent(b):b.values[index];
        const aEmpty=av===null||av===undefined||av==="",bEmpty=bv===null||bv===undefined||bv==="";if(aEmpty&&bEmpty)return 0;if(aEmpty)return 1;if(bEmpty)return -1;
        if(typeof av==="number"&&typeof bv==="number")return(av-bv)*direction;
        return collator.compare(String(av),String(bv))*direction;
      });
    }
    function tableColumns(){
      return [{type:"meta",index:FIELD.name,label:"Giocatore",fullLabel:"Nome"},{type:"offer",index:"offer",label:data.columns[currentOfferIndex()].shortLabel,fullLabel:data.columns[currentOfferIndex()].label},...[...state.selectedColumns].filter((index)=>index!==FIELD.name).map((index)=>({type:"meta",index,label:data.columns[index].shortLabel,fullLabel:data.columns[index].label}))];
    }
    function renderMetrics(){
      const offers=state.filtered.map(offerPercent).filter((value)=>value!==null),avail=state.filtered.map((p)=>rawNumber(p.values[FIELD.availability])).filter((v)=>v!==null);
      const withFm=state.filtered.map((player)=>({player,fm:rawNumber(player.values[FIELD.expectedFm])})).filter((item)=>item.fm!==null).sort((a,b)=>b.fm-a.fm);
      const avg=(values)=>values.length?values.reduce((sum,value)=>sum+value,0)/values.length:null;
      $("#metric-offer").textContent=offers.length?new Intl.NumberFormat("it-IT",{maximumFractionDigits:1}).format(avg(offers))+"%":"—";
      $("#metric-offer-detail").textContent=data.columns[currentOfferIndex()].shortLabel;
      $("#metric-availability").textContent=avail.length?new Intl.NumberFormat("it-IT",{maximumFractionDigits:1}).format(avg(avail)*100)+"%":"—";
      $("#metric-fm").textContent=withFm.length?formatNumber(withFm[0].fm,data.columns[FIELD.expectedFm]):"—";
      $("#metric-fm-player").textContent=withFm.length?withFm[0].player.values[FIELD.name]:"nessun dato";
    }
    function renderTable(){
      const columns=tableColumns();
      $("#table-head").innerHTML=columns.map((column)=>{const active=state.sortIndex===column.index,arrow=active?(state.sortDirection==="asc"?" ↑":" ↓"):"";return '<th scope="col"><button type="button" data-sort="'+column.index+'" aria-label="Ordina per '+escapeHtml(column.fullLabel)+'">'+escapeHtml(column.label)+arrow+"</button></th>"}).join("");
      const rows=sortedPlayers(),totalPages=Math.max(1,Math.ceil(rows.length/state.pageSize));if(state.page>totalPages)state.page=totalPages;
      const start=(state.page-1)*state.pageSize,pageRows=rows.slice(start,start+state.pageSize);
      $("#table-body").innerHTML=pageRows.map((player)=>"<tr>"+columns.map((column)=>{
        if(column.index===FIELD.name)return '<td><button class="player-link" type="button" data-player="'+player.row+'">'+escapeHtml(player.values[FIELD.name])+"</button></td>";
        if(column.type==="offer"){const value=offerPercent(player);return '<td class="numeric">'+(value===null?"—":new Intl.NumberFormat("it-IT",{maximumFractionDigits:1}).format(value)+"%")+"</td>"}
        const value=player.values[column.index],meta=data.columns[column.index],numeric=typeof value==="number",content=formatNumber(value,meta),isTag=[FIELD.role,FIELD.profileFlag,FIELD.strategy,FIELD.tag].includes(column.index)&&content!=="—";
        return '<td class="'+(numeric?"numeric":"")+'">'+(isTag?'<span class="tag">'+escapeHtml(content)+"</span>":escapeHtml(content))+"</td>";
      }).join("")+"</tr>").join("");
      $("#results-state").classList.toggle("is-empty",rows.length===0);
      $("#result-copy").innerHTML="<strong>"+rows.length+"</strong> di "+data.players.length+" calciatori";
      $("#page-copy").textContent="Pagina "+state.page+" di "+totalPages;
      $("#page-prev").disabled=state.page<=1;$("#page-next").disabled=state.page>=totalPages;
    }
    function render(){renderMetrics();renderTable();$("#column-count").textContent="Colonne ("+(state.selectedColumns.size+2)+")"}
    function resetFilters(){
      $("#search").value="";$("#team").value="";$("#mantra").value="";$("#condition").value="";queryAll("#roles input").forEach((input)=>{input.checked=false});
      $("#league-size").value="10";$("#modifier").value="no";$("#offer-min").value="";$("#offer-max").value="";$("#fm-min").value="";$("#injury-max").value="";$("#forecast-only").checked=false;state.advancedFilters=[];renderAdvancedFilters();filterPlayers();
    }
    function renderDetails(){
      const player=state.selectedPlayer;if(!player)return;const query=$("#detail-search").value.trim().toLocaleLowerCase("it"),showEmpty=$("#show-empty").checked,groups=new Map();
      data.columns.forEach((meta,index)=>{const value=player.values[index],empty=value===null||value==="";if(!showEmpty&&empty)return;if(query&&!(meta.label+" "+meta.shortLabel+" "+meta.group+" "+String(value??"")).toLocaleLowerCase("it").includes(query))return;if(!groups.has(meta.group))groups.set(meta.group,[]);groups.get(meta.group).push({meta,value})});
      $("#player-details").innerHTML=[...groups].map(([group,items])=>'<section class="detail-group"><h3>'+escapeHtml(group)+'</h3><div class="detail-grid">'+items.map(({meta,value})=>'<div class="detail-item"><span class="detail-label">'+escapeHtml(meta.shortLabel)+'</span><span class="detail-value '+(typeof value==="number"?"numeric":"")+'">'+escapeHtml(formatNumber(value,meta))+"</span></div>").join("")+"</div></section>").join("")||'<div class="empty-inner"><h3>Nessun campo trovato</h3><p>Prova con un termine più generale.</p></div>';
    }
    function openPlayer(row){
      state.selectedPlayer=data.players.find((player)=>player.row===Number(row));if(!state.selectedPlayer)return;
      $("#player-title").textContent=state.selectedPlayer.values[FIELD.name];$("#player-subtitle").textContent=[state.selectedPlayer.values[FIELD.team],state.selectedPlayer.values[FIELD.role],state.selectedPlayer.values[FIELD.mantra]].filter(Boolean).join(" · ");
      $("#detail-search").value="";$("#show-empty").checked=false;renderDetails();$("#player-dialog").showModal();
    }
    function renderColumnPicker(query=""){
      const term=query.trim().toLocaleLowerCase("it"),groups=new Map();
      data.columns.forEach((meta,index)=>{if(index===FIELD.name)return;if(term&&!(meta.label+" "+meta.shortLabel+" "+meta.group).toLocaleLowerCase("it").includes(term))return;if(!groups.has(meta.group))groups.set(meta.group,[]);groups.get(meta.group).push({meta,index})});
      $("#column-groups").innerHTML=[...groups].map(([group,items])=>'<section class="column-group"><h3>'+escapeHtml(group)+'</h3><div class="column-list">'+items.map(({meta,index})=>'<label class="column-option"><input type="checkbox" data-column="'+index+'" '+(state.selectedColumns.has(index)?"checked":"")+'><span>'+escapeHtml(meta.shortLabel)+"</span></label>").join("")+"</div></section>").join("");
    }
    function exportCsv(){
      const columns=tableColumns(),lines=[columns.map((column)=>'"'+column.label.replaceAll('"','""')+'"').join(";")];
      sortedPlayers().forEach((player)=>{lines.push(columns.map((column)=>{const value=column.type==="offer"?offerPercent(player):player.values[column.index],display=column.type==="offer"?(value===null?"":value+"%"):formatNumber(value,data.columns[column.index]);return '"'+String(display).replaceAll('"','""')+'"'}).join(";"))});
      const blob=new Blob(["\uFEFF"+lines.join("\\n")],{type:"text/csv;charset=utf-8"}),link=document.createElement("a");link.href=URL.createObjectURL(blob);link.download="fantacalcio-statistiche-filtrate.csv";link.click();URL.revokeObjectURL(link.href);
    }
    function bindEvents(){
      ["#search","#team","#mantra","#condition","#league-size","#modifier","#offer-min","#offer-max","#fm-min","#injury-max","#forecast-only"].forEach((selector)=>$(selector).addEventListener("input",filterPlayers));
      queryAll("#roles input").forEach((input)=>input.addEventListener("change",filterPlayers));$("#reset-filters").addEventListener("click",resetFilters);$("#empty-reset").addEventListener("click",resetFilters);
      $("#page-size").addEventListener("change",(event)=>{state.pageSize=Number(event.target.value);state.page=1;renderTable()});$("#page-prev").addEventListener("click",()=>{state.page-=1;renderTable()});$("#page-next").addEventListener("click",()=>{state.page+=1;renderTable()});
      $("#table-head").addEventListener("click",(event)=>{const button=event.target.closest("[data-sort]");if(!button)return;const value=button.dataset.sort==="offer"?"offer":Number(button.dataset.sort);if(state.sortIndex===value)state.sortDirection=state.sortDirection==="asc"?"desc":"asc";else{state.sortIndex=value;state.sortDirection=value===0?"asc":"desc"}renderTable()});
      $("#table-body").addEventListener("click",(event)=>{const button=event.target.closest("[data-player]");if(button)openPlayer(button.dataset.player)});
      $("#detail-search").addEventListener("input",renderDetails);$("#show-empty").addEventListener("change",renderDetails);$("#advanced-add").addEventListener("click",addAdvancedFilter);$("#advanced-operator").addEventListener("change",()=>{$("#advanced-value").disabled=$("#advanced-operator").value==="not-empty"});$("#advanced-list").addEventListener("click",(event)=>{const button=event.target.closest("[data-remove-filter]");if(!button)return;state.advancedFilters.splice(Number(button.dataset.removeFilter),1);renderAdvancedFilters();filterPlayers()});
      $("#columns-open").addEventListener("click",()=>{renderColumnPicker();$("#columns-dialog").showModal()});$("#column-search").addEventListener("input",(event)=>renderColumnPicker(event.target.value));
      $("#column-groups").addEventListener("change",(event)=>{const input=event.target.closest("[data-column]");if(!input)return;const index=Number(input.dataset.column);if(input.checked)state.selectedColumns.add(index);else state.selectedColumns.delete(index);render()});
      $("#columns-default").addEventListener("click",()=>{state.selectedColumns=new Set(essentials);renderColumnPicker($("#column-search").value);render()});$("#export-csv").addEventListener("click",exportCsv);
      queryAll("[data-close]").forEach((button)=>button.addEventListener("click",()=>$("#"+button.dataset.close).close()));queryAll("dialog").forEach((dialog)=>dialog.addEventListener("click",(event)=>{if(event.target===dialog)dialog.close()}));
      $("#theme-toggle").addEventListener("click",()=>{const root=document.documentElement,next=root.dataset.theme==="dark"?"light":"dark";root.dataset.theme=next;localStorage.setItem("fantacalcio-theme",next)});
    }
    try{
      const savedTheme=localStorage.getItem("fantacalcio-theme");if(savedTheme)document.documentElement.dataset.theme=savedTheme;
      populateSelects();bindEvents();filterPlayers();document.body.classList.remove("is-loading");
    }catch(error){document.body.classList.remove("is-loading");document.body.classList.add("has-error");$("#error-copy").textContent=error instanceof Error?error.message:String(error)}
  })();
  </script>
</body>
</html>`;

fs.mkdirSync(path.dirname(destination), { recursive: true });
fs.writeFileSync(destination, html, "utf8");
console.log(
  JSON.stringify(
    {
      source,
      destination: path.resolve(destination),
      players: players.length,
      columns: columns.length,
      teams: teams.length,
      bytes: Buffer.byteLength(html),
    },
    null,
    2
  )
);
