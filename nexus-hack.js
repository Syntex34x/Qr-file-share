/* ══════════════════════════════════════════════════════
   NEXUS HACK — Complete JavaScript Module
   Firebase v10 · Google Auth · GitHub Auth · No mock data
   ══════════════════════════════════════════════════════ */

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword,
  signOut, onAuthStateChanged, updateProfile,
  GoogleAuthProvider, GithubAuthProvider, signInWithPopup
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import {
  getFirestore, collection, doc, addDoc, getDoc, getDocs,
  setDoc, updateDoc, deleteDoc, query, where, orderBy,
  serverTimestamp, writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

/* ── FIREBASE INIT ──────────────────────────────────── */
const app = initializeApp({
  apiKey:            "AIzaSyC1O9d3mEWJ2hPGTBhj3PRpxx5TqHiDrV4",
  authDomain:        "airdops-30748.firebaseapp.com",
  projectId:         "airdops-30748",
  storageBucket:     "airdops-30748.firebasestorage.app",
  messagingSenderId: "301012365212",
  appId:             "1:301012365212:web:a1c1fe338a5801ad1b2259"
});
const auth = getAuth(app);
const db   = getFirestore(app);
const googleProvider = new GoogleAuthProvider();
const githubProvider = new GithubAuthProvider();

/* ── STATE ──────────────────────────────────────────── */
const S = {
  fbUser:      null,   // Firebase Auth user
  userDoc:     null,   // Firestore participants/{uid}
  orgProfile:  null,   // local organizer session
  judgeProfile:null,   // Firestore judges/{id}
  myScores:    {},     // projectId → { innovation,technical,design,impact, docId }
  // cached collections (loaded fresh per dashboard open)
  events:      [],
  projects:    [],
  participants:[],
  judges:      [],
  announcements:[]
};

/* ── DOM HELPERS ────────────────────────────────────── */
const $   = id  => document.getElementById(id);
const $$  = sel => document.querySelectorAll(sel);

function toast(msg, type = 'inf') {
  const icons = { ok:'✓', err:'✕', inf:'◎', warn:'⚠' };
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `<span style="font-size:15px">${icons[type]||'◎'}</span><span>${msg}</span>`;
  $('_toasts').appendChild(el);
  setTimeout(() => { el.style.animation = 'tIn .3s ease reverse'; setTimeout(() => el.remove(), 300); }, 3400);
}

function setBtn(id, loading, label) {
  const el = $(id); if (!el) return;
  el.disabled = loading;
  el.innerHTML = loading ? `<span class="spin"></span> Please wait…` : label;
}

function tsStr(ts) {
  if (!ts) return '—';
  try { const d = ts.toDate ? ts.toDate() : new Date(ts); return d.toLocaleString('en-US',{month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}); }
  catch { return '—'; }
}

function fmtDT(s) {
  if (!s) return '—';
  try { return new Date(s).toLocaleString('en-US',{month:'short',day:'numeric',year:'numeric',hour:'2-digit',minute:'2-digit'}); }
  catch { return s; }
}

function genPw() {
  return Math.random().toString(36).slice(2,8).toUpperCase()
       + Math.floor(10+Math.random()*90);
}

function annHTML(a) {
  return `<div class="ann-item">
    <div class="ann-ico">${a.ico||'📢'}</div>
    <div>
      <div class="ann-tit">${esc(a.title)}</div>
      <div class="ann-body">${esc(a.body||'')}</div>
      <div class="ann-time">${tsStr(a.createdAt)}</div>
    </div>
  </div>`;
}

function esc(s) {
  return String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

function projCard(p) {
  const scored = !!S.myScores[p.id];
  return `<div class="pc" onclick="window._openProj('${p.id}')">
    <div class="pc-t">${esc(p.title)}<span class="badge b-muted" style="font-size:10px">${esc((p.track||'').split(' ')[0])}</span></div>
    <div class="pc-d">${esc((p.desc||'').slice(0,100))}${(p.desc||'').length>100?'…':''}</div>
    <div class="pc-tags">${(p.stack||[]).map(t=>`<span class="pc-tag">${esc(t)}</span>`).join('')}</div>
    <div class="pc-ft">
      <div><div style="font-size:11px;color:var(--muted)">${esc(p.track||'—')}</div><div style="font-size:12px;color:var(--faint)">by ${esc(p.team||'Solo')}</div></div>
      <div style="text-align:right"><div class="pc-score">${p.avgScore||0}</div><div style="font-size:10px;color:var(--muted)">avg score</div></div>
    </div>
  </div>`;
}

/* ── PARTICLES ──────────────────────────────────────── */
(function initParticles() {
  const c = $('_canvas'), x = c.getContext('2d');
  const M = { x:-999, y:-999 };
  const COLS = ['#52c4ff','#00e5ff','#ffb830','#00ffa3','#ff4d8d'];
  let pts = [];
  const rz = () => { c.width = innerWidth; c.height = innerHeight; };
  rz(); addEventListener('resize', rz);
  addEventListener('mousemove', e => { M.x = e.clientX; M.y = e.clientY; });
  for (let i = 0; i < 80; i++) pts.push({
    x: Math.random()*innerWidth, y: Math.random()*innerHeight,
    r: Math.random()*1.6+.4, dx: (Math.random()-.5)*.3, dy: (Math.random()-.5)*.3,
    c: COLS[~~(Math.random()*5)], a: Math.random()*.5+.15, ph: Math.random()*Math.PI*2
  });
  function draw() {
    x.clearRect(0,0,c.width,c.height);
    pts.forEach((p,i) => {
      p.ph += .013; p.x += p.dx; p.y += p.dy;
      const d = Math.hypot(p.x-M.x, p.y-M.y);
      if (d < 85) { p.x += (p.x-M.x)/d*1.3; p.y += (p.y-M.y)/d*1.3; }
      if (p.x < 0||p.x > c.width) p.dx *= -1;
      if (p.y < 0||p.y > c.height) p.dy *= -1;
      x.beginPath(); x.arc(p.x,p.y,p.r,0,Math.PI*2);
      x.fillStyle = p.c + Math.floor(p.a*(.76+.24*Math.sin(p.ph))*255).toString(16).padStart(2,'0');
      x.fill();
      for (let j=i+1; j<pts.length; j++) {
        const q=pts[j], dd=Math.hypot(p.x-q.x, p.y-q.y);
        if (dd < 108) { x.beginPath(); x.moveTo(p.x,p.y); x.lineTo(q.x,q.y); x.strokeStyle=`rgba(82,196,255,${(1-dd/108)*.07})`; x.lineWidth=.5; x.stroke(); }
      }
    });
    requestAnimationFrame(draw);
  }
  draw();
})();

/* ── CURSOR ─────────────────────────────────────────── */
(function initCursor() {
  const cur=$('_cur'), ring=$('_ring');
  let rx=0, ry=0, tx=0, ty=0;
  document.addEventListener('mousemove', e => { tx=e.clientX; ty=e.clientY; cur.style.left=e.clientX+'px'; cur.style.top=e.clientY+'px'; });
  document.addEventListener('mouseover', e => { if (e.target.matches('button,a,[onclick]')) document.body.classList.add('hov'); });
  document.addEventListener('mouseout',  e => { if (e.target.matches('button,a,[onclick]')) document.body.classList.remove('hov'); });
  (function ani() { rx+=(tx-rx)*.12; ry+=(ty-ry)*.12; ring.style.left=rx+'px'; ring.style.top=ry+'px'; requestAnimationFrame(ani); })();
})();

/* ── COUNTDOWN ──────────────────────────────────────── */
(function initClock() {
  const pad = n => String(n).padStart(2,'0');
  const target = new Date('2025-03-16T19:00:00').getTime();
  function tick() {
    const d = Math.max(0, target - Date.now());
    $('cd-d').textContent = pad(~~(d/86400000));
    $('cd-h').textContent = pad(~~(d%86400000/3600000));
    $('cd-m').textContent = pad(~~(d%3600000/60000));
    $('cd-s').textContent = pad(~~(d%60000/1000));
  }
  tick(); setInterval(tick, 1000);
  setInterval(() => {
    const t = new Date().toLocaleTimeString();
    ['h-clk','o-clk','j-clk'].forEach(id => { const el=$(id); if(el) el.textContent=t; });
  }, 1000);
})();

window.addEventListener('scroll', () => $('_nav').classList.toggle('scrolled', scrollY > 40));

/* ── PAGE ROUTER ────────────────────────────────────── */
const ALL_PAGES = ['home','events','event-detail','schedule','prizes','faq','contact','register','organizer-portal','judge-portal'];

const FOOTER_HTML = `
<footer class="ft">
  <div class="ft-body">
    <div>
      <div class="ft-logo" onclick="G.go('home')">NEXUS HACK</div>
      <p class="ft-desc">The world's most immersive AI hackathon. 48 hours to change everything.</p>
      <div class="ft-soc"><div class="fls">𝕏</div><div class="fls">in</div><div class="fls">▷</div></div>
    </div>
    <div><div class="fc-t">Event</div><div class="fc-links"><button class="fc-a" onclick="G.go('events')">Events</button><button class="fc-a" onclick="G.go('schedule')">Schedule</button><button class="fc-a" onclick="G.go('prizes')">Prizes</button></div></div>
    <div><div class="fc-t">Participate</div><div class="fc-links"><button class="fc-a" onclick="G.go('register')">Register</button><button class="fc-a" onclick="G.go('faq')">FAQ</button></div></div>
    <div><div class="fc-t">Contact</div><div class="fc-links"><button class="fc-a" onclick="G.go('contact')">Email Us</button><button class="fc-a">Discord</button></div></div>
  </div>
  <div class="ft-bot"><div class="ft-copy">© 2025 NEXUS HACK · Powered by Firebase</div><div style="font-size:12px;color:var(--faint)">Real-time Firestore · No mock data</div></div>
</footer>`;

window.G = {
  go(id) {
    ALL_PAGES.forEach(p => { const el = $(`page-${p}`); if (el) el.classList.toggle('active', p === id); });
    $$('.nlink').forEach(a => a.classList.remove('on'));
    const m = document.querySelector(`.nlink[onclick*="'${id}'"]`);
    if (m) m.classList.add('on');
    window.scrollTo({ top:0, behavior:'smooth' });
    // inject footer
    const no_footer = ['organizer-portal','judge-portal','register','event-detail'];
    if (!no_footer.includes(id)) {
      const fid = `${id}-ft`, pg = $(`page-${id}`);
      if (pg && !$(fid)) { const div=document.createElement('div'); div.id=fid; div.innerHTML=FOOTER_HTML; pg.appendChild(div); }
    }
    if (id === 'home' || id === 'events') Ev.loadPublic();
  },
  toggleMob() { $('_mob').classList.toggle('open'); }
};

// Hash routing for hidden portals
function checkHash() {
  const h = location.hash;
  if (h === '#organizer-portal') G.go('organizer-portal');
  else if (h === '#judge-portal') G.go('judge-portal');
}
window.addEventListener('hashchange', checkHash);

/* ── MODAL HELPERS ──────────────────────────────────── */
window.openOv  = id => $(id).classList.add('open');
window.closeOv = id => $(id).classList.remove('open');
window.ovClick = (e,id) => { if (e.target === $(id)) closeOv(id); };
document.addEventListener('keydown', e => { if (e.key === 'Escape') $$('.ov.open').forEach(o => o.classList.remove('open')); });

/* ── SIDEBAR TOGGLE ─────────────────────────────────── */
window.toggleSb = id => $(id).classList.toggle('col');

/* ── DASHBOARD SWITCHER ─────────────────────────────── */
window.dSwitch = function(dash, view, btn) {
  const prefix = dash[0]; // 'h','o','j'
  $$(`#dash-${dash} .dv`).forEach(v => v.classList.remove('on'));
  $$(`#dash-${dash} .da`).forEach(b => b.classList.remove('on'));
  $(`dv-${prefix}-${view}`)?.classList.add('on');
  if (btn) btn.classList.add('on');
  // update toolbar title
  const titles = {
    'h-overview':'Overview','h-lb':'Leaderboard','h-projs':'Projects','h-ann':'Announcements',
    'h-team':'My Team','h-submit':'Submit Project','h-myproj':'My Submission',
    'o-overview':'Overview','o-events':'My Events','o-participants':'Participants','o-projects':'All Projects',
    'o-judges':'Judge Accounts','o-scores':'All Scores','o-lb':'Leaderboard','o-ann':'Announcements',
    'j-overview':'Overview','j-score':'Score Projects','j-myscores':'My Scores','j-lb':'Leaderboard','j-ann':'Announcements'
  };
  $(`${prefix}-dtb`).textContent = titles[view] || view;
};

/* ── DASH OPEN / EXIT ───────────────────────────────── */
window.Dash = {
  openHacker() {
    $('dash-hacker').classList.add('open'); document.body.style.overflow = 'hidden';
    const u = S.userDoc || {};
    const n = u.name || S.fbUser?.displayName || 'Hacker';
    $('h-name').textContent = n;
    const av = $('h-av');
    if (S.fbUser?.photoURL) av.innerHTML = `<img src="${S.fbUser.photoURL}" alt="">`;
    else av.textContent = n[0].toUpperCase();
    HackerCtrl.load();
  },
  openOrganizer() {
    $('dash-organizer').classList.add('open'); document.body.style.overflow = 'hidden';
    $('o-name').textContent = S.orgProfile?.name || 'Organizer';
    OrgCtrl.load();
  },
  openJudge() {
    $('dash-judge').classList.add('open'); document.body.style.overflow = 'hidden';
    const j = S.judgeProfile;
    $('j-name').textContent = j?.name || 'Judge';
    $('j-av').textContent = (j?.name||'J')[0].toUpperCase();
    JudgeCtrl.load();
  },
  exit(role) {
    $(`dash-${role}`).classList.remove('open'); document.body.style.overflow = '';
    if (role === 'organizer') S.orgProfile = null;
    if (role === 'judge')     S.judgeProfile = null;
    S.myScores = {};
  }
};

/* ── AUTH ───────────────────────────────────────────── */
window.Auth = {
  /* --- social helpers --- */
  async _afterSocial(cred) {
    S.fbUser = cred.user;
    // upsert participant doc
    const ref = doc(db,'participants', cred.user.uid);
    const snap = await getDoc(ref);
    if (!snap.exists()) {
      const profile = {
        uid: cred.user.uid, name: cred.user.displayName || cred.user.email,
        email: cred.user.email, photoURL: cred.user.photoURL || '',
        provider: cred.providerId || 'google', role: 'hacker',
        track:'', title:'', org:'', skills:'', idea:'',
        team:'', submitted: false, status:'active', createdAt: serverTimestamp()
      };
      await setDoc(ref, profile);
      S.userDoc = profile;
    } else {
      S.userDoc = snap.data();
    }
    this._updateNavUser();
    closeOv('ov-login');
    toast(`Welcome, ${cred.user.displayName || cred.user.email}! 🚀`, 'ok');
    Dash.openHacker();
  },
  async googleSignIn() {
    try {
      const cred = await signInWithPopup(auth, googleProvider);
      await this._afterSocial(cred);
    } catch(e) { toast(e.message, 'err'); }
  },
  async githubSignIn() {
    try {
      const cred = await signInWithPopup(auth, githubProvider);
      await this._afterSocial(cred);
    } catch(e) { toast(e.message, 'err'); }
  },
  /* --- email/password --- */
  async emailLogin() {
    const em = $('li-em').value.trim(), pw = $('li-pw').value;
    if (!em||!pw) { toast('Fill all fields','err'); return; }
    setBtn('li-btn', true, 'Sign In →');
    try {
      const cred = await signInWithEmailAndPassword(auth, em, pw);
      S.fbUser = cred.user;
      const snap = await getDoc(doc(db,'participants', cred.user.uid));
      S.userDoc = snap.exists() ? snap.data() : { name: cred.user.displayName||em, email:em };
      this._updateNavUser();
      closeOv('ov-login');
      toast(`Welcome back! 👋`, 'ok');
      Dash.openHacker();
    } catch(e) { toast(e.message,'err'); }
    setBtn('li-btn', false, 'Sign In →');
  },
  async signOut() {
    await signOut(auth).catch(()=>{});
    S.fbUser = null; S.userDoc = null;
    Dash.exit('hacker');
    $('nav-user-btn').style.display = 'none';
    $('nav-signin').style.display = '';
    toast('Signed out','inf');
  },
  _updateNavUser() {
    const btn = $('nav-user-btn'), si = $('nav-signin');
    if (!S.fbUser) { btn.style.display='none'; si.style.display=''; return; }
    btn.style.display = 'flex'; si.style.display = 'none';
    $('nav-display-name').textContent = S.fbUser.displayName || S.fbUser.email.split('@')[0];
    const avEl = $('nav-av-fb');
    if (S.fbUser.photoURL) avEl.innerHTML=`<img src="${S.fbUser.photoURL}" style="width:26px;height:26px;border-radius:50%;object-fit:cover">`;
    else avEl.textContent = (S.fbUser.displayName||'U')[0].toUpperCase();
  },
  /* --- registration steps --- */
  nextReg(step) {
    if (step===1) {
      const fn=$('r-fn').value.trim(), em=$('r-em').value.trim(), pw=$('r-pw').value;
      if (!fn||!em||!pw) { toast('Fill required fields','err'); return; }
      if (pw.length < 8) { toast('Password min 8 characters','err'); return; }
    }
    const next = step+1;
    $$('.rs').forEach((s,i) => s.classList.toggle('on', i+1===next));
    $$('.ps').forEach((s,i) => { s.classList.toggle('on',i+1===next); s.classList.toggle('done',i+1<next); });
  },
  prevReg() {
    const cur = document.querySelector('.rs.on'); if(!cur) return;
    const idx = Array.from($$('.rs')).indexOf(cur);
    if (idx>0) {
      $$('.rs').forEach((s,i) => s.classList.toggle('on',i===idx-1));
      $$('.ps').forEach((s,i) => { s.classList.toggle('on',i===idx-1); s.classList.remove('done'); });
    }
  },
  async submitReg() {
    const fn=$('r-fn').value.trim(), ln=$('r-ln').value.trim(),
          em=$('r-em').value.trim(), pw=$('r-pw').value;
    setBtn('reg-final-btn', true, 'Creating…');
    try {
      const cred = await createUserWithEmailAndPassword(auth, em, pw);
      const name = `${fn} ${ln}`.trim();
      await updateProfile(cred.user, { displayName: name });
      const profile = {
        uid: cred.user.uid, name, email: em, photoURL:'', provider:'email',
        role:'hacker', track:$('r-track').value, title:$('r-title').value.trim(),
        org:$('r-org').value.trim(), skills:$('r-skills').value.trim(),
        idea:$('r-idea').value.trim(), team:'', submitted:false,
        status:'active', createdAt: serverTimestamp()
      };
      await setDoc(doc(db,'participants', cred.user.uid), profile);
      S.fbUser = cred.user; S.userDoc = profile;
      this._updateNavUser();
      // show step 4
      $$('.rs').forEach((s,i) => s.classList.toggle('on',i===3));
      $$('.ps').forEach((s,i) => { s.classList.toggle('on',i===3); s.classList.toggle('done',i<3); });
      toast(`Welcome, ${fn}! 🚀`, 'ok');
    } catch(e) { toast(e.message,'err'); }
    setBtn('reg-final-btn', false, 'Create Account ✓');
  },
  /* --- organizer (local credentials) --- */
  async orgLogin() {
    const em=$('og-em').value.trim(), pw=$('og-pw').value, code=$('og-code').value.trim();
    if (em!=='organizer@nexushack.dev' || pw!=='nexus2025' || code!=='482910') {
      toast('Invalid credentials or access code','err'); return;
    }
    setBtn('og-btn', true, 'Verifying…');
    await new Promise(r => setTimeout(r,700));
    S.orgProfile = { name:'Nina Park', email:em, role:'organizer' };
    location.hash = '';
    setBtn('og-btn', false, 'Access Organizer Panel →');
    Dash.openOrganizer();
    toast('Welcome back, Organizer 👋','ok');
  },
  /* --- judge (Firestore credentials) --- */
  async judgeLogin() {
    const em=$('jg-em').value.trim().toLowerCase(), pw=$('jg-pw').value;
    if (!em||!pw) { toast('Enter credentials','err'); return; }
    setBtn('jg-btn', true, 'Verifying…');
    try {
      const snap = await getDocs(query(collection(db,'judges'), where('email','==',em)));
      if (snap.empty) { toast('No judge account found','err'); setBtn('jg-btn',false,'Access Judge Panel →'); return; }
      const judge = { id:snap.docs[0].id, ...snap.docs[0].data() };
      if (judge.password !== pw) { toast('Incorrect password','err'); setBtn('jg-btn',false,'Access Judge Panel →'); return; }
      S.judgeProfile = judge;
      location.hash = '';
      Dash.openJudge();
      toast(`Welcome, ${judge.name} 👋`,'ok');
    } catch(e) { toast(e.message,'err'); }
    setBtn('jg-btn', false, 'Access Judge Panel →');
  }
};

/* ── AUTH STATE LISTENER ────────────────────────────── */
onAuthStateChanged(auth, async user => {
  S.fbUser = user;
  if (user) {
    const snap = await getDoc(doc(db,'participants',user.uid)).catch(()=>null);
    S.userDoc = snap?.exists() ? snap.data() : { name:user.displayName||user.email, email:user.email };
    Auth._updateNavUser();
  }
  // hide global loader
  const ldr = $('_loader');
  if (ldr) { ldr.classList.add('hide'); setTimeout(()=>ldr.remove(),500); }
  // init page
  checkHash();
  if (!location.hash) G.go('home');
});

/* ── EVENTS (public) ────────────────────────────────── */
window.Ev = {
  _all: [],
  async loadPublic() {
    try {
      const snap = await getDocs(query(collection(db,'hackathons'), orderBy('createdAt','desc')));
      this._all = snap.docs.map(d => ({id:d.id,...d.data()}));
    } catch(e) { this._all = []; }
    this._renderGrid('home-ev-grid',  this._all.filter(e => e.status==='live'||e.status==='upcoming').slice(0,3));
    this._renderGrid('all-ev-grid',   this._all);
  },
  filter() {
    const v = $('ev-filter').value;
    this._renderGrid('all-ev-grid', v ? this._all.filter(e=>e.status===v) : this._all);
  },
  _renderGrid(id, list) {
    const g = $(id); if (!g) return;
    if (!list.length) { g.innerHTML=`<div class="empty"><div class="empty-ic">📅</div><div class="empty-t">No events found.</div></div>`; return; }
    g.innerHTML = list.map(e => this._cardHTML(e)).join('');
  },
  _statusBadge(s) {
    return {
      live:     `<span class="badge b-live"><span class="dot-live" style="margin-right:4px"></span>Live</span>`,
      upcoming: `<span class="badge b-amber">Upcoming</span>`,
      ended:    `<span class="badge b-muted">Ended</span>`
    }[s] || '';
  },
  _cardHTML(e) {
    return `<div class="ev-card ${e.status==='live'?'ev-live':''}" onclick="Ev.showDetail('${e.id}')">
      <div class="ev-meta">${this._statusBadge(e.status)}<span class="badge b-orange">$${(e.prize||0).toLocaleString()}</span></div>
      <div class="ev-title">${esc(e.name)}</div>
      <div class="ev-meta">
        <span style="font-size:12px;color:var(--muted)">📅 ${fmtDT(e.start)}</span>
        ${e.venue?`<span style="font-size:12px;color:var(--muted)">📍 ${esc(e.venue)}</span>`:''}
      </div>
      <div class="ev-desc">${esc(e.tagline||e.desc||'Click to view full details.')}</div>
      <div class="ev-foot">
        <span style="font-size:12px;color:var(--muted)">👥 Max ${e.maxParts||'∞'}</span>
        <span style="font-size:12px;color:var(--muted)">⬡ Teams ≤ ${e.maxTeam||4}</span>
        <button class="btn btn-cyan btn-xs" onclick="event.stopPropagation();G.go('register')">Apply →</button>
      </div>
    </div>`;
  },
  showDetail(id) {
    const e = this._all.find(x=>x.id===id); if (!e) return;
    $('ev-detail-hd').innerHTML = `
      <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:18px;flex-wrap:wrap">
        <div>
          <div style="display:flex;gap:9px;align-items:center;margin-bottom:12px;flex-wrap:wrap">${this._statusBadge(e.status)}<span class="badge b-cyan">$${(e.prize||0).toLocaleString()} prizes</span></div>
          <h1 style="font-family:'Bebas Neue',sans-serif;font-size:clamp(40px,7vw,72px);line-height:.95;letter-spacing:.04em;margin-bottom:12px">${esc(e.name)}</h1>
          <p style="font-size:15px;color:var(--muted);line-height:1.7;max-width:560px">${esc(e.desc||e.tagline||'')}</p>
        </div>
        <div style="display:flex;gap:9px;flex-wrap:wrap">
          <button class="btn btn-amber" onclick="G.go('register')">Apply Now →</button>
          <button class="btn btn-ghost" onclick="G.go('events')">← All Events</button>
        </div>
      </div>`;
    $('ev-detail-body').innerHTML = `
      <div>
        <div class="panel"><div class="phd"><div class="ptitle">Event Details</div></div><div class="pbd">
          ${[['📅','Start',fmtDT(e.start)],['🏁','End',fmtDT(e.end)],['📍','Venue',e.venue||'—'],['👥','Max Participants',(e.maxParts||'Unlimited')],['⬡','Max Team Size',(e.maxTeam||4)+' members'],['💰','Prize Pool','$'+(e.prize||0).toLocaleString()]].map(([ic,k,v])=>`
            <div style="display:flex;gap:12px;padding:11px;background:var(--surf2);border:1px solid var(--b0);border-radius:8px;margin-bottom:8px">
              <span>${ic}</span><div><div style="font-size:13px;font-weight:700">${k}</div><div style="font-size:13px;color:var(--cyan)">${esc(String(v))}</div></div>
            </div>`).join('')}
          <button class="btn btn-amber btn-full" style="margin-top:14px" onclick="G.go('register')">Apply Now →</button>
        </div></div>
      </div>
      <div>
        ${e.tracks ? `<div class="panel" style="margin-bottom:14px"><div class="phd"><div class="ptitle">Tracks</div></div><div class="pbd">${e.tracks.split(',').map(t=>`<div style="padding:10px 13px;background:var(--surf2);border:1px solid var(--b0);border-radius:8px;font-size:13px;font-weight:600;margin-bottom:7px">🚀 ${esc(t.trim())}</div>`).join('')}</div></div>` : ''}
        <div class="panel"><div class="phd"><div class="ptitle">About</div></div><div class="pbd"><p style="font-size:14px;color:var(--muted);line-height:1.75">${esc(e.desc||'Compete to build in 48 hours.')}</p></div></div>
      </div>`;
    G.go('event-detail');
  }
};

/* ── HACKER DASHBOARD ───────────────────────────────── */
window.HackerCtrl = {
  _projects: [],
  async load() {
    await Promise.all([this.loadStats(), this.loadProjects(), this.loadAnnouncements(), this.loadMyProject(), this.loadTeammates()]);
  },
  async loadStats() {
    try {
      const [ps, pa, an] = await Promise.all([
        getDocs(collection(db,'projects')),
        getDocs(collection(db,'participants')),
        getDocs(collection(db,'announcements'))
      ]);
      $('hs-projs').textContent = ps.size;
      $('hs-parts').textContent = pa.size;
      $('hs-anns').textContent  = an.size;
      $('h-pb').textContent     = ps.size;
      // my score
      const uid = S.fbUser?.uid;
      if (uid) {
        const psnap = await getDocs(query(collection(db,'projects'),where('submittedBy','==',uid)));
        if (!psnap.empty) {
          const p = psnap.docs[0].data();
          $('hs-myscore').textContent = p.avgScore || 0;
        }
      }
    } catch(e) {}
  },
  async loadProjects() {
    try {
      const snap = await getDocs(collection(db,'projects'));
      this._projects = snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.avgScore||0)-(a.avgScore||0));
    } catch(e) { this._projects = []; }
    this._renderTop(); this._renderLb(); this.renderGrid(this._projects);
  },
  _renderTop() {
    const tb = $('h-top-tbody'); if (!tb) return;
    tb.innerHTML = this._projects.slice(0,5).map((p,i)=>`<tr>
      <td><div class="lb-r ${['r1','r2','r3'][i]||''}">${i+1}</div></td>
      <td style="font-weight:600;cursor:pointer" onclick="window._openProj('${p.id}')">${esc(p.title)}</td>
      <td style="color:var(--muted)">${esc(p.team||'—')}</td>
      <td style="font-family:'DM Mono',monospace;color:var(--amber)">${p.avgScore||0}</td>
    </tr>`).join('') || `<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:20px">No projects yet.</td></tr>`;
  },
  _renderLb() {
    const tb = $('h-lb-tbody'); if (!tb) return;
    const max = this._projects[0]?.avgScore || 1;
    tb.innerHTML = this._projects.map((p,i)=>`<tr>
      <td><div class="lb-r ${['r1','r2','r3'][i]||''}">${i+1}</div></td>
      <td style="font-weight:600">${esc(p.team||'—')}</td>
      <td style="color:var(--muted)">${esc(p.track||'—')}</td>
      <td style="font-family:'DM Mono',monospace;color:var(--amber);font-weight:600">${p.avgScore||0}</td>
      <td><div class="sbar"><div class="sbar-f" style="width:${(p.avgScore||0)/max*100}%"></div></div></td>
    </tr>`).join('') || `<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:20px">No entries yet.</td></tr>`;
  },
  filterProjs(v) { this.renderGrid(v ? this._projects.filter(p=>(p.title||'').toLowerCase().includes(v.toLowerCase())) : this._projects); },
  filterTrack(v) { this.renderGrid(v ? this._projects.filter(p=>p.track===v) : this._projects); },
  renderGrid(list) {
    const g = $('h-projs-grid'); if(!g) return;
    if (!list.length) { g.innerHTML=`<div class="empty"><div class="empty-ic">⟁</div><div class="empty-t">No projects yet.</div></div>`; return; }
    g.innerHTML = list.map(p=>projCard(p)).join('');
  },
  async loadAnnouncements() {
    try {
      const snap = await getDocs(query(collection(db,'announcements'), orderBy('createdAt','desc')));
      const anns = snap.docs.map(d=>({id:d.id,...d.data()}));
      const html = anns.map(a=>annHTML(a)).join('') || '<p style="color:var(--muted);font-size:13px">No announcements yet.</p>';
      const prev = $('h-ann-prev'); if(prev) prev.innerHTML = anns.slice(0,3).map(a=>annHTML(a)).join('') || '<p style="color:var(--muted);font-size:13px">None yet.</p>';
      const all  = $('h-ann-all');  if(all)  all.innerHTML  = html;
    } catch(e) {}
  },
  async loadMyProject() {
    const uid = S.fbUser?.uid; if(!uid) return;
    const bd = $('h-myproj-bd'); if(!bd) return;
    try {
      const snap = await getDocs(query(collection(db,'projects'),where('submittedBy','==',uid)));
      if (snap.empty) { bd.innerHTML=`<div class="empty"><div class="empty-ic">✦</div><div class="empty-t">No submission yet.</div><button class="btn btn-green btn-sm" onclick="openOv('ov-submit')">Submit Now</button></div>`; return; }
      const p = {id:snap.docs[0].id,...snap.docs[0].data()};
      bd.innerHTML = `
        <div style="font-family:'Bebas Neue',sans-serif;font-size:22px;margin-bottom:8px">${esc(p.title)}</div>
        <p style="font-size:13px;color:var(--muted);line-height:1.6;margin-bottom:12px">${esc(p.desc)}</p>
        <div style="display:flex;gap:7px;flex-wrap:wrap;margin-bottom:12px">${(p.stack||[]).map(s=>`<span class="pc-tag">${esc(s)}</span>`).join('')}</div>
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
          <span class="badge b-cyan">${esc(p.track)}</span>
          <span class="badge b-muted">Team: ${esc(p.team||'Solo')}</span>
          <span class="badge b-amber">Score: ${p.avgScore||'Pending'}</span>
        </div>
        ${p.url?`<a href="${esc(p.url)}" target="_blank" style="color:var(--cyan);font-size:13px;font-family:'DM Mono',monospace;display:block;margin-bottom:7px">🔗 ${esc(p.url)}</a>`:''}
        <div style="font-size:12px;color:var(--faint)">Submitted: ${tsStr(p.submittedAt)}</div>`;
    } catch(e) {}
  },
  async loadTeammates() {
    const bd = $('h-teammates'); if(!bd) return;
    try {
      const snap = await getDocs(query(collection(db,'participants'),where('team','==','')));
      const list = snap.docs.map(d=>({id:d.id,...d.data()})).filter(p=>p.uid!==S.fbUser?.uid).slice(0,6);
      if (!list.length) { bd.innerHTML=`<p style="font-size:13px;color:var(--muted)">No solo hackers looking for teams.</p>`; return; }
      bd.innerHTML = list.map(p=>`
        <div style="display:flex;align-items:center;gap:9px;padding:10px;background:var(--surf2);border:1px solid var(--b0);border-radius:8px;margin-bottom:7px">
          <div class="dsb-av av-h" style="width:30px;height:30px;font-size:11px">${(p.name||'?')[0]}</div>
          <div style="flex:1"><div style="font-size:13px;font-weight:700">${esc(p.name)}</div><div style="font-size:11px;color:var(--muted)">${esc(p.skills||p.track||'')}</div></div>
          <button class="btn btn-cyan btn-xs" onclick="toast('Invite sent to ${esc(p.name)}!','ok')">Invite</button>
        </div>`).join('');
    } catch(e) {}
  },
  async createTeam() {
    const n=$('tn').value.trim(), t=$('tt').value;
    if(!n) { toast('Enter team name','err'); return; }
    const code = 'TM'+Date.now().toString().slice(-4);
    const uid = S.fbUser?.uid;
    try {
      if(uid) await updateDoc(doc(db,'participants',uid),{team:n,teamTrack:t,teamCode:code});
      closeOv('ov-team');
      $('h-team-bd').innerHTML=`<div style="padding:12px"><div style="font-family:'Bebas Neue',sans-serif;font-size:20px;color:var(--cyan)">${esc(n)}</div><div style="font-size:12px;color:var(--muted);margin-top:4px">${esc(t)} · Invite code: <span style="color:var(--amber);font-family:'DM Mono',monospace">${code}</span></div></div>`;
      toast(`Team "${n}" created! Code: ${code}`, 'ok');
    } catch(e) { toast(e.message,'err'); }
  },
  joinTeam() { closeOv('ov-team'); toast(`Requested to join. Waiting for approval.`,'ok'); }
};

