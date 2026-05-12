/**
 * CARDS-TRADING — Easter Eggs system
 *
 * Architecture :
 * - Système popup OG réutilisable pour tous les easter eggs
 * - Stockage localStorage pour ne pas re-déclencher après claim
 * - POST email vers Google Apps Script webhook (base annexe OG)
 *
 * Easter eggs implémentés :
 *  1. Le jeu du +1 (mouseleave pile au compteur)
 */
(function () {
  'use strict';

  // ─────────────────────────────────────────────────────────
  // CONFIG
  // ─────────────────────────────────────────────────────────
  const WEBHOOK_URL = window.OG_WEBHOOK_URL || ''; // À remplir par le user (voir docs/google-sheet-apps-script.gs)
  const DISCORD_INVITE = 'https://discord.gg/JBs3FnK9qP';
  const STORAGE_KEY = 'ct-easter-eggs';

  const EGG_LABELS = {
    'plus_one_game':  'Le jeu du +1 — sortie pile au compteur',
    'kamehameha':     'Kamehameha — barre espace tenue 3 secondes',
    'pull_rate':      'Pull Rate du jour — drop holographique attrapé',
    'speedrun':       'Speedrun — combo en moins de 10 secondes',
    'booster_pack':   'Booster Pack secret — ouvert depuis le logo',
    'typing_charizard': 'Typing combo — Charizard incanté',
    'typing_pikachu':   'Typing combo — Pikachu incanté',
    'typing_luffy':     'Typing combo — Luffy Gear 5 incanté',
    'typing_goku':      'Typing combo — Goku incanté',
    'typing_blacklotus':'Typing combo — Black Lotus incanté'
  };

  // ─────────────────────────────────────────────────────────
  // STATE (localStorage)
  // ─────────────────────────────────────────────────────────
  function getState() {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}'); }
    catch (e) { return {}; }
  }

  function setState(state) {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); }
    catch (e) { /* private mode, ignore */ }
  }

  function isClaimed(eggId) {
    const s = getState();
    return s[eggId] && s[eggId].claimed === true;
  }

  function markClaimed(eggId, email) {
    const s = getState();
    s[eggId] = { claimed: true, email, date: new Date().toISOString() };
    setState(s);
  }

  // ─────────────────────────────────────────────────────────
  // POST EMAIL → GOOGLE SHEETS
  // ─────────────────────────────────────────────────────────
  async function registerOG(email, eggId) {
    if (!WEBHOOK_URL) {
      console.warn('[OG] No webhook URL configured. Email not sent.');
      console.log('[OG] Would send:', { email, eggId });
      return { success: true, debug: true };
    }

    try {
      // mode no-cors : Apps Script accepte les POST cross-origin sans preflight
      // si on envoie en text/plain. La réponse n'est pas lisible côté JS,
      // mais l'append dans la sheet fonctionne quand même.
      await fetch(WEBHOOK_URL, {
        method: 'POST',
        mode: 'no-cors',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({
          email: email.trim().toLowerCase(),
          easterEgg: eggId,
          userAgent: navigator.userAgent,
          referrer: document.referrer || ''
        })
      });
      return { success: true };
    } catch (e) {
      console.error('[OG] Failed to register:', e);
      return { success: false, error: String(e) };
    }
  }

  // ─────────────────────────────────────────────────────────
  // CONFETTIS
  // ─────────────────────────────────────────────────────────
  const CONFETTI_COLORS = ['#2997ff', '#a855f7', '#ec4899', '#fbbf24', '#10b981'];

  function spawnConfetti(count) {
    count = count || 80;
    for (let i = 0; i < count; i++) {
      const c = document.createElement('div');
      c.className = 'og-confetti';
      c.style.left = Math.random() * 100 + 'vw';
      c.style.background = CONFETTI_COLORS[i % CONFETTI_COLORS.length];
      c.style.animationDuration = (2 + Math.random() * 2) + 's';
      c.style.animationDelay = Math.random() * 0.5 + 's';
      c.style.transform = `rotate(${Math.random() * 360}deg)`;
      document.body.appendChild(c);
      setTimeout(() => c.remove(), 4500);
    }
  }

  // ─────────────────────────────────────────────────────────
  // POPUP
  // ─────────────────────────────────────────────────────────
  let activeOverlay = null;

  function closeOverlay() {
    if (!activeOverlay) return;
    activeOverlay.classList.remove('is-open');
    setTimeout(() => {
      if (activeOverlay) {
        activeOverlay.remove();
        activeOverlay = null;
      }
    }, 400);
    document.removeEventListener('keydown', escListener);
  }

  function escListener(e) {
    if (e.key === 'Escape') closeOverlay();
  }

  function showRewardPopup(eggId) {
    if (activeOverlay) return; // déjà ouvert

    const eggLabel = EGG_LABELS[eggId] || eggId;

    // Build DOM
    const overlay = document.createElement('div');
    overlay.className = 'og-overlay';
    overlay.setAttribute('role', 'dialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.innerHTML = `
      <div class="og-modal" role="document">
        <button type="button" class="og-close" aria-label="Fermer">×</button>
        <div class="og-badge">OG</div>
        <p class="og-eyebrow">Easter egg débloqué</p>
        <h2 class="og-title">Tu as débloqué le statut <em>OG</em> !</h2>
        <p class="og-egg-name">« ${eggLabel} »</p>
        <ul class="og-benefits">
          <li><strong>0 % commission pendant 3 mois supplémentaires</strong> après la fin de la beta</li>
          <li>Rôle <strong>OG</strong> exclusif sur le Discord Cards Trading</li>
          <li>Accès anticipé aux nouveautés et releases</li>
        </ul>
        <form class="og-form" novalidate>
          <label class="og-form-label" for="og-email-input">Ton email pour recevoir le statut OG</label>
          <input
            type="email"
            id="og-email-input"
            class="og-form-input"
            placeholder="ton@email.com"
            autocomplete="email"
            required
          />
          <div class="og-form-error" aria-live="polite"></div>
          <button type="submit" class="og-submit">Réclamer mon statut OG</button>
        </form>
        <p class="og-note">Email stocké uniquement pour t'attribuer le rôle OG. Aucune autre utilisation.</p>
      </div>
    `;
    document.body.appendChild(overlay);
    activeOverlay = overlay;

    // Animations d'entrée
    requestAnimationFrame(() => overlay.classList.add('is-open'));
    spawnConfetti(80);

    // Listeners
    overlay.querySelector('.og-close').addEventListener('click', closeOverlay);
    overlay.addEventListener('click', (e) => {
      if (e.target === overlay) closeOverlay();
    });
    document.addEventListener('keydown', escListener);

    // Focus l'input
    setTimeout(() => {
      const input = overlay.querySelector('#og-email-input');
      if (input) input.focus();
    }, 500);

    // Submit
    const form = overlay.querySelector('.og-form');
    const errEl = overlay.querySelector('.og-form-error');
    const submitBtn = overlay.querySelector('.og-submit');

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const input = overlay.querySelector('#og-email-input');
      const email = input.value.trim();

      // Validation simple
      if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        errEl.textContent = 'Email invalide';
        input.focus();
        return;
      }
      errEl.textContent = '';

      submitBtn.disabled = true;
      submitBtn.textContent = 'Envoi…';

      const result = await registerOG(email, eggId);

      if (result.success) {
        markClaimed(eggId, email);
        showSuccessState(overlay);
      } else {
        errEl.textContent = 'Erreur réseau, réessaie dans un instant.';
        submitBtn.disabled = false;
        submitBtn.textContent = 'Réclamer mon statut OG';
      }
    });
  }

  function showSuccessState(overlay) {
    const modal = overlay.querySelector('.og-modal');
    modal.innerHTML = `
      <button type="button" class="og-close" aria-label="Fermer">×</button>
      <div class="og-success">
        <div class="og-success-emoji">🎉</div>
        <p class="og-eyebrow">Statut OG enregistré</p>
        <h2 class="og-title">Bienvenue parmi les OG !</h2>
        <p class="og-success-text">
          Rejoins le Discord pour recevoir ton rôle <strong>OG</strong> et discuter avec les autres premiers membres.
        </p>
        <a href="${DISCORD_INVITE}" target="_blank" rel="noopener noreferrer" class="og-discord-btn">
          Rejoindre le Discord
        </a>
      </div>
    `;
    modal.querySelector('.og-close').addEventListener('click', closeOverlay);
    spawnConfetti(60);
  }

  // ─────────────────────────────────────────────────────────
  // PUBLIC TRIGGER
  // ─────────────────────────────────────────────────────────
  window.CardsTradingEggs = {
    trigger: function (eggId) {
      if (isClaimed(eggId)) {
        // Déjà claim → on ne re-popup pas. On fait juste une confetti silencieuse.
        console.warn(
          '[OG] trigger("' + eggId + '") IGNORÉ — easter egg déjà claim.\n' +
          'Si tu testes, lance : window.CardsTradingEggs._reset() puis re-trigger.'
        );
        spawnConfetti(30);
        return false;
      }
      if (window.OG_DEBUG) {
        console.log('%c[OG] trigger("' + eggId + '") → popup en cours d\'ouverture', 'color:#10b981;font-weight:bold');
      }
      showRewardPopup(eggId);
      return true;
    },
    isClaimed: isClaimed,
    getState: getState,
    // Debug
    _reset: function () {
      localStorage.removeItem(STORAGE_KEY);
      console.log('%c[OG] localStorage state reset — tous les easter eggs sont à nouveau triggerables', 'color:#2997ff;font-weight:bold');
    },
    _claim: function (eggId) {
      markClaimed(eggId, '__test__@example.com');
      console.log('[OG] forced claim of ' + eggId);
    }
  };

  // ─────────────────────────────────────────────────────────
  // EASTER EGG #1 : LE JEU DU +1
  // ─────────────────────────────────────────────────────────
  function initPlusOneGame() {
    const pill = document.querySelector('.social-proof');
    const countEl = document.querySelector('.social-proof-count');
    if (!pill || !countEl) return;

    // Désactivé sur mobile (pas de hover réel)
    if (!window.matchMedia('(hover: hover)').matches) return;

    let interval = null;
    let spawnCount = 0;          // Nombre de +1 spawnés pendant ce hover
    let targetAtEntry = 0;       // Compteur affiché au moment du mouseenter
    let hoverStartTime = 0;

    function spawnBurst() {
      const burst = 3 + Math.floor(Math.random() * 2); // 3-4 par tick
      for (let i = 0; i < burst; i++) {
        const el = document.createElement('span');
        el.className = 'social-proof-plus-one';
        el.textContent = '+1';
        el.style.left = (8 + Math.random() * 80) + '%';
        const scale = 0.55 + Math.random() * 0.75;
        el.style.fontSize = (22 * scale) + 'px';
        el.style.animationDuration = (0.55 + Math.random() * 0.55) + 's';
        pill.appendChild(el);
        el.addEventListener('animationend', function () { this.remove(); });
        spawnCount++;
      }
    }

    pill.addEventListener('mouseenter', function () {
      if (interval) return;
      spawnCount = 0;
      targetAtEntry = parseInt(countEl.textContent, 10) || 0;
      hoverStartTime = performance.now();
      if (window.OG_DEBUG) {
        console.log('%c[+1 game] HOVER START — cible : ' + targetAtEntry + ' +1 à atteindre', 'color:#2997ff;font-weight:bold');
      }
      spawnBurst(); // burst immédiat
      interval = setInterval(spawnBurst, 80);
    });

    pill.addEventListener('mouseleave', function () {
      clearInterval(interval);
      interval = null;

      const hoverDuration = performance.now() - hoverStartTime;
      const diff = spawnCount - targetAtEntry;

      if (window.OG_DEBUG) {
        const style = spawnCount === targetAtEntry ? 'color:#10b981;font-weight:bold;font-size:14px' : 'color:#888';
        console.log(
          '%c[+1 game] HOVER END — spawn: ' + spawnCount + ' | cible: ' + targetAtEntry +
          ' | écart: ' + (diff > 0 ? '+' : '') + diff +
          ' | durée: ' + Math.round(hoverDuration) + 'ms' +
          (spawnCount === targetAtEntry ? ' ✨ MATCH !' : ''),
          style
        );
      }

      // Hover < 200ms ignoré (effleurement involontaire)
      if (hoverDuration < 200) return;

      if (spawnCount === targetAtEntry && targetAtEntry > 0) {
        // 🎉 EASTER EGG TRIGGERED
        if (window.CardsTradingEggs && !window.CardsTradingEggs.isClaimed('plus_one_game')) {
          window.CardsTradingEggs.trigger('plus_one_game');
        }
      }
    });

    // Compteur en live pendant le hover (toutes les 80ms à chaque spawn)
    if (window.OG_DEBUG) {
      const originalSpawn = spawnBurst;
      spawnBurst = function () {
        originalSpawn();
        const remaining = targetAtEntry - spawnCount;
        const color = remaining === 0 ? '#10b981' : (remaining > 0 ? '#888' : '#ff6b6b');
        console.log(
          '%c[+1 game] spawn: ' + spawnCount + ' / ' + targetAtEntry +
          (remaining > 0 ? ' (' + remaining + ' restant)' : remaining < 0 ? ' (DÉPASSÉ de ' + Math.abs(remaining) + ')' : ' (PILE !)'),
          'color:' + color
        );
      };
    }
  }

  // ─────────────────────────────────────────────────────────
  // EASTER EGG #2 : KAMEHAMEHA — pixel art VFX sprite style
  //
  // Mécanique :
  // 1. SILENT PHASE (0-3s) : l'utilisateur maintient SPACE, rien ne s'affiche
  //    (phase de "discovery" — il faut commitement pour découvrir l'egg)
  // 2. CHARGE PHASE (3s-4.2s) : animation de charge visible (orb grandit, Goku
  //    apparaît, particules convergent)
  // 3. RELEASE : beam horizontal pixel art, impact, popup OG
  // ─────────────────────────────────────────────────────────
  function initKamehameha() {
    const SILENT_DURATION = 3000; // 3s de hold silencieux requis
    const CHARGE_DURATION = 1200; // 1.2s de charge visible avant beam

    let isHolding = false;
    let isCharging = false;
    let isReleasing = false;
    let silentTimer = null;
    let chargeStart = 0;
    let stageEl = null;
    let rafId = null;
    let particleInterval = null;

    function buildStage() {
      const stage = document.createElement('div');
      stage.className = 'kameha-stage';
      stage.setAttribute('aria-hidden', 'true');
      stage.innerHTML = `
        <div class="kameha-vignette"></div>
        <div class="kameha-hint is-shown">▸ HOLD SPACE ◂</div>
        ${gokuSvgHTML()}
        <div class="kameha-orb-wrap">
          <div class="kameha-orb-layer kameha-orb-l1"></div>
          <div class="kameha-orb-layer kameha-orb-l2"></div>
          <div class="kameha-orb-layer kameha-orb-l3"></div>
          <div class="kameha-orb-layer kameha-orb-l4"></div>
          <div class="kameha-orb-layer kameha-orb-l5"></div>
        </div>
      `;
      return stage;
    }

    /**
     * Goku — image fournie par l'utilisateur (générée IA, droits user)
     * Chemin attendu : /assets/img/goku-kamehameha.png (PNG transparent recommandé)
     * Si l'image fait 404, onerror cache l'élément silencieusement.
     */
    function gokuSvgHTML() {
      // ?v=2 : cache-bust nécessaire car Vercel sert avec Cache-Control: immutable
      // (1 an) — bump cette version à chaque update du fichier PNG
      return `
        <div class="kameha-goku">
          <img
            src="/assets/img/goku-kamehameha.png?v=3"
            alt=""
            onerror="this.parentElement.style.display='none'"
            draggable="false"
          />
        </div>
      `;
    }

    function spawnParticle() {
      if (!stageEl) return;
      const orbWrap = stageEl.querySelector('.kameha-orb-wrap');
      if (!orbWrap) return;
      const orbRect = orbWrap.getBoundingClientRect();
      const targetX = orbRect.left + orbRect.width / 2;
      const targetY = orbRect.top + orbRect.height / 2;

      // Particule part d'un point random sur un cercle autour de la boule
      const angle = Math.random() * Math.PI * 2;
      const radius = 200 + Math.random() * 250;
      const startX = targetX + Math.cos(angle) * radius;
      const startY = targetY + Math.sin(angle) * radius;

      const p = document.createElement('span');
      p.className = 'kameha-particle';
      p.style.left = startX + 'px';
      p.style.top = startY + 'px';

      // Couleur pixel art selon distance (plus loin = plus sombre)
      const palette = ['#ffffff', '#d4f1ff', '#40c4ff', '#1976ff'];
      const color = palette[Math.floor(Math.random() * palette.length)];
      p.style.background = color;
      p.style.setProperty('--p-color', color);

      // Animation manuelle : converge vers la boule
      const dx = targetX - startX;
      const dy = targetY - startY;
      p.style.opacity = '0';
      p.style.transition = 'none';
      p.style.transform = 'translate(0, 0)';

      stageEl.appendChild(p);

      requestAnimationFrame(() => {
        p.style.transition = 'transform 0.7s steps(12), opacity 0.12s linear';
        p.style.opacity = '1';
        p.style.transform = `translate(${dx}px, ${dy}px) scale(0.3)`;
      });

      setTimeout(() => p.remove(), 800);
    }

    function updateProgress() {
      if (!isCharging) return;
      const elapsed = performance.now() - chargeStart;
      const progress = Math.min(elapsed / CHARGE_DURATION, 1);

      if (stageEl) {
        stageEl.style.setProperty('--kameha-progress', progress);
      }

      if (progress >= 1) {
        releaseBeam();
        return;
      }
      rafId = requestAnimationFrame(updateProgress);
    }

    /**
     * Phase 1 : déclenchée au keydown. On démarre un timer silencieux de
     * SILENT_DURATION. Si l'utilisateur tient SPACE jusqu'au bout, la phase
     * de charge visible commence. Sinon (release prématuré), rien ne se passe.
     */
    function startHold() {
      if (isHolding || isCharging || isReleasing) return;
      isHolding = true;

      if (window.OG_DEBUG) {
        console.log('%c[Kamehameha] silent hold démarré (3s requis)', 'color:#888');
      }

      silentTimer = setTimeout(() => {
        silentTimer = null;
        if (!isHolding) return; // safety : déjà relâché
        startCharging();
      }, SILENT_DURATION);
    }

    /**
     * Phase 2 : démarre l'animation visible après la phase silencieuse.
     */
    function startCharging() {
      if (isCharging || isReleasing) return;
      isCharging = true;
      chargeStart = performance.now();

      if (window.OG_DEBUG) {
        console.log('%c[Kamehameha] ⚡ charge visible démarrée !', 'color:#40c4ff;font-weight:bold');
      }

      stageEl = buildStage();
      document.body.appendChild(stageEl);
      particleInterval = setInterval(spawnParticle, 40);
      rafId = requestAnimationFrame(updateProgress);
    }

    /**
     * Cancel propre : appelé au keyup, gère les 2 phases possibles.
     */
    function cancelHold() {
      if (isReleasing) return; // ne pas interrompre le release en cours

      isHolding = false;

      // Cancel pendant la phase silencieuse : rien à nettoyer visuellement
      if (silentTimer) {
        clearTimeout(silentTimer);
        silentTimer = null;
        return;
      }

      // Cancel pendant la phase charge visible
      if (isCharging) {
        isCharging = false;
        cancelAnimationFrame(rafId);
        clearInterval(particleInterval);
        if (stageEl) {
          stageEl.style.transition = 'opacity 0.25s steps(5)';
          stageEl.style.opacity = '0';
          const el = stageEl;
          setTimeout(() => el.remove(), 280);
          stageEl = null;
        }
      }
    }

    function releaseBeam() {
      isHolding = false;
      isCharging = false;
      isReleasing = true;
      cancelAnimationFrame(rafId);
      clearInterval(particleInterval);

      if (window.OG_DEBUG) {
        console.log('%c[Kamehameha] 🔥 BEAM RELEASE !', 'color:#40c4ff;font-weight:bold;font-size:14px');
      }

      // Cacher le hint, garder la boule à pleine taille
      if (stageEl) {
        const hint = stageEl.querySelector('.kameha-hint');
        if (hint) hint.style.display = 'none';
      }

      // 1) Texte "READY!" qui flashe au-dessus de la boule
      const ready = document.createElement('div');
      ready.className = 'kameha-ready';
      ready.textContent = 'HAAAA!';
      document.body.appendChild(ready);
      setTimeout(() => ready.remove(), 600);

      // 2) Construire le beam stage avec 5 couches sœurs (chacune anime sa propre width)
      const beamStage = document.createElement('div');
      beamStage.className = 'kameha-beam-stage';
      beamStage.innerHTML = `
        <div class="kameha-beam-layer kameha-beam-outer"></div>
        <div class="kameha-beam-layer kameha-beam-blue"></div>
        <div class="kameha-beam-layer kameha-beam-cyan"></div>
        <div class="kameha-beam-layer kameha-beam-lite"></div>
        <div class="kameha-beam-layer kameha-beam-core"></div>
      `;
      document.body.appendChild(beamStage);

      // 3) Screen shake — via overlay dédié (PAS sur body, sinon transform
      // sur body brise position:fixed des autres éléments kameha)
      const shakeOverlay = document.createElement('div');
      shakeOverlay.className = 'kameha-shake-overlay';
      document.body.appendChild(shakeOverlay);

      // 4) Spawn 4 anneaux qui voyagent le long du beam (décalés dans le temps)
      setTimeout(() => {
        for (let i = 0; i < 5; i++) {
          setTimeout(() => {
            const ring = document.createElement('div');
            ring.className = 'kameha-ring';
            ring.style.setProperty('--ring-duration', (0.6 + Math.random() * 0.25) + 's');
            document.body.appendChild(ring);
            setTimeout(() => ring.remove(), 1000);
          }, i * 100);
        }
      }, 250);

      // 5) Impact à droite + flash + sparks (quand le beam touche le bord)
      setTimeout(() => {
        const impact = document.createElement('div');
        impact.className = 'kameha-impact';
        impact.innerHTML = '<div class="kameha-impact-flash"></div>';
        document.body.appendChild(impact);
        setTimeout(() => impact.remove(), 800);

        // Sparks éjectés du point d'impact (20)
        for (let i = 0; i < 20; i++) {
          const spark = document.createElement('span');
          spark.className = 'kameha-spark';
          spark.style.right = '20px';
          spark.style.top = '50%';
          const angle = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.6;
          const dist = 150 + Math.random() * 400;
          spark.style.setProperty('--sx', Math.cos(angle) * dist + 'px');
          spark.style.setProperty('--sy', Math.sin(angle) * dist + 'px');
          document.body.appendChild(spark);
          setTimeout(() => spark.remove(), 900);
        }

        // Flash blanc plein écran au pic d'impact
        const flash = document.createElement('div');
        flash.className = 'kameha-fullflash';
        document.body.appendChild(flash);
        setTimeout(() => flash.remove(), 500);
      }, 450); // 50ms avant la fin de la croissance du beam pour synchroniser

      // 6) Le beam reste visible 1.2s après la fin de sa croissance
      // (durée totale du beam visible : ~1.6s)

      // 7) Cleanup + popup OG (durée totale : 2s pour bien voir l'animation)
      setTimeout(() => {
        shakeOverlay.remove();
        if (stageEl) { stageEl.remove(); stageEl = null; }
        beamStage.remove();
        isReleasing = false;
        if (window.CardsTradingEggs) {
          window.CardsTradingEggs.trigger('kamehameha');
        }
      }, 1800);
    }

    function isTyping() {
      const el = document.activeElement;
      if (!el) return false;
      const tag = el.tagName;
      return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable;
    }

    document.addEventListener('keydown', function (e) {
      if (e.code !== 'Space' && e.key !== ' ') return;
      if (isTyping()) return;
      if (e.repeat) return;
      e.preventDefault();
      startHold();
    });

    document.addEventListener('keyup', function (e) {
      if (e.code !== 'Space' && e.key !== ' ') return;
      if (isTyping()) return;
      cancelHold();
    });

    window.addEventListener('blur', cancelHold);
  }

  // ─────────────────────────────────────────────────────────
  // ACHIEVEMENTS PANEL — Tab × 3 rapide ouvre un compteur anonyme
  //
  // Privacy-preserving : on n'affiche QUE deux chiffres :
  //  - Nombre d'OG uniques sur le site (depuis l'Apps Script GET)
  //  - Nombre d'eggs débloqués par CET utilisateur (depuis localStorage)
  // Aucun nom d'easter egg n'est révélé — pas d'indice aux chercheurs.
  // ─────────────────────────────────────────────────────────
  function initAchievementsPanel() {
    const TRIGGER_KEY = 'Tab';
    const TRIGGER_COUNT = 3;       // 3 tabs rapides
    const TRIGGER_WINDOW = 700;    // dans 700ms

    let activePanelEl = null;
    let tabTimestamps = [];

    function fetchOgCount() {
      if (!WEBHOOK_URL) {
        return Promise.resolve({ uniqueOgs: null, debug: true });
      }
      // Apps Script GET retourne du JSON. Pas de no-cors car on veut lire la réponse.
      return fetch(WEBHOOK_URL, { method: 'GET' })
        .then(function (r) { return r.json(); })
        .catch(function (e) {
          console.warn('[Achievements] fetch failed:', e);
          return { uniqueOgs: null, error: String(e) };
        });
    }

    function userClaimedCount() {
      const state = getState();
      return Object.keys(state).filter(function (k) {
        return state[k] && state[k].claimed === true;
      }).length;
    }

    function closePanel() {
      if (!activePanelEl) return;
      activePanelEl.classList.remove('is-open');
      const el = activePanelEl;
      setTimeout(function () { el.remove(); }, 300);
      activePanelEl = null;
      document.removeEventListener('keydown', achEscListener);
    }

    function achEscListener(e) {
      if (e.key === 'Escape') closePanel();
    }

    function showPanel() {
      if (activePanelEl) return;

      const userCount = userClaimedCount();

      const overlay = document.createElement('div');
      overlay.className = 'ach-overlay';
      overlay.setAttribute('role', 'dialog');
      overlay.setAttribute('aria-modal', 'true');
      overlay.setAttribute('aria-label', 'Achievements panel');
      overlay.innerHTML = `
        <div class="ach-modal" role="document">
          <button type="button" class="ach-close" aria-label="Fermer">×</button>
          <div class="ach-trophy">🏆</div>
          <p class="ach-title">Achievements</p>
          <div class="ach-stat">
            <div class="ach-stat-value is-loading" data-stat="global">…</div>
            <div class="ach-stat-label">OG ont découvert des easter eggs<br>sur Cards-Trading</div>
          </div>
          <div class="ach-stat ach-stat-user">
            <div class="ach-stat-value">${userCount}</div>
            <div class="ach-stat-label">easter egg${userCount > 1 ? 's' : ''} débloqué${userCount > 1 ? 's' : ''} par toi</div>
          </div>
          <p class="ach-hint">Continue à chercher 👀</p>
        </div>
      `;
      document.body.appendChild(overlay);
      activePanelEl = overlay;
      requestAnimationFrame(function () { overlay.classList.add('is-open'); });

      // Listeners
      overlay.querySelector('.ach-close').addEventListener('click', closePanel);
      overlay.addEventListener('click', function (e) {
        if (e.target === overlay) closePanel();
      });
      document.addEventListener('keydown', achEscListener);

      // Fetch async du compteur global, puis update du DOM
      fetchOgCount().then(function (data) {
        const valEl = overlay.querySelector('[data-stat="global"]');
        if (!valEl) return;
        valEl.classList.remove('is-loading');
        if (data.uniqueOgs !== null && data.uniqueOgs !== undefined) {
          valEl.textContent = String(data.uniqueOgs);
        } else {
          valEl.textContent = '—';
          valEl.style.fontSize = '24px';
        }
      });
    }

    function isTypingInForm() {
      const el = document.activeElement;
      if (!el) return false;
      return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable;
    }

    document.addEventListener('keydown', function (e) {
      if (e.key !== TRIGGER_KEY) return;
      if (isTypingInForm()) return;
      // ⚠️ On NE preventDefault PAS : la navigation Tab clavier doit
      // continuer à fonctionner normalement. On compte juste les presses.

      const now = performance.now();
      // Garder uniquement les presses récentes
      tabTimestamps = tabTimestamps.filter(function (t) {
        return now - t < TRIGGER_WINDOW;
      });
      tabTimestamps.push(now);

      if (tabTimestamps.length >= TRIGGER_COUNT) {
        tabTimestamps = [];
        if (window.OG_DEBUG) {
          console.log('%c[Achievements] Tab × 3 detected → ouverture panel', 'color:#ffd700;font-weight:bold');
        }
        showPanel();
      }
    });

    // Expose un trigger manuel pour les tests
    window.CardsTradingEggs.showAchievements = showPanel;
  }

  // ─────────────────────────────────────────────────────────
  // INIT
  // ─────────────────────────────────────────────────────────
  function init() {
    initPlusOneGame();
    initKamehameha();
    initAchievementsPanel();
    // (autres easter eggs ajoutés plus tard)
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
