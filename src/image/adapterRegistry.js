'use strict';

// ===========================================================================
// src/image/adapterRegistry.js — Fasa 12: daftar adapter penjana imej (generik)
//
// Sama corak seperti AI adapterRegistry. Production Engine TIDAK tahu image
// engine apa — ia hanya berurusan dengan adapter melalui registry ini.
// ===========================================================================

const adapters = {};
let defaultName = null;

function register(name, adapter) {
  if (!name || !adapter) throw new Error('register memerlukan name & adapter');
  adapters[name] = adapter;
  if (!defaultName) defaultName = name;
  return adapter;
}

function get(name) {
  return adapters[name || defaultName] || null;
}

function has(name) {
  return Object.prototype.hasOwnProperty.call(adapters, name);
}

function list() {
  return Object.keys(adapters).map(function (n) {
    const a = adapters[n];
    return { name: n, is_default: n === defaultName, info: (a && a.info) || { name: n } };
  });
}

function setDefault(name) {
  if (!has(name)) return false;
  defaultName = name;
  return true;
}

function getDefault() {
  return defaultName;
}

function getDefaultAdapter() {
  return defaultName ? adapters[defaultName] : null;
}

module.exports = { register, get, has, list, setDefault, getDefault, getDefaultAdapter };
