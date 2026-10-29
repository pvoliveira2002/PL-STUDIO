const onlyDigits = (value = '') => String(value).replace(/\D/g, '');

export function normalizeText(value, maxLength) {
  return String(value || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^A-Za-z0-9 $%*+\-./:]/g, '').trim().toUpperCase().slice(0, maxLength);
}

export function normalizePhone(value) {
  const raw = String(value || '').trim();
  let digits = onlyDigits(raw);
  if (!digits) return raw;
  if (raw.startsWith('+')) return `+${digits}`;
  if (digits.startsWith('00')) return `+${digits.slice(2)}`;
  if (digits.startsWith('55') && digits.length >= 12) {
    let national = digits.slice(2);
    if (national.startsWith('0') && national.length >= 11) national = national.slice(1);
    return `+55${national}`;
  }
  if (digits.startsWith('0') && digits.length >= 11) digits = digits.slice(1);
  if (digits.length === 10 || digits.length === 11) return `+55${digits}`;
  return raw;
}

export function normalizePixKey(type, value) {
  const trimmed = String(value || '').trim();
  if (type === 'cpf') return onlyDigits(trimmed);
  if (type === 'cnpj') return trimmed.replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  if (type === 'phone') return normalizePhone(trimmed);
  if (type === 'email') return trimmed.toLowerCase();
  return trimmed.toLowerCase();
}

function repeated(value) { return /^(\d)\1+$/.test(value); }

export function isValidCpf(value) {
  const cpf = onlyDigits(value);
  if (cpf.length !== 11 || repeated(cpf)) return false;
  for (let digit = 9; digit < 11; digit += 1) {
    let sum = 0;
    for (let index = 0; index < digit; index += 1) sum += Number(cpf[index]) * (digit + 1 - index);
    if ((((sum * 10) % 11) % 10) !== Number(cpf[digit])) return false;
  }
  return true;
}

export function isValidCnpj(value) {
  const cnpj = String(value || '').replace(/[^A-Za-z0-9]/g, '').toUpperCase();
  if (!/^[A-Z0-9]{12}\d{2}$/.test(cnpj) || repeated(cnpj)) return false;
  const calculate = (base) => {
    let weight = base.length - 7;
    const sum = [...base].reduce((total, character) => {
      const result = total + (character.charCodeAt(0) - 48) * weight--;
      if (weight < 2) weight = 9;
      return result;
    }, 0);
    return sum % 11 < 2 ? 0 : 11 - (sum % 11);
  };
  return calculate(cnpj.slice(0, 12)) === Number(cnpj[12]) && calculate(cnpj.slice(0, 13)) === Number(cnpj[13]);
}

export function validatePixKey(type, value) {
  const key = normalizePixKey(type, value);
  if (type === 'cpf') return isValidCpf(key);
  if (type === 'cnpj') return isValidCnpj(key);
  if (type === 'phone') return /^\+[1-9]\d{1,14}$/.test(key);
  if (type === 'email') return /^[a-z0-9.!#$'*+/=?^_`{|}~-]+@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)*$/.test(key) && key.length <= 77;
  if (type === 'random') return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(key);
  return false;
}

export function detectPixKeyType(value) {
  const raw = String(value || '').trim();
  const digits = onlyDigits(raw);
  if (raw.includes('@')) return 'email';
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw)) return 'random';
  if (isValidCpf(raw)) return 'cpf';
  if (digits.length === 14 || (/^[A-Za-z0-9./-]{14,18}$/.test(raw) && /[A-Za-z]/.test(raw))) return 'cnpj';
  if (validatePixKey('phone', raw)) return 'phone';
  return null;
}

export const tlv = (id, value) => `${id}${String(new TextEncoder().encode(value).length).padStart(2, '0')}${value}`;

export function crc16(payload) {
  let crc = 0xffff;
  for (const byte of new TextEncoder().encode(payload)) {
    crc ^= byte << 8;
    for (let bit = 0; bit < 8; bit += 1) crc = (crc & 0x8000) ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, '0');
}

export function generatePixPayload(data) {
  let merchantAccount = tlv('00', 'br.gov.bcb.pix') + tlv('01', normalizePixKey(data.keyType, data.key));
  const description = normalizeText(data.description, 72);
  if (description) merchantAccount += tlv('02', description);
  let payload = tlv('00', '01') + tlv('26', merchantAccount) + tlv('52', '0000') + tlv('53', '986');
  const amount = String(data.amount || '').replace(',', '.');
  if (amount) payload += tlv('54', Number(amount).toFixed(2));
  payload += tlv('58', 'BR') + tlv('59', normalizeText(data.name, 25)) + tlv('60', normalizeText(data.city, 15));
  payload += tlv('62', tlv('05', data.txid ? String(data.txid).toUpperCase() : '***'));
  const withCrcId = `${payload}6304`;
  return withCrcId + crc16(withCrcId);
}

export function validatePixData(data) {
  if (!String(data.name || '').trim()) return 'Informe o nome do recebedor.';
  if (!String(data.city || '').trim()) return 'Informe a cidade do recebedor.';
  if (!data.keyType || !validatePixKey(data.keyType, data.key)) return 'Confira a chave Pix e o tipo selecionado.';
  const amount = String(data.amount || '').replace(',', '.');
  if (amount && (!/^\d+(\.\d{1,2})?$/.test(amount) || Number(amount) <= 0)) return 'Informe um valor válido maior que zero.';
  if (data.txid && !/^[A-Za-z0-9]{1,25}$/.test(data.txid)) return 'O identificador deve ter até 25 letras ou números.';
  return '';
}
