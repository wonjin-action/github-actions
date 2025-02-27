'use strict';
var a = Object.defineProperty,
  d = Object.getOwnPropertyDescriptor,
  f = Object.getOwnPropertyNames,
  S = Object.prototype.hasOwnProperty,
  E = (s, t) => {
    for (var e in t) a(s, e, { get: t[e], enumerable: !0 });
  },
  R = (s, t, e, r) => {
    if ((t && typeof t == 'object') || typeof t == 'function')
      for (let o of f(t))
        !S.call(s, o) &&
          o !== e &&
          a(s, o, {
            get: () => t[o],
            enumerable: !(r = d(t, o)) || r.enumerable,
          });
    return s;
  },
  h = (s) => R(a({}, '__esModule', { value: !0 }), s),
  O = {};
E(O, { handler: () => P }), (module.exports = h(O));
var m = require('@aws-sdk/client-ssm');
async function P(s) {
  let t = s.ResourceProperties.WriterProps,
    e = t.exports,
    r = new m.SSM({ region: t.region });
  try {
    switch (s.RequestType) {
      case 'Create':
        console.info(
          `Creating new SSM Parameter exports in region ${t.region}`
        ),
          await i(r, e),
          await u(r, e);
        return;
      case 'Update':
        let n = s.OldResourceProperties.WriterProps.exports,
          c = l(e, n),
          p = C(n, e);
        if (p.length > 0)
          throw new Error(
            `Some exports have changed!
` +
              p.join(`
`)
          );
        let g = l(n, e);
        await i(r, g);
        let w = Object.keys(g);
        await x(r, w),
          await i(r, c),
          console.info(
            `Creating new SSM Parameter exports in region ${t.region}`
          ),
          await u(r, c);
        return;
      case 'Delete':
        await i(r, e), await x(r, Object.keys(e));
        return;
      default:
        return;
    }
  } catch (o) {
    throw (console.error('Error processing event: ', o), o);
  }
}
async function u(s, t) {
  await Promise.all(
    Array.from(Object.entries(t), ([e, r]) =>
      s.putParameter({ Name: e, Value: r, Type: 'String' })
    )
  );
}
async function x(s, t) {
  t.sort();
  for (let r = 0; r < t.length; r += 10) {
    let o = t.slice(r, r + 10);
    o.length > 0 && (await s.deleteParameters({ Names: o }));
  }
}
async function i(s, t) {
  let e = new Map();
  if (
    (await Promise.all(
      Object.keys(t).map(async (r) => {
        let o = await y(s, r);
        o.size > 0 && e.set(r, o);
      })
    ),
    e.size > 0)
  ) {
    let r = Object.entries(e).map(
      (o) => `${o[0]} is in use by stack(s) ${o[1].join(' ')}`
    ).join(`
`);
    throw new Error(`Exports cannot be updated: 
${r}`);
  }
}
async function y(s, t) {
  let e = new Set();
  try {
    (
      await s.listTagsForResource({ ResourceId: t, ResourceType: 'Parameter' })
    ).TagList?.forEach((o) => {
      let n = o.Key?.split(':') ?? [];
      n[0] === 'aws-cdk' && n[1] === 'strong-ref' && e.add(n[2]);
    });
  } catch (r) {
    if (r.name === 'InvalidResourceId') return new Set();
    throw r;
  }
  return e;
}
function l(s, t) {
  return Object.keys(s)
    .filter((e) => !t.hasOwnProperty(e))
    .reduce((e, r) => ((e[r] = s[r]), e), {});
}
function C(s, t) {
  return Object.keys(s)
    .filter((e) => t.hasOwnProperty(e) && s[e] !== t[e])
    .reduce((e, r) => (e.push(r), e), []);
}