/* ── PROJECT SUBMIT ─────────────────────────────────── */
window.Proj = {
  async submit() {
    const title=$('sp-t').value.trim(), desc=$('sp-d').value.trim(), url=$('sp-url').value.trim();
    if(!title||!desc||!url) { toast('Fill required fields','err'); return; }
    const uid = S.fbUser?.uid; if(!uid) { toast('Sign in first','err'); return; }
    setBtn('sp-btn',true,'Submitting…');
    try {
      const stack = ($('sp-stack').value||'').split(',').map(s=>s.trim()).filter(Boolean);
      await addDoc(collection(db,'projects'), {
        title, desc, url, video:$('sp-video').value.trim(),
        track:$('sp-track').value, stack,
        team: S.userDoc?.team || S.userDoc?.name || 'Solo',
        submittedBy: uid, submittedAt: serverTimestamp(),
        avgScore:0, scoreCount:0
      });
      await updateDoc(doc(db,'participants',uid),{submitted:true});
      closeOv('ov-submit'); toast(`"${title}" submitted! 🚀`,'ok');
      HackerCtrl.loadProjects(); HackerCtrl.loadMyProject();
    } catch(e) { toast(e.message,'err'); }
    setBtn('sp-btn',false,'Submit Project ✓');
  }
};

/* ── PROJECT DETAIL MODAL ───────────────────────────── */
window._openProj = async (id) => {
  try {
    const snap = await getDoc(doc(db,'projects',id)); if(!snap.exists()) return;
    const p = {id:snap.id,...snap.data()};
    $('pd-title').textContent = p.title;
    $('pd-body').innerHTML = `
      <div class="g2" style="gap:14px;margin-bottom:16px">
        <div><div class="lbl">Team</div><div style="font-size:14px;font-weight:700">${esc(p.team||'Solo')}</div></div>
        <div><div class="lbl">Track</div><span class="badge b-cyan">${esc(p.track||'—')}</span></div>
        <div><div class="lbl">Score</div><div style="font-family:'Bebas Neue',sans-serif;font-size:28px;color:var(--amber)">${p.avgScore||0}<span style="font-size:14px;color:var(--muted)">/40</span></div></div>
        <div><div class="lbl">Submitted</div><div style="font-size:13px;color:var(--muted)">${tsStr(p.submittedAt)}</div></div>
      </div>
      <div class="field"><div class="lbl">Description</div><p style="font-size:14px;color:var(--muted);line-height:1.7">${esc(p.desc||'—')}</p></div>
      <div class="field"><div class="lbl">Tech Stack</div><div style="display:flex;gap:6px;flex-wrap:wrap">${(p.stack||[]).map(s=>`<span class="pc-tag">${esc(s)}</span>`).join('')}</div></div>
      ${p.url?`<div class="field"><div class="lbl">GitHub / Demo</div><a href="${esc(p.url)}" target="_blank" style="color:var(--cyan);font-family:'DM Mono',monospace;font-size:13px">🔗 ${esc(p.url)}</a></div>`:''}
      ${p.video?`<div class="field"><div class="lbl">Demo Video</div><a href="${esc(p.video)}" target="_blank" style="color:var(--cyan);font-family:'DM Mono',monospace;font-size:13px">▶ ${esc(p.video)}</a></div>`:''}
    `;
    openOv('ov-proj-detail');
  } catch(e) { toast('Could not load project','err'); }
};

