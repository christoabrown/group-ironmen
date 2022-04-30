export function validCharacters(value) {
  return !/[^A-Za-z 0-9-_]/g.test(value);
}

export function validLength(value) {
  return value.length >= 1 && value.length <= 16;
}
