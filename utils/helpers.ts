export const triggerHaptic = (style: 'light' | 'medium' | 'heavy' = 'light') => {
  if (typeof window !== 'undefined' && 'navigator' in window && 'vibrate' in navigator) {
    const patterns = { light: 10, medium: [20, 50, 20], heavy: [50, 100, 50] };
    navigator.vibrate(patterns[style]);
  }
};

export const generatePixBRCode = (key: string, name: string = 'VILLA DI TRENTO', city: string = 'BRASILIA') => {
  const accountInfo = `0014br.gov.bcb.pix01${key.length.toString().padStart(2, '0')}${key}`;
  const payload = [
    '000201',
    `26${accountInfo.length.toString().padStart(2, '0')}${accountInfo}`,
    '52040000',
    '5303986',
    '5802BR',
    `59${name.length.toString().padStart(2, '0')}${name}`,
    `60${city.length.toString().padStart(2, '0')}${city}`,
    '62070503***',
    '6304'
  ].join('');

  let crc = 0xFFFF;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      if ((crc & 0x8000) !== 0) crc = (crc << 1) ^ 0x1021;
      else crc <<= 1;
    }
  }
  const crcFinal = (crc & 0xFFFF).toString(16).toUpperCase().padStart(4, '0');
  return payload + crcFinal;
};

export const formatCurrency = (value: number | undefined | null) => {
  return (value || 0).toFixed(2).replace('.', ',');
};

export const compressImage = (file: File): Promise<string> =>
  new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      const MAX = 600;
      let w = img.width, h = img.height;
      if (w > h ? w > MAX : h > MAX)
        w > h ? (h = Math.round(h * MAX / w), w = MAX) : (w = Math.round(w * MAX / h), h = MAX);
      const c = document.createElement('canvas');
      c.width = w; c.height = h;
      const ctx = c.getContext('2d');
      if (ctx) ctx.drawImage(img, 0, 0, w, h);
      resolve(c.toDataURL('image/jpeg', 0.60));
      URL.revokeObjectURL(img.src);
    };
    img.onerror = () => reject(new Error('Erro ao ler a imagem.'));
    img.src = URL.createObjectURL(file);
  });
