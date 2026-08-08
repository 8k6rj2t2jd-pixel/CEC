'use strict';

// Criador de ficheiros ZIP minimalista (sem compressão, método "store"),
// só para gerar a cópia de segurança no browser sem depender de bibliotecas
// externas. Suficiente para fotos (já comprimidas em JPEG) e um JSON.

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    }
    table[n] = c >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function dosDateTime(date) {
  const time = ((date.getHours() & 0x1f) << 11) | ((date.getMinutes() & 0x3f) << 5) | ((date.getSeconds() >> 1) & 0x1f);
  const day = (((date.getFullYear() - 1980) & 0x7f) << 9) | (((date.getMonth() + 1) & 0xf) << 5) | (date.getDate() & 0x1f);
  return { time, day };
}

class ZipWriter {
  constructor() {
    this.files = []; // { nameBytes, data, crc, time, day }
  }

  addFile(name, data) {
    const nameBytes = new TextEncoder().encode(name);
    const { time, day } = dosDateTime(new Date());
    this.files.push({ nameBytes, data, crc: crc32(data), time, day });
  }

  build() {
    const localParts = [];
    const centralParts = [];
    let offset = 0;

    for (const f of this.files) {
      const localHeader = new DataView(new ArrayBuffer(30));
      localHeader.setUint32(0, 0x04034b50, true);
      localHeader.setUint16(4, 20, true);
      localHeader.setUint16(6, 0, true);
      localHeader.setUint16(8, 0, true);
      localHeader.setUint16(10, f.time, true);
      localHeader.setUint16(12, f.day, true);
      localHeader.setUint32(14, f.crc, true);
      localHeader.setUint32(18, f.data.length, true);
      localHeader.setUint32(22, f.data.length, true);
      localHeader.setUint16(26, f.nameBytes.length, true);
      localHeader.setUint16(28, 0, true);

      localParts.push(new Uint8Array(localHeader.buffer), f.nameBytes, f.data);

      const centralHeader = new DataView(new ArrayBuffer(46));
      centralHeader.setUint32(0, 0x02014b50, true);
      centralHeader.setUint16(4, 20, true);
      centralHeader.setUint16(6, 20, true);
      centralHeader.setUint16(8, 0, true);
      centralHeader.setUint16(10, 0, true);
      centralHeader.setUint16(12, f.time, true);
      centralHeader.setUint16(14, f.day, true);
      centralHeader.setUint32(16, f.crc, true);
      centralHeader.setUint32(20, f.data.length, true);
      centralHeader.setUint32(24, f.data.length, true);
      centralHeader.setUint16(28, f.nameBytes.length, true);
      centralHeader.setUint16(30, 0, true);
      centralHeader.setUint16(32, 0, true);
      centralHeader.setUint16(34, 0, true);
      centralHeader.setUint16(36, 0, true);
      centralHeader.setUint32(38, 0, true);
      centralHeader.setUint32(42, offset, true);

      centralParts.push(new Uint8Array(centralHeader.buffer), f.nameBytes);

      offset += 30 + f.nameBytes.length + f.data.length;
    }

    const centralSize = centralParts.reduce((sum, p) => sum + p.length, 0);
    const endRecord = new DataView(new ArrayBuffer(22));
    endRecord.setUint32(0, 0x06054b50, true);
    endRecord.setUint16(4, 0, true);
    endRecord.setUint16(6, 0, true);
    endRecord.setUint16(8, this.files.length, true);
    endRecord.setUint16(10, this.files.length, true);
    endRecord.setUint32(12, centralSize, true);
    endRecord.setUint32(16, offset, true);
    endRecord.setUint16(20, 0, true);

    return new Blob([...localParts, ...centralParts, new Uint8Array(endRecord.buffer)], { type: 'application/zip' });
  }
}

window.ZipWriter = ZipWriter;
