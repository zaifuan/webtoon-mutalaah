'use strict';

/* =========================================================================
   Webtoon Mutalaah — Fasa 1
   Modul Projek & Teks (vanilla JS, tanpa React).
   Routing ringkas berasaskan hash:
     #/                  -> dashboard projek
     #/project/:id       -> detail projek + editor teks
   ========================================================================= */

// ---- Pembina elemen ringkas (selamat: teks melalui textContent) ----------
function el(tag, props, children) {
  const node = document.createElement(tag);
  if (props) {
    for (const key in props) {
      const val = props[key];
      if (val === null || val === undefined) continue;
      if (key === 'class') node.className = val;
      else if (key === 'text') node.textContent = val;
      else if (key === 'value') node.value = val;
      else if (key === 'hidden') node.hidden = !!val;
      else if (key.slice(0, 2) === 'on' && typeof val === 'function') {
        node.addEventListener(key.slice(2).toLowerCase(), val);
      } else {
        node.setAttribute(key, val);
      }
    }
  }
  if (children !== null && children !== undefined) {
    const list = Array.isArray(children) ? children : [children];
    for (const child of list) {
      if (child === null || child === undefined || child === false) continue;
      node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    }
  }
  return node;
}

function byId(id) {
  return document.getElementById(id);
}

// ---- Klien API ------------------------------------------------------------
const api = {
  async req(method, url, body) {
    const opt = { method, headers: { Accept: 'application/json' } };
    if (body !== undefined) {
      opt.headers['Content-Type'] = 'application/json';
      opt.body = JSON.stringify(body);
    }
    const res = await fetch(url, opt);
    let data = null;
    try {
      data = await res.json();
    } catch (e) {
      data = null;
    }
    if (!res.ok) {
      const msg = (data && data.error) || ('Ralat pelayan (' + res.status + ')');
      throw new Error(msg);
    }
    return data;
  },
  listProjects() {
    return this.req('GET', '/api/projects');
  },
  createProject(payload) {
    return this.req('POST', '/api/projects', payload);
  },
  getProject(id) {
    return this.req('GET', '/api/projects/' + id);
  },
  updateProject(id, payload) {
    return this.req('PUT', '/api/projects/' + id, payload);
  },
  deleteProject(id) {
    return this.req('DELETE', '/api/projects/' + id);
  },
  getText(id) {
    return this.req('GET', '/api/projects/' + id + '/text');
  },
  saveText(id, payload) {
    return this.req('PUT', '/api/projects/' + id + '/text', payload);
  },
  listCharacters(id) {
    return this.req('GET', '/api/projects/' + id + '/characters');
  },
  generateCharacters(id) {
    return this.req('POST', '/api/projects/' + id + '/generate-characters', {});
  },
  addCharacter(id, payload) {
    return this.req('POST', '/api/projects/' + id + '/characters', payload);
  },
  updateCharacter(charId, payload) {
    return this.req('PUT', '/api/characters/' + charId, payload);
  },
  deleteCharacter(charId) {
    return this.req('DELETE', '/api/characters/' + charId);
  },
  listScenes(id) {
    return this.req('GET', '/api/projects/' + id + '/scenes');
  },
  generateScenes(id) {
    return this.req('POST', '/api/projects/' + id + '/generate-scenes', {});
  },
  addScene(id, payload) {
    return this.req('POST', '/api/projects/' + id + '/scenes', payload);
  },
  updateScene(sceneId, payload) {
    return this.req('PUT', '/api/scenes/' + sceneId, payload);
  },
  deleteScene(sceneId) {
    return this.req('DELETE', '/api/scenes/' + sceneId);
  },
  reorderScenes(id, sceneIds) {
    return this.req('POST', '/api/projects/' + id + '/scenes/reorder', { scene_ids: sceneIds });
  },
  listProjectPanels(id) {
    return this.req('GET', '/api/projects/' + id + '/panels');
  },
  listScenePanels(sceneId) {
    return this.req('GET', '/api/scenes/' + sceneId + '/panels');
  },
  generateAllPanels(id) {
    return this.req('POST', '/api/projects/' + id + '/generate-panels', {});
  },
  generateScenePanels(sceneId) {
    return this.req('POST', '/api/scenes/' + sceneId + '/generate-panels', {});
  },
  addPanel(sceneId, payload) {
    return this.req('POST', '/api/scenes/' + sceneId + '/panels', payload);
  },
  updatePanel(panelId, payload) {
    return this.req('PUT', '/api/panels/' + panelId, payload);
  },
  deletePanel(panelId) {
    return this.req('DELETE', '/api/panels/' + panelId);
  },
  reorderPanels(sceneId, panelIds) {
    return this.req('POST', '/api/scenes/' + sceneId + '/panels/reorder', { panel_ids: panelIds });
  },
  listProjectVisuals(id) {
    return this.req('GET', '/api/projects/' + id + '/visuals');
  },
  getPanelVisual(panelId) {
    return this.req('GET', '/api/panels/' + panelId + '/visual');
  },
  generateAllVisuals(id) {
    return this.req('POST', '/api/projects/' + id + '/generate-visuals', {});
  },
  generatePanelVisual(panelId) {
    return this.req('POST', '/api/panels/' + panelId + '/generate-visual', {});
  },
  updateVisual(visualId, payload) {
    return this.req('PUT', '/api/visuals/' + visualId, payload);
  },
  deleteVisual(visualId) {
    return this.req('DELETE', '/api/visuals/' + visualId);
  },
  listProjectPrompts(id) {
    return this.req('GET', '/api/projects/' + id + '/prompts');
  },
  generateAllPrompts(id) {
    return this.req('POST', '/api/projects/' + id + '/generate-prompts', {});
  },
  generatePanelPrompt(panelId) {
    return this.req('POST', '/api/panels/' + panelId + '/generate-prompt', {});
  },
  updatePrompt(promptId, payload) {
    return this.req('PUT', '/api/prompts/' + promptId, payload);
  },
  deletePrompt(promptId) {
    return this.req('DELETE', '/api/prompts/' + promptId);
  },
  // ---- Script (Fasa 7) ----------------------------------------------------
  listProjectScripts(id) {
    return this.req('GET', '/api/projects/' + id + '/scripts');
  },
  listPanelScripts(panelId) {
    return this.req('GET', '/api/panels/' + panelId + '/scripts');
  },
  generateAllScripts(id) {
    return this.req('POST', '/api/projects/' + id + '/generate-scripts', {});
  },
  generatePanelScripts(panelId) {
    return this.req('POST', '/api/panels/' + panelId + '/generate-scripts', {});
  },
  addScript(panelId, payload) {
    return this.req('POST', '/api/panels/' + panelId + '/scripts', payload);
  },
  updateScript(scriptId, payload) {
    return this.req('PUT', '/api/scripts/' + scriptId, payload);
  },
  deleteScript(scriptId) {
    return this.req('DELETE', '/api/scripts/' + scriptId);
  },
  reorderScripts(panelId, scriptIds) {
    return this.req('POST', '/api/panels/' + panelId + '/scripts/reorder', { script_ids: scriptIds });
  },
  getProjectReview(id) {
    return this.req('GET', '/api/projects/' + id + '/review');
  },
  getPanelReview(panelId) {
    return this.req('GET', '/api/panels/' + panelId + '/review');
  }
};

// Penukar tab semasa projek (diset oleh renderDetail) — untuk butang "Pergi ke".
let activeSetTab = null;

// ---- Status ---------------------------------------------------------------
const STATUS_LABELS = {
  draft: 'Draf',
  text_ready: 'Teks sedia',
  character_ready: 'Watak sedia',
  storyboard_ready: 'Papan cerita sedia',
  script_ready: 'Skrip sedia',
  panel_ready: 'Panel sedia',
  image_prompt_ready: 'Prompt sedia',
  image_generated: 'Gambar dijana',
  published: 'Diterbitkan'
};

function statusLabel(s) {
  return STATUS_LABELS[s] || s || '—';
}

function statusPill(s) {
  return el('span', { class: 'status-pill status-pill--' + (s || 'draft'), text: statusLabel(s) });
}

// ---- Label watak ----------------------------------------------------------
const CHAR_TYPE_LABELS = {
  noble_figure_no_face: 'Tokoh mulia (tanpa muka)',
  ordinary_character: 'Watak biasa',
  background_character: 'Watak latar'
};
const FACE_POLICY_LABELS = {
  glowing_light: 'Cahaya bersinar',
  normal: 'Normal'
};

function charTypeLabel(t) {
  return CHAR_TYPE_LABELS[t] || t || '—';
}
function facePolicyLabel(f) {
  return FACE_POLICY_LABELS[f] || f || '—';
}
function charTypeBadge(t) {
  return el('span', { class: 'badge badge--' + (t || 'ordinary_character'), text: charTypeLabel(t) });
}

// ---- Label babak ----------------------------------------------------------
const SCENE_TYPE_LABELS = {
  intro: 'Pengenalan',
  journey: 'Perjalanan',
  meeting: 'Pertemuan',
  lesson: 'Pengajaran',
  event: 'Peristiwa',
  reveal: 'Pendedahan',
  ending: 'Penutup'
};
function sceneTypeLabel(t) {
  return SCENE_TYPE_LABELS[t] || t || '—';
}
function codeChip(code) {
  return el('span', { class: 'code-chip', text: code });
}

// ---- Label panel ----------------------------------------------------------
const PANEL_TYPE_LABELS = {
  establishing: 'Pembukaan',
  character: 'Watak',
  dialogue: 'Dialog',
  action: 'Aksi',
  reaction: 'Reaksi',
  transition: 'Peralihan',
  reveal: 'Pendedahan',
  closing: 'Penutup'
};
const SHOT_TYPE_LABELS = {
  wide: 'Wide',
  medium: 'Medium',
  close_up: 'Close-up',
  over_shoulder: 'Over-shoulder',
  low_angle: 'Sudut rendah',
  high_angle: 'Sudut tinggi',
  detail: 'Detail'
};
function panelTypeLabel(t) { return PANEL_TYPE_LABELS[t] || t || '—'; }
function shotTypeLabel(t) { return SHOT_TYPE_LABELS[t] || t || '—'; }

// ---- Label script (Fasa 7) ------------------------------------------------
const SCRIPT_TYPE_LABELS = {
  narration: 'Naratif',
  dialogue: 'Dialog',
  thought: 'Fikiran',
  dua: 'Doa',
  sfx: 'SFX',
  caption: 'Kapsyen',
  reaction: 'Reaksi'
};
const BUBBLE_TYPE_LABELS = {
  speech: 'Bualan',
  thought: 'Fikiran',
  narration: 'Naratif',
  dua: 'Doa',
  sfx: 'SFX',
  caption: 'Kapsyen',
  none: 'Tiada'
};
const SCRIPT_EMOTION_LABELS = {
  neutral: 'Neutral',
  calm: 'Tenang',
  solemn: 'Khidmat',
  sad: 'Sedih',
  happy: 'Gembira',
  angry: 'Marah',
  fear: 'Takut',
  surprised: 'Terkejut',
  thinking: 'Berfikir',
  respectful: 'Hormat',
  wonder: 'Kagum'
};
const SCRIPT_STATUS_LABELS = {
  draft: 'Draf',
  approved: 'Dilulus'
};
function scriptTypeLabel(t) { return SCRIPT_TYPE_LABELS[t] || t || '—'; }
function bubbleTypeLabel(t) { return BUBBLE_TYPE_LABELS[t] || t || '—'; }
function scriptEmotionLabel(t) { return SCRIPT_EMOTION_LABELS[t] || t || '—'; }
function scriptStatusLabel(t) { return SCRIPT_STATUS_LABELS[t] || t || '—'; }

// ---- Visual Director: kamus enum (untuk select) & paparan -----------------
const VISUAL_ENUMS = {
  shot: ['establishing_shot', 'wide_shot', 'full_shot', 'medium_shot', 'medium_close_up', 'close_up', 'extreme_close_up', 'over_the_shoulder', 'insert_detail'],
  angle: ['eye_level', 'low_angle', 'high_angle', 'birds_eye', 'worms_eye', 'dutch_angle'],
  lens: ['wide_24mm', 'normal_35mm', 'normal_50mm', 'portrait_85mm', 'tele_135mm'],
  composition: ['centered', 'rule_of_thirds', 'symmetry', 'leading_lines', 'frame_within_frame', 'golden_ratio', 'negative_space'],
  camera_movement: ['static', 'pan', 'tilt', 'dolly_in', 'dolly_out', 'tracking', 'crane', 'handheld'],
  weather: ['clear', 'sunny', 'cloudy', 'overcast', 'rain', 'storm', 'windy', 'foggy', 'sandstorm'],
  time_of_day: ['dawn', 'morning', 'midday', 'afternoon', 'golden_hour', 'dusk', 'night'],
  lighting: ['soft_daylight', 'warm_sunlight', 'golden_light', 'overcast_diffuse', 'dramatic_shadow', 'backlight', 'moonlight', 'divine_glow'],
  atmosphere: ['calm', 'tense', 'solemn', 'joyful', 'mysterious', 'reverent', 'melancholic', 'energetic'],
  color_palette: ['warm', 'cool', 'earth_tones', 'desert_sand', 'muted', 'vibrant', 'monochrome', 'golden'],
  detail_level: ['low', 'medium', 'high', 'very_high'],
  depth: ['flat', 'shallow', 'medium', 'deep'],
  focus: ['sharp_foreground', 'soft_background', 'deep_focus', 'selective_focus'],
  visual_priority: ['character', 'environment', 'action', 'emotion', 'symbolic'],
  face_policy: ['normal', 'glowing_light']
};

function pretty(v) {
  if (v === null || v === undefined || v === '') return '—';
  return String(v).replace(/_/g, ' ').replace(/\b\w/g, function (c) { return c.toUpperCase(); });
}

// ---- Utiliti ---------------------------------------------------------------
function projectTitle(p) {
  return (p && (p.title_ms || p.title_ar)) || 'Tanpa tajuk';
}

function formatDate(iso) {
  if (!iso) return '';
  try {
    return new Date(iso).toLocaleDateString('ms-MY', {
      day: 'numeric',
      month: 'short',
      year: 'numeric'
    });
  } catch (e) {
    return String(iso).slice(0, 10);
  }
}

// ---- Toast ----------------------------------------------------------------
let toastTimer = null;
function toast(message, kind) {
  const t = byId('toast');
  if (!t) return;
  t.textContent = message;
  t.className = 'toast toast--' + (kind || 'info');
  t.hidden = false;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(function () {
    t.hidden = true;
  }, 3200);
}

// ---- Modal ----------------------------------------------------------------
function openModal(card) {
  const root = byId('modal-root');
  root.innerHTML = '';
  const overlay = el('div', {
    class: 'modal-overlay',
    onClick: function (e) {
      if (e.target === overlay) closeModal();
    }
  }, card);
  root.appendChild(overlay);
  root.hidden = false;
  document.body.classList.add('no-scroll');
  const focusable = card.querySelector('input, textarea, button');
  if (focusable) focusable.focus();
}