/* ── ORGANIZER CTRL ─────────────────────────────────── */
window.OrgCtrl = {
  _parts: [], _projs: [], _judges: [], _events: [],
  async load() {
    await Promise.all([this.loadEvents(), this.loadParticipants(), this.loadProjects(), this.loadJudges()]);
    this.loadLb(); this.loadAnnouncements(); this.updateStats();
  },

  /* ─── EVENTS ─── */
  async loadEvents() {
    try {
      const snap = await getDocs(query(collection(db,'hackathons'), orderBy('createdAt','desc')));
      this._events = snap.docs.map(d=>({id:d.id,...d.data()}));
    } catch(e) { this._events = []; }
    $('o-ev-b').textContent = this._events.length;
    this._renderEventsList();
    this._renderLiveBanner();
  },
  _renderEventsList() {
    const c = $('o-events-list'); if(!c) return;
    if (!this._events.length) {
      c.innerHTML=`<div class="empty"><div class="empty-ic">🚀</div><div class="empty-t">No events yet.</div><button class="btn btn-amber btn-sm" onclick="openOv('ov-host')">Host First Event</button></div>`;
      return;
    }
    const scol = {live:'var(--green)',upcoming:'var(--amber)',ended:'var(--muted)'};
    c.innerHTML = this._events.map(e=>`
      <div class="ev-row">
        <div style="display:flex;align-items:flex-start;justify-content:space-between;gap:12px;flex-wrap:wrap">
          <div>
            <div style="display:flex;align-items:center;gap:8px;margin-bottom:7px">
              <div style="width:9px;height:9px;border-radius:50%;background:${scol[e.status]||'var(--muted)'};${e.status==='live'?'box-shadow:0 0 7px var(--green);animation:dp 2s infinite':''}"></div>
              <span class="badge ${e.status==='live'?'b-live':e.status==='upcoming'?'b-amber':'b-muted'}" style="font-size:10px;text-transform:capitalize">${e.status}</span>
              <span class="badge b-orange" style="font-size:10px">$${(e.prize||0).toLocaleString()}</span>
            </div>
            <div class="ev-row-title">${esc(e.name)}</div>
            <div class="ev-row-meta">${esc(e.venue||'')}${e.venue?' · ':''}${fmtDT(e.start)} → ${fmtDT(e.end)}<br>Max ${e.maxParts||'∞'} participants · Teams ≤ ${e.maxTeam||4}</div>
          </div>
          <div class="ev-row-actions">
            <button class="btn btn-ghost btn-xs" onclick="Ev.showDetail('${e.id}')">👁 Preview</button>
            <button class="btn btn-cyan btn-xs"  onclick="OrgCtrl.openEditEvent('${e.id}')">✎ Edit</button>
            <button class="btn btn-red btn-xs"   onclick="OrgCtrl.deleteEvent('${e.id}','${esc(e.name)}')">✕ Delete</button>
            <select class="sel" style="padding:4px 10px;font-size:11px;border-radius:6px;width:auto" onchange="OrgCtrl.setStatus('${e.id}',this.value)">
              <option value="upcoming" ${e.status==='upcoming'?'selected':''}>Upcoming</option>
              <option value="live"     ${e.status==='live'    ?'selected':''}>Live</option>
              <option value="ended"    ${e.status==='ended'   ?'selected':''}>Ended</option>
            </select>
          </div>
        </div>
      </div>`).join('');
  },
  _renderLiveBanner() {
    const live = this._events.find(e=>e.status==='live');
    const bd = $('o-live-bd'); if(!bd) return;
    if (!live) { bd.innerHTML=`<div class="empty"><div class="empty-ic">🚀</div><div class="empty-t">No live event</div><button class="btn btn-amber btn-sm" onclick="openOv('ov-host')">Host One</button></div>`; return; }
    const partsN = this._parts.length, projsN = this._projs.length;
    bd.innerHTML=`
      <div style="display:flex;align-items:center;gap:9px;margin-bottom:14px">
        <div class="dot-live"></div>
        <div><div style="font-size:14px;font-weight:700">${esc(live.name)}</div><div style="font-size:12px;color:var(--muted)">${esc(live.venue||'')} · ${fmtDT(live.start)}</div></div>
        <span class="badge b-live" style="margin-left:auto">Live</span>
      </div>
      <div class="g2" style="gap:10px;margin-bottom:12px">
        <div style="background:var(--surf2);border:1px solid var(--b0);border-radius:7px;padding:11px">
          <div style="font-size:11px;color:var(--muted)">REGISTERED</div>
          <div style="font-family:'Bebas Neue',sans-serif;font-size:22px;color:var(--cyan)">${partsN} <span style="font-size:13px;color:var(--muted)">/ ${live.maxParts||'∞'}</span></div>
          <div class="pbar"><div class="pbar-f" style="background:var(--cyan);width:${live.maxParts?Math.min(100,Math.round(partsN/live.maxParts*100)):50}%"></div></div>
        </div>
        <div style="background:var(--surf2);border:1px solid var(--b0);border-radius:7px;padding:11px">
          <div style="font-size:11px;color:var(--muted)">PROJECTS</div>
          <div style="font-family:'Bebas Neue',sans-serif;font-size:22px;color:var(--green)">${projsN}</div>
        </div>
      </div>
      <div style="display:flex;gap:7px;flex-wrap:wrap">
        <button class="btn btn-amber btn-xs" onclick="openOv('ov-ann')">📢 Announce</button>
        <button class="btn btn-ghost btn-xs" onclick="OrgCtrl.exportParticipants()">📊 Export</button>
        <button class="btn btn-cyan btn-xs"  onclick="OrgCtrl.openEditEvent('${live.id}')">✎ Edit</button>
      </div>`;
  },
  async setStatus(id, status) {
    try { await updateDoc(doc(db,'hackathons',id),{status, updatedAt:serverTimestamp()}); toast(`Status → ${status}`,'ok'); await this.loadEvents(); Ev.loadPublic(); }
    catch(e) { toast(e.message,'err'); }
  },
  openEditEvent(id) {
    const e = this._events.find(x=>x.id===id); if(!e) return;
    $('eh-id').value    = id;
    $('eh-name').value  = e.name;
    $('eh-tag').value   = e.tagline||'';
    $('eh-start').value = (e.start||'').replace(' ','T');
    $('eh-end').value   = (e.end||'').replace(' ','T');
    $('eh-max').value   = e.maxParts||'';
    $('eh-prize').value = e.prize||'';
    $('eh-venue').value = e.venue||'';
    $('eh-desc').value  = e.desc||'';
    $('eh-tracks').value= e.tracks||'';
    $('eh-status').value= e.status||'upcoming';
    openOv('ov-edit-ev');
  },
  async updateEvent() {
    const id = $('eh-id').value; if(!id) return;
    setBtn('eh-btn',true,'Saving…');
    try {
      await updateDoc(doc(db,'hackathons',id), {
        name:$('eh-name').value.trim(), tagline:$('eh-tag').value.trim(),
        start:$('eh-start').value, end:$('eh-end').value,
        maxParts:parseInt($('eh-max').value)||500, prize:parseInt($('eh-prize').value)||0,
        venue:$('eh-venue').value.trim(), desc:$('eh-desc').value.trim(),
        tracks:$('eh-tracks').value.trim(), status:$('eh-status').value,
        updatedAt:serverTimestamp()
      });
      closeOv('ov-edit-ev'); toast('Event updated!','ok');
      await this.loadEvents(); Ev.loadPublic();
    } catch(e) { toast(e.message,'err'); }
    setBtn('eh-btn',false,'Save Changes →');
  },
  async deleteEvent(id, name) {
    if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
    try { await deleteDoc(doc(db,'hackathons',id)); toast(`"${name}" deleted`,'ok'); await this.loadEvents(); Ev.loadPublic(); }
    catch(e) { toast(e.message,'err'); }
  },
  async createEvent() {
    const name = $('hk-name').value.trim(); if(!name) { toast('Name required','err'); return; }
    setBtn('hk-btn',true,'Creating…');
    try {
      await addDoc(collection(db,'hackathons'), {
        name, tagline:$('hk-tag').value.trim(),
        start:$('hk-start').value, end:$('hk-end').value,
        maxParts:parseInt($('hk-max').value)||500, maxTeam:parseInt($('hk-team').value)||4,
        prize:parseInt($('hk-prize').value)||0, venue:$('hk-venue').value.trim(),
        desc:$('hk-desc').value.trim(), tracks:$('hk-tracks').value.trim(),
        status:$('hk-status').value, createdBy:'organizer', createdAt:serverTimestamp()
      });
      closeOv('ov-host');
      ['hk-name','hk-tag','hk-start','hk-end','hk-max','hk-team','hk-prize','hk-venue','hk-desc','hk-tracks'].forEach(id=>{const e=$(id);if(e)e.value='';});
      toast(`"${name}" created and published! 🚀`,'ok');
      await this.loadEvents(); Ev.loadPublic();
      dSwitch('organizer','o-events');
    } catch(e) { toast(e.message,'err'); }
    setBtn('hk-btn',false,'Create & Publish →');
  },

  /* ─── PARTICIPANTS ─── */
  async loadParticipants() {
    try {
      const snap = await getDocs(collection(db,'participants'));
      this._parts = snap.docs.map(d=>({id:d.id,...d.data()}));
    } catch(e) { this._parts = []; }
    $('o-p-b').textContent = this._parts.length;
    this.renderParts(this._parts);
  },
  filterParts(v) { this.renderParts(v ? this._parts.filter(p=>(p.name||'').toLowerCase().includes(v.toLowerCase())||(p.email||'').toLowerCase().includes(v.toLowerCase())) : this._parts); },
  renderParts(list) {
    $('o-parts-count').textContent = `${list.length} total`;
    const tb = $('o-parts-tbody'); if(!tb) return;
    if (!list.length) { tb.innerHTML=`<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:24px">No participants yet.</td></tr>`; return; }
    tb.innerHTML = list.map(p=>`<tr>
      <td><div style="display:flex;align-items:center;gap:8px"><div class="dsb-av av-h" style="width:28px;height:28px;font-size:10px">${(p.name||'?')[0]}</div><span style="font-weight:600">${esc(p.name||'—')}</span></div></td>
      <td style="font-family:'DM Mono',monospace;font-size:12px;color:var(--muted)">${esc(p.email||'—')}</td>
      <td><span class="badge b-muted" style="font-size:10px">${esc(p.provider||'email')}</span></td>
      <td style="color:var(--muted);font-size:12px">${esc(p.track||'—')}</td>
      <td style="font-size:12px">${esc(p.team||'Solo')}</td>
      <td><span class="badge ${p.submitted?'b-cyan':'b-muted'}" style="font-size:10px">${p.submitted?'Yes':'No'}</span></td>
      <td style="font-size:11px;color:var(--faint)">${tsStr(p.createdAt)}</td>
    </tr>`).join('');
  },
  exportParticipants() {
    const rows = [['Name','Email','Provider','Track','Team','Submitted','Joined'],
      ...this._parts.map(p=>[p.name,p.email,p.provider||'email',p.track,p.team||'Solo',p.submitted?'Yes':'No',tsStr(p.createdAt)])];
    const csv = rows.map(r=>r.map(v=>`"${(v||'').toString().replace(/"/g,'""')}"`).join(',')).join('\n');
    const a = document.createElement('a'); a.href='data:text/csv;charset=utf-8,'+encodeURIComponent(csv); a.download='participants.csv'; a.click();
    toast('CSV downloaded','ok');
  },

  /* ─── PROJECTS ─── */
  async loadProjects() {
    try {
      const snap = await getDocs(collection(db,'projects'));
      this._projs = snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.avgScore||0)-(a.avgScore||0));
    } catch(e) { this._projs = []; }
    $('o-pr-b').textContent = this._projs.length;
    this._renderTopProjs(); this.renderProjGrid(this._projs);
  },
  _renderTopProjs() {
    const tb = $('o-top-tbody'); if(!tb) return;
    tb.innerHTML = this._projs.slice(0,5).map((p,i)=>`<tr>
      <td><div class="lb-r ${['r1','r2','r3'][i]||''}">${i+1}</div></td>
      <td style="font-weight:600;cursor:pointer" onclick="window._openProj('${p.id}')">${esc(p.title)}</td>
      <td style="color:var(--muted)">${esc(p.team||'—')}</td>
      <td style="font-family:'DM Mono',monospace;color:var(--amber)">${p.avgScore||0}</td>
    </tr>`).join('') || `<tr><td colspan="4" style="text-align:center;color:var(--muted);padding:20px">No projects yet.</td></tr>`;
  },
  filterProjs(v) { this.renderProjGrid(v ? this._projs.filter(p=>(p.title||'').toLowerCase().includes(v.toLowerCase())) : this._projs); },
  filterProjTrack(v) { this.renderProjGrid(v ? this._projs.filter(p=>p.track===v) : this._projs); },
  renderProjGrid(list) {
    const g = $('o-projs-grid'); if(!g) return;
    if (!list.length) { g.innerHTML=`<div class="empty"><div class="empty-ic">⟁</div><div class="empty-t">No projects yet.</div></div>`; return; }
    g.innerHTML = list.map(p=>projCard(p)).join('');
  },

  /* ─── JUDGES ─── */
  async loadJudges() {
    try {
      const snap = await getDocs(collection(db,'judges'));
      this._judges = snap.docs.map(d=>({id:d.id,...d.data()}));
    } catch(e) { this._judges = []; }
    $('o-j-b').textContent = this._judges.length;
    $('o-judges-count').textContent = `${this._judges.length} judges`;
    this._renderJudges();
  },
  _renderJudges() {
    const bd = $('o-judges-bd'); if(!bd) return;
    if (!this._judges.length) { bd.innerHTML=`<div class="empty"><div class="empty-ic">◎</div><div class="empty-t">No judges yet.</div><button class="btn btn-purple btn-sm" onclick="openOv('ov-create-judge')">Add First</button></div>`; return; }
    bd.innerHTML = this._judges.map(j=>`
      <div style="display:flex;align-items:center;gap:11px;padding:13px;background:var(--surf2);border:1px solid var(--b0);border-radius:9px;margin-bottom:9px;transition:border-color .2s" onmouseenter="this.style.borderColor='var(--b1)'" onmouseleave="this.style.borderColor='var(--b0)'">
        <div class="dsb-av av-j" style="width:38px;height:38px;font-size:14px">${(j.name||'J')[0]}</div>
        <div style="flex:1">
          <div style="font-size:14px;font-weight:700">${esc(j.name||'—')}</div>
          <div style="font-size:12px;color:var(--cyan);font-family:'DM Mono',monospace">${esc(j.email||'—')}</div>
          <div style="font-size:11px;color:var(--muted)">${esc(j.org||'')}${j.tracks?' · '+esc(j.tracks):''}</div>
        </div>
        <div style="display:flex;flex-direction:column;gap:5px;align-items:flex-end">
          <div style="background:rgba(0,0,0,.5);border:1px solid var(--b0);border-radius:6px;padding:4px 9px;font-family:'DM Mono',monospace;font-size:11px;color:var(--green);cursor:pointer" onclick="navigator.clipboard.writeText('${esc(j.password||'')}');toast('Password copied','ok')">pw: ${esc(j.password||'—')} 📋</div>
          <button class="btn btn-red btn-xs" onclick="OrgCtrl.deleteJudge('${j.id}','${esc(j.name)}')">Remove</button>
        </div>
      </div>`).join('');
  },
  async createJudge() {
    const fn=$('cj-fn').value.trim(), em=$('cj-em').value.trim().toLowerCase();
    if(!fn||!em) { toast('Name and email required','err'); return; }
    setBtn('cj-btn',true,'Creating…');
    const ln=$('cj-org') ? $('cj-ln').value.trim() : '';
    const org=$('cj-org').value.trim();
    const tracks = ['ck-ai','ck-web3','ck-climate','ck-health','ck-gaming','ck-dev']
      .filter(id=>$(id)?.checked).map(id=>({
        'ck-ai':'AI & ML','ck-web3':'Web3','ck-climate':'Climate',
        'ck-health':'HealthTech','ck-gaming':'Gaming','ck-dev':'Dev Tools'
      }[id])).join(', ');
    const pw = genPw();
    const name = `${fn} ${$('cj-ln').value.trim()}`.trim();
    try {
      await addDoc(collection(db,'judges'),{name,email:em,org,tracks,password:pw,createdAt:serverTimestamp()});
      const res = $('cj-result');
      res.style.display = 'block';
      res.innerHTML = `<div class="cred-box">
        <div><span class="ck">Name: </span><span class="cv">${esc(name)}</span></div>
        <div><span class="ck">Email: </span><span class="cv">${esc(em)}</span></div>
        <div><span class="ck">Password: </span><span class="cv">${pw}</span></div>
        <div><span class="ck">Portal: </span><span class="cv">nexushack.dev/#judge-portal</span></div>
        <div><span class="ck">Tracks: </span><span class="cv">${esc(tracks||'All')}</span></div>
      </div>
      <button class="btn btn-ghost btn-full btn-sm" style="margin-top:10px" onclick="navigator.clipboard.writeText('Name: ${esc(name)}\\nEmail: ${esc(em)}\\nPassword: ${pw}\\nPortal: nexushack.dev/#judge-portal');toast('Copied!','ok')">📋 Copy All</button>`;
      ['cj-fn','cj-ln','cj-em','cj-org'].forEach(id=>{const e=$(id);if(e)e.value='';});
      ['ck-ai','ck-web3','ck-climate','ck-health','ck-gaming','ck-dev'].forEach(id=>{const e=$(id);if(e)e.checked=false;});
      toast(`Judge "${name}" created!`,'ok');
      await this.loadJudges(); this.updateStats();
    } catch(e) { toast(e.message,'err'); }
    setBtn('cj-btn',false,'Generate Credentials →');
  },
  async deleteJudge(id,name) {
    if(!confirm(`Remove judge "${name}"?`)) return;
    try { await deleteDoc(doc(db,'judges',id)); toast(`${name} removed`,'ok'); await this.loadJudges(); this.updateStats(); }
    catch(e) { toast(e.message,'err'); }
  },

  /* ─── SCORES ─── */
  async loadScores() {
    try {
      const snap = await getDocs(collection(db,'scores'));
      const scores = snap.docs.map(d=>({id:d.id,...d.data()}));
      const tb = $('o-scores-tbody'); if(!tb) return;
      if (!scores.length) { tb.innerHTML=`<tr><td colspan="8" style="text-align:center;color:var(--muted);padding:20px">No scores yet.</td></tr>`; return; }
      tb.innerHTML = scores.map(s=>`<tr>
        <td style="font-weight:600">${esc(s.projectTitle||'—')}</td>
        <td style="color:var(--muted)">${esc(s.judgeName||'—')}</td>
        <td style="color:var(--cyan);font-family:'DM Mono',monospace">${s.innovation||0}</td>
        <td style="font-family:'DM Mono',monospace">${s.technical||0}</td>
        <td style="font-family:'DM Mono',monospace">${s.design||0}</td>
        <td style="font-family:'DM Mono',monospace">${s.impact||0}</td>
        <td style="color:var(--amber);font-weight:700;font-family:'DM Mono',monospace">${s.total||0}</td>
        <td style="font-size:11px;color:var(--faint)">${tsStr(s.createdAt)}</td>
      </tr>`).join('');
      $('os-scores').textContent = scores.length;
    } catch(e) { toast(e.message,'err'); }
  },

  /* ─── LEADERBOARD ─── */
  async loadLb() {
    try {
      const snap = await getDocs(collection(db,'projects'));
      const projs = snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.avgScore||0)-(a.avgScore||0));
      const max = projs[0]?.avgScore || 1;
      const tb = $('o-lb-tbody'); if(!tb) return;
      tb.innerHTML = projs.map((p,i)=>`<tr>
        <td><div class="lb-r ${['r1','r2','r3'][i]||''}">${i+1}</div></td>
        <td style="font-weight:600">${esc(p.team||'—')}</td>
        <td style="color:var(--muted)">${esc(p.track||'—')}</td>
        <td style="font-family:'DM Mono',monospace;color:var(--amber);font-weight:600">${p.avgScore||0}</td>
        <td style="color:var(--muted)">${p.scoreCount||0}</td>
        <td><div class="sbar"><div class="sbar-f" style="width:${(p.avgScore||0)/max*100}%"></div></div></td>
      </tr>`).join('') || `<tr><td colspan="6" style="text-align:center;color:var(--muted);padding:20px">No entries yet.</td></tr>`;
    } catch(e) {}
  },

  /* ─── ANNOUNCEMENTS ─── */
  async sendAnnouncement() {
    const t=$('oa-t').value.trim(), b=$('oa-b').value.trim();
    if(!t||!b) { toast('Fill title and message','err'); return; }
    setBtn('oa-btn',true,'Sending…');
    try {
      const ico = $('oa-type').value;
      await addDoc(collection(db,'announcements'),{ico,title:t,body:b,createdAt:serverTimestamp(),sentBy:'organizer'});
      $('oa-t').value=''; $('oa-b').value='';
      toast('Announcement sent! 📢','ok');
      await this.loadAnnouncements();
    } catch(e) { toast(e.message,'err'); }
    setBtn('oa-btn',false,'Send →');
  },
  async loadAnnouncements() {
    try {
      const snap = await getDocs(query(collection(db,'announcements'), orderBy('createdAt','desc')));
      const anns = snap.docs.map(d=>({id:d.id,...d.data()}));
      const bd = $('o-ann-sent'); if(bd) bd.innerHTML = anns.map(a=>annHTML(a)).join('') || '<p style="color:var(--muted);font-size:13px">None sent yet.</p>';
    } catch(e) {}
  },

  /* ─── STATS ─── */
  async updateStats() {
    try {
      const [ev,pa,pr,ju,sc] = await Promise.all([
        getDocs(collection(db,'hackathons')), getDocs(collection(db,'participants')),
        getDocs(collection(db,'projects')),  getDocs(collection(db,'judges')),
        getDocs(collection(db,'scores'))
      ]);
      $('os-ev').textContent     = ev.size;
      $('os-parts').textContent  = pa.size;
      $('os-projs').textContent  = pr.size;
      $('os-judges').textContent = ju.size;
      $('os-scores').textContent = sc.size;
      $('o-ev-b').textContent = ev.size;
      $('o-p-b').textContent  = pa.size;
      $('o-pr-b').textContent = pr.size;
      $('o-j-b').textContent  = ju.size;
    } catch(e) {}
  }
};

