// Dark-first design system shared by every server-rendered page. One theme,
// deliberately: the indigo→cyan brand gradient carries identity against deep
// navy surfaces. Status colors always ship with an icon + label, never alone.

export const DESIGN_SYSTEM_CSS = `
  :root{color-scheme:dark;
    --bg:#0b0d12;--bg2:#10131a;--card:#141826;--card2:#181d2b;
    --line:#222839;--line2:#2d3550;
    --ink:#edeff5;--ink2:#a6aebf;--ink3:#697084;
    --brand1:#818cf8;--brand2:#6366f1;--brand3:#22d3ee;--link:#96a7ff;
    --good:#4ade80;--warn:#fbbf24;--crit:#f87171;
    --good-bg:rgba(74,222,128,.1);--warn-bg:rgba(251,191,36,.1);--crit-bg:rgba(248,113,113,.1);
    --good-line:rgba(74,222,128,.28);--warn-line:rgba(251,191,36,.28);--crit-line:rgba(248,113,113,.28);
    --code-bg:#181d2b;
    --grad:linear-gradient(120deg,var(--brand1),var(--brand2) 45%,var(--brand3));
    --glow:0 8px 40px rgba(99,102,241,.28)}
  *{box-sizing:border-box}
  html{scroll-behavior:smooth}
  body{font-family:Inter,ui-sans-serif,system-ui,'Segoe UI',sans-serif;margin:0;
    background:var(--bg);color:var(--ink);line-height:1.6;font-size:16px;
    -webkit-font-smoothing:antialiased}
  main{max-width:66rem;margin:0 auto;padding:2.2rem 1.4rem 4rem;position:relative}
  a{color:var(--link);text-decoration-thickness:1px;text-underline-offset:3px}
  h1,h2,h3,.word{font-family:'Space Grotesk',Inter,ui-sans-serif,sans-serif}
  h1{font-size:1.6rem;margin:0;letter-spacing:-.02em}
  h2{font-size:1.35rem;margin:0 0 1rem;letter-spacing:-.015em;font-weight:600}
  section{margin-top:4.2rem}
  .eyebrow{display:block;font-size:.72rem;font-weight:600;letter-spacing:.18em;
    text-transform:uppercase;margin-bottom:.5rem;
    background:var(--grad);-webkit-background-clip:text;background-clip:text;color:transparent}
  code{background:var(--code-bg);border:1px solid var(--line);padding:.08rem .35rem;
    border-radius:5px;font-size:.84em;font-family:ui-monospace,'Cascadia Mono',monospace}
  pre.code{background:var(--code-bg);border:1px solid var(--line);border-radius:10px;
    padding:.95rem 1.1rem;overflow-x:auto;font-size:.8rem;line-height:1.55;margin:.7rem 0;
    font-family:ui-monospace,'Cascadia Mono',monospace}
  .site-head{position:sticky;top:0;z-index:10;
    background:rgba(11,13,18,.8);backdrop-filter:blur(14px);border-bottom:1px solid var(--line)}
  .site-head .inner{max-width:66rem;margin:0 auto;padding:.75rem 1.4rem;
    display:flex;align-items:center;gap:.75rem;flex-wrap:wrap}
  .site-head img{width:30px;height:30px;border-radius:8px;display:block}
  .site-head .word{font-weight:700;font-size:1.05rem;color:var(--ink);text-decoration:none;
    display:flex;align-items:center;gap:.6rem;letter-spacing:-.01em}
  .site-head nav{margin-left:auto;display:flex;gap:1.3rem;font-size:.88rem}
  .site-head nav a{color:var(--ink2);text-decoration:none;transition:color .15s}
  .site-head nav a:hover{color:var(--ink)}
  .live-dot{display:inline-flex;align-items:center;gap:.4rem;font-size:.78rem;color:var(--good);
    border:1px solid var(--good-line);background:var(--good-bg);border-radius:99px;padding:.18rem .65rem}
  .live-dot::before{content:'';width:.45rem;height:.45rem;border-radius:99px;background:var(--good);
    box-shadow:0 0 8px var(--good)}
  .crumb{font-size:.82rem;color:var(--ink3);margin:0 0 1.2rem}
  .crumb a{color:var(--ink3)}
  .card{background:var(--card);border:1px solid var(--line);border-radius:12px;
    padding:1.05rem 1.2rem;transition:border-color .18s}
  .card:hover{border-color:var(--line2)}
  .table-wrap{overflow-x:auto;border:1px solid var(--line);border-radius:12px;background:var(--card)}
  table{border-collapse:collapse;width:100%;font-size:.87rem}
  th,td{padding:.6rem .85rem;text-align:left;border-top:1px solid var(--line);vertical-align:top}
  tbody tr{transition:background .12s}
  tbody tr:hover{background:var(--card2)}
  thead th{border-top:none;background:var(--bg2);font-weight:600;font-size:.72rem;
    text-transform:uppercase;letter-spacing:.09em;color:var(--ink3)}
  .mono{font-family:ui-monospace,'Cascadia Mono',monospace;font-size:.78rem}
  .nowrap{white-space:nowrap}
  .verdict{font-weight:650;font-size:.74rem;padding:.16rem .6rem;border-radius:99px;
    white-space:nowrap;border:1px solid transparent}
  .verdict.pass{background:var(--good-bg);color:var(--good);border-color:var(--good-line)}
  .verdict.partial{background:var(--warn-bg);color:var(--warn);border-color:var(--warn-line)}
  .verdict.fail{background:var(--crit-bg);color:var(--crit);border-color:var(--crit-line)}
  .btn{display:inline-block;padding:.62rem 1.25rem;border-radius:10px;font-size:.92rem;
    font-weight:600;text-decoration:none;border:1px solid transparent;
    transition:transform .15s,box-shadow .15s,border-color .15s,background .15s}
  .btn.primary{background:var(--grad);color:#fff;box-shadow:var(--glow)}
  .btn.primary:hover{transform:translateY(-2px);box-shadow:0 12px 48px rgba(99,102,241,.4)}
  .btn.ghost{border-color:var(--line2);color:var(--ink);background:transparent}
  .btn.ghost:hover{border-color:var(--brand1);transform:translateY(-2px)}
  .muted{color:var(--ink2)} .dim{color:var(--ink3)} .small{font-size:.85rem}
  .keybox{word-break:break-all;font-family:ui-monospace,monospace;font-size:.8rem;
    background:var(--card);border:1px solid var(--line);border-radius:10px;padding:.75rem .95rem}
  .glowwrap{padding:1px;border-radius:15px;
    background:linear-gradient(135deg,rgba(129,140,248,.55),rgba(99,102,241,.2) 45%,rgba(34,211,238,.45));
    box-shadow:var(--glow)}
  .glowwrap>.card{border:none;border-radius:14px;margin:0}
  footer{margin-top:4.5rem;padding-top:1.3rem;border-top:1px solid var(--line);
    color:var(--ink3);font-size:.84rem;display:flex;gap:1.2rem;flex-wrap:wrap;align-items:center}
  footer a{color:var(--ink2);text-decoration:none}
  footer a:hover{color:var(--ink)}
  @media(max-width:640px){main{padding:1.6rem 1rem 3rem}}
`;
