'use strict';

// ---------------------------------------------------------------------------
// Jenis watak yang dibenarkan dalam sistem.
// Nilai ini MESTI selaras dengan CHECK constraint pada jadual `characters`
// dalam db/migrations/001_init.sql.
// ---------------------------------------------------------------------------
const CHARACTER_TYPES = Object.freeze({
  ORDINARY: 'ordinary_character',
  NOBLE_NO_FACE: 'noble_figure_no_face',
  BACKGROUND: 'background_character'
});

const CHARACTER_TYPE_VALUES = Object.freeze(Object.values(CHARACTER_TYPES));

// ---------------------------------------------------------------------------
// Peraturan WAJIB bagi tokoh mulia (noble_figure_no_face).
// Belum digunakan pada Fasa 0 (tiada AI / penjanaan gambar lagi), tetapi
// disimpan di sini supaya Fasa 1 menyuntiknya ke dalam setiap image_prompt
// bagi watak berjenis noble_figure_no_face.
// ---------------------------------------------------------------------------
const NOBLE_FIGURE_RULES = Object.freeze([
  'no face',
  'no facial features',
  'face replaced by soft glowing light',
  'respectful Islamic depiction'
]);

module.exports = {
  CHARACTER_TYPES,
  CHARACTER_TYPE_VALUES,
  NOBLE_FIGURE_RULES
};