function closeModal() {
  const root = byId('modal-root');
  root.hidden = true;
  root.innerHTML = '';
  document.body.classList.remove('no-scroll');
}

document.addEventListener('keydown', function (e) {
  if (e.key === 'Escape') closeModal();
});

// ---- Borang cipta / edit projek -------------------------------------------
function openProjectForm(existing) {
  const isEdit = !!existing;

  const titleMs = el('input', {
    class: 'field-input',
    type: 'text',
    id: 'f-title-ms',
    placeholder: 'cth. Kisah Kejujuran',
    value: isEdit ? existing.title_ms || '' : ''
  });
  const titleAr = el('input', {
    class: 'field-input field-input--ar',
    type: 'text',
    id: 'f-title-ar',
    dir: 'rtl',
    lang: 'ar',
    placeholder: 'العنوان بالعربية',
    value: isEdit ? existing.title_ar || '' : ''
  });
  const desc = el('textarea', {
    class: 'field-input',
    id: 'f-desc',
    rows: '3',
    placeholder: 'Penerangan ringkas (pilihan)'
  });
  desc.value = isEdit ? existing.description || '' : '';

  const errLine = el('p', { class: 'form-error', hidden: true });

  const form = el('form', {
    class: 'modal-form',
    onSubmit: async function (e) {
      e.preventDefault();
      const payload = {
        title_ms: titleMs.value.trim(),
        title_ar: titleAr.value.trim(),
        description: desc.value.trim()
      };
      if (!payload.title_ms && !payload.title_ar) {
        errLine.textContent = 'Sila isi sekurang-kurangnya satu tajuk.';
        errLine.hidden = false;
        return;
      }
      const submit = form.querySelector('.btn-primary');
      submit.disabled = true;
      submit.textContent = 'Menyimpan…';
      try {
        if (isEdit) {
          await api.updateProject(existing.id, payload);
          closeModal();
          toast('Projek dikemas kini', 'ok');
          renderDetail(existing.id);
        } else {
          const created = await api.createProject(payload);
          closeModal();
          toast('Projek dicipta', 'ok');
          location.hash = '#/project/' + created.id;
        }
      } catch (err) {
        submit.disabled = false;
        submit.textContent = isEdit ? 'Simpan' : 'Cipta';
        errLine.textContent = err.message;
        errLine.hidden = false;
      }
    }
  }, [
    el('h2', { class: 'modal-title', text: isEdit ? 'Edit projek' : 'Projek baharu' }),
    el('label', { class: 'field' }, [
      el('span', { class: 'field-label', text: 'Tajuk (Melayu)' }),
      titleMs
    ]),
    el('label', { class: 'field' }, [
      el('span', { class: 'field-label', text: 'Tajuk (Arab)' }),
      titleAr
    ]),
    el('label', { class: 'field' }, [
      el('span', { class: 'field-label', text: 'Penerangan' }),
      desc
    ]),
    errLine,
    el('div', { class: 'modal-actions' }, [
      el('button', { class: 'btn btn-ghost', type: 'button', onClick: closeModal, text: 'Batal' }),
      el('button', { class: 'btn btn-primary', type: 'submit', text: isEdit ? 'Simpan' : 'Cipta' })
    ])
  ]);

  openModal(el('div', { class: 'modal-card' }, form));
}

// ---- Pengesahan padam -----------------------------------------------------
function openDeleteConfirm(project) {
  const card = el('div', { class: 'modal-card' }, [
    el('h2', { class: 'modal-title', text: 'Padam projek?' }),
    el('p', { class: 'modal-text' }, [
      'Projek ',
      el('strong', { text: projectTitle(project) }),
      ' dan semua teks berkaitan akan dipadam kekal. Tindakan ini tidak boleh dibatalkan.'
    ]),
    el('div', { class: 'modal-actions' }, [
      el('button', { class: 'btn btn-ghost', type: 'button', onClick: closeModal, text: 'Batal' }),
      el('button', {
        class: 'btn btn-danger',
        type: 'button',
        text: 'Padam',
        onClick: async function (e) {
          const b = e.currentTarget;
          b.disabled = true;
          b.textContent = 'Memadam…';
          try {
            await api.deleteProject(project.id);
            closeModal();
            toast('Projek dipadam', 'ok');
            location.hash = '#/';
          } catch (err) {
            b.disabled = false;
            b.textContent = 'Padam';
            toast(err.message, 'error');
          }
        }
      })
    ])
  ]);
  openModal(card);
}

// ---- Kad projek -----------------------------------------------------------
function projectCard(p) {
  return el('a', { class: 'card', href: '#/project/' + p.id }, [
    el('div', { class: 'card-top' }, [
      el('h3', { class: 'card-title', text: projectTitle(p) }),
      statusPill(p.status)
    ]),
    p.title_ar ? el('p', { class: 'card-ar', lang: 'ar', dir: 'rtl', text: p.title_ar }) : null,
    p.description ? el('p', { class: 'card-desc', text: p.description }) : null,
    el('p', { class: 'card-meta', text: 'Dikemas kini ' + formatDate(p.updated_at) })
  ]);
}

function emptyState() {
  return el('div', { class: 'empty' }, [
    el('p', { class: 'empty-ar', lang: 'ar', dir: 'rtl', text: 'ابدأ هنا' }),
    el('p', { class: 'empty-title', text: 'Belum ada projek' }),
    el('p', { class: 'empty-text', text: 'Cipta projek pertama untuk mula memasukkan teks Mutalaah.' }),
    el('button', { class: 'btn btn-primary', type: 'button', onClick: function () { openProjectForm(null); }, text: '+ Projek baharu' })
  ]);
}

// ---- Paparan: Dashboard ---------------------------------------------------
async function renderDashboard() {
  const view = byId('view');
  view.innerHTML = '';

  view.appendChild(el('div', { class: 'page-head' }, [
    el('h1', { class: 'page-title', text: 'Projek' }),
    el('button', { class: 'btn btn-primary', type: 'button', onClick: function () { openProjectForm(null); }, text: '+ Projek baharu' })
  ]));

  const listWrap = el('div', { class: 'list' }, el('p', { class: 'muted', text: 'Memuatkan…' }));
  view.appendChild(listWrap);

  try {
    const projects = await api.listProjects();
    listWrap.innerHTML = '';
    if (!projects.length) {
      listWrap.appendChild(emptyState());
      return;
    }
    projects.forEach(function (p) {
      listWrap.appendChild(projectCard(p));
    });
  } catch (err) {
    listWrap.innerHTML = '';
    listWrap.appendChild(el('p', { class: 'error-text', text: 'Gagal memuatkan projek: ' + err.message }));
  }
}

// ---- Paparan: Detail (tab TEKS / WATAK) ----------------------------------
async function renderDetail(id) {
  const view = byId('view');
  view.innerHTML = '';
  view.appendChild(el('p', { class: 'muted', text: 'Memuatkan…' }));

  let project;
  try {
    project = await api.getProject(id);
  } catch (err) {
    view.innerHTML = '';
    view.appendChild(el('a', { class: 'back-link', href: '#/', text: '← Semua projek' }));
    view.appendChild(el('p', { class: 'error-text', text: 'Tidak dapat membuka projek: ' + err.message }));
    return;
  }

  view.innerHTML = '';
  view.appendChild(el('a', { class: 'back-link', href: '#/', text: '← Semua projek' }));

  const statusWrap = el('span', { class: 'detail-status' }, statusPill(project.status));
  function updateStatus(s) {
    statusWrap.innerHTML = '';
    statusWrap.appendChild(statusPill(s));
  }

  view.appendChild(el('div', { class: 'detail-head' }, [
    el('div', { class: 'detail-head-row' }, [
      el('div', { class: 'detail-titles' }, [
        el('h1', { class: 'detail-title', text: projectTitle(project) }),
        project.title_ar ? el('p', { class: 'detail-ar', lang: 'ar', dir: 'rtl', text: project.title_ar }) : null,
        statusWrap
      ]),
      el('div', { class: 'detail-actions' }, [
        el('button', { class: 'btn btn-ghost btn-sm', type: 'button', onClick: function () { openProjectForm(project); }, text: 'Edit' }),
        el('button', { class: 'btn btn-danger btn-sm', type: 'button', onClick: function () { openDeleteConfirm(project); }, text: 'Padam' })
      ])
    ]),
    project.description ? el('p', { class: 'detail-desc', text: project.description }) : null
  ]));

  // Tab bar: TEKS | WATAK | BABAK | PANEL | SCRIPT | VISUAL | PROMPT | REVIEW
  const tabTeks = el('button', { class: 'tab is-active', type: 'button', text: 'Teks' });
  const tabWatak = el('button', { class: 'tab', type: 'button', text: 'Watak' });
  const tabBabak = el('button', { class: 'tab', type: 'button', text: 'Babak' });
  const tabPanel = el('button', { class: 'tab', type: 'button', text: 'Panel' });
  const tabScript = el('button', { class: 'tab', type: 'button', text: 'Script' });
  const tabVisual = el('button', { class: 'tab', type: 'button', text: 'Visual' });
  const tabPrompt = el('button', { class: 'tab', type: 'button', text: 'Prompt' });
  const tabReview = el('button', { class: 'tab', type: 'button', text: 'Review' });
  const content = el('div', { class: 'tab-content' });

  function setTab(name) {
    tabTeks.className = 'tab';
    tabWatak.className = 'tab';
    tabBabak.className = 'tab';
    tabPanel.className = 'tab';
    tabScript.className = 'tab';
    tabVisual.className = 'tab';
    tabPrompt.className = 'tab';
    tabReview.className = 'tab';
    if (name === 'watak') {
      tabWatak.className = 'tab is-active';
      renderCharacterTab(id, content, updateStatus);
    } else if (name === 'babak') {
      tabBabak.className = 'tab is-active';
      renderSceneTab(id, content, updateStatus);
    } else if (name === 'panel') {
      tabPanel.className = 'tab is-active';
      renderPanelTab(id, content, updateStatus);
    } else if (name === 'script') {
      tabScript.className = 'tab is-active';
      renderScriptTab(id, content, updateStatus);
    } else if (name === 'visual') {
      tabVisual.className = 'tab is-active';
      renderVisualTab(id, content, updateStatus);
    } else if (name === 'prompt') {
      tabPrompt.className = 'tab is-active';
      renderPromptTab(id, content, updateStatus);
    } else if (name === 'review') {
      tabReview.className = 'tab is-active';
      renderReviewTab(id, content, updateStatus);
    } else {
      tabTeks.className = 'tab is-active';
      renderTextTab(id, content, updateStatus);
    }
  }
  // Disimpan supaya kad Review boleh "Pergi ke" tab lain.
  activeSetTab = setTab;
  tabTeks.addEventListener('click', function () { setTab('teks'); });
  tabWatak.addEventListener('click', function () { setTab('watak'); });
  tabBabak.addEventListener('click', function () { setTab('babak'); });
  tabPanel.addEventListener('click', function () { setTab('panel'); });
  tabScript.addEventListener('click', function () { setTab('script'); });
  tabVisual.addEventListener('click', function () { setTab('visual'); });
  tabPrompt.addEventListener('click', function () { setTab('prompt'); });
  tabReview.addEventListener('click', function () { setTab('review'); });

  view.appendChild(el('div', { class: 'tabs' }, [tabTeks, tabWatak, tabBabak, tabPanel, tabScript, tabVisual, tabPrompt, tabReview]));
  view.appendChild(content);
  setTab('teks');
}

// ---- Tab: Teks (editor tiga panel — fungsi Fasa 1) -----------------------
async function renderTextTab(id, container, updateStatus) {
  container.innerHTML = '';
  container.appendChild(el('p', { class: 'muted', text: 'Memuatkan teks…' }));

  let text;
  try {
    text = await api.getText(id);
  } catch (err) {
    container.innerHTML = '';
    container.appendChild(el('p', { class: 'error-text', text: 'Gagal memuatkan teks: ' + err.message }));
    return;
  }
  container.innerHTML = '';

  const arInput = el('textarea', { class: 'editor-input editor-input--ar', dir: 'rtl', lang: 'ar', rows: '8', placeholder: 'الصق نص المطالعة العربي هنا…' });
  arInput.value = text.original_ar || '';
  const msInput = el('textarea', { class: 'editor-input', rows: '6', placeholder: 'Terjemahan Melayu…' });
  msInput.value = text.translation_ms || '';
  const notesInput = el('textarea', { class: 'editor-input', rows: '4', placeholder: 'Nota, kosa kata, atau nilai pengajaran…' });
  notesInput.value = text.notes || '';
  const saveBtn = el('button', { class: 'btn btn-primary', type: 'submit', text: 'Simpan teks' });

  const editor = el('form', {
    class: 'editor',
    onSubmit: async function (e) {
      e.preventDefault();
      saveBtn.disabled = true;
      saveBtn.textContent = 'Menyimpan…';
      try {
        const result = await api.saveText(id, { original_ar: arInput.value, translation_ms: msInput.value, notes: notesInput.value });
        if (result && result.project) updateStatus(result.project.status);
        toast('Teks disimpan', 'ok');
      } catch (err) {
        toast(err.message, 'error');
      } finally {
        saveBtn.disabled = false;
        saveBtn.textContent = 'Simpan teks';
      }
    }
  }, [
    el('div', { class: 'panel-block' }, [
      el('div', { class: 'panel-label' }, [
        el('span', { class: 'panel-label-ms', text: 'Teks Arab asal' }),
        el('span', { class: 'panel-hint', text: 'Mengisi ruangan ini → status “Teks sedia”' })
      ]),
      arInput
    ]),
    el('div', { class: 'panel-block' }, [
      el('div', { class: 'panel-label' }, [el('span', { class: 'panel-label-ms', text: 'Terjemahan Melayu' })]),
      msInput
    ]),
    el('div', { class: 'panel-block' }, [
      el('div', { class: 'panel-label' }, [el('span', { class: 'panel-label-ms', text: 'Nota / kosa kata / nilai pengajaran' })]),
      notesInput
    ]),
    el('div', { class: 'editor-actions' }, saveBtn)
  ]);

  container.appendChild(editor);
}