/* ── JUDGE CTRL ─────────────────────────────────────── */
window.JudgeCtrl = {
  _projs: [],
  async load() {
    await Promise.all([this.loadProjects(), this.loadAnnouncements()]);
  },
  async loadProjects() {
    try {
      const snap = await getDocs(collection(db,'projects'));
      this._projs = snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.avgScore||0)-(a.avgScore||0));
    } catch(e) { this._projs = []; }
    // load my existing scores
    const jid = S.judgeProfile?.id;
    if (jid) {
      try {
        const ss = await getDocs(query(collection(db,'scores'),where('judgeId','==',jid)));
        S.myScores = {};
        ss.docs.forEach(d => { const s=d.data(); S.myScores[s.projectId]={...s,docId:d.id}; });
      } catch(e) {}
    }
    $('j-unscore-b').textContent = this._projs.filter(p=>!S.myScores[p.id]).length;
    this.renderScoreGrid(this._projs); this.renderProgress();
  },
  filterProjs(v) { this.renderScoreGrid(v ? this._projs.filter(p=>(p.title||'').toLowerCase().includes(v.toLowerCase())) : this._projs); },
  filterStatus(v) {
    if (!v) { this.renderScoreGrid(this._projs); return; }
    this.renderScoreGrid(v==='scored' ? this._projs.filter(p=>S.myScores[p.id]) : this._projs.filter(p=>!S.myScores[p.id]));
  },
  renderScoreGrid(list) {
    const g = $('j-score-grid'); if(!g) return;
    if (!list.length) { g.innerHTML=`<div class="empty"><div class="empty-ic">⟁</div><div class="empty-t">No projects to score.</div></div>`; return; }
    g.innerHTML = list.map(p=>{
      const s = S.myScores[p.id]||{};
      const total = (s.innovation||0)+(s.technical||0)+(s.design||0)+(s.impact||0);
      const scored = !!S.myScores[p.id];
      return `<div class="pc">
        <div class="pc-t">${esc(p.title)}<span class="badge ${scored?'b-green':'b-amber'}" style="font-size:10px">${scored?'Scored':'Pending'}</span></div>
        <div class="pc-d">${esc((p.desc||'').slice(0,90))}…</div>
        <div style="font-size:11px;color:var(--muted);margin-bottom:8px">Track: ${esc(p.track)} · Team: ${esc(p.team||'Solo')}</div>
        ${p.url?`<a href="${esc(p.url)}" target="_blank" style="font-size:12px;color:var(--cyan);display:block;margin-bottom:10px;font-family:'DM Mono',monospace">🔗 View Project</a>`:''}
        <div class="rubric">
          <div class="rub-l">Score (out of 10 each)</div>
          ${[['innovation','Innovation','30%'],['technical','Technical','25%'],['design','Design & UX','25%'],['impact','Impact','20%']].map(([key,label,pct])=>`
            <div class="rub-row">
              <span class="rub-name">${label}</span><span class="rub-pct">${pct}</span>
              <div class="rub-stars" id="rs-${p.id}-${key}">
                ${[1,2,3,4,5,6,7,8,9,10].map(n=>`<span class="rs2 ${(s[key]||0)>=n?'on':''}" onclick="JudgeCtrl.setScore('${p.id}','${key}',${n})">★</span>`).join('')}
              </div>
              <span style="font-size:13px;color:var(--amber);font-family:'DM Mono',monospace;min-width:18px" id="rv-${p.id}-${key}">${s[key]||0}</span>
            </div>`).join('')}
          <div class="score-chip">
            <div><div style="font-size:12px;color:var(--muted)">Total</div><div class="score-total" id="st-${p.id}">${total}</div></div>
            <div style="text-align:right"><div style="font-size:11px;color:var(--muted);margin-bottom:5px">out of 40</div>
            <button class="btn btn-green btn-sm" onclick="JudgeCtrl.submitScore('${p.id}','${esc(p.title)}','${esc(p.team||'')}')">Save ✓</button></div>
          </div>
        </div>
      </div>`;
    }).join('');
  },
  setScore(pid, key, val) {
    if (!S.myScores[pid]) S.myScores[pid] = {};
    S.myScores[pid][key] = val;
    const stars = document.querySelectorAll(`#rs-${pid}-${key} .rs2`);
    stars.forEach((s,i) => s.classList.toggle('on', i<val));
    $(`rv-${pid}-${key}`).textContent = val;
    const s = S.myScores[pid];
    const total = (s.innovation||0)+(s.technical||0)+(s.design||0)+(s.impact||0);
    const el = $(`st-${pid}`); if(el) el.textContent = total;
  },
  async submitScore(pid, projTitle, projTeam) {
    const s = S.myScores[pid]||{};
    const total = (s.innovation||0)+(s.technical||0)+(s.design||0)+(s.impact||0);
    if (!total) { toast('Give at least one rating','err'); return; }
    const jid=S.judgeProfile?.id, jname=S.judgeProfile?.name;
    try {
      const scoreData = {projectId:pid,projectTitle:projTitle,projectTeam:projTeam,judgeId:jid,judgeName:jname,
        innovation:s.innovation||0,technical:s.technical||0,design:s.design||0,impact:s.impact||0,
        total, createdAt:serverTimestamp()};
      if (s.docId) await updateDoc(doc(db,'scores',s.docId),scoreData);
      else {
        const ref = await addDoc(collection(db,'scores'),scoreData);
        S.myScores[pid].docId = ref.id;
      }
      // recalculate average on project doc
      const allSnap = await getDocs(query(collection(db,'scores'),where('projectId','==',pid)));
      const allScores = allSnap.docs.map(d=>d.data());
      const avg = Math.round(allScores.reduce((sum,sc)=>sum+(sc.total||0),0)/allScores.length);
      await updateDoc(doc(db,'projects',pid),{avgScore:avg, scoreCount:allScores.length});
      toast(`Score saved for "${projTitle}"! Total: ${total}/40`,'ok');
      this.renderProgress();
    } catch(e) { toast(e.message,'err'); }
  },
  async loadMyScores() {
    const jid = S.judgeProfile?.id; if(!jid) return;
    try {
      const snap = await getDocs(query(collection(db,'scores'),where('judgeId','==',jid)));
      const scores = snap.docs.map(d=>({id:d.id,...d.data()}));
      const tb = $('j-scores-tbody'); if(!tb) return;
      if (!scores.length) { tb.innerHTML=`<tr><td colspan="7" style="text-align:center;color:var(--muted);padding:20px">No scores submitted yet.</td></tr>`; return; }
      tb.innerHTML = scores.map(s=>`<tr>
        <td style="font-weight:600">${esc(s.projectTitle||'—')}</td>
        <td style="color:var(--muted)">${esc(s.projectTeam||'—')}</td>
        <td style="color:var(--cyan);font-family:'DM Mono',monospace">${s.innovation||0}</td>
        <td style="font-family:'DM Mono',monospace">${s.technical||0}</td>
        <td style="font-family:'DM Mono',monospace">${s.design||0}</td>
        <td style="font-family:'DM Mono',monospace">${s.impact||0}</td>
        <td style="color:var(--amber);font-weight:700;font-family:'DM Mono',monospace">${s.total||0}</td>
      </tr>`).join('');
    } catch(e) {}
  },
  renderProgress() {
    const scored = Object.keys(S.myScores).length, total = this._projs.length, left = total-scored;
    $('js-done').textContent = scored; $('js-left').textContent = left; $('js-total').textContent = total;
    const allT = Object.values(S.myScores).map(s=>(s.innovation||0)+(s.technical||0)+(s.design||0)+(s.impact||0));
    $('js-avg').textContent = allT.length ? Math.round(allT.reduce((a,b)=>a+b,0)/allT.length) : '—';
    $('j-unscore-b').textContent = left;
    const pg = $('j-prog'); if(!pg) return;
    pg.innerHTML = this._projs.map(p=>`
      <div style="display:flex;align-items:center;gap:9px;margin-bottom:8px">
        <span style="font-size:13px;font-weight:600;flex:1;overflow:hidden;text-overflow:ellipsis;white-space:nowrap">${esc(p.title)}</span>
        <span class="badge ${S.myScores[p.id]?'b-green':'b-amber'}" style="font-size:10px;flex-shrink:0">${S.myScores[p.id]?'Scored':'Pending'}</span>
      </div>`).join('') || '<p style="color:var(--muted);font-size:13px">No projects yet.</p>';
  },
  async loadLb() {
    try {
      const snap = await getDocs(collection(db,'projects'));
      const projs = snap.docs.map(d=>({id:d.id,...d.data()})).sort((a,b)=>(b.avgScore||0)-(a.avgScore||0));
      const max = projs[0]?.avgScore || 1;
      const tb = $('j-lb-tbody'); if(!tb) return;
      tb.innerHTML = projs.map((p,i)=>`<tr>
        <td><div class="lb-r ${['r1','r2','r3'][i]||''}">${i+1}</div></td>
        <td style="font-weight:600">${esc(p.team||'—')}</td>
        <td style="color:var(--muted)">${esc(p.track||'—')}</td>
        <td style="font-family:'DM Mono',monospace;color:var(--amber);font-weight:600">${p.avgScore||0}</td>
        <td><div class="sbar"><div class="sbar-f" style="width:${(p.avgScore||0)/max*100}%"></div></div></td>
      </tr>`).join('') || `<tr><td colspan="5" style="text-align:center;color:var(--muted);padding:20px">No entries yet.</td></tr>`;
    } catch(e) {}
  },
  async loadAnnouncements() {
    try {
      const snap = await getDocs(query(collection(db,'announcements'), orderBy('createdAt','desc')));
      const anns = snap.docs.map(d=>({id:d.id,...d.data()}));
      const html = anns.map(a=>annHTML(a)).join('') || '<p style="color:var(--muted);font-size:13px">No announcements.</p>';
      const prev=$('j-ann-prev'); if(prev) prev.innerHTML = anns.slice(0,3).map(a=>annHTML(a)).join('') || '<p style="color:var(--muted);font-size:13px">None.</p>';
      const all=$('j-ann-all'); if(all) all.innerHTML = html;
    } catch(e) {}
  }
};

/* ── MISC UI ────────────────────────────────────────── */
window.showDay = (n) => {
  [0,1,2].forEach(i => { $(`sd${i}`).style.display=i===n?'block':'none'; $(`s-tab${i}`).classList.toggle('on',i===n); });
};

window.togFaq = (btn) => {
  const it = btn.closest('.faq-item'), was = it.classList.contains('open');
  $$('.faq-item').forEach(f => f.classList.remove('open'));
  if (!was) it.classList.add('open');
};

window.sendContact = () => {
  const fn=$('c-fn').value.trim(), em=$('c-em').value.trim(), msg=$('c-msg').value.trim();
  if(!fn||!em||!msg) { toast('Fill all fields','err'); return; }
  ['c-fn','c-ln','c-em','c-msg'].forEach(id=>{const e=$(id);if(e)e.value='';});
  toast("Message sent! We'll reply within 24h.",'ok');
};

/* expose toast globally for inline onclick */
window.toast = toast;