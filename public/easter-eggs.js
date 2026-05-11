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
  // EASTER EGG #2 : KAMEHAMEHA — pixel art DBZ style
  // Hold SPACE 3s → boule d'énergie charge entre les "mains" en bas
  // → beam horizontal traverse l'écran → flash → popup OG
  // ─────────────────────────────────────────────────────────
  function initKamehameha() {
    const HOLD_DURATION = 3000;
    const SYLLABLES = ['KA', 'ME', 'HA', 'ME', 'HA'];

    let isCharging = false;
    let startTime = 0;
    let stageEl = null;
    let rafId = null;
    let particleInterval = null;
    let lastSyllable = -1;
    let isReleasing = false;

    function buildStage() {
      const stage = document.createElement('div');
      stage.className = 'kameha-stage';
      stage.setAttribute('aria-hidden', 'true');

      // Vignette
      const v = document.createElement('div');
      v.className = 'kameha-vignette';
      stage.appendChild(v);

      // Chant pixel "KA ME HA ME HA"
      const chant = document.createElement('div');
      chant.className = 'kameha-chant';
      SYLLABLES.forEach((s, i) => {
        const span = document.createElement('span');
        span.className = 'kameha-chant-syllable';
        span.dataset.idx = String(i);
        span.textContent = s;
        chant.appendChild(span);
      });
      stage.appendChild(chant);

      // Hands + Orb wrapper (bottom center, POV "cupped hands")
      const handsWrap = document.createElement('div');
      handsWrap.className = 'kameha-hands-wrap';
      handsWrap.innerHTML = `
        <div class="kameha-orb"></div>
        <div class="kameha-hands">
          <div class="kameha-hand kameha-hand-left"></div>
          <div class="kameha-hand kameha-hand-right"></div>
        </div>
      `;
      stage.appendChild(handsWrap);

      // Particles container
      const particles = document.createElement('div');
      particles.className = 'kameha-particles';
      stage.appendChild(particles);

      // Hint
      const hint = document.createElement('div');
      hint.className = 'kameha-hint';
      hint.textContent = '▼ HOLD SPACE ▼';
      stage.appendChild(hint);
      // Show hint after a brief delay
      setTimeout(() => hint.classList.add('is-shown'), 80);

      return stage;
    }

    function spawnParticle() {
      if (!stageEl) return;
      const container = stageEl.querySelector('.kameha-particles');
      if (!container) return;

      const p = document.createElement('span');
      p.className = 'kameha-particle';

      // Particule part d'un point random au-dessus du bas-centre puis spirale vers l'orb
      const orbRect = stageEl.querySelector('.kameha-orb').getBoundingClientRect();
      const orbX = orbRect.left + orbRect.width / 2;
      const orbY = orbRect.top + orbRect.height / 2;

      // Position de départ : autour, dans un rayon de 200-350px
      const angle = Math.random() * Math.PI * 2;
      const radius = 200 + Math.random() * 200;
      const startX = orbX + Math.cos(angle) * radius;
      const startY = orbY + Math.sin(angle) * radius;

      // Position fixed pour précision
      p.style.position = 'fixed';
      p.style.left = startX + 'px';
      p.style.top = startY + 'px';

      // Cible : centre de l'orb (translate négatif depuis la position de départ)
      p.style.setProperty('--px-from', '0px');
      p.style.setProperty('--py-from', '0px');

      // Anim : on translate à la fin vers (orbX - startX, orbY - startY)
      const dx = orbX - startX;
      const dy = orbY - startY;
      p.style.transition = 'none';
      p.style.transform = 'translate(0, 0) scale(1)';
      p.style.opacity = '0';

      // Couleur random parmi cyan/blanc/bleu
      const colors = ['#ffffff', '#b4e6ff', '#40c4ff', '#0080ff'];
      const color = colors[Math.floor(Math.random() * colors.length)];
      p.style.setProperty('--p-color', color);
      p.style.background = color;
      p.style.boxShadow = `0 0 8px ${color}, 0 0 16px ${color}`;

      container.appendChild(p);

      // Animation manuelle : fade in puis spirale vers la cible
      requestAnimationFrame(() => {
        p.style.transition = 'transform 0.8s steps(16), opacity 0.15s linear';
        p.style.opacity = '1';
        p.style.transform = `translate(${dx}px, ${dy}px) scale(0.4)`;
      });

      setTimeout(() => p.remove(), 900);
    }

    function updateProgress() {
      if (!isCharging) return;
      const elapsed = performance.now() - startTime;
      const progress = Math.min(elapsed / HOLD_DURATION, 1);

      if (stageEl) {
        stageEl.style.setProperty('--kameha-progress', progress);
      }

      // Reveal syllables en fonction du progress (1 syllabe toutes les ~600ms)
      const syllableIdx = Math.min(Math.floor(progress * SYLLABLES.length), SYLLABLES.length - 1);
      if (syllableIdx > lastSyllable && stageEl) {
        const span = stageEl.querySelector('.kameha-chant-syllable[data-idx="' + syllableIdx + '"]');
        if (span) span.classList.add('is-shown');
        lastSyllable = syllableIdx;
      }

      if (progress >= 1) {
        releaseBeam();
        return;
      }
      rafId = requestAnimationFrame(updateProgress);
    }

    function startCharging() {
      if (isCharging || isReleasing) return;
      isCharging = true;
      startTime = performance.now();
      lastSyllable = -1;

      stageEl = buildStage();
      document.body.appendChild(stageEl);

      particleInterval = setInterval(spawnParticle, 50);
      rafId = requestAnimationFrame(updateProgress);
    }

    function cancelCharging() {
      if (!isCharging || isReleasing) return;
      isCharging = false;
      cancelAnimationFrame(rafId);
      clearInterval(particleInterval);
      if (stageEl) {
        // Petit "absorption inverse" : la boule s'efface
        stageEl.style.opacity = '0';
        stageEl.style.transition = 'opacity 0.3s';
        const el = stageEl;
        setTimeout(() => el.remove(), 320);
        stageEl = null;
      }
    }

    function releaseBeam() {
      isCharging = false;
      isReleasing = true;
      cancelAnimationFrame(rafId);
      clearInterval(particleInterval);

      // 1) Texte "HAAAA!" massif qui flashe
      const shout = document.createElement('div');
      shout.className = 'kameha-shout';
      shout.textContent = 'HAAAAA!';
      document.body.appendChild(shout);

      // 2) Le beam horizontal
      const beamWrap = document.createElement('div');
      beamWrap.className = 'kameha-beam-wrap';
      const beam = document.createElement('div');
      beam.className = 'kameha-beam';
      beamWrap.appendChild(beam);
      document.body.appendChild(beamWrap);

      // 3) Screen shake
      document.body.classList.add('kameha-shaking');

      // 4) Sparkles le long du beam (15 paillettes pixel art)
      setTimeout(() => {
        for (let i = 0; i < 20; i++) {
          setTimeout(() => {
            const sparkle = document.createElement('span');
            sparkle.className = 'kameha-sparkle';
            sparkle.style.position = 'fixed';
            sparkle.style.left = (Math.random() * 100) + 'vw';
            sparkle.style.bottom = (12 + Math.random() * 8) + 'vh';
            sparkle.style.setProperty('--sx', (Math.random() * 60 - 30) + 'px');
            sparkle.style.setProperty('--sy', (Math.random() * 60 - 30) + 'px');
            sparkle.style.zIndex = '99999';
            document.body.appendChild(sparkle);
            setTimeout(() => sparkle.remove(), 700);
          }, i * 30);
        }
      }, 200);

      // 5) Flash blanc final (au pic du beam)
      setTimeout(() => {
        const flash = document.createElement('div');
        flash.className = 'kameha-flash';
        document.body.appendChild(flash);
        setTimeout(() => flash.remove(), 600);
      }, 500);

      // 6) Cleanup + popup OG
      setTimeout(() => {
        document.body.classList.remove('kameha-shaking');
        if (stageEl) { stageEl.remove(); stageEl = null; }
        shout.remove();
        beamWrap.remove();
        isReleasing = false;
        if (window.CardsTradingEggs) {
          window.CardsTradingEggs.trigger('kamehameha');
        }
      }, 1200);
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
      startCharging();
    });

    document.addEventListener('keyup', function (e) {
      if (e.code !== 'Space' && e.key !== ' ') return;
      if (isTyping()) return;
      cancelCharging();
    });

    window.addEventListener('blur', cancelCharging);
  }

  // ─────────────────────────────────────────────────────────
  // INIT
  // ─────────────────────────────────────────────────────────
  function init() {
    initPlusOneGame();
    initKamehameha();
    // (autres easter eggs ajoutés plus tard)
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