// ---- Tab: Watak -----------------------------------------------------------
async function renderCharacterTab(id, container, updateStatus) {
  container.innerHTML = '';
  container.appendChild(el('p', { class: 'muted', text: 'Memuatkan watak…' }));

  let chars;
  try {
    chars = await api.listCharacters(id);
  } catch (err) {
    container.innerHTML = '';
    container.appendChild(el('p', { class: 'error-text', text: 'Gagal memuatkan watak: ' + err.message }));
    return;
  }
  container.innerHTML = '';

  function reload() { renderCharacterTab(id, container, updateStatus); }

  const genBtn = el('button', { class: 'btn btn-primary', type: 'button', text: 'Jana watak' });
  genBtn.addEventListener('click', async function () {
    genBtn.disabled = true;
    genBtn.textContent = 'Menjana…';
    try {
      const r = await api.generateCharacters(id);
      if (r && r.project) updateStatus(r.project.status);
      const made = (r && r.created) ? r.created.length : 0;
      const detected = (r && r.detected) || 0;
      if (detected === 0) toast('Tiada watak dikenali daripada teks', 'info');
      else toast(made > 0 ? ('Dijana ' + made + ' watak baharu') : 'Semua watak sudah wujud', 'ok');
      reload();
    } catch (err) {
      genBtn.disabled = false;
      genBtn.textContent = 'Jana watak';
      toast(err.message, 'error');
    }
  });

  const addBtn = el('button', { class: 'btn btn-ghost', type: 'button', text: 'Tambah watak' });
  addBtn.addEventListener('click', function () { openCharacterForm(id, null, updateStatus, reload); });

  container.appendChild(el('div', { class: 'char-toolbar' }, [genBtn, addBtn]));

  if (!chars.length) {
    container.appendChild(el('div', { class: 'empty' }, [
      el('p', { class: 'empty-ar', lang: 'ar', dir: 'rtl', text: 'لا شخصيات بعد' }),
      el('p', { class: 'empty-title', text: 'Belum ada watak' }),
      el('p', { class: 'empty-text', text: 'Tekan “Jana watak” untuk mengekstrak watak daripada teks Arab, atau tambah secara manual.' })
    ]));
    return;
  }

  const list = el('div', { class: 'char-list' });
  chars.forEach(function (c) { list.appendChild(characterCard(c, updateStatus, reload)); });
  container.appendChild(list);
}

function characterCard(c, updateStatus, reload) {
  return el('div', { class: 'char-card' }, [
    el('div', { class: 'char-top' }, [
      el('div', { class: 'char-names' }, [
        c.name_ar ? el('p', { class: 'char-ar', lang: 'ar', dir: 'rtl', text: c.name_ar }) : null,
        el('p', { class: 'char-ms', text: c.name_ms || '—' })
      ]),
      charTypeBadge(c.character_type)
    ]),
    el('p', { class: 'char-code', text: c.character_code || '—' }),
    c.role ? el('p', { class: 'char-role', text: c.role }) : null,
    el('div', { class: 'char-chips' }, [
      el('span', { class: 'chip chip--' + (c.face_policy || 'normal'), text: 'Muka: ' + facePolicyLabel(c.face_policy) })
    ]),
    el('div', { class: 'char-actions' }, [
      el('button', { class: 'btn btn-ghost btn-sm', type: 'button', onClick: function () { openCharacterForm(c.project_id, c, updateStatus, reload); }, text: 'Edit' }),
      el('button', { class: 'btn btn-danger btn-sm', type: 'button', onClick: function () { openCharacterDelete(c, updateStatus, reload); }, text: 'Padam' })
    ])
  ]);
}

// ---- Borang watak (tambah / edit) ----------------------------------------
function openCharacterForm(projectId, existing, updateStatus, reload) {
  const isEdit = !!existing;

  const nameAr = el('input', { class: 'field-input field-input--ar', type: 'text', dir: 'rtl', lang: 'ar', placeholder: 'الاسم بالعربية', value: isEdit ? (existing.name_ar || '') : '' });
  const nameMs = el('input', { class: 'field-input', type: 'text', placeholder: 'cth. Nabi Musa', value: isEdit ? (existing.name_ms || '') : '' });
  const role = el('input', { class: 'field-input', type: 'text', placeholder: 'Peranan dalam cerita', value: isEdit ? (existing.role || '') : '' });
  const notes = el('textarea', { class: 'field-input', rows: '2', placeholder: 'Nota penampilan (pilihan)' });
  notes.value = isEdit ? (existing.appearance_notes || '') : '';
  const dna = el('textarea', { class: 'field-input field-input--mono', rows: '4', placeholder: '{ "gender": "male", "age": "adult" }' });
  dna.value = (isEdit && existing.visual_dna) ? JSON.stringify(existing.visual_dna, null, 2) : '';

  let typeSelect = null;
  if (!isEdit) {
    typeSelect = el('select', { class: 'field-input' }, [
      el('option', { value: 'ordinary_character' }, 'Watak biasa'),
      el('option', { value: 'noble_figure_no_face' }, 'Tokoh mulia (tanpa muka)'),
      el('option', { value: 'background_character' }, 'Watak latar')
    ]);
  }

  const errLine = el('p', { class: 'form-error', hidden: true });

  const fields = [el('h2', { class: 'modal-title', text: isEdit ? 'Edit watak' : 'Tambah watak' })];
  if (isEdit) {
    fields.push(el('div', { class: 'locked-row' }, [
      el('span', { class: 'locked-label', text: 'Character code (tetap)' }),
      el('span', { class: 'locked-value', text: existing.character_code || '—' })
    ]));
    fields.push(el('div', { class: 'locked-row' }, [
      el('span', { class: 'locked-label', text: 'Jenis' }),
      charTypeBadge(existing.character_type)
    ]));
  }
  fields.push(el('label', { class: 'field' }, [el('span', { class: 'field-label', text: 'Nama (Arab)' }), nameAr]));
  fields.push(el('label', { class: 'field' }, [el('span', { class: 'field-label', text: 'Nama (Melayu)' }), nameMs]));
  if (!isEdit) fields.push(el('label', { class: 'field' }, [el('span', { class: 'field-label', text: 'Jenis watak' }), typeSelect]));
  fields.push(el('label', { class: 'field' }, [el('span', { class: 'field-label', text: 'Peranan' }), role]));
  fields.push(el('label', { class: 'field' }, [el('span', { class: 'field-label', text: 'Nota penampilan' }), notes]));
  fields.push(el('label', { class: 'field' }, [el('span', { class: 'field-label', text: 'Visual DNA (JSON)' }), dna]));
  fields.push(errLine);
  fields.push(el('div', { class: 'modal-actions' }, [
    el('button', { class: 'btn btn-ghost', type: 'button', onClick: closeModal, text: 'Batal' }),
    el('button', { class: 'btn btn-primary', type: 'submit', text: isEdit ? 'Simpan' : 'Tambah' })
  ]));

  const form = el('form', {
    class: 'modal-form',
    onSubmit: async function (e) {
      e.preventDefault();
      const nAr = nameAr.value.trim();
      const nMs = nameMs.value.trim();
      if (!nAr && !nMs) { errLine.textContent = 'Sila isi sekurang-kurangnya satu nama.'; errLine.hidden = false; return; }
      let dnaVal = {};
      const dnaText = dna.value.trim();
      if (dnaText) {
        try {
          dnaVal = JSON.parse(dnaText);
          if (!dnaVal || typeof dnaVal !== 'object' || Array.isArray(dnaVal)) throw new Error('x');
        } catch (_) {
          errLine.textContent = 'Visual DNA mesti objek JSON yang sah.';
          errLine.hidden = false;
          return;
        }
      }
      const submit = form.querySelector('.btn-primary');
      submit.disabled = true;
      submit.textContent = 'Menyimpan…';
      try {
        if (isEdit) {
          await api.updateCharacter(existing.id, { name_ar: nAr, name_ms: nMs, role: role.value.trim(), appearance_notes: notes.value.trim(), visual_dna: dnaVal });
          toast('Watak dikemas kini', 'ok');
        } else {
          const r = await api.addCharacter(projectId, { name_ar: nAr, name_ms: nMs, character_type: typeSelect.value, role: role.value.trim(), appearance_notes: notes.value.trim(), visual_dna: dnaVal });
          if (r && r.project) updateStatus(r.project.status);
          toast('Watak ditambah', 'ok');
        }
        closeModal();
        reload();
      } catch (err) {
        submit.disabled = false;
        submit.textContent = isEdit ? 'Simpan' : 'Tambah';
        errLine.textContent = err.message;
        errLine.hidden = false;
      }
    }
  }, fields);

  openModal(el('div', { class: 'modal-card' }, form));
}

function openCharacterDelete(c, updateStatus, reload) {
  const card = el('div', { class: 'modal-card' }, [
    el('h2', { class: 'modal-title', text: 'Padam watak?' }),
    el('p', { class: 'modal-text' }, [
      'Watak ',
      el('strong', { text: c.name_ms || c.name_ar || c.character_code }),
      ' akan dipadam. Tindakan ini tidak boleh dibatalkan.'
    ]),
    el('div', { class: 'modal-actions' }, [
      el('button', { class: 'btn btn-ghost', type: 'button', onClick: closeModal, text: 'Batal' }),
      el('button', {
        class: 'btn btn-danger', type: 'button', text: 'Padam',
        onClick: async function (e) {
          const b = e.currentTarget;
          b.disabled = true;
          b.textContent = 'Memadam…';
          try {
            const r = await api.deleteCharacter(c.id);
            if (r && r.project) updateStatus(r.project.status);
            closeModal();
            toast('Watak dipadam', 'ok');
            reload();
          } catch (err) {
            b.disabled = false;
            b.textContent = 'Padam';
            toast(err.message, 'error');
          }
        }
      })
    ])
  ]);
  openModal(card);
}

// ---- Tab: Babak -----------------------------------------------------------
async function renderSceneTab(id, container, updateStatus) {
  container.innerHTML = '';
  container.appendChild(el('p', { class: 'muted', text: 'Memuatkan babak…' }));

  let scenes;
  try {
    scenes = await api.listScenes(id);
  } catch (err) {
    container.innerHTML = '';
    container.appendChild(el('p', { class: 'error-text', text: 'Gagal memuatkan babak: ' + err.message }));
    return;
  }
  container.innerHTML = '';

  function reload() { renderSceneTab(id, container, updateStatus); }

  const genBtn = el('button', { class: 'btn btn-primary', type: 'button', text: 'Jana babak' });
  genBtn.addEventListener('click', async function () {
    genBtn.disabled = true;
    genBtn.textContent = 'Menjana…';
    try {
      const r = await api.generateScenes(id);
      if (r && r.project) updateStatus(r.project.status);
      const made = (r && typeof r.created === 'number') ? r.created : 0;
      const detected = (r && r.detected) || 0;
      if (detected === 0) toast('Tiada babak dikenali daripada teks', 'info');
      else toast(made > 0 ? ('Dijana ' + made + ' babak') : 'Semua babak sudah wujud', 'ok');
      reload();
    } catch (err) {
      genBtn.disabled = false;
      genBtn.textContent = 'Jana babak';
      toast(err.message, 'error');
    }
  });

  const addBtn = el('button', { class: 'btn btn-ghost', type: 'button', text: 'Tambah babak' });
  addBtn.addEventListener('click', function () { openSceneForm(id, null, scenes, updateStatus, reload); });

  container.appendChild(el('div', { class: 'char-toolbar' }, [genBtn, addBtn]));

  if (!scenes.length) {
    container.appendChild(el('div', { class: 'empty' }, [
      el('p', { class: 'empty-ar', lang: 'ar', dir: 'rtl', text: 'لا مشاهد بعد' }),
      el('p', { class: 'empty-title', text: 'Belum ada babak' }),
      el('p', { class: 'empty-text', text: 'Tekan “Jana babak” untuk memecahkan teks kepada babak. Pastikan teks dan watak sudah disediakan dahulu.' })
    ]));
    return;
  }

  const list = el('div', { class: 'scene-list' });
  scenes.forEach(function (s) { list.appendChild(sceneCard(s, scenes, updateStatus, reload)); });
  container.appendChild(list);
}

function sceneCard(s, scenes, updateStatus, reload) {
  const codes = Array.isArray(s.characters_json) ? s.characters_json : [];
  return el('div', { class: 'scene-card' }, [
    el('div', { class: 'scene-top' }, [
      el('span', { class: 'scene-no', text: 'Babak ' + s.scene_no }),
      el('span', { class: 'badge badge--scene', text: sceneTypeLabel(s.scene_type) })
    ]),
    s.title_ar ? el('p', { class: 'scene-ar', lang: 'ar', dir: 'rtl', text: s.title_ar }) : null,
    s.title_ms ? el('p', { class: 'scene-ms', text: s.title_ms }) : null,
    s.summary_ms ? el('p', { class: 'scene-summary', text: s.summary_ms }) : null,
    el('div', { class: 'scene-meta' }, [
      s.location ? el('span', { class: 'meta-item' }, [el('span', { class: 'meta-key', text: 'Lokasi: ' }), s.location]) : null,
      s.mood ? el('span', { class: 'meta-item' }, [el('span', { class: 'meta-key', text: 'Mood: ' }), s.mood]) : null,
      el('span', { class: 'meta-item' }, [el('span', { class: 'meta-key', text: 'Halaman: ' }), String(s.estimated_pages || 1)])
    ]),
    codes.length ? el('div', { class: 'scene-chips' }, codes.map(codeChip)) : null,
    el('div', { class: 'scene-actions' }, [
      el('button', { class: 'btn btn-ghost btn-sm', type: 'button', onClick: function () { openSceneForm(s.project_id, s, scenes, updateStatus, reload); }, text: 'Edit' }),
      el('button', { class: 'btn btn-danger btn-sm', type: 'button', onClick: function () { openSceneDelete(s, updateStatus, reload); }, text: 'Padam' })
    ])
  ]);
}

