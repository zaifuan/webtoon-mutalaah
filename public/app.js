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
  },
  getProjectImages(id) {
    return this.req('GET', '/api/projects/' + id + '/images');
  },
  getPanelImage(panelId) {
    return this.req('GET', '/api/panels/' + panelId + '/image');
  },
  async uploadPanelImage(panelId, file) {
    const fd = new FormData();
    fd.append('image', file);
    const res = await fetch('/api/panels/' + panelId + '/image/upload', {
      method: 'POST', headers: { Accept: 'application/json' }, body: fd
    });
    let data = null;
    try { data = await res.json(); } catch (e) { data = null; }
    if (!res.ok) throw new Error((data && data.error) || ('Ralat pelayan (' + res.status + ')'));
    return data;
  },
  importLocalImages(id) {
    return this.req('POST', '/api/projects/' + id + '/images/import-local', {});
  },
  updateImage(imageId, payload) {
    return this.req('PUT', '/api/images/' + imageId, payload);
  },
  deleteImage(imageId) {
    return this.req('DELETE', '/api/images/' + imageId);
  },
  listJobs(params) {
    const qs = params ? ('?' + Object.keys(params).filter(function (k) { return params[k] !== '' && params[k] != null; }).map(function (k) { return encodeURIComponent(k) + '=' + encodeURIComponent(params[k]); }).join('&')) : '';
    return this.req('GET', '/api/jobs' + qs);
  },
  getJob(jobId) {
    return this.req('GET', '/api/jobs/' + jobId);
  },
  createJob(payload) {
    return this.req('POST', '/api/jobs', payload);
  },
  deleteJob(jobId) {
    return this.req('DELETE', '/api/jobs/' + jobId);
  },
  retryJob(jobId) {
    return this.req('POST', '/api/jobs/' + jobId + '/retry', {});
  },
  cancelJob(jobId) {
    return this.req('POST', '/api/jobs/' + jobId + '/cancel', {});
  },
  listWorkers() {
    return this.req('GET', '/api/workers');
  },
  getAiProviders() {
    return this.req('GET', '/api/ai/providers');
  },
  getAiDefault() {
    return this.req('GET', '/api/ai/default');
  },
  setAiDefault(provider) {
    return this.req('POST', '/api/ai/default', { provider: provider });
  },
  getProviderHealth(provider) {
    return this.req('GET', '/api/ai/providers/' + encodeURIComponent(provider) + '/health');
  },
  getPromptTemplates() {
    return this.req('GET', '/api/prompts/templates');
  },
  previewPromptContext(task, payload) {
    return this.req('POST', '/api/prompts/context', { task: task, payload: payload || {} });
  },
  getImageProviders() {
    return this.req('GET', '/api/image/providers');
  },
  getImageDefault() {
    return this.req('GET', '/api/image/default');
  },
  setImageDefault(provider) {
    return this.req('POST', '/api/image/default', { provider: provider });
  },
  getImageProviderHealth(provider) {
    return this.req('GET', '/api/image/providers/' + encodeURIComponent(provider) + '/health');
  },
  testGenerateImage(prompt) {
    return this.req('POST', '/api/image/test-generate', { prompt: prompt });
  },
  startProduction(projectId) {
    return this.req('POST', '/api/projects/' + projectId + '/production/start');
  },
  getProductionStatus(projectId) {
    return this.req('GET', '/api/projects/' + projectId + '/production/status');
  },
  cancelProduction(projectId) {
    return this.req('POST', '/api/projects/' + projectId + '/production/cancel');
  },
  getPreview(projectId) {
    return this.req('GET', '/api/projects/' + projectId + '/preview');
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
  const tabImage = el('button', { class: 'tab', type: 'button', text: 'Image' });
  const tabProduction = el('button', { class: 'tab', type: 'button', text: 'Production' });
  const tabPreview = el('button', { class: 'tab', type: 'button', text: 'Preview' });
  const content = el('div', { class: 'tab-content' });

  function setTab(name) {
    clearProductionPolling();
    tabTeks.className = 'tab';
    tabWatak.className = 'tab';
    tabBabak.className = 'tab';
    tabPanel.className = 'tab';
    tabScript.className = 'tab';
    tabVisual.className = 'tab';
    tabPrompt.className = 'tab';
    tabReview.className = 'tab';
    tabImage.className = 'tab';
    tabProduction.className = 'tab';
    tabPreview.className = 'tab';
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
    } else if (name === 'image') {
      tabImage.className = 'tab is-active';
      renderImageTab(id, content, updateStatus);
    } else if (name === 'production') {
      tabProduction.className = 'tab is-active';
      renderProductionTab(id, content, updateStatus);
    } else if (name === 'preview') {
      tabPreview.className = 'tab is-active';
      renderPreviewTab(id, content, updateStatus);
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
  tabImage.addEventListener('click', function () { setTab('image'); });
  tabProduction.addEventListener('click', function () { setTab('production'); });
  tabPreview.addEventListener('click', function () { setTab('preview'); });

  view.appendChild(el('div', { class: 'tabs' }, [tabTeks, tabWatak, tabBabak, tabPanel, tabScript, tabVisual, tabPrompt, tabReview, tabImage, tabProduction, tabPreview]));
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

// ---- Tab: Image (Local Image Workflow, Fasa 8) ----------------------------
const IMG_STATUS_LABEL = { draft: 'Draf', uploaded: 'Dimuat naik', linked: 'Dipaut', approved: 'Diluluskan', rejected: 'Ditolak' };

function imgStat(label, value, cls) {
  return el('div', { class: 'im-stat' + (cls ? ' ' + cls : '') }, [
    el('span', { class: 'im-stat-val', text: String(value) }),
    el('span', { class: 'im-stat-key', text: label })
  ]);
}

function imageSummaryBox(sm) {
  return el('div', { class: 'im-summary' }, [
    imgStat('Panel', sm.total_panels || 0),
    imgStat('Ada Gambar', sm.images_linked || 0, 'im-stat--ok'),
    imgStat('Tiada', sm.missing || 0, (sm.missing ? 'im-stat--warn' : '')),
    imgStat('Diluluskan', sm.approved || 0, 'im-stat--ok'),
    imgStat('Ditolak', sm.rejected || 0, (sm.rejected ? 'im-stat--error' : ''))
  ]);
}

async function exportPromptFolderInfo(id, btn) {
  const old = btn.textContent;
  btn.disabled = true; btn.textContent = 'Menyedia…';
  try {
    let prompts = [];
    try { prompts = await api.listProjectPrompts(id); } catch (e) { prompts = []; }
    const byPanel = {};
    (prompts || []).forEach(function (p) { byPanel[String(p.panel_id)] = p; });
    let data = await api.getProjectImages(id);
    const panels = (data && data.items) || [];
    const info = {
      project_id: id,
      upload_folder: (data && data.summary && data.summary.upload_folder) || ('uploads/images/project-' + id + '/'),
      naming: 'panel-{panel_id}.png  (atau .jpg / .webp)',
      generated_at: new Date().toISOString(),
      panels: panels.map(function (it) {
        const pr = byPanel[String(it.panel_id)] || {};
        return {
          panel_id: it.panel_id,
          scene_no: it.scene_no,
          panel_no: it.panel_no,
          expected_filename: it.expected_filename,
          has_image: !!it.image,
          prompt_text: pr.prompt_text || '',
          negative_prompt: pr.negative_prompt || ''
        };
      })
    };
    const blob = new Blob([JSON.stringify(info, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'prompt-folder-info-project-' + id + '.json';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1500);
    toast('Info folder prompt dimuat turun', 'ok');
  } catch (e) { toast('Gagal eksport: ' + e.message, 'error'); }
  btn.disabled = false; btn.textContent = old;
}

function imageCard(item, id, refresh, updateStatus) {
  const img = item.image;

  // Pratonton / placeholder
  let preview;
  if (img && img.url) {
    const bust = img.updated_at ? ('?t=' + encodeURIComponent(img.updated_at)) : '';
    preview = el('div', { class: 'im-preview' }, [
      el('img', { class: 'im-img', src: img.url + bust, alt: 'panel ' + item.panel_no, loading: 'lazy' })
    ]);
  } else {
    preview = el('div', { class: 'im-preview im-preview--empty' }, [
      el('span', { class: 'im-placeholder', text: 'Tiada gambar' }),
      el('span', { class: 'im-expect', text: item.expected_filename })
    ]);
  }

  // Status badge gambar
  const statusBadge = img
    ? el('span', { class: 'im-badge im-badge--' + img.status, text: IMG_STATUS_LABEL[img.status] || img.status })
    : el('span', { class: 'im-badge im-badge--none', text: 'Belum ada' });

  // Muat naik
  const fileInput = el('input', { type: 'file', accept: 'image/png,image/jpeg,image/webp', class: 'im-file' });
  const uploadBtn = el('button', { class: 'btn btn-primary btn-sm', type: 'button', text: img ? 'Ganti Gambar' : 'Upload Gambar' });
  uploadBtn.addEventListener('click', function () { fileInput.click(); });
  fileInput.addEventListener('change', async function () {
    const f = fileInput.files && fileInput.files[0];
    if (!f) return;
    if (f.size > 10 * 1024 * 1024) { toast('Saiz fail melebihi 10MB', 'error'); fileInput.value = ''; return; }
    uploadBtn.disabled = true; const lbl = uploadBtn.textContent; uploadBtn.textContent = 'Memuat naik…';
    try {
      await api.uploadPanelImage(item.panel_id, f);
      toast('Gambar dimuat naik', 'ok');
      if (updateStatus) updateStatus();
      refresh();
    } catch (e) { toast('Gagal: ' + e.message, 'error'); uploadBtn.disabled = false; uploadBtn.textContent = lbl; fileInput.value = ''; }
  });

  const actions = [uploadBtn, fileInput];

  if (img) {
    const approveBtn = el('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: 'Approve' });
    approveBtn.addEventListener('click', async function () {
      try { await api.updateImage(img.id, { status: 'approved' }); toast('Diluluskan', 'ok'); if (updateStatus) updateStatus(); refresh(); }
      catch (e) { toast('Gagal: ' + e.message, 'error'); }
    });
    const rejectBtn = el('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: 'Reject' });
    rejectBtn.addEventListener('click', async function () {
      try { await api.updateImage(img.id, { status: 'rejected' }); toast('Ditolak', 'ok'); if (updateStatus) updateStatus(); refresh(); }
      catch (e) { toast('Gagal: ' + e.message, 'error'); }
    });
    const delBtn = el('button', { class: 'btn btn-danger btn-sm', type: 'button', text: 'Padam' });
    delBtn.addEventListener('click', async function () {
      if (!window.confirm('Padam gambar panel ' + item.panel_no + '?')) return;
      try { await api.deleteImage(img.id); toast('Gambar dipadam', 'ok'); if (updateStatus) updateStatus(); refresh(); }
      catch (e) { toast('Gagal: ' + e.message, 'error'); }
    });
    actions.push(approveBtn, rejectBtn, delBtn);
  }

  // Nota
  const notesInput = el('input', { type: 'text', class: 'field-input im-notes', placeholder: 'Nota (pilihan)…' });
  if (img && img.notes) notesInput.value = img.notes;
  if (img) {
    const saveNote = el('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: 'Simpan Nota' });
    saveNote.addEventListener('click', async function () {
      try { await api.updateImage(img.id, { notes: notesInput.value }); toast('Nota disimpan', 'ok'); }
      catch (e) { toast('Gagal: ' + e.message, 'error'); }
    });
    actions.push(saveNote);
  }

  const promptInfo = item.has_prompt
    ? el('span', { class: 'im-prompt-ok', text: 'Prompt: ' + (item.prompt_status || 'ada') })
    : el('span', { class: 'im-prompt-no', text: 'Prompt: tiada' });

  return el('div', { class: 'im-card' }, [
    el('div', { class: 'im-card-top' }, [
      el('span', { class: 'im-card-title', text: 'Babak ' + (item.scene_no || '–') + ' · Panel ' + item.panel_no }),
      statusBadge
    ]),
    item.scene_title ? el('p', { class: 'im-card-sub', text: item.scene_title }) : null,
    promptInfo,
    preview,
    img && (img.width || img.file_size)
      ? el('p', { class: 'im-meta', text: [(img.width && img.height ? img.width + '×' + img.height + 'px' : ''), (img.file_size ? Math.round(img.file_size / 1024) + ' KB' : ''), (img.source_type || '')].filter(Boolean).join(' · ') })
      : null,
    img ? el('p', { class: 'im-meta', text: 'Fail: ' + (img.image_filename || '') }) : null,
    notesInput,
    el('div', { class: 'im-actions' }, actions)
  ]);
}

async function renderImageTab(id, container, updateStatus) {
  container.innerHTML = '';
  container.appendChild(el('p', { class: 'muted', text: 'Memuatkan gambar…' }));

  function refresh() { renderImageTab(id, container, updateStatus); }

  let data;
  try {
    data = await api.getProjectImages(id);
  } catch (err) {
    container.innerHTML = '';
    container.appendChild(el('p', { class: 'error-text', text: 'Gagal memuatkan: ' + err.message }));
    return;
  }
  container.innerHTML = '';

  const items = (data && data.items) || [];
  const summary = (data && data.summary) || {};

  // Tajuk + butang
  const importBtn = el('button', { class: 'btn btn-primary', type: 'button', text: 'Import Local Images' });
  importBtn.addEventListener('click', async function () {
    importBtn.disabled = true; const lbl = importBtn.textContent; importBtn.textContent = 'Mengimport…';
    try {
      const r = await api.importLocalImages(id);
      toast('Import selesai: ' + r.linked + ' dipaut, ' + r.skipped + ' dilangkau', 'ok');
      if (updateStatus) updateStatus();
      refresh();
    } catch (e) { toast('Gagal import: ' + e.message, 'error'); importBtn.disabled = false; importBtn.textContent = lbl; }
  });
  const refreshBtn = el('button', { class: 'btn btn-ghost', type: 'button', text: 'Refresh' });
  refreshBtn.addEventListener('click', function () { refresh(); });
  const exportBtn = el('button', { class: 'btn btn-ghost', type: 'button', text: 'Export Prompt Folder Info' });
  exportBtn.addEventListener('click', function () { exportPromptFolderInfo(id, exportBtn); });

  container.appendChild(el('div', { class: 'im-head' }, [
    el('h2', { class: 'im-title', text: 'Image' }),
    el('div', { class: 'im-head-btns' }, [importBtn, refreshBtn, exportBtn])
  ]));
  container.appendChild(imageSummaryBox(summary));
  container.appendChild(el('p', { class: 'im-folder', text: 'Folder WinSCP: ' + ((summary && summary.upload_folder) || ('uploads/images/project-' + id + '/')) + ' — namakan fail panel-{id}.png' }));

  if (!items.length) {
    container.appendChild(el('div', { class: 'empty' }, [
      el('p', { class: 'empty-title', text: 'Belum ada panel' }),
      el('p', { class: 'empty-text', text: 'Sila jana panel & prompt dahulu.' })
    ]));
    return;
  }

  // Kumpul ikut babak
  const cards = el('div', { class: 'im-cards' });
  let lastScene = null;
  items.forEach(function (it) {
    if (it.scene_no !== lastScene) {
      lastScene = it.scene_no;
      cards.appendChild(el('h3', { class: 'im-scene-h', text: 'Babak ' + (it.scene_no || '–') + (it.scene_title ? ' — ' + it.scene_title : '') }));
    }
    cards.appendChild(imageCard(it, id, refresh, updateStatus));
  });
  container.appendChild(cards);
}

// ---- Tab: Production (Production Engine, Fasa 9) ---------------------------
const JOB_TYPES_CLIENT = ['TEXT_PARSE', 'CHARACTER_GENERATION', 'SCENE_GENERATION', 'PANEL_GENERATION', 'SCRIPT_GENERATION', 'VISUAL_GENERATION', 'PROMPT_GENERATION', 'IMAGE_GENERATION', 'REVIEW', 'EXPORT'];
const PRIORITIES_CLIENT = ['high', 'normal', 'low'];
const ACTIVE_STATUS = ['pending', 'claimed', 'running'];
let productionPollTimer = null;
let productionAuto = false;
let productionFormOpen = false;
let productionFilter = { status: '', priority: '', q: '', sort: '' };

function clearProductionPolling() {
  if (productionPollTimer) { clearInterval(productionPollTimer); productionPollTimer = null; }
}
function isProductionActive() {
  const a = document.querySelector('.tabs .tab.is-active');
  return a && a.textContent === 'Production';
}
function relTime(iso) {
  if (!iso) return '—';
  const t = new Date(iso).getTime();
  if (isNaN(t)) return '—';
  const s = Math.max(0, Math.round((Date.now() - t) / 1000));
  if (s < 60) return s + 's lalu';
  if (s < 3600) return Math.round(s / 60) + 'm lalu';
  if (s < 86400) return Math.round(s / 3600) + 'j lalu';
  return Math.round(s / 86400) + 'h lalu';
}
function pjElapsed(job) {
  if (!job.started_at) return '—';
  const start = new Date(job.started_at).getTime();
  const end = job.completed_at ? new Date(job.completed_at).getTime() : Date.now();
  const s = Math.max(0, Math.round((end - start) / 1000));
  return s + 's';
}

function prStat(label, value, cls) {
  return el('div', { class: 'pr-stat' + (cls ? ' ' + cls : '') }, [
    el('span', { class: 'pr-stat-val', text: String(value) }),
    el('span', { class: 'pr-stat-key', text: label })
  ]);
}

function jobRow(job, reload, updateStatus) {
  const actions = [];
  if (ACTIVE_STATUS.indexOf(job.status) !== -1) {
    const cancelBtn = el('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: 'Cancel' });
    cancelBtn.addEventListener('click', async function () {
      try { await api.cancelJob(job.id); toast('Job dibatalkan', 'ok'); reload(); } catch (e) { toast('Gagal: ' + e.message, 'error'); }
    });
    actions.push(cancelBtn);
  }
  if (job.status === 'failed' || job.status === 'cancelled') {
    const retryBtn = el('button', { class: 'btn btn-primary btn-sm', type: 'button', text: 'Retry' });
    retryBtn.addEventListener('click', async function () {
      try { await api.retryJob(job.id); toast('Job di-retry', 'ok'); reload(); } catch (e) { toast('Gagal: ' + e.message, 'error'); }
    });
    actions.push(retryBtn);
  }
  const delBtn = el('button', { class: 'btn btn-danger btn-sm', type: 'button', text: 'Padam' });
  delBtn.addEventListener('click', async function () {
    if (!window.confirm('Padam job #' + job.id + '?')) return;
    try { await api.deleteJob(job.id); toast('Job dipadam', 'ok'); reload(); } catch (e) { toast('Gagal: ' + e.message, 'error'); }
  });
  actions.push(delBtn);

  const dep = job.depends_on_job ? el('span', { class: 'pr-dep', text: '↳ bergantung #' + job.depends_on_job }) : null;

  return el('div', { class: 'pr-job pr-job--' + job.status }, [
    el('div', { class: 'pr-job-main' }, [
      el('div', { class: 'pr-job-head' }, [
        el('span', { class: 'pr-job-id', text: '#' + job.id }),
        el('span', { class: 'pr-job-type', text: job.job_type })
      ]),
      el('div', { class: 'pr-job-meta' }, [
        el('span', { class: 'pr-pill pr-pri--' + job.priority, text: job.priority }),
        el('span', { class: 'pr-pill pr-st--' + job.status, text: job.status }),
        el('span', { class: 'pr-muted', text: 'worker: ' + (job.worker_name || '—') }),
        el('span', { class: 'pr-muted', text: 'masa: ' + pjElapsed(job) }),
        el('span', { class: 'pr-muted', text: 'retry: ' + job.retry_count + '/' + job.max_retry })
      ]),
      dep,
      job.error_message ? el('p', { class: 'pr-err', text: job.error_message }) : null
    ]),
    el('div', { class: 'pr-job-actions' }, actions)
  ]);
}

function workerRow(w, aiInfo) {
  const ai = aiInfo || { name: 'dummy', model: 'dummy-model', latency_ms: 1000 };
  return el('div', { class: 'pr-worker' }, [
    el('div', {}, [
      el('span', { class: 'pr-worker-name', text: w.worker_name }),
      el('span', { class: 'pr-pill pr-wk--' + w.status, text: w.status })
    ]),
    el('div', { class: 'pr-worker-meta' }, [
      el('span', { class: 'pr-muted', text: 'heartbeat: ' + relTime(w.last_heartbeat) }),
      el('span', { class: 'pr-muted', text: 'job: ' + (w.current_job != null ? '#' + w.current_job : '—') }),
      el('span', { class: 'pr-muted', text: 'provider: ' + (ai.name || 'dummy') }),
      el('span', { class: 'pr-muted', text: 'model: ' + (ai.model || '—') }),
      el('span', { class: 'pr-muted', text: 'latency: ' + (ai.latency_ms != null ? ai.latency_ms + 'ms' : '—') })
    ]),
    el('div', { class: 'pr-worker-meta' }, [
      el('span', { class: 'pr-muted', text: 'CPU ' + (w.cpu_usage != null ? w.cpu_usage + '%' : '—') }),
      el('span', { class: 'pr-muted', text: 'RAM ' + (w.ram_usage != null ? w.ram_usage + '%' : '—') }),
      el('span', { class: 'pr-muted', text: 'GPU ' + (w.gpu_usage != null ? w.gpu_usage + '%' : '—') })
    ])
  ]);
}

function buildCreateJobForm(id, reload) {
  const typeSel = el('select', { class: 'field-input' }, JOB_TYPES_CLIENT.map(function (t) { return el('option', { value: t, text: t }); }));
  const priSel = el('select', { class: 'field-input' }, PRIORITIES_CLIENT.map(function (p) { return el('option', { value: p, text: p }); }));
  priSel.value = 'normal';
  const depInput = el('input', { type: 'number', class: 'field-input', placeholder: 'depends_on_job (pilihan)', min: '1' });
  const createBtn = el('button', { class: 'btn btn-primary btn-sm', type: 'button', text: 'Cipta' });
  createBtn.addEventListener('click', async function () {
    const payload = { job_type: typeSel.value, priority: priSel.value, project_id: id };
    if (depInput.value) payload.depends_on_job = parseInt(depInput.value, 10);
    createBtn.disabled = true;
    try { await api.createJob(payload); toast('Job dicipta', 'ok'); reload(); }
    catch (e) { toast('Gagal: ' + e.message, 'error'); createBtn.disabled = false; }
  });
  return el('div', { class: 'pr-form' }, [
    el('div', { class: 'pr-form-row' }, [
      el('label', { class: 'pr-form-label', text: 'Jenis' }), typeSel,
      el('label', { class: 'pr-form-label', text: 'Priority' }), priSel
    ]),
    el('div', { class: 'pr-form-row' }, [depInput, createBtn]),
    el('p', { class: 'pr-muted', text: 'project_id = ' + id + ' (job generik; worker tidak perlu tahu logik Webtoon).' })
  ]);
}

function prSelect(label, value, opts, onChange) {
  const sel = el('select', { class: 'pr-select' }, opts.map(function (o) { return el('option', { value: o[0], text: o[1] }); }));
  sel.value = value || '';
  sel.addEventListener('change', function () { onChange(sel.value); });
  return el('label', { class: 'pr-ctrl' }, [el('span', { class: 'pr-ctrl-lbl', text: label }), sel]);
}

async function renderProductionTab(id, container, updateStatus) {
  clearProductionPolling();
  container.innerHTML = '';
  container.appendChild(el('p', { class: 'muted', text: 'Memuatkan production…' }));

  function reload() { renderProductionTab(id, container, updateStatus); }

  let data, wdata, ai, tpls, img;
  try {
    data = await api.listJobs(productionFilter);
    wdata = await api.listWorkers();
    ai = await api.getAiProviders();
    tpls = await api.getPromptTemplates();
    img = await api.getImageProviders();
  } catch (err) {
    container.innerHTML = '';
    container.appendChild(el('p', { class: 'error-text', text: 'Gagal memuatkan: ' + err.message }));
    return;
  }
  let pstat = null;
  try { pstat = await api.getProductionStatus(id); } catch (e) { pstat = null; }
  container.innerHTML = '';

  const jobs = (data && data.jobs) || [];
  const js = (data && data.summary) || {};
  const workers = (wdata && wdata.workers) || [];
  const ws = (wdata && wdata.summary) || {};
  const aiProviders = (ai && ai.providers) || [];
  const aiDefault = (ai && ai.default) || 'dummy';
  const aiDefInfo = (aiProviders.find(function (p) { return p.name === aiDefault; }) || {}).info || { name: aiDefault, model: 'dummy-model', latency_ms: 1000 };

  // Header + butang
  const createToggle = el('button', { class: 'btn btn-primary', type: 'button', text: productionFormOpen ? '× Tutup' : '＋ Cipta Job' });
  createToggle.addEventListener('click', function () { productionFormOpen = !productionFormOpen; reload(); });
  const refreshBtn = el('button', { class: 'btn btn-ghost', type: 'button', text: 'Refresh' });
  refreshBtn.addEventListener('click', function () { reload(); });
  const purgeBtn = el('button', { class: 'btn btn-ghost', type: 'button', text: 'Padam Selesai' });
  purgeBtn.addEventListener('click', async function () {
    const done = jobs.filter(function (j) { return j.status === 'completed'; });
    if (!done.length) { toast('Tiada job selesai', 'ok'); return; }
    if (!window.confirm('Padam ' + done.length + ' job yang selesai?')) return;
    try { for (const j of done) await api.deleteJob(j.id); toast('Dipadam', 'ok'); reload(); }
    catch (e) { toast('Gagal: ' + e.message, 'error'); }
  });
  const autoWrap = el('label', { class: 'pr-auto' });
  const autoCb = el('input', { type: 'checkbox' });
  autoCb.checked = productionAuto;
  autoCb.addEventListener('change', function () { productionAuto = autoCb.checked; reload(); });
  autoWrap.appendChild(autoCb);
  autoWrap.appendChild(document.createTextNode(' Auto'));

  container.appendChild(el('div', { class: 'pr-head' }, [
    el('h2', { class: 'pr-title', text: 'Production Engine' }),
    el('div', { class: 'pr-head-btns' }, [createToggle, refreshBtn, purgeBtn, autoWrap])
  ]));

  if (productionFormOpen) container.appendChild(buildCreateJobForm(id, reload));

  // Auto Pipeline (Fasa 14) — 🚀 Generate Project membina queue automatik.
  (function renderPipeline() {
    const ps = (pstat && pstat.ok) ? pstat : null;
    const pst = ps ? ps.pipeline_status : 'idle';
    const sm = (ps && ps.summary) || {};
    const stg = (ps && ps.stages) || {};
    function fmtEta(s) { if (s == null) return '—'; if (s <= 0) return '0s'; const m = Math.floor(s / 60), ss = s % 60; return m > 0 ? (m + 'm ' + ss + 's') : (ss + 's'); }
    function badgeClass(s) { return s === 'completed' ? 'pr-health--online' : (s === 'failed' ? 'pr-health--offline' : (s === 'running' ? 'pr-ai-cur' : 'pr-health--unknown')); }
    function stageRow(label, s) {
      s = s || { total: 0, completed: 0, running: 0, failed: 0 };
      const pct = s.total > 0 ? Math.round((s.completed / s.total) * 100) : 0;
      const fill = el('div', { class: 'pl-fill' + (s.failed > 0 ? ' pl-fill--fail' : ''), style: 'width:' + pct + '%' });
      return el('div', { class: 'pl-stage' }, [
        el('span', { class: 'pl-stage-lbl', text: label }),
        el('div', { class: 'pl-bar' }, [fill]),
        el('span', { class: 'pl-stage-num', text: s.completed + ' / ' + s.total + (s.failed > 0 ? ' · gagal ' + s.failed : '') + (s.running > 0 ? ' · ' + s.running + ' aktif' : '') })
      ]);
    }
    const genBtn = el('button', { class: 'btn btn-primary', type: 'button', text: '🚀 Generate Project' });
    genBtn.addEventListener('click', async function () {
      genBtn.disabled = true; const l = genBtn.textContent; genBtn.textContent = 'Menyusun…';
      try {
        const out = await api.startProduction(id);
        if (out.already_running) toast('Pipeline sedang berjalan — tiada duplikat ditambah', 'ok');
        else toast('Pipeline dibina: ' + (out.created || 0) + ' job (' + (out.panels || 0) + ' panel)', 'ok');
        reload();
      } catch (e) { toast('Gagal: ' + e.message, 'error'); genBtn.disabled = false; genBtn.textContent = l; }
    });
    const cancelBtn = el('button', { class: 'btn btn-ghost', type: 'button', text: 'Cancel' });
    cancelBtn.addEventListener('click', async function () {
      cancelBtn.disabled = true;
      try { const out = await api.cancelProduction(id); toast('Dibatalkan: ' + (out.cancelled || 0) + ' job', 'ok'); reload(); }
      catch (e) { toast('Gagal: ' + e.message, 'error'); cancelBtn.disabled = false; }
    });
    const refreshBtn = el('button', { class: 'btn btn-ghost', type: 'button', text: 'Refresh' });
    refreshBtn.addEventListener('click', function () { reload(); });

    const rows = [
      el('div', { class: 'pr-ai-row' }, [
        el('span', { class: 'pr-ai-label', text: 'Auto Pipeline' }),
        el('span', { class: 'pr-pill ' + badgeClass(pst), text: pst }),
        el('span', { class: 'pr-muted', text: 'Projek: ' + (ps ? ps.project_status : '—') })
      ]),
      el('div', { class: 'pr-ai-row pl-actions' }, [genBtn, cancelBtn, refreshBtn])
    ];
    if (ps && sm.total_jobs > 0) {
      rows.push(el('div', { class: 'pr-ai-row pl-summary' }, [
        el('span', { class: 'pr-muted', text: 'Panel: ' + ps.panels }),
        el('span', { class: 'pr-muted', text: 'Job: ' + sm.total_jobs }),
        el('span', { class: 'pr-muted', text: 'Selesai: ' + sm.completed }),
        el('span', { class: 'pr-muted', text: 'Berjalan: ' + sm.running }),
        el('span', { class: 'pr-muted', text: 'Gagal: ' + sm.failed }),
        el('span', { class: 'pr-muted', text: 'Baki: ' + sm.remaining }),
        el('span', { class: 'pr-muted', text: 'ETA: ' + fmtEta(sm.eta_seconds) })
      ]));
      rows.push(stageRow('Script', stg.script));
      rows.push(stageRow('Visual', stg.visual));
      rows.push(stageRow('Prompt', stg.prompt));
      rows.push(stageRow('Image', stg.image));
      rows.push(stageRow('Review', stg.review));
      const live = (ps.live_activity) || [];
      if (live.length) {
        rows.push(el('div', { class: 'pr-ai-row' }, [el('span', { class: 'pr-ctrl-lbl', text: 'Live Activity' })]));
        live.forEach(function (a) {
          rows.push(el('div', { class: 'pl-live' }, [
            el('span', { class: 'pr-pill pr-wk--online', text: a.worker }),
            el('span', { class: 'pr-muted', text: '↓ ' + a.stage + (a.panel_id != null ? ' · Panel ' + a.panel_id : '') })
          ]));
        });
      }
      if (ps.review_failed) rows.push(el('p', { class: 'error-text', text: 'Review GAGAL — pipeline berhenti. Imej TIDAK dipadam.' }));
    } else {
      rows.push(el('p', { class: 'pr-muted', text: 'Tekan 🚀 Generate Project untuk membina queue automatik (Script → Visual → Prompt → Image → Review) bagi semua panel projek ini.' }));
    }
    container.appendChild(el('div', { class: 'pr-ai pl-card' }, rows));
  })();

  // AI Provider (Fasa 10/11) — Production Engine hanya tahu adapter, bukan model.
  const provSel = el('select', { class: 'pr-select' }, aiProviders.map(function (p) {
    return el('option', { value: p.name, text: p.name + (p.info && p.info.model ? ' (' + p.info.model + ')' : '') });
  }));
  provSel.value = aiDefault;
  provSel.addEventListener('change', async function () {
    try { await api.setAiDefault(provSel.value); toast('Provider ditukar: ' + provSel.value, 'ok'); reload(); }
    catch (e) { toast('Gagal: ' + e.message, 'error'); }
  });

  const baseUrlLine = aiDefInfo.base_url
    ? el('span', { class: 'pr-muted', text: 'Base URL: ' + aiDefInfo.base_url })
    : null;

  // Status health + Test Connection
  const statusBadge = el('span', { class: 'pr-pill pr-health--unknown', text: 'Belum diuji' });
  const statusDetail = el('span', { class: 'pr-muted', text: '' });
  const testBtn = el('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: 'Test Connection' });
  testBtn.addEventListener('click', async function () {
    testBtn.disabled = true; const lbl = testBtn.textContent; testBtn.textContent = 'Menguji…';
    statusBadge.className = 'pr-pill pr-health--unknown'; statusBadge.textContent = 'Menguji…'; statusDetail.textContent = '';
    try {
      const h = await api.getProviderHealth(aiDefault);
      if (h && h.ok && h.available) {
        statusBadge.className = 'pr-pill pr-health--online'; statusBadge.textContent = 'Online';
        statusDetail.textContent = (h.latency_ms != null ? 'latency: ' + h.latency_ms + 'ms' : '') + (h.models && h.models.length ? ' · ' + h.models.length + ' model' : '');
      } else {
        statusBadge.className = 'pr-pill pr-health--offline'; statusBadge.textContent = 'Offline';
        statusDetail.textContent = (h && h.error ? h.error : 'tidak tersedia') + (h && h.latency_ms != null ? ' · ' + h.latency_ms + 'ms' : '');
      }
    } catch (e) {
      statusBadge.className = 'pr-pill pr-health--offline'; statusBadge.textContent = 'Offline';
      statusDetail.textContent = e.message;
    }
    testBtn.disabled = false; testBtn.textContent = lbl;
  });

  container.appendChild(el('div', { class: 'pr-ai' }, [
    el('div', { class: 'pr-ai-row' }, [
      el('span', { class: 'pr-ai-label', text: 'AI Provider' }),
      el('span', { class: 'pr-pill pr-ai-cur', text: aiDefault }),
      el('span', { class: 'pr-muted', text: 'Model: ' + (aiDefInfo.model || '—') })
    ]),
    baseUrlLine ? el('div', { class: 'pr-ai-row' }, [baseUrlLine]) : null,
    el('div', { class: 'pr-ai-row' }, [
      el('span', { class: 'pr-ctrl-lbl', text: 'Status' }), statusBadge, testBtn, statusDetail
    ]),
    el('label', { class: 'pr-ctrl' }, [el('span', { class: 'pr-ctrl-lbl', text: 'Tukar provider' }), provSel]),
    el('p', { class: 'pr-muted', text: aiDefault === 'dummy'
      ? 'Provider dummy: respons simulasi (success:true, cost:0). Engine tidak tahu model AI yang digunakan.'
      : 'Provider ollama (pilihan, tempatan). Jika Ollama tidak berjalan, job gagal secara terkawal — sistem tidak crash. Default sistem kekal dummy.' })
  ]));

  // Image Provider (Fasa 12) — Production Engine hanya tahu adapter, bukan engine.
  const imgProviders = (img && img.providers) || [];
  const imgDefault = (img && img.default) || 'dummy-image';
  const imgDefInfo = (imgProviders.find(function (p) { return p.name === imgDefault; }) || {}).info || { name: imgDefault, model: 'dummy-image-model', latency_ms: 1000 };
  const imgProvSel = el('select', { class: 'pr-select' }, imgProviders.map(function (p) {
    return el('option', { value: p.name, text: p.name + (p.info && p.info.model ? ' (' + p.info.model + ')' : '') });
  }));
  imgProvSel.value = imgDefault;
  imgProvSel.addEventListener('change', async function () {
    try { await api.setImageDefault(imgProvSel.value); toast('Image provider ditukar: ' + imgProvSel.value, 'ok'); reload(); }
    catch (e) { toast('Gagal: ' + e.message, 'error'); }
  });
  const imgStatusBadge = el('span', { class: 'pr-pill pr-health--unknown', text: 'Belum diuji' });
  const imgStatusDetail = el('span', { class: 'pr-muted', text: '' });
  const imgTestBtn = el('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: 'Test Connection' });
  imgTestBtn.addEventListener('click', async function () {
    imgTestBtn.disabled = true; const lbl = imgTestBtn.textContent; imgTestBtn.textContent = 'Menguji…';
    imgStatusBadge.className = 'pr-pill pr-health--unknown'; imgStatusBadge.textContent = 'Menguji…'; imgStatusDetail.textContent = '';
    try {
      const h = await api.getImageProviderHealth(imgDefault);
      if (h && h.ok && h.available) {
        imgStatusBadge.className = 'pr-pill pr-health--online'; imgStatusBadge.textContent = 'Online';
        const parts = [];
        if (h.latency_ms != null) parts.push('latency: ' + h.latency_ms + 'ms');
        if (h.gpu) parts.push('GPU: ' + h.gpu);
        if (h.vram && h.vram.total != null) {
          const gb = function (b) { return (b / (1024 * 1024 * 1024)).toFixed(1) + 'GB'; };
          parts.push('VRAM: ' + (h.vram.free != null ? gb(h.vram.free) + ' bebas / ' : '') + gb(h.vram.total));
        }
        if (h.queue != null) parts.push('Queue: ' + h.queue);
        if (h.version) parts.push('v' + h.version);
        if (h.model && !h.gpu) parts.push(h.model);
        imgStatusDetail.textContent = parts.join(' · ');
      } else {
        imgStatusBadge.className = 'pr-pill pr-health--offline'; imgStatusBadge.textContent = 'Offline';
        imgStatusDetail.textContent = (h && h.error ? h.error : 'tidak tersedia') + (h && h.latency_ms != null ? ' · ' + h.latency_ms + 'ms' : '');
      }
    } catch (e) {
      imgStatusBadge.className = 'pr-pill pr-health--offline'; imgStatusBadge.textContent = 'Offline';
      imgStatusDetail.textContent = e.message;
    }
    imgTestBtn.disabled = false; imgTestBtn.textContent = lbl;
  });

  // Fasa 13: Generate Test Image (prompt dummy; tidak masuk Project)
  const genStatus = el('span', { class: 'pr-muted', text: '' });
  const genPreview = el('img', { class: 'pr-img-preview', alt: 'Imej ujian', style: 'display:none' });
  const genBtn = el('button', { class: 'btn btn-primary btn-sm', type: 'button', text: 'Generate Test Image' });
  genBtn.addEventListener('click', async function () {
    genBtn.disabled = true; const lbl = genBtn.textContent; genBtn.textContent = 'Menjana…';
    genStatus.textContent = 'prompt: "A red apple on wooden table"…'; genPreview.style.display = 'none'; genPreview.removeAttribute('src');
    try {
      const out = await api.testGenerateImage('A red apple on wooden table');
      if (out && out.success && out.image && out.image.url) {
        genStatus.textContent = 'Berjaya (' + (out.provider || '') + (out.latency_ms != null ? ', ' + out.latency_ms + 'ms' : '') + (out.seed != null ? ', seed ' + out.seed : '') + ')';
        genPreview.src = out.image.url; genPreview.style.display = 'block';
        toast('Imej ujian dijana', 'ok');
      } else if (out && out.success && !out.image) {
        genStatus.textContent = 'Provider ' + (out.provider || '') + ' (simulasi) — tiada imej sebenar.';
      } else {
        genStatus.textContent = 'Gagal: ' + ((out && (out.message || out.error)) || 'tidak diketahui');
      }
    } catch (e) { genStatus.textContent = 'Gagal: ' + e.message; }
    genBtn.disabled = false; genBtn.textContent = lbl;
  });

  container.appendChild(el('div', { class: 'pr-ai' }, [
    el('div', { class: 'pr-ai-row' }, [
      el('span', { class: 'pr-ai-label', text: 'Image Provider' }),
      el('span', { class: 'pr-pill pr-ai-cur', text: imgDefault }),
      el('span', { class: 'pr-muted', text: 'Model: ' + (imgDefInfo.model || '—') + ' · latency: ' + (imgDefInfo.latency_ms != null ? imgDefInfo.latency_ms + 'ms' : '—') })
    ]),
    el('div', { class: 'pr-ai-row' }, [
      el('span', { class: 'pr-ctrl-lbl', text: 'Status' }), imgStatusBadge, imgTestBtn, imgStatusDetail
    ]),
    el('label', { class: 'pr-ctrl' }, [el('span', { class: 'pr-ctrl-lbl', text: 'Tukar provider' }), imgProvSel]),
    el('div', { class: 'pr-ai-row' }, [genBtn, genStatus]),
    genPreview,
    el('p', { class: 'pr-muted', text: 'IMAGE_GENERATION dirutekan ke Image Adapter (dummy-image/comfyui). Generate Test Image hanya untuk ujian — tidak masuk Project. Jika ComfyUI offline, job gagal terkawal; Ollama/AI tidak terjejas.' })
  ]));

  // Prompt Builder (Fasa 11B) — single source of truth untuk semua prompt.
  const pbVersion = (tpls && tpls.version) || 'v1';
  const pbTemplates = (tpls && tpls.templates) || [];
  const taskSel = el('select', { class: 'pr-select' }, [
    el('option', { value: 'generate_script', text: 'generate_script' }),
    el('option', { value: 'generate_prompt', text: 'generate_prompt' }),
    el('option', { value: 'review', text: 'review' }),
    el('option', { value: 'system', text: 'system' })
  ]);
  const sysOut = el('textarea', { class: 'field-input pb-out', rows: '4', readonly: 'readonly', placeholder: 'System prompt…' });
  const userOut = el('textarea', { class: 'field-input pb-out', rows: '4', readonly: 'readonly', placeholder: 'User prompt…' });
  const msgOut = el('textarea', { class: 'field-input pb-out', rows: '5', readonly: 'readonly', placeholder: 'Messages JSON…' });
  const previewBtn = el('button', { class: 'btn btn-primary btn-sm', type: 'button', text: 'Preview Context' });
  previewBtn.addEventListener('click', async function () {
    previewBtn.disabled = true; const lbl = previewBtn.textContent; previewBtn.textContent = 'Membina…';
    const samplePayload = {
      project: { title_ms: 'Musa & Khidir', language: 'ms' },
      scene: { scene_no: 1, title_ms: 'Pertemuan' },
      panel: { panel_no: 1, panel_type: 'establishing' },
      task: 'SCRIPT_GENERATION'
    };
    try {
      const built = await api.previewPromptContext(taskSel.value, samplePayload);
      sysOut.value = built.system || '';
      userOut.value = built.user || '';
      msgOut.value = JSON.stringify(built.messages || [], null, 2);
      toast('Context dibina (' + (built.version || pbVersion) + ')', 'ok');
    } catch (e) { toast('Gagal: ' + e.message, 'error'); }
    previewBtn.disabled = false; previewBtn.textContent = lbl;
  });

  container.appendChild(el('div', { class: 'pr-pb' }, [
    el('div', { class: 'pr-ai-row' }, [
      el('span', { class: 'pr-ai-label', text: 'Prompt Builder' }),
      el('span', { class: 'pr-pill pr-ai-cur', text: pbVersion }),
      el('span', { class: 'pr-muted', text: 'Template: ' + (pbTemplates.length ? pbTemplates.join(', ') : '—') })
    ]),
    el('div', { class: 'pr-ai-row' }, [
      el('label', { class: 'pr-ctrl' }, [el('span', { class: 'pr-ctrl-lbl', text: 'Task' }), taskSel]),
      previewBtn
    ]),
    el('label', { class: 'prompt-field-label', text: 'System Prompt' }), sysOut,
    el('label', { class: 'prompt-field-label', text: 'User Prompt' }), userOut,
    el('label', { class: 'prompt-field-label', text: 'Messages JSON' }), msgOut,
    el('p', { class: 'pr-muted', text: 'Read-only. Semua adapter (dummy/ollama/akan datang) menggunakan builder ini. Template dalam src/prompts/templates/.' })
  ]));

  // Summary
  container.appendChild(el('h3', { class: 'pr-section-h', text: 'Ringkasan Job' }));
  container.appendChild(el('div', { class: 'pr-summary' }, [
    prStat('Pending', js.pending || 0),
    prStat('Running', js.running || 0, 'pr-stat--run'),
    prStat('Completed', js.completed || 0, 'pr-stat--ok'),
    prStat('Failed', js.failed || 0, (js.failed ? 'pr-stat--error' : ''))
  ]));

  // Worker monitor
  container.appendChild(el('h3', { class: 'pr-section-h', text: 'Workers' }));
  container.appendChild(el('div', { class: 'pr-summary pr-summary--wk' }, [
    prStat('Online', ws.online || 0, 'pr-stat--ok'),
    prStat('Busy', ws.busy || 0, 'pr-stat--run'),
    prStat('Offline', ws.offline || 0)
  ]));
  if (workers.length) {
    const wl = el('div', { class: 'pr-workers' });
    workers.forEach(function (w) { wl.appendChild(workerRow(w, aiDefInfo)); });
    container.appendChild(wl);
  } else {
    container.appendChild(el('p', { class: 'pr-muted', text: 'Tiada worker berdaftar lagi.' }));
  }

  // Kawalan filter / cari / susun
  const controls = el('div', { class: 'pr-controls' }, [
    prSelect('Status', productionFilter.status, [['', 'Semua'], ['pending', 'pending'], ['claimed', 'claimed'], ['running', 'running'], ['completed', 'completed'], ['failed', 'failed'], ['cancelled', 'cancelled']], function (v) { productionFilter.status = v; reload(); }),
    prSelect('Priority', productionFilter.priority, [['', 'Semua'], ['high', 'high'], ['normal', 'normal'], ['low', 'low']], function (v) { productionFilter.priority = v; reload(); }),
    prSelect('Susun', productionFilter.sort, [['', 'Terbaru'], ['oldest', 'Terlama'], ['priority', 'Priority'], ['status', 'Status']], function (v) { productionFilter.sort = v; reload(); })
  ]);
  const searchInput = el('input', { type: 'search', class: 'pr-search', placeholder: 'Cari (jenis/worker/ralat)…' });
  searchInput.value = productionFilter.q;
  searchInput.addEventListener('keydown', function (e) { if (e.key === 'Enter') { productionFilter.q = searchInput.value; reload(); } });
  const searchBtn = el('button', { class: 'btn btn-ghost btn-sm', type: 'button', text: 'Cari' });
  searchBtn.addEventListener('click', function () { productionFilter.q = searchInput.value; reload(); });
  controls.appendChild(el('label', { class: 'pr-ctrl' }, [el('span', { class: 'pr-ctrl-lbl', text: 'Cari' }), el('div', { class: 'pr-search-wrap' }, [searchInput, searchBtn])]));
  container.appendChild(controls);

  // Queue (aktif) & History (terminal)
  const active = jobs.filter(function (j) { return ACTIVE_STATUS.indexOf(j.status) !== -1; });
  const history = jobs.filter(function (j) { return ACTIVE_STATUS.indexOf(j.status) === -1; });

  container.appendChild(el('h3', { class: 'pr-section-h', text: 'Queue (' + active.length + ')' }));
  if (active.length) {
    const al = el('div', { class: 'pr-jobs' });
    active.forEach(function (j) { al.appendChild(jobRow(j, reload, updateStatus)); });
    container.appendChild(al);
  } else {
    container.appendChild(el('p', { class: 'pr-muted', text: 'Queue kosong.' }));
  }

  container.appendChild(el('h3', { class: 'pr-section-h', text: 'History (' + history.length + ')' }));
  if (history.length) {
    const hl = el('div', { class: 'pr-jobs' });
    history.forEach(function (j) { hl.appendChild(jobRow(j, reload, updateStatus)); });
    container.appendChild(hl);
  } else {
    container.appendChild(el('p', { class: 'pr-muted', text: 'Tiada sejarah lagi.' }));
  }

  // Auto-refresh (jika dihidupkan ATAU pipeline sedang berjalan) — berhenti automatik bila keluar tab/siap.
  const pipelineRunning = !!(pstat && pstat.ok && pstat.pipeline_status === 'running');
  if (productionAuto || pipelineRunning) {
    productionPollTimer = setInterval(function () {
      if (!isProductionActive()) { clearProductionPolling(); return; }
      reload();
    }, 3000);
  }
}

// ---- Tab: Preview (Webtoon Reader read-only — Fasa 15) -------------------
let previewOpts = { image: true, caption: true, dialogue: true, narration: true, prompt: false, dark: false, compact: false };
let previewZoom = 100;
let previewImgSize = 'auto'; // auto | fit | original
let previewFilterChapter = '';
let previewFilterChar = '';
let previewSearch = '';

async function renderPreviewTab(id, container, updateStatus) {
  container.innerHTML = '';
  container.appendChild(el('p', { class: 'muted', text: 'Memuatkan preview…' }));

  let data;
  try { data = await api.getPreview(id); }
  catch (err) {
    container.innerHTML = '';
    container.appendChild(el('p', { class: 'error-text', text: 'Gagal memuatkan preview: ' + err.message }));
    return;
  }
  container.innerHTML = '';

  const chapters = (data && data.chapters) || [];
  const characters = (data && data.characters) || [];
  const summary = (data && data.summary) || { chapters: 0, panels: 0, with_image: 0, without_image: 0 };

  // ---- Toolbar ----
  function optCheckbox(key, label) {
    const cb = el('input', { type: 'checkbox' });
    cb.checked = !!previewOpts[key];
    cb.addEventListener('change', function () { previewOpts[key] = cb.checked; applyOptions(); });
    return el('label', { class: 'pv-opt' }, [cb, el('span', { text: label })]);
  }
  const zoomSel = el('select', { class: 'pr-select' }, ['50', '75', '100', '125'].map(function (z) { return el('option', { value: z, text: z + '%' }); }));
  zoomSel.value = String(previewZoom);
  zoomSel.addEventListener('change', function () { previewZoom = parseInt(zoomSel.value, 10) || 100; applyOptions(); });

  const sizeSel = el('select', { class: 'pr-select' }, [['auto', 'Auto'], ['fit', 'Fit Width'], ['original', 'Original']].map(function (o) { return el('option', { value: o[0], text: o[1] }); }));
  sizeSel.value = previewImgSize;
  sizeSel.addEventListener('change', function () { previewImgSize = sizeSel.value; applyOptions(); });

  const chapSel = el('select', { class: 'pr-select' }, [el('option', { value: '', text: 'Semua bab' })].concat(chapters.map(function (c) {
    const n = c.scene.scene_no != null ? c.scene.scene_no : '?';
    return el('option', { value: String(c.scene.id), text: 'Bab ' + n + (c.scene.title_ms ? ' — ' + c.scene.title_ms : '') });
  })));
  chapSel.value = previewFilterChapter;
  chapSel.addEventListener('change', function () { previewFilterChapter = chapSel.value; applyFilters(); });

  const charSel = el('select', { class: 'pr-select' }, [el('option', { value: '', text: 'Semua watak' })].concat(characters.filter(function (c) { return c.name_ms; }).map(function (c) {
    return el('option', { value: c.name_ms.toLowerCase(), text: c.name_ms });
  })));
  charSel.value = previewFilterChar;
  charSel.addEventListener('change', function () { previewFilterChar = charSel.value; applyFilters(); });

  const searchInput = el('input', { class: 'field-input pv-search', type: 'search', placeholder: 'Cari dialog / caption…' });
  searchInput.value = previewSearch;
  searchInput.addEventListener('input', function () { previewSearch = searchInput.value; applyFilters(); });

  const toolbar = el('div', { class: 'pv-toolbar' }, [
    el('div', { class: 'pv-toolbar-row' }, [
      optCheckbox('image', 'Image'), optCheckbox('caption', 'Caption'), optCheckbox('dialogue', 'Dialog'),
      optCheckbox('narration', 'Narasi'), optCheckbox('prompt', 'Prompt'), optCheckbox('dark', 'Dark'), optCheckbox('compact', 'Compact')
    ]),
    el('div', { class: 'pv-toolbar-row' }, [
      el('label', { class: 'pv-ctrl' }, [el('span', { text: 'Zoom' }), zoomSel]),
      el('label', { class: 'pv-ctrl' }, [el('span', { text: 'Imej' }), sizeSel]),
      el('label', { class: 'pv-ctrl' }, [el('span', { text: 'Bab' }), chapSel]),
      el('label', { class: 'pv-ctrl' }, [el('span', { text: 'Watak' }), charSel]),
      searchInput,
      el('span', { class: 'pr-muted', text: summary.chapters + ' bab · ' + summary.panels + ' panel · ' + summary.with_image + ' berimej' })
    ])
  ]);
  container.appendChild(toolbar);

  if (!chapters.length || summary.panels === 0) {
    container.appendChild(el('div', { class: 'pv-empty' }, [
      el('p', { class: 'muted', text: 'Tiada panel untuk dipratonton.' }),
      el('p', { class: 'pr-muted', text: 'Jana Babak → Panel (dan Pipeline) dahulu, kemudian buka Preview semula.' })
    ]));
    return;
  }

  // ---- Sidebar + Reader ----
  const sideItems = chapters.map(function (c) {
    const n = c.scene.scene_no != null ? c.scene.scene_no : '?';
    const btn = el('button', { class: 'pv-side-item', type: 'button', text: 'Bab ' + n + (c.scene.title_ms ? ' — ' + c.scene.title_ms : '') + ' (' + c.panels.length + ')' });
    btn.addEventListener('click', function () {
      const target = document.getElementById('pv-ch-' + c.scene.id);
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
    return btn;
  });
  const sidebar = el('div', { class: 'pv-sidebar' }, [el('div', { class: 'pv-side-title', text: 'Bab' })].concat(sideItems));

  const main = el('div', { class: 'pv-main', tabindex: '0' });

  function metaPill(label, val) { return el('span', { class: 'pv-meta', text: label + ': ' + val }); }

  chapters.forEach(function (c) {
    const n = c.scene.scene_no != null ? c.scene.scene_no : '?';
    const chWrap = el('div', { class: 'pv-chapter' });
    chWrap.id = 'pv-ch-' + c.scene.id;
    chWrap.setAttribute('data-chapter', String(c.scene.id));
    chWrap.appendChild(el('div', { class: 'pv-chapter-head' }, [
      el('span', { class: 'pv-chapter-no', text: 'Bab ' + n }),
      el('span', { class: 'pv-chapter-title', text: c.scene.title_ms || '' })
    ]));

    c.panels.forEach(function (p) {
      const card = el('div', { class: 'pv-panel' });
      const charNames = (p.characters || []).join(', ');
      const textBlob = ((p.caption_ms || '') + ' ' +
        (p.dialogue || []).map(function (d) { return (d.speaker_name || '') + ' ' + (d.text_ms || '') + ' ' + (d.text_ar || ''); }).join(' ') + ' ' +
        (p.narration || []).map(function (nn) { return (nn.text_ms || '') + ' ' + (nn.text_ar || ''); }).join(' ')).toLowerCase();
      card.setAttribute('data-chapter', String(c.scene.id));
      card.setAttribute('data-chars', charNames.toLowerCase());
      card.setAttribute('data-text', textBlob);

      // Image
      const imgWrap = el('div', { class: 'pv-img-wrap' });
      if (p.image && p.image.url) {
        imgWrap.appendChild(el('img', { class: 'pv-img', src: p.image.url, alt: 'Panel ' + p.panel_no, loading: 'lazy' }));
      } else {
        imgWrap.appendChild(el('div', { class: 'pv-noimg', text: 'No Image' }));
      }
      card.appendChild(imgWrap);

      // Meta
      const metas = [metaPill('Bab', n), metaPill('Panel', p.panel_no)];
      if (p.shot) metas.push(metaPill('Shot', p.shot));
      if (p.mood) metas.push(metaPill('Mood', p.mood));
      if (charNames) metas.push(metaPill('Watak', charNames));
      card.appendChild(el('div', { class: 'pv-metas' }, metas));

      // Caption
      if (p.caption_ms) card.appendChild(el('div', { class: 'pv-caption' }, [el('span', { class: 'pv-tag', text: 'Caption' }), el('span', { text: p.caption_ms })]));

      // Dialogue
      if (p.dialogue && p.dialogue.length) {
        const dWrap = el('div', { class: 'pv-dialogue' });
        p.dialogue.forEach(function (d) {
          dWrap.appendChild(el('div', { class: 'pv-line' }, [
            el('span', { class: 'pv-speaker', text: (d.speaker_name || '???') + ':' }),
            el('span', { class: 'pv-line-text' }, [
              d.text_ms ? el('div', { text: d.text_ms }) : null,
              d.text_ar ? el('div', { class: 'pv-ar', text: d.text_ar }) : null
            ])
          ]));
        });
        card.appendChild(dWrap);
      }

      // Narration
      if (p.narration && p.narration.length) {
        const nWrap = el('div', { class: 'pv-narration' });
        p.narration.forEach(function (nn) {
          nWrap.appendChild(el('div', { class: 'pv-line' }, [
            el('span', { class: 'pv-tag', text: 'Narasi' }),
            el('span', { class: 'pv-line-text' }, [
              nn.text_ms ? el('div', { text: nn.text_ms }) : null,
              nn.text_ar ? el('div', { class: 'pv-ar', text: nn.text_ar }) : null
            ])
          ]));
        });
        card.appendChild(nWrap);
      }

      // Prompt (tersembunyi secara lalai)
      if (p.prompt && (p.prompt.prompt_text || p.prompt.negative_prompt)) {
        card.appendChild(el('div', { class: 'pv-prompt' }, [
          el('span', { class: 'pv-tag', text: 'Prompt' }),
          el('div', { class: 'pv-prompt-text', text: p.prompt.prompt_text || '' }),
          p.prompt.negative_prompt ? el('div', { class: 'pv-prompt-neg', text: 'Negatif: ' + p.prompt.negative_prompt }) : null
        ]));
      }

      chWrap.appendChild(card);
    });

    main.appendChild(chWrap);
  });

  const readerRoot = el('div', { class: 'pv-reader' }, [sidebar, main]);
  container.appendChild(readerRoot);

  // ---- Terapkan opsyen (kelas + zoom + saiz imej) ----
  function applyOptions() {
    readerRoot.classList.toggle('pv-hide-image', !previewOpts.image);
    readerRoot.classList.toggle('pv-hide-caption', !previewOpts.caption);
    readerRoot.classList.toggle('pv-hide-dialogue', !previewOpts.dialogue);
    readerRoot.classList.toggle('pv-hide-narration', !previewOpts.narration);
    readerRoot.classList.toggle('pv-show-prompt', !!previewOpts.prompt);
    readerRoot.classList.toggle('pv-dark', !!previewOpts.dark);
    readerRoot.classList.toggle('pv-compact', !!previewOpts.compact);
    readerRoot.classList.remove('pv-imgsize-auto', 'pv-imgsize-fit', 'pv-imgsize-original');
    readerRoot.classList.add('pv-imgsize-' + previewImgSize);
    const base = 720;
    main.style.setProperty('--pv-colw', Math.round(base * (previewZoom / 100)) + 'px');
  }

  // ---- Terapkan filter / carian (tanpa muat semula) ----
  function applyFilters() {
    const q = (previewSearch || '').trim().toLowerCase();
    const ch = previewFilterChapter;
    const chr = (previewFilterChar || '').trim().toLowerCase();
    const chapterEls = main.querySelectorAll('.pv-chapter');
    chapterEls.forEach(function (chEl) {
      let visible = 0;
      const chapterMatch = !ch || chEl.getAttribute('data-chapter') === ch;
      chEl.querySelectorAll('.pv-panel').forEach(function (pEl) {
        let show = chapterMatch;
        if (show && chr) show = (pEl.getAttribute('data-chars') || '').indexOf(chr) !== -1;
        if (show && q) show = (pEl.getAttribute('data-text') || '').indexOf(q) !== -1;
        pEl.style.display = show ? '' : 'none';
        if (show) visible++;
      });
      chEl.style.display = (chapterMatch && (visible > 0 || (!q && !chr))) ? '' : 'none';
    });
  }

  applyOptions();
  applyFilters();

  // ---- Keyboard (Arrow Up/Down, Home, End) ----
  main.addEventListener('keydown', function (ev) {
    const step = Math.round(main.clientHeight * 0.9);
    if (ev.key === 'ArrowDown') { main.scrollBy({ top: step, behavior: 'smooth' }); ev.preventDefault(); }
    else if (ev.key === 'ArrowUp') { main.scrollBy({ top: -step, behavior: 'smooth' }); ev.preventDefault(); }
    else if (ev.key === 'Home') { main.scrollTo({ top: 0, behavior: 'smooth' }); ev.preventDefault(); }
    else if (ev.key === 'End') { main.scrollTo({ top: main.scrollHeight, behavior: 'smooth' }); ev.preventDefault(); }
  });
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
