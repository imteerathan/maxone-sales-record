(function (window) {
  'use strict';
  var databasePromise;
  function open() {
    if (databasePromise) return databasePromise;
    databasePromise = new Promise(function (resolve, reject) {
      var request = indexedDB.open('maxone-sales-record', 3);
      request.onupgradeneeded = function (event) {
        var db = event.target.result;
        ['shops', 'records', 'audit', 'syncQueue', 'reportTeams'].forEach(function (name) {
          if (!db.objectStoreNames.contains(name)) db.createObjectStore(name, { keyPath: 'id' });
        });
      };
      request.onsuccess = function () { resolve(request.result); };
      request.onerror = function () { reject(request.error); };
    });
    return databasePromise;
  }
  function all(name) {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var transaction = db.transaction(name, 'readonly');
        var request = transaction.objectStore(name).openCursor();
        var rows = [];
        request.onsuccess = function () {
          var cursor = request.result;
          if (cursor) { rows.push(cursor.value); cursor.continue(); }
          else resolve(rows);
        };
        request.onerror = function () { reject(request.error); };
      });
    });
  }
  function write(name, rows) {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var transaction = db.transaction(name, 'readwrite');
        var store = transaction.objectStore(name);
        (Array.isArray(rows) ? rows : [rows]).forEach(function (row) { store.put(row); });
        transaction.oncomplete = function () { resolve(); };
        transaction.onerror = function () { reject(transaction.error); };
        transaction.onabort = function () { reject(transaction.error || new Error('IndexedDB transaction aborted')); };
      });
    });
  }
  function del(name, id) {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var transaction = db.transaction(name, 'readwrite');
        transaction.objectStore(name).delete(id);
        transaction.oncomplete = function () { resolve(); };
        transaction.onerror = function () { reject(transaction.error); };
      });
    });
  }
  function clearAll() {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var names = ['shops', 'records', 'audit', 'syncQueue'];
        var transaction = db.transaction(names, 'readwrite');
        names.forEach(function (name) { transaction.objectStore(name).clear(); });
        transaction.oncomplete = function () { resolve(); };
        transaction.onerror = function () { reject(transaction.error); };
        transaction.onabort = function () { reject(transaction.error || new Error('ล้างข้อมูลในเครื่องไม่สำเร็จ')); };
      });
    });
  }
  function applyRecordChange(rows, deleteId, audit, queue) {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var transaction = db.transaction(['records', 'audit', 'syncQueue'], 'readwrite');
        var records = transaction.objectStore('records');
        (rows || []).forEach(function (row) { records.put(row); });
        if (deleteId) records.delete(deleteId);
        if (audit) transaction.objectStore('audit').put(audit);
        if (queue) transaction.objectStore('syncQueue').put(queue);
        transaction.oncomplete = function () { resolve(); };
        transaction.onerror = function () { reject(transaction.error); };
        transaction.onabort = function () { reject(transaction.error || new Error('บันทึกข้อมูลไม่สำเร็จ')); };
      });
    });
  }
  window.MDB = { open: open, all: all, write: write, del: del, clearAll: clearAll, applyRecordChange: applyRecordChange };
}(window));