// ---- Borang babak (tambah / edit) ----------------------------------------
function openSceneForm(projectId, existing, scenes, updateStatus, reload) {
  const isEdit = !!existing;
  let nextNo = 1;
  (scenes || []).forEach(function (s) { if (s.scene_no >= nextNo) nextNo = s.scene_no + 1; });

  const sceneNo = el('input', { class: 'field-input', type: 'number', min: '1', value: isEdit ? String(existing.scene_no) : String(nextNo) });
  const titleAr = el('input', { class: 'field-input field-input--ar', type: 'text', dir: 'rtl', lang: 'ar', placeholder: 'العنوان بالعربية', value: isEdit ? (existing.title_ar || '') : '' });
  const titleMs = el('input', { class: 'field-input', type: 'text', placeholder: 'cth. Musa bertemu Khidir', value: isEdit ? (existing.title_ms || '') : '' });
  const summary = el('textarea', { class: 'field-input', rows: '2', placeholder: 'Ringkasan babak' });
  summary.value = isEdit ? (existing.summary_ms || '') : '';
  const mood = el('input', { class: 'field-input', type: 'text', placeholder: 'cth. tenang, penuh adab', value: isEdit ? (existing.mood || '') : '' });
  const location = el('input', { class: 'field-input field-input--ar', type: 'text', dir: 'rtl', lang: 'ar', placeholder: 'cth. مجمع البحرين', value: isEdit ? (existing.location || '') : '' });
  const sourceHint = el('input', { class: 'field-input', type: 'text', placeholder: 'Petunjuk sumber (pilihan)', value: isEdit ? (existing.source_hint || '') : '' });
  const chars = el('input', { class: 'field-input field-input--mono', type: 'text', placeholder: 'MUSA_001, KHIDR_001', value: (isEdit && Array.isArray(existing.characters_json)) ? existing.characters_json.join(', ') : '' });
  const pages = el('input', { class: 'field-input', type: 'number', min: '1', max: '20', value: isEdit ? String(existing.estimated_pages || 1) : '1' });

  const typeOpts = [['intro', 'Pengenalan'], ['journey', 'Perjalanan'], ['meeting', 'Pertemuan'], ['lesson', 'Pengajaran'], ['event', 'Peristiwa'], ['reveal', 'Pendedahan'], ['ending', 'Penutup']];
  const typeSelect = el('select', { class: 'field-input' }, typeOpts.map(function (o) {
    const opt = el('option', { value: o[0] }, o[1]);
    if (isEdit && existing.scene_type === o[0]) opt.selected = true;
    return opt;
  }));

  const errLine = el('p', { class: 'form-error', hidden: true });

  const form = el('form', {
    class: 'modal-form',
    onSubmit: async function (e) {
      e.preventDefault();
      const noVal = parseInt(sceneNo.value, 10);
      if (!Number.isInteger(noVal) || noVal < 1) { errLine.textContent = 'Nombor babak mesti nombor positif.'; errLine.hidden = false; return; }
      const pagesVal = parseInt(pages.value, 10);
      if (!Number.isInteger(pagesVal) || pagesVal < 1 || pagesVal > 20) { errLine.textContent = 'Anggaran halaman mesti antara 1 dan 20.'; errLine.hidden = false; return; }
      if (!titleAr.value.trim() && !titleMs.value.trim()) { errLine.textContent = 'Sila isi sekurang-kurangnya satu tajuk.'; errLine.hidden = false; return; }
      const charArr = chars.value.split(',').map(function (x) { return x.trim(); }).filter(function (x) { return x.length > 0; });
      const payload = {
        scene_no: noVal,
        title_ar: titleAr.value.trim(),
        title_ms: titleMs.value.trim(),
        summary_ms: summary.value.trim(),
        mood: mood.value.trim(),
        location: location.value.trim(),
        source_hint: sourceHint.value.trim(),
        characters_json: charArr,
        scene_type: typeSelect.value,
        estimated_pages: pagesVal
      };
      const submit = form.querySelector('.btn-primary');
      submit.disabled = true;
      submit.textContent = 'Menyimpan…';
      try {
        if (isEdit) {
          await api.updateScene(existing.id, payload);
          toast('Babak dikemas kini', 'ok');
        } else {
          const r = await api.addScene(projectId, payload);
          if (r && r.project) updateStatus(r.project.status);
          toast('Babak ditambah', 'ok');
        }
        closeModal();
        reload();
      } catch (err) {
        submit.disabled = false;
        submit.textContent = isEdit ? 'Simpan' : 'Tambah';
        errLine.textContent = err.message;
        errLine.hidden = false;
      }
    }
  }, [
    el('h2', { class: 'modal-title', text: isEdit ? 'Edit babak' : 'Tambah babak' }),
    el('label', { class: 'field' }, [el('span', { class: 'field-label', text: 'Nombor babak' }), sceneNo]),
    el('label', { class: 'field' }, [el('span', { class: 'field-label', text: 'Tajuk (Arab)' }), titleAr]),
    el('label', { class: 'field' }, [el('span', { class: 'field-label', text: 'Tajuk (Melayu)' }), titleMs]),
    el('label', { class: 'field' }, [el('span', { class: 'field-label', text: 'Ringkasan' }), summary]),
    el('label', { class: 'field' }, [el('span', { class: 'field-label', text: 'Jenis babak' }), typeSelect]),
    el('label', { class: 'field' }, [el('span', { class: 'field-label', text: 'Mood' }), mood]),
    el('label', { class: 'field' }, [el('span', { class: 'field-label', text: 'Lokasi' }), location]),
    el('label', { class: 'field' }, [el('span', { class: 'field-label', text: 'Watak (kod, dipisah koma)' }), chars]),
    el('label', { class: 'field' }, [el('span', { class: 'field-label', text: 'Anggaran halaman (1–20)' }), pages]),
    el('label', { class: 'field' }, [el('span', { class: 'field-label', text: 'Petunjuk sumber' }), sourceHint]),
    errLine,
    el('div', { class: 'modal-actions' }, [
      el('button', { class: 'btn btn-ghost', type: 'button', onClick: closeModal, text: 'Batal' }),
      el('button', { class: 'btn btn-primary', type: 'submit', text: isEdit ? 'Simpan' : 'Tambah' })
    ])
  ]);

  openModal(el('div', { class: 'modal-card' }, form));
}

function openSceneDelete(s, updateStatus, reload) {
  const card = el('div', { class: 'modal-card' }, [
    el('h2', { class: 'modal-title', text: 'Padam babak?' }),
    el('p', { class: 'modal-text' }, [
      'Babak ',
      el('strong', { text: '#' + s.scene_no + ' ' + (s.title_ms || s.title_ar || '') }),
      ' akan dipadam. Tindakan ini tidak boleh dibatalkan.'
    ]),
    el('div', { class: 'modal-actions' }, [
      el('button', { class: 'btn btn-ghost', type: 'button', onClick: closeModal, text: 'Batal' }),
      el('button', {
        class: 'btn btn-danger', type: 'button', text: 'Padam',
        onClick: async function (e) {
          const b = e.currentTarget;
          b.disabled = true;
          b.textContent = 'Memadam…';
          try {
            const r = await api.deleteScene(s.id);
            if (r && r.project) updateStatus(r.project.status);
            closeModal();
            toast('Babak dipadam', 'ok');
            reload();
          } catch (err) {
            b.disabled = false;
            b.textContent = 'Padam';
            toast(err.message, 'error');
          }
        }
      })
    ])
  ]);
  openModal(card);
}

