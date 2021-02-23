/**
 *
 */
function depsEqual(a?: any[], b?: any[]): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const l = a.length;
  if (l !== b.length) return false;
  for (let i = 0; i < l; i++) {
    if (!Object.is(a[i], b[i])) return false;
  }
  return true;
}
