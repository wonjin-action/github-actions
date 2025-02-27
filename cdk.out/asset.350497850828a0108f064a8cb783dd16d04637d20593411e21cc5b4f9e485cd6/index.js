'use strict';
var v = Object.create,
  l = Object.defineProperty,
  b = Object.getOwnPropertyDescriptor,
  y = Object.getOwnPropertyNames,
  O = Object.getPrototypeOf,
  w = Object.prototype.hasOwnProperty,
  R = (e, r) => {
    for (var t in r) l(e, t, { get: r[t], enumerable: !0 });
  },
  I = (e, r, t, o) => {
    if ((r && typeof r == 'object') || typeof r == 'function')
      for (let i of y(r))
        !w.call(e, i) &&
          i !== t &&
          l(e, i, {
            get: () => r[i],
            enumerable: !(o = b(r, i)) || o.enumerable,
          });
    return e;
  },
  p = (e, r, t) => (
    (t = e != null ? v(O(e)) : {}),
    I(
      r || !e || !e.__esModule
        ? l(t, 'default', { value: e, enumerable: !0 })
        : t,
      e
    )
  ),
  A = (e) => I(l({}, '__esModule', { value: !0 }), e),
  k = {};
R(k, { handler: () => U }), (module.exports = A(k));
function D(e, r) {
  let t = new Set(e),
    o = new Set();
  for (let i of new Set(r)) t.has(i) ? t.delete(i) : o.add(i);
  return { adds: Array.from(o), deletes: Array.from(t) };
}
var h = p(require('tls')),
  g = p(require('url')),
  P = p(require('@aws-sdk/client-iam')),
  m;
function u() {
  return m || (m = new P.IAM({})), m;
}
function $(e, ...r) {
  console.log(e, ...r);
}
async function L(e) {
  return new Promise((r, t) => {
    let o = g.parse(e),
      i = o.port ? parseInt(o.port, 10) : 443;
    if (!o.host)
      return t(new Error(`unable to determine host from issuer url ${e}`));
    n.log(`Fetching x509 certificate chain from issuer ${e}`);
    let s = h.connect(i, o.host, {
      rejectUnauthorized: !1,
      servername: o.host,
    });
    s.once('error', t),
      s.once('secureConnect', () => {
        let a = s.getPeerX509Certificate();
        if (!a)
          throw new Error(
            `Unable to retrieve X509 certificate from host ${o.host}`
          );
        for (; a.issuerCertificate; ) E(a), (a = a.issuerCertificate);
        let d = new Date(a.validTo),
          c = S(d);
        if (c < 0)
          return t(
            new Error(
              `The certificate has already expired on: ${d.toUTCString()}`
            )
          );
        c < 180 &&
          console.warn(
            `The root certificate obtained would expire in ${c} days!`
          ),
          s.end();
        let f = C(a);
        n.log(`Certificate Authority thumbprint for ${e} is ${f}`), r(f);
      });
  });
}
function C(e) {
  return e.fingerprint.split(':').join('');
}
function E(e) {
  n.log('-------------BEGIN CERT----------------'),
    n.log(`Thumbprint: ${C(e)}`),
    n.log(`Valid To: ${e.validTo}`),
    e.issuerCertificate &&
      n.log(`Issuer Thumbprint: ${C(e.issuerCertificate)}`),
    n.log(`Issuer: ${e.issuer}`),
    n.log(`Subject: ${e.subject}`),
    n.log('-------------END CERT------------------');
}
function S(e) {
  let t = new Date();
  return Math.round((e.getTime() - t.getTime()) / 864e5);
}
var n = {
  downloadThumbprint: L,
  log: $,
  createOpenIDConnectProvider: (e) => u().createOpenIDConnectProvider(e),
  deleteOpenIDConnectProvider: (e) => u().deleteOpenIDConnectProvider(e),
  updateOpenIDConnectProviderThumbprint: (e) =>
    u().updateOpenIDConnectProviderThumbprint(e),
  addClientIDToOpenIDConnectProvider: (e) =>
    u().addClientIDToOpenIDConnectProvider(e),
  removeClientIDFromOpenIDConnectProvider: (e) =>
    u().removeClientIDFromOpenIDConnectProvider(e),
};
async function U(e) {
  if (e.RequestType === 'Create') return T(e);
  if (e.RequestType === 'Update') return x(e);
  if (e.RequestType === 'Delete') return F(e);
  throw new Error('invalid request type');
}
async function T(e) {
  let r = e.ResourceProperties.Url,
    t = (e.ResourceProperties.ThumbprintList ?? []).sort(),
    o = (e.ResourceProperties.ClientIDList ?? []).sort();
  return (
    t.length === 0 && t.push(await n.downloadThumbprint(r)),
    {
      PhysicalResourceId: (
        await n.createOpenIDConnectProvider({
          Url: r,
          ClientIDList: o,
          ThumbprintList: t,
        })
      ).OpenIDConnectProviderArn,
      Data: { Thumbprints: JSON.stringify(t) },
    }
  );
}
async function x(e) {
  let r = e.ResourceProperties.Url,
    t = (e.ResourceProperties.ThumbprintList ?? []).sort(),
    o = (e.ResourceProperties.ClientIDList ?? []).sort();
  if (e.OldResourceProperties.Url !== r)
    return T({ ...e, RequestType: 'Create' });
  let s = e.PhysicalResourceId;
  t.length === 0 && t.push(await n.downloadThumbprint(r)),
    n.log('updating thumbprint to', t),
    await n.updateOpenIDConnectProviderThumbprint({
      OpenIDConnectProviderArn: s,
      ThumbprintList: t,
    });
  let a = (e.OldResourceProperties.ClientIDList || []).sort(),
    d = D(a, o);
  n.log(`client ID diff: ${JSON.stringify(d)}`);
  for (let c of d.adds)
    n.log(`adding client id "${c}" to provider ${s}`),
      await n.addClientIDToOpenIDConnectProvider({
        OpenIDConnectProviderArn: s,
        ClientID: c,
      });
  for (let c of d.deletes)
    n.log(`removing client id "${c}" from provider ${s}`),
      await n.removeClientIDFromOpenIDConnectProvider({
        OpenIDConnectProviderArn: s,
        ClientID: c,
      });
  return { Data: { Thumbprints: JSON.stringify(t) } };
}
async function F(e) {
  await n.deleteOpenIDConnectProvider({
    OpenIDConnectProviderArn: e.PhysicalResourceId,
  });
}
