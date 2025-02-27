'use strict';
var C = Object.create,
  i = Object.defineProperty,
  I = Object.getOwnPropertyDescriptor,
  w = Object.getOwnPropertyNames,
  P = Object.getPrototypeOf,
  A = Object.prototype.hasOwnProperty,
  L = (e, t) => {
    for (var o in t) i(e, o, { get: t[o], enumerable: !0 });
  },
  d = (e, t, o, r) => {
    if ((t && typeof t == 'object') || typeof t == 'function')
      for (let s of w(t))
        !A.call(e, s) &&
          s !== o &&
          i(e, s, {
            get: () => t[s],
            enumerable: !(r = I(t, s)) || r.enumerable,
          });
    return e;
  },
  l = (e, t, o) => (
    (o = e != null ? C(P(e)) : {}),
    d(
      t || !e || !e.__esModule
        ? i(o, 'default', { value: e, enumerable: !0 })
        : o,
      e
    )
  ),
  k = (e) => d(i({}, '__esModule', { value: !0 }), e),
  U = {};
L(U, { autoDeleteHandler: () => S, handler: () => _ }), (module.exports = k(U));
var h = require('@aws-sdk/client-s3'),
  y = l(require('https')),
  m = l(require('url')),
  a = {
    sendHttpRequest: T,
    log: b,
    includeStackTraces: !0,
    userHandlerIndex: './index',
  },
  p = 'AWSCDK::CustomResourceProviderFramework::CREATE_FAILED',
  B = 'AWSCDK::CustomResourceProviderFramework::MISSING_PHYSICAL_ID';
function R(e) {
  return async (t, o) => {
    let r = { ...t, ResponseURL: '...' };
    if (
      (a.log(JSON.stringify(r, void 0, 2)),
      t.RequestType === 'Delete' && t.PhysicalResourceId === p)
    ) {
      a.log('ignoring DELETE event caused by a failed CREATE event'),
        await u('SUCCESS', t);
      return;
    }
    try {
      let s = await e(r, o),
        n = D(t, s);
      await u('SUCCESS', n);
    } catch (s) {
      let n = { ...t, Reason: a.includeStackTraces ? s.stack : s.message };
      n.PhysicalResourceId ||
        (t.RequestType === 'Create'
          ? (a.log(
              'CREATE failed, responding with a marker physical resource id so that the subsequent DELETE will be ignored'
            ),
            (n.PhysicalResourceId = p))
          : a.log(
              `ERROR: Malformed event. "PhysicalResourceId" is required: ${JSON.stringify(
                t
              )}`
            )),
        await u('FAILED', n);
    }
  };
}
function D(e, t = {}) {
  let o = t.PhysicalResourceId ?? e.PhysicalResourceId ?? e.RequestId;
  if (e.RequestType === 'Delete' && o !== e.PhysicalResourceId)
    throw new Error(
      `DELETE: cannot change the physical resource ID from "${e.PhysicalResourceId}" to "${t.PhysicalResourceId}" during deletion`
    );
  return { ...e, ...t, PhysicalResourceId: o };
}
async function u(e, t) {
  let o = {
    Status: e,
    Reason: t.Reason ?? e,
    StackId: t.StackId,
    RequestId: t.RequestId,
    PhysicalResourceId: t.PhysicalResourceId || B,
    LogicalResourceId: t.LogicalResourceId,
    NoEcho: t.NoEcho,
    Data: t.Data,
  };
  a.log('submit response to cloudformation', o);
  let r = JSON.stringify(o),
    s = m.parse(t.ResponseURL),
    n = {
      hostname: s.hostname,
      path: s.path,
      method: 'PUT',
      headers: {
        'content-type': '',
        'content-length': Buffer.byteLength(r, 'utf8'),
      },
    };
  await O({ attempts: 5, sleep: 1e3 }, a.sendHttpRequest)(n, r);
}
async function T(e, t) {
  return new Promise((o, r) => {
    try {
      let s = y.request(e, (n) => o());
      s.on('error', r), s.write(t), s.end();
    } catch (s) {
      r(s);
    }
  });
}
function b(e, ...t) {
  console.log(e, ...t);
}
function O(e, t) {
  return async (...o) => {
    let r = e.attempts,
      s = e.sleep;
    for (;;)
      try {
        return await t(...o);
      } catch (n) {
        if (r-- <= 0) throw n;
        await x(Math.floor(Math.random() * s)), (s *= 2);
      }
  };
}
async function x(e) {
  return new Promise((t) => setTimeout(t, e));
}
var g = 'aws-cdk:auto-delete-objects',
  H = JSON.stringify({ Version: '2012-10-17', Statement: [] }),
  c = new h.S3({}),
  _ = R(S);
async function S(e) {
  switch (e.RequestType) {
    case 'Create':
      return;
    case 'Update':
      return F(e);
    case 'Delete':
      return f(e.ResourceProperties?.BucketName);
  }
}
async function F(e) {
  let t = e,
    o = t.OldResourceProperties?.BucketName,
    r = t.ResourceProperties?.BucketName;
  if (r != null && o != null && r !== o) return f(o);
}
async function N(e) {
  try {
    let t = (await c.getBucketPolicy({ Bucket: e }))?.Policy ?? H,
      o = JSON.parse(t);
    o.Statement.push({
      Principal: '*',
      Effect: 'Deny',
      Action: ['s3:PutObject'],
      Resource: [`arn:aws:s3:::${e}/*`],
    }),
      await c.putBucketPolicy({ Bucket: e, Policy: JSON.stringify(o) });
  } catch (t) {
    if (t.name === 'NoSuchBucket') throw t;
    console.log(
      `Could not set new object deny policy on bucket '${e}' prior to deletion.`
    );
  }
}
async function E(e) {
  let t = await c.listObjectVersions({ Bucket: e }),
    o = [...(t.Versions ?? []), ...(t.DeleteMarkers ?? [])];
  if (o.length === 0) return;
  let r = o.map((s) => ({ Key: s.Key, VersionId: s.VersionId }));
  await c.deleteObjects({ Bucket: e, Delete: { Objects: r } }),
    t?.IsTruncated && (await E(e));
}
async function f(e) {
  if (!e) throw new Error('No BucketName was provided.');
  try {
    if (!(await W(e))) {
      console.log(`Bucket does not have '${g}' tag, skipping cleaning.`);
      return;
    }
    await N(e), await E(e);
  } catch (t) {
    if (t.name === 'NoSuchBucket') {
      console.log(`Bucket '${e}' does not exist.`);
      return;
    }
    throw t;
  }
}
async function W(e) {
  return (await c.getBucketTagging({ Bucket: e })).TagSet?.some(
    (o) => o.Key === g && o.Value === 'true'
  );
}
