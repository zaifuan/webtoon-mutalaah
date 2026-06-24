# Webtoon Mutalaah

Aplikasi web untuk guru memasukkan teks **Mutalaah Arab**, lalu sistem (pada fasa-fasa
akan datang) membantu menjana watak, storyboard, skrip, panel, prompt gambar, dan
akhirnya pratonton webtoon.

> **Status: Fasa 0 — Skeleton.** Belum ada AI, login, atau penjanaan gambar.
> Fokus fasa ini ialah rangka projek yang kemas, boleh dijalankan, dan mudah disambung.

## Stack

- Node.js + Express
- PostgreSQL
- Docker + docker-compose (1 container app + 1 container DB)
- Frontend HTML/CSS/JS biasa (tanpa React), mobile-first

## Struktur projek

```
webtoon-mutalaah/
├─ docker-compose.yml      # 1 app + 1 db
├─ Dockerfile             # imej container app
├─ .env.example           # contoh konfigurasi
├─ package.json
├─ db/
│  └─ migrations/
│     └─ 001_init.sql     # skema awal semua jadual
├─ src/
│  ├─ server.js           # Express server asas
│  ├─ migrate.js          # pelari migration (idempotent)
│  ├─ db/
│  │  └─ pool.js          # connection pool PostgreSQL
│  ├─ routes/
│  │  └─ health.js        # GET /api/health, /api/health/db
│  └─ config/
│     └─ characterTypes.js# jenis watak + peraturan tokoh mulia (untuk Fasa 1)
└─ public/
   ├─ index.html          # halaman status
   ├─ app.js              # ambil /api/health
   └─ style.css           # gaya mobile-first
```

## Cara run (Docker — disyorkan)

```bash
cp .env.example .env          # ubah PGPASSWORD di dalam .env
docker compose up --build
```

Kemudian buka: **http://localhost:3000**

- `docker compose up --build` membina imej, menjalankan PostgreSQL,
  menjalankan migration secara automatik, lalu memulakan pelayan.
- Untuk hentikan: `Ctrl+C`, kemudian `docker compose down`.
- Untuk reset pangkalan data sepenuhnya: `docker compose down -v`.

## Cara run (tanpa Docker)

Perlukan Node.js 18+ dan PostgreSQL yang sedang berjalan.

```bash
npm install
cp .env.example .env          # set PGHOST=localhost dan kelayakan DB anda
npm run migrate               # jalankan migration
npm start                     # mulakan pelayan
```

## Endpoint

| Method | Laluan            | Penerangan                                |
|--------|-------------------|-------------------------------------------|
| GET    | `/api/health`     | `{ "ok": true, "service": "webtoon-mutalaah" }` |
| GET    | `/api/health/db`  | Sahkan sambungan PostgreSQL (tambahan)    |

## Ringkasan skema pangkalan data

Setiap jadual ada `id`, `status`, `created_at`, `updated_at`
(`updated_at` dikemas kini automatik melalui trigger). Padam `projects`
akan mencascade ke semua rekod berkaitan.

- **projects** — `title_ar`, `title_ms`, `description`
- **texts** — `project_id` → projects · `original_ar`, `translation_ms`, `notes`
- **characters** — `project_id` → projects · `name_ar`, `name_ms`,
  `character_type`, `role`, `visual_dna` (JSONB)
- **scenes** — `project_id` → projects · `scene_no` (unik per projek),
  `title_ar`, `summary_ms`, `mood`, `location`
- **pages** — `project_id` → projects · `scene_id` → scenes · `page_no`
- **panels** — `project_id`/`scene_id`/`page_id` · `panel_no`, `visual_ms`,
  `dialogue_ar`, `translation_ms`, `caption_ar`, `caption_ms`, `camera`,
  `mood`, `image_prompt`, `image_url`

### Peraturan `character_type`

Hanya tiga nilai dibenarkan (dikuatkuasakan oleh CHECK constraint):

- `ordinary_character`
- `noble_figure_no_face`
- `background_character`

Bagi **`noble_figure_no_face`**, Fasa 1 WAJIB menyuntik peraturan berikut ke
dalam setiap `image_prompt`:

- no face
- no facial features
- face replaced by soft glowing light
- respectful Islamic depiction

Peraturan ini sudah disimpan dalam `src/config/characterTypes.js` supaya boleh
terus digunakan apabila penjanaan prompt dibina.

## Langkah seterusnya (Fasa 1)

- CRUD untuk `projects` dan `texts`
- Modul watak + penguatkuasaan peraturan tokoh mulia pada prompt
- Penjana storyboard / scenes / pages / panels
- Penjanaan prompt gambar, kemudian penjanaan gambar
- Skrin pratonton webtoon