// ---- Tab: Panel -----------------------------------------------------------
async function renderPanelTab(id, container, updateStatus) {
  container.innerHTML = '';
  container.appendChild(el('p', { class: 'muted', text: 'Memuatkan panel…' }));

  let scenes, panels;
  try {
    scenes = await api.listScenes(id);
    panels = await api.listProjectPanels(id);
  } catch (err) {
    container.innerHTML = '';
    container.appendChild(el('p', { class: 'error-text', text: 'Gagal memuatkan panel: ' + err.message }));
    return;
  }
  container.innerHTML = '';

  function reload() { renderPanelTab(id, container, updateStatus); }

  // Kumpulkan panel mengikut scene_id.
  const byScene = {};
  panels.forEach(function (p) {
    const key = String(p.scene_id);
    if (!byScene[key]) byScene[key] = [];
    byScene[key].push(p);
  });

  const genAllBtn = el('button', { class: 'btn btn-primary', type: 'button', text: 'Jana semua panel' });
  genAllBtn.addEventListener('click', async function () {
    genAllBtn.disabled = true;
    genAllBtn.textContent = 'Menjana…';
    try {
      const r = await api.generateAllPanels(id);
      if (r && r.project) updateStatus(r.project.status);
      const made = (r && typeof r.created === 'number') ? r.created : 0;
      toast(made > 0 ? ('Dijana ' + made + ' panel') : 'Semua panel sudah wujud', 'ok');
      reload();
    } catch (err) {
      genAllBtn.disabled = false;
      genAllBtn.textContent = 'Jana semua panel';
      toast(err.message, 'error');
    }
  });
  container.appendChild(el('div', { class: 'char-toolbar' }, [genAllBtn]));

  if (!scenes.length) {
    container.appendChild(el('div', { class: 'empty' }, [
      el('p', { class: 'empty-ar', lang: 'ar', dir: 'rtl', text: 'لا مشاهد بعد' }),
      el('p', { class: 'empty-title', text: 'Belum ada babak' }),
      el('p', { class: 'empty-text', text: 'Sila jana babak dahulu sebelum jana panel.' })
    ]));
    return;
  }

  scenes.forEach(function (s) {
    const scenePanels = byScene[String(s.id)] || [];

    const genBtn = el('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: 'Jana panel' });
    genBtn.addEventListener('click', async function () {
      genBtn.disabled = true;
      genBtn.textContent = 'Menjana…';
      try {
        const r = await api.generateScenePanels(s.id);
        if (r && r.project) updateStatus(r.project.status);
        const made = (r && typeof r.created === 'number') ? r.created : 0;
        toast(made > 0 ? ('Dijana ' + made + ' panel') : 'Panel babak sudah wujud', 'ok');
        reload();
      } catch (err) {
        genBtn.disabled = false;
        genBtn.textContent = 'Jana panel';
        toast(err.message, 'error');
      }
    });
    const addBtn = el('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: '+ Panel' });
    addBtn.addEventListener('click', function () { openPanelForm(s.id, null, scenePanels, updateStatus, reload); });

    container.appendChild(el('div', { class: 'scene-head' }, [
      el('div', { class: 'scene-head-titles' }, [
        el('span', { class: 'scene-head-no', text: 'Babak ' + s.scene_no }),
        s.title_ms ? el('span', { class: 'scene-head-ms', text: s.title_ms }) : null
      ]),
      el('div', { class: 'scene-head-actions' }, [genBtn, addBtn])
    ]));

    if (!scenePanels.length) {
      container.appendChild(el('p', { class: 'muted panel-empty', text: 'Belum ada panel untuk babak ini.' }));
      return;
    }
    const list = el('div', { class: 'panel-list' });
    scenePanels.forEach(function (p) { list.appendChild(panelCard(p, scenePanels, updateStatus, reload)); });
    container.appendChild(list);
  });
}

function panelCard(p, scenePanels, updateStatus, reload) {
  const codes = Array.isArray(p.characters_json) ? p.characters_json : [];
  return el('div', { class: 'panel-card' }, [
    el('div', { class: 'panel-top' }, [
      el('span', { class: 'panel-no', text: 'Panel ' + p.panel_no }),
      el('span', { class: 'badge badge--panel', text: panelTypeLabel(p.panel_type) })
    ]),
    codes.length ? el('div', { class: 'scene-chips' }, codes.map(codeChip)) : null,
    p.visual_ms ? el('p', { class: 'panel-visual', text: p.visual_ms }) : null,
    p.caption_ms ? el('p', { class: 'panel-caption' }, [el('span', { class: 'meta-key', text: 'Kapsyen: ' }), p.caption_ms]) : null,
    p.dialogue_ar ? el('p', { class: 'panel-dialogue-ar', lang: 'ar', dir: 'rtl', text: p.dialogue_ar }) : null,
    p.dialogue_ms ? el('p', { class: 'panel-dialogue', text: p.dialogue_ms }) : null,
    el('div', { class: 'scene-meta' }, [
      p.location ? el('span', { class: 'meta-item' }, [el('span', { class: 'meta-key', text: 'Lokasi: ' }), p.location]) : null,
      p.shot_type ? el('span', { class: 'meta-item' }, [el('span', { class: 'meta-key', text: 'Shot: ' }), shotTypeLabel(p.shot_type)]) : null,
      p.mood ? el('span', { class: 'meta-item' }, [el('span', { class: 'meta-key', text: 'Mood: ' }), p.mood]) : null
    ]),
    p.visual_notes ? el('p', { class: 'panel-notes', text: p.visual_notes }) : null,
    el('div', { class: 'scene-actions' }, [
      el('button', { class: 'btn btn-ghost btn-sm', type: 'button', onClick: function () { openPanelForm(p.scene_id, p, scenePanels, updateStatus, reload); }, text: 'Edit' }),
      el('button', { class: 'btn btn-danger btn-sm', type: 'button', onClick: function () { openPanelDelete(p, updateStatus, reload); }, text: 'Padam' })
    ])
  ]);
}

// ---- Borang panel (tambah / edit) ----------------------------------------
function openPanelForm(sceneId, existing, scenePanels, updateStatus, reload) {
  const isEdit = !!existing;
  let nextNo = 1;
  (scenePanels || []).forEach(function (p) { if (p.panel_no >= nextNo) nextNo = p.panel_no + 1; });

  const panelNo = el('input', { class: 'field-input', type: 'number', min: '1', value: isEdit ? String(existing.panel_no) : String(nextNo) });
  const panelOrder = el('input', { class: 'field-input', type: 'number', min: '1', value: isEdit ? String(existing.panel_order || existing.panel_no) : String(nextNo) });
  const visualMs = el('textarea', { class: 'field-input', rows: '2', placeholder: 'Penerangan visual panel' });
  visualMs.value = isEdit ? (existing.visual_ms || '') : '';
  const captionMs = el('input', { class: 'field-input', type: 'text', placeholder: 'Kapsyen (Melayu)', value: isEdit ? (existing.caption_ms || '') : '' });
  const captionAr = el('input', { class: 'field-input field-input--ar', type: 'text', dir: 'rtl', lang: 'ar', placeholder: 'الكابتشن (عربي)', value: isEdit ? (existing.caption_ar || '') : '' });
  const dialogueAr = el('input', { class: 'field-input field-input--ar', type: 'text', dir: 'rtl', lang: 'ar', placeholder: 'الحوار (عربي)', value: isEdit ? (existing.dialogue_ar || '') : '' });
  const dialogueMs = el('input', { class: 'field-input', type: 'text', placeholder: 'Dialog (Melayu)', value: isEdit ? (existing.dialogue_ms || '') : '' });
  const actionMs = el('input', { class: 'field-input', type: 'text', placeholder: 'Aksi (Melayu)', value: isEdit ? (existing.action_ms || '') : '' });
  const emotionMs = el('input', { class: 'field-input', type: 'text', placeholder: 'Emosi (Melayu)', value: isEdit ? (existing.emotion_ms || '') : '' });
  const location = el('input', { class: 'field-input field-input--ar', type: 'text', dir: 'rtl', lang: 'ar', placeholder: 'Lokasi', value: isEdit ? (existing.location || '') : '' });
  const mood = el('input', { class: 'field-input', type: 'text', placeholder: 'Mood', value: isEdit ? (existing.mood || '') : '' });
  const camera = el('input', { class: 'field-input', type: 'text', placeholder: 'Kamera (cth. eye_level)', value: isEdit ? (existing.camera || '') : '' });
  const composition = el('input', { class: 'field-input', type: 'text', placeholder: 'Komposisi', value: isEdit ? (existing.composition || '') : '' });
  const chars = el('input', { class: 'field-input field-input--mono', type: 'text', placeholder: 'MUSA_001, KHIDR_001', value: (isEdit && Array.isArray(existing.characters_json)) ? existing.characters_json.join(', ') : '' });
  const visualNotes = el('textarea', { class: 'field-input', rows: '2', placeholder: 'Nota visual (cth. polisi wajah tokoh mulia)' });
  visualNotes.value = isEdit ? (existing.visual_notes || '') : '';

  const ptOpts = [['establishing', 'Pembukaan'], ['character', 'Watak'], ['dialogue', 'Dialog'], ['action', 'Aksi'], ['reaction', 'Reaksi'], ['transition', 'Peralihan'], ['reveal', 'Pendedahan'], ['closing', 'Penutup']];
  const typeSelect = el('select', { class: 'field-input' }, ptOpts.map(function (o) {
    const opt = el('option', { value: o[0] }, o[1]);
    if (isEdit && existing.panel_type === o[0]) opt.selected = true;
    return opt;
  }));
  const stOpts = [['wide', 'Wide'], ['medium', 'Medium'], ['close_up', 'Close-up'], ['over_shoulder', 'Over-shoulder'], ['low_angle', 'Sudut rendah'], ['high_angle', 'Sudut tinggi'], ['detail', 'Detail']];
  const shotSelect = el('select', { class: 'field-input' }, stOpts.map(function (o) {
    const opt = el('option', { value: o[0] }, o[1]);
    if (isEdit && existing.shot_type === o[0]) opt.selected = true;
    return opt;
  }));
  const needsImage = el('input', { type: 'checkbox' });
  needsImage.checked = isEdit ? !!existing.needs_image : true;

  const errLine = el('p', { class: 'form-error', hidden: true });

  const form = el('form', {
    class: 'modal-form',
    onSubmit: async function (e) {
      e.preventDefault();
      const noVal = parseInt(panelNo.value, 10);
      if (!Number.isInteger(noVal) || noVal < 1) { errLine.textContent = 'Nombor panel mesti nombor positif.'; errLine.hidden = false; return; }
      const orderVal = parseInt(panelOrder.value, 10);
      if (!Number.isInteger(orderVal) || orderVal < 1) { errLine.textContent = 'Susunan panel mesti nombor positif.'; errLine.hidden = false; return; }
      const charArr = chars.value.split(',').map(function (x) { return x.trim(); }).filter(function (x) { return x.length > 0; });
      const payload = {
        panel_no: noVal,
        panel_order: orderVal,
        panel_type: typeSelect.value,
        shot_type: shotSelect.value,
        visual_ms: visualMs.value.trim(),
        action_ms: actionMs.value.trim(),
        emotion_ms: emotionMs.value.trim(),
        location: location.value.trim(),
        characters_json: charArr,
        dialogue_ar: dialogueAr.value.trim(),
        dialogue_ms: dialogueMs.value.trim(),
        caption_ar: captionAr.value.trim(),
        caption_ms: captionMs.value.trim(),
        camera: camera.value.trim(),
        composition: composition.value.trim(),
        mood: mood.value.trim(),
        visual_notes: visualNotes.value.trim(),
        needs_image: needsImage.checked
      };
      const submit = form.querySelector('.btn-primary');
      submit.disabled = true;
      submit.textContent = 'Menyimpan…';
      try {
        if (isEdit) {
          await api.updatePanel(existing.id, payload);
          toast('Panel dikemas kini', 'ok');
        } else {
          const r = await api.addPanel(sceneId, payload);
          if (r && r.project) updateStatus(r.project.status);
          toast('Panel ditambah', 'ok');
        }
        closeModal();
        reload();
      } catch (err) {
        submit.disabled = false;
        submit.textContent = isEdit ? 'Simpan' : 'Tambah';
        errLine.textContent = err.message;
        errLine.hidden = false;
      }
    }
  }, [
    el('h2', { class: 'modal-title', text: isEdit ? 'Edit panel' : 'Tambah panel' }),
    el('div', { class: 'field-row' }, [
      el('label', { class: 'field' }, [el('span', { class: 'field-label', text: 'No. panel' }), panelNo]),
      el('label', { class: 'field' }, [el('span', { class: 'field-label', text: 'Susunan' }), panelOrder])
    ]),
    el('div', { class: 'field-row' }, [
      el('label', { class: 'field' }, [el('span', { class: 'field-label', text: 'Jenis panel' }), typeSelect]),
      el('label', { class: 'field' }, [el('span', { class: 'field-label', text: 'Shot' }), shotSelect])
    ]),
    el('label', { class: 'field' }, [el('span', { class: 'field-label', text: 'Visual (Melayu)' }), visualMs]),
    el('label', { class: 'field' }, [el('span', { class: 'field-label', text: 'Watak (kod, dipisah koma)' }), chars]),
    el('label', { class: 'field' }, [el('span', { class: 'field-label', text: 'Kapsyen (Melayu)' }), captionMs]),
    el('label', { class: 'field' }, [el('span', { class: 'field-label', text: 'Kapsyen (Arab)' }), captionAr]),
    el('label', { class: 'field' }, [el('span', { class: 'field-label', text: 'Dialog (Arab)' }), dialogueAr]),
    el('label', { class: 'field' }, [el('span', { class: 'field-label', text: 'Dialog (Melayu)' }), dialogueMs]),
    el('label', { class: 'field' }, [el('span', { class: 'field-label', text: 'Aksi (Melayu)' }), actionMs]),
    el('label', { class: 'field' }, [el('span', { class: 'field-label', text: 'Emosi (Melayu)' }), emotionMs]),
    el('label', { class: 'field' }, [el('span', { class: 'field-label', text: 'Lokasi' }), location]),
    el('label', { class: 'field' }, [el('span', { class: 'field-label', text: 'Mood' }), mood]),
    el('div', { class: 'field-row' }, [
      el('label', { class: 'field' }, [el('span', { class: 'field-label', text: 'Kamera' }), camera]),
      el('label', { class: 'field' }, [el('span', { class: 'field-label', text: 'Komposisi' }), composition])
    ]),
    el('label', { class: 'field' }, [el('span', { class: 'field-label', text: 'Nota visual' }), visualNotes]),
    el('label', { class: 'check-row' }, [needsImage, el('span', { class: 'check-label', text: 'Perlu gambar (needs_image)' })]),
    errLine,
    el('div', { class: 'modal-actions' }, [
      el('button', { class: 'btn btn-ghost', type: 'button', onClick: closeModal, text: 'Batal' }),
      el('button', { class: 'btn btn-primary', type: 'submit', text: isEdit ? 'Simpan' : 'Tambah' })
    ])
  ]);

  openModal(el('div', { class: 'modal-card' }, form));
}

function openPanelDelete(p, updateStatus, reload) {
  const card = el('div', { class: 'modal-card' }, [
    el('h2', { class: 'modal-title', text: 'Padam panel?' }),
    el('p', { class: 'modal-text' }, [
      'Panel ',
      el('strong', { text: '#' + p.panel_no + ' (' + panelTypeLabel(p.panel_type) + ')' }),
      ' akan dipadam. Tindakan ini tidak boleh dibatalkan.'
    ]),
    el('div', { class: 'modal-actions' }, [
      el('button', { class: 'btn btn-ghost', type: 'button', onClick: closeModal, text: 'Batal' }),
      el('button', {
        class: 'btn btn-danger', type: 'button', text: 'Padam',
        onClick: async function (e) {
          const b = e.currentTarget;
          b.disabled = true;
          b.textContent = 'Memadam…';
          try {
            const r = await api.deletePanel(p.id);
            if (r && r.project) updateStatus(r.project.status);
            closeModal();
            toast('Panel dipadam', 'ok');
            reload();
          } catch (err) {
            b.disabled = false;
            b.textContent = 'Padam';
            toast(err.message, 'error');
          }
        }
      })
    ])
  ]);
  openModal(card);
}

// ---- Tab: Visual ----------------------------------------------------------
function enumSelect(field, current) {
  const opts = (VISUAL_ENUMS[field] || []).map(function (v) {
    const o = el('option', { value: v }, pretty(v));
    if (current === v) o.selected = true;
    return o;
  });
  return el('select', { class: 'field-input' }, opts);
}

function visTag(label, value) {
  return el('span', { class: 'vis-tag' }, [el('span', { class: 'vis-tag-key', text: label + ': ' }), pretty(value)]);
}

async function renderVisualTab(id, container, updateStatus) {
  container.innerHTML = '';
  container.appendChild(el('p', { class: 'muted', text: 'Memuatkan visual…' }));

  let scenes, panels, visuals;
  try {
    scenes = await api.listScenes(id);
    panels = await api.listProjectPanels(id);
    visuals = await api.listProjectVisuals(id);
  } catch (err) {
    container.innerHTML = '';
    container.appendChild(el('p', { class: 'error-text', text: 'Gagal memuatkan visual: ' + err.message }));
    return;
  }
  container.innerHTML = '';

  function reload() { renderVisualTab(id, container, updateStatus); }

  const panelsByScene = {};
  panels.forEach(function (p) {
    const k = String(p.scene_id);
    if (!panelsByScene[k]) panelsByScene[k] = [];
    panelsByScene[k].push(p);
  });
  const visualByPanel = {};
  visuals.forEach(function (v) { visualByPanel[String(v.panel_id)] = v; });

  const genAllBtn = el('button', { class: 'btn btn-primary', type: 'button', text: 'Jana semua Visual' });
  genAllBtn.addEventListener('click', async function () {
    genAllBtn.disabled = true;
    genAllBtn.textContent = 'Menjana…';
    try {
      const r = await api.generateAllVisuals(id);
      if (r && r.project) updateStatus(r.project.status);
      const made = (r && typeof r.created === 'number') ? r.created : 0;
      toast(made > 0 ? ('Dijana ' + made + ' visual') : 'Semua visual sudah wujud', 'ok');
      reload();
    } catch (err) {
      genAllBtn.disabled = false;
      genAllBtn.textContent = 'Jana semua Visual';
      toast(err.message, 'error');
    }
  });
  container.appendChild(el('div', { class: 'char-toolbar' }, [genAllBtn]));

  if (!panels.length) {
    container.appendChild(el('div', { class: 'empty' }, [
      el('p', { class: 'empty-ar', lang: 'ar', dir: 'rtl', text: 'لا لوحات بعد' }),
      el('p', { class: 'empty-title', text: 'Belum ada panel' }),
      el('p', { class: 'empty-text', text: 'Sila jana panel dahulu sebelum jana visual.' })
    ]));
    return;
  }

  scenes.forEach(function (s) {
    const sps = panelsByScene[String(s.id)] || [];
    if (!sps.length) return;
    container.appendChild(el('div', { class: 'scene-head' }, [
      el('div', { class: 'scene-head-titles' }, [
        el('span', { class: 'scene-head-no', text: 'Babak ' + s.scene_no }),
        s.title_ms ? el('span', { class: 'scene-head-ms', text: s.title_ms }) : null
      ])
    ]));

    sps.forEach(function (p) {
      const v = visualByPanel[String(p.id)];
      if (v) {
        container.appendChild(visualCard(p, v, updateStatus, reload));
      } else {
        const gb = el('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: 'Jana visual' });
        gb.addEventListener('click', async function () {
          gb.disabled = true; gb.textContent = 'Menjana…';
          try {
            const r = await api.generatePanelVisual(p.id);
            if (r && r.project) updateStatus(r.project.status);
            toast('Visual dijana', 'ok');
            reload();
          } catch (err) { gb.disabled = false; gb.textContent = 'Jana visual'; toast(err.message, 'error'); }
        });
        container.appendChild(el('div', { class: 'visual-missing' }, [
          el('span', { class: 'panel-no', text: 'Panel ' + p.panel_no }),
          el('span', { class: 'muted', text: 'belum ada visual' }),
          gb
        ]));
      }
    });
  });
}

function visualCard(panel, v, updateStatus, reload) {
  const layout = Array.isArray(v.characters_layout) ? v.characters_layout : [];
  const noble = v.face_policy === 'glowing_light';
  return el('div', { class: 'visual-card' }, [
    el('div', { class: 'panel-top' }, [
      el('span', { class: 'panel-no', text: 'Panel ' + panel.panel_no }),
      el('span', { class: 'badge badge--' + (noble ? 'face-noble' : 'face-normal'), text: noble ? 'Cahaya lembut' : 'Muka normal' })
    ]),
    el('div', { class: 'vis-tags' }, [
      visTag('Shot', v.shot), visTag('Angle', v.angle), visTag('Lens', v.lens),
      visTag('Komposisi', v.composition), visTag('Gerakan', v.camera_movement),
      visTag('Masa', v.time_of_day), visTag('Cahaya', v.lighting), visTag('Cuaca', v.weather),
      visTag('Palet', v.color_palette), visTag('Suasana', v.atmosphere),
      visTag('Fokus', v.focus), visTag('Kedalaman', v.depth), visTag('Keutamaan', v.visual_priority)
    ]),
    layout.length ? el('div', { class: 'scene-chips' }, layout.map(function (it) {
      const bits = [it.code];
      if (it.position) bits.push(pretty(it.position));
      if (it.pose) bits.push(pretty(it.pose));
      if (it.facing) bits.push('hadap ' + pretty(it.facing));
      return el('span', { class: 'code-chip', text: bits.join(' · ') });
    })) : null,
    v.location ? el('p', { class: 'panel-caption' }, [el('span', { class: 'meta-key', text: 'Lokasi: ' }), el('span', { lang: 'ar', dir: 'rtl' }, v.location)]) : null,
    v.visual_notes ? el('p', { class: noble ? 'panel-notes' : 'panel-notes panel-notes--plain', text: v.visual_notes }) : null,
    el('div', { class: 'scene-actions' }, [
      el('button', { class: 'btn btn-ghost btn-sm', type: 'button', onClick: function () { openVisualForm(v, updateStatus, reload); }, text: 'Edit' }),
      el('button', { class: 'btn btn-danger btn-sm', type: 'button', onClick: function () { openVisualDelete(v, updateStatus, reload); }, text: 'Padam' })
    ])
  ]);
}

// ---- Borang visual (edit) -------------------------------------------------
function openVisualForm(v, updateStatus, reload) {
  const shot = enumSelect('shot', v.shot);
  const angle = enumSelect('angle', v.angle);
  const lens = enumSelect('lens', v.lens);
  const composition = enumSelect('composition', v.composition);
  const movement = enumSelect('camera_movement', v.camera_movement);
  const weather = enumSelect('weather', v.weather);
  const tod = enumSelect('time_of_day', v.time_of_day);
  const lighting = enumSelect('lighting', v.lighting);
  const atmosphere = enumSelect('atmosphere', v.atmosphere);
  const palette = enumSelect('color_palette', v.color_palette);
  const detail = enumSelect('detail_level', v.detail_level);
  const depth = enumSelect('depth', v.depth);
  const focus = enumSelect('focus', v.focus);
  const priority = enumSelect('visual_priority', v.visual_priority);
  const facePolicy = enumSelect('face_policy', v.face_policy);

  const camera = el('input', { class: 'field-input', type: 'text', placeholder: 'Kamera', value: v.camera || '' });
  const location = el('input', { class: 'field-input field-input--ar', type: 'text', dir: 'rtl', lang: 'ar', placeholder: 'Lokasi', value: v.location || '' });
  const fg = el('input', { class: 'field-input', type: 'text', placeholder: 'Objek hadapan', value: v.foreground_object || '' });
  const bg = el('input', { class: 'field-input', type: 'text', placeholder: 'Objek latar', value: v.background_object || '' });
  const sensitive = el('input', { class: 'field-input', type: 'text', placeholder: 'Objek sensitif (jika ada)', value: v.sensitive_object || '' });
  const layoutTa = el('textarea', { class: 'field-input field-input--mono', rows: '5', placeholder: '[ { "code": "MUSA_001", "position": "center", "pose": "standing" } ]' });
  layoutTa.value = Array.isArray(v.characters_layout) ? JSON.stringify(v.characters_layout, null, 2) : '[]';
  const notes = el('textarea', { class: 'field-input', rows: '3', placeholder: 'Nota visual' });
  notes.value = v.visual_notes || '';

  const errLine = el('p', { class: 'form-error', hidden: true });

  function fieldRow(a, b) { return el('div', { class: 'field-row' }, [a, b]); }
  function field(label, node) { return el('label', { class: 'field' }, [el('span', { class: 'field-label', text: label }), node]); }

  const form = el('form', {
    class: 'modal-form',
    onSubmit: async function (e) {
      e.preventDefault();
      let layoutVal;
      const t = layoutTa.value.trim();
      if (t) {
        try { layoutVal = JSON.parse(t); if (!Array.isArray(layoutVal)) throw new Error('x'); }
        catch (_) { errLine.textContent = 'Character layout mesti array JSON yang sah.'; errLine.hidden = false; return; }
      } else { layoutVal = []; }

      const payload = {
        shot: shot.value, angle: angle.value, lens: lens.value, composition: composition.value,
        camera_movement: movement.value, weather: weather.value, time_of_day: tod.value,
        lighting: lighting.value, atmosphere: atmosphere.value, color_palette: palette.value,
        detail_level: detail.value, depth: depth.value, focus: focus.value, visual_priority: priority.value,
        face_policy: facePolicy.value, camera: camera.value.trim(), location: location.value.trim(),
        foreground_object: fg.value.trim(), background_object: bg.value.trim(),
        sensitive_object: sensitive.value.trim(), characters_layout: layoutVal,
        visual_notes: notes.value.trim()
      };
      const submit = form.querySelector('.btn-primary');
      submit.disabled = true; submit.textContent = 'Menyimpan…';
      try {
        await api.updateVisual(v.id, payload);
        toast('Visual dikemas kini', 'ok');
        closeModal();
        reload();
      } catch (err) {
        submit.disabled = false; submit.textContent = 'Simpan';
        errLine.textContent = err.message; errLine.hidden = false;
      }
    }
  }, [
    el('h2', { class: 'modal-title', text: 'Edit visual' }),
    el('p', { class: 'modal-sub', text: 'Kamera & komposisi' }),
    fieldRow(field('Shot', shot), field('Angle', angle)),
    fieldRow(field('Lens', lens), field('Gerakan kamera', movement)),
    fieldRow(field('Komposisi', composition), field('Kamera', camera)),
    el('p', { class: 'modal-sub', text: 'Persekitaran' }),
    fieldRow(field('Masa', tod), field('Cuaca', weather)),
    fieldRow(field('Pencahayaan', lighting), field('Suasana', atmosphere)),
    field('Lokasi', location),
    fieldRow(field('Objek hadapan', fg), field('Objek latar', bg)),
    el('p', { class: 'modal-sub', text: 'Arahan seni' }),
    fieldRow(field('Palet warna', palette), field('Tahap detail', detail)),
    fieldRow(field('Kedalaman', depth), field('Fokus', focus)),
    field('Keutamaan visual', priority),
    el('p', { class: 'modal-sub', text: 'Keselamatan & watak' }),
    field('Face policy (dikuatkuasa untuk tokoh mulia)', facePolicy),
    field('Objek sensitif', sensitive),
    field('Character layout (JSON — kesinambungan watak)', layoutTa),
    field('Nota visual', notes),
    errLine,
    el('div', { class: 'modal-actions' }, [
      el('button', { class: 'btn btn-ghost', type: 'button', onClick: closeModal, text: 'Batal' }),
      el('button', { class: 'btn btn-primary', type: 'submit', text: 'Simpan' })
    ])
  ]);

  openModal(el('div', { class: 'modal-card' }, form));
}

function openVisualDelete(v, updateStatus, reload) {
  const card = el('div', { class: 'modal-card' }, [
    el('h2', { class: 'modal-title', text: 'Padam visual?' }),
    el('p', { class: 'modal-text', text: 'Data Visual Director bagi panel ini akan dipadam. Tindakan ini tidak boleh dibatalkan.' }),
    el('div', { class: 'modal-actions' }, [
      el('button', { class: 'btn btn-ghost', type: 'button', onClick: closeModal, text: 'Batal' }),
      el('button', {
        class: 'btn btn-danger', type: 'button', text: 'Padam',
        onClick: async function (e) {
          const b = e.currentTarget; b.disabled = true; b.textContent = 'Memadam…';
          try {
            const r = await api.deleteVisual(v.id);
            if (r && r.project) updateStatus(r.project.status);
            closeModal();
            toast('Visual dipadam', 'ok');
            reload();
          } catch (err) { b.disabled = false; b.textContent = 'Padam'; toast(err.message, 'error'); }
        }
      })
    ])
  ]);
  openModal(card);
}

// ---- Tab: Prompt ----------------------------------------------------------
const PROMPT_STYLE_LABELS = { webtoon_mutalaah: 'Webtoon Mutalaah' };
const PROMPT_STATUS_LIST = ['draft', 'ready', 'approved'];
const PROMPT_STATUS_LABELS = { draft: 'Draf', ready: 'Sedia', approved: 'Diluluskan' };

async function copyText(text) {
  try {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch (e) { /* fallback di bawah */ }
  try {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.top = '0';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand('copy');
    document.body.removeChild(ta);
    return ok;
  } catch (e) { return false; }
}

async function renderPromptTab(id, container, updateStatus) {
  container.innerHTML = '';
  container.appendChild(el('p', { class: 'muted', text: 'Memuatkan prompt…' }));

  let scenes, panels, prompts;
  try {
    scenes = await api.listScenes(id);
    panels = await api.listProjectPanels(id);
    prompts = await api.listProjectPrompts(id);
  } catch (err) {
    container.innerHTML = '';
    container.appendChild(el('p', { class: 'error-text', text: 'Gagal memuatkan prompt: ' + err.message }));
    return;
  }
  container.innerHTML = '';

  function reload() { renderPromptTab(id, container, updateStatus); }

  const panelsByScene = {};
  panels.forEach(function (p) {
    const k = String(p.scene_id);
    if (!panelsByScene[k]) panelsByScene[k] = [];
    panelsByScene[k].push(p);
  });
  const promptByPanel = {};
  prompts.forEach(function (pr) { promptByPanel[String(pr.panel_id)] = pr; });

  const genAllBtn = el('button', { class: 'btn btn-primary', type: 'button', text: 'Jana semua Prompt' });
  genAllBtn.addEventListener('click', async function () {
    genAllBtn.disabled = true;
    genAllBtn.textContent = 'Menjana…';
    try {
      const r = await api.generateAllPrompts(id);
      if (r && r.project) updateStatus(r.project.status);
      const made = (r && typeof r.created === 'number') ? r.created : 0;
      toast(made > 0 ? ('Dijana ' + made + ' prompt') : 'Semua prompt sudah wujud', 'ok');
      reload();
    } catch (err) {
      genAllBtn.disabled = false;
      genAllBtn.textContent = 'Jana semua Prompt';
      toast(err.message, 'error');
    }
  });
  container.appendChild(el('div', { class: 'char-toolbar' }, [genAllBtn]));

  if (!panels.length) {
    container.appendChild(el('div', { class: 'empty' }, [
      el('p', { class: 'empty-ar', lang: 'ar', dir: 'rtl', text: 'لا لوحات بعد' }),
      el('p', { class: 'empty-title', text: 'Belum ada panel' }),
      el('p', { class: 'empty-text', text: 'Sila jana panel dan visual dahulu sebelum jana prompt.' })
    ]));
    return;
  }

  scenes.forEach(function (s) {
    const sps = panelsByScene[String(s.id)] || [];
    if (!sps.length) return;
    container.appendChild(el('div', { class: 'scene-head' }, [
      el('div', { class: 'scene-head-titles' }, [
        el('span', { class: 'scene-head-no', text: 'Babak ' + s.scene_no }),
        s.title_ms ? el('span', { class: 'scene-head-ms', text: s.title_ms }) : null
      ])
    ]));

    sps.forEach(function (p) {
      const pr = promptByPanel[String(p.id)];
      if (pr) {
        container.appendChild(promptCard(p, pr, updateStatus, reload));
      } else {
        const gb = el('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: 'Jana prompt' });
        gb.addEventListener('click', async function () {
          gb.disabled = true; gb.textContent = 'Menjana…';
          try {
            const r = await api.generatePanelPrompt(p.id);
            if (r && r.project) updateStatus(r.project.status);
            toast('Prompt dijana', 'ok');
            reload();
          } catch (err) { gb.disabled = false; gb.textContent = 'Jana prompt'; toast(err.message, 'error'); }
        });
        container.appendChild(el('div', { class: 'visual-missing' }, [
          el('span', { class: 'panel-no', text: 'Panel ' + p.panel_no }),
          el('span', { class: 'muted', text: 'belum ada prompt' }),
          gb
        ]));
      }
    });
  });
}

function promptCard(panel, pr, updateStatus, reload) {
  const ptArea = el('textarea', { class: 'field-input prompt-text', rows: '6', readonly: 'readonly' });
  ptArea.value = pr.prompt_text || '';
  const negArea = el('textarea', { class: 'field-input prompt-negative', rows: '3', readonly: 'readonly' });
  negArea.value = pr.negative_prompt || '';

  const copyBtn = el('button', { class: 'btn btn-primary btn-sm', type: 'button', text: 'Copy Prompt' });
  copyBtn.addEventListener('click', async function () {
    const ok = await copyText(pr.prompt_text || '');
    if (ok) { toast('Prompt disalin', 'ok'); }
    else { ptArea.focus(); ptArea.select(); toast('Tekan & tahan untuk salin', 'error'); }
  });
  const copyNegBtn = el('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: 'Copy Negative' });
  copyNegBtn.addEventListener('click', async function () {
    const ok = await copyText(pr.negative_prompt || '');
    if (ok) { toast('Negative disalin', 'ok'); }
    else { negArea.focus(); negArea.select(); toast('Tekan & tahan untuk salin', 'error'); }
  });

  return el('div', { class: 'prompt-card' }, [
    el('div', { class: 'panel-top' }, [
      el('span', { class: 'panel-no', text: 'Panel ' + panel.panel_no }),
      el('span', { class: 'badge badge--status-' + (pr.status || 'draft'), text: PROMPT_STATUS_LABELS[pr.status] || pr.status }),
      el('span', { class: 'badge badge--preset', text: PROMPT_STYLE_LABELS[pr.style_preset] || pr.style_preset }),
      el('span', { class: 'prompt-ver', text: pr.prompt_version || 'v1' })
    ]),
    el('label', { class: 'prompt-field-label', text: 'Prompt' }),
    ptArea,
    el('label', { class: 'prompt-field-label', text: 'Negative prompt' }),
    negArea,
    el('div', { class: 'scene-actions' }, [
      copyBtn,
      copyNegBtn,
      el('button', { class: 'btn btn-ghost btn-sm', type: 'button', onClick: function () { openPromptForm(pr, updateStatus, reload); }, text: 'Edit' }),
      el('button', { class: 'btn btn-danger btn-sm', type: 'button', onClick: function () { openPromptDelete(pr, updateStatus, reload); }, text: 'Padam' })
    ])
  ]);
}

// ---- Borang prompt (edit) -------------------------------------------------
function openPromptForm(pr, updateStatus, reload) {
  const styleSel = el('select', { class: 'field-input' }, Object.keys(PROMPT_STYLE_LABELS).map(function (k) {
    const o = el('option', { value: k }, PROMPT_STYLE_LABELS[k]);
    if (pr.style_preset === k) o.selected = true;
    return o;
  }));
  const statusSel = el('select', { class: 'field-input' }, PROMPT_STATUS_LIST.map(function (k) {
    const o = el('option', { value: k }, PROMPT_STATUS_LABELS[k]);
    if (pr.status === k) o.selected = true;
    return o;
  }));
  const verInput = el('input', { class: 'field-input', type: 'text', value: pr.prompt_version || 'v1' });
  const langInput = el('input', { class: 'field-input', type: 'text', value: pr.language || 'en' });
  const ptArea = el('textarea', { class: 'field-input prompt-text', rows: '8' });
  ptArea.value = pr.prompt_text || '';
  const negArea = el('textarea', { class: 'field-input prompt-negative', rows: '4' });
  negArea.value = pr.negative_prompt || '';

  const errLine = el('p', { class: 'form-error', hidden: true });
  function fieldRow(a, b) { return el('div', { class: 'field-row' }, [a, b]); }
  function field(label, node) { return el('label', { class: 'field' }, [el('span', { class: 'field-label', text: label }), node]); }

  const form = el('form', {
    class: 'modal-form',
    onSubmit: async function (e) {
      e.preventDefault();
      if (!ptArea.value.trim()) { errLine.textContent = 'Prompt tidak boleh kosong.'; errLine.hidden = false; return; }
      if (!negArea.value.trim()) { errLine.textContent = 'Negative prompt tidak boleh kosong.'; errLine.hidden = false; return; }
      const payload = {
        prompt_text: ptArea.value.trim(),
        negative_prompt: negArea.value.trim(),
        style_preset: styleSel.value,
        status: statusSel.value,
        prompt_version: verInput.value.trim() || 'v1',
        language: langInput.value.trim() || 'en'
      };
      const submit = form.querySelector('.btn-primary');
      submit.disabled = true; submit.textContent = 'Menyimpan…';
      try {
        await api.updatePrompt(pr.id, payload);
        toast('Prompt dikemas kini', 'ok');
        closeModal();
        reload();
      } catch (err) {
        submit.disabled = false; submit.textContent = 'Simpan';
        errLine.textContent = err.message; errLine.hidden = false;
      }
    }
  }, [
    el('h2', { class: 'modal-title', text: 'Edit prompt' }),
    el('p', { class: 'modal-sub', text: 'Tetapan' }),
    fieldRow(field('Style preset', styleSel), field('Status', statusSel)),
    fieldRow(field('Versi', verInput), field('Bahasa', langInput)),
    el('p', { class: 'modal-sub', text: 'Kandungan' }),
    field('Prompt', ptArea),
    field('Negative prompt', negArea),
    el('p', { class: 'modal-hint', text: 'Nota: arahan tokoh mulia (cahaya/tanpa wajah) akan dikuatkuasakan automatik.' }),
    errLine,
    el('div', { class: 'modal-actions' }, [
      el('button', { class: 'btn btn-ghost', type: 'button', onClick: closeModal, text: 'Batal' }),
      el('button', { class: 'btn btn-primary', type: 'submit', text: 'Simpan' })
    ])
  ]);

  openModal(el('div', { class: 'modal-card' }, form));
}

function openPromptDelete(pr, updateStatus, reload) {
  const card = el('div', { class: 'modal-card' }, [
    el('h2', { class: 'modal-title', text: 'Padam prompt?' }),
    el('p', { class: 'modal-text', text: 'Prompt imej bagi panel ini akan dipadam. Tindakan ini tidak boleh dibatalkan.' }),
    el('div', { class: 'modal-actions' }, [
      el('button', { class: 'btn btn-ghost', type: 'button', onClick: closeModal, text: 'Batal' }),
      el('button', {
        class: 'btn btn-danger', type: 'button', text: 'Padam',
        onClick: async function (e) {
          const b = e.currentTarget; b.disabled = true; b.textContent = 'Memadam…';
          try {
            const r = await api.deletePrompt(pr.id);
            if (r && r.project) updateStatus(r.project.status);
            closeModal();
            toast('Prompt dipadam', 'ok');
            reload();
          } catch (err) { b.disabled = false; b.textContent = 'Padam'; toast(err.message, 'error'); }
        }
      })
    ])
  ]);
  openModal(card);
}

// ---- Tab: Script (Fasa 7 — pengurusan penuh) ------------------------------
function scriptAsArray(v) {
  if (Array.isArray(v)) return v;
  if (typeof v === 'string') { try { return JSON.parse(v); } catch (e) { return []; } }
  return [];
}

async function renderScriptTab(id, container, updateStatus) {
  container.innerHTML = '';
  container.appendChild(el('p', { class: 'muted', text: 'Memuatkan skrip…' }));

  let scenes, panels, scripts, characters;
  try {
    scenes = await api.listScenes(id);
    panels = await api.listProjectPanels(id);
    scripts = await api.listProjectScripts(id);
    characters = await api.listCharacters(id);
  } catch (err) {
    container.innerHTML = '';
    container.appendChild(el('p', { class: 'error-text', text: 'Gagal memuatkan skrip: ' + err.message }));
    return;
  }
  container.innerHTML = '';

  function reload() { renderScriptTab(id, container, updateStatus); }

  // Peta kod watak -> nama Melayu (untuk pilihan penutur borang).
  const codeNameMap = {};
  characters.forEach(function (c) { if (c.character_code) codeNameMap[c.character_code] = c.name_ms || c.character_code; });

  // Susun panel mengikut scene_no / panel_order.
  const panelsByScene = {};
  panels.forEach(function (p) {
    const k = String(p.scene_id);
    if (!panelsByScene[k]) panelsByScene[k] = [];
    panelsByScene[k].push(p);
  });

  // Kumpulkan skrip mengikut panel_id.
  const scriptsByPanel = {};
  scripts.forEach(function (s) {
    const k = String(s.panel_id);
    if (!scriptsByPanel[k]) scriptsByPanel[k] = [];
    scriptsByPanel[k].push(s);
  });

  // --- Bar alat: jana semua skrip -----------------------------------------
  const genAllBtn = el('button', { class: 'btn btn-primary', type: 'button', text: 'Jana semua Script' });
  genAllBtn.addEventListener('click', async function () {
    genAllBtn.disabled = true;
    genAllBtn.textContent = 'Menjana…';
    try {
      const r = await api.generateAllScripts(id);
      if (r && r.project) updateStatus(r.project.status);
      const made = (r && typeof r.created === 'number') ? r.created : 0;
      toast(made > 0 ? ('Dijana ' + made + ' skrip') : 'Semua skrip sudah wujud', 'ok');
      reload();
    } catch (err) {
      genAllBtn.disabled = false;
      genAllBtn.textContent = 'Jana semua Script';
      toast(err.message, 'error');
    }
  });
  container.appendChild(el('div', { class: 'char-toolbar' }, [genAllBtn]));

  container.appendChild(el('div', { class: 'script-note' }, [
    el('p', { class: 'script-note-title', text: 'Enjin Skrip' }),
    el('p', { class: 'script-note-text', text: 'Satu panel boleh mempunyai lebih daripada satu skrip (naratif, dialog, fikiran, SFX). Skrip sebenar digunakan oleh Visual Director dan Prompt Engine. Jika panel belum ada skrip, ia akan dijana secara rule-based.' })
  ]));

  if (!panels.length) {
    container.appendChild(el('div', { class: 'empty' }, [
      el('p', { class: 'empty-ar', lang: 'ar', dir: 'rtl', text: 'لا نص بعد' }),
      el('p', { class: 'empty-title', text: 'Belum ada panel' }),
      el('p', { class: 'empty-text', text: 'Sila jana panel dahulu sebelum jana skrip.' })
    ]));
    return;
  }

  scenes.forEach(function (s) {
    const scenePanels = panelsByScene[String(s.id)] || [];
    if (!scenePanels.length) return;

    container.appendChild(el('div', { class: 'scene-head' }, [
      el('div', { class: 'scene-head-titles' }, [
        el('span', { class: 'scene-head-no', text: 'Babak ' + s.scene_no }),
        s.title_ms ? el('span', { class: 'scene-head-ms', text: s.title_ms }) : null
      ])
    ]));

    scenePanels.forEach(function (p) {
      const panelScripts = (scriptsByPanel[String(p.id)] || []).slice().sort(function (a, b) {
        return (a.reading_order || a.script_order || 0) - (b.reading_order || b.script_order || 0);
      });
      container.appendChild(scriptPanelBlock(p, panelScripts, codeNameMap, updateStatus, reload));
    });
  });
}

// Blok skrip bagi satu panel: tajuk + butang + senarai item skrip.
function scriptPanelBlock(panel, scripts, codeNameMap, updateStatus, reload) {
  const list = el('div', { class: 'script-list' });

  const genBtn = el('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: 'Jana Script panel ini' });
  genBtn.addEventListener('click', async function () {
    genBtn.disabled = true;
    genBtn.textContent = 'Menjana…';
    try {
      const r = await api.generatePanelScripts(panel.id);
      if (r && r.project) updateStatus(r.project.status);
      const made = (r && typeof r.created === 'number') ? r.created : 0;
      toast(made > 0 ? ('Dijana ' + made + ' skrip') : 'Skrip panel sudah wujud', 'ok');
      reload();
    } catch (err) {
      genBtn.disabled = false;
      genBtn.textContent = 'Jana Script panel ini';
      toast(err.message, 'error');
    }
  });

  const addBtn = el('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: '+ Skrip' });
  addBtn.addEventListener('click', function () { openScriptForm(panel.id, null, scripts, codeNameMap, updateStatus, reload); });

  const reorderBtn = el('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: 'Susun semula' });
  reorderBtn.disabled = scripts.length < 2;
  reorderBtn.addEventListener('click', function () {
    // Susun semula terus mengikut urutan semasa (membetulkan script_order/reading_order).
    const ids = scripts.map(function (s) { return s.id; });
    api.reorderScripts(panel.id, ids).then(function () {
      toast('Susunan dikemas kini', 'ok');
      reload();
    }).catch(function (err) { toast(err.message, 'error'); });
  });

  if (!scripts.length) {
    list.appendChild(el('p', { class: 'muted panel-empty', text: 'Belum ada skrip. Klik "Jana Script panel ini" atau "+ Skrip".' }));
  } else {
    scripts.forEach(function (s) { list.appendChild(scriptItemCard(panel.id, s, scripts, codeNameMap, updateStatus, reload)); });
  }

  return el('div', { class: 'script-card' }, [
    el('div', { class: 'panel-top' }, [
      el('span', { class: 'panel-no', text: 'Panel ' + panel.panel_no }),
      el('span', { class: 'badge badge--panel', text: panelTypeLabel(panel.panel_type) })
    ]),
    el('div', { class: 'scene-head-actions' }, [genBtn, addBtn, reorderBtn]),
    list
  ]);
}

// Kad bagi satu item skrip (satu baris dalam jadual scripts).
function scriptItemCard(panelId, s, panelScripts, codeNameMap, updateStatus, reload) {
  function row(key, value, ar) {
    const has = value !== null && value !== undefined && String(value).trim() !== '';
    const valNode = el('span', { class: 'script-val' + (has ? '' : ' script-val--empty'), text: has ? String(value) : '—' });
    if (ar) { valNode.dir = 'rtl'; valNode.lang = 'ar'; }
    return el('div', { class: 'script-row' }, [
      el('span', { class: 'script-key', text: key }),
      valNode
    ]);
  }

  const head = el('div', { class: 'panel-top' }, [
    el('span', { class: 'script-item-no', text: '#' + s.script_order }),
    el('span', { class: 'badge badge--preset', text: scriptTypeLabel(s.script_type) }),
    s.status === 'approved' ? el('span', { class: 'badge badge--ok', text: scriptStatusLabel(s.status) }) : null
  ]);

  return el('div', { class: 'script-item' }, [
    head,
    s.speaker_code ? row('Penutur', s.speaker_name ? (s.speaker_name + ' (' + s.speaker_code + ')') : s.speaker_code) : null,
    s.text_ar ? row('Teks (Arab)', s.text_ar, true) : null,
    s.text_ms ? row('Teks (Melayu)', s.text_ms) : null,
    el('div', { class: 'scene-meta' }, [
      el('span', { class: 'meta-item' }, [el('span', { class: 'meta-key', text: 'Gelembung: ' }), bubbleTypeLabel(s.bubble_type)]),
      el('span', { class: 'meta-item' }, [el('span', { class: 'meta-key', text: 'Emosi: ' }), scriptEmotionLabel(s.emotion)]),
      el('span', { class: 'meta-item' }, [el('span', { class: 'meta-key', text: 'Bacaan: ' }), String(s.reading_order || s.script_order)])
    ]),
    s.notes ? el('p', { class: 'panel-notes', text: s.notes }) : null,
    el('div', { class: 'scene-actions' }, [
      el('button', { class: 'btn btn-ghost btn-sm', type: 'button', onClick: function () { openScriptForm(panelId, s, panelScripts, codeNameMap, updateStatus, reload); }, text: 'Edit' }),
      el('button', { class: 'btn btn-danger btn-sm', type: 'button', onClick: function () { openScriptDelete(s, updateStatus, reload); }, text: 'Padam' })
    ])
  ]);
}

// --- Borang skrip (tambah / edit) -----------------------------------------
function openScriptForm(panelId, existing, panelScripts, codeNameMap, updateStatus, reload) {
  const isEdit = !!existing;
  let nextOrder = 1;
  (panelScripts || []).forEach(function (s) { if (s.script_order >= nextOrder) nextOrder = s.script_order + 1; });

  const orderIn = el('input', { class: 'field-input', type: 'number', min: '1', value: isEdit ? String(existing.script_order) : String(nextOrder) });
  const readIn = el('input', { class: 'field-input', type: 'number', min: '1', value: isEdit ? String(existing.reading_order || existing.script_order) : String(nextOrder) });

  const typeOpts = [['narration', 'Naratif'], ['dialogue', 'Dialog'], ['thought', 'Fikiran'], ['dua', 'Doa'], ['sfx', 'SFX'], ['caption', 'Kapsyen'], ['reaction', 'Reaksi']];
  const typeSelect = el('select', { class: 'field-input' }, typeOpts.map(function (o) {
    const opt = el('option', { value: o[0] }, o[1]);
    if (isEdit && existing.script_type === o[0]) opt.selected = true;
    if (!isEdit && o[0] === 'narration') opt.selected = true;
    return opt;
  }));
  const bubbleOpts = [['speech', 'Bualan'], ['thought', 'Fikiran'], ['narration', 'Naratif'], ['dua', 'Doa'], ['sfx', 'SFX'], ['caption', 'Kapsyen'], ['none', 'Tiada']];
  const bubbleSelect = el('select', { class: 'field-input' }, bubbleOpts.map(function (o) {
    const opt = el('option', { value: o[0] }, o[1]);
    if (isEdit && existing.bubble_type === o[0]) opt.selected = true;
    return opt;
  }));
  const emoOpts = [['neutral', 'Neutral'], ['calm', 'Tenang'], ['solemn', 'Khidmat'], ['sad', 'Sedih'], ['happy', 'Gembira'], ['angry', 'Marah'], ['fear', 'Takut'], ['surprised', 'Terkejut'], ['thinking', 'Berfikir'], ['respectful', 'Hormat'], ['wonder', 'Kagum']];
  const emoSelect = el('select', { class: 'field-input' }, emoOpts.map(function (o) {
    const opt = el('option', { value: o[0] }, o[1]);
    if (isEdit && existing.emotion === o[0]) opt.selected = true;
    return opt;
  }));
  const statusOpts = [['draft', 'Draf'], ['approved', 'Dilulus']];
  const statusSelect = el('select', { class: 'field-input' }, statusOpts.map(function (o) {
    const opt = el('option', { value: o[0] }, o[1]);
    if (isEdit && existing.status === o[0]) opt.selected = true;
    if (!isEdit && o[0] === 'draft') opt.selected = true;
    return opt;
  }));

  // Penutur: senarai kod watak + input bebas.
  const codeKeys = Object.keys(codeNameMap).sort();
  const speakerCode = el('input', { class: 'field-input field-input--mono', type: 'text', placeholder: 'cth. MUSA_001', value: isEdit ? (existing.speaker_code || '') : '' });
  const speakerName = el('input', { class: 'field-input', type: 'text', placeholder: 'Nama penutur (cth. Nabi Musa)', value: isEdit ? (existing.speaker_name || '') : '' });
  let speakerDatalist = null;
  if (codeKeys.length) {
    speakerDatalist = el('datalist', { id: 'speaker-codes' }, codeKeys.map(function (c) {
      return el('option', { value: c }, codeNameMap[c]);
    }));
    speakerCode.setAttribute('list', 'speaker-codes');
  }

  const textAr = el('textarea', { class: 'field-input field-input--ar', rows: '2', dir: 'rtl', lang: 'ar', placeholder: 'النص بالعربية' });
  textAr.value = isEdit ? (existing.text_ar || '') : '';
  const textMs = el('textarea', { class: 'field-input', rows: '2', placeholder: 'Teks (Melayu)' });
  textMs.value = isEdit ? (existing.text_ms || '') : '';
  const notes = el('input', { class: 'field-input', type: 'text', placeholder: 'Nota (pilihan)', value: isEdit ? (existing.notes || '') : '' });

  const errLine = el('p', { class: 'form-error', hidden: true });

  const form = el('form', {
    class: 'modal-form',
    onSubmit: async function (e) {
      e.preventDefault();
      const orderVal = parseInt(orderIn.value, 10);
      if (!Number.isInteger(orderVal) || orderVal < 1) { errLine.textContent = 'Susunan skrip mesti nombor positif.'; errLine.hidden = false; return; }
      const readVal = parseInt(readIn.value, 10);
      if (!Number.isInteger(readVal) || readVal < 1) { errLine.textContent = 'Susunan bacaan mesti nombor positif.'; errLine.hidden = false; return; }
      const ar = textAr.value.trim();
      const ms = textMs.value.trim();
      if (!ar && !ms) { errLine.textContent = 'Sekurang-kurangnya teks Arab atau Melayu mesti diisi.'; errLine.hidden = false; return; }
      const payload = {
        script_order: orderVal,
        reading_order: readVal,
        script_type: typeSelect.value,
        bubble_type: bubbleSelect.value,
        emotion: emoSelect.value,
        status: statusSelect.value,
        speaker_code: speakerCode.value.trim(),
        speaker_name: speakerName.value.trim(),
        text_ar: ar,
        text_ms: ms,
        notes: notes.value.trim()
      };
      const submit = form.querySelector('.btn-primary');
      submit.disabled = true;
      submit.textContent = 'Menyimpan…';
      try {
        if (isEdit) {
          await api.updateScript(existing.id, payload);
          toast('Skrip dikemas kini', 'ok');
        } else {
          const r = await api.addScript(panelId, payload);
          if (r && r.project) updateStatus(r.project.status);
          toast('Skrip ditambah', 'ok');
        }
        closeModal();
        reload();
      } catch (err) {
        submit.disabled = false;
        submit.textContent = isEdit ? 'Simpan' : 'Tambah';
        errLine.textContent = err.message;
        errLine.hidden = false;
      }
    }
  }, [
    el('h2', { class: 'modal-title', text: isEdit ? 'Edit skrip' : 'Tambah skrip' }),
    el('div', { class: 'field-row' }, [
      el('label', { class: 'field' }, [el('span', { class: 'field-label', text: 'Susunan (script_order)' }), orderIn]),
      el('label', { class: 'field' }, [el('span', { class: 'field-label', text: 'Susunan bacaan' }), readIn])
    ]),
    el('div', { class: 'field-row' }, [
      el('label', { class: 'field' }, [el('span', { class: 'field-label', text: 'Jenis skrip' }), typeSelect]),
      el('label', { class: 'field' }, [el('span', { class: 'field-label', text: 'Jenis gelembung' }), bubbleSelect])
    ]),
    el('div', { class: 'field-row' }, [
      el('label', { class: 'field' }, [el('span', { class: 'field-label', text: 'Emosi' }), emoSelect]),
      el('label', { class: 'field' }, [el('span', { class: 'field-label', text: 'Status' }), statusSelect])
    ]),
    el('div', { class: 'field-row' }, [
      el('label', { class: 'field' }, [el('span', { class: 'field-label', text: 'Kod penutur' }), speakerCode]),
      el('label', { class: 'field' }, [el('span', { class: 'field-label', text: 'Nama penutur' }), speakerName])
    ]),
    speakerDatalist,
    el('label', { class: 'field' }, [el('span', { class: 'field-label', text: 'Teks (Arab)' }), textAr]),
    el('label', { class: 'field' }, [el('span', { class: 'field-label', text: 'Teks (Melayu)' }), textMs]),
    el('label', { class: 'field' }, [el('span', { class: 'field-label', text: 'Nota' }), notes]),
    errLine,
    el('div', { class: 'modal-actions' }, [
      el('button', { class: 'btn btn-ghost', type: 'button', onClick: closeModal, text: 'Batal' }),
      el('button', { class: 'btn btn-primary', type: 'submit', text: isEdit ? 'Simpan' : 'Tambah' })
    ])
  ]);

  openModal(el('div', { class: 'modal-card' }, form));
}

function openScriptDelete(s, updateStatus, reload) {
  const card = el('div', { class: 'modal-card' }, [
    el('h2', { class: 'modal-title', text: 'Padam skrip?' }),
    el('p', { class: 'modal-text' }, [
      'Item skrip #',
      el('strong', { text: String(s.script_order) }),
      ' (', scriptTypeLabel(s.script_type), ') akan dipadam. Tindakan ini tidak boleh dibatalkan.'
    ]),
    el('div', { class: 'modal-actions' }, [
      el('button', { class: 'btn btn-ghost', type: 'button', onClick: closeModal, text: 'Batal' }),
      el('button', {
        class: 'btn btn-danger', type: 'button', text: 'Padam',
        onClick: async function (e) {
          const b = e.currentTarget; b.disabled = true; b.textContent = 'Memadam…';
          try {
            const r = await api.deleteScript(s.id);
            if (r && r.project) updateStatus(r.project.status);
            closeModal();
            toast('Skrip dipadam', 'ok');
            reload();
          } catch (err) { b.disabled = false; b.textContent = 'Padam'; toast(err.message, 'error'); }
        }
      })
    ])
  ]);
  openModal(card);
}

// ---- Tab: Review (QA, read-only) ------------------------------------------
const QA_LABEL = { ok: 'OK', warning: 'Warning', error: 'Error' };
const CHECKLIST_FIELDS = [
  ['character', 'Character'], ['script', 'Script'], ['visual', 'Visual'],
  ['prompt', 'Prompt'], ['face_policy', 'Face'], ['location', 'Location'],
  ['caption', 'Caption'], ['dialogue', 'Dialogue'], ['prompt_complete', 'Prompt Lengkap']
];

async function exportReview(id, btn) {
  const old = btn.textContent;
  btn.disabled = true; btn.textContent = 'Mengeksport…';
  try {
    const res = await fetch('/api/projects/' + id + '/review/export', { headers: { Accept: 'application/json' } });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const text = await res.text();
    const blob = new Blob([text], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'qa-report-project-' + id + '.json';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
    toast('Laporan QA dimuat turun', 'ok');
  } catch (e) { toast('Gagal eksport: ' + e.message, 'error'); }
  btn.disabled = false; btn.textContent = old;
}

function reviewStat(label, value, cls) {
  return el('div', { class: 'rv-stat' + (cls ? ' ' + cls : '') }, [
    el('span', { class: 'rv-stat-val', text: String(value) }),
    el('span', { class: 'rv-stat-key', text: label })
  ]);
}

function reviewSummaryBox(sm) {
  const p = sm.panels || 0;
  return el('div', { class: 'rv-summary' }, [
    reviewStat('Watak', sm.characters + '/' + sm.characters),
    reviewStat('Babak', sm.scenes + '/' + sm.scenes),
    reviewStat('Panel', p + '/' + p),
    reviewStat('Skrip', sm.scripts + '/' + p),
    reviewStat('Visual', sm.visuals + '/' + p),
    reviewStat('Prompt', sm.prompts + '/' + p),
    reviewStat('Sedia Imej', (sm.ready_for_image || 0) + '/' + p, 'rv-stat--ready'),
    reviewStat('Errors', sm.error || 0, (sm.error ? 'rv-stat--error' : '')),
    reviewStat('Warnings', sm.warning || 0, (sm.warning ? 'rv-stat--warning' : ''))
  ]);
}

function reviewCard(item) {
  const st = item.qa_status;
  const checklist = el('div', { class: 'rv-checklist' }, CHECKLIST_FIELDS.map(function (f) {
    const ok = !!(item.checklist && item.checklist[f[0]]);
    return el('span', { class: 'rv-check ' + (ok ? 'rv-check--pass' : 'rv-check--fail') },
      [el('span', { class: 'rv-check-mark', text: ok ? '✓' : '✗' }), f[1]]);
  }));

  const issues = (item.issues && item.issues.length)
    ? el('ul', { class: 'rv-issues' }, item.issues.map(function (is) {
        return el('li', { class: 'rv-issue rv-issue--' + is.type }, is.message);
      }))
    : null;

  // Script preview
  const rows = Array.isArray(item.scripts) ? item.scripts : [];
  const scriptPrev = rows.length
    ? el('div', { class: 'rv-scripts' }, rows.map(function (s) {
        const who = s.speaker_name || s.speaker_code || (s.script_type === 'dialogue' ? '?' : '');
        const head = '[' + (s.script_type || '') + ']' + (who ? ' ' + who : '');
        return el('div', { class: 'rv-script-line' }, [
          el('span', { class: 'rv-script-head', text: head }),
          el('span', { class: 'rv-script-text', text: s.text_ms || s.text_ar || '—' })
        ]);
      }))
    : el('p', { class: 'rv-muted', text: 'Tiada skrip (fallback dibenarkan).' });

  // Visual summary
  const v = item.visual;
  const visualPrev = v
    ? el('div', { class: 'vis-tags' }, [
        ['Shot', v.shot], ['Angle', v.angle], ['Lens', v.lens], ['Lighting', v.lighting],
        ['Composition', v.composition], ['Atmosphere', v.atmosphere], ['Weather', v.weather],
        ['Depth', v.depth], ['Focus', v.focus], ['Palette', v.color_palette], ['Face', v.face_policy]
      ].map(function (t) {
        return el('span', { class: 'vis-tag' }, [el('span', { class: 'vis-tag-key', text: t[0] + ': ' }), (t[1] ? pretty(t[1]) : '—')]);
      }))
    : el('p', { class: 'rv-muted', text: 'Tiada visual.' });

  // Prompt preview
  const pr = item.prompt;
  let promptPrev;
  const actions = [];
  if (pr) {
    const ptArea = el('textarea', { class: 'field-input prompt-text', rows: '4', readonly: 'readonly' });
    ptArea.value = pr.prompt_text || '';
    const negArea = el('textarea', { class: 'field-input prompt-negative', rows: '2', readonly: 'readonly' });
    negArea.value = pr.negative_prompt || '';
    promptPrev = el('div', {}, [
      el('label', { class: 'prompt-field-label', text: 'Prompt' }), ptArea,
      el('label', { class: 'prompt-field-label', text: 'Negative prompt' }), negArea
    ]);
    const copyP = el('button', { class: 'btn btn-primary btn-sm', type: 'button', text: 'Copy Prompt' });
    copyP.addEventListener('click', async function () {
      const ok = await copyText(pr.prompt_text || ''); if (ok) toast('Prompt disalin', 'ok'); else { ptArea.focus(); ptArea.select(); }
    });
    const copyN = el('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: 'Copy Negative' });
    copyN.addEventListener('click', async function () {
      const ok = await copyText(pr.negative_prompt || ''); if (ok) toast('Negative disalin', 'ok'); else { negArea.focus(); negArea.select(); }
    });
    actions.push(copyP, copyN);
  } else {
    promptPrev = el('p', { class: 'rv-muted', text: 'Tiada prompt.' });
  }

  function goBtn(label, tab) {
    const b = el('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: label });
    b.addEventListener('click', function () { if (activeSetTab) activeSetTab(tab); });
    return b;
  }
  actions.push(goBtn('Pergi ke Script', 'script'), goBtn('Pergi ke Visual', 'visual'), goBtn('Pergi ke Prompt', 'prompt'));

  return el('div', { class: 'rv-card rv-card--' + st }, [
    el('div', { class: 'rv-card-top' }, [
      el('span', { class: 'rv-card-title', text: 'Babak ' + (item.scene_no || '–') + ' · Panel ' + item.panel_no }),
      el('span', { class: 'rv-badge rv-badge--' + st, text: QA_LABEL[st] || st }),
      item.ready_for_image ? el('span', { class: 'rv-ready', text: 'Sedia Imej' }) : null
    ]),
    item.scene_title ? el('p', { class: 'rv-card-sub', text: item.scene_title }) : null,
    checklist,
    issues,
    el('div', { class: 'rv-section' }, [el('p', { class: 'rv-section-h', text: 'Script' }), scriptPrev]),
    el('div', { class: 'rv-section' }, [el('p', { class: 'rv-section-h', text: 'Visual' }), visualPrev]),
    el('div', { class: 'rv-section' }, [el('p', { class: 'rv-section-h', text: 'Prompt' }), promptPrev]),
    el('div', { class: 'rv-actions' }, actions)
  ]);
}

async function renderReviewTab(id, container, updateStatus) {
  container.innerHTML = '';
  container.appendChild(el('p', { class: 'muted', text: 'Menyemak pipeline…' }));

  let data;
  try {
    data = await api.getProjectReview(id);
  } catch (err) {
    container.innerHTML = '';
    container.appendChild(el('p', { class: 'error-text', text: 'Gagal memuatkan review: ' + err.message }));
    return;
  }
  container.innerHTML = '';

  const items = (data && data.items) || [];
  const summary = (data && data.summary) || {};

  // Summary + Export
  const exportBtn = el('button', { class: 'btn btn-primary', type: 'button', text: 'Export QA Report' });
  exportBtn.addEventListener('click', function () { exportReview(id, exportBtn); });
  container.appendChild(el('div', { class: 'rv-head' }, [
    el('h2', { class: 'rv-title', text: 'Review & QA' }),
    exportBtn
  ]));
  container.appendChild(reviewSummaryBox(summary));

  // Filter
  let filter = 'all';
  const cardsWrap = el('div', { class: 'rv-cards' });
  const filterDefs = [['all', 'Semua'], ['error', 'Error'], ['warning', 'Warning'], ['ok', 'Lulus']];
  const filterBtns = {};
  function applyFilter() {
    filterDefs.forEach(function (f) { filterBtns[f[0]].className = 'rv-filter' + (filter === f[0] ? ' is-active' : ''); });
    cardsWrap.innerHTML = '';
    const shown = items.filter(function (it) { return filter === 'all' || it.qa_status === filter; });
    if (!shown.length) {
      cardsWrap.appendChild(el('p', { class: 'rv-muted', text: 'Tiada panel dalam kategori ini.' }));
      return;
    }
    shown.forEach(function (it) { cardsWrap.appendChild(reviewCard(it)); });
  }
  const filterBar = el('div', { class: 'rv-filters' }, filterDefs.map(function (f) {
    const b = el('button', { class: 'rv-filter', type: 'button', text: f[1] });
    b.addEventListener('click', function () { filter = f[0]; applyFilter(); });
    filterBtns[f[0]] = b;
    return b;
  }));
  container.appendChild(filterBar);
  container.appendChild(cardsWrap);

  if (!items.length) {
    cardsWrap.appendChild(el('div', { class: 'empty' }, [
      el('p', { class: 'empty-title', text: 'Belum ada panel' }),
      el('p', { class: 'empty-text', text: 'Sila jana panel, skrip, visual dan prompt dahulu.' })
    ]));
    return;
  }
  applyFilter();
}

// ---- Router ---------------------------------------------------------------
function parseHash() {
  const h = location.hash.replace(/^#/, '');
  const m = h.match(/^\/project\/(\d+)$/);
  if (m) return { view: 'detail', id: Number(m[1]) };
  return { view: 'dashboard' };
}

function render() {
  const route = parseHash();
  closeModal();
  window.scrollTo(0, 0);
  if (route.view === 'detail') {
    renderDetail(route.id);
  } else {
    renderDashboard();
  }
}

window.addEventListener('hashchange', render);

// ---- Health (penunjuk kecil di bar atas) ----------------------------------
async function checkHealth() {
  const node = byId('health');
  if (!node) return;
  try {
    const res = await fetch('/api/health', { headers: { Accept: 'application/json' } });
    const data = await res.json();
    if (res.ok && data && data.ok) {
      node.className = 'health health--ok';
      node.title = 'API aktif';
      return;
    }
    throw new Error('not ok');
  } catch (e) {
    node.className = 'health health--error';
    node.title = 'API tidak dapat dihubungi';
  }
}

// ---- Mula -----------------------------------------------------------------
render();
checkHealth();
