'use strict';
var i = Object.defineProperty,
  d = Object.getOwnPropertyDescriptor,
  y = Object.getOwnPropertyNames,
  P = Object.prototype.hasOwnProperty,
  w = (e, r) => {
    for (var s in r) i(e, s, { get: r[s], enumerable: !0 });
  },
  E = (e, r, s, t) => {
    if ((r && typeof r == 'object') || typeof r == 'function')
      for (let o of y(r))
        !P.call(e, o) &&
          o !== s &&
          i(e, o, {
            get: () => r[o],
            enumerable: !(t = d(r, o)) || t.enumerable,
          });
    return e;
  },
  f = (e) => E(i({}, '__esModule', { value: !0 }), e),
  S = {};
w(S, { handler: () => x }), (module.exports = f(S));
var u = require('@aws-sdk/client-ssm');
async function x(e) {
  let r = e.ResourceProperties.ReaderProps,
    s = r.imports,
    t = Object.keys(s),
    o = `aws-cdk:strong-ref:${r.prefix}`,
    a = new u.SSM({ region: r.region });
  try {
    switch (e.RequestType) {
      case 'Create':
        console.info('Tagging SSM Parameter imports'), await g(a, t, o);
        break;
      case 'Update':
        let c = e.OldResourceProperties.ReaderProps.imports,
          R = l(t, Object.keys(c)),
          p = l(Object.keys(c), t);
        console.info('Releasing unused SSM Parameter imports'),
          Object.keys(p).length > 0 && (await m(a, p, o)),
          console.info('Tagging new SSM Parameter imports'),
          await g(a, R, o);
        break;
      case 'Delete':
        console.info('Releasing all SSM Parameter exports by removing tags'),
          await m(a, t, o);
        return;
    }
  } catch (n) {
    throw (console.error('Error importing cross region stack exports: ', n), n);
  }
  return { Data: s };
}
async function g(e, r, s) {
  await Promise.all(
    r.map(async (t) => {
      try {
        return await e.addTagsToResource({
          ResourceId: t,
          ResourceType: 'Parameter',
          Tags: [{ Key: s, Value: 'true' }],
        });
      } catch (o) {
        throw new Error(`Error importing ${t}: ${o}`);
      }
    })
  );
}
async function m(e, r, s) {
  await Promise.all(
    r.map(async (t) => {
      try {
        return await e.removeTagsFromResource({
          TagKeys: [s],
          ResourceType: 'Parameter',
          ResourceId: t,
        });
      } catch (o) {
        if (o.name === 'InvalidResourceId') return;
        throw new Error(`Error releasing import ${t}: ${o}`);
      }
    })
  );
}
function l(e, r) {
  return e.filter((s) => !r.includes(s));
}
